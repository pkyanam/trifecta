package com.belweave.trifecta.features.thread

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProjectSearchEntry
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.core.models.ServerProviderSkill
import com.belweave.trifecta.core.models.ServerProviderSlashCommand
import com.belweave.trifecta.core.networking.UploadImage
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.ComposerSize
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val MAX_CHARS = 120_000
private const val MAX_ATTACHMENTS = 8
private const val PATH_SEARCH_DEBOUNCE_MS = 220L

private sealed class ComposerMenuRow {
    abstract val rowId: String
    abstract val title: String
    abstract val subtitle: String

    data class Path(val entry: ProjectSearchEntry) : ComposerMenuRow() {
        override val rowId = "path:${entry.path}"
        override val title: String =
            entry.path.substringAfterLast('/').ifEmpty { entry.path }
        override val subtitle: String = entry.parentPath ?: entry.path
    }

    data class BuiltIn(val command: BuiltInSlashCommand) : ComposerMenuRow() {
        override val rowId = "builtin:${command.raw}"
        override val title get() = "/${command.raw}"
        override val subtitle get() = command.subtitle
    }

    data class ProviderSlash(
        val providerLabel: String,
        val command: ServerProviderSlashCommand
    ) : ComposerMenuRow() {
        override val rowId = "pslash:$providerLabel:${command.name}"
        override val title get() = "/${command.name}"
        override val subtitle: String
            get() {
                val hint = command.description ?: command.inputHint
                val parts = mutableListOf(providerLabel)
                hint?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
                return parts.joinToString(" · ")
            }
    }

    data class Skill(val skill: ServerProviderSkill) : ComposerMenuRow() {
        override val rowId = "skill:${skill.name}"
        override val title get() = skill.name
        override val subtitle get() = skill.shortDescription ?: skill.description ?: ""
    }
}

private enum class BuiltInSlashCommand(val raw: String, val subtitle: String) {
    MODEL("model", "Switch response model for this thread"),
    PLAN("plan", "Switch this thread into plan mode"),
    DEFAULT_MODE("default", "Switch this thread back to normal build mode")
}

@Composable
fun ComposerView(
    viewModel: ThreadViewModel,
    accent: AppAccent,
    isDark: Boolean,
    composerSize: ComposerSize,
    modifier: Modifier = Modifier
) {
    val accentColor = accent.colorFor(isDark)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val detail by viewModel.detail.collectAsState()
    val isSending by viewModel.isSending.collectAsState()
    val session by viewModel.session.collectAsState()
    val serverConfig by viewModel.serverConfig.collectAsState()

    var fieldValue by remember { mutableStateOf(TextFieldValue("")) }
    var attachments by remember { mutableStateOf<List<LocalAttachment>>(emptyList()) }
    var menuRows by remember { mutableStateOf<List<ComposerMenuRow>>(emptyList()) }
    var focused by remember { mutableStateOf(false) }
    var showModelPicker by remember { mutableStateOf(false) }
    var pathSearchJob by remember { mutableStateOf<Job?>(null) }

    DisposableEffect(Unit) {
        onDispose { pathSearchJob?.cancel() }
    }

    val isTurnRunning = isSending ||
        session?.let { s -> s.status.raw == "running" } == true ||
        detail?.latestTurn?.let { it.state.raw == "running" } == true

    val selectedProvider: ServerProvider? = remember(detail, serverConfig) {
        val sel = detail?.modelSelection ?: return@remember null
        serverConfig?.providers?.firstOrNull { it.instanceId == sel.instanceId }
    }
    val modelLabel: String = remember(detail, serverConfig) {
        val sel = detail?.modelSelection ?: return@remember "Model"
        serverConfig?.modelDisplayLabel(sel) ?: sel.model
    }

    fun refreshMenu() {
        pathSearchJob?.cancel()
        pathSearchJob = null
        val trigger = ComposerLogic.detectTrigger(fieldValue.text, fieldValue.selection.end)
        if (trigger == null) {
            menuRows = emptyList()
            return
        }
        when (trigger.kind) {
            ComposerTriggerKind.SLASH_COMMAND -> {
                menuRows = slashRows(trigger, selectedProvider)
            }
            ComposerTriggerKind.SKILL -> {
                menuRows = skillRows(trigger, selectedProvider)
            }
            ComposerTriggerKind.PATH -> {
                val q = trigger.query.trim()
                if (q.isEmpty()) {
                    menuRows = emptyList()
                    return
                }
                pathSearchJob = scope.launch {
                    delay(PATH_SEARCH_DEBOUNCE_MS)
                    val result = viewModel.searchProjectEntries(q) ?: run {
                        menuRows = emptyList()
                        return@launch
                    }
                    val still = ComposerLogic.detectTrigger(fieldValue.text, fieldValue.selection.end)
                    if (still?.kind != ComposerTriggerKind.PATH || still.query.trim() != q) return@launch
                    menuRows = result.entries.map { ComposerMenuRow.Path(it) }
                }
            }
        }
    }

    fun applyMenuSelection(row: ComposerMenuRow) {
        val trigger = ComposerLogic.detectTrigger(fieldValue.text, fieldValue.selection.end) ?: run {
            menuRows = emptyList()
            return
        }
        val replacement = when (row) {
            is ComposerMenuRow.Path -> "@${row.entry.path} "
            is ComposerMenuRow.ProviderSlash -> "/${row.command.name} "
            is ComposerMenuRow.Skill -> "$${row.skill.name} "
            is ComposerMenuRow.BuiltIn -> {
                when (row.command) {
                    BuiltInSlashCommand.MODEL -> {
                        showModelPicker = true; ""
                    }
                    BuiltInSlashCommand.PLAN -> {
                        viewModel.setInteractionMode(ProviderInteractionMode.PLAN); ""
                    }
                    BuiltInSlashCommand.DEFAULT_MODE -> {
                        viewModel.setInteractionMode(ProviderInteractionMode.DEFAULT); ""
                    }
                }
            }
        }
        val replaced = ComposerLogic.replaceRangeUtf16(
            fieldValue.text,
            trigger.rangeStart,
            trigger.rangeEnd,
            replacement
        )
        fieldValue = TextFieldValue(
            text = replaced.text,
            selection = androidx.compose.ui.text.TextRange(replaced.cursorUtf16)
        )
        menuRows = emptyList()
    }

    fun send() {
        val trimmed = fieldValue.text.trim()
        if (attachments.isEmpty()) {
            if (ComposerLogic.isStandaloneModelSlash(trimmed)) {
                showModelPicker = true
                fieldValue = TextFieldValue("")
                menuRows = emptyList()
                return
            }
            ComposerLogic.parseStandaloneModeSlash(trimmed)?.let { mode ->
                viewModel.setInteractionMode(mode)
                fieldValue = TextFieldValue("")
                menuRows = emptyList()
                return
            }
        }
        val uploads = attachments.map { it.upload }
        val text = trimmed
        fieldValue = TextFieldValue("")
        attachments = emptyList()
        menuRows = emptyList()
        viewModel.send(text, uploads, fallback = null)
    }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(MAX_ATTACHMENTS)
    ) { uris: List<Uri> ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val loaded = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri -> loadImageAttachment(context.contentResolver, uri) }
            }
            attachments = (attachments + loaded).take(MAX_ATTACHMENTS)
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(T3Color.surfaceGrouped)
            .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        if (attachments.isNotEmpty()) {
            AttachmentRow(
                attachments = attachments,
                onRemove = { id -> attachments = attachments.filterNot { it.id == id } }
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(T3Radius.xl))
                .background(T3Color.surfaceElevated)
                .border(
                    if (focused) 1.dp else 0.5.dp,
                    if (focused) accentColor.copy(alpha = 0.55f) else T3Color.separator,
                    RoundedCornerShape(T3Radius.xl)
                )
                .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)
        ) {
            if (menuRows.isNotEmpty()) {
                ComposerMenu(rows = menuRows, onSelect = ::applyMenuSelection, accent = accentColor)
            }

            ComposerTextField(
                value = fieldValue,
                onValueChange = { newValue ->
                    fieldValue = newValue
                    refreshMenu()
                },
                onFocusChange = { focused = it },
                composerSize = composerSize,
                accent = accentColor
            )

            ControlRow(
                modelLabel = modelLabel,
                providerDriver = selectedProvider?.driver,
                isTurnRunning = isTurnRunning,
                canSend = canSend(fieldValue.text, attachments, isSending),
                accentColor = accentColor,
                attachmentsAtMax = attachments.size >= MAX_ATTACHMENTS,
                onPickImages = {
                    photoPicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                },
                onModelPicker = { showModelPicker = true },
                onSend = ::send,
                onInterrupt = { viewModel.interrupt() }
            )
        }
    }

    if (showModelPicker) {
        ModelPickerSheet(
            providers = serverConfig?.providers.orEmpty(),
            currentSelection = detail?.modelSelection,
            accent = accentColor,
            onDismiss = { showModelPicker = false },
            onSelect = { provider, slug ->
                viewModel.updateModel(ModelSelection(provider.instanceId, slug))
            }
        )
    }
}

@Composable
private fun ComposerTextField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    composerSize: ComposerSize,
    accent: Color
) {
    val lineHeight = 22.dp
    val minLines = 2
    val maxLines = composerSize.maxLines
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = (minLines * 22 + 12).dp, max = (maxLines * 22 + 12).dp)
            .padding(vertical = 6.dp)
    ) {
        if (value.text.isEmpty()) {
            Text(
                text = "Ask anything, @tag files/folders, \$skills,\nor / for commands",
                style = T3Typography.callout,
                color = T3Color.textTertiary
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(fontSize = 15.sp, color = T3Color.textPrimary, lineHeight = 22.sp),
            cursorBrush = SolidColor(accent),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { state -> onFocusChange(state.isFocused) }
        )
    }
}

@Composable
private fun ComposerMenu(
    rows: List<ComposerMenuRow>,
    onSelect: (ComposerMenuRow) -> Unit,
    accent: Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceGrouped.copy(alpha = 0.98f))
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .heightIn(max = 200.dp)
    ) {
        LazyColumn {
            items(items = rows, key = { it.rowId }) { row ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(row) }
                        .padding(horizontal = T3Spacing.sm, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
                ) {
                    Icon(
                        rowIcon(row),
                        contentDescription = null,
                        tint = T3Color.textTertiary,
                        modifier = Modifier.width(22.dp)
                    )
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = row.title,
                            style = T3Typography.callout,
                            fontWeight = FontWeight.Medium,
                            color = T3Color.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (row.subtitle.isNotEmpty()) {
                            Text(
                                text = row.subtitle,
                                style = T3Typography.caption,
                                color = T3Color.textTertiary,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
                Divider(color = T3Color.separator.copy(alpha = 0.35f))
            }
        }
    }
}

@Composable
private fun ControlRow(
    modelLabel: String,
    providerDriver: String?,
    isTurnRunning: Boolean,
    canSend: Boolean,
    accentColor: Color,
    attachmentsAtMax: Boolean,
    onPickImages: () -> Unit,
    onModelPicker: () -> Unit,
    onSend: () -> Unit,
    onInterrupt: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        ModelChip(
            modelLabel = modelLabel,
            providerDriver = providerDriver,
            accent = accentColor,
            onClick = onModelPicker
        )
        Spacer(Modifier.weight(1f))
        SmallSquareButton(
            onClick = onPickImages,
            enabled = !attachmentsAtMax,
            content = {
                Icon(
                    Icons.Filled.AttachFile,
                    contentDescription = "Attach image",
                    tint = if (attachmentsAtMax) T3Color.textTertiary else T3Color.textSecondary,
                    modifier = Modifier.size(15.dp)
                )
            }
        )
        if (isTurnRunning) {
            SmallSquareButton(
                onClick = onInterrupt,
                enabled = true,
                content = {
                    Icon(
                        Icons.Filled.Stop,
                        contentDescription = "Stop turn",
                        tint = T3Color.danger,
                        modifier = Modifier.size(15.dp)
                    )
                }
            )
        } else {
            SmallSquareButton(
                onClick = onSend,
                enabled = canSend,
                content = {
                    Icon(
                        Icons.Filled.ArrowUpward,
                        contentDescription = "Send message",
                        tint = if (canSend) accentColor else T3Color.textTertiary,
                        modifier = Modifier.size(15.dp)
                    )
                }
            )
        }
    }
}

@Composable
private fun SmallSquareButton(
    onClick: () -> Unit,
    enabled: Boolean,
    content: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) { content() }
}

@Composable
private fun ModelChip(
    modelLabel: String,
    providerDriver: String?,
    accent: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .clickable(onClick = onClick)
            .padding(horizontal = T3Spacing.sm, vertical = 6.dp)
            .defaultMinSize(minHeight = 28.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(
            providerIcon(providerDriver),
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(13.dp)
        )
        Text(
            text = modelLabel,
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium),
            color = T3Color.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Icon(
            Icons.Filled.KeyboardArrowDown,
            contentDescription = null,
            tint = T3Color.textTertiary,
            modifier = Modifier.size(12.dp)
        )
    }
}

@Composable
private fun AttachmentRow(
    attachments: List<LocalAttachment>,
    onRemove: (String) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.md),
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        items(items = attachments, key = { it.id }) { att ->
            AttachmentChip(attachment = att, onRemove = { onRemove(att.id) })
        }
    }
}

@Composable
private fun AttachmentChip(attachment: LocalAttachment, onRemove: () -> Unit) {
    Box(
        modifier = Modifier.size(64.dp),
        contentAlignment = Alignment.TopEnd
    ) {
        AsyncImage(
            model = attachment.previewBytes,
            contentDescription = "Image attachment",
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(T3Radius.sm))
                .background(T3Color.surfaceMuted)
                .align(Alignment.BottomStart)
        )
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable(onClick = onRemove)
                .padding(2.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Remove attachment",
                tint = Color.White,
                modifier = Modifier.size(12.dp)
            )
        }
    }
}

private fun rowIcon(row: ComposerMenuRow): ImageVector = when (row) {
    is ComposerMenuRow.Path -> if (row.entry.isDirectory) Icons.Filled.Folder else Icons.Filled.Description
    is ComposerMenuRow.BuiltIn -> Icons.Filled.Code
    is ComposerMenuRow.ProviderSlash -> Icons.Filled.Terminal
    is ComposerMenuRow.Skill -> Icons.Filled.AutoAwesome
}

private fun providerIcon(driver: String?): ImageVector = Icons.Filled.AutoAwesome

private fun slashRows(
    trigger: ComposerTrigger,
    provider: ServerProvider?
): List<ComposerMenuRow> {
    val q = trigger.query.trim().lowercase()
    val rows = mutableListOf<ComposerMenuRow>()
    BuiltInSlashCommand.values().forEach { rows.add(ComposerMenuRow.BuiltIn(it)) }
    provider?.slashCommands?.forEach { rows.add(ComposerMenuRow.ProviderSlash(provider.label, it)) }
    if (q.isEmpty()) return rows
    return rows.filter { row ->
        val title = row.title.lowercase()
        val subtitle = row.subtitle.lowercase()
        val stripped = if (title.startsWith("/")) title.drop(1) else title
        title.contains(q) || subtitle.contains(q) || stripped.startsWith(q)
    }
}

private fun skillRows(
    trigger: ComposerTrigger,
    provider: ServerProvider?
): List<ComposerMenuRow> {
    val skills = provider?.skills.orEmpty()
    val q = trigger.query.trim().lowercase()
    val mapped = skills.map { ComposerMenuRow.Skill(it) }
    if (q.isEmpty()) return mapped
    return mapped.filter { row ->
        val s = (row as ComposerMenuRow.Skill).skill
        val hay = (s.name + " " + (s.shortDescription ?: "") + " " + (s.description ?: "")).lowercase()
        hay.contains(q)
    }
}

private fun canSend(
    text: String,
    attachments: List<LocalAttachment>,
    isSending: Boolean
): Boolean {
    val trimmed = text.trim()
    return (trimmed.isNotEmpty() || attachments.isNotEmpty()) &&
        trimmed.length <= MAX_CHARS &&
        !isSending
}

