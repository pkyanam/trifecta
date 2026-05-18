// FILE: CodexService+SSH.swift
// Purpose: SSH RPC methods on CodexService delegating to the Trifecta desktop bridge.
// Layer: Service Extension
// Exports: CodexService SSH APIs

import Foundation

extension CodexService {
    var isTrifectaDesktopSSHAvailable: Bool {
        isConnected && trifectaDesktopBridge != nil
    }

    func sshListHosts() async throws -> [SshHostProfile] {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        let value = try await bridge.sshRequest(tag: "ssh.listHosts", payload: [:])
        return SshHostProfile.decodeList(from: value)
    }

    func sshAddHost(
        label: String,
        hostname: String,
        port: Int,
        username: String,
        authMethod: SshAuthMethod
    ) async throws -> SshHostProfile {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        let payload: [String: Any] = [
            "label": label,
            "hostname": hostname,
            "port": port,
            "username": username,
            "authMethod": authMethod.rawValue,
        ]
        let value = try await bridge.sshRequest(tag: "ssh.addHost", payload: payload)
        guard let host = SshHostProfile.decode(from: value as? [String: Any] ?? [:]) else {
            throw SshBridgeError.decodingFailed("ssh.addHost response")
        }
        return host
    }

    func sshRemoveHost(hostId: String) async throws {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        _ = try await bridge.sshRequest(tag: "ssh.removeHost", payload: ["hostId": hostId])
    }

    func sshOpenSession(hostId: String, cols: Int = 80, rows: Int = 24) async throws -> SshOpenSessionResult {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        let payload: [String: Any] = ["hostId": hostId, "cols": cols, "rows": rows]
        let value = try await bridge.sshRequest(tag: "ssh.openSession", payload: payload)
        guard let result = SshOpenSessionResult.decode(from: value) else {
            throw SshBridgeError.decodingFailed("ssh.openSession response")
        }
        return result
    }

    func sshSendInput(sessionId: String, data: String) async throws {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        _ = try await bridge.sshRequest(tag: "ssh.sendInput", payload: ["sessionId": sessionId, "data": data])
    }

    func sshResize(sessionId: String, cols: Int, rows: Int) async throws {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        _ = try await bridge.sshRequest(tag: "ssh.resize", payload: [
            "sessionId": sessionId,
            "cols": cols,
            "rows": rows,
        ])
    }

    func sshConfirmHostKey(
        sessionId: String,
        fingerprintSha256: String,
        approve: Bool,
        remember: Bool
    ) async throws -> SshSessionSnapshot {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "fingerprintSha256": fingerprintSha256,
            "decision": approve ? "approve" : "reject",
            "remember": remember,
        ]
        let value = try await bridge.sshRequest(tag: "ssh.confirmHostKey", payload: payload)
        guard let snapshot = SshSessionSnapshot.decode(from: value as? [String: Any] ?? [:]) else {
            throw SshBridgeError.decodingFailed("ssh.confirmHostKey response")
        }
        return snapshot
    }

    func sshCloseSession(sessionId: String) async throws {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        _ = try await bridge.sshRequest(tag: "ssh.closeSession", payload: ["sessionId": sessionId])
    }

    func sshSetupShellProfile() async throws -> SshShellProfileResult {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        let value = try await bridge.sshRequest(tag: "ssh.setupShellProfile", payload: [:])
        guard let dict = value as? [String: Any],
              let shellProfile = dict["shellProfile"] as? String,
              let alreadyPresent = dict["alreadyPresent"] as? Bool else {
            throw SshBridgeError.decodingFailed("ssh.setupShellProfile response")
        }
        return SshShellProfileResult(shellProfile: shellProfile, alreadyPresent: alreadyPresent)
    }

    func sshSubscribeTerminal(
        sessionId: String,
        onEvent: @escaping (SshTerminalEvent) -> Void
    ) async throws -> String {
        guard let bridge = trifectaDesktopBridge else { throw SshBridgeError.notConnected }
        return try await bridge.sshSubscribeTerminal(sessionId: sessionId) { value in
            guard let event = SshTerminalEvent.decode(from: value) else { return }
            onEvent(event)
        }
    }

    func sshCancelSubscription(requestId: String) async {
        await trifectaDesktopBridge?.sshCancelSubscription(requestId: requestId)
    }
}
