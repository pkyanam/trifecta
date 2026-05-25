import AppKit
import SwiftUI
import TrifectaCore

// Handles the two things SwiftUI's App lifecycle doesn't cover for `swift run` apps:
//   1. activation policy — without .regular the app never appears in the Dock or
//      Cmd-Tab switcher and windows won't come to the front when clicked
//   2. quit-on-close — standard behaviour for a single-window utility
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@main
struct TrifectaApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var store = ConnectionStore()
    @State private var threadDetailStore = ThreadDetailStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .environment(store.shellStore)
                .environment(threadDetailStore)
                .frame(minWidth: 700, minHeight: 480)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 960, height: 620)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Add Connection…") {
                    NotificationCenter.default.post(
                        name: .trifectaShowPairingFlow,
                        object: nil
                    )
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }
}
