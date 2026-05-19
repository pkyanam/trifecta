// FILE: TrifectaTerminalProfileStore.swift
// Purpose: Persists the SSH terminal profile in Keychain-backed app storage.
// Layer: Service
// Exports: TrifectaTerminalProfileStore
// Depends on: SecureStore, TrifectaTerminalProfile

import Foundation

enum TrifectaTerminalProfileStore {
    // Keeps host/key-path configuration with the same Keychain protection as pairing metadata.
    static func load() -> TrifectaTerminalProfile {
        SecureStore.readCodable(TrifectaTerminalProfile.self, for: CodexSecureKeys.terminalSSHProfile)
            ?? .empty
    }

    static func save(_ profile: TrifectaTerminalProfile) {
        SecureStore.writeCodable(profile.normalizedForSave, for: CodexSecureKeys.terminalSSHProfile)
    }
}
