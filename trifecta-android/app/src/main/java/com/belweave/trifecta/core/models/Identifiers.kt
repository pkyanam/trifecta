package com.belweave.trifecta.core.models

import kotlinx.serialization.Serializable
import java.util.UUID

@JvmInline
@Serializable
value class ThreadID(val rawValue: String) {
    companion object {
        fun new(): ThreadID = ThreadID(UUID.randomUUID().toString().lowercase())
    }
}

@JvmInline
@Serializable
value class ProjectID(val rawValue: String)

@JvmInline
@Serializable
value class MessageID(val rawValue: String) {
    companion object {
        fun newClientID(): MessageID = MessageID(UUID.randomUUID().toString().lowercase())
    }
}

@JvmInline
@Serializable
value class TurnID(val rawValue: String)

@JvmInline
@Serializable
value class CommandID(val rawValue: String) {
    companion object {
        fun new(): CommandID = CommandID(UUID.randomUUID().toString().lowercase())
    }
}

@JvmInline
@Serializable
value class ProviderInstanceID(val rawValue: String)
