// FILE: CodexService+TrifectaDesktop.swift
// Purpose: Wires the Trifecta service surface to the Trifecta desktop app server.
// Layer: Service extension

import Foundation

extension CodexService {
    func connectToTrifectaDesktop(pairingPayload: CodexPairingQRPayload) async throws {
        guard let serverURL = URL(string: pairingPayload.relay) else {
            throw CodexServiceError.invalidInput("Invalid Trifecta desktop server URL.")
        }

        await disconnect()
        trifectaDesktopBridge?.disconnect()

        isConnecting = true
        defer { isConnecting = false }
        lastErrorMessage = nil
        connectionRecoveryState = .idle
        connectedServerIdentity = "trifecta-desktop:\(serverURL.absoluteString)"
        secureConnectionState = .trustedMac
        relayUrl = pairingPayload.relay
        relaySessionId = pairingPayload.sessionId
        relayMacDeviceId = pairingPayload.macDeviceId
        relayMacIdentityPublicKey = pairingPayload.macIdentityPublicKey

        SecureStore.writeString(pairingPayload.sessionId, for: CodexSecureKeys.relaySessionId)
        SecureStore.writeString(pairingPayload.relay, for: CodexSecureKeys.relayUrl)
        SecureStore.writeString(pairingPayload.macDeviceId, for: CodexSecureKeys.relayMacDeviceId)
        SecureStore.writeString(pairingPayload.macIdentityPublicKey, for: CodexSecureKeys.relayMacIdentityPublicKey)

        let bridge = TrifectaDesktopBridge(
            codex: self,
            serverURL: serverURL,
            bootstrapToken: pairingPayload.sessionId
        )
        try await bridge.connect()

        trifectaDesktopBridge = bridge
        requestTransportOverride = { [weak bridge] method, params in
            guard let bridge else {
                throw CodexServiceError.disconnected
            }
            return try await bridge.handleTrifectaRequest(method: method, params: params)
        }

        isConnected = true
        isInitialized = true
        isLoadingThreads = false
        shouldAutoReconnectOnForeground = false
        startSyncLoop()
        requestImmediateSync(threadId: activeThreadId)
    }
}
