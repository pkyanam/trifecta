package com.belweave.trifecta.features.thread

import android.content.ContentResolver
import android.net.Uri
import android.util.Base64
import com.belweave.trifecta.core.networking.UploadImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.util.UUID

data class LocalAttachment(
    val id: String,
    val upload: UploadImage,
    val previewBytes: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is LocalAttachment) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()
}

suspend fun loadImageAttachment(
    contentResolver: ContentResolver,
    uri: Uri
): LocalAttachment? = withContext(Dispatchers.IO) {
    runCatching {
        val mime = contentResolver.getType(uri) ?: "image/jpeg"
        val bytes = contentResolver.openInputStream(uri)?.use { input ->
            val out = ByteArrayOutputStream()
            input.copyTo(out)
            out.toByteArray()
        } ?: return@runCatching null
        val ext = mime.substringAfter('/', missingDelimiterValue = "jpg")
            .takeIf { it.isNotEmpty() } ?: "jpg"
        val name = "image-${UUID.randomUUID().toString().take(6)}.$ext"
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val dataUrl = "data:$mime;base64,$base64"
        LocalAttachment(
            id = UUID.randomUUID().toString(),
            upload = UploadImage(
                name = name,
                mimeType = mime,
                sizeBytes = bytes.size,
                dataUrl = dataUrl
            ),
            previewBytes = bytes
        )
    }.getOrNull()
}
