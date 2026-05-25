import Foundation

// MARK: - Errors

public enum RpcError: Error, LocalizedError {
    case notConnected
    case serverFailure(String)
    case transportClosed
    case timeout

    public var errorDescription: String? {
        switch self {
        case .notConnected: "Not connected to server"
        case .serverFailure(let msg): "Server returned failure: \(msg)"
        case .transportClosed: "WebSocket connection closed"
        case .timeout: "Request timed out"
        }
    }
}

// MARK: - Pending requests

private enum PendingRequest {
    case unary(
        continuation: CheckedContinuation<JSONValue, Error>,
        accumulated: [JSONValue]
    )
    case stream(
        continuation: AsyncThrowingStream<JSONValue, Error>.Continuation
    )
}

// MARK: - Transport actor

/// Low-level Effect-RPC transport over a URLSessionWebSocketTask.
///
/// Handles the full wire choreography:
///   - Unary: Request → Chunk(s) [accumulate] → Exit{Success} → resume
///   - Stream: Request → Chunk(s) [yield + Ack] → Exit → finish
///   - Heartbeat: periodic Ping → expect Pong
public actor RpcTransport {
    private var task: URLSessionWebSocketTask?
    private let session: URLSession
    private var nextId: Int = 1
    private var pending: [String: PendingRequest] = [:]
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var isClosed = false
    private var disconnectWaiters: [CheckedContinuation<Error, Never>] = []

    public init(session: URLSession = .shared) {
        self.session = session
    }

    // MARK: - Connect / Disconnect

    public func connect(to url: URL) async throws {
        isClosed = false
        let wsTask = session.webSocketTask(with: url)
        self.task = wsTask
        wsTask.resume()

        receiveTask = Task { [weak self] in
            guard let self else { return }
            await self.receiveLoop()
        }

        heartbeatTask = Task { [weak self] in
            guard let self else { return }
            await self.heartbeatLoop()
        }
    }

    public func disconnect() {
        isClosed = true
        heartbeatTask?.cancel()
        receiveTask?.cancel()
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        failAllPending(with: RpcError.transportClosed)
        resumeDisconnectWaiters(with: RpcError.transportClosed)
    }

    /// Suspends until the transport drops unexpectedly (not via `disconnect()`).
    /// Used by ConnectionStore to drive reconnect without polling.
    public func waitForDisconnect() async -> Error {
        await withCheckedContinuation { cont in
            disconnectWaiters.append(cont)
        }
    }

    // MARK: - Unary call

    /// Sends a request and waits for the complete (potentially multi-chunk) response.
    public func callUnary(
        tag: String,
        payload: JSONValue = .object([:])
    ) async throws -> JSONValue {
        guard let wsTask = task, !isClosed else { throw RpcError.notConnected }
        let id = allocateId()
        try await send(RpcRequest(id: id, tag: tag, payload: payload), to: wsTask)

        return try await withCheckedThrowingContinuation { cont in
            pending[id] = .unary(continuation: cont, accumulated: [])
        }
    }

    // MARK: - Stream subscription

    /// Sends a streaming request and returns an `AsyncThrowingStream` of values.
    ///
    /// The stream is automatically interrupted on the server when the caller
    /// drops the stream (via the `onTermination` handler).
    public func subscribe(
        tag: String,
        payload: JSONValue = .object([:])
    ) -> AsyncThrowingStream<JSONValue, Error> {
        AsyncThrowingStream { [weak self] cont in
            guard let self else {
                cont.finish(throwing: RpcError.notConnected)
                return
            }
            Task {
                do {
                    let id = await self.allocateId()
                    guard let wsTask = await self.task, await !self.isClosed else {
                        cont.finish(throwing: RpcError.notConnected)
                        return
                    }
                    await self.setPending(id: id, request: .stream(continuation: cont))
                    try await self.send(RpcRequest(id: id, tag: tag, payload: payload), to: wsTask)
                    cont.onTermination = { [weak self] _ in
                        Task { await self?.sendInterrupt(id: id) }
                    }
                } catch {
                    cont.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Heartbeat

    public func sendPing() async throws {
        guard let wsTask = task, !isClosed else { throw RpcError.notConnected }
        try await send(RpcPing(), to: wsTask)
    }

    // MARK: - Private

    private func allocateId() -> String {
        let id = nextId
        nextId += 1
        return String(id)
    }

    private func setPending(id: String, request: PendingRequest) {
        pending[id] = request
    }

    private func send<T: Encodable>(_ value: T, to wsTask: URLSessionWebSocketTask) async throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(value)
        let text = String(data: data, encoding: .utf8)!
        try await wsTask.send(.string(text))
    }

    private func sendInterrupt(id: String) async {
        guard let wsTask = task, !isClosed else { return }
        try? await send(RpcInterrupt(requestId: id), to: wsTask)
        pending.removeValue(forKey: id)
    }

    private func sendAck(requestId: String) async {
        guard let wsTask = task, !isClosed else { return }
        try? await send(RpcAck(requestId: requestId), to: wsTask)
    }

    private func failAllPending(with error: Error) {
        for (_, req) in pending {
            switch req {
            case .unary(let cont, _): cont.resume(throwing: error)
            case .stream(let cont): cont.finish(throwing: error)
            }
        }
        pending = [:]
    }

    private func resumeDisconnectWaiters(with error: Error) {
        let waiters = disconnectWaiters
        disconnectWaiters = []
        for cont in waiters { cont.resume(returning: error) }
    }

    private func receiveLoop() async {
        guard let wsTask = task else { return }
        do {
            while !isClosed {
                let message = try await wsTask.receive()
                let text: String
                switch message {
                case .string(let s): text = s
                case .data(let d): text = String(data: d, encoding: .utf8) ?? ""
                @unknown default: continue
                }
                handle(parseServerMessage(text))
            }
        } catch {
            if !isClosed {
                failAllPending(with: error)
                resumeDisconnectWaiters(with: error)
            }
        }
    }

    private func handle(_ message: RpcServerMessage?) {
        guard let message else { return }
        switch message {
        case .chunk(let requestId, let values):
            guard let req = pending[requestId] else { return }
            switch req {
            case .unary(let cont, var accumulated):
                accumulated.append(contentsOf: values)
                pending[requestId] = .unary(continuation: cont, accumulated: accumulated)
            case .stream(let cont):
                for value in values { cont.yield(value) }
                Task { await self.sendAck(requestId: requestId) }
            }

        case .exit(let requestId, let result):
            guard let req = pending.removeValue(forKey: requestId) else { return }
            switch result._tag {
            case "Success":
                switch req {
                case .unary(let cont, let accumulated):
                    cont.resume(returning: accumulated.first ?? .null)
                case .stream(let cont):
                    cont.finish()
                }
            default:
                let cause = result.cause?.map { String(describing: $0) }.joined(separator: ", ") ?? "unknown cause"
                let error = RpcError.serverFailure(cause)
                switch req {
                case .unary(let cont, _): cont.resume(throwing: error)
                case .stream(let cont): cont.finish(throwing: error)
                }
            }

        case .defect(let defect):
            failAllPending(with: RpcError.serverFailure("Defect: \(defect)"))

        case .clientProtocolError(let err):
            failAllPending(with: RpcError.serverFailure("ClientProtocolError: \(err)"))

        case .pong:
            break // heartbeat reply; no action needed

        case .unknown:
            break // ignore unknown server messages
        }
    }

    private func heartbeatLoop() async {
        while !isClosed {
            try? await Task.sleep(for: .seconds(25))
            if !isClosed { try? await sendPing() }
        }
    }
}
