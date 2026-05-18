import SwiftUI

struct AppRoot: View {
    @Environment(AppEnvironment.self) private var env
    @AppStorage("appearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @State private var didResume = false

    var body: some View {
        Group {
            switch env.sessionState {
            case .unconfigured:
                ConnectionSetupView()
            case .configured:
                SidebarRootView()
            }
        }
        .dynamicTypeSize(.small ... .large)
        .preferredColorScheme((AppAppearance(rawValue: appearanceRaw) ?? .system).colorScheme)
        .task {
            guard !didResume else { return }
            didResume = true
            await env.resumeIfConfigured()
        }
    }
}
