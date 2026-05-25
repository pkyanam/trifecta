import SwiftUI
import TrifectaCore
import TrifectaProtocol

/// Single left-column sidebar: active server header at top, thread tree below when connected,
/// environment list when disconnected.
struct UnifiedSidebarView: View {
    @Environment(ConnectionStore.self) private var store
    @Environment(ShellStore.self) private var shellStore
    @Environment(ThreadDetailStore.self) private var threadDetailStore
    @Binding var showingPairingFlow: Bool
    @Binding var selectedThreadId: String?

    var body: some View {
        Group {
            if store.connectionStatus.isConnected, let env = store.activeEnvironment {
                connectedView(env: env)
            } else {
                EnvironmentListView(showingPairingFlow: $showingPairingFlow)
            }
        }
        .onChange(of: selectedThreadId) { _, newId in
            guard let id = newId, let transport = store.transport else { return }
            Task { await threadDetailStore.open(threadId: id, transport: transport) }
        }
    }

    // MARK: - Connected layout

    @ViewBuilder
    private func connectedView(env: SavedEnvironment) -> some View {
        VStack(spacing: 0) {
            serverHeader(env: env)
            Divider()
            threadTree
        }
    }

    private func serverHeader(env: SavedEnvironment) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.green)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(env.label)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(env.httpBaseURL.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Button("Disconnect") { store.disconnect() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Thread tree

    @ViewBuilder
    private var threadTree: some View {
        if shellStore.isLoading {
            ProgressView("Loading threads…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = shellStore.error {
            ContentUnavailableView(
                "Load Failed",
                systemImage: "exclamationmark.triangle",
                description: Text(error)
            )
        } else if shellStore.projects.isEmpty {
            ContentUnavailableView("No Projects", systemImage: "folder")
        } else {
            List(selection: $selectedThreadId) {
                ForEach(shellStore.projects, id: \.id) { project in
                    let projectThreads = shellStore.threadsByProjectId[project.id] ?? []
                    if !projectThreads.isEmpty {
                        Section {
                            ForEach(projectThreads, id: \.id) { thread in
                                SidebarThreadRowView(thread: thread)
                                    .tag(thread.id)
                            }
                        } header: {
                            Text(project.title)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Thread row

private struct SidebarThreadRowView: View {
    let thread: OrchestrationThreadShell

    private var isActive: Bool {
        thread.session?.status == "running" || thread.session?.status == "ready"
    }
    private var hasBadge: Bool {
        thread.hasPendingApprovals || thread.hasPendingUserInput
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(isActive ? Color.green : Color(.systemGray))
                .frame(width: 7, height: 7)

            Text(thread.title)
                .lineLimit(1)

            Spacer()

            if hasBadge {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }
        }
        .padding(.vertical, 1)
    }
}
