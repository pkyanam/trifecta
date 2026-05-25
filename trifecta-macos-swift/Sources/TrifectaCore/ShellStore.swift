import Foundation
import Observation
import TrifectaProtocol

@Observable
@MainActor
public final class ShellStore {
    public var projects: [OrchestrationProjectShell] = []
    public var threads: [OrchestrationThreadShell] = []
    public var snapshotSequence: Int = 0
    public var isLoading: Bool = true
    public var error: String?

    private var subscriptionTask: Task<Void, Never>?

    public var threadsByProjectId: [String: [OrchestrationThreadShell]] {
        Dictionary(grouping: threads, by: \.projectId)
    }

    public init() {}

    public func start(transport: RpcTransport) async {
        isLoading = true
        error = nil
        let stream = await transport.subscribe(
            tag: "orchestration.subscribeShell",
            payload: .object([:])
        )
        subscriptionTask = Task {
            do {
                for try await value in stream {
                    do {
                        let data = try JSONEncoder().encode(value)
                        let item = try JSONDecoder().decode(OrchestrationShellStreamItem.self, from: data)
                        self.apply(item)
                    } catch {
                        // Skip undecodable events rather than killing the subscription
                        print("[ShellStore] skipping undecodable event: \(error)")
                    }
                }
            } catch {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    public func stop() {
        subscriptionTask?.cancel()
        subscriptionTask = nil
        projects = []
        threads = []
        snapshotSequence = 0
        isLoading = true
        error = nil
    }

    private func apply(_ item: OrchestrationShellStreamItem) {
        switch item {
        case .snapshot(let snap):
            snapshotSequence = snap.snapshotSequence
            projects = snap.projects
            threads = snap.threads
            isLoading = false
        case .projectUpserted(_, let p):
            if let i = projects.firstIndex(where: { $0.id == p.id }) { projects[i] = p }
            else { projects.append(p) }
        case .projectRemoved(_, let id):
            projects.removeAll { $0.id == id }
            threads.removeAll { $0.projectId == id }
        case .threadUpserted(_, let t):
            if let i = threads.firstIndex(where: { $0.id == t.id }) { threads[i] = t }
            else { threads.append(t) }
        case .threadRemoved(_, let id):
            threads.removeAll { $0.id == id }
        case .unknown:
            break
        }
    }
}
