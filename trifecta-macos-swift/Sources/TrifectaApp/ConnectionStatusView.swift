import SwiftUI
import TrifectaCore

struct ConnectionStatusView: View {
    @Environment(ConnectionStore.self) private var store

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(dotColor)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(.regularMaterial, in: Capsule())
    }

    private var dotColor: Color {
        switch store.connectionStatus {
        case .connected: .green
        case .connecting, .reconnecting: .yellow
        case .disconnected: Color(.systemGray)
        case .failed: .red
        }
    }

    private var label: String {
        switch store.connectionStatus {
        case .connected:
            return store.activeEnvironment?.label ?? "Connected"
        case .connecting:
            return "Connecting…"
        case .reconnecting(let a, let m):
            return "Reconnecting \(a)/\(m)"
        case .disconnected:
            return "Not connected"
        case .failed:
            return "Connection failed"
        }
    }
}
