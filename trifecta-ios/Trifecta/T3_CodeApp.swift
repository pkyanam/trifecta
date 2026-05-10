import SwiftUI

@main
struct T3_CodeApp: App {
    @State private var env = AppEnvironment()
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environment(env)
                .tint(AppAccent.color(for: accentRaw))
        }
    }
}
