package com.belweave.trifecta.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
fun T3Theme(
    appearance: AppAppearance = AppAppearance.SYSTEM,
    accent: AppAccent = AppAccent.BLUE,
    content: @Composable () -> Unit
) {
    val isDark = when (appearance) {
        AppAppearance.SYSTEM -> isSystemInDarkTheme()
        AppAppearance.LIGHT -> false
        AppAppearance.DARK -> true
    }

    val accentColor = accent.colorFor(isDark)

    val colors = if (isDark) {
        darkColorScheme(
            primary = accentColor,
            onPrimary = Color.White,
            background = Color(0xFF09090A),
            surface = Color(0xFF09090A),
            surfaceVariant = Color(0xFF161618),
            onBackground = Color(0xFFF2F2F4),
            onSurface = Color(0xFFF2F2F4),
            onSurfaceVariant = Color(0xFFA8A8B0),
            outline = Color.White.copy(alpha = 0.11f)
        )
    } else {
        lightColorScheme(
            primary = accentColor,
            onPrimary = Color.White,
            background = Color.White,
            surface = Color.White,
            surfaceVariant = Color(0xFFF6F6F7),
            onBackground = Color(0xFF111114),
            onSurface = Color(0xFF111114),
            onSurfaceVariant = Color(0xFF565660),
            outline = Color.Black.copy(alpha = 0.12f)
        )
    }

    val typography = Typography(
        bodyLarge = T3Typography.body,
        bodyMedium = T3Typography.callout,
        bodySmall = T3Typography.footnote,
        titleLarge = T3Typography.title,
        titleMedium = T3Typography.headline,
        titleSmall = T3Typography.bodyEmphasis,
        labelLarge = T3Typography.caption,
        labelMedium = T3Typography.caption,
        labelSmall = T3Typography.caption
    )

    MaterialTheme(
        colorScheme = colors,
        typography = typography,
        content = content
    )
}
