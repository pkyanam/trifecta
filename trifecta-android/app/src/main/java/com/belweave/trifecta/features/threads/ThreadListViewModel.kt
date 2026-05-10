package com.belweave.trifecta.features.threads

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.ProjectID
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.core.models.ThreadShell
import com.belweave.trifecta.core.networking.ConnectionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class ThreadSortOrder(val label: String) {
    RECENT("Recent"),
    NAME("Name")
}

class ThreadListViewModel(app: Application) : AndroidViewModel(app) {

    private val env: AppEnvironment = (app as TrifectaApp).env

    val sessionState: StateFlow<AppEnvironment.SessionState> = env.sessionState
    val connectionState: StateFlow<ConnectionState> = env.connectionState
    val projects: StateFlow<List<ProjectShell>> = env.threadList.projects
    val threads: StateFlow<List<ThreadShell>> = env.threadList.threads

    private val _sort = MutableStateFlow(ThreadSortOrder.RECENT)
    val sort: StateFlow<ThreadSortOrder> = _sort.asStateFlow()

    private val _collapsedProjects = MutableStateFlow<Set<ProjectID>>(emptySet())
    val collapsedProjects: StateFlow<Set<ProjectID>> = _collapsedProjects.asStateFlow()

    private val _expandedThreadCounts = MutableStateFlow<Map<ProjectID, Int>>(emptyMap())
    val expandedThreadCounts: StateFlow<Map<ProjectID, Int>> = _expandedThreadCounts.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    val activeThreads: StateFlow<List<ThreadShell>> = threads
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val groupedThreads: StateFlow<List<Pair<ProjectShell, List<ThreadShell>>>> = combine(
        projects, threads, _sort
    ) { allProjects, allThreads, sortOrder ->
        val active = allThreads.filter { it.archivedAt == null }
        val byProject = active.groupBy { it.projectId }
        allProjects.mapNotNull { project ->
            val items = byProject[project.id].orEmpty()
            if (items.isEmpty()) null else project to sortOrder.applyTo(items)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val emptyProjects: StateFlow<List<ProjectShell>> = combine(projects, threads) { all, threads ->
        val ids = threads.filter { it.archivedAt == null }.map { it.projectId }.toSet()
        all.filter { it.id !in ids }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setSort(order: ThreadSortOrder) {
        _sort.value = order
    }

    fun toggleProjectCollapsed(id: ProjectID) {
        _collapsedProjects.value = _collapsedProjects.value.toMutableSet().apply {
            if (!add(id)) remove(id)
        }
    }

    fun showMore(id: ProjectID, increment: Int) {
        val current = _expandedThreadCounts.value[id] ?: defaultVisible
        _expandedThreadCounts.value = _expandedThreadCounts.value + (id to current + increment)
    }

    fun toggleAllExpansion() {
        val groups = groupedThreads.value.map { it.first.id }.toSet()
        if (groups.isEmpty()) return
        if (_collapsedProjects.value.containsAll(groups)) {
            _collapsedProjects.value = emptySet()
        } else {
            _collapsedProjects.value = groups
        }
    }

    fun visibleThreadCount(id: ProjectID): Int =
        _expandedThreadCounts.value[id] ?: defaultVisible

    fun isCollapsed(id: ProjectID): Boolean =
        _collapsedProjects.value.contains(id)

    fun project(id: ProjectID): ProjectShell? = env.threadList.project(id = id)

    fun archive(threadId: ThreadID) {
        val client = env.client() ?: return
        viewModelScope.launch {
            try {
                client.archiveThread(threadId)
            } catch (t: Throwable) {
                _actionError.value = t.message
            }
        }
    }

    fun delete(threadId: ThreadID) {
        val client = env.client() ?: return
        viewModelScope.launch {
            try {
                client.deleteThread(threadId)
            } catch (t: Throwable) {
                _actionError.value = t.message
            }
        }
    }

    fun clearActionError() {
        _actionError.value = null
    }

    fun refreshServerConfig() {
        viewModelScope.launch { env.refreshServerConfig() }
    }

    private fun ThreadSortOrder.applyTo(threads: List<ThreadShell>): List<ThreadShell> = when (this) {
        ThreadSortOrder.RECENT -> threads.sortedByDescending { it.latestUserMessageAt ?: it.updatedAt }
        ThreadSortOrder.NAME -> threads.sortedBy { it.title.lowercase() }
    }

    companion object {
        const val defaultVisible: Int = 6
    }
}
