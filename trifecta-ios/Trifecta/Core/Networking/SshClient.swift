import Foundation

extension T3Client {
    func sshListHosts() async throws -> [SshHostProfile] {
        guard let value = try await request(method: "ssh.listHosts", payload: [String: Any]()) else {
            throw T3Error.decodingFailed("Empty ssh.listHosts response")
        }
        return try SshHostProfile.decodeList(from: value)
    }

    func sshAddHost(label: String,
                    hostname: String,
                    port: Int,
                    username: String,
                    authMethod: SshAuthMethod) async throws -> SshHostProfile {
        let payload: [String: Any] = [
            "label": label,
            "hostname": hostname,
            "port": port,
            "username": username,
            "authMethod": authMethod.rawValue
        ]
        guard let value = try await request(method: "ssh.addHost", payload: payload) else {
            throw T3Error.decodingFailed("Empty ssh.addHost response")
        }
        let data = try JSONSerialization.data(withJSONObject: value)
        return try JSONDecoder().decode(SshHostProfile.self, from: data)
    }

    func sshRemoveHost(hostId: String) async throws {
        _ = try await request(method: "ssh.removeHost", payload: ["hostId": hostId])
    }

    func sshOpenSession(hostId: String, cols: Int = 80, rows: Int = 24) async throws -> SshOpenSessionResult {
        let payload: [String: Any] = ["hostId": hostId, "cols": cols, "rows": rows]
        guard let value = try await request(method: "ssh.openSession", payload: payload) else {
            throw T3Error.decodingFailed("Empty ssh.openSession response")
        }
        return try SshOpenSessionResult.decode(from: value)
    }

    func sshSendInput(sessionId: String, data: String) async throws {
        _ = try await request(method: "ssh.sendInput", payload: ["sessionId": sessionId, "data": data])
    }

    func sshResize(sessionId: String, cols: Int, rows: Int) async throws {
        _ = try await request(method: "ssh.resize", payload: [
            "sessionId": sessionId,
            "cols": cols,
            "rows": rows
        ])
    }

    func sshConfirmHostKey(sessionId: String,
                           fingerprintSha256: String,
                           approve: Bool,
                           remember: Bool) async throws -> SshSessionSnapshot {
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "fingerprintSha256": fingerprintSha256,
            "decision": approve ? "approve" : "reject",
            "remember": remember
        ]
        guard let value = try await request(method: "ssh.confirmHostKey", payload: payload) else {
            throw T3Error.decodingFailed("Empty ssh.confirmHostKey response")
        }
        return try SshSessionSnapshot.decode(from: value)
    }

    func sshCloseSession(sessionId: String) async throws {
        _ = try await request(method: "ssh.closeSession", payload: ["sessionId": sessionId])
    }

    struct ShellProfileSetupResult {
        let shellProfile: String
        let alreadyPresent: Bool
    }

    func sshSetupShellProfile() async throws -> ShellProfileSetupResult {
        guard let value = try await request(method: "ssh.setupShellProfile", payload: [String: Any]()) as? [String: Any] else {
            throw T3Error.decodingFailed("Empty ssh.setupShellProfile response")
        }
        guard let shellProfile = value["shellProfile"] as? String,
              let alreadyPresent = value["alreadyPresent"] as? Bool else {
            throw T3Error.decodingFailed("Invalid ssh.setupShellProfile response")
        }
        return ShellProfileSetupResult(shellProfile: shellProfile, alreadyPresent: alreadyPresent)
    }

    func subscribeSshTerminal(sessionId: String,
                              onEvent: @escaping (SshTerminalEvent) -> Void) async throws -> StreamSubscription {
        try await subscribe(method: "subscribeSshTerminal", payload: ["sessionId": sessionId]) { value in
            do {
                let event = try SshTerminalEvent.decode(from: value)
                onEvent(event)
            } catch {
                NSLog("Failed to decode SSH terminal event: \(error)")
            }
        }
    }
}
