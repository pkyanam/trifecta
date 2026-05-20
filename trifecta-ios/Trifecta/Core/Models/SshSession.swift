import Foundation

enum SshAuthMethod: String, Codable, CaseIterable, Identifiable, Sendable {
    case agentForward = "agent-forward"
    case keychainKey = "keychain-key"
    case passwordPrompt = "password-prompt"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .agentForward: return "SSH Agent"
        case .keychainKey: return "SSH Key"
        case .passwordPrompt: return "Password"
        }
    }

    var testingNote: String {
        switch self {
        case .agentForward:
            return "Requires the Desktop app server to have SSH_AUTH_SOCK with a loaded key."
        case .keychainKey:
            return "Uses Desktop OpenSSH public-key auth with local SSH configuration."
        case .passwordPrompt:
            return "Password auth is not wired for mobile yet."
        }
    }
}

struct SshHostProfile: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let hostname: String
    let port: Int
    let username: String
    let authMethod: SshAuthMethod
    let expectedFingerprint: String?
    let createdAt: Date
    let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, label, hostname, port, username, authMethod, expectedFingerprint, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        label = try c.decode(String.self, forKey: .label)
        hostname = try c.decode(String.self, forKey: .hostname)
        port = try c.decode(Int.self, forKey: .port)
        username = try c.decode(String.self, forKey: .username)
        authMethod = try c.decode(SshAuthMethod.self, forKey: .authMethod)
        expectedFingerprint = try c.decodeIfPresent(String.self, forKey: .expectedFingerprint)
        createdAt = try ISO8601Decoder.decodeDate(c, key: .createdAt)
        updatedAt = try ISO8601Decoder.decodeDate(c, key: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(label, forKey: .label)
        try c.encode(hostname, forKey: .hostname)
        try c.encode(port, forKey: .port)
        try c.encode(username, forKey: .username)
        try c.encode(authMethod, forKey: .authMethod)
        try c.encodeIfPresent(expectedFingerprint, forKey: .expectedFingerprint)
        try c.encode(ISO8601Decoder.formatter.string(from: createdAt), forKey: .createdAt)
        try c.encode(ISO8601Decoder.formatter.string(from: updatedAt), forKey: .updatedAt)
    }
}

enum SshSessionStatus: String, Codable, Sendable {
    case pendingHostKey = "pending-host-key"
    case authenticating
    case running
    case closed
    case error
}

struct SshSessionSnapshot: Codable, Hashable, Sendable {
    let sessionId: String
    let hostId: String
    let status: SshSessionStatus
    let cols: Int
    let rows: Int
    let openedAt: Date
    let lastActivityAt: Date
    let closedAt: Date?
    let exitCode: Int?

    private enum CodingKeys: String, CodingKey {
        case sessionId, hostId, status, cols, rows, openedAt, lastActivityAt, closedAt, exitCode
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try c.decode(String.self, forKey: .sessionId)
        hostId = try c.decode(String.self, forKey: .hostId)
        status = try c.decode(SshSessionStatus.self, forKey: .status)
        cols = try c.decode(Int.self, forKey: .cols)
        rows = try c.decode(Int.self, forKey: .rows)
        openedAt = try ISO8601Decoder.decodeDate(c, key: .openedAt)
        lastActivityAt = try ISO8601Decoder.decodeDate(c, key: .lastActivityAt)
        closedAt = try (c.decodeIfPresent(String.self, forKey: .closedAt)).flatMap(ISO8601Decoder.parse)
        exitCode = try c.decodeIfPresent(Int.self, forKey: .exitCode)
    }
}

struct SshOpenSessionResult: Codable, Sendable {
    let snapshot: SshSessionSnapshot
    let sessionToken: String
    let sessionTokenExpiresAt: Date

    private enum CodingKeys: String, CodingKey {
        case snapshot, sessionToken, sessionTokenExpiresAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        snapshot = try c.decode(SshSessionSnapshot.self, forKey: .snapshot)
        sessionToken = try c.decode(String.self, forKey: .sessionToken)
        sessionTokenExpiresAt = try ISO8601Decoder.decodeDate(c, key: .sessionTokenExpiresAt)
    }
}

struct SshHostKeyPrompt: Codable, Hashable, Sendable {
    let sessionId: String
    let hostId: String
    let hostname: String
    let port: Int
    let keyType: String
    let fingerprintSha256: String
    let promptedAt: Date

    private enum CodingKeys: String, CodingKey {
        case sessionId, hostId, hostname, port, keyType, fingerprintSha256, promptedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try c.decode(String.self, forKey: .sessionId)
        hostId = try c.decode(String.self, forKey: .hostId)
        hostname = try c.decode(String.self, forKey: .hostname)
        port = try c.decode(Int.self, forKey: .port)
        keyType = try c.decode(String.self, forKey: .keyType)
        fingerprintSha256 = try c.decode(String.self, forKey: .fingerprintSha256)
        promptedAt = try ISO8601Decoder.decodeDate(c, key: .promptedAt)
    }
}

enum SshTerminalEvent: Sendable {
    case status(SshSessionSnapshot)
    case output(String)
    case hostKeyPrompt(SshHostKeyPrompt)
    case error(String)
    case exited(Int?)

    nonisolated static func decode(from any: Any) throws -> SshTerminalEvent {
        let data = try JSONSerialization.data(withJSONObject: any)
        let decoder = JSONDecoder()
        struct Kind: Decodable { let type: String }
        let kind = try decoder.decode(Kind.self, from: data)
        switch kind.type {
        case "status":
            struct Wrap: Decodable { let snapshot: SshSessionSnapshot }
            return .status(try decoder.decode(Wrap.self, from: data).snapshot)
        case "output":
            struct Wrap: Decodable { let data: String }
            return .output(try decoder.decode(Wrap.self, from: data).data)
        case "host-key-prompt":
            struct Wrap: Decodable { let prompt: SshHostKeyPrompt }
            return .hostKeyPrompt(try decoder.decode(Wrap.self, from: data).prompt)
        case "error":
            struct Wrap: Decodable { let message: String }
            return .error(try decoder.decode(Wrap.self, from: data).message)
        case "exited":
            struct Wrap: Decodable { let exitCode: Int? }
            return .exited(try decoder.decode(Wrap.self, from: data).exitCode)
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: [],
                debugDescription: "Unknown SSH terminal event type: \(kind.type)"))
        }
    }
}

extension SshHostProfile {
    nonisolated static func decodeList(from any: Any) throws -> [SshHostProfile] {
        let data = try JSONSerialization.data(withJSONObject: any)
        struct Wrap: Decodable { let hosts: [SshHostProfile] }
        return try JSONDecoder().decode(Wrap.self, from: data).hosts
    }
}

extension SshOpenSessionResult {
    nonisolated static func decode(from any: Any) throws -> SshOpenSessionResult {
        let data = try JSONSerialization.data(withJSONObject: any)
        return try JSONDecoder().decode(SshOpenSessionResult.self, from: data)
    }
}

extension SshSessionSnapshot {
    nonisolated static func decode(from any: Any) throws -> SshSessionSnapshot {
        let data = try JSONSerialization.data(withJSONObject: any)
        return try JSONDecoder().decode(SshSessionSnapshot.self, from: data)
    }
}
