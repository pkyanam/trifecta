package com.belweave.trifecta.features.threads

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.SortByAlpha
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.belweave.trifecta.core.models.ThreadShell
import com.belweave.trifecta.core.networking.ConnectionState
import com.belweave.trifecta.core.util.RelativeTime
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Divider
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3ToolbarChip
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.T3WordmarkLabel

@Composable
fun ThreadsListScreen(
    onOpenThread: (ThreadShell) -> Unit,
    onNewThread: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenArchived: () -> Unit,
    onOpenSsh: () -> Unit,
    viewModel: ThreadListViewModel = viewModel()
) {
    val groups by viewModel.groupedThreads.collectAsState()
    val emptyProjects by viewModel.emptyProjects.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val sort by viewModel.sort.collectAsState()
    val collapsed by viewModel.collapsedProjects.collectAsState()
    val expanded by viewModel.expandedThreadCounts.collectAsState()
    val projects by viewModel.projects.collectAsState()

    val canCreate = connectionState is ConnectionState.Connected && projects.isNotEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(T3Color.surfaceGrouped)
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        HeaderBar(
            sort = sort,
            onSortChanged = viewModel::setSort,
            onToggleAll = viewModel::toggleAllExpansion,
            allCollapsed = run {
                val ids = groups.map { it.first.id }.toSet()
                ids.isNotEmpty() && collapsed.containsAll(ids)
            },
            onNewThread = onNewThread,
            canCreate = canCreate,
            onOpenSettings = onOpenSettings,
            onOpenArchived = onOpenArchived,
            onOpenSsh = onOpenSsh
        )

        if (groups.isEmpty() && emptyProjects.isEmpty()) {
            EmptyState(connectionState = connectionState, hasProjects = projects.isNotEmpty())
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = T3Spacing.lg)
            ) {
                items(groups) { (project, threads) ->
                    val isCollapsed = collapsed.contains(project.id)
                    val visibleCount = expanded[project.id] ?: ThreadListViewModel.defaultVisible
                    val visible = threads.take(visibleCount)
                    val hasMore = threads.size > visibleCount

                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProjectHeader(
                            title = project.title,
                            isCollapsed = isCollapsed,
                            onClick = { viewModel.toggleProjectCollapsed(project.id) }
                        )
                        if (!isCollapsed) {
                            visible.forEachIndexed { idx, thread ->
                                ThreadRow(
                                    thread = thread,
                                    isFirst = idx == 0,
                                    onClick = { onOpenThread(thread) }
                                )
                            }
                            if (hasMore) {
                                ShowMoreRow {
                                    viewModel.showMore(project.id, ThreadListViewModel.defaultVisible)
                                }
                            }
                        }
                        T3Divider(modifier = Modifier.padding(vertical = T3Spacing.xs))
                    }
                }

                if (emptyProjects.isNotEmpty()) {
                    items(emptyProjects) { project ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(onClick = onNewThread)
                                .padding(vertical = T3Spacing.sm),
                            horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
                        ) {
                            Icon(
                                Icons.Outlined.Folder,
                                contentDescription = null,
                                tint = T3Color.textSecondary,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                project.title,
                                style = T3Typography.body.copy(fontWeight = FontWeight.SemiBold),
                                color = T3Color.textPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                Icons.Outlined.Add,
                                contentDescription = null,
                                tint = T3Color.primary,
                                modifier = Modifier.size(12.dp)
                            )
                        }
                    }
                }

                item { Spacer(Modifier.height(T3Spacing.xxxl)) }
            }
        }
    }
}

@Composable
private fun HeaderBar(
    sort: ThreadSortOrder,
    onSortChanged: (ThreadSortOrder) -> Unit,
    onToggleAll: () -> Unit,
    allCollapsed: Boolean,
    onNewThread: () -> Unit,
    canCreate: Boolean,
    onOpenSettings: () -> Unit,
    onOpenArchived: () -> Unit,
    onOpenSsh: () -> Unit
) {
    var sortMenuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.lg)
            .padding(top = T3Spacing.md, bottom = T3Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T3WordmarkLabel()
            Text(
                "PROJECTS",
                style = T3Typography.caption.copy(letterSpacing = 0.6.sp, fontSize = 12.sp),
                color = T3Color.textTertiary
            )
        }
        Spacer(Modifier.weight(1f))

        Box {
            T3ToolbarChip(onClick = { sortMenuOpen = true }) {
                Icon(
                    Icons.Outlined.SortByAlpha,
                    contentDescription = "Sort",
                    tint = T3Color.textPrimary,
                    modifier = Modifier.size(16.dp)
                )
            }
            DropdownMenu(
                expanded = sortMenuOpen,
                onDismissRequest = { sortMenuOpen = false }
            ) {
                ThreadSortOrder.values().forEach { order ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                if (sort == order) "✓ ${order.label}" else order.label,
                                style = T3Typography.body
                            )
                        },
                        onClick = {
                            onSortChanged(order)
                            sortMenuOpen = false
                        }
                    )
                }
            }
        }

        T3ToolbarChip(onClick = onToggleAll) {
            Icon(
                if (allCollapsed) Icons.Outlined.ExpandMore else Icons.Outlined.ExpandLess,
                contentDescription = "Expand/collapse",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(16.dp)
            )
        }

        T3ToolbarChip(onClick = if (canCreate) onNewThread else { -> }) {
            Icon(
                Icons.Outlined.Add,
                contentDescription = "New thread",
                tint = if (canCreate) T3Color.textPrimary else T3Color.textTertiary,
                modifier = Modifier.size(18.dp)
            )
        }

        T3ToolbarChip(onClick = onOpenArchived) {
            Icon(
                Icons.Outlined.Archive,
                contentDescription = "Archive",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(16.dp)
            )
        }

        T3ToolbarChip(onClick = onOpenSsh) {
            Icon(
                Icons.Outlined.Terminal,
                contentDescription = "SSH",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(16.dp)
            )
        }

        T3ToolbarChip(onClick = onOpenSettings) {
            Icon(
                Icons.Outlined.Settings,
                contentDescription = "Settings",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun EmptyState(connectionState: ConnectionState, hasProjects: Boolean) {
    Column(
        modifier = Modifier.fillMaxSize().padding(T3Spacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(T3Radius.md))
                .background(T3Color.surfaceElevated),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Outlined.Terminal,
                contentDescription = null,
                tint = T3Color.primary,
                modifier = Modifier.size(28.dp)
            )
        }
        Spacer(Modifier.height(T3Spacing.md))
        Text("No Threads", style = T3Typography.title, color = T3Color.textPrimary)
        Spacer(Modifier.height(T3Spacing.sm))
        val message = when {
            connectionState is ConnectionState.Connected && !hasProjects ->
                "No projects are available from the desktop server yet."
            connectionState is ConnectionState.Connected ->
                "Create a mobile thread from one of your desktop projects."
            else -> "Waiting to connect to the Trifecta server…"
        }
        Text(
            message,
            style = T3Typography.callout,
            color = T3Color.textSecondary
        )
        connectionState.detail?.let {
            Spacer(Modifier.height(T3Spacing.sm))
            Text(it, style = T3Typography.footnote, color = T3Color.danger)
        }
    }
}

@Composable
private fun ProjectHeader(title: String, isCollapsed: Boolean, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = T3Spacing.sm)
    ) {
        Icon(
            if (isCollapsed) Icons.Outlined.ChevronRight else Icons.Outlined.ExpandMore,
            contentDescription = null,
            tint = T3Color.textTertiary,
            modifier = Modifier.size(14.dp)
        )
        Icon(
            Icons.Outlined.Folder,
            contentDescription = null,
            tint = T3Color.textSecondary,
            modifier = Modifier.size(16.dp)
        )
        Text(
            title,
            style = T3Typography.body.copy(fontWeight = FontWeight.SemiBold),
            color = T3Color.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ThreadRow(thread: ThreadShell, isFirst: Boolean, onClick: () -> Unit) {
    val date = thread.latestUserMessageAt ?: thread.updatedAt
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.md),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = T3Spacing.sm, horizontal = 30.dp)
    ) {
        Text(
            thread.title,
            style = T3Typography.body.copy(
                fontWeight = if (isFirst) FontWeight.SemiBold else FontWeight.Normal
            ),
            color = T3Color.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Text(
            RelativeTime.format(date),
            style = T3Typography.footnote,
            color = if (isFirst) T3Color.textSecondary else T3Color.textTertiary
        )
    }
}

@Composable
private fun ShowMoreRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = T3Spacing.sm, horizontal = 30.dp)
    ) {
        Text("Show more", style = T3Typography.callout, color = T3Color.textSecondary)
    }
}
