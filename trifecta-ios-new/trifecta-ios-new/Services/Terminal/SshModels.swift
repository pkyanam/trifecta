// FILE: SshModels.swift
// Purpose: SSH session, host, and event models decoded from the Trifecta desktop bridge.
// Layer: Model
// Exports: SshAuthMethod, SshHostProfile, SshSessionStatus, SshSessionSnapshot,
//          SshOpenSessionResult, SshHostKeyPrompt, SshTerminalEvent, SshShellProfileResult, SshBridgeError

import Foundation

enum SshAuthMethod: String, CaseIterable, Identifiable {
    case agentForward = "agent-forward"
    case keychainKey = "keychain-key"
    case passwordPrompt = "password-prompt"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .agentForward: return "SSH Agent"
        case .keychainKey: return "Keychain Key"
        case .passwordPrompt: return "Password"
        }
    }

    var note: String {
        switch self {
        case .agentForward:
            return "Requires the Desktop app server to have SSH_AUTH_SOCK with a loaded key."
        case .keychainKey:
            return "Uses macOS ssh public-key auth with local SSH configuration."
        case .passwordPrompt:
            return "Password auth is not wired for mobile yet."
        }
    }
}

struct SshHostProfile: Identifiable, Hashable {
    let id: String
    let label: String
    let hostname: String
    let port: Int
    let username: String
    let authMethod: SshAuthMethod

    static func decodeList(from value: Any?) -> [SshHostProfile] {
        guard let dict = value as? [String: Any],
              let hostsArray = dict["hosts"] as? [[String: Any]] else {
            return []
        }
        return hostsArray.compactMap(SshHostProfile.decode(from:))
    }

    static func decode(from dict: [String: Any]) -> SshHostProfile? {
        guard let id = dict["id"] as? String,
              let label = dict["label"] as? String,
              let hostname = dict["hostname"] as? String,
              let port = dict["port"] as? Int,
              let username = dict["username"] as? String else { return nil }
        let authMethod = SshAuthMethod(rawValue: dict["authMethod"] as? String ?? "") ?? .agentForward
        return SshHostProfile(id: id, label: label, hostname: hostname, port: port,
                              username: username, authMethod: authMethod)
    }
}

enum SshSessionStatus: String {
    case pendingHostKey = "pending-host-key"
    case authenticating
    case running
    case closed
    case error

    var isLive: Bool {
        switch self {
        case .pendingHostKey, .authenticating, .running: return true
        case .closed, .error: return false
        }
    }
}

struct SshSessionSnapshot: Hashable {
    let sessionId: String
    let hostId: String
    let status: SshSessionStatus
    let cols: Int
    let rows: Int

    static func decode(from dict: [String: Any]) -> SshSessionSnapshot? {
        guard let sessionId = dict["sessionId"] as? String,
              let hostId = dict["hostId"] as? String,
              let statusRaw = dict["status"] as? String else { return nil }
        let status = SshSessionStatus(rawValue: statusRaw) ?? .error
        return SshSessionSnapshot(
            sessionId: sessionId,
            hostId: hostId,
            status: status,
            cols: dict["cols"] as? Int ?? 80,
            rows: dict["rows"] as? Int ?? 24
        )
    }
}

struct SshOpenSessionResult {
    let snapshot: SshSessionSnapshot
    let sessionToken: String

    static func decode(from value: Any?) -> SshOpenSessionResult? {
        guard let dict = value as? [String: Any],
              let snapshotDict = dict["snapshot"] as? [String: Any],
              let snapshot = SshSessionSnapshot.decode(from: snapshotDict),
              let sessionToken = dict["sessionToken"] as? String else { return nil }
        return SshOpenSessionResult(snapshot: snapshot, sessionToken: sessionToken)
    }
}

struct SshHostKeyPrompt: Hashable {
    let sessionId: String
    let hostId: String
    let hostname: String
    let port: Int
    let keyType: String
    let fingerprintSha256: String

    static func decode(from dict: [String: Any]) -> SshHostKeyPrompt? {
        guard let sessionId = dict["sessionId"] as? String,
              let hostId = dict["hostId"] as? String,
              let hostname = dict["hostname"] as? String,
              let port = dict["port"] as? Int,
              let keyType = dict["keyType"] as? String,
              let fingerprintSha256 = dict["fingerprintSha256"] as? String else { return nil }
        return SshHostKeyPrompt(sessionId: sessionId, hostId: hostId, hostname: hostname,
                                port: port, keyType: keyType, fingerprintSha256: fingerprintSha256)
    }
}

enum SshTerminalEvent {
    case status(SshSessionSnapshot)
    case output(String)
    case hostKeyPrompt(SshHostKeyPrompt)
    case error(String)
    case exited(Int?)

    static func decode(from value: Any) -> SshTerminalEvent? {
        guard let dict = value as? [String: Any],
              let type = dict["type"] as? String else { return nil }
        switch type {
        case "status":
            guard let snapshotDict = dict["snapshot"] as? [String: Any],
                  let snapshot = SshSessionSnapshot.decode(from: snapshotDict) else { return nil }
            return .status(snapshot)
        case "output":
            return .output(dict["data"] as? String ?? "")
        case "host-key-prompt":
            guard let promptDict = dict["prompt"] as? [String: Any],
                  let prompt = SshHostKeyPrompt.decode(from: promptDict) else { return nil }
            return .hostKeyPrompt(prompt)
        case "error":
            return .error(dict["message"] as? String ?? "SSH error")
        case "exited":
            return .exited(dict["exitCode"] as? Int)
        default:
            return nil
        }
    }
}

struct SshShellProfileResult {
    let shellProfile: String
    let alreadyPresent: Bool
}

enum SshBridgeError: LocalizedError {
    case notConnected
    case decodingFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to Trifecta Desktop."
        case .decodingFailed(let detail):
            return "SSH response decoding failed: \(detail)"
        }
    }
}
