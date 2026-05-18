// FILE: TrifectaDesktopBridge.swift
// Purpose: Trifecta desktop Effect RPC transport and compatibility adapter for the Trifecta UI.
// Layer: Service support

import Foundation

private enum TrifectaBridgeError: Error, LocalizedError {
    case invalidServerURL
    case requestFailed(String)
    case disconnected

    var errorDescription: String? {
        switch self {
        case .invalidServerURL: return "Invalid Trifecta desktop server URL."
        case .requestFailed(let message): return message
        case .disconnected: return "Disconnected from Trifecta desktop."
        }
    }
}

private enum TrifectaEffectRPCMessage {
    case request(id: String, tag: String, payload: Any)
    case interrupt(requestId: String)
    case ack(requestId: String)
    case ping
    case pong
    case chunk(requestId: String, values: [Any])
    case exit(requestId: String, success: Bool, value: Any?, errorMessage: String?)
    case defect(String)
}

private enum TrifectaEffectRPCCodec {
    static func encode(_ message: TrifectaEffectRPCMessage) throws -> String {
        let object: [String: Any]
        switch message {
        case .request(let id, let tag, let payload):
            object = [
                "_tag": "Request",
                "id": id,
                "tag": tag,
                "payload": payload,
                "headers": [],
                "spanId": UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16).description,
                "traceId": UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(32).description,
                "sampled": false,
            ]
        case .interrupt(let requestId):
            object = ["_tag": "Interrupt", "requestId": requestId, "interruptors": []]
        case .ack(let requestId):
            object = ["_tag": "Ack", "requestId": requestId]
        case .ping:
            object = ["_tag": "Ping"]
        case .pong:
            object = ["_tag": "Pong"]
        default:
            object = [:]
        }

        let data = try JSONSerialization.data(withJSONObject: object)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    static func decode(_ text: String) throws -> [TrifectaEffectRPCMessage] {
        let raw = try JSONSerialization.jsonObject(with: Data(text.utf8))
        if let array = raw as? [Any] {
            return array.map(decodeOne)
        }
        return [decodeOne(raw)]
    }

    private static func decodeOne(_ raw: Any) -> TrifectaEffectRPCMessage {
        guard let object = raw as? [String: Any],
              let tag = object["_tag"] as? String else {
            return .defect("Unknown Effect RPC frame")
        }

        switch tag {
        case "Ping": return .ping
        case "Pong": return .pong
        case "Chunk":
            return .chunk(
                requestId: object["requestId"] as? String ?? "",
                values: object["values"] as? [Any] ?? []
            )
        case "Exit":
            let exit = object["exit"] as? [String: Any] ?? [:]
            let success = (exit["_tag"] as? String) == "Success"
            return .exit(
                requestId: object["requestId"] as? String ?? "",
                success: success,
                value: exit["value"],
                errorMessage: findErrorMessage(in: exit) ?? "Trifecta desktop request failed."
            )
        case "Defect":
            return .defect(object["defect"] as? String ?? "Trifecta desktop defect.")
        default:
            return .defect("Unsupported Effect RPC frame: \(tag)")
        }
    }

    private static func findErrorMessage(in value: Any) -> String? {
        if let object = value as? [String: Any] {
            if let message = taggedErrorMessage(in: object) { return message }
            for key in ["message", "detail", "reason", "description", "errorDescription"] {
                if let message = object[key] as? String,
                   !message.isEmpty,
                   !isRawFingerprint(message) { return message }
            }
            for key in ["error", "cause", "failure", "defect"] {
                if let child = object[key],
                   let found = findErrorMessage(in: child) { return found }
            }
            for (key, child) in object where !ignoredErrorValueKeys.contains(key) {
                if let found = findErrorMessage(in: child) { return found }
            }
        } else if let array = value as? [Any] {
            for child in array {
                if let found = findErrorMessage(in: child) { return found }
            }
        } else if let message = value as? String, !message.isEmpty, !isRawFingerprint(message) {
            return message
        }
        return nil
    }

    private static let ignoredErrorValueKeys = Set([
        "_tag", "id", "requestId", "tag", "sessionId", "hostId",
        "fingerprintSha256", "expectedFingerprint", "actualFingerprint",
    ])

    private static func taggedErrorMessage(in object: [String: Any]) -> String? {
        guard let tag = object["_tag"] as? String else { return nil }
        switch tag {
        case "SshHostProfileNotFoundError":
            return "SSH host profile was not found. Refresh the host list and try again."
        case "SshHostProfileConflictError":
            return "An SSH host with this label or address already exists."
        case "SshHostKeyMismatchError":
            let hostname = object["hostname"] as? String ?? "host"
            let port = object["port"].map { "\($0)" } ?? "22"
            return "Host key mismatch for \(hostname):\(port). Refusing to connect."
        case "SshSessionNotFoundError":
            return "SSH session is no longer active. Reconnect and try again."
        case "SshSessionTokenInvalidError":
            let reason = object["reason"] as? String ?? "invalid"
            return "SSH session token rejected (\(reason)). Reconnect and try again."
        case "SshAuthorizationError":
            let reason = object["reason"] as? String ?? "not authorized"
            return "SSH operation denied: \(reason)"
        case "SshSessionLimitError":
            let limit = object["limit"].map { "\($0)" } ?? "maximum"
            return "SSH session limit reached (\(limit)). Close another SSH session and try again."
        default:
            return nil
        }
    }

    private static func isRawFingerprint(_ text: String) -> Bool {
        text.hasPrefix("SHA256:") && !text.contains(" ")
    }
}

private final class TrifectaWebSocketSessionDelegate: NSObject, URLSessionWebSocketDelegate, URLSessionTaskDelegate {
    private let lock = NSLock()
    private var openContinuations: [Int: CheckedContinuation<Void, Error>] = [:]
    private var completedOpenResults: [Int: Result<Void, Error>] = [:]
    private var finishedOpenTaskIDs: Set<Int> = []
    private var openedTaskIDs: Set<Int> = []

    func waitForOpen(task: URLSessionWebSocketTask, timeoutNanoseconds: UInt64) async throws {
        let taskID = task.taskIdentifier
        let timeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: timeoutNanoseconds)
            self?.completeOpenWait(
                taskID: taskID,
                result: .failure(TrifectaBridgeError.requestFailed("Timed out waiting for WebSocket connection"))
            )
        }
        defer { timeoutTask.cancel() }

        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                if let result = completedOpenResults.removeValue(forKey: taskID) {
                    finishedOpenTaskIDs.insert(taskID)
                    lock.unlock()
                    continuation.resume(with: result)
                } else {
                    openContinuations[taskID] = continuation
                    lock.unlock()
                }
            }
        } onCancel: {
            completeOpenWait(taskID: taskID, result: .failure(CancellationError()))
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        lock.lock()
        openedTaskIDs.insert(webSocketTask.taskIdentifier)
        lock.unlock()
        completeOpenWait(taskID: webSocketTask.taskIdentifier, result: .success(()))
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let taskID = webSocketTask.taskIdentifier
        lock.lock()
        let wasOpened = openedTaskIDs.remove(taskID) != nil
        lock.unlock()
        guard !wasOpened else { return }
        completeOpenWait(
            taskID: taskID,
            result: .failure(TrifectaBridgeError.requestFailed("WebSocket closed before opening"))
        )
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        let taskID = task.taskIdentifier
        lock.lock()
        let wasOpened = openedTaskIDs.contains(taskID)
        lock.unlock()
        guard !wasOpened else { return }
        completeOpenWait(taskID: taskID, result: .failure(error))
    }

    private func completeOpenWait(taskID: Int, result: Result<Void, Error>) {
        lock.lock()
        if let continuation = openContinuations.removeValue(forKey: taskID) {
            completedOpenResults.removeValue(forKey: taskID)
            finishedOpenTaskIDs.insert(taskID)
            lock.unlock()
            continuation.resume(with: result)
        } else if finishedOpenTaskIDs.contains(taskID) {
            lock.unlock()
        } else {
            completedOpenResults[taskID] = result
            lock.unlock()
        }
    }
}

@MainActor
final class TrifectaDesktopBridge {
    private static let maximumWebSocketMessageSize = 64 * 1024 * 1024
    private static let webSocketOpenTimeoutNanoseconds: UInt64 = 10_000_000_000

    private weak var codex: CodexService?
    private let serverURL: URL
    private let bootstrapToken: String
    private var bearerToken: String?
    private var session: URLSession?
    private var socketDelegate: TrifectaWebSocketSessionDelegate?
    private var task: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var sendTail: Task<Void, Never>?
    private var nextRequestNumber: UInt64 = 1
    private var pending: [String: CheckedContinuation<Any?, Error>] = [:]
    private var streamHandlers: [String: (Any) -> Void] = [:]
    private var projectsById: [String: [String: Any]] = [:]
    private var threadsById: [String: [String: Any]] = [:]
    // threadId -> requestId for orchestration.subscribeThread; keeps per-thread session.status
    // events flowing so the composer's running indicator can clear on terminal transitions.
    private var threadStreamSubscriptions: [String: String] = [:]
    // Latest per-thread snapshot dict captured from the persistent subscribeThread stream.
    // Serves thread/read and thread/resume responses without re-subscribing (trifecta-desktop
    // dedupes overlapping subscribeThread requests, so a fresh subscribe doesn't get a snapshot
    // and the threadDetail wait times out with "Thread … was not found.").
    private var threadSnapshotsByID: [String: [String: Any]] = [:]

    init(codex: CodexService, serverURL: URL, bootstrapToken: String) {
        self.codex = codex
        self.serverURL = serverURL
        self.bootstrapToken = bootstrapToken
    }

    func connect() async throws {
        let (bearer, wsToken) = try await resolvedBearerAndWSToken()
        bearerToken = bearer
        let wsURL = try webSocketURL(wsToken: wsToken)

        var request = URLRequest(url: wsURL)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 0
        let delegate = TrifectaWebSocketSessionDelegate()
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        let socket = session.webSocketTask(with: request)
        socket.maximumMessageSize = Self.maximumWebSocketMessageSize
        self.session = session
        socketDelegate = delegate
        task = socket
        socket.resume()

        do {
            try await delegate.waitForOpen(
                task: socket,
                timeoutNanoseconds: Self.webSocketOpenTimeoutNanoseconds
            )
        } catch {
            if task === socket {
                socket.cancel(with: .goingAway, reason: nil)
                task = nil
            }
            throw TrifectaBridgeError.requestFailed(formatWebSocketOpenError(error, task: socket))
        }

        receiveTask = Task { [weak self] in await self?.receiveLoop() }
        heartbeatTask = Task { [weak self] in await self?.heartbeatLoop() }

        try await subscribeShell()
    }

    // Tries the saved bearer token first (avoids re-exchanging the one-time bootstrap token on
    // every launch). Falls back to a fresh exchange when no token is saved or it has been revoked.
    private func resolvedBearerAndWSToken() async throws -> (bearer: String, wsToken: String) {
        if let saved = SecureStore.readString(for: CodexSecureKeys.trifectaDesktopBearerToken),
           !saved.isEmpty,
           let wsToken = try? await issueWebSocketToken(bearer: saved) {
            return (saved, wsToken)
        }
        let fresh = try await exchangeBootstrapToken()
        SecureStore.writeString(fresh, for: CodexSecureKeys.trifectaDesktopBearerToken)
        let wsToken = try await issueWebSocketToken(bearer: fresh)
        return (fresh, wsToken)
    }

    func disconnect() {
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        sendTail?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()
        task = nil
        session = nil
        socketDelegate = nil
        pending.values.forEach { $0.resume(throwing: TrifectaBridgeError.disconnected) }
        pending.removeAll()
        streamHandlers.removeAll()
        threadStreamSubscriptions.removeAll()
        threadSnapshotsByID.removeAll()
        sendTail = nil
    }

    func handleTrifectaRequest(method: String, params: JSONValue?) async throws -> RPCMessage {
        switch method {
        case "thread/list":
            let wantsArchived = params?.objectValue?["archived"]?.boolValue == true
            let threads = threadsById.values
                .filter { wantsArchived ? ($0["archivedAt"] is String) : !($0["archivedAt"] is String) }
                .map(trifectaThread)
                .sorted { (($0["updatedAt"] as? String) ?? "") > (($1["updatedAt"] as? String) ?? "") }
            return rpcResult(["data": threads, "nextCursor": NSNull()])

        case "thread/read", "thread/resume":
            let threadId = params?.objectValue?["threadId"]?.stringValue ?? ""
            let detail = try await threadDetail(threadId: threadId)
            return rpcResult(["thread": trifectaThreadDetail(detail)])

        case "thread/turns/list":
            let threadId = params?.objectValue?["threadId"]?.stringValue ?? ""
            let detail = try await threadDetail(threadId: threadId)
            return rpcResult([
                "data": trifectaTurnListData(from: detail),
                "nextCursor": NSNull(),
            ])

        case "turn/start", "thread/start":
            let createsThread = (method == "thread/start")
            let object = params?.objectValue ?? [:]
            let cwd: String = object["cwd"]?.stringValue ?? ""
            // For thread creation we need a real projectId in bootstrap.createThread, otherwise
            // trifecta-desktop rejects the dispatch. Match by cwd first, fall back to first known,
            // and as a last resort create the project on demand.
            let resolvedProjectId: String = createsThread
                ? try await ensureProjectForCwd(cwd)
                : ""
            let payload = dispatchPayload(
                from: params,
                createsThread: createsThread,
                resolvedProjectId: resolvedProjectId
            )
            let threadId: String = (payload["threadId"] as? String) ?? UUID().uuidString
            // Subscribe BEFORE dispatch so we don't miss the first session.status transitions
            // that fire as soon as trifecta-desktop starts processing the turn. If we subscribe
            // after, an error-during-handshake (like the 401 from a misconfigured provider) can
            // complete the whole session before our stream is even live, leaving the running
            // indicator stuck on forever.
            subscribeThreadIfNeeded(threadId: threadId)
            do {
                _ = try await request(tag: "orchestration.dispatchCommand", payload: payload)
            } catch {
                // Dispatch itself failed at the bridge level (auth, schema, transport) — no
                // session.status events will arrive, so unwind the optimistic running state the
                // iOS composer set when the user tapped send. Without this the indicator stays on.
                let noTurn: String? = nil
                codex?.markTurnCompleted(threadId: threadId, turnId: noTurn)
                codex?.refreshThreadTimelineState(for: threadId)
                throw error
            }
            if createsThread {
                let bootstrap = (payload["bootstrap"] as? [String: Any])?["createThread"] as? [String: Any] ?? [:]
                let title: String = (bootstrap["title"] as? String) ?? "New thread"
                let synthesized: [String: Any] = [
                    "id": threadId,
                    "title": title,
                    "projectId": resolvedProjectId,
                    "createdAt": isoNow(),
                    "updatedAt": isoNow(),
                    "worktreePath": NSNull(),
                    "modelSelection": bootstrap["modelSelection"] ?? NSNull(),
                ]
                // Cache locally so a follow-up thread/read works before the shell snapshot arrives.
                threadsById[threadId] = synthesized
                let threadDict = trifectaThread(synthesized)
                return rpcResult([
                    "thread": threadDict,
                    "threadId": threadId,
                    "ok": true,
                ])
            }
            return rpcResult(["ok": true])

        case "turn/interrupt", "turn/stop":
            let threadId = params?.objectValue?["threadId"]?.stringValue ?? ""
            _ = try await request(tag: "orchestration.dispatchCommand", payload: [
                "type": "thread.turn.interrupt",
                "commandId": UUID().uuidString,
                "threadId": threadId,
                "createdAt": isoNow(),
            ])
            return rpcResult(["ok": true])

        case "thread/name/set":
            let object = params?.objectValue ?? [:]
            // Type the literal explicitly so Swift's inferencer doesn't try to unify the chained
            // `??` operands across heterogeneous Any positions (causes type-check timeouts).
            let payload: [String: Any] = [
                "type": "thread.meta.update",
                "commandId": UUID().uuidString,
                "threadId": object["threadId"]?.stringValue ?? "",
                "title": object["name"]?.stringValue ?? object["title"]?.stringValue ?? "Thread",
            ]
            _ = try await request(tag: "orchestration.dispatchCommand", payload: payload)
            return rpcResult(["ok": true])

        case "thread/archive", "thread/unarchive", "thread/delete":
            let typeByMethod = [
                "thread/archive": "thread.archive",
                "thread/unarchive": "thread.unarchive",
                "thread/delete": "thread.delete",
            ]
            _ = try await request(tag: "orchestration.dispatchCommand", payload: [
                "type": typeByMethod[method] ?? "thread.archive",
                "commandId": UUID().uuidString,
                "threadId": params?.objectValue?["threadId"]?.stringValue ?? "",
            ])
            return rpcResult(["ok": true])

        case "model/list":
            let config = try await request(tag: "server.getConfig", payload: [:]) as? [String: Any] ?? [:]
            return rpcResult(["models": flattenModels(from: config)])

        case "fuzzyFileSearch", "project/searchEntries":
            let object = params?.objectValue ?? [:]
            let payload: [String: Any] = [
                "cwd": object["cwd"]?.stringValue ?? object["path"]?.stringValue ?? "",
                "query": object["query"]?.stringValue ?? "",
                "limit": object["limit"]?.intValue ?? 50,
            ]
            let value = try await request(tag: "projects.searchEntries", payload: payload)
            return rpcResult(value)

        case "project/quickLocations":
            return rpcResult([
                "locations": projectsById.values.map { project in
                    [
                        "name": project["title"] ?? project["workspaceRoot"] ?? "Project",
                        "path": project["workspaceRoot"] ?? "",
                    ]
                }
            ])

        case "project/create":
            let object = params?.objectValue ?? [:]
            let projectId: String = object["projectId"]?.stringValue ?? UUID().uuidString
            let titleCandidate: String? = object["title"]?.stringValue ?? object["name"]?.stringValue
            let title: String = titleCandidate ?? "New Project"
            let workspaceCandidate: String? = object["workspaceRoot"]?.stringValue
                ?? object["path"]?.stringValue
                ?? object["rootPath"]?.stringValue
            let workspaceRoot: String = workspaceCandidate ?? ""
            let createIfMissing: Bool = object["createWorkspaceRootIfMissing"]?.boolValue ?? false
            let payload: [String: Any] = [
                "type": "project.create",
                "commandId": UUID().uuidString,
                "projectId": projectId,
                "title": title,
                "workspaceRoot": workspaceRoot,
                "createWorkspaceRootIfMissing": createIfMissing,
                "createdAt": isoNow(),
            ]
            _ = try await request(tag: "orchestration.dispatchCommand", payload: payload)
            return rpcResult(["projectId": projectId, "ok": true])

        case "project/listDirectory":
            let object = params?.objectValue ?? [:]
            let path = object["path"]?.stringValue ?? object["rootPath"]?.stringValue ?? "/"
            let value = try await request(tag: "filesystem.browse", payload: ["partialPath": path])
            return rpcResult(value)

        case "project/searchDirectories":
            let object = params?.objectValue ?? [:]
            let payload: [String: Any] = [
                "cwd": object["rootPath"]?.stringValue ?? object["cwd"]?.stringValue ?? "",
                "query": object["query"]?.stringValue ?? "",
                "limit": 100,
            ]
            let value = try await request(tag: "projects.searchEntries", payload: payload)
            return rpcResult(value)

        case "git/status":
            return rpcResult(try await request(tag: "vcs.refreshStatus", payload: ["cwd": activeWorkingDirectory(params)]))

        case "git/pull":
            return rpcResult(try await request(tag: "vcs.pull", payload: ["cwd": activeWorkingDirectory(params)]))

        case "git/init":
            return rpcResult(try await request(tag: "vcs.init", payload: ["cwd": activeWorkingDirectory(params)]))

        case "git/runStackedAction":
            let object = params?.objectValue ?? [:]
            var payload: [String: Any] = [
                "actionId": UUID().uuidString,
                "cwd": activeWorkingDirectory(params),
                "action": object["action"]?.stringValue ?? "commit",
            ]
            if let commitMessage = object["commitMessage"]?.stringValue, !commitMessage.isEmpty {
                payload["commitMessage"] = commitMessage
            }
            return rpcResult(try await request(tag: "git.runStackedAction", payload: payload))

        case "git/commit":
            let object = params?.objectValue ?? [:]
            var payload: [String: Any] = [
                "actionId": UUID().uuidString,
                "cwd": activeWorkingDirectory(params),
                "action": "commit",
            ]
            let messageCandidate: String? = object["commitMessage"]?.stringValue
                ?? object["message"]?.stringValue
            if let commitMessage = messageCandidate, !commitMessage.isEmpty {
                payload["commitMessage"] = commitMessage
            }
            return rpcResult(try await request(tag: "git.runStackedAction", payload: payload))

        case "git/push":
            let payload: [String: Any] = [
                "actionId": UUID().uuidString,
                "cwd": activeWorkingDirectory(params),
                "action": "push",
            ]
            return rpcResult(try await request(tag: "git.runStackedAction", payload: payload))

        case "git/branches", "git/listRefs":
            let object = params?.objectValue ?? [:]
            var payload: [String: Any] = ["cwd": activeWorkingDirectory(params)]
            if let query = object["query"]?.stringValue, !query.isEmpty {
                payload["query"] = query
            }
            if let limit = object["limit"]?.intValue {
                payload["limit"] = limit
            }
            return rpcResult(try await request(tag: "vcs.listRefs", payload: payload))

        case "git/createBranch", "git/createRef":
            let object = params?.objectValue ?? [:]
            let refCandidate: String? = object["refName"]?.stringValue
                ?? object["branch"]?.stringValue
                ?? object["name"]?.stringValue
            let switchCandidate: Bool? = object["switchRef"]?.boolValue
                ?? object["checkout"]?.boolValue
            let payload: [String: Any] = [
                "cwd": activeWorkingDirectory(params),
                "refName": refCandidate ?? "",
                "switchRef": switchCandidate ?? true,
            ]
            return rpcResult(try await request(tag: "vcs.createRef", payload: payload))

        case "git/switchBranch", "git/switchRef", "git/checkout":
            let object = params?.objectValue ?? [:]
            let refCandidate: String? = object["refName"]?.stringValue ?? object["branch"]?.stringValue
            let payload: [String: Any] = [
                "cwd": activeWorkingDirectory(params),
                "refName": refCandidate ?? "",
            ]
            return rpcResult(try await request(tag: "vcs.switchRef", payload: payload))

        case "git/createWorktree":
            let object = params?.objectValue ?? [:]
            let refCandidate: String? = object["refName"]?.stringValue ?? object["branch"]?.stringValue
            let pathValue: Any = object["path"]?.stringValue ?? NSNull()
            var payload: [String: Any] = [
                "cwd": activeWorkingDirectory(params),
                "refName": refCandidate ?? "",
                "path": pathValue,
            ]
            if let newRefName = object["newRefName"]?.stringValue, !newRefName.isEmpty {
                payload["newRefName"] = newRefName
            }
            return rpcResult(try await request(tag: "vcs.createWorktree", payload: payload))

        case "git/removeWorktree":
            let object = params?.objectValue ?? [:]
            let pathValue: String = object["path"]?.stringValue ?? ""
            let forceValue: Bool = object["force"]?.boolValue ?? false
            let payload: [String: Any] = [
                "cwd": activeWorkingDirectory(params),
                "path": pathValue,
                "force": forceValue,
            ]
            return rpcResult(try await request(tag: "vcs.removeWorktree", payload: payload))

        case "account/status/read", "getAuthStatus":
            return rpcResult(["status": "authenticated", "isAuthenticated": true, "tokenReady": true])

        case "account/rateLimits/read":
            return rpcResult(["buckets": []])

        case "collaborationMode/list":
            return rpcResult(["modes": ["default", "plan"]])

        case "skills/list", "plugin/list", "pet/list":
            return rpcResult(["data": []])

        case "notifications/push/register",
             "desktop/preferences/update",
             "desktop/wakeDisplay",
             "desktop/continueOnDesktop",
             "voice/resolveAuth":
            return rpcResult(["ok": true])

        default:
            throw TrifectaBridgeError.requestFailed("Unsupported Trifecta RPC on Trifecta desktop: \(method)")
        }
    }

    // SSH bridge transport — called from CodexService+SSH.swift
    func sshRequest(tag: String, payload: [String: Any]) async throws -> Any? {
        try await request(tag: tag, payload: payload)
    }

    func sshSubscribeTerminal(sessionId: String, onValue: @escaping (Any) -> Void) async throws -> String {
        try await subscribe(tag: "subscribeSshTerminal", payload: ["sessionId": sessionId], onValue: onValue)
    }

    func sshCancelSubscription(requestId: String) async {
        await cancel(requestId: requestId)
    }

    private func subscribeShell() async throws {
        _ = try await subscribe(tag: "orchestration.subscribeShell", payload: [:]) { [weak self] value in
            Task { @MainActor [weak self] in
                self?.applyShellItem(value)
            }
        }
    }

    private func threadDetail(threadId: String) async throws -> [String: Any] {
        // Fast path: the persistent subscribeThread stream already cached this thread's
        // snapshot when it first opened. Serve from there to avoid the duplicate-subscribe
        // race that trifecta-desktop dedupes (which would time out with "Thread not found").
        if let cached = threadSnapshotsByID[threadId] {
            return cached
        }
        // Ensure a persistent subscription is open so the cache gets populated.
        subscribeThreadIfNeeded(threadId: threadId)

        // Wait briefly for the persistent subscription's first snapshot to land. The cache is
        // populated by applyThreadStreamItem on every snapshot frame, so we poll it.
        let started = Date()
        while threadSnapshotsByID[threadId] == nil && Date().timeIntervalSince(started) < 5 {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        if let cached = threadSnapshotsByID[threadId] {
            return cached
        }
        throw TrifectaBridgeError.requestFailed("Thread \(threadId) was not found.")
    }

    private func request(tag: String, payload: Any) async throws -> Any? {
        let id = nextRequestId()
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            Task { @MainActor in
                do {
                    try await send(.request(id: id, tag: tag, payload: payload))
                } catch {
                    pending.removeValue(forKey: id)?.resume(throwing: error)
                }
            }
        }
    }

    private func subscribe(tag: String, payload: Any, onValue: @escaping (Any) -> Void) async throws -> String {
        let id = nextRequestId()
        streamHandlers[id] = onValue
        try await send(.request(id: id, tag: tag, payload: payload))
        return id
    }

    private func cancel(requestId: String) async {
        streamHandlers.removeValue(forKey: requestId)
        try? await send(.interrupt(requestId: requestId))
    }

    private func send(_ message: TrifectaEffectRPCMessage) async throws {
        guard let task else { throw TrifectaBridgeError.disconnected }
        let text = try TrifectaEffectRPCCodec.encode(message)
        let previous = sendTail
        let operation = Task {
            if let previous {
                await previous.value
            }
            try await task.send(.string(text))
        }
        sendTail = Task {
            _ = try? await operation.value
        }

        do {
            try await operation.value
        } catch {
            handleTransportFailure(error, task: task)
            throw error
        }
    }

    private func receiveLoop() async {
        guard let task else { return }
        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                let text: String
                switch message {
                case .string(let string): text = string
                case .data(let data): text = String(data: data, encoding: .utf8) ?? ""
                @unknown default: continue
                }
                for frame in try TrifectaEffectRPCCodec.decode(text) {
                    await handle(frame)
                }
            } catch {
                handleTransportFailure(error, task: task)
                return
            }
        }
    }

    private func heartbeatLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            do {
                try await send(.ping)
            } catch {
                return
            }
        }
    }

    private func handleTransportFailure(_ error: Error, task failedTask: URLSessionWebSocketTask) {
        guard task === failedTask else { return }
        let message = formatWebSocketOpenError(error, task: failedTask)
        task = nil
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        sendTail?.cancel()
        session?.invalidateAndCancel()
        session = nil
        socketDelegate = nil
        pending.values.forEach { $0.resume(throwing: TrifectaBridgeError.disconnected) }
        pending.removeAll()
        streamHandlers.removeAll()
        threadStreamSubscriptions.removeAll()
        threadSnapshotsByID.removeAll()
        codex?.lastErrorMessage = message
        codex?.isConnected = false
    }

    private func formatWebSocketOpenError(_ error: Error, task: URLSessionWebSocketTask) -> String {
        var parts = [error.localizedDescription]
        if task.closeCode != .invalid {
            parts.append(formatCloseCode(task.closeCode))
        }
        if let closeReason = task.closeReason,
           let reason = String(data: closeReason, encoding: .utf8),
           !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(reason)
        }
        return parts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func formatCloseCode(_ code: URLSessionWebSocketTask.CloseCode) -> String {
        switch code {
        case .noStatusReceived:
            return "server closed without a WebSocket close status"
        case .abnormalClosure:
            return "abnormal WebSocket closure"
        default:
            return "close code \(code.rawValue)"
        }
    }

    private func handle(_ message: TrifectaEffectRPCMessage) async {
        switch message {
        case .ping:
            try? await send(.pong)
        case .chunk(let requestId, let values):
            for value in values {
                streamHandlers[requestId]?(value)
            }
            try? await send(.ack(requestId: requestId))
        case .exit(let requestId, let success, let value, let errorMessage):
            if let continuation = pending.removeValue(forKey: requestId) {
                if success {
                    continuation.resume(returning: value)
                } else {
                    continuation.resume(throwing: TrifectaBridgeError.requestFailed(errorMessage ?? "Request failed."))
                }
            } else {
                streamHandlers.removeValue(forKey: requestId)
            }
        case .defect(let message):
            codex?.lastErrorMessage = message
        default:
            break
        }
    }

    private func applyShellItem(_ value: Any) {
        guard let item = value as? [String: Any],
              let kind = item["kind"] as? String else {
            return
        }

        switch kind {
        case "snapshot":
            let snapshot = item["snapshot"] as? [String: Any] ?? [:]
            projectsById = Dictionary(uniqueKeysWithValues: (snapshot["projects"] as? [[String: Any]] ?? []).compactMap {
                guard let id = $0["id"] as? String else { return nil }
                return (id, $0)
            })
            threadsById = Dictionary(uniqueKeysWithValues: (snapshot["threads"] as? [[String: Any]] ?? []).compactMap {
                guard let id = $0["id"] as? String else { return nil }
                return (id, $0)
            })
            let sortedThreads: [CodexThread] = threadsById.values
                .map(trifectaThreadFromShell)
                .sorted { (a, b) -> Bool in
                    let lhs: Date = a.updatedAt ?? Date.distantPast
                    let rhs: Date = b.updatedAt ?? Date.distantPast
                    return lhs > rhs
                }
            codex?.threads = sortedThreads
            for thread in threadsById.values {
                guard let id = thread["id"] as? String else { continue }
                applySessionRunState(threadId: id, thread: thread)
                if shouldSubscribeThreadStream(threadId: id, thread: thread) {
                    subscribeThreadIfNeeded(threadId: id)
                } else {
                    unsubscribeThread(threadId: id)
                }
            }
        case "thread-upserted":
            guard let thread = item["thread"] as? [String: Any],
                  let id = thread["id"] as? String else { return }
            threadsById[id] = thread
            codex?.upsertThread(trifectaThreadFromShell(thread), treatAsServerState: true)
            applySessionRunState(threadId: id, thread: thread)
            if shouldSubscribeThreadStream(threadId: id, thread: thread) {
                subscribeThreadIfNeeded(threadId: id)
            } else {
                unsubscribeThread(threadId: id)
            }
        case "thread-removed":
            guard let id = item["threadId"] as? String else { return }
            threadsById.removeValue(forKey: id)
            codex?.threads.removeAll { $0.id == id }
            unsubscribeThread(threadId: id)
        case "project-upserted":
            guard let project = item["project"] as? [String: Any],
                  let id = project["id"] as? String else { return }
            projectsById[id] = project
        case "project-removed":
            guard let id = item["projectId"] as? String else { return }
            projectsById.removeValue(forKey: id)
        default:
            break
        }
    }

    // Mirrors trifecta-desktop's per-thread session.status into the local running flags so the
    // composer's "Trifecta is thinking..." indicator and the disabled send button clear when the
    // model finishes. Without this the indicator stays on forever because the bridge subscribes
    // only to the cross-project shell stream, and never to per-thread events that would emit a
    // turn/completed signal.
    private func applySessionRunState(threadId: String, thread: [String: Any]) {
        guard let codex else { return }
        let session = thread["session"] as? [String: Any] ?? [:]
        let status = (session["status"] as? String)?.lowercased() ?? ""
        let activeTurnId: String? = {
            if let s = session["activeTurnId"] as? String, !s.isEmpty { return s }
            return nil
        }()

        // Only "running" / "starting" keep the indicator on. Anything else (including unknown
        // future statuses) is treated as terminal — better to over-clear than to leave the
        // composer locked forever if trifecta-desktop adds a new enum case.
        let runningStates: Set<String> = ["running", "starting"]
        if runningStates.contains(status) {
            if let activeTurnId {
                codex.activeTurnIdByThread[threadId] = activeTurnId
            }
            codex.runningThreadIDs.insert(threadId)
        } else if !status.isEmpty {
            let resolvedTurnId: String? = activeTurnId ?? codex.activeTurnIdByThread[threadId]
            codex.markTurnCompleted(threadId: threadId, turnId: resolvedTurnId)
            // markTurnCompleted clears the three running sets but the per-thread render
            // snapshot still caches isThreadRunning=true. Force a recompute so the composer's
            // "Trifecta is thinking..." indicator and Stop button actually go away.
            codex.refreshThreadTimelineState(for: threadId)
        }
    }

    // Opens a per-thread orchestration.subscribeThread stream if one isn't already open. trifecta-desktop's
    // shell stream only carries thread metadata changes; per-thread session.status events (the signal
    // that drives "Trifecta is thinking..." on/off) only flow over subscribeThread.
    private func subscribeThreadIfNeeded(threadId: String) {
        guard threadStreamSubscriptions[threadId] == nil else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Re-check inside the task so two concurrent upserts don't open duplicate subscriptions.
            guard self.threadStreamSubscriptions[threadId] == nil else { return }
            do {
                let payload: [String: Any] = ["threadId": threadId]
                let requestId = try await self.subscribe(
                    tag: "orchestration.subscribeThread",
                    payload: payload
                ) { [weak self] value in
                    Task { @MainActor [weak self] in
                        self?.applyThreadStreamItem(threadId: threadId, value: value)
                    }
                }
                self.threadStreamSubscriptions[threadId] = requestId
                NSLog("[trifecta-thread-stream] %@ subscription opened id=%@", threadId, requestId)
            } catch {
                NSLog("[trifecta-thread-stream] %@ subscribe FAILED: %@",
                      threadId, String(describing: error))
            }
        }
    }

    private func shouldSubscribeThreadStream(threadId: String, thread: [String: Any]) -> Bool {
        if codex?.activeThreadId == threadId {
            return true
        }
        let session = thread["session"] as? [String: Any] ?? [:]
        let status = (session["status"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""
        return status == "running" || status == "starting"
    }

    private func unsubscribeThread(threadId: String) {
        guard let requestId = threadStreamSubscriptions.removeValue(forKey: threadId) else { return }
        Task { @MainActor [weak self] in
            await self?.cancel(requestId: requestId)
        }
    }

    // Handles either a full snapshot or an individual event from subscribeThread. We only care
    // about session.status here — message streaming will be a separate fix. Logs with the
    // [trifecta-thread-stream] tag so the user can grep Console.app to see what's actually
    // arriving when the running indicator hangs.
    private func applyThreadStreamItem(threadId: String, value: Any) {
        guard let object = value as? [String: Any] else {
            NSLog("[trifecta-thread-stream] %@: non-object value", threadId)
            return
        }
        let kind = (object["kind"] as? String) ?? "(no-kind)"

        if let snapshot = object["snapshot"] as? [String: Any],
           let thread = snapshot["thread"] as? [String: Any] {
            let status = ((thread["session"] as? [String: Any])?["status"] as? String) ?? "(none)"
            NSLog("[trifecta-thread-stream] %@ snapshot session.status=%@", threadId, status)
            // Cache the full thread payload so thread/read and thread/resume can serve
            // synchronously without opening a duplicate (and likely deduped) subscription.
            threadSnapshotsByID[threadId] = thread
            applySessionRunState(threadId: threadId, thread: thread)
            return
        }
        if let event = object["event"] as? [String: Any] {
            let type = (event["type"] as? String) ?? ""
            let payload = event["payload"] as? [String: Any] ?? [:]
            NSLog("[trifecta-thread-stream] %@ event type=%@", threadId, type)
            if type == "thread.session-set", let session = payload["session"] as? [String: Any] {
                applySessionRunState(threadId: threadId, thread: ["session": session])
            }
            return
        }
        // Fallback for shapes that put `type` at the top level.
        if let type = object["type"] as? String,
           type == "thread.session-set" {
            NSLog("[trifecta-thread-stream] %@ flat session-set", threadId)
            let session = (object["payload"] as? [String: Any])?["session"] as? [String: Any]
                ?? object["session"] as? [String: Any]
            if let session {
                applySessionRunState(threadId: threadId, thread: ["session": session])
            }
            return
        }
        NSLog("[trifecta-thread-stream] %@ unhandled kind=%@ keys=%@",
              threadId, kind, Array(object.keys).joined(separator: ","))
    }

    private func trifectaThreadFromShell(_ thread: [String: Any]) -> CodexThread {
        let mapped = trifectaThread(thread)
        let value = JSONValue(jsonObject: mapped)
        return (try? JSONDecoder().decode(CodexThread.self, from: JSONEncoder().encode(value)))
            ?? CodexThread(id: thread["id"] as? String ?? UUID().uuidString)
    }

    private func trifectaThread(_ thread: [String: Any]) -> [String: Any] {
        let project = projectsById[thread["projectId"] as? String ?? ""]
        let model = thread["modelSelection"] as? [String: Any]
        // Use as? String to skip NSNull (JSON null) and fall through to the project path.
        let cwd = (thread["worktreePath"] as? String) ?? (project?["workspaceRoot"] as? String) ?? ""
        var metadata: [String: Any] = [:]
        if let modelSelection = model, !modelSelection.isEmpty {
            metadata["modelSelection"] = modelSelection
        }
        if let runtimeMode = thread["runtimeMode"] as? String,
           !runtimeMode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            metadata["runtimeMode"] = runtimeMode
        }
        var mapped: [String: Any] = [
            "id": thread["id"] ?? UUID().uuidString,
            "title": thread["title"] ?? "Thread",
            "name": thread["title"] ?? "Thread",
            "preview": thread["title"] ?? "",
            "createdAt": thread["createdAt"] ?? isoNow(),
            "updatedAt": thread["updatedAt"] ?? isoNow(),
            "cwd": cwd,
            "model": model?["model"] ?? model?["modelId"] ?? "",
            "modelProvider": model?["provider"] ?? model?["providerInstanceId"] ?? model?["instanceId"] ?? "",
            "syncState": (thread["archivedAt"] is String) ? "archivedLocal" : "live",
        ]
        if !metadata.isEmpty {
            mapped["metadata"] = metadata
        }
        return mapped
    }

    private func trifectaThreadDetail(_ thread: [String: Any]) -> [String: Any] {
        var mapped = trifectaThread(thread)
        mapped["turns"] = trifectaTurnListData(from: thread)
        return mapped
    }

    private func trifectaTurnListData(from thread: [String: Any]) -> [[String: Any]] {
        if let turns = thread["turns"] as? [[String: Any]], !turns.isEmpty {
            return turns.enumerated().map { index, turn in
                trifectaTurn(from: turn, index: index)
            }
        }
        return trifectaTurns(from: thread["messages"] as? [[String: Any]] ?? [])
    }

    private func trifectaTurns(from messages: [[String: Any]]) -> [[String: Any]] {
        var turns: [[String: Any]] = []
        var turnIndexById: [String: Int] = [:]

        for (index, message) in messages.enumerated() {
            if let nestedItems = message["items"] as? [[String: Any]], !nestedItems.isEmpty {
                let turn = trifectaTurn(from: message, index: index)
                let turnId = turn["id"] as? String ?? "turn-\(index)"
                turnIndexById[turnId] = turns.count
                turns.append(turn)
                continue
            }

            let turnId = firstNonEmptyString([
                message["turnId"],
                message["turn_id"],
                message["turnID"],
            ]) ?? "turn-\(index)"
            let item = trifectaHistoryItem(from: message, index: index)

            if let existingIndex = turnIndexById[turnId] {
                var turn = turns[existingIndex]
                var items = turn["items"] as? [[String: Any]] ?? []
                items.append(item)
                turn["items"] = items
                if turn["createdAt"] == nil {
                    turn["createdAt"] = message["createdAt"] ?? message["timestamp"] ?? isoNow()
                }
                turns[existingIndex] = turn
            } else {
                turnIndexById[turnId] = turns.count
                // Default missing/null status to "completed" — iOS's isInterruptibleTurnStatus
                // treats nil status as interruptible (running), which would re-arm the running
                // indicator on every thread/resume and pin "Trifecta is thinking…" forever.
                // Any turn we project from completed messages is, by definition, no longer running.
                turns.append([
                    "id": turnId,
                    "createdAt": message["createdAt"] ?? message["timestamp"] ?? isoNow(),
                    "status": message["status"] ?? "completed",
                    "items": [item],
                ])
            }
        }

        return turns
    }

    private func trifectaTurn(from turn: [String: Any], index: Int) -> [String: Any] {
        let items = (turn["items"] as? [[String: Any]] ?? [])
            .enumerated()
            .map { itemIndex, item in
                trifectaHistoryItem(from: item, index: itemIndex)
            }

        // Defaults to "completed" rather than NSNull when trifecta-desktop omits status.
        // See trifectaTurns above — nil status triggers iOS's interruptible-turn fallback and
        // keeps the running indicator on forever.
        let resolvedStatus: Any = turn["status"]
            ?? turn["terminalState"]
            ?? turn["terminal_state"]
            ?? "completed"
        return [
            "id": firstNonEmptyString([turn["id"], turn["turnId"], turn["turn_id"]]) ?? "turn-\(index)",
            "createdAt": turn["createdAt"] ?? turn["created_at"] ?? turn["timestamp"] ?? isoNow(),
            "status": resolvedStatus,
            "items": items,
        ]
    }

    private func trifectaHistoryItem(from raw: [String: Any], index: Int) -> [String: Any] {
        var item = raw
        let role = firstNonEmptyString([raw["role"]]) ?? inferRole(from: raw)
        item["id"] = firstNonEmptyString([raw["id"], raw["itemId"], raw["item_id"]]) ?? "item-\(index)"
        item["role"] = role
        item["type"] = normalizedHistoryItemType(raw["type"], role: role)
        item["createdAt"] = raw["createdAt"] ?? raw["created_at"] ?? raw["timestamp"] ?? isoNow()

        if item["text"] == nil,
           let text = firstNonEmptyString([
               raw["text"],
               raw["message"],
               raw["summary"],
               raw["output"],
               raw["outputText"],
               raw["output_text"],
           ]) {
            item["text"] = text
        }

        if item["arguments"] == nil, let input = raw["input"] {
            item["arguments"] = input
        }
        if item["call_id"] == nil, let callId = firstNonEmptyString([raw["callId"], raw["toolCallId"], raw["tool_call_id"]]) {
            item["call_id"] = callId
        }
        return item
    }

    private func normalizedHistoryItemType(_ rawType: Any?, role: String) -> String {
        let raw = (rawType as? String) ?? ""
        let normalized = raw.lowercased().replacingOccurrences(of: #"[\s_-]+"#, with: "", options: .regularExpression)
        switch normalized {
        case "usermessage":
            return "user_message"
        case "agentmessage", "assistantmessage":
            return "agent_message"
        case "functioncall", "toolcall":
            return "tool_call"
        case "functioncalloutput", "toolcalloutput":
            return "tool_call_output"
        case "commandexecution", "command":
            return "command_execution"
        case "filechange", "diff", "reasoning", "plan", "message":
            return raw
        default:
            return role.lowercased().contains("user") ? "user_message" : "agent_message"
        }
    }

    private func inferRole(from raw: [String: Any]) -> String {
        let type = ((raw["type"] as? String) ?? "").lowercased()
        if type.contains("user") {
            return "user"
        }
        return "assistant"
    }

    private func firstNonEmptyString(_ values: [Any?]) -> String? {
        for value in values {
            if let string = value as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    return trimmed
                }
            }
        }
        return nil
    }

    // Finds an existing project whose workspaceRoot matches `cwd`, or creates one on demand so
    // bootstrap.createThread receives a valid projectId. trifecta-desktop rejects the dispatch
    // if projectId is empty or refers to an unknown project.
    private func ensureProjectForCwd(_ cwd: String) async throws -> String {
        let trimmed = cwd.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty,
           let existing = projectsById.first(where: { ($0.value["workspaceRoot"] as? String) == trimmed }) {
            return existing.key
        }
        if trimmed.isEmpty {
            // No cwd hint: any existing project is better than none. Sorted for determinism.
            return projectsById.keys.sorted().first ?? ""
        }
        let projectId = UUID().uuidString
        let title = (trimmed as NSString).lastPathComponent.isEmpty
            ? trimmed
            : (trimmed as NSString).lastPathComponent
        let createPayload: [String: Any] = [
            "type": "project.create",
            "commandId": UUID().uuidString,
            "projectId": projectId,
            "title": title,
            "workspaceRoot": trimmed,
            "createdAt": isoNow(),
        ]
        _ = try await request(tag: "orchestration.dispatchCommand", payload: createPayload)
        // Cache so the next lookup hits instead of double-creating before the shell upsert arrives.
        projectsById[projectId] = [
            "id": projectId,
            "title": title,
            "workspaceRoot": trimmed,
            "createdAt": isoNow(),
        ]
        return projectId
    }

    private func dispatchPayload(
        from params: JSONValue?,
        createsThread: Bool,
        resolvedProjectId: String = ""
    ) -> [String: Any] {
        let object = params?.objectValue ?? [:]
        let threadCandidate: String? = object["threadId"]?.stringValue ?? object["id"]?.stringValue
        let threadId: String = threadCandidate ?? UUID().uuidString
        let textCandidate: String? = object["message"]?.stringValue
            ?? object["prompt"]?.stringValue
            ?? object["input"]?.stringValue
            ?? object["text"]?.stringValue
        let text: String = textCandidate ?? ""

        let modelSelection: [String: Any] = resolveModelSelection(from: object, threadId: threadId)
        let attachments: [[String: Any]] = resolveAttachments(from: object)
        let interactionMode: String = (object["collaborationMode"]?.objectValue?["mode"]?.stringValue == "plan")
            ? "plan" : "default"
        let runtimeMode: String = object["runtimeMode"]?.stringValue
            ?? codex?.composerRuntimeModePayload(for: threadId)
            ?? "approval-required"

        let message: [String: Any] = [
            "messageId": UUID().uuidString,
            "role": "user",
            "text": text,
            "attachments": attachments,
        ]

        var payload: [String: Any] = [
            "type": "thread.turn.start",
            "commandId": UUID().uuidString,
            "threadId": threadId,
            "message": message,
            "runtimeMode": runtimeMode,
            "interactionMode": interactionMode,
            "createdAt": isoNow(),
        ]
        if !modelSelection.isEmpty {
            payload["modelSelection"] = modelSelection
        }
        if createsThread {
            let projectCandidate: String? = (!resolvedProjectId.isEmpty ? resolvedProjectId : nil)
                ?? object["projectId"]?.stringValue
                ?? projectsById.keys.sorted().first
            let projectId: String = projectCandidate ?? ""
            let titleSeed: String = text.isEmpty ? "New thread" : String(text.prefix(80))
            let bootstrap: [String: Any] = [
                "createThread": [
                    "projectId": projectId,
                    "title": titleSeed,
                    "modelSelection": modelSelection,
                    "runtimeMode": runtimeMode,
                    "interactionMode": interactionMode,
                    "branch": NSNull(),
                    "worktreePath": NSNull(),
                    "createdAt": isoNow(),
                ]
            ]
            payload["bootstrap"] = bootstrap
        }
        return payload
    }

    // The iOS composer passes the selected model under several keys depending on call site. If none
    // is supplied, fall back to the first eligible model on any available provider so trifecta-desktop's
    // schema (which requires { instanceId, model }) does not reject the dispatch.
    private func resolveModelSelection(from object: [String: JSONValue], threadId: String) -> [String: Any] {
        if let explicit = object["modelSelection"]?.objectValue {
            var dictionary: [String: Any] = [:]
            for (key, value) in explicit {
                dictionary[key] = value.jsonObjectValue
            }
            let parsed = ComposerModelSelection.from(dictionary: dictionary)
            let payload = parsed.toDictionary()
            if !payload.isEmpty { return payload }
        }

        let threadId = object["threadId"]?.stringValue ?? object["id"]?.stringValue
        if let threadId,
           let draftPayload = codex?.composerModelSelectionPayload(for: threadId),
           !draftPayload.isEmpty {
            return draftPayload
        }

        let model: String? = object["model"]?.stringValue
            ?? object["modelId"]?.stringValue
            ?? object["slug"]?.stringValue
        let instanceId: String? = object["providerInstanceId"]?.stringValue
            ?? object["provider"]?.stringValue
            ?? object["modelProvider"]?.stringValue

        if let model, let instanceId {
            var selection: [String: Any] = ["model": model, "instanceId": instanceId]
            if let effort = object["effort"]?.stringValue, !effort.isEmpty {
                selection["options"] = [
                    ["id": "reasoningEffort", "value": effort],
                ]
            }
            return selection
        }

        // Last resort: pick anything available so the dispatch isn't rejected outright.
        for project in projectsById.values {
            if let selection = project["defaultModelSelection"] as? [String: Any],
               !selection.isEmpty {
                return selection
            }
        }
        return [:]
    }

    private func resolveAttachments(from object: [String: JSONValue]) -> [[String: Any]] {
        guard let raw = object["attachments"]?.arrayValue else { return [] }
        var result: [[String: Any]] = []
        for value in raw {
            guard let item = value.objectValue else { continue }
            var entry: [String: Any] = ["type": item["type"]?.stringValue ?? "image"]
            if let id = item["id"]?.stringValue { entry["id"] = id }
            if let name = item["name"]?.stringValue { entry["name"] = name }
            if let mimeType = item["mimeType"]?.stringValue ?? item["mime_type"]?.stringValue {
                entry["mimeType"] = mimeType
            }
            if let sizeBytes = item["sizeBytes"]?.intValue ?? item["size_bytes"]?.intValue {
                entry["sizeBytes"] = sizeBytes
            }
            if let dataUrl = item["dataUrl"]?.stringValue ?? item["data_url"]?.stringValue {
                entry["dataUrl"] = dataUrl
            }
            result.append(entry)
        }
        return result
    }

    // Translates trifecta-desktop's ServerProvider + ServerProviderModel shape into the schema
    // CodexModelOption expects. Preserves slug (so model selection actually round-trips), provider
    // identity (so ProviderIcon picks the right driver glyph), and capabilities.optionDescriptors
    // (so reasoning effort and fast-mode toggles populate instead of showing "no options").
    private func flattenModels(from config: [String: Any]) -> [[String: Any]] {
        let providers = config["providers"] as? [[String: Any]] ?? []
        return providers.flatMap { provider -> [[String: Any]] in
            (provider["models"] as? [[String: Any]] ?? []).compactMap { model in
                buildModelOption(provider: provider, model: model)
            }
        }
    }

    private func buildModelOption(provider: [String: Any], model: [String: Any]) -> [String: Any]? {
        if let eligible = firstBool(in: model, keys: ["eligible", "available", "enabled"]),
           eligible == false {
            return nil
        }

        let slug: String = (model["slug"] as? String)
            ?? (model["id"] as? String)
            ?? (model["model"] as? String)
            ?? ""
        let normalizedSlug = slug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSlug.isEmpty else { return nil }

        let displayName: String = (model["shortName"] as? String)
            ?? (model["name"] as? String)
            ?? slug
        let providerDriver: String = (provider["driver"] as? String) ?? ""
        let providerInstanceId: String = (provider["instanceId"] as? String) ?? providerDriver
        let providerDisplay: String = (provider["displayName"] as? String) ?? providerDriver
        let providerBadge: String = (provider["badgeLabel"] as? String) ?? ""

        let descriptors = (model["capabilities"] as? [String: Any])?["optionDescriptors"] as? [[String: Any]] ?? []
        let (reasoningOptions, defaultEffort) = extractReasoningOptions(from: descriptors)
        let supportsFastMode: Bool = extractSupportsFastMode(from: descriptors)
        let selectDescriptors = extractSelectDescriptors(from: descriptors)

        var entry: [String: Any] = [
            "id": "\(providerInstanceId)|\(normalizedSlug)",
            "model": normalizedSlug,
            "slug": normalizedSlug,
            "displayName": displayName,
            "name": displayName,
            "description": (model["description"] as? String) ?? "",
            "isDefault": (model["isDefault"] as? Bool) ?? false,
            "supportsFastMode": supportsFastMode,
            "providerId": providerInstanceId,
            "providerLabel": providerBadge,
            "providerDisplayName": providerDisplay,
            "providerDriver": providerDriver,
        ]
        if let subProvider = model["subProvider"] as? String, !subProvider.isEmpty {
            entry["subProvider"] = subProvider
        }
        if !reasoningOptions.isEmpty {
            entry["supportedReasoningEfforts"] = reasoningOptions
        }
        if let defaultEffort, !defaultEffort.isEmpty {
            entry["defaultReasoningEffort"] = defaultEffort
        }
        if !selectDescriptors.isEmpty {
            entry["selectOptionDescriptors"] = selectDescriptors
        }
        return entry
    }

    private func firstBool(in object: [String: Any], keys: [String]) -> Bool? {
        for key in keys {
            if let value = object[key] as? Bool {
                return value
            }
        }
        return nil
    }

    private func extractSelectDescriptors(from descriptors: [[String: Any]]) -> [[String: Any]] {
        descriptors.compactMap { descriptor in
            let type = (descriptor["type"] as? String)?.lowercased()
            guard type == "select" else { return nil }
            let id = (descriptor["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !id.isEmpty else { return nil }
            let label = (descriptor["label"] as? String) ?? id
            let rawOptions = (descriptor["options"] as? [[String: Any]]) ?? []
            let options: [[String: Any]] = rawOptions.compactMap { option in
                guard let optionID = option["id"] as? String, !optionID.isEmpty else { return nil }
                return [
                    "id": optionID,
                    "label": (option["label"] as? String) ?? optionID,
                    "isDefault": (option["isDefault"] as? Bool) ?? false,
                ]
            }
            guard !options.isEmpty else { return nil }
            var mapped: [String: Any] = [
                "id": id,
                "label": label,
                "options": options,
            ]
            if let currentValue = descriptor["currentValue"] as? String, !currentValue.isEmpty {
                mapped["currentValue"] = currentValue
            }
            return mapped
        }
    }

    private func extractReasoningOptions(
        from descriptors: [[String: Any]]
    ) -> (options: [[String: Any]], defaultEffort: String?) {
        let effortIds: Set<String> = ["effort", "reasoning", "reasoningEffort", "reasoning_effort"]
        guard let descriptor = descriptors.first(where: {
            let id = ($0["id"] as? String)?.lowercased() ?? ""
            return effortIds.contains(id)
        }) else {
            return ([], nil)
        }
        let rawOptions = (descriptor["options"] as? [[String: Any]]) ?? []
        var options: [[String: Any]] = []
        var defaultEffort: String? = (descriptor["currentValue"] as? String)
        for option in rawOptions {
            guard let id = option["id"] as? String, !id.isEmpty else { continue }
            let label = (option["label"] as? String) ?? id.capitalized
            options.append([
                "reasoningEffort": id,
                "description": label,
            ])
            if defaultEffort == nil, (option["isDefault"] as? Bool) == true {
                defaultEffort = id
            }
        }
        return (options, defaultEffort)
    }

    private func extractSupportsFastMode(from descriptors: [[String: Any]]) -> Bool {
        let fastIds: Set<String> = ["fast", "fastmode", "fast_mode"]
        return descriptors.contains { descriptor in
            let id = (descriptor["id"] as? String)?.lowercased().replacingOccurrences(of: "-", with: "") ?? ""
            return fastIds.contains(id)
        }
    }

    private func activeWorkingDirectory(_ params: JSONValue?) -> String {
        if let cwd = params?.objectValue?["cwd"]?.stringValue, !cwd.isEmpty {
            return cwd
        }
        if let path = params?.objectValue?["path"]?.stringValue, !path.isEmpty {
            return path
        }
        if let threadId = params?.objectValue?["threadId"]?.stringValue,
           let thread = threadsById[threadId] {
            return (thread["worktreePath"] as? String)
                ?? projectsById[thread["projectId"] as? String ?? ""]?["workspaceRoot"] as? String
                ?? ""
        }
        return projectsById.values.compactMap { $0["workspaceRoot"] as? String }.sorted().first ?? ""
    }

    private func rpcResult(_ object: Any?) -> RPCMessage {
        RPCMessage(id: .string(UUID().uuidString), result: JSONValue(jsonObject: object ?? NSNull()), includeJSONRPC: false)
    }

    private func exchangeBootstrapToken() async throws -> String {
        let url = serverBaseURL().appendingPathComponent("api/auth/bootstrap/bearer")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["credential": bootstrapToken])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TrifectaBridgeError.requestFailed(String(data: data, encoding: .utf8) ?? "Pairing failed.")
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let token = (json?["sessionToken"] ?? json?["token"] ?? json?["bearer"]) as? String else {
            throw TrifectaBridgeError.requestFailed("Pairing response did not include a session token.")
        }
        return token
    }

    private func issueWebSocketToken(bearer: String) async throws -> String {
        let url = serverBaseURL().appendingPathComponent("api/auth/ws-token")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TrifectaBridgeError.requestFailed(String(data: data, encoding: .utf8) ?? "WebSocket token request failed.")
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let token = json?["token"] as? String else {
            throw TrifectaBridgeError.requestFailed("WebSocket token response was invalid.")
        }
        return token
    }

    private func webSocketURL(wsToken: String) throws -> URL {
        guard var components = URLComponents(url: serverBaseURL(), resolvingAgainstBaseURL: false) else {
            throw TrifectaBridgeError.invalidServerURL
        }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "wsToken", value: wsToken)]
        guard let url = components.url else { throw TrifectaBridgeError.invalidServerURL }
        return url
    }

    private func serverBaseURL() -> URL {
        var components = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)
        components?.path = ""
        components?.query = nil
        components?.fragment = nil
        return components?.url ?? serverURL
    }

    private func nextRequestId() -> String {
        nextRequestNumber &+= 1
        return String(nextRequestNumber)
    }

    private func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
