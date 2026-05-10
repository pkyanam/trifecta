import SwiftUI

struct AppRoot: View {
    @Environment(AppEnvironment.self) private var env
    @AppStorage("appearance") private var appearanceRaw: String = AppAppearance.system.rawValue

    var body: some View {
        Group {
            switch env.sessionState {
            case .unconfigured:
                ConnectionSetupView()
            case .configured:
                MainTabView()
            }
        }
        .dynamicTypeSize(.small ... .large)
        .preferredColorScheme((AppAppearance(rawValue: appearanceRaw) ?? .system).colorScheme)
        .task {
            await env.resumeIfConfigured()
        }
    }
}
