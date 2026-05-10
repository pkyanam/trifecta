package com.belweave.trifecta.features.thread

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.belweave.trifecta.core.models.ModelCatalogSection
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography

/**
 * Bottom-sheet model picker. Mirrors the iOS `ModelPickerSheet` layout: each
 * provider gets a header (with optional sub-bucket suffix) and selectable
 * model rows, with a search field at the top.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(
    providers: List<ServerProvider>,
    currentSelection: ModelSelection?,
    accent: Color,
    onDismiss: () -> Unit,
    onSelect: (ServerProvider, String) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by remember { mutableStateOf("") }
    val sections = remember(providers) { ModelCatalogSection.grouped(providers) }
    val rows = remember(sections, query, currentSelection) {
        buildRows(sections, query, currentSelection)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = T3Color.surface
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(horizontal = T3Spacing.lg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = T3Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Pick a model", style = T3Typography.title, color = T3Color.textPrimary)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = "Close", tint = T3Color.textSecondary)
                }
            }

            SearchField(query = query, onQueryChange = { query = it })

            Spacer(Modifier.height(T3Spacing.sm))

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = T3Spacing.xl)
            ) {
                items(items = rows, key = { it.key }) { row ->
                    when (row) {
                        is PickerRow.Header -> {
                            Text(
                                text = row.title,
                                style = T3Typography.caption,
                                color = T3Color.textTertiary,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = T3Spacing.md, bottom = T3Spacing.xs)
                            )
                        }
                        is PickerRow.Entry -> {
                            ModelRow(
                                title = row.modelLabel,
                                subtitle = row.subtitle,
                                isSelected = row.isSelected,
                                accent = accent,
                                onClick = {
                                    onSelect(row.provider, row.slug)
                                    onDismiss()
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .padding(horizontal = T3Spacing.md, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Search, contentDescription = null, tint = T3Color.textTertiary, modifier = Modifier.size(16.dp))
        Spacer(Modifier.size(T3Spacing.sm))
        Box(modifier = Modifier.weight(1f)) {
            if (query.isEmpty()) {
                Text("Search models", style = T3Typography.callout, color = T3Color.textTertiary)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 15.sp, color = T3Color.textPrimary),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(T3Color.primary),
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (query.isNotEmpty()) {
            IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(20.dp)) {
                Icon(Icons.Filled.Close, contentDescription = "Clear", tint = T3Color.textTertiary)
            }
        }
    }
}

@Composable
private fun ModelRow(
    title: String,
    subtitle: String?,
    isSelected: Boolean,
    accent: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp, horizontal = T3Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = title, style = T3Typography.callout, color = T3Color.textPrimary, fontWeight = FontWeight.Medium)
            subtitle?.takeIf { it.isNotEmpty() }?.let {
                Text(text = it, style = T3Typography.caption, color = T3Color.textTertiary)
            }
        }
        if (isSelected) {
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(accent),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.Check, contentDescription = "Selected", tint = Color.White, modifier = Modifier.size(14.dp))
            }
        }
    }
}

private sealed class PickerRow {
    abstract val key: String
    data class Header(val sectionId: String, val title: String) : PickerRow() {
        override val key get() = "h:$sectionId"
    }
    data class Entry(
        val sectionId: String,
        val provider: ServerProvider,
        val slug: String,
        val modelLabel: String,
        val subtitle: String?,
        val isSelected: Boolean
    ) : PickerRow() {
        override val key get() = "$sectionId|$slug"
    }
}

private fun buildRows(
    sections: List<ModelCatalogSection>,
    query: String,
    currentSelection: ModelSelection?
): List<PickerRow> {
    val q = query.trim().lowercase()
    val rows = mutableListOf<PickerRow>()
    for (section in sections) {
        val filtered = if (q.isEmpty()) section.entries else section.entries.filter {
            it.model.label.lowercase().contains(q) || it.model.slug.lowercase().contains(q)
        }
        if (filtered.isEmpty()) continue
        rows.add(PickerRow.Header(section.id, section.headerTitle))
        for (e in filtered) {
            val isSelected = currentSelection != null
                && currentSelection.instanceId == e.provider.instanceId
                && currentSelection.model == e.model.slug
            rows.add(
                PickerRow.Entry(
                    sectionId = section.id,
                    provider = e.provider,
                    slug = e.model.slug,
                    modelLabel = e.model.label,
                    subtitle = section.provider.upstreamVendorLabel(e.model.slug),
                    isSelected = isSelected
                )
            )
        }
    }
    return rows
}
