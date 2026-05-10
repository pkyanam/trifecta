import Foundation

enum ShellStreamItem: Sendable {
    case snapshot(ShellSnapshot)
    case projectUpserted(sequence: Int, project: ProjectShell)
    case projectRemoved(sequence: Int, projectId: ProjectID)
    case threadUpserted(sequence: Int, thread: ThreadShell)
    case threadRemoved(sequence: Int, threadId: ThreadID)
}

struct ShellSnapshot: Codable, Sendable {
    let snapshotSequence: Int
    let projects: [ProjectShell]
    let threads: [ThreadShell]
    let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case snapshotSequence, projects, threads, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        snapshotSequence = try c.decode(Int.self, forKey: .snapshotSequence)
        projects = try c.decode([ProjectShell].self, forKey: .projects)
        threads = try c.decode([ThreadShell].self, forKey: .threads)
        updatedAt = try ISO8601Decoder.decodeDate(c, key: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(snapshotSequence, forKey: .snapshotSequence)
        try c.encode(projects, forKey: .projects)
        try c.encode(threads, forKey: .threads)
        try c.encode(ISO8601Decoder.formatter.string(from: updatedAt), forKey: .updatedAt)
    }
}

extension ShellStreamItem {
    nonisolated static func decode(from any: Any) throws -> ShellStreamItem {
        let data = try JSONSerialization.data(withJSONObject: any)
        return try decode(from: data)
    }

    nonisolated static func decode(from data: Data) throws -> ShellStreamItem {
        let decoder = JSONDecoder()
        struct Kind: Decodable { let kind: String }
        let kind = try decoder.decode(Kind.self, from: data)
        switch kind.kind {
        case "snapshot":
            struct Wrap: Decodable { let snapshot: ShellSnapshot }
            return .snapshot(try decoder.decode(Wrap.self, from: data).snapshot)
        case "project-upserted":
            struct Wrap: Decodable { let sequence: Int; let project: ProjectShell }
            let w = try decoder.decode(Wrap.self, from: data)
            return .projectUpserted(sequence: w.sequence, project: w.project)
        case "project-removed":
            struct Wrap: Decodable { let sequence: Int; let projectId: ProjectID }
            let w = try decoder.decode(Wrap.self, from: data)
            return .projectRemoved(sequence: w.sequence, projectId: w.projectId)
        case "thread-upserted":
            struct Wrap: Decodable { let sequence: Int; let thread: ThreadShell }
            let w = try decoder.decode(Wrap.self, from: data)
            return .threadUpserted(sequence: w.sequence, thread: w.thread)
        case "thread-removed":
            struct Wrap: Decodable { let sequence: Int; let threadId: ThreadID }
            let w = try decoder.decode(Wrap.self, from: data)
            return .threadRemoved(sequence: w.sequence, threadId: w.threadId)
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: [],
                debugDescription: "Unknown shell stream item kind: \(kind.kind)"))
        }
    }
}

enum ThreadStreamItem: Sendable {
    case snapshot(ThreadDetail, snapshotSequence: Int)
    case event(ThreadEvent)
}

struct ThreadEvent: @unchecked Sendable {
    let sequence: Int
    let type: String
    let payload: [String: Any]
    let raw: Data

    var threadId: ThreadID? {
        guard let raw = payload["threadId"] as? String else { return nil }
        return ThreadID(rawValue: raw)
    }
}

extension ThreadStreamItem {
    nonisolated static func decode(from any: Any) throws -> ThreadStreamItem {
        let data = try JSONSerialization.data(withJSONObject: any)
        return try decode(from: data, raw: any)
    }

    nonisolated static func decode(from data: Data, raw any: Any) throws -> ThreadStreamItem {
        guard let dict = any as? [String: Any], let kind = dict["kind"] as? String else {
            throw DecodingError.dataCorrupted(.init(codingPath: [],
                debugDescription: "Missing kind in thread stream item"))
        }
        switch kind {
        case "snapshot":
            guard let snap = dict["snapshot"] as? [String: Any],
                  let sequence = snap["snapshotSequence"] as? Int else {
                throw DecodingError.dataCorrupted(.init(codingPath: [],
                    debugDescription: "Bad snapshot shape"))
            }
            let threadObj = snap["thread"] ?? [:]
            let detail = try ThreadDetail.decode(from: threadObj)
            return .snapshot(detail, snapshotSequence: sequence)
        case "event":
            guard let event = dict["event"] as? [String: Any],
                  let type = event["type"] as? String,
                  let sequence = event["sequence"] as? Int else {
                throw DecodingError.dataCorrupted(.init(codingPath: [],
                    debugDescription: "Bad event shape"))
            }
            let payload = event["payload"] as? [String: Any] ?? [:]
            let eventData = try JSONSerialization.data(withJSONObject: event)
            return .event(ThreadEvent(sequence: sequence, type: type, payload: payload, raw: eventData))
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: [],
                debugDescription: "Unknown thread stream item kind: \(kind)"))
        }
    }
}
