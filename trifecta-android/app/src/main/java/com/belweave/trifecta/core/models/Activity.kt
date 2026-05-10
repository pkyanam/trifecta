package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonObject
import java.time.Instant

@JvmInline
value class ApprovalRequestID(val rawValue: String)

enum class ApprovalRequestKind(val raw: String, val displayLabel: String) {
    COMMAND("command", "Run command"),
    FILE_READ("file-read", "Read file"),
    FILE_CHANGE("file-change", "Change files");

    companion object {
        fun fromRaw(raw: String?): ApprovalRequestKind? =
            values().firstOrNull { it.raw == raw }
    }
}

enum class ApprovalDecision(val raw: String, val label: String) {
    ACCEPT("accept", "Accept"),
    ACCEPT_FOR_SESSION("acceptForSession", "Accept for session"),
    DECLINE("decline", "Decline"),
    CANCEL("cancel", "Cancel")
}

data class PendingApproval(
    val requestId: ApprovalRequestID,
    val kind: ApprovalRequestKind,
    val detail: String?,
    val createdAt: Instant
)

data class UserInputOption(val label: String, val description: String)

data class UserInputQuestion(
    val id: String,
    val header: String,
    val question: String,
    val options: List<UserInputOption>,
    val multiSelect: Boolean
)

data class PendingUserInput(
    val requestId: ApprovalRequestID,
    val questions: List<UserInputQuestion>,
    val createdAt: Instant
)

data class ProposedPlan(
    val id: String,
    val turnId: TurnID?,
    val planMarkdown: String,
    val implementedAt: Instant?,
    val implementationThreadId: ThreadID?,
    val createdAt: Instant,
    val updatedAt: Instant
) {
    val isImplementable: Boolean get() = implementedAt == null

    companion object {
        fun fromJson(obj: JsonObject?): ProposedPlan? {
            if (obj == null) return null
            return ProposedPlan(
                id = obj.str("id") ?: return null,
                turnId = obj.str("turnId")?.let { TurnID(it) },
                planMarkdown = obj.str("planMarkdown") ?: return null,
                implementedAt = Iso8601.parse(obj.str("implementedAt")),
                implementationThreadId = obj.str("implementationThreadId")?.let { ThreadID(it) },
                createdAt = Iso8601.parse(obj.str("createdAt")) ?: return null,
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: return null
            )
        }
    }
}

data class ThreadActivity(
    val id: String,
    val kind: String,
    val tone: String,
    val summary: String,
    val turnId: TurnID?,
    val createdAt: Instant,
    val payload: JsonObject?
) {
    val requestId: ApprovalRequestID?
        get() = payload?.str("requestId")?.let { ApprovalRequestID(it) }

    val requestKind: ApprovalRequestKind?
        get() {
            val raw = payload?.str("requestKind")
            ApprovalRequestKind.fromRaw(raw)?.let { return it }
            return when (payload?.str("requestType")) {
                "command_execution_approval", "exec_command_approval", "dynamic_tool_call" ->
                    ApprovalRequestKind.COMMAND
                "file_read_approval" -> ApprovalRequestKind.FILE_READ
                "file_change_approval", "apply_patch_approval" -> ApprovalRequestKind.FILE_CHANGE
                else -> null
            }
        }

    val detail: String?
        get() = payload?.str("detail")?.takeIf { it.isNotEmpty() }

    companion object {
        fun fromJson(obj: JsonObject?): ThreadActivity? {
            if (obj == null) return null
            val id = obj.str("id") ?: return null
            val kind = obj.str("kind") ?: return null
            val summary = obj.str("summary") ?: return null
            val createdAt = Iso8601.parse(obj.str("createdAt")) ?: return null
            return ThreadActivity(
                id = id,
                kind = kind,
                tone = obj.str("tone") ?: "info",
                summary = summary,
                turnId = obj.str("turnId")?.let { TurnID(it) },
                createdAt = createdAt,
                payload = obj.obj("payload")
            )
        }
    }
}

// MARK: - Project search

data class ProjectSearchEntry(
    val path: String,
    val kind: String,
    val parentPath: String?
) {
    val isDirectory: Boolean get() = kind == "directory"

    companion object {
        fun fromJson(obj: JsonObject): ProjectSearchEntry? {
            val path = obj.str("path") ?: return null
            return ProjectSearchEntry(
                path = path,
                kind = obj.str("kind") ?: "file",
                parentPath = obj.str("parentPath")
            )
        }
    }
}

data class ProjectSearchEntriesResult(
    val entries: List<ProjectSearchEntry>,
    val truncated: Boolean
) {
    companion object {
        fun fromJson(obj: JsonObject): ProjectSearchEntriesResult {
            val entries = obj.arr("entries")
                ?.mapNotNull { ProjectSearchEntry.fromJson(it.asObjectOrNull() ?: return@mapNotNull null) }
                ?: emptyList()
            return ProjectSearchEntriesResult(
                entries = entries,
                truncated = obj.bool("truncated") ?: false
            )
        }
    }
}
