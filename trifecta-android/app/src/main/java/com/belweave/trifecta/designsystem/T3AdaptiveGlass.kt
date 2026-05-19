package com.belweave.trifecta.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
@ReadOnlyComposable
fun t3GlassTint(accentHighlight: Color? = null): Color {
    if (accentHighlight != null) return accentHighlight
    return if (isSystemInDarkTheme()) {
        T3Color.surfaceElevated.copy(alpha = 0.58f)
    } else {
        Color.White.copy(alpha = 0.62f)
    }
}

@Composable
fun Modifier.t3AdaptiveGlass(
    shape: Shape,
    tint: Color = t3GlassTint(),
    stroke: Color = T3Color.separator,
    strokeWidth: Dp = 0.5.dp
): Modifier {
    return this
        .clip(shape)
        .background(tint, shape)
        .border(strokeWidth, stroke, shape)
}

@Composable
fun Modifier.t3AdaptiveRoundedRectGlass(
    cornerRadius: Dp,
    tint: Color = t3GlassTint(),
    stroke: Color = T3Color.separator
): Modifier = t3AdaptiveGlass(
    shape = RoundedCornerShape(cornerRadius),
    tint = tint,
    stroke = stroke
)

@Composable
fun Modifier.t3AdaptiveCapsuleGlass(
    tint: Color = t3GlassTint(),
    stroke: Color = T3Color.separator
): Modifier = t3AdaptiveGlass(
    shape = RoundedCornerShape(percent = 50),
    tint = tint,
    stroke = stroke
)

@Composable
fun Modifier.t3AdaptiveCircleGlass(
    tint: Color = t3GlassTint(),
    stroke: Color = T3Color.separator
): Modifier = t3AdaptiveGlass(
    shape = CircleShape,
    tint = tint,
    stroke = stroke
)
