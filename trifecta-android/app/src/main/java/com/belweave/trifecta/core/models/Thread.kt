package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonObject
import java.time.Instant

enum class RuntimeMode(val raw: String) {
    APPROVAL_REQUIRED("approval-required"),
    AUTO_ACCEPT_EDITS("auto-accept-edits"),
    FULL_ACCESS("full-access");

    companion object {
        fun fromRaw(raw: String?): RuntimeMode =
            values().firstOrNull { it.raw == raw } ?: FULL_ACCESS
    }
}

enum class ProviderInteractionMode(val raw: String) {
    DEFAULT("default"),
    PLAN("plan");

    companion object {
        fun fromRaw(raw: String?): ProviderInteractionMode =
            values().firstOrNull { it.raw == raw } ?: DEFAULT
    }
}

enum class LatestTurnState(val raw: String) {
    RUNNING("running"),
    INTERRUPTED("interrupted"),
    COMPLETED("completed"),
    ERROR("error");

    companion object {
        fun fromRaw(raw: String?): LatestTurnState =
            values().firstOrNull { it.raw == raw } ?: COMPLETED
    }
}

data class LatestTurn(
    val turnId: TurnID,
    val state: LatestTurnState,
    val requestedAt: Instant,
    val startedAt: Instant?,
    val completedAt: Instant?,
    val assistantMessageId: MessageID?
) {
    companion object {
        fun fromJson(obj: JsonObject?): LatestTurn? {
            if (obj == null) return null
            val turnId = obj.str("turnId")?.let { TurnID(it) } ?: return null
            val state = LatestTurnState.fromRaw(obj.str("state"))
            val requestedAt = Iso8601.parse(obj.str("requestedAt")) ?: Instant.now()
            return LatestTurn(
                turnId = turnId,
                state = state,
                requestedAt = requestedAt,
                startedAt = Iso8601.parse(obj.str("startedAt")),
                completedAt = Iso8601.parse(obj.str("completedAt")),
                assistantMessageId = obj.str("assistantMessageId")?.let { MessageID(it) }
            )
        }
    }
}

enum class SessionStatus(val raw: String) {
    IDLE("idle"),
    STARTING("starting"),
    RUNNING("running"),
    READY("ready"),
    INTERRUPTED("interrupted"),
    STOPPED("stopped"),
    ERROR("error");

    companion object {
        fun fromRaw(raw: String?): SessionStatus =
            values().firstOrNull { it.raw == raw } ?: IDLE
    }
}

data class OrchestrationSession(
    val threadId: ThreadID,
    val status: SessionStatus,
    val providerName: String?,
    val providerInstanceId: ProviderInstanceID?,
    val runtimeMode: RuntimeMode,
    val activeTurnId: TurnID?,
    val lastError: String?,
    val updatedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject?): OrchestrationSession? {
            if (obj == null) return null
            val threadId = obj.str("threadId")?.let { ThreadID(it) } ?: return null
            return OrchestrationSession(
                threadId = threadId,
                status = SessionStatus.fromRaw(obj.str("status")),
                providerName = obj.str("providerName"),
                providerInstanceId = obj.str("providerInstanceId")?.let { ProviderInstanceID(it) },
                runtimeMode = RuntimeMode.fromRaw(obj.str("runtimeMode")),
                activeTurnId = obj.str("activeTurnId")?.let { TurnID(it) },
                lastError = obj.str("lastError"),
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now()
            )
        }
    }
}

data class ThreadShell(
    val id: ThreadID,
    val projectId: ProjectID,
    val title: String,
    val modelSelection: ModelSelection,
    val runtimeMode: RuntimeMode,
    val interactionMode: ProviderInteractionMode,
    val branch: String?,
    val worktreePath: String?,
    val latestTurn: LatestTurn?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val archivedAt: Instant?,
    val session: OrchestrationSession?,
    val latestUserMessageAt: Instant?,
    val hasPendingApprovals: Boolean,
    val hasPendingUserInput: Boolean,
    val hasActionableProposedPlan: Boolean
) {
    companion object {
        fun fromJson(obj: JsonObject): ThreadShell? {
            val id = obj.str("id")?.let { ThreadID(it) } ?: return null
            val projectId = obj.str("projectId")?.let { ProjectID(it) } ?: return null
            val title = obj.str("title") ?: "Untitled"
            val modelSelection = ModelSelection.fromJson(obj.obj("modelSelection")) ?: return null
            return ThreadShell(
                id = id,
                projectId = projectId,
                title = title,
                modelSelection = modelSelection,
                runtimeMode = RuntimeMode.fromRaw(obj.str("runtimeMode")),
                interactionMode = ProviderInteractionMode.fromRaw(obj.str("interactionMode")),
                branch = obj.str("branch"),
                worktreePath = obj.str("worktreePath"),
                latestTurn = LatestTurn.fromJson(obj.obj("latestTurn")),
                createdAt = Iso8601.parse(obj.str("createdAt")) ?: Instant.now(),
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now(),
                archivedAt = Iso8601.parse(obj.str("archivedAt")),
                session = OrchestrationSession.fromJson(obj.obj("session")),
                latestUserMessageAt = Iso8601.parse(obj.str("latestUserMessageAt")),
                hasPendingApprovals = obj.bool("hasPendingApprovals") ?: false,
                hasPendingUserInput = obj.bool("hasPendingUserInput") ?: false,
                hasActionableProposedPlan = obj.bool("hasActionableProposedPlan") ?: false
            )
        }
    }
}

data class ProjectShell(
    val id: ProjectID,
    val title: String,
    val workspaceRoot: String,
    val defaultModelSelection: ModelSelection?,
    val createdAt: Instant,
    val updatedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): ProjectShell? {
            val id = obj.str("id")?.let { ProjectID(it) } ?: return null
            return ProjectShell(
                id = id,
                title = obj.str("title") ?: "Project",
                workspaceRoot = obj.str("workspaceRoot") ?: "",
                defaultModelSelection = ModelSelection.fromJson(obj.obj("defaultModelSelection")),
                createdAt = Iso8601.parse(obj.str("createdAt")) ?: Instant.now(),
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now()
            )
        }
    }
}

data class ThreadDetail(
    val id: ThreadID,
    val projectId: ProjectID,
    val title: String,
    val modelSelection: ModelSelection,
    val runtimeMode: RuntimeMode,
    val interactionMode: ProviderInteractionMode,
    val branch: String?,
    val worktreePath: String?,
    val latestTurn: LatestTurn?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val archivedAt: Instant?,
    val messages: List<Message>,
    val session: OrchestrationSession?,
    val proposedPlans: List<ProposedPlan>,
    val activities: List<ThreadActivity>
) {
    companion object {
        fun fromJson(obj: JsonObject): ThreadDetail? {
            val id = obj.str("id")?.let { ThreadID(it) } ?: return null
            val projectId = obj.str("projectId")?.let { ProjectID(it) } ?: return null
            val title = obj.str("title") ?: "Untitled"
            val modelSelection = ModelSelection.fromJson(obj.obj("modelSelection")) ?: return null
            val messages = obj.arr("messages")
                ?.mapNotNull { Message.fromJson(it.asObjectOrNull() ?: return@mapNotNull null) }
                ?.sortedBy { it.createdAt }
                ?: emptyList()
            val plans = obj.arr("proposedPlans")
                ?.mapNotNull { ProposedPlan.fromJson(it.asObjectOrNull()) }
                ?: emptyList()
            val activities = obj.arr("activities")
                ?.mapNotNull { ThreadActivity.fromJson(it.asObjectOrNull()) }
                ?: emptyList()
            return ThreadDetail(
                id = id,
                projectId = projectId,
                title = title,
                modelSelection = modelSelection,
                runtimeMode = RuntimeMode.fromRaw(obj.str("runtimeMode")),
                interactionMode = ProviderInteractionMode.fromRaw(obj.str("interactionMode")),
                branch = obj.str("branch"),
                worktreePath = obj.str("worktreePath"),
                latestTurn = LatestTurn.fromJson(obj.obj("latestTurn")),
                createdAt = Iso8601.parse(obj.str("createdAt")) ?: Instant.now(),
                updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now(),
                archivedAt = Iso8601.parse(obj.str("archivedAt")),
                messages = messages,
                session = OrchestrationSession.fromJson(obj.obj("session")),
                proposedPlans = plans,
                activities = activities
            )
        }
    }
}

// MARK: - VCS

data class VcsWorkingTreeFile(val path: String, val insertions: Int, val deletions: Int)
data class VcsWorkingTreeSummary(
    val files: List<VcsWorkingTreeFile>,
    val insertions: Int,
    val deletions: Int
)

data class VcsStatusSummary(
    val isRepo: Boolean,
    val refName: String?,
    val hasWorkingTreeChanges: Boolean,
    val hasUpstream: Boolean,
    val aheadCount: Int,
    val behindCount: Int,
    val workingTree: VcsWorkingTreeSummary
) {
    companion object {
        fun fromJson(obj: JsonObject): VcsStatusSummary? {
            val workingTreeObj = obj.obj("workingTree") ?: return null
            val files = workingTreeObj.arr("files")?.mapNotNull { f ->
                val o = f.asObjectOrNull() ?: return@mapNotNull null
                VcsWorkingTreeFile(
                    path = o.str("path") ?: return@mapNotNull null,
                    insertions = o.intAt("insertions") ?: 0,
                    deletions = o.intAt("deletions") ?: 0
                )
            } ?: emptyList()
            return VcsStatusSummary(
                isRepo = obj.bool("isRepo") ?: false,
                refName = obj.str("refName"),
                hasWorkingTreeChanges = obj.bool("hasWorkingTreeChanges") ?: false,
                hasUpstream = obj.bool("hasUpstream") ?: false,
                aheadCount = obj.intAt("aheadCount") ?: 0,
                behindCount = obj.intAt("behindCount") ?: 0,
                workingTree = VcsWorkingTreeSummary(
                    files = files,
                    insertions = workingTreeObj.intAt("insertions") ?: 0,
                    deletions = workingTreeObj.intAt("deletions") ?: 0
                )
            )
        }
    }
}

data class VcsPullSummary(
    val status: String,
    val refName: String,
    val upstreamRef: String?
) {
    companion object {
        fun fromJson(obj: JsonObject): VcsPullSummary? {
            return VcsPullSummary(
                status = obj.str("status") ?: return null,
                refName = obj.str("refName") ?: return null,
                upstreamRef = obj.str("upstreamRef")
            )
        }
    }
}
