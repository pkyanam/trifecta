package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.time.Instant

enum class ActivityTone {
    INFO, TOOL, THINKING, ERROR, APPROVAL, SUCCESS;

    companion object {
        fun fromRaw(raw: String?): ActivityTone = when (raw?.lowercase()) {
            "tool" -> TOOL
            "thinking" -> THINKING
            "error", "failure" -> ERROR
            "approval" -> APPROVAL
            "success" -> SUCCESS
            else -> INFO
        }
    }
}

enum class ActivityIcon {
    TERMINAL, FILE_READ, FILE_EDIT, TASK_PROGRESS, TASK_DONE, SEARCH, GLOBE,
    TOOL, SPARKLES, ERROR
}

data class RenderableActivity(
    val id: String,
    val createdAt: Instant,
    val turnId: TurnID?,
    val title: String,
    val detail: String?,
    val command: String?,
    val changedFiles: List<String>,
    val icon: ActivityIcon,
    val tone: ActivityTone,
    val isInProgress: Boolean
) {
    companion object {
        /**
         * Project a [ThreadActivity] into a UI row, or null when the kind is
         * non-renderable (approval/user-input/turn boundaries).
         */
        fun from(activity: ThreadActivity): RenderableActivity? {
            when (activity.kind) {
                "tool.started", "task.started", "context-window.updated",
                "approval.requested", "approval.resolved",
                "user-input.requested", "user-input.resolved",
                "turn.plan.updated" -> return null
            }
            if (activity.summary == "Checkpoint captured") return null
            if (isPlanBoundary(activity)) return null

            val payload = activity.payload
            val title = trimNonEmpty(payload?.str("title")) ?: activity.summary
            val command = extractCommand(payload)
            val files = extractChangedFiles(payload)
            val detail = extractDetail(payload, title, command != null)
            val icon = pickIcon(activity, payload, command != null, files.isNotEmpty())
            val tone = pickTone(activity)
            val inProgress = activity.kind == "tool.updated" || activity.kind == "task.progress"

            return RenderableActivity(
                id = activity.id,
                createdAt = activity.createdAt,
                turnId = activity.turnId,
                title = title,
                detail = detail,
                command = command,
                changedFiles = files,
                icon = icon,
                tone = tone,
                isInProgress = inProgress
            )
        }

        /** Collapse `tool.updated`/`tool.completed` pairs by `toolCallId`. */
        fun collapse(activities: List<ThreadActivity>): List<RenderableActivity> {
            val ordered = activities.sortedWith(compareBy({ it.createdAt }, { it.id }))
            val byKey = LinkedHashMap<String, RenderableActivity>()
            for (a in ordered) {
                val rendered = from(a) ?: continue
                val key = collapseKey(a) ?: rendered.id
                val existing = byKey[key]
                byKey[key] = if (existing == null) rendered else merge(existing, rendered)
            }
            return byKey.values.toList()
        }

        private fun merge(prev: RenderableActivity, next: RenderableActivity): RenderableActivity =
            RenderableActivity(
                id = prev.id,
                createdAt = prev.createdAt,
                turnId = next.turnId ?: prev.turnId,
                title = if (next.title.isEmpty()) prev.title else next.title,
                detail = next.detail ?: prev.detail,
                command = next.command ?: prev.command,
                changedFiles = if (next.changedFiles.isNotEmpty()) next.changedFiles else prev.changedFiles,
                icon = next.icon,
                tone = next.tone,
                isInProgress = next.isInProgress
            )

        private fun collapseKey(a: ThreadActivity): String? {
            if (a.kind != "tool.updated" && a.kind != "tool.completed") return null
            val toolCallId = a.payload?.obj("data")?.str("toolCallId") ?: return null
            return if (toolCallId.isNotEmpty()) "tool:$toolCallId" else null
        }

        private fun trimNonEmpty(s: String?): String? = s?.trim()?.takeIf { it.isNotEmpty() }

        private fun extractCommand(payload: JsonObject?): String? {
            payload ?: return null
            val data = payload.obj("data")
            val item = data?.obj("item")
            val itemInput = item?.obj("input")
            val itemResult = item?.obj("result")
            val candidates = listOf(
                item?.get("command"),
                itemInput?.get("command"),
                itemResult?.get("command"),
                data?.get("command")
            )
            for (c in candidates) {
                normalizeCommand(c)?.let { return it }
            }
            if (payload.str("itemType") == "command_execution") {
                trimNonEmpty(payload.str("detail"))?.let { return stripExitCodeSuffix(it) }
            }
            return null
        }

        private fun normalizeCommand(value: kotlinx.serialization.json.JsonElement?): String? {
            if (value == null) return null
            return when (value) {
                is JsonPrimitive -> trimNonEmpty(value.contentOrNull)
                is JsonArray -> {
                    val parts = value.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                    if (parts.size != value.size || parts.isEmpty()) null
                    else parts.joinToString(" ") { quoteIfNeeded(it) }
                }
                else -> null
            }
        }

        private fun quoteIfNeeded(s: String): String {
            if (s.isEmpty()) return "\"\""
            val needs = s.any { it.isWhitespace() } || s.contains('"') || s.contains('\'')
            if (!needs) return s
            return "\"" + s.replace("\"", "\\\"") + "\""
        }

        private fun extractChangedFiles(payload: JsonObject?): List<String> {
            payload ?: return emptyList()
            val data = payload.obj("data")
            val item = data?.obj("item")
            val candidates = listOf(
                item?.arr("changedFiles"),
                data?.arr("changedFiles"),
                data?.arr("files")
            )
            for (arr in candidates) {
                if (arr != null) {
                    val strings = arr.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                    if (strings.isNotEmpty()) return strings
                }
            }
            return emptyList()
        }

        private fun extractDetail(payload: JsonObject?, title: String, hasCommand: Boolean): String? {
            payload ?: return null
            if (hasCommand) return null
            val raw = trimNonEmpty(payload.str("detail")) ?: return null
            val stripped = stripExitCodeSuffix(raw)
            if (stripped.equals(title, ignoreCase = true)) return null
            return stripped
        }

        private val exitCodeRegex = Regex("""^([\s\S]*?)(?:\s*<exited with exit code \d+>)\s*$""")

        private fun stripExitCodeSuffix(s: String): String {
            exitCodeRegex.matchEntire(s)?.groupValues?.getOrNull(1)?.let { return it.trim() }
            return s.trim()
        }

        private fun pickIcon(
            activity: ThreadActivity,
            payload: JsonObject?,
            hasCommand: Boolean,
            hasFiles: Boolean
        ): ActivityIcon {
            payload?.str("itemType")?.let { itemType ->
                when (itemType) {
                    "command_execution" -> return ActivityIcon.TERMINAL
                    "file_read" -> return ActivityIcon.FILE_READ
                    "file_change", "file_write", "apply_patch" -> return ActivityIcon.FILE_EDIT
                    "task_progress" -> return ActivityIcon.TASK_PROGRESS
                    "task_completed" -> return ActivityIcon.TASK_DONE
                    "search", "web_search" -> return ActivityIcon.SEARCH
                    "fetch_url", "web_fetch" -> return ActivityIcon.GLOBE
                }
            }
            if (hasCommand) return ActivityIcon.TERMINAL
            if (hasFiles) return ActivityIcon.FILE_EDIT
            return when (activity.kind) {
                "task.progress" -> ActivityIcon.TASK_PROGRESS
                "task.completed" -> ActivityIcon.TASK_DONE
                "tool.completed", "tool.updated" -> ActivityIcon.TOOL
                "provider.error", "tool.error" -> ActivityIcon.ERROR
                else -> ActivityIcon.SPARKLES
            }
        }

        private fun pickTone(activity: ThreadActivity): ActivityTone {
            when (activity.kind) {
                "task.progress" -> return ActivityTone.THINKING
                "task.completed" -> return ActivityTone.SUCCESS
                "tool.updated", "tool.completed" -> return ActivityTone.TOOL
                "provider.error", "tool.error" -> return ActivityTone.ERROR
            }
            return ActivityTone.fromRaw(activity.tone)
        }

        private fun isPlanBoundary(a: ThreadActivity): Boolean {
            if (a.kind != "tool.updated" && a.kind != "tool.completed") return false
            return a.payload?.str("detail")?.startsWith("ExitPlanMode:") == true
        }
    }
}
