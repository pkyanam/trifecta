import Foundation

// MARK: - Session (referenced by both shell and thread detail)

public struct OrchestrationSession: Decodable {
    public let threadId: String
    public let status: String  // "idle"|"starting"|"running"|"ready"|"interrupted"|"stopped"|"error"
    public let providerName: String?
    public let runtimeMode: String
    public let activeTurnId: String?
    public let lastError: String?
    public let updatedAt: String
}

// MARK: - Shell types (M0 scope)

public struct OrchestrationProjectShell: Decodable {
    public let id: String
    public let title: String
    public let workspaceRoot: String
    public let createdAt: String
    public let updatedAt: String
}

public struct OrchestrationThreadShell: Decodable {
    public let id: String
    public let projectId: String
    public let title: String
    public let branch: String?
    public let worktreePath: String?
    public let session: OrchestrationSession?
    public let createdAt: String
    public let updatedAt: String
    public let archivedAt: String?
    public let hasPendingApprovals: Bool
    public let hasPendingUserInput: Bool
    public let hasActionableProposedPlan: Bool
}

public struct OrchestrationShellSnapshot: Decodable {
    public let snapshotSequence: Int
    public let projects: [OrchestrationProjectShell]
    public let threads: [OrchestrationThreadShell]
    public let updatedAt: String
}

public enum OrchestrationShellStreamItem: Decodable {
    case snapshot(OrchestrationShellSnapshot)
    case projectUpserted(sequence: Int, project: OrchestrationProjectShell)
    case projectRemoved(sequence: Int, projectId: String)
    case threadUpserted(sequence: Int, thread: OrchestrationThreadShell)
    case threadRemoved(sequence: Int, threadId: String)
    case unknown  // forward-compat: don't kill the subscription on unknown kinds

    enum CodingKeys: String, CodingKey {
        case kind, snapshot, sequence, project, projectId, thread, threadId
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "snapshot":
            self = .snapshot(try c.decode(OrchestrationShellSnapshot.self, forKey: .snapshot))
        case "project-upserted":
            self = .projectUpserted(
                sequence: try c.decode(Int.self, forKey: .sequence),
                project: try c.decode(OrchestrationProjectShell.self, forKey: .project)
            )
        case "project-removed":
            self = .projectRemoved(
                sequence: try c.decode(Int.self, forKey: .sequence),
                projectId: try c.decode(String.self, forKey: .projectId)
            )
        case "thread-upserted":
            self = .threadUpserted(
                sequence: try c.decode(Int.self, forKey: .sequence),
                thread: try c.decode(OrchestrationThreadShell.self, forKey: .thread)
            )
        case "thread-removed":
            self = .threadRemoved(
                sequence: try c.decode(Int.self, forKey: .sequence),
                threadId: try c.decode(String.self, forKey: .threadId)
            )
        default:
            self = .unknown
        }
    }
}

// MARK: - Thread detail types (M2)

public struct OrchestrationMessage: Decodable {
    public let id: String
    public let role: String  // "user" | "assistant" | "system"
    public let text: String
    public let turnId: String?
    public let streaming: Bool
    public let createdAt: String
    public let updatedAt: String
}

public struct OrchestrationThreadActivity: Decodable {
    public let id: String
    public let tone: String  // "info" | "tool" | "approval" | "error"
    public let kind: String
    public let summary: String
    public let payload: JSONValue
    public let turnId: String?
    public let createdAt: String
}

public struct OrchestrationLatestTurn: Decodable {
    public let turnId: String
    public let state: String  // "running"|"interrupted"|"completed"|"error"
    public let requestedAt: String
    public let startedAt: String?
    public let completedAt: String?
    public let assistantMessageId: String?
}

public struct OrchestrationThread: Decodable {
    public let id: String
    public let projectId: String
    public let title: String
    public let branch: String?
    public let worktreePath: String?
    public let latestTurn: OrchestrationLatestTurn?
    public var messages: [OrchestrationMessage]
    public var activities: [OrchestrationThreadActivity]
    public var session: OrchestrationSession?
    public let createdAt: String
    public let updatedAt: String
    public let archivedAt: String?
}

public struct OrchestrationThreadDetailSnapshot: Decodable {
    public let snapshotSequence: Int
    public let thread: OrchestrationThread
}

// Wire shape for subscribeThread stream items:
//   { "kind": "snapshot", "snapshot": { "snapshotSequence": N, "thread": {...} } }
//   { "kind": "event", "event": { "type": "thread.message-sent", "payload": { "message": {...} } } }
public enum OrchestrationThreadStreamItem: Decodable {
    case snapshot(OrchestrationThreadDetailSnapshot)
    case messageSent(message: OrchestrationMessage)
    case activityAppended(activity: OrchestrationThreadActivity)
    case sessionSet(session: OrchestrationSession)
    case unknown(kind: String)

    enum CodingKeys: String, CodingKey { case kind, snapshot, event }
    enum EventKeys: String, CodingKey { case type, payload }
    enum MessageSentPayloadKeys: String, CodingKey { case message }
    enum ActivityAppendedPayloadKeys: String, CodingKey { case activity }
    enum SessionSetPayloadKeys: String, CodingKey { case session }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "snapshot":
            self = .snapshot(try c.decode(OrchestrationThreadDetailSnapshot.self, forKey: .snapshot))
        case "event":
            let ec = try c.nestedContainer(keyedBy: EventKeys.self, forKey: .event)
            let type_ = try ec.decode(String.self, forKey: .type)
            switch type_ {
            case "thread.message-sent":
                let pc = try ec.nestedContainer(keyedBy: MessageSentPayloadKeys.self, forKey: .payload)
                self = .messageSent(message: try pc.decode(OrchestrationMessage.self, forKey: .message))
            case "thread.activity-appended":
                let pc = try ec.nestedContainer(keyedBy: ActivityAppendedPayloadKeys.self, forKey: .payload)
                self = .activityAppended(activity: try pc.decode(OrchestrationThreadActivity.self, forKey: .activity))
            case "thread.session-set":
                let pc = try ec.nestedContainer(keyedBy: SessionSetPayloadKeys.self, forKey: .payload)
                self = .sessionSet(session: try pc.decode(OrchestrationSession.self, forKey: .session))
            default:
                self = .unknown(kind: type_)
            }
        default:
            self = .unknown(kind: kind)
        }
    }
}
