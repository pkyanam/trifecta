// FILE: TrifectaIOSApp.swift
// Purpose: App entry point and root dependency wiring.
// Layer: App
// Exports: TrifectaIOSApp

import SwiftUI

@MainActor
@main
struct TrifectaIOSApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @UIApplicationDelegateAdaptor(TrifectaIOSAppDelegate.self) private var appDelegate
    @State private var codexService: CodexService
    @State private var petCompanionStore: PetCompanionStore
    @State private var petCompanionStatusStore: PetCompanionStatusStore
    @AppStorage("codex.appearanceMode") private var appearanceModeRawValue = "system"

    init() {
        let service = CodexService()
        service.configureNotifications()
        _codexService = State(initialValue: service)
        _petCompanionStore = State(initialValue: PetCompanionStore())
        _petCompanionStatusStore = State(initialValue: PetCompanionStatusStore())
    }

    private var preferredColorScheme: ColorScheme? {
        switch appearanceModeRawValue {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(codexService)
                .environment(petCompanionStore)
                .environment(petCompanionStatusStore)
                .preferredColorScheme(preferredColorScheme)
                .onOpenURL { url in
                    Task { @MainActor in
                        guard CodexService.legacyGPTLoginCallbackEnabled else {
                            return
                        }
                        await codexService.handleGPTLoginCallbackURL(url)
                    }
                }
                .task {
                    codexService.loadPersistedState()
                }
                .onReceive(
                    NotificationCenter.default.publisher(
                        for: UIApplication.didReceiveMemoryWarningNotification
                    )
                ) { _ in
                    codexService.evictStaleThreadMessages()
                    TurnCacheManager.resetAll()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    guard newPhase == .background else { return }
                    codexService.evictStaleThreadMessages()
                    TurnCacheManager.resetAll()
                }
        }
    }
}
