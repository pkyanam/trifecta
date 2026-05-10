package com.belweave.trifecta.core.env

import android.content.Context
import com.belweave.trifecta.core.auth.KeychainStore
import com.belweave.trifecta.core.models.ServerRuntimeConfig
import com.belweave.trifecta.core.networking.ConnectionState
import com.belweave.trifecta.core.networking.T3Client
import com.belweave.trifecta.core.networking.T3Connection
import com.belweave.trifecta.core.preferences.SavedProfileStore
import com.belweave.trifecta.core.preferences.SavedServerProfile
import com.belweave.trifecta.core.stores.ThreadListStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.net.URI
import java.time.Instant

/**
 * Singleton root that owns the active connection, client, profile list,
 * server config, and thread-list store. Mirrors the iOS `AppEnvironment`.
 */
class AppEnvironment(context: Context) {

    sealed class SessionState {
        object Unconfigured : SessionState()
        data class Configured(val serverURL: URI) : SessionState()
    }

    private val appContext = context.applicationContext
    private val keychain = KeychainStore(appContext)
    private val profileStore = SavedProfileStore(appContext)

    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Unconfigured)
    val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Offline)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _savedProfiles = MutableStateFlow<List<SavedServerProfile>>(emptyList())
    val savedProfiles: StateFlow<List<SavedServerProfile>> = _savedProfiles.asStateFlow()

    private val _activeProfileID = MutableStateFlow<String?>(null)
    val activeProfileID: StateFlow<String?> = _activeProfileID.asStateFlow()

    private val _serverConfig = MutableStateFlow<ServerRuntimeConfig?>(null)
    val serverConfig: StateFlow<ServerRuntimeConfig?> = _serverConfig.asStateFlow()

    private val _serverConfigError = MutableStateFlow<String?>(null)
    val serverConfigError: StateFlow<String?> = _serverConfigError.asStateFlow()

    val threadList = ThreadListStore()

    private val mutex = Mutex()
    private var connection: T3Connection? = null
    private var client: T3Client? = null
    private var statusJob: Job? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val tokenPrefix = "t3.bearer.token.profile."

    suspend fun bootstrap() {
        val (profiles, activeID) = profileStore.load()
        _savedProfiles.value = profiles
        _activeProfileID.value = activeID
        val active = activeProfile() ?: profiles.maxByOrNull { it.lastUsedAt }
        if (active != null) {
            _sessionState.value = SessionState.Configured(active.serverURL)
        }
    }

    suspend fun resumeIfConfigured() {
        val active = activeProfile()
            ?: _savedProfiles.value.maxByOrNull { it.lastUsedAt }
            ?: return
        val token = keychain.read(tokenAccount(active.id)) ?: return
        _activeProfileID.value = active.id
        markProfileUsed(active.id)
        _sessionState.value = SessionState.Configured(active.serverURL)
        startClient(active.serverURL, token)
    }

    suspend fun configure(serverURL: URI, bearerToken: String, name: String? = null) {
        val displayName = (name?.trim()?.takeIf { it.isNotEmpty() })
            ?: (serverURL.host ?: serverURL.toString())
        val profileID = upsertProfile(serverURL, displayName)
        keychain.save(bearerToken, account = tokenAccount(profileID))
        _activeProfileID.value = profileID
        persistProfiles()
        _sessionState.value = SessionState.Configured(serverURL)
        startClient(serverURL, bearerToken)
    }

    suspend fun switchToProfile(id: String) {
        val profile = _savedProfiles.value.firstOrNull { it.id == id } ?: return
        val token = keychain.read(tokenAccount(id)) ?: return
        _activeProfileID.value = id
        markProfileUsed(id)
        _sessionState.value = SessionState.Configured(profile.serverURL)
        startClient(profile.serverURL, token)
    }

    suspend fun renameProfile(id: String, name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        _savedProfiles.value = _savedProfiles.value.map {
            if (it.id == id) it.copy(name = trimmed) else it
        }
        persistProfiles()
    }

    suspend fun removeProfile(id: String) {
        val wasActive = (_activeProfileID.value == id)
        keychain.delete(tokenAccount(id))
        _savedProfiles.value = _savedProfiles.value.filterNot { it.id == id }
        persistProfiles()
        if (!wasActive) return

        stopClient()
        threadList.reset()
        _serverConfig.value = null
        _serverConfigError.value = null
        _connectionState.value = ConnectionState.Offline

        val next = _savedProfiles.value.maxByOrNull { it.lastUsedAt }
        if (next != null) {
            _activeProfileID.value = next.id
            _sessionState.value = SessionState.Configured(next.serverURL)
            keychain.read(tokenAccount(next.id))?.let { token ->
                startClient(next.serverURL, token)
            }
        } else {
            _activeProfileID.value = null
            _sessionState.value = SessionState.Unconfigured
        }
    }

    suspend fun signOut() {
        stopClient()
        val active = _activeProfileID.value
        if (active != null) {
            keychain.delete(tokenAccount(active))
            _savedProfiles.value = _savedProfiles.value.filterNot { it.id == active }
            _activeProfileID.value = null
            persistProfiles()
        }
        val next = _savedProfiles.value.maxByOrNull { it.lastUsedAt }
        if (next != null) {
            _activeProfileID.value = next.id
            _sessionState.value = SessionState.Configured(next.serverURL)
        } else {
            _sessionState.value = SessionState.Unconfigured
        }
        _connectionState.value = ConnectionState.Offline
        _serverConfig.value = null
        _serverConfigError.value = null
        threadList.reset()
    }

    fun client(): T3Client? = client

    suspend fun refreshServerConfig() {
        val cli = client ?: return
        try {
            val cfg = cli.getServerConfig()
            _serverConfig.value = cfg
            _serverConfigError.value = null
        } catch (t: Throwable) {
            _serverConfigError.value = t.message
        }
    }

    private suspend fun startClient(serverURL: URI, bearerToken: String) {
        stopClient()
        val conn = T3Connection(T3Connection.Config(serverURL, bearerToken))
        val cli = T3Client(conn)
        mutex.withLock {
            connection = conn
            client = cli
        }

        statusJob = scope.launch {
            cli.addStatusListener { status ->
                _connectionState.value = when (status) {
                    is T3Connection.ConnectionStatus.Offline -> ConnectionState.Offline
                    is T3Connection.ConnectionStatus.Connecting -> ConnectionState.Connecting
                    is T3Connection.ConnectionStatus.Connected -> ConnectionState.Connected
                    is T3Connection.ConnectionStatus.Error -> ConnectionState.Error(status.message)
                }
            }
        }

        val connected = cli.start()
        if (connected) {
            _activeProfileID.value?.let { markProfileUsed(it) }
            refreshServerConfig()
            threadList.start(cli)
        }
    }

    private suspend fun stopClient() {
        statusJob?.cancel()
        statusJob = null
        threadList.stop()
        val (oldClient, oldConn) = mutex.withLock {
            val c = client
            val n = connection
            client = null
            connection = null
            c to n
        }
        oldClient?.stop()
        oldConn?.shutdown()
    }

    private fun activeProfile(): SavedServerProfile? {
        val id = _activeProfileID.value ?: return null
        return _savedProfiles.value.firstOrNull { it.id == id }
    }

    private fun tokenAccount(profileID: String): String = tokenPrefix + profileID

    private suspend fun upsertProfile(serverURL: URI, name: String): String {
        val now = Instant.now()
        val existingIndex = _savedProfiles.value.indexOfFirst {
            it.serverURLString == serverURL.toString()
        }
        return if (existingIndex >= 0) {
            val list = _savedProfiles.value.toMutableList()
            list[existingIndex] = list[existingIndex].copy(
                name = name,
                lastUsedAtIso = now.toString()
            )
            _savedProfiles.value = list
            list[existingIndex].id
        } else {
            val profile = SavedServerProfile.create(serverURL, name, now)
            _savedProfiles.value = _savedProfiles.value + profile
            profile.id
        }
    }

    private suspend fun markProfileUsed(id: String) {
        val now = Instant.now()
        _savedProfiles.value = _savedProfiles.value.map {
            if (it.id == id) it.copy(lastUsedAtIso = now.toString()) else it
        }
        persistProfiles()
    }

    private suspend fun persistProfiles() {
        profileStore.save(_savedProfiles.value, _activeProfileID.value)
    }

    companion object {
        @Volatile private var INSTANCE: AppEnvironment? = null

        fun get(context: Context): AppEnvironment {
            val existing = INSTANCE
            if (existing != null) return existing
            return synchronized(this) {
                val again = INSTANCE
                if (again != null) again
                else AppEnvironment(context).also { INSTANCE = it }
            }
        }
    }
}
