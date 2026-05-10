package com.belweave.trifecta.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

object T3Color {
    val onPrimary: Color = Color.White

    val primary: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFF4155C7),
            dark = Color(0xFF4F6BED)
        )

    val success: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFF0D9E6B),
            dark = Color(0xFF2EC68C)
        )

    val warning: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFFF59E12),
            dark = Color(0xFFFCBC36)
        )

    val danger: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFFDB3345),
            dark = Color(0xFFFA5762)
        )

    val surface: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color.White,
            dark = Color(0xFF09090A)
        )

    val surfaceElevated: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFFF6F6F7),
            dark = Color(0xFF161618)
        )

    val surfaceMuted: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFFECECEF),
            dark = Color(0xFF202023)
        )

    val surfaceGrouped: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFFF2F2F5),
            dark = Color.Black
        )

    val textPrimary: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFF111114),
            dark = Color(0xFFF2F2F4)
        )

    val textSecondary: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFF565660),
            dark = Color(0xFFA8A8B0)
        )

    val textTertiary: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color(0xFF8B8B95),
            dark = Color(0xFF6E6E78)
        )

    val separator: Color
        @Composable @ReadOnlyComposable
        get() = byMode(
            light = Color.Black.copy(alpha = 0.12f),
            dark = Color.White.copy(alpha = 0.11f)
        )
}

@Composable
@ReadOnlyComposable
internal fun byMode(light: Color, dark: Color): Color =
    if (isSystemInDarkTheme()) dark else light
