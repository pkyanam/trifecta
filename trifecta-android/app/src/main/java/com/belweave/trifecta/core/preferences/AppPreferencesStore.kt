package com.belweave.trifecta.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.AppAppearance
import com.belweave.trifecta.designsystem.ComposerSize
import com.belweave.trifecta.designsystem.TranscriptDensity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "t3_app_prefs")

/**
 * Persistent UI preferences (appearance, accent, transcript density, composer size).
 *
 * Mirrors the iOS `@AppStorage` keys used by `AppPreferences`/Settings.
 */
class AppPreferencesStore(private val appContext: Context) {

    private object Keys {
        val Appearance = stringPreferencesKey("appAppearance")
        val Accent = stringPreferencesKey("appAccent")
        val TranscriptDensity = stringPreferencesKey("transcriptDensity")
        val ComposerSize = stringPreferencesKey("composerSize")
    }

    val appearance: Flow<AppAppearance> = appContext.dataStore.data
        .map { AppAppearance.fromRaw(it[Keys.Appearance]) }
    val accent: Flow<AppAccent> = appContext.dataStore.data
        .map { AppAccent.fromRaw(it[Keys.Accent]) }
    val transcriptDensity: Flow<TranscriptDensity> = appContext.dataStore.data
        .map { TranscriptDensity.fromRaw(it[Keys.TranscriptDensity]) }
    val composerSize: Flow<ComposerSize> = appContext.dataStore.data
        .map { ComposerSize.fromRaw(it[Keys.ComposerSize]) }

    suspend fun setAppearance(value: AppAppearance) = put(Keys.Appearance, value.raw)
    suspend fun setAccent(value: AppAccent) = put(Keys.Accent, value.raw)
    suspend fun setTranscriptDensity(value: TranscriptDensity) = put(Keys.TranscriptDensity, value.raw)
    suspend fun setComposerSize(value: ComposerSize) = put(Keys.ComposerSize, value.raw)

    suspend fun snapshot(): Snapshot {
        val prefs: Preferences = appContext.dataStore.data.first()
        return Snapshot(
            appearance = AppAppearance.fromRaw(prefs[Keys.Appearance]),
            accent = AppAccent.fromRaw(prefs[Keys.Accent]),
            transcriptDensity = TranscriptDensity.fromRaw(prefs[Keys.TranscriptDensity]),
            composerSize = ComposerSize.fromRaw(prefs[Keys.ComposerSize])
        )
    }

    private suspend fun put(key: Preferences.Key<String>, value: String) {
        appContext.dataStore.edit { it[key] = value }
    }

    data class Snapshot(
        val appearance: AppAppearance,
        val accent: AppAccent,
        val transcriptDensity: TranscriptDensity,
        val composerSize: ComposerSize
    )
}
