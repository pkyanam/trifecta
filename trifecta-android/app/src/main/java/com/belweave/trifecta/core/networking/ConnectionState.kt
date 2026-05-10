package com.belweave.trifecta.core.networking

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.belweave.trifecta.designsystem.T3Color

/**
 * Public connection-status surface mirrored from the iOS `ConnectionState` enum.
 * UI code observes this; `ConnectionStatus` (in T3Connection) is the lower-level
 * actor-state and gets adapted into this for presentation.
 */
sealed class ConnectionState {
    object Offline : ConnectionState()
    object Connecting : ConnectionState()
    object Connected : ConnectionState()
    data class Error(val message: String) : ConnectionState()

    val label: String
        get() = when (this) {
            Offline -> "Offline"
            Connecting -> "Connecting"
            Connected -> "Connected"
            is Error -> "Error"
        }

    val detail: String?
        get() = when (this) {
            is Error -> message.ifBlank { "Unknown connection error" }
            else -> null
        }

    @Composable
    fun tint(): Color = when (this) {
        Offline -> T3Color.textTertiary
        Connecting -> T3Color.warning
        Connected -> T3Color.success
        is Error -> T3Color.danger
    }
}
