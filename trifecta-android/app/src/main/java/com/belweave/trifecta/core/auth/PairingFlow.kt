package com.belweave.trifecta.core.auth

import com.belweave.trifecta.core.models.EnvironmentDescriptor
import com.belweave.trifecta.core.models.T3Json
import com.belweave.trifecta.core.models.asObjectOrNull
import com.belweave.trifecta.core.models.str
import com.belweave.trifecta.core.networking.T3Error
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URI
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Performs the bearer-token pairing dance against a T3 server.
 * Mirrors `PairingFlow.swift` 1:1 in shape and error semantics.
 */
class PairingFlow(private val httpClient: OkHttpClient = defaultClient()) {

    data class WebSocketToken(val token: String)
    data class PairingResult(val bearerToken: String)

    suspend fun fetchEnvironment(serverURL: URI): EnvironmentDescriptor =
        withContext(Dispatchers.IO) {
            val url = serverBaseURL(serverURL).toHttpUrlOrNull()
                ?.newBuilder()
                ?.addPathSegments(".well-known/belweave/environment")
                ?.build()
                ?: throw T3Error.PairingFailed("Invalid server URL")

            val request = Request.Builder().url(url).get().build()
            httpClient.executeAsync(request).use { response ->
                if (!response.isSuccessful) {
                    throw T3Error.PairingFailed(
                        "Environment request failed with status ${response.code}: ${errorBody(response)}"
                    )
                }
                val body = response.body?.string().orEmpty()
                EnvironmentDescriptor.decodeLenient(body)
                    ?: throw T3Error.PairingFailed("Invalid environment descriptor")
            }
        }

    suspend fun exchangeToken(serverURL: URI, oneTimeToken: String): PairingResult =
        withContext(Dispatchers.IO) {
            val url = serverBaseURL(serverURL).toHttpUrlOrNull()
                ?.newBuilder()
                ?.addPathSegments("api/auth/bootstrap/bearer")
                ?.build()
                ?: throw T3Error.PairingFailed("Invalid server URL")

            val payload = buildJsonObject { put("credential", oneTimeToken) }
            val body = T3Json.encodeToString(JsonObject.serializer(), payload)
                .toRequestBody(JSON_MEDIA)
            val request = Request.Builder().url(url).post(body).build()

            httpClient.executeAsync(request).use { response ->
                if (response.code == 401 || response.code == 403) {
                    throw T3Error.PairingFailed("Pairing token rejected: ${errorBody(response)}")
                }
                if (!response.isSuccessful) {
                    throw T3Error.PairingFailed(
                        "Pairing failed with status ${response.code}: ${errorBody(response)}"
                    )
                }
                val text = response.body?.string().orEmpty()
                val obj = T3Json.parseToJsonElement(text).asObjectOrNull()
                val token = obj?.str("sessionToken")
                    ?: obj?.str("token")
                    ?: obj?.str("bearer")
                if (token.isNullOrBlank()) {
                    throw T3Error.PairingFailed("Pairing response did not include a bearer session token")
                }
                PairingResult(token.trim())
            }
        }

    suspend fun issueWebSocketToken(serverURL: URI, bearerToken: String): WebSocketToken =
        withContext(Dispatchers.IO) {
            val url = serverBaseURL(serverURL).toHttpUrlOrNull()
                ?.newBuilder()
                ?.addPathSegments("api/auth/ws-token")
                ?.build()
                ?: throw T3Error.PairingFailed("Invalid server URL")

            val request = Request.Builder()
                .url(url)
                .post(EMPTY_BODY)
                .header("Authorization", "Bearer $bearerToken")
                .build()

            httpClient.executeAsync(request).use { response ->
                if (!response.isSuccessful) {
                    throw T3Error.PairingFailed(
                        "WebSocket token request failed with status ${response.code}: ${errorBody(response)}"
                    )
                }
                val text = response.body?.string().orEmpty()
                val token = T3Json.parseToJsonElement(text).asObjectOrNull()?.str("token")
                if (token.isNullOrBlank()) {
                    throw T3Error.PairingFailed("WebSocket token response was invalid")
                }
                WebSocketToken(token.trim())
            }
        }

    private fun errorBody(response: Response): String {
        val text = response.body?.string()?.trim().orEmpty()
        if (text.isEmpty()) return "empty response"
        val obj = runCatching { T3Json.parseToJsonElement(text).asObjectOrNull() }.getOrNull()
        return obj?.str("error")?.takeIf { it.isNotBlank() } ?: text
    }

    companion object {
        private val JSON_MEDIA = "application/json".toMediaType()
        private val EMPTY_BODY = ByteArray(0).toRequestBody(JSON_MEDIA)

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()

        fun serverBaseURL(url: URI): URI {
            val scheme = url.scheme ?: return url
            val host = url.host ?: return url
            val port = if (url.port == -1) -1 else url.port
            val rawPath = url.rawPath.orEmpty().trimEnd('/')
            val basePath = when {
                rawPath == "/pair" -> null
                rawPath.endsWith("/pair") -> rawPath.removeSuffix("/pair").takeIf { it.isNotEmpty() }
                rawPath.isNotEmpty() -> rawPath
                else -> null
            }
            return URI(scheme, null, host, port, basePath, null, null)
        }

        /**
         * Parses pairing URLs of the form:
         *   trifecta://pair?host=https://server&token=...
         *   https://server/pair#token=...
         *   trifecta://server?token=...
         */
        fun parsePairingURL(raw: String): Pair<URI, String>? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null

            val queryParams = parseQuery(uri.rawQuery)
            val fragmentParams = parseQuery(uri.rawFragment)

            queryParams["host"]?.let { hostRaw ->
                val backend = runCatching { URI(hostRaw) }.getOrNull()
                val token = parseToken(queryParams, fragmentParams)
                if (backend != null && token != null) {
                    return serverBaseURL(backend) to token
                }
            }

            val token = parseToken(queryParams, fragmentParams)
            val scheme = uri.scheme
            val host = uri.host
            if (token != null && scheme != null && host != null) {
                return serverBaseURL(uri) to token
            }
            return null
        }

        private fun parseToken(query: Map<String, String>, fragment: Map<String, String>): String? {
            val fromFragment = fragment["token"]?.trim()?.takeIf { it.isNotEmpty() }
            if (fromFragment != null) return fromFragment
            return query["token"]?.trim()?.takeIf { it.isNotEmpty() }
        }

        private fun parseQuery(raw: String?): Map<String, String> {
            if (raw.isNullOrEmpty()) return emptyMap()
            return raw.split('&').mapNotNull { pair ->
                val idx = pair.indexOf('=')
                if (idx < 0) return@mapNotNull null
                val key = decode(pair.substring(0, idx))
                val value = decode(pair.substring(idx + 1))
                key to value
            }.toMap()
        }

        private fun decode(text: String): String =
            runCatching { java.net.URLDecoder.decode(text, "UTF-8") }.getOrDefault(text)
    }
}

/** Bridge OkHttp's blocking `execute` into a coroutine-friendly cancellable suspend call. */
private suspend fun OkHttpClient.executeAsync(request: Request): Response =
    suspendCancellableCoroutine { cont ->
        val call = newCall(request)
        cont.invokeOnCancellation { runCatching { call.cancel() } }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resumeWithException(e)
            }
            override fun onResponse(call: Call, response: Response) {
                if (cont.isActive) cont.resume(response)
            }
        })
    }
