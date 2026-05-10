package com.belweave.trifecta.core.networking

import android.util.Log
import com.belweave.trifecta.core.auth.PairingFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.net.URI
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Long-lived WebSocket connection to the T3 desktop server.
 *
 * Mirrors the iOS `T3Connection` actor: maintains a `ConnectionStatus` flow,
 * exposes inbound RPC frames as a hot SharedFlow, performs heartbeat pings,
 * and reconnects with exponential backoff + jitter.
 */
class T3Connection(initialConfig: Config) {

    sealed class ConnectionStatus {
        object Offline : ConnectionStatus()
        object Connecting : ConnectionStatus()
        object Connected : ConnectionStatus()
        data class Error(val message: String) : ConnectionStatus()
    }

    data class Config(
        val serverURL: URI,
        val bearerToken: String?
    )

    private val mutex = Mutex()
    private var config: Config = initialConfig
    private var socket: WebSocket? = null
    private var nextRequestNumber: Long = 1
    private var receiveJob: Job? = null
    private var heartbeatJob: Job? = null
    private var reconnectJob: Job? = null
    private var shouldAutoReconnect = false
    private var reconnectAttempt = 0
    private val pairingFlow = PairingFlow()

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(0, TimeUnit.SECONDS) // we manage heartbeats ourselves
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // long-lived ws
        .build()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _status = MutableStateFlow<ConnectionStatus>(ConnectionStatus.Offline)
    val status: StateFlow<ConnectionStatus> = _status.asStateFlow()

    private val _inbound = MutableSharedFlow<EffectRpcMessage>(
        replay = 0,
        extraBufferCapacity = 256,
        onBufferOverflow = BufferOverflow.SUSPEND
    )
    val inbound: Flow<EffectRpcMessage> = _inbound.asSharedFlow()

    suspend fun updateConfig(newConfig: Config) = mutex.withLock {
        config = newConfig
    }

    suspend fun nextRequestId(): String = mutex.withLock {
        val n = nextRequestNumber
        nextRequestNumber += 1
        n.toString()
    }

    suspend fun connect(): Boolean {
        mutex.withLock {
            shouldAutoReconnect = true
            reconnectAttempt = 0
            reconnectJob?.cancel()
            reconnectJob = null
        }
        return connectInternal()
    }

    suspend fun disconnect() {
        mutex.withLock {
            shouldAutoReconnect = false
            reconnectJob?.cancel()
            reconnectJob = null
        }
        teardownConnection(yieldOffline = true)
    }

    suspend fun shutdown() {
        disconnect()
        scope.cancel()
    }

    private suspend fun connectInternal(): Boolean {
        teardownConnection(yieldOffline = false)
        _status.value = ConnectionStatus.Connecting

        val cfg = mutex.withLock { config }

        val wsUrl = makeWebSocketURL(cfg.serverURL) ?: run {
            _status.value = ConnectionStatus.Error("Invalid server URL")
            scheduleReconnect()
            return false
        }

        val finalUrl = try {
            if (!cfg.bearerToken.isNullOrEmpty()) {
                val issued = pairingFlow.issueWebSocketToken(cfg.serverURL, cfg.bearerToken)
                addQueryParam(wsUrl, "wsToken", issued.token)
            } else {
                wsUrl
            }
        } catch (t: Throwable) {
            _status.value = ConnectionStatus.Error(formatThrowable(t))
            scheduleReconnect()
            return false
        }

        val requestBuilder = Request.Builder().url(finalUrl.toString())
        if (!cfg.bearerToken.isNullOrEmpty()) {
            requestBuilder.header("Authorization", "Bearer ${cfg.bearerToken}")
        }

        val openSignal = Channel<Result<Unit>>(capacity = 1)
        val listener = ConnectionListener(openSignal, this::handleIncoming, this::handleClosure)
        val newSocket = httpClient.newWebSocket(requestBuilder.build(), listener)
        mutex.withLock { socket = newSocket }

        val openResult = withTimeoutOrNull(10_000) { openSignal.receive() }
        if (openResult == null || openResult.isFailure) {
            val message = openResult?.exceptionOrNull()?.message ?: "Timed out waiting for WebSocket connection"
            mutex.withLock { socket = null }
            runCatching { newSocket.cancel() }
            _status.value = ConnectionStatus.Error(message)
            scheduleReconnect()
            return false
        }

        mutex.withLock { reconnectAttempt = 0 }
        startHeartbeat()
        _status.value = ConnectionStatus.Connected
        return true
    }

    private suspend fun teardownConnection(yieldOffline: Boolean) {
        mutex.withLock {
            receiveJob?.cancel()
            heartbeatJob?.cancel()
            receiveJob = null
            heartbeatJob = null
            socket?.cancel()
            socket = null
        }
        if (yieldOffline) _status.value = ConnectionStatus.Offline
    }

    private fun scheduleReconnect() {
        scope.launch {
            mutex.withLock {
                if (!shouldAutoReconnect) return@launch
                reconnectJob?.cancel()
                reconnectAttempt += 1
                val delayMs = backoffDelayMs(reconnectAttempt)
                reconnectJob = scope.launch {
                    delay(delayMs)
                    if (!isActive) return@launch
                    val want = mutex.withLock { shouldAutoReconnect }
                    if (want) connectInternal()
                }
            }
        }
    }

    private fun backoffDelayMs(attempt: Int): Long {
        val exponent = min(attempt - 1, 6).toDouble()
        val base = 1_000.0 * 2.0.pow(exponent)
        val capped = min(base, 30_000.0)
        val jitter = Random.nextDouble(0.0, 400.0)
        return (capped + jitter).toLong()
    }

    suspend fun send(messages: List<EffectRpcMessage>) {
        val current = mutex.withLock { socket } ?: throw T3Error.NotConnected
        for (message in messages) {
            val encoded = EffectRpcEncoder.encode(message)
            val ok = current.send(encoded)
            if (!ok) throw T3Error.RequestFailed("Failed to enqueue RPC message")
        }
    }

    private fun startHeartbeat() {
        scope.launch {
            mutex.withLock {
                heartbeatJob?.cancel()
                heartbeatJob = scope.launch {
                    while (isActive) {
                        delay(5_000)
                        try {
                            send(listOf(EffectRpcMessage.Ping))
                        } catch (t: Throwable) {
                            return@launch
                        }
                    }
                }
            }
        }
    }

    private fun handleIncoming(text: String) {
        scope.launch {
            val decoded = try {
                EffectRpcDecoder.decodeFrame(text)
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to decode RPC frame: ${t.message}")
                return@launch
            }
            for (message in decoded) {
                if (message is EffectRpcMessage.Ping) {
                    runCatching { send(listOf(EffectRpcMessage.Pong)) }
                } else {
                    _inbound.emit(message)
                }
            }
        }
    }

    private fun handleClosure(throwable: Throwable?, response: Response?) {
        scope.launch {
            mutex.withLock { socket = null }
            val message = formatClosure(throwable, response)
            _status.value = ConnectionStatus.Error(message)
            scheduleReconnect()
        }
    }

    private fun makeWebSocketURL(server: URI): URI? {
        val scheme = when (server.scheme?.lowercase()) {
            "http" -> "ws"
            "https" -> "wss"
            "ws", "wss" -> server.scheme
            else -> return null
        }
        val host = server.host ?: return null
        val port = if (server.port == -1) -1 else server.port
        return URI(scheme, null, host, port, "/ws", null, null)
    }

    private fun addQueryParam(url: URI, key: String, value: String): URI {
        val rawQuery = url.rawQuery
        val filtered = rawQuery
            ?.split('&')
            ?.filter { it.isNotEmpty() && !it.startsWith("$key=") }
            ?: emptyList()
        val newPair = "$key=" + java.net.URLEncoder.encode(value, "UTF-8")
        val combined = (filtered + newPair).joinToString("&")
        return URI(
            url.scheme,
            url.userInfo,
            url.host,
            url.port,
            url.path,
            combined,
            url.fragment
        )
    }

    private fun formatThrowable(t: Throwable): String =
        t.message?.takeIf { it.isNotBlank() } ?: (t::class.simpleName ?: "Unknown error")

    private fun formatClosure(throwable: Throwable?, response: Response?): String {
        val parts = mutableListOf<String>()
        throwable?.message?.takeIf { it.isNotBlank() }?.let(parts::add)
        response?.let { parts.add("HTTP ${it.code}") }
        if (parts.isEmpty()) parts.add("WebSocket connection lost")
        return parts.joinToString(" · ")
    }

    private class ConnectionListener(
        private val openSignal: Channel<Result<Unit>>,
        private val onMessage: (String) -> Unit,
        private val onClosure: (Throwable?, Response?) -> Unit
    ) : WebSocketListener() {
        @Volatile
        private var didOpen = false

        override fun onOpen(webSocket: WebSocket, response: Response) {
            didOpen = true
            openSignal.trySend(Result.success(Unit))
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            onMessage(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            onMessage(bytes.utf8())
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (!didOpen) {
                openSignal.trySend(Result.failure(t))
            }
            onClosure(t, response)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (!didOpen) {
                openSignal.trySend(Result.failure(T3Error.RequestFailed("WebSocket closed before opening")))
            }
            onClosure(null, null)
        }
    }

    companion object {
        private const val TAG = "T3Connection"
    }
}
