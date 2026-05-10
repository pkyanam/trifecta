package com.belweave.trifecta.core.networking

import com.belweave.trifecta.core.models.T3Json
import com.belweave.trifecta.core.models.asArrayOrNull
import com.belweave.trifecta.core.models.asObjectOrNull
import com.belweave.trifecta.core.models.bool
import com.belweave.trifecta.core.models.intAt
import com.belweave.trifecta.core.models.obj
import com.belweave.trifecta.core.models.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * Effect-style RPC wire protocol used by the Trifecta desktop server.
 * Mirrors the iOS `EffectRPCMessage` shape so a single message gets
 * encoded as a single-message JSON object (not an array).
 */
sealed class EffectRpcMessage {
    abstract val isOutbound: Boolean

    data class Request(
        val id: String,
        val tag: String,
        val payload: JsonElement,
        val headers: List<List<String>> = emptyList()
    ) : EffectRpcMessage() {
        override val isOutbound: Boolean = true
    }

    data class StreamRequest(
        val id: String,
        val tag: String,
        val payload: JsonElement,
        val headers: List<List<String>> = emptyList()
    ) : EffectRpcMessage() {
        override val isOutbound: Boolean = true
    }

    data class Interrupt(val requestId: String, val interruptors: List<String>) : EffectRpcMessage() {
        override val isOutbound: Boolean = true
    }

    data class Ack(val requestId: String) : EffectRpcMessage() {
        override val isOutbound: Boolean = true
    }

    object Ping : EffectRpcMessage() { override val isOutbound: Boolean = true }
    object Pong : EffectRpcMessage() { override val isOutbound: Boolean = true }
    object Eof : EffectRpcMessage() { override val isOutbound: Boolean = true }

    data class Chunk(val requestId: String, val values: List<JsonElement>) : EffectRpcMessage() {
        override val isOutbound: Boolean = false
    }

    data class Exit(
        val requestId: String,
        val success: Boolean,
        val value: JsonElement?,
        val errorTag: String?,
        val errorMessage: String?
    ) : EffectRpcMessage() {
        override val isOutbound: Boolean = false
    }

    data class Defect(val message: String) : EffectRpcMessage() {
        override val isOutbound: Boolean = false
    }

    data class Unknown(val raw: JsonElement) : EffectRpcMessage() {
        override val isOutbound: Boolean = false
    }
}

object EffectRpcEncoder {
    fun encode(message: EffectRpcMessage): String =
        T3Json.encodeToString(JsonElement.serializer(), encodeOne(message))

    private fun encodeOne(msg: EffectRpcMessage): JsonElement = when (msg) {
        is EffectRpcMessage.Request -> buildJsonObject {
            put("_tag", "Request")
            put("id", msg.id)
            put("tag", msg.tag)
            put("payload", msg.payload)
            put("headers", buildJsonArray {
                msg.headers.forEach { entry ->
                    add(buildJsonArray { entry.forEach { add(JsonPrimitive(it)) } })
                }
            })
            put("spanId", randomHex(16))
            put("traceId", randomHex(32))
            put("sampled", false)
        }
        is EffectRpcMessage.StreamRequest -> buildJsonObject {
            put("_tag", "Request")
            put("id", msg.id)
            put("tag", msg.tag)
            put("payload", msg.payload)
            put("headers", buildJsonArray {
                msg.headers.forEach { entry ->
                    add(buildJsonArray { entry.forEach { add(JsonPrimitive(it)) } })
                }
            })
            put("spanId", randomHex(16))
            put("traceId", randomHex(32))
            put("sampled", false)
        }
        is EffectRpcMessage.Interrupt -> buildJsonObject {
            put("_tag", "Interrupt")
            put("requestId", msg.requestId)
            put("interruptors", buildJsonArray { msg.interruptors.forEach { add(JsonPrimitive(it)) } })
        }
        is EffectRpcMessage.Ack -> buildJsonObject {
            put("_tag", "Ack")
            put("requestId", msg.requestId)
        }
        EffectRpcMessage.Ping -> buildJsonObject { put("_tag", "Ping") }
        EffectRpcMessage.Pong -> buildJsonObject { put("_tag", "Pong") }
        EffectRpcMessage.Eof -> buildJsonObject { put("_tag", "Eof") }
        else -> buildJsonObject { }
    }

    private fun randomHex(count: Int): String =
        UUID.randomUUID().toString().replace("-", "").lowercase().take(count)
}

object EffectRpcDecoder {
    fun decodeFrame(text: String): List<EffectRpcMessage> {
        val element = T3Json.parseToJsonElement(text)
        val array = element.asArrayOrNull()
        return if (array != null) array.map(::decodeOne) else listOf(decodeOne(element))
    }

    private fun decodeOne(element: JsonElement): EffectRpcMessage {
        val obj = element.asObjectOrNull() ?: return EffectRpcMessage.Unknown(element)
        return when (obj.str("_tag")) {
            "Ping" -> EffectRpcMessage.Ping
            "Pong" -> EffectRpcMessage.Pong
            "Chunk" -> {
                val id = obj.str("requestId") ?: ""
                val values = obj["values"]?.asArrayOrNull() ?: JsonArray(emptyList())
                EffectRpcMessage.Chunk(id, values.toList())
            }
            "Exit" -> {
                val id = obj.str("requestId") ?: ""
                val exit = obj.obj("exit") ?: JsonObject(emptyMap())
                val exitTag = exit.str("_tag") ?: "Failure"
                if (exitTag == "Success") {
                    EffectRpcMessage.Exit(
                        requestId = id,
                        success = true,
                        value = exit["value"],
                        errorTag = null,
                        errorMessage = null
                    )
                } else {
                    val cause = exit.obj("cause") ?: JsonObject(emptyMap())
                    val error = cause.obj("error")
                    val errorMessage = error?.str("message")
                        ?: cause.str("defect")
                        ?: "Server error"
                    val errorTag = error?.str("_tag")
                    EffectRpcMessage.Exit(
                        requestId = id,
                        success = false,
                        value = null,
                        errorTag = errorTag,
                        errorMessage = errorMessage
                    )
                }
            }
            "Defect" -> EffectRpcMessage.Defect(obj.str("defect") ?: "Unknown server defect")
            "ClientProtocolError" -> EffectRpcMessage.Defect(obj.str("error") ?: "Client protocol error")
            else -> EffectRpcMessage.Unknown(element)
        }
    }
}
