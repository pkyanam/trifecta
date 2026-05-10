package com.belweave.trifecta.core.networking

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * In-memory representation of an image attachment, ready to ship up to the
 * server in the `attachments` slot of a thread turn payload.
 */
data class UploadImage(
    val name: String,
    val mimeType: String,
    val sizeBytes: Int,
    val dataUrl: String
) {
    fun encoded(): JsonObject = buildJsonObject {
        put("type", "image")
        put("name", name)
        put("mimeType", mimeType)
        put("sizeBytes", sizeBytes)
        put("dataUrl", dataUrl)
    }
}
