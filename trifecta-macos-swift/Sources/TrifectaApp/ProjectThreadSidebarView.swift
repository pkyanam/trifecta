import SwiftUI
import TrifectaCore
import TrifectaProtocol

struct ProjectThreadSidebarView: View {
    @Environment(ShellStore.self) private var shellStore
    @Environment(ThreadDetailStore.self) private var threadDetailStore
    @Environment(ConnectionStore.self) private var connectionStore
    @Binding var selectedThreadId: String?

    var body: some View {
        Group {
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
                        Section {
                            let projectThreads = shellStore.threadsByProjectId[project.id] ?? []
                            ForEach(projectThreads, id: \.id) { thread in
                                ThreadShellRowView(thread: thread)
                                    .tag(thread.id)
                            }
                        } header: {
                            Text(project.title)
                        }
                    }
                }
            }
        }
        .onChange(of: selectedThreadId) { _, newId in
            guard let id = newId, let transport = connectionStore.transport else { return }
            Task { await threadDetailStore.open(threadId: id, transport: transport) }
        }
    }
}

private struct ThreadShellRowView: View {
    let thread: OrchestrationThreadShell

    private var sessionStatus: String? { thread.session?.status }
    private var isActive: Bool { sessionStatus == "running" || sessionStatus == "ready" }
    private var hasBadge: Bool { thread.hasPendingApprovals || thread.hasPendingUserInput }

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
