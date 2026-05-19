package com.belweave.trifecta.features.thread

import android.content.Context
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.belweave.trifecta.R
import com.belweave.trifecta.core.models.ModelCatalogEntry
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProviderInstanceID
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography
import java.text.Normalizer

// --- Favorites persistence (mirrors iOS ModelPickerFavoriteStore / UserDefaults) ---

private object ModelPickerFavoriteStore {
    private const val PREF_NAME = "modelPickerFavorites"
    private const val KEY = "favoriteIds"

    fun load(context: Context): Set<String> =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getStringSet(KEY, emptySet()) ?: emptySet()

    fun save(context: Context, ids: Set<String>) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit().putStringSet(KEY, ids).apply()
    }
}

// --- Rail selection -------------------------------------------------------

private sealed class RailSelection {
    object Favorites : RailSelection()
    data class Provider(val instanceId: ProviderInstanceID) : RailSelection()
}

private val RAIL_WIDTH = 54.dp

// --- Sheet ----------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(
    providers: List<ServerProvider>,
    currentSelection: ModelSelection?,
    accent: Color,
    onDismiss: () -> Unit,
    onSelect: (ServerProvider, String) -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val usableProviders = remember(providers) {
        providers.filter { it.isUsable }
            .sortedWith(Comparator { a, b ->
                val brandCmp = String.CASE_INSENSITIVE_ORDER.compare(a.brandDisplayName, b.brandDisplayName)
                if (brandCmp != 0) brandCmp
                else String.CASE_INSENSITIVE_ORDER.compare(a.label, b.label)
            })
    }

    val catalogEntries = remember(usableProviders) {
        usableProviders.flatMap { p ->
            p.models.filter { it.eligible != false }
                .map { m -> ModelCatalogEntry("${p.instanceId.rawValue}|${m.slug}", p, m) }
        }
    }

    var searchQuery by remember { mutableStateOf("") }
    var favoriteIds by remember { mutableStateOf(ModelPickerFavoriteStore.load(context)) }

    // Initialize rail: favorites if any exist, otherwise jump to the currently-selected provider
    var railSelection by remember {
        val initial: RailSelection = if (favoriteIds.isNotEmpty()) {
            RailSelection.Favorites
        } else {
            val fallback = currentSelection?.let { cur ->
                usableProviders.find { it.instanceId == cur.instanceId }?.instanceId
            } ?: usableProviders.firstOrNull()?.instanceId
            if (fallback != null) RailSelection.Provider(fallback) else RailSelection.Favorites
        }
        mutableStateOf(initial)
    }

    val instanceOrder = remember(usableProviders) {
        usableProviders.mapIndexed { index, provider -> provider.instanceId to index }.toMap()
    }

    val isSearching = ModelPickerSearch.normalizedTokens(searchQuery).isNotEmpty()

    val filteredEntries = remember(catalogEntries, searchQuery, railSelection, favoriteIds) {
        val base: List<ModelCatalogEntry> = when {
            isSearching -> catalogEntries
            railSelection is RailSelection.Favorites ->
                catalogEntries.filter { favoriteIds.contains(it.id) }
            railSelection is RailSelection.Provider -> {
                val id = (railSelection as RailSelection.Provider).instanceId
                catalogEntries.filter { it.provider.instanceId == id }
            }
            else -> catalogEntries
        }

        if (isSearching) {
            base.mapNotNull { entry ->
                ModelPickerSearch.rank(entry, searchQuery, favoriteIds.contains(entry.id))
                    ?.let { rank -> Triple(entry, rank.score, rank.tieBreaker) }
            }
                .sortedWith(compareBy<Triple<ModelCatalogEntry, Int, String>> { it.second }.thenBy { it.third })
                .map { it.first }
        } else {
            base.sortedWith { a, b ->
                val fa = favoriteIds.contains(a.id)
                val fb = favoriteIds.contains(b.id)
                if (railSelection !is RailSelection.Favorites && fa != fb) {
                    return@sortedWith if (fa) -1 else 1
                }
                val ia = instanceOrder[a.provider.instanceId] ?: Int.MAX_VALUE
                val ib = instanceOrder[b.provider.instanceId] ?: Int.MAX_VALUE
                if (ia != ib) return@sortedWith ia.compareTo(ib)
                val nameCmp = String.CASE_INSENSITIVE_ORDER.compare(a.model.label, b.model.label)
                if (nameCmp != 0) nameCmp
                else String.CASE_INSENSITIVE_ORDER.compare(a.provider.label, b.provider.label)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = T3Color.surfaceGrouped,
        contentWindowInsets = { WindowInsets(0.dp) },
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                if (!isSearching) {
                    Box(
                        modifier = Modifier
                            .padding(start = RAIL_WIDTH)
                            .width(0.5.dp)
                            .fillMaxHeight()
                            .background(T3Color.separator.copy(alpha = 0.55f))
                    )
                }
                Box(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 16.dp)
                        .width(36.dp)
                        .height(5.dp)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(T3Color.textTertiary.copy(alpha = 0.55f))
                )
            }
        }
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            // Left provider rail (hidden while searching)
            if (!isSearching) {
                ProviderRail(
                    providers = usableProviders,
                    railSelection = railSelection,
                    accent = accent,
                    onSelectFavorites = { railSelection = RailSelection.Favorites },
                    onSelectProvider = { id -> railSelection = RailSelection.Provider(id) }
                )
                // Vertical divider
                Box(
                    modifier = Modifier
                        .width(0.5.dp)
                        .fillMaxHeight()
                        .background(T3Color.separator.copy(alpha = 0.55f))
                )
            }

            // Right: Done button + search + model list
            Column(modifier = Modifier.weight(1f)) {
                // Done button aligned to trailing edge
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = T3Spacing.md)
                        .padding(top = T3Spacing.md, bottom = T3Spacing.xs),
                    contentAlignment = Alignment.CenterEnd
                ) {
                    Text(
                        text = "Done",
                        style = T3Typography.body.copy(fontWeight = FontWeight.Medium),
                        color = accent,
                        modifier = Modifier
                            .clickable { onDismiss() }
                            .padding(T3Spacing.xs)
                    )
                }

                // Search bar
                ModelPickerSearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    accent = accent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = T3Spacing.md)
                        .padding(bottom = T3Spacing.sm)
                )

                // Model list or empty state
                if (filteredEntries.isEmpty()) {
                    ModelPickerEmptyState(
                        isSearching = isSearching,
                        railSelection = railSelection,
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentPadding = PaddingValues(
                            start = T3Spacing.sm,
                            end = T3Spacing.sm,
                            bottom = T3Spacing.xl
                        )
                    ) {
                        itemsIndexed(items = filteredEntries, key = { _, entry -> entry.id }) { index, entry ->
                            val isSelected = currentSelection != null
                                && currentSelection.instanceId == entry.provider.instanceId
                                && currentSelection.model == entry.model.slug
                            val isFavorite = favoriteIds.contains(entry.id)

                            ModelPickerRow(
                                entry = entry,
                                visibleIndex = index,
                                isSelected = isSelected,
                                isFavorite = isFavorite,
                                accent = accent,
                                onFavoriteToggle = {
                                    val next = if (isFavorite) favoriteIds - entry.id
                                               else favoriteIds + entry.id
                                    favoriteIds = next
                                    ModelPickerFavoriteStore.save(context, next)
                                },
                                onSelect = {
                                    onSelect(entry.provider, entry.model.slug)
                                    onDismiss()
                                }
                            )

                            if (entry != filteredEntries.last()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(start = 52.dp)
                                        .height(0.5.dp)
                                        .background(T3Color.separator.copy(alpha = 0.35f))
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- Provider rail --------------------------------------------------------

@Composable
private fun ProviderRail(
    providers: List<ServerProvider>,
    railSelection: RailSelection,
    accent: Color,
    onSelectFavorites: () -> Unit,
    onSelectProvider: (ProviderInstanceID) -> Unit
) {
    Column(
        modifier = Modifier
            .width(RAIL_WIDTH)
            .fillMaxHeight()
            .background(T3Color.surfaceMuted.copy(alpha = 0.55f))
            .verticalScroll(rememberScrollState())
            .padding(top = T3Spacing.xl, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Favorites
        RailItem(
            isSelected = railSelection is RailSelection.Favorites,
            accent = accent,
            onClick = onSelectFavorites
        ) {
            Icon(
                Icons.Filled.Star,
                contentDescription = "Favorites",
                tint = if (railSelection is RailSelection.Favorites) Color(0xFFFACC15)
                       else T3Color.textTertiary.copy(alpha = 0.42f),
                modifier = Modifier.size(20.dp)
            )
        }

        // Separator
        Box(
            modifier = Modifier
                .padding(horizontal = 6.dp)
                .height(1.dp)
                .fillMaxWidth()
                .background(T3Color.separator.copy(alpha = 0.45f))
        )

        // Provider entries
        providers.forEach { provider ->
            val isSelected = railSelection is RailSelection.Provider &&
                (railSelection as RailSelection.Provider).instanceId == provider.instanceId
            RailItem(
                isSelected = isSelected,
                accent = accent,
                onClick = { onSelectProvider(provider.instanceId) }
            ) {
                RailProviderIcon(
                    driver = provider.driver,
                    alpha = if (isSelected) 1f else 0.48f
                )
            }
        }

        ComingSoonCopilotRail()
    }
}

// Each rail item: clipped button background + right-edge selection capsule
@Composable
private fun RailItem(
    isSelected: Boolean,
    accent: Color,
    onClick: () -> Unit,
    content: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .width(42.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(if (isSelected) T3Color.surfaceElevated else Color.Transparent)
                .padding(vertical = 9.dp),
            contentAlignment = Alignment.Center
        ) {
            content()
        }
        // Accent capsule at right edge (mirrors iOS .overlay(alignment: .trailing))
        if (isSelected) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = 2.dp)
                    .width(3.dp)
                    .height(22.dp)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(accent)
            )
        }
    }
}

@Composable
private fun ComingSoonCopilotRail() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .padding(horizontal = 6.dp)
                .clip(RoundedCornerShape(11.dp))
                .border(0.5.dp, T3Color.separator.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                .padding(vertical = 8.dp)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            RailProviderIcon(
                driver = "githubCopilot",
                alpha = 0.42f
            )
        }
        Icon(
            Icons.Filled.AccessTime,
            contentDescription = null,
            tint = T3Color.textTertiary.copy(alpha = 0.55f),
            modifier = Modifier.size(9.dp)
        )
    }
}

@Composable
private fun RailProviderIcon(driver: String, alpha: Float) {
    Box(
        modifier = Modifier.size(24.dp),
        contentAlignment = Alignment.Center
    ) {
        ProviderIcon(
            driver = driver,
            size = providerRailGlyphSize(driver),
            alpha = alpha,
            modifier = Modifier.offset(
                x = providerRailVisualOffsetX(driver),
                y = providerRailVisualOffsetY(driver)
            )
        )
    }
}

@Composable
private fun ProviderIcon(
    driver: String,
    size: Dp = 14.dp,
    alpha: Float = 1f,
    modifier: Modifier = Modifier
) {
    val dark = isSystemInDarkTheme()
    val kind = ProviderIconKind.from(driver)
    val imageRes = kind.imageRes()
    if (imageRes != null) {
        Image(
            painter = painterResource(imageRes),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .size(size)
                .alpha(alpha)
                .clip(RoundedCornerShape(2.dp))
                .then(modifier)
        )
        return
    }

    Canvas(modifier = Modifier.size(size).then(modifier)) {
        when (kind) {
            ProviderIconKind.Claude -> drawScaledPath(
                path = ProviderIconArt.claudePath(),
                viewBox = Size(256f, 257f),
                color = Color(0xFFD97757).copy(alpha = alpha)
            )
            ProviderIconKind.OpenAI -> drawScaledPath(
                path = ProviderIconArt.openAiPath(),
                viewBox = Size(256f, 260f),
                color = (if (dark) Color.White else Color.Black).copy(alpha = alpha)
            )
            ProviderIconKind.Cursor -> drawScaledPath(
                path = ProviderIconArt.cursorPath(),
                viewBox = Size(466.73f, 532.09f),
                color = (if (dark) Color(0xFFEDECEC) else Color(0xFF26251E)).copy(alpha = alpha)
            )
            ProviderIconKind.OpenCode -> drawOpenCodeMark(dark = dark, alpha = alpha)
            ProviderIconKind.Gemini -> drawGeminiMark(alpha = alpha)
            ProviderIconKind.Copilot -> drawScaledPath(
                path = ProviderIconArt.copilotPath(),
                viewBox = Size(256f, 208f),
                color = (if (dark) Color.White else Color.Black).copy(alpha = alpha)
            )
            ProviderIconKind.Other -> drawProviderFallback(alpha = alpha)
            else -> Unit
        }
    }
}

private enum class ProviderIconKind {
    Claude, OpenAI, OpenCode, Cursor, Gemini, Copilot, Hermes, Devin, Other;

    @DrawableRes
    fun imageRes(): Int? = when (this) {
        Hermes -> R.drawable.hermes_logo
        Devin -> R.drawable.devin_logo_square
        else -> null
    }

    companion object {
        fun from(driver: String): ProviderIconKind = when (driver) {
            "claudeAgent", "claude", "anthropic", "anthropicChat" -> Claude
            "codex", "openai", "openaiChat", "openAIChat", "openaiResponses" -> OpenAI
            "opencode" -> OpenCode
            "cursor" -> Cursor
            "gemini", "googleGemini", "google" -> Gemini
            "copilot", "githubCopilot", "githubcopilot", "github_copilot" -> Copilot
            "hermesAgent", "hermes" -> Hermes
            "devinAgent", "devin" -> Devin
            else -> Other
        }
    }
}

private fun DrawScope.drawScaledPath(
    path: Path,
    viewBox: Size,
    color: Color
) {
    drawScaledPath(path, viewBox) { drawPath(path, color) }
}

private fun DrawScope.drawScaledPath(
    path: Path,
    viewBox: Size,
    draw: DrawScope.() -> Unit
) {
    val scale = minOf(size.width / viewBox.width, size.height / viewBox.height)
    val dx = (size.width - viewBox.width * scale) / 2f
    val dy = (size.height - viewBox.height * scale) / 2f
    withTransform({
        translate(dx, dy)
        scale(scale, scale)
    }) {
        draw()
    }
}

private fun providerRailGlyphSize(driver: String): Dp = when (ProviderIconKind.from(driver)) {
    ProviderIconKind.Claude -> 22.dp
    ProviderIconKind.OpenCode -> 22.dp
    ProviderIconKind.Copilot -> 20.dp
    else -> 22.dp
}

private fun providerRailVisualOffsetX(driver: String): Dp = when (ProviderIconKind.from(driver)) {
    ProviderIconKind.Claude,
    ProviderIconKind.OpenAI,
    ProviderIconKind.Cursor -> (-6).dp
    ProviderIconKind.Gemini -> (-5).dp
    ProviderIconKind.OpenCode -> 6.dp
    ProviderIconKind.Copilot -> (-5).dp
    ProviderIconKind.Hermes,
    ProviderIconKind.Devin -> 0.dp
    else -> 0.dp
}

private fun providerRailVisualOffsetY(driver: String): Dp = when (ProviderIconKind.from(driver)) {
    ProviderIconKind.Copilot -> (-6).dp
    else -> 0.dp
}

private fun DrawScope.drawGeminiMark(alpha: Float) {
    val shape = ProviderIconArt.geminiPath()
    drawScaledPath(shape, Size(296f, 298f)) {
        clipPath(shape) {
            drawOval(
                color = Color(0xFF3689FF).copy(alpha = alpha),
                topLeft = Offset(-69f, -46f),
                size = Size(464f, 390f)
            )
            drawOval(
                color = Color(0xFFF6C013).copy(alpha = alpha),
                topLeft = Offset(-113f, 12f),
                size = Size(265f, 273f)
            )
            drawPath(
                ProviderIconArt.geminiRedPath(),
                color = Color(0xFFFA4340).copy(alpha = alpha)
            )
            drawPath(
                ProviderIconArt.geminiGreenPath(),
                color = Color(0xFF14BB69).copy(alpha = alpha)
            )
        }
    }
}

private fun DrawScope.drawOpenCodeMark(dark: Boolean, alpha: Float) {
    val fillColor = (if (dark) Color(0xFF4B4646) else Color(0xFFCFCECD)).copy(alpha = alpha)
    val frameColor = (if (dark) Color(0xFFF1ECEC) else Color(0xFF211E1E)).copy(alpha = alpha)
    drawScaledPath(ProviderIconArt.openCodeFillPath(), Size(32f, 40f), fillColor)
    drawScaledPath(ProviderIconArt.openCodeFramePath(), Size(32f, 40f), frameColor)
}

private fun DrawScope.drawProviderFallback(alpha: Float) {
    drawRoundRect(
        color = Color(0xFF8B8B95).copy(alpha = 0.85f * alpha),
        size = size,
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.width * 0.18f)
    )
}

private object ProviderIconArt {
    fun claudePath(): Path = parse("""
        m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z
    """)

    fun openAiPath(): Path = parse("""
        M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z
    """)

    fun cursorPath(): Path = parse("M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z")

    fun geminiPath(): Path = parse("M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z")

    fun geminiRedPath(): Path = parse("M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z")

    fun geminiGreenPath(): Path = parse("M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z")

    fun copilotPath(): Path = parse("M205.3 31.4c14 14.8 20 35.2 22.5 63.6 6.6 0 12.8 1.5 17 7.2l7.8 10.6c2.2 3 3.4 6.6 3.4 10.4v28.7a12 12 0 0 1-4.8 9.5C215.9 187.2 172.3 208 128 208c-49 0-98.2-28.3-123.2-46.6a12 12 0 0 1-4.8-9.5v-28.7c0-3.8 1.2-7.4 3.4-10.5l7.8-10.5c4.2-5.7 10.4-7.2 17-7.2 2.5-28.4 8.4-48.8 22.5-63.6C77.3 3.2 112.6 0 127.6 0h.4c14.7 0 50.4 2.9 77.3 31.4ZM128 78.7c-3 0-6.5.2-10.3.6a27.1 27.1 0 0 1-6 12.1 45 45 0 0 1-32 13c-6.8 0-13.9-1.5-19.7-5.2-5.5 1.9-10.8 4.5-11.2 11-.5 12.2-.6 24.5-.6 36.8 0 6.1 0 12.3-.2 18.5 0 3.6 2.2 6.9 5.5 8.4C79.9 185.9 105 192 128 192s48-6 74.5-18.1a9.4 9.4 0 0 0 5.5-8.4c.3-18.4 0-37-.8-55.3-.4-6.6-5.7-9.1-11.2-11-5.8 3.7-13 5.1-19.7 5.1a45 45 0 0 1-32-12.9 27.1 27.1 0 0 1-6-12.1c-3.4-.4-6.9-.5-10.3-.6Zm-27 44c5.8 0 10.5 4.6 10.5 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.6-10.4 10.4-10.4Zm53.4 0c5.8 0 10.4 4.6 10.4 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.7-10.4 10.4-10.4Zm-73-94.4c-11.2 1.1-20.6 4.8-25.4 10-10.4 11.3-8.2 40.1-2.2 46.2A31.2 31.2 0 0 0 75 91.7c6.8 0 19.6-1.5 30.1-12.2 4.7-4.5 7.5-15.7 7.2-27-.3-9.1-2.9-16.7-6.7-19.9-4.2-3.6-13.6-5.2-24.2-4.3Zm69 4.3c-3.8 3.2-6.4 10.8-6.7 19.9-.3 11.3 2.5 22.5 7.2 27a41.7 41.7 0 0 0 30 12.2c8.9 0 17-2.9 21.3-7.2 6-6.1 8.2-34.9-2.2-46.3-4.8-5-14.2-8.8-25.4-9.9-10.6-1-20 .7-24.2 4.3ZM128 56c-2.6 0-5.6.2-9 .5.4 1.7.5 3.7.7 5.7 0 1.5 0 3-.2 4.5 3.2-.3 6-.3 8.5-.3 2.6 0 5.3 0 8.5.3-.2-1.6-.2-3-.2-4.5.2-2 .3-4 .7-5.7-3.4-.3-6.4-.5-9-.5Z")

    fun openCodeFillPath(): Path = parse("M24 32H8V16H24V32Z")

    fun openCodeFramePath(): Path = parse("M24 8H8V32H24V8ZM32 40H0V0H32V40Z").apply {
        fillType = PathFillType.EvenOdd
    }

    private fun parse(path: String): Path = PathParser().parsePathString(path.trim()).toPath()
}

private data class SearchRank(val score: Int, val tieBreaker: String)

private object ModelPickerSearch {
    private const val FAVORITE_BOOST = 24

    fun normalizedTokens(query: String): List<String> =
        normalize(query)
            .split(Regex("\\s+"))
            .filter { it.isNotEmpty() }

    fun rank(entry: ModelCatalogEntry, query: String, isFavorite: Boolean): SearchRank? {
        val tokens = normalizedTokens(query)
        val tieBreaker = "${entry.model.label}\u0000${entry.provider.label}\u0000${entry.model.slug}"
        if (tokens.isEmpty()) return SearchRank(0, tieBreaker)

        val fields = haystackFields(entry)
        if (fields.isEmpty()) return null

        var total = 0
        tokens.forEach { token ->
            val best = fields.mapNotNull { field -> tokenScore(token, field) }.minOrNull() ?: return null
            total += best
        }

        return SearchRank(if (isFavorite) total - FAVORITE_BOOST else total, tieBreaker)
    }

    private fun haystackFields(entry: ModelCatalogEntry): List<String> {
        val raw = mutableListOf(
            entry.model.label,
            entry.model.name,
            entry.model.slug,
            entry.provider.driver,
            entry.provider.label,
            entry.provider.brandDisplayName
        )
        entry.model.subProvider?.trim()?.takeIf { it.isNotEmpty() }?.let(raw::add)
        entry.provider.upstreamVendorLabel(entry.model.slug)?.let(raw::add)
        return raw.map { normalize(it.trim()) }.filter { it.isNotEmpty() }
    }

    private fun tokenScore(token: String, field: String): Int? {
        val idx = field.indexOf(token)
        if (idx < 0) return null
        val anchorBonus = when {
            idx == 0 -> -4
            field.getOrNull(idx - 1)?.isWhitespace() == true -> -2
            else -> 0
        }
        val lengthPenalty = maxOf(0, token.length - 3) * 2
        return idx + anchorBonus + lengthPenalty
    }

    private fun normalize(value: String): String =
        Normalizer.normalize(value.lowercase(), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .trim()
}

// --- Search bar -----------------------------------------------------------

@Composable
private fun ModelPickerSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated)
            .border(0.5.dp, accent.copy(alpha = 0.22f), RoundedCornerShape(T3Radius.md))
            .padding(horizontal = T3Spacing.md, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Filled.Search,
            contentDescription = null,
            tint = T3Color.textTertiary.copy(alpha = 0.65f),
            modifier = Modifier.size(15.dp)
        )
        Spacer(modifier = Modifier.width(T3Spacing.sm))
        Box(modifier = Modifier.weight(1f)) {
            if (query.isEmpty()) {
                Text(
                    "Search models...",
                    style = T3Typography.callout,
                    color = T3Color.textTertiary
                )
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 15.sp, color = T3Color.textPrimary),
                cursorBrush = SolidColor(accent),
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (query.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clickable { onQueryChange("") },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Clear",
                    tint = T3Color.textTertiary.copy(alpha = 0.65f),
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

// --- Model row ------------------------------------------------------------

@Composable
private fun ModelPickerRow(
    entry: ModelCatalogEntry,
    visibleIndex: Int,
    isSelected: Boolean,
    isFavorite: Boolean,
    accent: Color,
    onFavoriteToggle: () -> Unit,
    onSelect: () -> Unit
) {
    val subtitle = buildSubtitle(entry)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.lg))
            .background(if (isSelected) accent.copy(alpha = 0.10f) else Color.Transparent)
            .padding(horizontal = 10.dp, vertical = 11.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Star toggle (independent of row tap)
        Box(
            modifier = Modifier
                .size(32.dp)
                .clickable(onClick = onFavoriteToggle),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Star,
                contentDescription = if (isFavorite) "Remove from favorites" else "Add to favorites",
                tint = if (isFavorite) Color(0xFFFACC15)
                       else T3Color.textTertiary.copy(alpha = 0.42f),
                modifier = Modifier.size(17.dp)
            )
        }

        // Model name + subtitle — tap to select
        Column(
            modifier = Modifier
                .weight(1f)
                .clickable(onClick = onSelect)
                .padding(top = 3.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = entry.model.label,
                    style = T3Typography.callout.copy(fontWeight = FontWeight.SemiBold),
                    color = T3Color.textPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                JumpBadge(visibleIndex = visibleIndex)
            }
            if (subtitle.isNotEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    ProviderIcon(
                        driver = entry.provider.driver,
                        size = 11.dp
                    )
                    Text(
                        text = subtitle,
                        style = T3Typography.footnote,
                        color = T3Color.textTertiary.copy(alpha = 0.92f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun JumpBadge(visibleIndex: Int) {
    if (visibleIndex >= 9) return
    Text(
        text = (visibleIndex + 1).toString(),
        style = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Medium),
        color = T3Color.textSecondary,
        modifier = Modifier
            .clip(RoundedCornerShape(percent = 50))
            .background(T3Color.surfaceMuted.copy(alpha = 0.95f))
            .border(0.5.dp, T3Color.separator.copy(alpha = 0.55f), RoundedCornerShape(percent = 50))
            .padding(horizontal = 7.dp, vertical = 4.dp)
    )
}

private fun buildSubtitle(entry: ModelCatalogEntry): String {
    val sp = entry.model.subProvider?.trim().orEmpty()
    return if (sp.isNotEmpty()) "${entry.provider.label} · $sp" else entry.provider.label
}

// --- Empty state ----------------------------------------------------------

@Composable
private fun ModelPickerEmptyState(
    isSearching: Boolean,
    railSelection: RailSelection,
    modifier: Modifier = Modifier
) {
    val message = when {
        isSearching -> "No models found"
        railSelection is RailSelection.Favorites -> "No favorites yet\nTap ★ on a model to add"
        else -> "No models available"
    }
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = if (isSearching) "🔍"
                   else if (railSelection is RailSelection.Favorites) "⭐"
                   else "✨",
            fontSize = 32.sp
        )
        Spacer(modifier = Modifier.height(T3Spacing.md))
        Text(
            text = message,
            style = T3Typography.callout,
            color = T3Color.textSecondary,
            textAlign = TextAlign.Center
        )
    }
}
