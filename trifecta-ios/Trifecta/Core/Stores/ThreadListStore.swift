import Foundation
import Observation

@Observable
final class ThreadListStore {
    var projects: [ProjectShell] = []
    var threads: [ThreadShell] = []
    var lastError: String?
    private(set) var activeThreads: [ThreadShell] = []
    private(set) var archivedThreads: [ThreadShell] = []
    private(set) var mutationCount: Int = 0

    private var subscription: StreamSubscription?
    private weak var client: T3Client?
    private var projectIndex: [ProjectID: ProjectShell] = [:]
    private var activeThreadsByProject: [ProjectID: [ThreadShell]] = [:]

    func start(client: T3Client) async {
        self.client = client
        subscription = try? await client.subscribeShell { item in
            Task(priority: .utility) { [weak self] in
                let mutation = Self.prepareMutation(item)
                await self?.apply(mutation)
            }
        }
    }

    func stop() async {
        if let sub = subscription { await sub.cancel() }
        subscription = nil
    }

    private enum ShellMutation: Sendable {
        case snapshot(projects: [ProjectShell], threads: [ThreadShell])
        case projectUpserted(ProjectShell)
        case projectRemoved(ProjectID)
        case threadUpserted(ThreadShell)
        case threadRemoved(ThreadID)
    }

    private static func prepareMutation(_ item: ShellStreamItem) -> ShellMutation {
        switch item {
        case .snapshot(let snap):
            return .snapshot(projects: snap.projects, threads: sortByRecency(snap.threads))
        case .projectUpserted(_, let project):
            return .projectUpserted(project)
        case .projectRemoved(_, let id):
            return .projectRemoved(id)
        case .threadUpserted(_, let thread):
            return .threadUpserted(thread)
        case .threadRemoved(_, let id):
            return .threadRemoved(id)
        }
    }

    private static func sortByRecency(_ threads: [ThreadShell]) -> [ThreadShell] {
        threads.sorted { lhs, rhs in
            let l = lhs.latestUserMessageAt ?? lhs.updatedAt
            let r = rhs.latestUserMessageAt ?? rhs.updatedAt
            return l > r
        }
    }

    @MainActor
    private func apply(_ mutation: ShellMutation) {
        switch mutation {
        case .snapshot(let projects, let threads):
            self.projects = projects
            self.threads = threads
            rebuildIndexes()
        case .projectUpserted(let project):
            if let i = projects.firstIndex(where: { $0.id == project.id }) {
                projects[i] = project
            } else {
                projects.append(project)
            }
            rebuildProjectIndex()
        case .projectRemoved(let id):
            projects.removeAll { $0.id == id }
            threads.removeAll { $0.projectId == id }
            rebuildIndexes()
        case .threadUpserted(let thread):
            if let i = threads.firstIndex(where: { $0.id == thread.id }) {
                threads[i] = thread
            } else {
                threads.insert(thread, at: 0)
            }
            threads = Self.sortByRecency(threads)
            rebuildThreadIndexes()
        case .threadRemoved(let id):
            threads.removeAll { $0.id == id }
            rebuildThreadIndexes()
        }
        mutationCount &+= 1
    }

    func threads(in projectId: ProjectID) -> [ThreadShell] {
        activeThreadsByProject[projectId] ?? []
    }

    func project(for thread: ThreadShell) -> ProjectShell? {
        projectIndex[thread.projectId]
    }

    func project(id: ProjectID) -> ProjectShell? {
        projectIndex[id]
    }

    @MainActor
    private func rebuildIndexes() {
        rebuildProjectIndex()
        rebuildThreadIndexes()
    }

    @MainActor
    private func rebuildProjectIndex() {
        projectIndex = Dictionary(uniqueKeysWithValues: projects.map { ($0.id, $0) })
    }

    @MainActor
    private func rebuildThreadIndexes() {
        activeThreads = threads.filter { $0.archivedAt == nil }
        archivedThreads = threads.filter { $0.archivedAt != nil }
        var grouped: [ProjectID: [ThreadShell]] = [:]
        for thread in activeThreads {
            grouped[thread.projectId, default: []].append(thread)
        }
        activeThreadsByProject = grouped
    }
}
