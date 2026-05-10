package com.belweave.trifecta.core.networking

import android.util.Log
import com.belweave.trifecta.core.models.ApprovalDecision
import com.belweave.trifecta.core.models.ApprovalRequestID
import com.belweave.trifecta.core.models.CommandID
import com.belweave.trifecta.core.models.Iso8601
import com.belweave.trifecta.core.models.MessageID
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProjectSearchEntriesResult
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.RuntimeMode
import com.belweave.trifecta.core.models.ServerRuntimeConfig
import com.belweave.trifecta.core.models.ShellStreamItem
import com.belweave.trifecta.core.models.T3Json
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.core.models.ThreadStreamItem
import com.belweave.trifecta.core.models.TurnID
import com.belweave.trifecta.core.models.VcsPullSummary
import com.belweave.trifecta.core.models.VcsStatusSummary
import com.belweave.trifecta.core.models.asObjectOrNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * High-level T3 RPC client. Wraps [T3Connection] and adds:
 *  - typed request / response (`request`)
 *  - subscription / chunked-stream demuxing (`subscribe`)
 *  - automatic resubscribe on reconnect
 *  - convenience helpers for orchestration commands.
 */
class T3Client(private val connection: T3Connection) {

    private val mutex = Mutex()
    private val pendingResponses: MutableMap<String, Pending<JsonElement?>> = mutableMapOf()
    private val streamSubscribers: MutableMap<String, (JsonElement) -> Unit> = mutableMapOf()
    private val subscriptionTemplates: MutableMap<String, SubscriptionTemplate> = mutableMapOf()
    private val statusListeners = mutableListOf<(T3Connection.ConnectionStatus) -> Unit>()

    @Volatile private var lastStatus: T3Connection.ConnectionStatus = T3Connection.ConnectionStatus.Offline

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var inboundJob: Job? = null
    private var statusJob: Job? = null

    suspend fun start(): Boolean {
        inboundJob = scope.launch {
            connection.inbound.collect { handle(it) }
        }
        statusJob = scope.launch {
            connection.status.collect { onStatus(it) }
        }
        return connection.connect()
    }

    suspend fun stop() {
        inboundJob?.cancel()
        statusJob?.cancel()
        inboundJob = null
        statusJob = null
        connection.disconnect()
        mutex.withLock {
            pendingResponses.values.forEach { it.completeException(T3Error.NotConnected) }
            pendingResponses.clear()
            streamSubscribers.clear()
            subscriptionTemplates.clear()
        }
    }

    fun addStatusListener(listener: (T3Connection.ConnectionStatus) -> Unit) {
        statusListeners.add(listener)
        listener(lastStatus)
    }

    private suspend fun onStatus(status: T3Connection.ConnectionStatus) {
        val wasConnected = (lastStatus is T3Connection.ConnectionStatus.Connected)
        lastStatus = status
        statusListeners.forEach { it(status) }
        when (status) {
            is T3Connection.ConnectionStatus.Connected -> resubscribeAll()
            is T3Connection.ConnectionStatus.Offline,
            is T3Connection.ConnectionStatus.Connecting,
            is T3Connection.ConnectionStatus.Error -> {
                if (wasConnected) failPendingRequests()
            }
        }
    }

    private suspend fun failPendingRequests() = mutex.withLock {
        val waiters = pendingResponses.values.toList()
        pendingResponses.clear()
        waiters.forEach { it.completeException(T3Error.NotConnected) }
    }

    private suspend fun resubscribeAll() {
        val templates = mutex.withLock { subscriptionTemplates.toMap() }
        for ((id, template) in templates) {
            try {
                connection.send(
                    listOf(
                        EffectRpcMessage.StreamRequest(
                            id = id, tag = template.method, payload = template.payload
                        )
                    )
                )
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to resubscribe to ${template.method}: ${t.message}")
            }
        }
    }

    private suspend fun handle(msg: EffectRpcMessage) {
        when (msg) {
            is EffectRpcMessage.Exit -> {
                val pending = mutex.withLock {
                    pendingResponses.remove(msg.requestId).also {
                        streamSubscribers.remove(msg.requestId)
                        subscriptionTemplates.remove(msg.requestId)
                    }
                }
                if (pending != null) {
                    if (msg.success) pending.complete(msg.value)
                    else pending.completeException(T3Error.RequestFailed(msg.errorMessage ?: "unknown"))
                }
            }
            is EffectRpcMessage.Chunk -> {
                val listener = mutex.withLock { streamSubscribers[msg.requestId] }
                if (listener != null) {
                    msg.values.forEach { listener(it) }
                    runCatching {
                        connection.send(listOf(EffectRpcMessage.Ack(msg.requestId)))
                    }
                }
            }
            is EffectRpcMessage.Defect -> {
                val (waiters, _) = mutex.withLock {
                    val w = pendingResponses.values.toList()
                    pendingResponses.clear()
                    streamSubscribers.clear()
                    subscriptionTemplates.clear()
                    w to Unit
                }
                waiters.forEach { it.completeException(T3Error.RequestFailed(msg.message)) }
            }
            else -> Unit
        }
    }

    suspend fun request(method: String, payload: JsonElement): JsonElement? {
        val id = connection.nextRequestId()
        return suspendCancellableCoroutine { cont ->
            val pending = Pending<JsonElement?>(cont)
            scope.launch {
                mutex.withLock { pendingResponses[id] = pending }
                try {
                    connection.send(
                        listOf(
                            EffectRpcMessage.Request(
                                id = id, tag = method, payload = payload
                            )
                        )
                    )
                } catch (t: Throwable) {
                    val removed = mutex.withLock { pendingResponses.remove(id) }
                    removed?.completeException(t)
                }
            }
            cont.invokeOnCancellation {
                scope.launch {
                    mutex.withLock { pendingResponses.remove(id) }
                }
            }
        }
    }

    suspend fun subscribe(
        method: String,
        payload: JsonElement,
        onValue: (JsonElement) -> Unit
    ): StreamSubscription {
        val id = connection.nextRequestId()
        mutex.withLock {
            streamSubscribers[id] = onValue
            subscriptionTemplates[id] = SubscriptionTemplate(method, payload)
        }
        connection.send(
            listOf(EffectRpcMessage.StreamRequest(id = id, tag = method, payload = payload))
        )
        return StreamSubscription(this, id)
    }

    suspend fun cancel(requestId: String) {
        val pending = mutex.withLock {
            streamSubscribers.remove(requestId)
            subscriptionTemplates.remove(requestId)
            pendingResponses.remove(requestId)
        }
        pending?.completeException(kotlinx.coroutines.CancellationException("Cancelled"))
        runCatching {
            connection.send(listOf(EffectRpcMessage.Interrupt(requestId, emptyList())))
        }
    }

    // region High-level helpers

    suspend fun subscribeShell(onItem: (ShellStreamItem) -> Unit): StreamSubscription =
        subscribe("orchestration.subscribeShell", JsonObject(emptyMap())) { value ->
            ShellStreamItem.fromJson(value)?.let(onItem)
                ?: Log.w(TAG, "Discarded shell stream value: $value")
        }

    suspend fun subscribeThread(
        threadId: ThreadID,
        onItem: (ThreadStreamItem) -> Unit
    ): StreamSubscription =
        subscribe(
            "orchestration.subscribeThread",
            buildJsonObject { put("threadId", threadId.rawValue) }
        ) { value ->
            ThreadStreamItem.fromJson(value)?.let(onItem)
                ?: Log.w(TAG, "Discarded thread stream value: $value")
        }

    suspend fun getServerConfig(): ServerRuntimeConfig {
        val value = request("server.getConfig", JsonObject(emptyMap()))
            ?: throw T3Error.DecodingFailed("Server returned an empty config response")
        val obj = value.asObjectOrNull()
            ?: throw T3Error.DecodingFailed("Server config was not an object")
        return ServerRuntimeConfig.fromJson(obj)
    }

    suspend fun searchProjectEntries(
        cwd: String,
        query: String,
        limit: Int = 50
    ): ProjectSearchEntriesResult {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return ProjectSearchEntriesResult(entries = emptyList(), truncated = false)
        val payload = buildJsonObject {
            put("cwd", cwd)
            put("query", trimmed)
            put("limit", limit.coerceIn(1, 200))
        }
        val value = request("projects.searchEntries", payload)
            ?: throw T3Error.DecodingFailed("Empty projects.searchEntries response")
        val obj = value.asObjectOrNull()
            ?: throw T3Error.DecodingFailed("projects.searchEntries did not return an object")
        return ProjectSearchEntriesResult.fromJson(obj)
    }

    suspend fun dispatchTurnStart(
        threadId: ThreadID,
        text: String,
        attachments: List<UploadImage> = emptyList(),
        modelSelection: ModelSelection?,
        runtimeMode: RuntimeMode,
        interactionMode: ProviderInteractionMode
    ) {
        val now = Iso8601.format(Instant.now())
        val payload = buildJsonObject {
            put("type", "thread.turn.start")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("message", buildJsonObject {
                put("messageId", MessageID.newClientID().rawValue)
                put("role", "user")
                put("text", text)
                put("attachments", buildJsonArray {
                    attachments.forEach { add(it.encoded()) }
                })
            })
            put("runtimeMode", runtimeMode.raw)
            put("interactionMode", interactionMode.raw)
            put("createdAt", now)
            modelSelection?.let { put("modelSelection", it.encoded()) }
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun createThreadAndStart(
        project: ProjectShell,
        text: String,
        attachments: List<UploadImage> = emptyList(),
        modelSelection: ModelSelection,
        runtimeMode: RuntimeMode,
        interactionMode: ProviderInteractionMode
    ): ThreadID {
        val threadId = ThreadID.new()
        val now = Iso8601.format(Instant.now())
        val titleSeed = titleSeed(text, attachments)
        val payload = buildJsonObject {
            put("type", "thread.turn.start")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("message", buildJsonObject {
                put("messageId", MessageID.newClientID().rawValue)
                put("role", "user")
                put("text", text)
                put("attachments", buildJsonArray {
                    attachments.forEach { add(it.encoded()) }
                })
            })
            put("modelSelection", modelSelection.encoded())
            put("titleSeed", titleSeed)
            put("runtimeMode", runtimeMode.raw)
            put("interactionMode", interactionMode.raw)
            put("bootstrap", buildJsonObject {
                put("createThread", buildJsonObject {
                    put("projectId", project.id.rawValue)
                    put("title", titleSeed)
                    put("modelSelection", modelSelection.encoded())
                    put("runtimeMode", runtimeMode.raw)
                    put("interactionMode", interactionMode.raw)
                    put("branch", JsonNull)
                    put("worktreePath", JsonNull)
                    put("createdAt", now)
                })
            })
            put("createdAt", now)
        }
        request("orchestration.dispatchCommand", payload)
        return threadId
    }

    suspend fun interruptTurn(threadId: ThreadID, turnId: TurnID? = null) {
        val payload = buildJsonObject {
            put("type", "thread.turn.interrupt")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("createdAt", Iso8601.format(Instant.now()))
            turnId?.let { put("turnId", it.rawValue) }
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun setRuntimeMode(threadId: ThreadID, mode: RuntimeMode) {
        val payload = buildJsonObject {
            put("type", "thread.runtime-mode.set")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("runtimeMode", mode.raw)
            put("createdAt", Iso8601.format(Instant.now()))
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun setInteractionMode(threadId: ThreadID, mode: ProviderInteractionMode) {
        val payload = buildJsonObject {
            put("type", "thread.interaction-mode.set")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("interactionMode", mode.raw)
            put("createdAt", Iso8601.format(Instant.now()))
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun updateThreadModelSelection(threadId: ThreadID, modelSelection: ModelSelection) {
        val payload = buildJsonObject {
            put("type", "thread.meta.update")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("modelSelection", modelSelection.encoded())
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun renameThread(threadId: ThreadID, title: String) {
        val trimmed = title.trim()
        if (trimmed.isEmpty()) return
        val payload = buildJsonObject {
            put("type", "thread.meta.update")
            put("commandId", CommandID.new().rawValue)
            put("threadId", threadId.rawValue)
            put("title", trimmed)
        }
        request("orchestration.dispatchCommand", payload)
    }

    suspend fun archiveThread(threadId: ThreadID) {
        request(
            "orchestration.dispatchCommand",
            buildJsonObject {
                put("type", "thread.archive")
                put("commandId", CommandID.new().rawValue)
                put("threadId", threadId.rawValue)
            }
        )
    }

    suspend fun unarchiveThread(threadId: ThreadID) {
        request(
            "orchestration.dispatchCommand",
            buildJsonObject {
                put("type", "thread.unarchive")
                put("commandId", CommandID.new().rawValue)
                put("threadId", threadId.rawValue)
            }
        )
    }

    suspend fun deleteThread(threadId: ThreadID) {
        request(
            "orchestration.dispatchCommand",
            buildJsonObject {
                put("type", "thread.delete")
                put("commandId", CommandID.new().rawValue)
                put("threadId", threadId.rawValue)
            }
        )
    }

    suspend fun stopSession(threadId: ThreadID) {
        request(
            "orchestration.dispatchCommand",
            buildJsonObject {
                put("type", "thread.session.stop")
                put("commandId", CommandID.new().rawValue)
                put("threadId", threadId.rawValue)
                put("createdAt", Iso8601.format(Instant.now()))
            }
        )
    }

    suspend fun refreshVcsStatus(cwd: String): VcsStatusSummary {
        val payload = buildJsonObject { put("cwd", cwd) }
        val value = request("vcs.refreshStatus", payload)
            ?: throw T3Error.DecodingFailed("Empty vcs.refreshStatus response")
        return VcsStatusSummary.fromJson(value.asObjectOrNull() ?: throw T3Error.DecodingFailed("vcs status not an object"))
            ?: throw T3Error.DecodingFailed("Failed to decode vcs status")
    }

    suspend fun vcsPull(cwd: String): VcsPullSummary {
        val payload = buildJsonObject { put("cwd", cwd) }
        val value = request("vcs.pull", payload)
            ?: throw T3Error.DecodingFailed("Empty vcs.pull response")
        return VcsPullSummary.fromJson(value.asObjectOrNull() ?: throw T3Error.DecodingFailed("vcs pull not an object"))
            ?: throw T3Error.DecodingFailed("Failed to decode vcs pull summary")
    }

    // endregion

    private fun titleSeed(text: String, attachments: List<UploadImage>): String {
        val trimmed = text.trim()
        val seed = when {
            trimmed.isNotEmpty() -> trimmed
            attachments.isNotEmpty() -> "Image: ${attachments.first().name}"
            else -> "New thread"
        }
        return if (seed.length <= 80) seed else seed.take(77) + "..."
    }

    private data class SubscriptionTemplate(val method: String, val payload: JsonElement)

    private class Pending<T>(
        private val cont: kotlinx.coroutines.CancellableContinuation<T>
    ) {
        private val finished = AtomicBoolean(false)

        fun complete(value: T) {
            if (finished.compareAndSet(false, true) && cont.isActive) {
                cont.resume(value)
            }
        }

        fun completeException(t: Throwable) {
            if (finished.compareAndSet(false, true) && cont.isActive) {
                cont.resumeWith(Result.failure(t))
            }
        }
    }

    companion object {
        private const val TAG = "T3Client"
    }
}

class StreamSubscription internal constructor(
    private val client: T3Client,
    val requestId: String
) {
    suspend fun cancel() {
        client.cancel(requestId)
    }
}
