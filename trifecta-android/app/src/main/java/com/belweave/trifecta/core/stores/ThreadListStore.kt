package com.belweave.trifecta.core.stores

import com.belweave.trifecta.core.models.ProjectID
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ShellStreamItem
import com.belweave.trifecta.core.models.ThreadShell
import com.belweave.trifecta.core.networking.StreamSubscription
import com.belweave.trifecta.core.networking.T3Client
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/**
 * Live, reactive store of all projects + threads in the active workspace.
 * Backed by an `orchestration.subscribeShell` subscription that delivers an
 * initial snapshot followed by upsert/remove deltas.
 *
 * Mirrors the iOS `ThreadListStore` behaviour but exposes flows for Compose.
 */
class ThreadListStore {

    private val mutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var subscription: StreamSubscription? = null
    private var client: T3Client? = null

    private val _projects = MutableStateFlow<List<ProjectShell>>(emptyList())
    val projects: StateFlow<List<ProjectShell>> = _projects.asStateFlow()

    private val _threads = MutableStateFlow<List<ThreadShell>>(emptyList())
    val threads: StateFlow<List<ThreadShell>> = _threads.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    suspend fun start(client: T3Client) {
        mutex.withLock { this.client = client }
        try {
            val sub = client.subscribeShell { item ->
                scope.launch { handle(item) }
            }
            mutex.withLock { subscription = sub }
        } catch (t: Throwable) {
            _lastError.value = t.message
        }
    }

    suspend fun stop() {
        val sub = mutex.withLock {
            val current = subscription
            subscription = null
            current
        }
        sub?.cancel()
    }

    fun reset() {
        _projects.value = emptyList()
        _threads.value = emptyList()
        _lastError.value = null
    }

    private suspend fun handle(item: ShellStreamItem) {
        when (item) {
            is ShellStreamItem.Snapshot -> {
                _projects.value = item.snapshot.projects
                _threads.value = item.snapshot.threads.sortedByDescending { it.sortKey() }
            }
            is ShellStreamItem.ProjectUpserted -> {
                val list = _projects.value.toMutableList()
                val idx = list.indexOfFirst { it.id == item.project.id }
                if (idx >= 0) list[idx] = item.project else list.add(item.project)
                _projects.value = list
            }
            is ShellStreamItem.ProjectRemoved -> {
                _projects.value = _projects.value.filterNot { it.id == item.projectId }
                _threads.value = _threads.value.filterNot { it.projectId == item.projectId }
            }
            is ShellStreamItem.ThreadUpserted -> {
                val list = _threads.value.toMutableList()
                val idx = list.indexOfFirst { it.id == item.thread.id }
                if (idx >= 0) list[idx] = item.thread else list.add(0, item.thread)
                _threads.value = list.sortedByDescending { it.sortKey() }
            }
            is ShellStreamItem.ThreadRemoved -> {
                _threads.value = _threads.value.filterNot { it.id == item.threadId }
            }
        }
    }

    fun threads(in_: ProjectID): List<ThreadShell> =
        _threads.value.filter { it.projectId == in_ && it.archivedAt == null }

    fun project(for_: ThreadShell): ProjectShell? =
        _projects.value.firstOrNull { it.id == for_.projectId }

    fun project(id: ProjectID): ProjectShell? =
        _projects.value.firstOrNull { it.id == id }

    private fun ThreadShell.sortKey(): Instant = latestUserMessageAt ?: updatedAt
}
