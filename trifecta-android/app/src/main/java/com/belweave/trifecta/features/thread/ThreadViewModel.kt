package com.belweave.trifecta.features.thread

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.Message
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProjectSearchEntriesResult
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.RuntimeMode
import com.belweave.trifecta.core.models.ServerRuntimeConfig
import com.belweave.trifecta.core.models.ThreadDetail
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.core.models.ThreadShell
import com.belweave.trifecta.core.networking.UploadImage
import com.belweave.trifecta.core.stores.ThreadStore
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ThreadViewModel(
    app: Application,
    val threadId: ThreadID
) : AndroidViewModel(app) {

    private val env: AppEnvironment = (app as TrifectaApp).env
    val store = ThreadStore(threadId)

    val detail: StateFlow<ThreadDetail?> = store.detail
    val messages: StateFlow<List<Message>> = store.messages
    val session = store.session
    val activities = store.activities
    val lastError: StateFlow<String?> = store.lastError
    val isSending: StateFlow<Boolean> = store.isSending
    val serverConfig: StateFlow<ServerRuntimeConfig?> = env.serverConfig
    val threads: StateFlow<List<ThreadShell>> = env.threadList.threads
    val projects: StateFlow<List<ProjectShell>> = env.threadList.projects

    fun threadShell(): ThreadShell? = threads.value.firstOrNull { it.id == threadId }

    fun project(): ProjectShell? = threadShell()?.let { ts ->
        projects.value.firstOrNull { it.id == ts.projectId }
    }

    fun start() {
        viewModelScope.launch {
            val client = env.client() ?: return@launch
            store.start(client)
        }
    }

    fun stop() {
        viewModelScope.launch { store.stop() }
    }

    fun send(text: String, attachments: List<UploadImage>, fallback: ModelSelection?) {
        viewModelScope.launch { store.sendMessage(text, attachments, fallback) }
    }

    fun interrupt() {
        viewModelScope.launch { store.interruptTurn() }
    }

    fun setRuntimeMode(mode: RuntimeMode) {
        viewModelScope.launch { store.setRuntimeMode(mode) }
    }

    fun setInteractionMode(mode: ProviderInteractionMode) {
        viewModelScope.launch { store.setInteractionMode(mode) }
    }

    fun rename(newTitle: String) {
        viewModelScope.launch {
            val client = env.client() ?: return@launch
            try { client.renameThread(threadId, newTitle) } catch (_: Throwable) {}
        }
    }

    fun archive(onDone: () -> Unit) {
        viewModelScope.launch {
            val client = env.client() ?: return@launch
            try {
                client.archiveThread(threadId)
                onDone()
            } catch (_: Throwable) {}
        }
    }

    fun unarchive() {
        viewModelScope.launch {
            val client = env.client() ?: return@launch
            try { client.unarchiveThread(threadId) } catch (_: Throwable) {}
        }
    }

    fun delete(onDone: () -> Unit) {
        viewModelScope.launch {
            val client = env.client() ?: return@launch
            try {
                client.deleteThread(threadId)
                onDone()
            } catch (_: Throwable) {}
        }
    }

    fun updateModel(selection: ModelSelection) {
        viewModelScope.launch { store.updateModelSelection(selection) }
    }

    suspend fun searchProjectEntries(query: String, limit: Int = 50): ProjectSearchEntriesResult? {
        val cwd = project()?.workspaceRoot?.takeIf { it.isNotEmpty() } ?: return null
        val client = env.client() ?: return null
        return runCatching { client.searchProjectEntries(cwd, query, limit) }.getOrNull()
    }

    fun clearError() = store.clearLastError()

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch { store.stop() }
    }

    companion object {
        fun factory(app: Application, threadId: ThreadID): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                    ThreadViewModel(app, threadId) as T
            }
    }
}
