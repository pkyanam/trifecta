package com.belweave.trifecta.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted secure storage for bearer tokens and other secrets.
 * Mirrors the iOS Keychain abstraction by exposing typed `Key` slots
 * plus an `account`-based API for per-profile storage.
 */
class KeychainStore(context: Context) {

    enum class Key(val rawValue: String) {
        BearerToken("t3.bearer.token"),
        ServerURL("t3.server.url")
    }

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun save(value: String, key: Key) = save(value, account = key.rawValue)
    fun read(key: Key): String? = read(account = key.rawValue)
    fun delete(key: Key) = delete(account = key.rawValue)

    fun save(value: String, account: String) {
        prefs.edit().putString(account, value).apply()
    }

    fun read(account: String): String? = prefs.getString(account, null)

    fun delete(account: String) {
        prefs.edit().remove(account).apply()
    }

    companion object {
        private const val FILE_NAME = "t3_secure_prefs"
    }
}
