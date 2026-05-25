import SwiftUI
import TrifectaCore

struct EnvironmentListView: View {
    @Environment(ConnectionStore.self) private var store
    @Binding var showingPairingFlow: Bool

    var body: some View {
        List {
            ForEach(store.savedEnvironments) { env in
                EnvironmentRow(environment: env)
            }
        }
        .overlay {
            if store.savedEnvironments.isEmpty {
                ContentUnavailableView {
                    Label("No Connections", systemImage: "network")
                } description: {
                    Text("Add a Trifecta server to get started.")
                } actions: {
                    Button("Add Connection…") { showingPairingFlow = true }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}

// MARK: - Row

private struct EnvironmentRow: View {
    @Environment(ConnectionStore.self) private var store
    let environment: SavedEnvironment

    private var status: ConnectionStatus { store.statusFor(environment) }
    private var isActive: Bool { store.activeEnvironmentId == environment.id }

    var body: some View {
        HStack(spacing: 10) {
            statusDot

            VStack(alignment: .leading, spacing: 2) {
                Text(environment.label)
                    .fontWeight(.medium)
                Text(environment.httpBaseURL.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if case .failed(let msg) = status {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }

            Spacer()

            actionButton
        }
        .padding(.vertical, 2)
        .contextMenu {
            if isActive {
                Button("Disconnect") { store.disconnect() }
            } else {
                Button("Connect") { store.startConnection(to: environment) }
            }
            Divider()
            Button("Remove", role: .destructive) {
                store.remove(environment: environment)
            }
        }
    }

    private var statusDot: some View {
        Circle()
            .fill(dotColor)
            .frame(width: 8, height: 8)
    }

    @ViewBuilder
    private var actionButton: some View {
        switch status {
        case .disconnected, .failed:
            Button("Connect") { store.startConnection(to: environment) }
                .buttonStyle(.bordered)
                .controlSize(.small)
        case .connecting, .reconnecting:
            ProgressView()
                .controlSize(.small)
        case .connected:
            Button("Disconnect") { store.disconnect() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
    }

    private var dotColor: Color {
        switch status {
        case .connected: .green
        case .connecting, .reconnecting: .yellow
        case .disconnected: Color(.systemGray)
        case .failed: .red
        }
    }
}
