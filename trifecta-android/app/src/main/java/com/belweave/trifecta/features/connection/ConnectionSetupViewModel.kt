package com.belweave.trifecta.features.connection

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.auth.PairingFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.URI

class ConnectionSetupViewModel(app: Application) : AndroidViewModel(app) {

    private val env = (app as TrifectaApp).env
    private val pairingFlow = PairingFlow()

    data class State(
        val serverUrl: String = "",
        val token: String = "",
        val isWorking: Boolean = false,
        val errorMessage: String? = null,
        val didPair: Boolean = false
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun updateServerUrl(value: String) {
        _state.value = _state.value.copy(serverUrl = value, errorMessage = null)
    }

    fun updateToken(value: String) {
        _state.value = _state.value.copy(token = value, errorMessage = null)
    }

    /** Try parsing pasted text as a pairing URL or raw token. */
    fun applyPastedText(raw: String) {
        val text = raw.trim()
        if (text.isEmpty()) return
        val parsed = PairingFlow.parsePairingURL(text)
        if (parsed != null) {
            _state.value = _state.value.copy(
                serverUrl = PairingFlow.serverBaseURL(parsed.first).toString(),
                token = parsed.second,
                errorMessage = null
            )
            return
        }
        if (text.startsWith("http", ignoreCase = true)) {
            val parsedUri = runCatching { URI(text) }.getOrNull()
            if (parsedUri != null) {
                _state.value = _state.value.copy(
                    serverUrl = PairingFlow.serverBaseURL(parsedUri).toString(),
                    errorMessage = null
                )
                return
            }
        }
        _state.value = _state.value.copy(token = text, errorMessage = null)
    }

    val canConnect: Boolean
        get() {
            val cur = _state.value
            val trimmed = cur.serverUrl.trim()
            val uri = runCatching { URI(trimmed) }.getOrNull() ?: return false
            return uri.scheme != null && uri.host != null && cur.token.trim().isNotEmpty()
        }

    fun connect() {
        val cur = _state.value
        if (cur.isWorking) return
        val trimmed = cur.serverUrl.trim()
        val uri = runCatching { URI(trimmed) }.getOrNull()
        if (uri == null || uri.scheme == null || uri.host == null) {
            _state.value = cur.copy(errorMessage = "Invalid server URL")
            return
        }
        val token = cur.token.trim()
        if (token.isEmpty()) {
            _state.value = cur.copy(errorMessage = "Pairing token required")
            return
        }
        _state.value = cur.copy(isWorking = true, errorMessage = null)
        viewModelScope.launch {
            try {
                val baseUrl = PairingFlow.serverBaseURL(uri)
                pairingFlow.fetchEnvironment(baseUrl)
                val result = pairingFlow.exchangeToken(baseUrl, token)
                env.configure(serverURL = baseUrl, bearerToken = result.bearerToken)
                _state.value = _state.value.copy(isWorking = false, didPair = true)
            } catch (t: Throwable) {
                _state.value = _state.value.copy(
                    isWorking = false,
                    errorMessage = t.message ?: "Pairing failed"
                )
            }
        }
    }
}
