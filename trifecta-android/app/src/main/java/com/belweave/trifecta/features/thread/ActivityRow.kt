package com.belweave.trifecta.features.thread

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.belweave.trifecta.core.models.ActivityIcon
import com.belweave.trifecta.core.models.ActivityTone
import com.belweave.trifecta.core.models.RenderableActivity
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography

@Composable
fun ActivityRow(
    activity: RenderableActivity,
    accent: Color
) {
    val tone = toneColor(activity.tone, accent)
    var expanded by remember(activity.id) { mutableStateOf(false) }
    val canExpand = hasExpansion(activity)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceElevated.copy(alpha = 0.6f))
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
    ) {
        Box(
            modifier = Modifier
                .padding(vertical = 6.dp)
                .width(2.5.dp)
                .fillMaxSize()
                .background(tone)
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
                .clickable(enabled = canExpand) { expanded = !expanded }
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
                verticalAlignment = Alignment.Top
            ) {
                IconBadge(activity = activity, tone = tone)

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = activity.title,
                        style = T3Typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                        color = T3Color.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    inlinePreview(activity)?.let { preview ->
                        Text(
                            text = preview,
                            style = if (activity.command != null)
                                T3Typography.caption.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            else T3Typography.caption,
                            color = T3Color.textSecondary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (canExpand) {
                    Icon(
                        if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        contentDescription = null,
                        tint = T3Color.textTertiary,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
            AnimatedVisibility(
                visible = expanded && canExpand,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Column(
                    modifier = Modifier.padding(top = T3Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)
                ) {
                    activity.command?.takeIf { it.isNotEmpty() }?.let {
                        Text(
                            text = it,
                            style = T3Typography.code,
                            color = T3Color.textPrimary,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(T3Radius.sm))
                                .background(T3Color.surfaceMuted)
                                .padding(horizontal = T3Spacing.sm, vertical = 6.dp)
                        )
                    }
                    if (activity.changedFiles.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            activity.changedFiles.forEach { file ->
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        Icons.Outlined.Description,
                                        contentDescription = null,
                                        tint = T3Color.textTertiary,
                                        modifier = Modifier.size(9.dp)
                                    )
                                    Text(
                                        text = file,
                                        style = T3Typography.caption.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                                        color = T3Color.textSecondary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                    expandableDetail(activity)?.let {
                        Text(
                            text = it,
                            style = T3Typography.footnote,
                            color = T3Color.textSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun IconBadge(activity: RenderableActivity, tone: Color) {
    Box(
        modifier = Modifier
            .size(22.dp)
            .clip(CircleShape)
            .background(tone.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center
    ) {
        if (activity.isInProgress) {
            CircularProgressIndicator(
                strokeWidth = 1.5.dp,
                color = tone,
                modifier = Modifier.size(11.dp)
            )
        } else {
            Icon(
                imageVector = iconVector(activity.icon),
                contentDescription = null,
                tint = tone,
                modifier = Modifier.size(11.dp)
            )
        }
    }
}

private fun iconVector(icon: ActivityIcon): ImageVector = when (icon) {
    ActivityIcon.TERMINAL -> Icons.Outlined.Terminal
    ActivityIcon.FILE_READ -> Icons.Outlined.Search
    ActivityIcon.FILE_EDIT -> Icons.Outlined.Edit
    ActivityIcon.TASK_PROGRESS -> Icons.Outlined.MoreHoriz
    ActivityIcon.TASK_DONE -> Icons.Outlined.CheckCircle
    ActivityIcon.SEARCH -> Icons.Outlined.Search
    ActivityIcon.GLOBE -> Icons.Outlined.Language
    ActivityIcon.TOOL -> Icons.Outlined.Build
    ActivityIcon.ERROR -> Icons.Outlined.ErrorOutline
    ActivityIcon.SPARKLES -> Icons.Outlined.AutoFixHigh
}

@Composable
private fun toneColor(tone: ActivityTone, accent: Color): Color = when (tone) {
    ActivityTone.INFO -> T3Color.textSecondary
    ActivityTone.TOOL -> accent
    ActivityTone.THINKING -> T3Color.warning
    ActivityTone.ERROR -> T3Color.danger
    ActivityTone.APPROVAL -> T3Color.warning
    ActivityTone.SUCCESS -> T3Color.success
}

private fun inlinePreview(a: RenderableActivity): String? {
    a.command?.takeIf { it.isNotEmpty() }?.let { return firstLine(it) }
    if (a.changedFiles.isNotEmpty()) {
        return if (a.changedFiles.size == 1) a.changedFiles[0]
        else "${a.changedFiles.size} files"
    }
    return a.detail?.takeIf { it.isNotEmpty() }?.let { firstLine(it) }
}

private fun firstLine(s: String): String =
    s.indexOf('\n').let { if (it < 0) s else s.substring(0, it) }

private fun hasExpansion(a: RenderableActivity): Boolean {
    if (!a.command.isNullOrEmpty()) return true
    if (a.changedFiles.isNotEmpty()) return true
    return expandableDetail(a) != null
}

private fun expandableDetail(a: RenderableActivity): String? {
    val d = a.detail ?: return null
    return if (d.contains('\n') || d.length > 80) d else null
}
