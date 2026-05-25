import Foundation
import Observation
import TrifectaProtocol

// MARK: - Connection status

public enum ConnectionStatus: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int, maxAttempts: Int)
    case failed(String)

    public var isConnected: Bool { self == .connected }

    public var displayLabel: String {
        switch self {
        case .disconnected: "Disconnected"
        case .connecting: "Connecting…"
        case .connected: "Connected"
        case .reconnecting(let a, let m): "Reconnecting \(a)/\(m)…"
        case .failed(let msg): "Error: \(msg)"
        }
    }
}

// MARK: - ConnectionStore

/// Manages saved environments, the active RpcTransport, and reconnect logic.
///
/// Reconnect constants mirror wsConnectionState.ts:
///   initial=1s, factor=2×, max=64s, maxRetries=7 (8 total attempts)
@Observable
@MainActor
public final class ConnectionStore {
    private static let reconnectInitialMs: Double = 1_000
    private static let reconnectFactor: Double = 2
    private static let reconnectMaxMs: Double = 64_000
    private static let reconnectMaxRetries = 7

    // MARK: - Public state

    public var shellStore = ShellStore()

    public var savedEnvironments: [SavedEnvironment] = []
    public private(set) var activeEnvironmentId: UUID?
    public private(set) var connectionStatus: ConnectionStatus = .disconnected
    public private(set) var connectedAt: Date?
    public private(set) var lastError: String?

    public var activeEnvironment: SavedEnvironment? {
        savedEnvironments.first { $0.id == activeEnvironmentId }
    }

    public private(set) var transport: RpcTransport?

    // MARK: - Private

    private var connectionTask: Task<Void, Never>?
    private static let defaultsKey = "trifecta.savedEnvironments"

    public init() {
        loadEnvironments()
    }

    // MARK: - Pairing (bootstrap + connect)

    /// Parse a full pairing URL, bootstrap the bearer session, save it, and connect.
    public func pairWith(rawURL: String) async throws {
        let pairing = try PairingURL.parse(string: rawURL)
        try await executePairing(pairing)
    }

    /// Manual host + token entry path.
    public func pairWith(host: String, token: String) async throws {
        let pairing = try PairingURL.direct(host: host, token: token)
        try await executePairing(pairing)
    }

    private func executePairing(_ pairing: PairingURL) async throws {
        let client = PairingClient(httpBaseURL: pairing.httpBaseURL)
        let bootstrap = try await client.bootstrap(credential: pairing.token)
        let label = pairing.httpBaseURL.host ?? pairing.httpBaseURL.absoluteString
        let env = SavedEnvironment(label: label, httpBaseURL: pairing.httpBaseURL)
        try KeychainStore.save(token: bootstrap.sessionToken, for: env.id)
        savedEnvironments.append(env)
        persistEnvironments()
        startConnection(to: env)
    }

    // MARK: - Connect / Disconnect

    public func startConnection(to env: SavedEnvironment) {
        connectionTask?.cancel()
        let stale = transport
        transport = nil
        Task { await stale?.disconnect() }
        activeEnvironmentId = env.id
        connectionStatus = .connecting
        connectionTask = Task { [weak self] in
            await self?.runConnectionLoop(env: env)
        }
    }

    public func disconnect() {
        connectionTask?.cancel()
        let stale = transport
        transport = nil
        Task { await stale?.disconnect() }
        activeEnvironmentId = nil
        connectionStatus = .disconnected
        connectedAt = nil
        shellStore.stop()
    }

    // MARK: - Environment management

    public func remove(environment env: SavedEnvironment) {
        if activeEnvironmentId == env.id { disconnect() }
        try? KeychainStore.delete(for: env.id)
        savedEnvironments.removeAll { $0.id == env.id }
        persistEnvironments()
    }

    public func statusFor(_ env: SavedEnvironment) -> ConnectionStatus {
        guard activeEnvironmentId == env.id else { return .disconnected }
        return connectionStatus
    }

    // MARK: - Connection loop with exponential backoff

    private func runConnectionLoop(env: SavedEnvironment) async {
        for attempt in 0...(Self.reconnectMaxRetries) {
            guard !Task.isCancelled else { return }

            if attempt > 0 {
                let delayMs = reconnectDelayMs(for: attempt - 1)
                connectionStatus = .reconnecting(
                    attempt: attempt,
                    maxAttempts: Self.reconnectMaxRetries + 1
                )
                try? await Task.sleep(for: .milliseconds(Int64(delayMs)))
                guard !Task.isCancelled else { return }
            }

            do {
                guard let sessionToken = try KeychainStore.load(for: env.id) else {
                    connectionStatus = .failed("No session token — re-pair required")
                    return
                }

                let client = PairingClient(httpBaseURL: env.httpBaseURL)
                let wsTicket = try await client.mintWebSocketToken(bearerToken: sessionToken)
                let wsURL = client.webSocketURL(wsToken: wsTicket.token)

                let t = RpcTransport()
                try await t.connect(to: wsURL)

                transport = t
                connectionStatus = .connected
                connectedAt = Date()
                lastError = nil
                await shellStore.start(transport: t)

                // Suspend until the socket drops unexpectedly
                let dropError = await t.waitForDisconnect()
                guard !Task.isCancelled else { return }

                transport = nil
                connectedAt = nil
                lastError = dropError.localizedDescription
                shellStore.stop()

                // Exhausted after last successful connect + drop? Let the loop decide.

            } catch {
                guard !Task.isCancelled else { return }
                lastError = error.localizedDescription
            }

            // If this was the last attempt, mark failed
            if attempt == Self.reconnectMaxRetries {
                connectionStatus = .failed(lastError ?? "Connection failed")
                return
            }
        }
    }

    private func reconnectDelayMs(for attempt: Int) -> Double {
        min(
            Self.reconnectInitialMs * pow(Self.reconnectFactor, Double(attempt)),
            Self.reconnectMaxMs
        )
    }

    // MARK: - Persistence

    private func loadEnvironments() {
        guard let data = UserDefaults.standard.data(forKey: Self.defaultsKey),
              let envs = try? JSONDecoder().decode([SavedEnvironment].self, from: data)
        else { return }
        savedEnvironments = envs
    }

    private func persistEnvironments() {
        guard let data = try? JSONEncoder().encode(savedEnvironments) else { return }
        UserDefaults.standard.set(data, forKey: Self.defaultsKey)
    }
}
