import Foundation
import Observation

@Observable
final class ThreadListStore {
    var projects: [ProjectShell] = []
    var threads: [ThreadShell] = []
    var lastError: String?

    private var subscription: StreamSubscription?
    private weak var client: T3Client?

    func start(client: T3Client) async {
        self.client = client
        subscription = try? await client.subscribeShell { item in
            Task { @MainActor [weak self] in
                self?.handle(item: item)
            }
        }
    }

    func stop() async {
        if let sub = subscription { await sub.cancel() }
        subscription = nil
    }

    @MainActor
    private func handle(item: ShellStreamItem) {
        switch item {
        case .snapshot(let snap):
            projects = snap.projects
            threads  = snap.threads
                .sorted { lhs, rhs in
                    let l = lhs.latestUserMessageAt ?? lhs.updatedAt
                    let r = rhs.latestUserMessageAt ?? rhs.updatedAt
                    return l > r
                }
        case .projectUpserted(_, let project):
            if let i = projects.firstIndex(where: { $0.id == project.id }) {
                projects[i] = project
            } else {
                projects.append(project)
            }
        case .projectRemoved(_, let id):
            projects.removeAll { $0.id == id }
            threads.removeAll { $0.projectId == id }
        case .threadUpserted(_, let thread):
            if let i = threads.firstIndex(where: { $0.id == thread.id }) {
                threads[i] = thread
            } else {
                threads.insert(thread, at: 0)
            }
            threads.sort { lhs, rhs in
                let l = lhs.latestUserMessageAt ?? lhs.updatedAt
                let r = rhs.latestUserMessageAt ?? rhs.updatedAt
                return l > r
            }
        case .threadRemoved(_, let id):
            threads.removeAll { $0.id == id }
        }
    }

    func threads(in projectId: ProjectID) -> [ThreadShell] {
        threads.filter { $0.projectId == projectId && $0.archivedAt == nil }
    }

    func project(for thread: ThreadShell) -> ProjectShell? {
        projects.first { $0.id == thread.projectId }
    }

    func project(id: ProjectID) -> ProjectShell? {
        projects.first { $0.id == id }
    }
}
