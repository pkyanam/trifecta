// FILE: TrifectaMenuBarApp.swift
// Purpose: Entry point for the macOS companion that turns the existing bridge CLI into a menu bar control center.
// Layer: Companion app
// Exports: TrifectaMenuBarApp
// Depends on: SwiftUI, BridgeMenuBarStore, BridgeMenuBarViews

import SwiftUI

@main
struct TrifectaMenuBarApp: App {
    @StateObject private var store = BridgeMenuBarStore()

    var body: some Scene {
        MenuBarExtra {
            BridgeMenuBarContentView(store: store)
        } label: {
            BridgeMenuBarLabel(
                snapshot: store.snapshot,
                updateState: store.updateState,
                isBusy: store.isRefreshing || store.isPerformingAction
            )
        }
        .menuBarExtraStyle(.window)
    }
}
