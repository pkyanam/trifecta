package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.time.Instant

data class ShellSnapshot(
    val snapshotSequence: Int,
    val projects: List<ProjectShell>,
    val threads: List<ThreadShell>,
    val updatedAt: Instant
) {
    companion object {
        fun fromJson(obj: JsonObject): ShellSnapshot? {
            val seq = obj.intAt("snapshotSequence") ?: return null
            val projects = obj.arr("projects")
                ?.mapNotNull { ProjectShell.fromJson(it.asObjectOrNull() ?: return@mapNotNull null) }
                ?: emptyList()
            val threads = obj.arr("threads")
                ?.mapNotNull { ThreadShell.fromJson(it.asObjectOrNull() ?: return@mapNotNull null) }
                ?: emptyList()
            val updatedAt = Iso8601.parse(obj.str("updatedAt")) ?: Instant.now()
            return ShellSnapshot(seq, projects, threads, updatedAt)
        }
    }
}

sealed class ShellStreamItem {
    data class Snapshot(val snapshot: ShellSnapshot) : ShellStreamItem()
    data class ProjectUpserted(val sequence: Int, val project: ProjectShell) : ShellStreamItem()
    data class ProjectRemoved(val sequence: Int, val projectId: ProjectID) : ShellStreamItem()
    data class ThreadUpserted(val sequence: Int, val thread: ThreadShell) : ShellStreamItem()
    data class ThreadRemoved(val sequence: Int, val threadId: ThreadID) : ShellStreamItem()

    companion object {
        fun fromJson(element: JsonElement): ShellStreamItem? {
            val obj = element.asObjectOrNull() ?: return null
            return when (obj.str("kind")) {
                "snapshot" -> {
                    val snapObj = obj.obj("snapshot") ?: return null
                    val snap = ShellSnapshot.fromJson(snapObj) ?: return null
                    Snapshot(snap)
                }
                "project-upserted" -> {
                    val seq = obj.intAt("sequence") ?: return null
                    val proj = ProjectShell.fromJson(obj.obj("project") ?: return null) ?: return null
                    ProjectUpserted(seq, proj)
                }
                "project-removed" -> {
                    val seq = obj.intAt("sequence") ?: return null
                    val projectId = obj.str("projectId")?.let { ProjectID(it) } ?: return null
                    ProjectRemoved(seq, projectId)
                }
                "thread-upserted" -> {
                    val seq = obj.intAt("sequence") ?: return null
                    val thread = ThreadShell.fromJson(obj.obj("thread") ?: return null) ?: return null
                    ThreadUpserted(seq, thread)
                }
                "thread-removed" -> {
                    val seq = obj.intAt("sequence") ?: return null
                    val threadId = obj.str("threadId")?.let { ThreadID(it) } ?: return null
                    ThreadRemoved(seq, threadId)
                }
                else -> null
            }
        }
    }
}

data class ThreadEvent(
    val sequence: Int,
    val type: String,
    val payload: JsonObject,
    val raw: JsonObject
) {
    val threadId: ThreadID?
        get() = payload.str("threadId")?.let { ThreadID(it) }
}

sealed class ThreadStreamItem {
    data class Snapshot(val detail: ThreadDetail, val snapshotSequence: Int) : ThreadStreamItem()
    data class Event(val event: ThreadEvent) : ThreadStreamItem()

    companion object {
        fun fromJson(element: JsonElement): ThreadStreamItem? {
            val obj = element.asObjectOrNull() ?: return null
            return when (obj.str("kind")) {
                "snapshot" -> {
                    val snap = obj.obj("snapshot") ?: return null
                    val sequence = snap.intAt("snapshotSequence") ?: return null
                    val threadObj = snap.obj("thread") ?: return null
                    val detail = ThreadDetail.fromJson(threadObj) ?: return null
                    Snapshot(detail, sequence)
                }
                "event" -> {
                    val event = obj.obj("event") ?: return null
                    val type = event.str("type") ?: return null
                    val sequence = event.intAt("sequence") ?: return null
                    val payload = event.obj("payload") ?: JsonObject(emptyMap())
                    Event(ThreadEvent(sequence, type, payload, event))
                }
                else -> null
            }
        }
    }
}
