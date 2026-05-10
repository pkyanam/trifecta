package com.belweave.trifecta.features.thread

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.belweave.trifecta.core.models.Message
import com.belweave.trifecta.core.models.RenderableActivity
import com.belweave.trifecta.core.models.ThreadActivity
import com.belweave.trifecta.designsystem.MessageBubble
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.TranscriptDensity
import com.belweave.trifecta.designsystem.TranscriptDensityKind
import kotlinx.coroutines.launch

private sealed class TimelineRow {
    abstract val sortKey: java.time.Instant
    abstract val rank: Int
    abstract val rowId: String

    data class MessageRow(val message: Message) : TimelineRow() {
        override val sortKey get() = message.createdAt
        override val rank get() = 1
        override val rowId get() = "msg:${message.id.rawValue}"
    }

    data class ActivityRow(val activity: RenderableActivity) : TimelineRow() {
        override val sortKey get() = activity.createdAt
        override val rank get() = 0
        override val rowId get() = "act:${activity.id}"
    }
}

@Composable
fun MessageTimeline(
    messages: List<Message>,
    activities: List<ThreadActivity>,
    density: TranscriptDensity,
    accent: Color,
    modifier: Modifier = Modifier
) {
    val densityKind = if (density == TranscriptDensity.COMPACT)
        TranscriptDensityKind.COMPACT else TranscriptDensityKind.COMFORTABLE

    val horizontalPadding: Dp = if (densityKind == TranscriptDensityKind.COMPACT)
        T3Spacing.lg else T3Spacing.xl
    val itemSpacing: Dp = if (densityKind == TranscriptDensityKind.COMPACT)
        T3Spacing.sm else T3Spacing.md

    val rows = remember(messages, activities) {
        val activityRows: List<TimelineRow> = RenderableActivity
            .collapse(activities)
            .map { TimelineRow.ActivityRow(it) }
        val messageRows: List<TimelineRow> = messages.map { TimelineRow.MessageRow(it) }
        (activityRows + messageRows).sortedWith(
            compareBy({ it.sortKey }, { it.rank })
        )
    }

    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    val isAtBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val total = info.totalItemsCount
            if (total == 0) true
            else {
                val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf true
                last.index >= total - 1
            }
        }
    }

    LaunchedEffect(rows.size) {
        if (rows.isNotEmpty() && isAtBottom) {
            listState.scrollToItem(rows.size - 1)
        }
    }
    LaunchedEffect(messages.lastOrNull()?.text, messages.lastOrNull()?.streaming) {
        if (rows.isNotEmpty() && isAtBottom) {
            listState.scrollToItem(rows.size - 1)
        }
    }

    Box(modifier = modifier.fillMaxSize().background(T3Color.surfaceGrouped)) {
        if (rows.isEmpty()) {
            EmptyTimeline(accent = accent)
        } else {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(
                    start = horizontalPadding,
                    end = horizontalPadding,
                    top = T3Spacing.lg,
                    bottom = T3Spacing.xxl
                ),
                verticalArrangement = Arrangement.spacedBy(itemSpacing),
                modifier = Modifier.fillMaxSize()
            ) {
                items(items = rows, key = { it.rowId }) { row ->
                    when (row) {
                        is TimelineRow.MessageRow -> MessageBubble(
                            role = row.message.role,
                            text = row.message.text,
                            attachments = row.message.attachments,
                            isStreaming = row.message.streaming,
                            timestamp = row.message.createdAt,
                            density = densityKind,
                            accent = accent
                        )
                        is TimelineRow.ActivityRow -> ActivityRow(
                            activity = row.activity,
                            accent = accent
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = !isAtBottom && rows.isNotEmpty(),
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = T3Spacing.lg, bottom = T3Spacing.md)
        ) {
            JumpToLatestButton(
                accent = accent,
                isStreaming = messages.lastOrNull()?.streaming == true,
                onClick = {
                    scope.launch {
                        if (rows.isNotEmpty()) {
                            listState.animateScrollToItem(rows.size - 1)
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun JumpToLatestButton(accent: Color, isStreaming: Boolean, onClick: () -> Unit) {
    val label = if (isStreaming) "New message" else "Jump to latest"
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .padding(horizontal = T3Spacing.md, vertical = 8.dp)
            .clickable(onClick = onClick)
    ) {
        Icon(
            Icons.Outlined.ArrowDownward,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(13.dp)
        )
        Text(
            label,
            style = T3Typography.footnote.copy(fontWeight = FontWeight.Medium),
            color = accent
        )
    }
}

@Composable
private fun EmptyTimeline(accent: Color) {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = 96.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(T3Spacing.md)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(T3Radius.md))
                .background(T3Color.surfaceElevated)
                .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Outlined.AutoAwesome,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(22.dp)
            )
        }
        Text("Ready", style = T3Typography.headline, color = T3Color.textPrimary)
        Text(
            "Send a message to continue this thread.",
            style = T3Typography.callout,
            color = T3Color.textSecondary
        )
    }
}
