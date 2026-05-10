package com.belweave.trifecta.features.newthread

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProjectID
import com.belweave.trifecta.core.models.ProjectShell
import com.belweave.trifecta.core.models.ProviderInstanceID
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.RuntimeMode
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.core.models.ServerRuntimeConfig
import com.belweave.trifecta.core.models.ThreadID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class NewThreadViewModel(app: Application) : AndroidViewModel(app) {

    private val env: AppEnvironment = (app as TrifectaApp).env

    val projects: StateFlow<List<ProjectShell>> = env.threadList.projects
    val serverConfig: StateFlow<ServerRuntimeConfig?> = env.serverConfig
    val serverConfigError: StateFlow<String?> = env.serverConfigError

    val usableProviders: StateFlow<List<ServerProvider>> = serverConfig
        .map { config ->
            (config?.providers.orEmpty())
                .filter { it.isUsable }
                .sortedBy { it.label.lowercase() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _prompt = MutableStateFlow("")
    val prompt: StateFlow<String> = _prompt.asStateFlow()

    private val _selectedProjectId = MutableStateFlow<ProjectID?>(null)
    val selectedProjectId: StateFlow<ProjectID?> = _selectedProjectId.asStateFlow()

    private val _selectedProviderId = MutableStateFlow<ProviderInstanceID?>(null)
    val selectedProviderId: StateFlow<ProviderInstanceID?> = _selectedProviderId.asStateFlow()

    private val _selectedModel = MutableStateFlow("")
    val selectedModel: StateFlow<String> = _selectedModel.asStateFlow()

    private val _interactionMode = MutableStateFlow(ProviderInteractionMode.DEFAULT)
    val interactionMode: StateFlow<ProviderInteractionMode> = _interactionMode.asStateFlow()

    private val _attachments = MutableStateFlow<List<com.belweave.trifecta.features.thread.LocalAttachment>>(emptyList())
    val attachments: StateFlow<List<com.belweave.trifecta.features.thread.LocalAttachment>> = _attachments.asStateFlow()

    private val _isCreating = MutableStateFlow(false)
    val isCreating: StateFlow<Boolean> = _isCreating.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    val selectedProject: StateFlow<ProjectShell?> = combine(
        projects, _selectedProjectId
    ) { projects, id ->
        if (id == null) projects.firstOrNull() else projects.firstOrNull { it.id == id }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val selectedProvider: StateFlow<ServerProvider?> = combine(
        usableProviders, _selectedProviderId
    ) { providers, id ->
        if (id == null) providers.firstOrNull() else providers.firstOrNull { it.instanceId == id }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val canCreate: StateFlow<Boolean> = combine(
        _prompt, selectedProject, selectedProvider, _selectedModel, _attachments, _isCreating
    ) { values: Array<Any?> ->
        val text = values[0] as String
        val project = values[1] as ProjectShell?
        val provider = values[2] as ServerProvider?
        val model = values[3] as String
        @Suppress("UNCHECKED_CAST")
        val atts = values[4] as List<Any>
        val creating = values[5] as Boolean
        val trimmed = text.trim()
        !creating
            && project != null
            && provider != null
            && model.trim().isNotEmpty()
            && (trimmed.isNotEmpty() || atts.isNotEmpty())
            && text.length <= MAX_CHARS
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun start() {
        viewModelScope.launch { env.refreshServerConfig() }
        applyInitialSelections()

        viewModelScope.launch {
            projects.collect { applyInitialSelections() }
        }
        viewModelScope.launch {
            usableProviders.collect {
                applyInitialSelections()
            }
        }
        viewModelScope.launch {
            _selectedProviderId.collect {
                _selectedModel.value = resolvedModelForSelectedProvider()
            }
        }
    }

    fun setPrompt(value: String) {
        _prompt.value = value
    }

    fun selectProject(id: ProjectID) {
        _selectedProjectId.value = id
    }

    fun selectProvider(id: ProviderInstanceID, model: String) {
        _selectedProviderId.value = id
        _selectedModel.value = model
    }

    fun setInteractionMode(mode: ProviderInteractionMode) {
        _interactionMode.value = mode
    }

    fun addAttachments(loaded: List<com.belweave.trifecta.features.thread.LocalAttachment>) {
        _attachments.value = (_attachments.value + loaded).take(MAX_ATTACHMENTS)
    }

    fun removeAttachment(id: String) {
        _attachments.value = _attachments.value.filterNot { it.id == id }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    suspend fun createThread(): ThreadID? {
        val project = selectedProject.value ?: return null
        val provider = selectedProvider.value ?: return null
        val client = env.client() ?: run {
            _errorMessage.value = "Not connected"
            return null
        }
        val text = _prompt.value.trim()
        val uploads = _attachments.value.map { it.upload }
        val explicit = ModelSelection(
            instanceId = provider.instanceId,
            model = _selectedModel.value
        )
        val selection = project.defaultModelSelection?.takeIf {
            it.instanceId == provider.instanceId && it.model == _selectedModel.value
        } ?: explicit

        _isCreating.value = true
        _errorMessage.value = null
        return try {
            val id = client.createThreadAndStart(
                project = project,
                text = text,
                attachments = uploads,
                modelSelection = selection,
                runtimeMode = RuntimeMode.FULL_ACCESS,
                interactionMode = _interactionMode.value
            )
            _attachments.value = emptyList()
            _prompt.value = ""
            id
        } catch (t: Throwable) {
            _errorMessage.value = t.message ?: "Failed to create thread"
            null
        } finally {
            _isCreating.value = false
        }
    }

    private fun applyInitialSelections() {
        if (_selectedProjectId.value == null) {
            _selectedProjectId.value = projects.value.firstOrNull()?.id
        }
        if (_selectedProviderId.value == null) {
            _selectedProviderId.value = usableProviders.value.firstOrNull()?.instanceId
        }
        if (_selectedModel.value.isEmpty()) {
            _selectedModel.value = resolvedModelForSelectedProvider()
        }
    }

    private fun resolvedModelForSelectedProvider(): String =
        selectedProvider.value?.defaultModel ?: ""

    companion object {
        const val MAX_CHARS = 120_000
        const val MAX_ATTACHMENTS = 8
    }
}
