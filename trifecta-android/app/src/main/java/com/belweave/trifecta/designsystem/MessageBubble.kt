package com.belweave.trifecta.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.belweave.trifecta.core.models.ChatImageAttachment
import com.belweave.trifecta.core.models.MessageRole
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class TranscriptDensityKind { COMPACT, COMFORTABLE }

@Composable
fun MessageBubble(
    role: MessageRole,
    text: String,
    attachments: List<ChatImageAttachment>?,
    isStreaming: Boolean,
    timestamp: Instant,
    density: TranscriptDensityKind,
    accent: Color,
    modifier: Modifier = Modifier
) {
    val horizontalPadding: Dp = if (density == TranscriptDensityKind.COMPACT) T3Spacing.md else T3Spacing.lg
    val verticalPadding: Dp = if (density == TranscriptDensityKind.COMPACT) T3Spacing.md else T3Spacing.lg
    val textStyle: TextStyle = run {
        if (density == TranscriptDensityKind.COMPACT) {
            if (text.contains("\n")) T3Typography.footnote else T3Typography.callout
        } else {
            if (text.contains("\n")) T3Typography.callout else T3Typography.body
        }
    }
    val backgroundColor = if (role == MessageRole.USER) T3Color.surfaceMuted else T3Color.surfaceElevated

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.lg))
            .background(backgroundColor)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.lg))
            .padding(horizontal = horizontalPadding, vertical = verticalPadding)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
            if (role != MessageRole.USER) {
                RoleHeader(role = role, accent = accent)
            }

            if (!attachments.isNullOrEmpty()) {
                AttachmentStrip(items = attachments)
            }

            if (text.isNotEmpty()) {
                if (role == MessageRole.USER) {
                    Text(
                        text = text,
                        style = textStyle,
                        color = T3Color.textPrimary,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    MarkdownText(
                        source = text,
                        baseStyle = textStyle,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (isStreaming) {
                StreamingDots(modifier = Modifier.padding(top = T3Spacing.xs))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Text(
                    text = formatTime(timestamp),
                    style = T3Typography.footnote,
                    color = T3Color.textTertiary
                )
            }
        }
    }
}

@Composable
private fun RoleHeader(role: MessageRole, accent: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(
                    when (role) {
                        MessageRole.SYSTEM -> T3Color.textTertiary
                        MessageRole.ASSISTANT -> accent
                        MessageRole.USER -> T3Color.textSecondary
                    }
                )
        )
        Text(
            text = when (role) {
                MessageRole.SYSTEM -> "SYSTEM"
                MessageRole.ASSISTANT -> "TRIFECTA"
                MessageRole.USER -> "YOU"
            },
            style = T3Typography.caption.copy(letterSpacing = 0.4.sp),
            color = T3Color.textSecondary
        )
    }
}

@Composable
private fun AttachmentStrip(items: List<ChatImageAttachment>) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        items(items) { att ->
            AttachmentThumb(att)
        }
    }
}

@Composable
private fun AttachmentThumb(att: ChatImageAttachment) {
    val source: Any? = att.url ?: att.dataUrl
    Box(
        modifier = Modifier
            .size(width = 160.dp, height = 120.dp)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceMuted),
        contentAlignment = Alignment.Center
    ) {
        if (source != null) {
            AsyncImage(
                model = source,
                contentDescription = att.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(120.dp)
            )
        } else {
            Text("📷", style = T3Typography.body, color = T3Color.textTertiary)
        }
    }
}

private val timeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault()).withZone(ZoneId.systemDefault())

private fun formatTime(instant: Instant): String = timeFormatter.format(instant)
