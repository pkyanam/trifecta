package com.belweave.trifecta.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.belweave.trifecta.core.models.T3Json
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.net.URI
import java.time.Instant
import java.util.UUID

@Serializable
data class SavedServerProfile(
    val id: String,
    var name: String,
    val serverURLString: String,
    val createdAtIso: String,
    var lastUsedAtIso: String
) {
    val serverURL: URI
        get() = URI.create(serverURLString)
    val createdAt: Instant
        get() = Instant.parse(createdAtIso)
    val lastUsedAt: Instant
        get() = Instant.parse(lastUsedAtIso)

    companion object {
        fun create(serverURL: URI, name: String, now: Instant = Instant.now()): SavedServerProfile =
            SavedServerProfile(
                id = UUID.randomUUID().toString(),
                name = name,
                serverURLString = serverURL.toString(),
                createdAtIso = now.toString(),
                lastUsedAtIso = now.toString()
            )
    }
}

private val Context.profileStore by preferencesDataStore(name = "t3_profiles")

class SavedProfileStore(private val appContext: Context) {

    private object Keys {
        val Profiles = stringPreferencesKey("savedServerProfiles")
        val ActiveID = stringPreferencesKey("activeServerProfileID")
    }

    suspend fun load(): Pair<List<SavedServerProfile>, String?> {
        val prefs = appContext.profileStore.data.first()
        val raw = prefs[Keys.Profiles]
        val profiles = if (raw.isNullOrBlank()) emptyList() else
            runCatching {
                T3Json.decodeFromString(ListSerializer(SavedServerProfile.serializer()), raw)
            }.getOrDefault(emptyList())
        return profiles to prefs[Keys.ActiveID]
    }

    suspend fun save(profiles: List<SavedServerProfile>, activeID: String?) {
        appContext.profileStore.edit { p ->
            val encoded = T3Json.encodeToString(
                ListSerializer(SavedServerProfile.serializer()),
                profiles
            )
            p[Keys.Profiles] = encoded
            if (activeID != null) p[Keys.ActiveID] = activeID
            else p.remove(Keys.ActiveID)
        }
    }
}
