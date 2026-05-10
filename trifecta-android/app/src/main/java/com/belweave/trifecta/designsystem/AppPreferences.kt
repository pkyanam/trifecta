package com.belweave.trifecta.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

enum class AppAppearance(val raw: String, val label: String) {
    SYSTEM("system", "System"),
    LIGHT("light", "Light"),
    DARK("dark", "Dark");

    companion object {
        fun fromRaw(raw: String?): AppAppearance =
            values().firstOrNull { it.raw == raw } ?: SYSTEM
    }
}

enum class AppAccent(val raw: String, val label: String) {
    BLUE("blue", "Blue"),
    VIOLET("violet", "Violet"),
    GREEN("green", "Green"),
    ORANGE("orange", "Orange");

    fun colorFor(isDark: Boolean): Color = when (this) {
        BLUE -> if (isDark) Color(0xFF4F6BED) else Color(0xFF4155C7)
        VIOLET -> if (isDark) Color(0xFF8F78F5) else Color(0xFF694FD1)
        GREEN -> if (isDark) Color(0xFF2EC285) else Color(0xFF0D855C)
        ORANGE -> if (isDark) Color(0xFFF0852E) else Color(0xFFCC5C14)
    }

    val color: Color
        @Composable @ReadOnlyComposable
        get() = colorFor(isSystemInDarkTheme())

    companion object {
        fun fromRaw(raw: String?): AppAccent =
            values().firstOrNull { it.raw == raw } ?: BLUE

        @Composable
        @ReadOnlyComposable
        fun colorFor(raw: String?): Color = fromRaw(raw).color
    }
}

enum class TranscriptDensity(val raw: String, val label: String) {
    COMPACT("compact", "Compact"),
    COMFORTABLE("comfortable", "Comfort");

    companion object {
        fun fromRaw(raw: String?): TranscriptDensity =
            values().firstOrNull { it.raw == raw } ?: COMFORTABLE
    }
}

enum class ComposerSize(val raw: String, val label: String, val maxLines: Int) {
    COMPACT("compact", "Compact", 3),
    COMFORTABLE("comfortable", "Comfort", 5),
    EXPANDED("expanded", "Expanded", 8);

    companion object {
        fun fromRaw(raw: String?): ComposerSize =
            values().firstOrNull { it.raw == raw } ?: COMFORTABLE
    }
}
