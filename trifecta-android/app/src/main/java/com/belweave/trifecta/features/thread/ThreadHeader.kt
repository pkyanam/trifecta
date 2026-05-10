package com.belweave.trifecta.features.thread

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.belweave.trifecta.core.models.OrchestrationSession
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.RuntimeMode
import com.belweave.trifecta.core.models.SessionStatus
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Pill
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3ToolbarChip
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.T3WordmarkLabel

data class ThreadDescriptor(
    val title: String,
    val model: String,
    val interactionMode: ProviderInteractionMode,
    val runtimeMode: RuntimeMode,
)

@Composable
fun ThreadHeader(
    thread: ThreadDescriptor,
    project: ProjectShell?,
    session: OrchestrationSession?,
    isArchived: Boolean,
    accent: Color,
    onBack: () -> Unit,
    onRename: () -> Unit,
    onArchive: () -> Unit,
    onUnarchive: () -> Unit,
    onDelete: () -> Unit,
    onSetInteractionMode: (ProviderInteractionMode) -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(T3Color.surfaceGrouped)
            .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.md),
        verticalArrangement = Arrangement.spacedBy(T3Spacing.md)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
        ) {
            T3ToolbarChip(onClick = onBack) {
                Icon(
                    Icons.Outlined.ArrowBack,
                    contentDescription = "Back",
                    tint = T3Color.textPrimary,
                    modifier = Modifier.size(16.dp)
                )
            }
            T3WordmarkLabel()
            Spacer(Modifier.weight(1f))
            SessionStatePill(session)

            Box {
                T3ToolbarChip(onClick = { menuOpen = true }) {
                    Icon(
                        Icons.Outlined.MoreVert,
                        contentDescription = "More",
                        tint = T3Color.textPrimary,
                        modifier = Modifier.size(16.dp)
                    )
                }
                DropdownMenu(
                    expanded = menuOpen,
                    onDismissRequest = { menuOpen = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Rename thread") },
                        onClick = { menuOpen = false; onRename() }
                    )
                    if (isArchived) {
                        DropdownMenuItem(
                            text = { Text("Unarchive") },
                            onClick = { menuOpen = false; onUnarchive() }
                        )
                    } else {
                        DropdownMenuItem(
                            text = { Text("Archive") },
                            onClick = { menuOpen = false; onArchive() }
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Delete", color = T3Color.danger) },
                        onClick = {
                            menuOpen = false
                            confirmDelete = true
                        }
                    )
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
            Text(
                thread.title,
                style = T3Typography.headline,
                color = T3Color.textPrimary,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
            ) {
                project?.let { proj ->
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(T3Radius.sm))
                            .background(T3Color.surfaceElevated)
                            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.sm))
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text(
                            proj.title,
                            style = T3Typography.caption.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            ),
                            color = T3Color.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                InteractionModeMenu(
                    mode = thread.interactionMode,
                    accent = accent,
                    onSelect = onSetInteractionMode
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.xs)
            ) {
                Icon(
                    Icons.Outlined.AutoAwesome,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(10.dp)
                )
                Text(thread.model, style = T3Typography.footnote, color = T3Color.textSecondary)
                Text("·", style = T3Typography.footnote, color = T3Color.textTertiary)
                Text(
                    runtimeLabel(thread.runtimeMode),
                    style = T3Typography.footnote,
                    color = runtimeTint(thread.runtimeMode, accent)
                )
                if (session?.status == SessionStatus.RUNNING) {
                    Text("·", style = T3Typography.footnote, color = T3Color.textTertiary)
                    Text("running", style = T3Typography.footnote, color = T3Color.warning)
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .background(T3Color.separator)
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this thread?") },
            text = { Text("This thread will be permanently removed from the desktop server.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) {
                    Text("Delete", color = T3Color.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun SessionStatePill(session: OrchestrationSession?) {
    when (session?.status) {
        SessionStatus.RUNNING -> T3Pill(
            text = "Running",
            tint = T3Color.warning,
            emphasized = true
        )
        SessionStatus.ERROR -> T3Pill(
            text = "Error",
            tint = T3Color.danger,
            emphasized = true
        )
        else -> Unit
    }
}

@Composable
private fun InteractionModeMenu(
    mode: ProviderInteractionMode,
    accent: Color,
    onSelect: (ProviderInteractionMode) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val tint = if (mode == ProviderInteractionMode.PLAN) accent else T3Color.success
    val label = if (mode == ProviderInteractionMode.PLAN) "PLAN" else "BUILD"

    Box {
        Box(modifier = Modifier.clickable { open = true }) {
            T3Pill(text = label, tint = tint, emphasized = true)
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false }
        ) {
            DropdownMenuItem(
                text = { Text(if (mode == ProviderInteractionMode.DEFAULT) "✓ Build" else "Build") },
                onClick = {
                    open = false
                    onSelect(ProviderInteractionMode.DEFAULT)
                }
            )
            DropdownMenuItem(
                text = { Text(if (mode == ProviderInteractionMode.PLAN) "✓ Plan" else "Plan") },
                onClick = {
                    open = false
                    onSelect(ProviderInteractionMode.PLAN)
                }
            )
        }
    }
}

private fun runtimeLabel(mode: RuntimeMode): String = when (mode) {
    RuntimeMode.APPROVAL_REQUIRED -> "supervised"
    RuntimeMode.AUTO_ACCEPT_EDITS -> "auto edits"
    RuntimeMode.FULL_ACCESS -> "full access"
}

@Composable
private fun runtimeTint(mode: RuntimeMode, accent: Color): Color = when (mode) {
    RuntimeMode.APPROVAL_REQUIRED -> T3Color.warning
    RuntimeMode.AUTO_ACCEPT_EDITS -> accent
    RuntimeMode.FULL_ACCESS -> T3Color.success
}
