package com.belweave.trifecta.core.stores

import com.belweave.trifecta.core.models.MessageID
import com.belweave.trifecta.core.models.MessageRole
import com.belweave.trifecta.core.models.Iso8601
import com.belweave.trifecta.core.models.LatestTurnState
import com.belweave.trifecta.core.models.Message
import com.belweave.trifecta.core.models.ChatImageAttachment
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.OrchestrationSession
import com.belweave.trifecta.core.models.ProposedPlan
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.RuntimeMode
import com.belweave.trifecta.core.models.SessionStatus
import com.belweave.trifecta.core.models.ThreadActivity
import com.belweave.trifecta.core.models.ThreadDetail
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.core.models.ThreadStreamItem
import com.belweave.trifecta.core.models.TurnID
import com.belweave.trifecta.core.models.asObjectOrNull
import com.belweave.trifecta.core.models.bool
import com.belweave.trifecta.core.models.obj
import com.belweave.trifecta.core.models.str
import com.belweave.trifecta.core.networking.StreamSubscription
import com.belweave.trifecta.core.networking.T3Client
import com.belweave.trifecta.core.networking.UploadImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import java.time.Instant

class ThreadStore(val threadId: ThreadID) {

    private val _detail = MutableStateFlow<ThreadDetail?>(null)
    val detail: StateFlow<ThreadDetail?> = _detail.asStateFlow()

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _session = MutableStateFlow<OrchestrationSession?>(null)
    val session: StateFlow<OrchestrationSession?> = _session.asStateFlow()

    private val _activities = MutableStateFlow<List<ThreadActivity>>(emptyList())
    val activities: StateFlow<List<ThreadActivity>> = _activities.asStateFlow()

    private val _proposedPlans = MutableStateFlow<List<ProposedPlan>>(emptyList())
    val proposedPlans: StateFlow<List<ProposedPlan>> = _proposedPlans.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending.asStateFlow()

    private var subscription: StreamSubscription? = null
    private var client: T3Client? = null
    private val mutex = Mutex()

    val isTurnRunning: Boolean
        get() {
            val s = _session.value
            if (s != null && s.status == SessionStatus.RUNNING) return true
            val turn = _detail.value?.latestTurn
            if (turn != null && turn.state == LatestTurnState.RUNNING) return true
            return _isSending.value
        }

    suspend fun start(client: T3Client) {
        mutex.withLock {
            this.client = client
            subscription?.cancel()
            subscription = client.subscribeThread(threadId) { item ->
                handle(item)
            }
        }
    }

    suspend fun stop() {
        mutex.withLock {
            subscription?.cancel()
            subscription = null
            client = null
        }
    }

    suspend fun sendMessage(
        text: String,
        attachments: List<UploadImage>,
        fallbackModelSelection: ModelSelection?
    ) {
        val cli = client ?: return
        if (text.trim().isEmpty() && attachments.isEmpty()) return
        val resolved = _detail.value?.modelSelection ?: fallbackModelSelection
        if (resolved == null) {
            _lastError.value = "No model selected"
            return
        }
        _isSending.value = true
        try {
            cli.dispatchTurnStart(
                threadId = threadId,
                text = text,
                attachments = attachments,
                modelSelection = resolved,
                runtimeMode = _detail.value?.runtimeMode ?: RuntimeMode.FULL_ACCESS,
                interactionMode = _detail.value?.interactionMode ?: ProviderInteractionMode.DEFAULT
            )
        } catch (t: Throwable) {
            _lastError.value = t.message
        } finally {
            _isSending.value = false
        }
    }

    suspend fun interruptTurn() {
        val cli = client ?: return
        try {
            cli.interruptTurn(threadId, _detail.value?.latestTurn?.turnId)
        } catch (t: Throwable) {
            _lastError.value = t.message
        }
    }

    suspend fun setRuntimeMode(mode: RuntimeMode) {
        val cli = client ?: return
        if (_detail.value?.runtimeMode == mode) return
        try {
            cli.setRuntimeMode(threadId, mode)
        } catch (t: Throwable) {
            _lastError.value = t.message
        }
    }

    suspend fun setInteractionMode(mode: ProviderInteractionMode) {
        val cli = client ?: return
        if (_detail.value?.interactionMode == mode) return
        try {
            cli.setInteractionMode(threadId, mode)
        } catch (t: Throwable) {
            _lastError.value = t.message
        }
    }

    suspend fun updateModelSelection(selection: ModelSelection) {
        val cli = client ?: return
        _detail.value = _detail.value?.copy(modelSelection = selection)
        try {
            cli.updateThreadModelSelection(threadId, selection)
        } catch (t: Throwable) {
            _lastError.value = t.message
        }
    }

    fun clearLastError() {
        _lastError.value = null
    }

    private fun handle(item: ThreadStreamItem) {
        when (item) {
            is ThreadStreamItem.Snapshot -> {
                _detail.value = item.detail
                _messages.value = item.detail.messages.sortedBy { it.createdAt }
                _session.value = item.detail.session
                _proposedPlans.value = item.detail.proposedPlans
                _activities.value = item.detail.activities
            }
            is ThreadStreamItem.Event -> apply(item.event.type, item.event.payload)
        }
    }

    private fun apply(type: String, payload: JsonObject) {
        when (type) {
            "thread.message-sent" -> applyMessageSent(payload)
            "thread.session-set" -> {
                val s = OrchestrationSession.fromJson(payload.obj("session"))
                _session.value = s
                _detail.value = _detail.value?.copy(session = s)
            }
            "thread.runtime-mode-set" -> {
                val mode = RuntimeMode.fromRaw(payload.str("runtimeMode"))
                _detail.value = _detail.value?.copy(runtimeMode = mode)
            }
            "thread.interaction-mode-set" -> {
                val mode = ProviderInteractionMode.fromRaw(payload.str("interactionMode"))
                _detail.value = _detail.value?.copy(interactionMode = mode)
            }
            "thread.meta-updated" -> applyMetaUpdated(payload)
            "thread.archived" -> {
                val ts = Iso8601.parse(payload.str("archivedAt")) ?: Instant.now()
                _detail.value = _detail.value?.copy(archivedAt = ts)
            }
            "thread.unarchived" -> {
                _detail.value = _detail.value?.copy(archivedAt = null)
            }
            "thread.activity-appended" -> {
                val activity = ThreadActivity.fromJson(payload.obj("activity"))
                if (activity != null) upsertActivity(activity)
            }
            "thread.proposed-plan-upserted" -> {
                val plan = ProposedPlan.fromJson(payload.obj("proposedPlan"))
                if (plan != null) upsertPlan(plan)
            }
        }
    }

    private fun applyMessageSent(payload: JsonObject) {
        val merged = mergeMessageFields(payload)
        val rawId = merged.str("messageId") ?: merged.str("id") ?: return
        val role = MessageRole.fromRaw(merged.str("role"))
        val text = merged.str("text") ?: ""
        val createdAt = Iso8601.parse(merged.str("createdAt")) ?: Instant.now()
        val updatedAt = Iso8601.parse(merged.str("updatedAt")) ?: createdAt
        val streaming = merged.bool("streaming") ?: false
        val turnId = merged.str("turnId")?.let { TurnID(it) }
        val id = MessageID(rawId)
        val attachments = merged["attachments"]?.let { el ->
            val arr = (el as? kotlinx.serialization.json.JsonArray) ?: return@let null
            arr.mapNotNull { ChatImageAttachment.fromJson(it.asObjectOrNull()) }.takeIf { it.isNotEmpty() }
        }

        val current = _messages.value.toMutableList()
        val idx = current.indexOfFirst { it.id == id }
        if (idx >= 0) {
            val existing = current[idx]
            val newText = when {
                streaming -> existing.text + text
                text.isNotEmpty() -> text
                else -> existing.text
            }
            current[idx] = existing.copy(
                text = newText,
                streaming = streaming,
                updatedAt = updatedAt,
                attachments = if (!attachments.isNullOrEmpty()) attachments else existing.attachments
            )
        } else {
            current.add(
                Message(
                    id = id,
                    role = role,
                    text = text,
                    attachments = attachments,
                    turnId = turnId,
                    streaming = streaming,
                    createdAt = createdAt,
                    updatedAt = updatedAt
                )
            )
        }
        current.sortBy { it.createdAt }
        _messages.value = current
    }

    private fun mergeMessageFields(payload: JsonObject): JsonObject {
        val inner = payload.obj("message") ?: return payload
        val merged = HashMap<String, kotlinx.serialization.json.JsonElement>(payload)
        for ((k, v) in inner) merged[k] = v
        return JsonObject(merged)
    }

    private fun applyMetaUpdated(payload: JsonObject) {
        var d = _detail.value ?: return
        payload.str("title")?.let { d = d.copy(title = it) }
        ModelSelection.fromJson(payload.obj("modelSelection"))?.let {
            d = d.copy(modelSelection = it)
        }
        if (payload.containsKey("branch")) {
            d = d.copy(branch = payload.str("branch"))
        }
        _detail.value = d
    }

    private fun upsertActivity(activity: ThreadActivity) {
        val list = _activities.value.toMutableList()
        val idx = list.indexOfFirst { it.id == activity.id }
        if (idx >= 0) list[idx] = activity else list.add(activity)
        _activities.value = list
        _detail.value?.let { d ->
            val ds = d.activities.toMutableList()
            val di = ds.indexOfFirst { it.id == activity.id }
            if (di >= 0) ds[di] = activity else ds.add(activity)
            _detail.value = d.copy(activities = ds)
        }
    }

    private fun upsertPlan(plan: ProposedPlan) {
        val list = _proposedPlans.value.toMutableList()
        val idx = list.indexOfFirst { it.id == plan.id }
        if (idx >= 0) list[idx] = plan else list.add(plan)
        _proposedPlans.value = list
    }
}
