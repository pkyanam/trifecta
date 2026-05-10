package com.belweave.trifecta

import android.app.Application
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.preferences.AppPreferencesStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Application-wide singleton holder. Bootstraps the AppEnvironment (profiles +
 * thread list + connection) and the persistent preferences store so they're
 * ready by the time MainActivity composes its UI tree.
 */
class TrifectaApp : Application() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    lateinit var env: AppEnvironment
        private set
    lateinit var prefs: AppPreferencesStore
        private set

    private val _pendingPairingLink = MutableStateFlow<String?>(null)
    /** A pairing link delivered via deep link, awaiting consumption by the
     *  connection setup screen. Cleared once the screen reads it. */
    val pendingPairingLink: StateFlow<String?> = _pendingPairingLink.asStateFlow()

    fun postPendingPairingLink(raw: String?) {
        _pendingPairingLink.value = raw?.takeIf { it.isNotBlank() }
    }

    fun consumePendingPairingLink(): String? {
        val cur = _pendingPairingLink.value
        if (cur != null) _pendingPairingLink.value = null
        return cur
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        env = AppEnvironment.get(this)
        prefs = AppPreferencesStore(this)
        scope.launch {
            env.bootstrap()
            env.resumeIfConfigured()
        }
    }

    companion object {
        @Volatile private var instance: TrifectaApp? = null

        fun get(): TrifectaApp = instance
            ?: throw IllegalStateException("TrifectaApp has not been initialised yet")
    }
}
