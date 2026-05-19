package com.belweave.trifecta.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable

@Composable
fun T3Card(
    modifier: Modifier = Modifier,
    padding: Dp = T3Spacing.lg,
    radius: Dp = T3Radius.lg,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .t3AdaptiveRoundedRectGlass(
                cornerRadius = radius,
                tint = t3GlassTint()
            )
            .padding(padding)
    ) {
        content()
    }
}

@Composable
fun T3SectionHeader(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title.uppercase(),
        style = T3Typography.caption.copy(
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.6.sp
        ),
        color = T3Color.textTertiary,
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
fun T3Pill(
    text: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    tint: Color = T3Color.textSecondary,
    emphasized: Boolean = false
) {
    val foreground = if (emphasized) tint else T3Color.textTertiary
    val background = if (emphasized) tint.copy(alpha = 0.16f) else T3Color.surfaceElevated
    val border = if (emphasized) tint.copy(alpha = 0.30f) else T3Color.separator
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .t3AdaptiveCapsuleGlass(
                tint = background,
                stroke = border
            )
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = foreground,
                modifier = Modifier.size(10.dp).padding(end = 4.dp)
            )
        }
        Text(
            text = text,
            style = T3Typography.caption.copy(
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.4.sp
            ),
            color = foreground
        )
    }
}

@Composable
fun T3ToolbarChip(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 34.dp,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .size(size)
            .t3AdaptiveRoundedRectGlass(
                cornerRadius = T3Radius.md,
                tint = t3GlassTint()
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

@Composable
fun T3WordmarkLabel(
    size: Int = 17,
    showsAlpha: Boolean = true,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Trifecta",
            style = T3Typography.title.copy(fontSize = size.sp, fontWeight = FontWeight.Bold),
            color = T3Color.textPrimary
        )
        if (showsAlpha) {
            Box(modifier = Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .t3AdaptiveCapsuleGlass(
                        tint = t3GlassTint(),
                        stroke = T3Color.separator
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "ALPHA",
                    style = T3Typography.caption.copy(
                        fontSize = (size - 7).coerceAtLeast(9).sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.4.sp
                    ),
                    color = T3Color.textTertiary
                )
            }
        }
    }
}

@Composable
fun T3Divider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(T3Color.separator)
    )
}
