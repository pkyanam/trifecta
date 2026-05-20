package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.time.Instant

enum class SshAuthMethod(val raw: String) {
    AGENT_FORWARD("agent-forward"),
    KEYCHAIN_KEY("keychain-key"),
    PASSWORD_PROMPT("password-prompt");

    val label: String
        get() = when (this) {
            AGENT_FORWARD -> "SSH Agent"
            KEYCHAIN_KEY -> "SSH Key"
            PASSWORD_PROMPT -> "Password"
        }

    val testingNote: String
        get() = when (this) {
            AGENT_FORWARD -> "Requires the Desktop app server to have SSH_AUTH_SOCK with a loaded key."
            KEYCHAIN_KEY -> "Uses Desktop OpenSSH public-key auth with local SSH configuration."
            PASSWORD_PROMPT -> "Password auth is not wired for mobile yet."
        }

    companion object {
        fun fromRaw(raw: String?): SshAuthMethod =
            values().firstOrNull { it.raw == raw } ?: AGENT_FORWARD
    }
}

data class SshHostProfile(
    val id: String,
    val label: String,
    val hostname: String,
    val port: Int,
    val username: String,
    val authMethod: SshAuthMethod,
    val expectedFingerprint: String?,
    val createdAt: Instant,
    val updatedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): SshHostProfile? {
            return SshHostProfile(
                id = obj.str("id") ?: return null,
                label = obj.str("label") ?: return null,
                hostname = obj.str("hostname") ?: return null,
                port = obj.intAt("port") ?: 22,
                username = obj.str("username") ?: return null,
                authMethod = SshAuthMethod.fromRaw(obj.str("authMethod")),
                expectedFingerprint = obj.str("expectedFingerprint"),
                createdAt = Iso8601.parse(obj.str("createdAt")) ?: Instant.now(),
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now()
            )
        }
    }
}

enum class SshSessionStatus(val raw: String) {
    PENDING_HOST_KEY("pending-host-key"),
    AUTHENTICATING("authenticating"),
    RUNNING("running"),
    CLOSED("closed"),
    ERROR("error");

    companion object {
        fun fromRaw(raw: String?): SshSessionStatus =
            values().firstOrNull { it.raw == raw } ?: ERROR
    }
}

data class SshSessionSnapshot(
    val sessionId: String,
    val hostId: String,
    val status: SshSessionStatus,
    val cols: Int,
    val rows: Int,
    val openedAt: Instant,
    val lastActivityAt: Instant,
    val closedAt: Instant?,
    val exitCode: Int?
) {
    companion object {
        fun fromJson(obj: JsonObject): SshSessionSnapshot? {
            return SshSessionSnapshot(
                sessionId = obj.str("sessionId") ?: return null,
                hostId = obj.str("hostId") ?: return null,
                status = SshSessionStatus.fromRaw(obj.str("status")),
                cols = obj.intAt("cols") ?: 80,
                rows = obj.intAt("rows") ?: 24,
                openedAt = Iso8601.parse(obj.str("openedAt")) ?: Instant.now(),
                lastActivityAt = Iso8601.parse(obj.str("lastActivityAt")) ?: Instant.now(),
                closedAt = Iso8601.parse(obj.str("closedAt")),
                exitCode = obj.intAt("exitCode")
            )
        }
    }
}

data class SshOpenSessionResult(
    val snapshot: SshSessionSnapshot,
    val sessionToken: String,
    val sessionTokenExpiresAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): SshOpenSessionResult? {
            val snapshot = SshSessionSnapshot.fromJson(obj.obj("snapshot") ?: return null) ?: return null
            return SshOpenSessionResult(
                snapshot = snapshot,
                sessionToken = obj.str("sessionToken") ?: return null,
                sessionTokenExpiresAt = Iso8601.parse(obj.str("sessionTokenExpiresAt")) ?: Instant.now()
            )
        }
    }
}

data class SshHostKeyPrompt(
    val sessionId: String,
    val hostId: String,
    val hostname: String,
    val port: Int,
    val keyType: String,
    val fingerprintSha256: String,
    val promptedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): SshHostKeyPrompt? {
            return SshHostKeyPrompt(
                sessionId = obj.str("sessionId") ?: return null,
                hostId = obj.str("hostId") ?: return null,
                hostname = obj.str("hostname") ?: return null,
                port = obj.intAt("port") ?: 22,
                keyType = obj.str("keyType") ?: return null,
                fingerprintSha256 = obj.str("fingerprintSha256") ?: return null,
                promptedAt = Iso8601.parse(obj.str("promptedAt")) ?: Instant.now()
            )
        }
    }
}

sealed class SshTerminalEvent {
    data class Status(val snapshot: SshSessionSnapshot) : SshTerminalEvent()
    data class Output(val data: String) : SshTerminalEvent()
    data class HostKeyPromptEvent(val prompt: SshHostKeyPrompt) : SshTerminalEvent()
    data class Error(val message: String) : SshTerminalEvent()
    data class Exited(val exitCode: Int?) : SshTerminalEvent()

    companion object {
        fun fromJson(element: JsonElement): SshTerminalEvent? {
            val obj = element.asObjectOrNull() ?: return null
            return when (obj.str("type")) {
                "status" -> {
                    val snapshot = SshSessionSnapshot.fromJson(obj.obj("snapshot") ?: return null) ?: return null
                    Status(snapshot)
                }
                "output" -> Output(obj.str("data") ?: "")
                "host-key-prompt" -> {
                    val prompt = SshHostKeyPrompt.fromJson(obj.obj("prompt") ?: return null) ?: return null
                    HostKeyPromptEvent(prompt)
                }
                "error" -> Error(obj.str("message") ?: "Unknown SSH error")
                "exited" -> Exited(obj.intAt("exitCode"))
                else -> null
            }
        }
    }
}
