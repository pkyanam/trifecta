package com.belweave.trifecta.features.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.ServerRuntimeConfig
import com.belweave.trifecta.core.networking.ConnectionState
import com.belweave.trifecta.core.preferences.AppPreferencesStore
import com.belweave.trifecta.core.preferences.SavedServerProfile
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.AppAppearance
import com.belweave.trifecta.designsystem.ComposerSize
import com.belweave.trifecta.designsystem.TranscriptDensity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(app: Application) : AndroidViewModel(app) {

    private val t3 = app as TrifectaApp
    private val env: AppEnvironment = t3.env
    private val prefs: AppPreferencesStore = t3.prefs

    val sessionState: StateFlow<AppEnvironment.SessionState> = env.sessionState
    val connectionState: StateFlow<ConnectionState> = env.connectionState
    val savedProfiles: StateFlow<List<SavedServerProfile>> = env.savedProfiles
    val activeProfileID: StateFlow<String?> = env.activeProfileID
    val serverConfig: StateFlow<ServerRuntimeConfig?> = env.serverConfig
    val serverConfigError: StateFlow<String?> = env.serverConfigError

    val appearance: StateFlow<AppAppearance> = prefs.appearance
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppAppearance.SYSTEM)
    val accent: StateFlow<AppAccent> = prefs.accent
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppAccent.BLUE)
    val transcriptDensity: StateFlow<TranscriptDensity> = prefs.transcriptDensity
        .stateIn(viewModelScope, SharingStarted.Eagerly, TranscriptDensity.COMFORTABLE)
    val composerSize: StateFlow<ComposerSize> = prefs.composerSize
        .stateIn(viewModelScope, SharingStarted.Eagerly, ComposerSize.COMFORTABLE)

    private val _isRefreshingConfig = MutableStateFlow(false)
    val isRefreshingConfig: StateFlow<Boolean> = _isRefreshingConfig.asStateFlow()

    private val _switchingProfileID = MutableStateFlow<String?>(null)
    val switchingProfileID: StateFlow<String?> = _switchingProfileID.asStateFlow()

    fun setAppearance(value: AppAppearance) =
        viewModelScope.launch { prefs.setAppearance(value) }

    fun setAccent(value: AppAccent) =
        viewModelScope.launch { prefs.setAccent(value) }

    fun setTranscriptDensity(value: TranscriptDensity) =
        viewModelScope.launch { prefs.setTranscriptDensity(value) }

    fun setComposerSize(value: ComposerSize) =
        viewModelScope.launch { prefs.setComposerSize(value) }

    fun refreshServerConfig() {
        viewModelScope.launch {
            _isRefreshingConfig.value = true
            try {
                env.refreshServerConfig()
            } finally {
                _isRefreshingConfig.value = false
            }
        }
    }

    fun switchToProfile(id: String) {
        viewModelScope.launch {
            _switchingProfileID.value = id
            try {
                env.switchToProfile(id)
            } finally {
                _switchingProfileID.value = null
            }
        }
    }

    fun renameProfile(id: String, name: String) {
        viewModelScope.launch { env.renameProfile(id, name) }
    }

    fun removeProfile(id: String) {
        viewModelScope.launch { env.removeProfile(id) }
    }

    fun signOut() {
        viewModelScope.launch { env.signOut() }
    }
}
