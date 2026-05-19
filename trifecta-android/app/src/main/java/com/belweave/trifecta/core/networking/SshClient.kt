package com.belweave.trifecta.core.networking

import android.util.Log
import com.belweave.trifecta.core.models.SshAuthMethod
import com.belweave.trifecta.core.models.SshHostProfile
import com.belweave.trifecta.core.models.SshOpenSessionResult
import com.belweave.trifecta.core.models.SshSessionSnapshot
import com.belweave.trifecta.core.models.SshTerminalEvent
import com.belweave.trifecta.core.models.asArrayOrNull
import com.belweave.trifecta.core.models.asObjectOrNull
import com.belweave.trifecta.core.models.booleanOrNull
import com.belweave.trifecta.core.models.stringOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class ShellProfileSetupResult(
    val shellProfile: String,
    val alreadyPresent: Boolean
)

fun interface SshTerminalEventListener {
    fun onEvent(event: SshTerminalEvent)
}

suspend fun T3Client.sshListHosts(): List<SshHostProfile> {
    val value = request("ssh.listHosts", JsonObject(emptyMap()))
        ?: throw T3Error.DecodingFailed("Empty ssh.listHosts response")
    val obj = value.asObjectOrNull() ?: throw T3Error.DecodingFailed("ssh.listHosts response was not an object")
    return obj["hosts"]
        ?.asArrayOrNull()
        ?.mapNotNull { it.asObjectOrNull()?.let(SshHostProfile.Companion::fromJson) }
        ?: obj["hosts"]
            ?.asObjectOrNull()
            ?.values
        ?.mapNotNull { it.asObjectOrNull()?.let(SshHostProfile.Companion::fromJson) }
        ?: emptyList()
}

suspend fun T3Client.sshAddHost(
    label: String,
    hostname: String,
    port: Int,
    username: String,
    authMethod: SshAuthMethod
): SshHostProfile {
    val payload = buildJsonObject {
        put("label", label)
        put("hostname", hostname)
        put("port", port)
        put("username", username)
        put("authMethod", authMethod.raw)
    }
    val value = request("ssh.addHost", payload)
        ?: throw T3Error.DecodingFailed("Empty ssh.addHost response")
    val obj = value.asObjectOrNull() ?: throw T3Error.DecodingFailed("ssh.addHost response was not an object")
    return SshHostProfile.fromJson(obj) ?: throw T3Error.DecodingFailed("Could not decode ssh host profile")
}

suspend fun T3Client.sshRemoveHost(hostId: String) {
    request("ssh.removeHost", buildJsonObject { put("hostId", hostId) })
}

suspend fun T3Client.sshOpenSession(hostId: String, cols: Int = 80, rows: Int = 24): SshOpenSessionResult {
    val payload = buildJsonObject {
        put("hostId", hostId)
        put("cols", cols)
        put("rows", rows)
    }
    val value = request("ssh.openSession", payload)
        ?: throw T3Error.DecodingFailed("Empty ssh.openSession response")
    val obj = value.asObjectOrNull() ?: throw T3Error.DecodingFailed("ssh.openSession response was not an object")
    return SshOpenSessionResult.fromJson(obj) ?: throw T3Error.DecodingFailed("Could not decode ssh session")
}

suspend fun T3Client.sshSendInput(sessionId: String, data: String) {
    request("ssh.sendInput", buildJsonObject {
        put("sessionId", sessionId)
        put("data", data)
    })
}

suspend fun T3Client.sshResize(sessionId: String, cols: Int, rows: Int) {
    request("ssh.resize", buildJsonObject {
        put("sessionId", sessionId)
        put("cols", cols)
        put("rows", rows)
    })
}

suspend fun T3Client.sshConfirmHostKey(
    sessionId: String,
    fingerprintSha256: String,
    approve: Boolean,
    remember: Boolean
): SshSessionSnapshot {
    val payload = buildJsonObject {
        put("sessionId", sessionId)
        put("fingerprintSha256", fingerprintSha256)
        put("decision", if (approve) "approve" else "reject")
        put("remember", remember)
    }
    val value = request("ssh.confirmHostKey", payload)
        ?: throw T3Error.DecodingFailed("Empty ssh.confirmHostKey response")
    val obj = value.asObjectOrNull() ?: throw T3Error.DecodingFailed("ssh.confirmHostKey response was not an object")
    return SshSessionSnapshot.fromJson(obj) ?: throw T3Error.DecodingFailed("Could not decode ssh session snapshot")
}

suspend fun T3Client.sshCloseSession(sessionId: String) {
    request("ssh.closeSession", buildJsonObject { put("sessionId", sessionId) })
}

suspend fun T3Client.sshSetupShellProfile(): ShellProfileSetupResult {
    val value = request("ssh.setupShellProfile", JsonObject(emptyMap()))
        ?: throw T3Error.DecodingFailed("Empty ssh.setupShellProfile response")
    val obj = value.asObjectOrNull() ?: throw T3Error.DecodingFailed("ssh.setupShellProfile response was not an object")
    val shellProfile = obj["shellProfile"].stringOrNull()
        ?: throw T3Error.DecodingFailed("Missing shellProfile in ssh.setupShellProfile response")
    val alreadyPresent = obj["alreadyPresent"].booleanOrNull()
        ?: throw T3Error.DecodingFailed("Missing alreadyPresent in ssh.setupShellProfile response")
    return ShellProfileSetupResult(shellProfile = shellProfile, alreadyPresent = alreadyPresent)
}

suspend fun T3Client.subscribeSshTerminal(
    sessionId: String,
    listener: SshTerminalEventListener
): StreamSubscription {
    return subscribe("subscribeSshTerminal", buildJsonObject { put("sessionId", sessionId) }) { value ->
        val event = SshTerminalEvent.fromJson(value)
        if (event != null) {
            listener.onEvent(event)
        } else {
            Log.w("T3Client", "Discarded SSH terminal event: $value")
        }
    }
}
