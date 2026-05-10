package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.UUID

enum class MessageRole(val raw: String) {
    USER("user"),
    ASSISTANT("assistant"),
    SYSTEM("system");

    companion object {
        fun fromRaw(raw: String?): MessageRole =
            values().firstOrNull { it.raw == raw } ?: USER
    }
}

data class ChatImageAttachment(
    val id: String = UUID.randomUUID().toString(),
    val type: String = "image",
    val name: String = "",
    val mimeType: String = "image/jpeg",
    val sizeBytes: Long = 0,
    val dataUrl: String? = null,
    val url: String? = null
) {
    companion object {
        fun fromJson(obj: JsonObject?): ChatImageAttachment? {
            if (obj == null) return null
            return ChatImageAttachment(
                id = obj.str("id") ?: UUID.randomUUID().toString(),
                type = obj.str("type") ?: "image",
                name = obj.str("name") ?: "",
                mimeType = obj.str("mimeType") ?: "image/jpeg",
                sizeBytes = obj.longAt("sizeBytes") ?: 0L,
                dataUrl = obj.str("dataUrl") ?: obj.str("dataURL"),
                url = obj.str("url")
            )
        }
    }
}

data class Message(
    val id: MessageID,
    val role: MessageRole,
    var text: String,
    var attachments: List<ChatImageAttachment>? = null,
    val turnId: TurnID? = null,
    var streaming: Boolean = false,
    val createdAt: Instant,
    var updatedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): Message? {
            val id = obj.str("id")?.let { MessageID(it) } ?: return null
            val role = MessageRole.fromRaw(obj.str("role"))
            val text = obj.str("text") ?: ""
            val attachments = obj.arr("attachments")
                ?.mapNotNull { ChatImageAttachment.fromJson(it.asObjectOrNull()) }
            val turnId = obj.str("turnId")?.let { TurnID(it) }
            val streaming = obj.bool("streaming") ?: false
            val createdAt = Iso8601.parse(obj.str("createdAt")) ?: Instant.now()
            val updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: createdAt
            return Message(
                id = id,
                role = role,
                text = text,
                attachments = attachments,
                turnId = turnId,
                streaming = streaming,
                createdAt = createdAt,
                updatedAt = updatedAt
            )
        }
    }
}
