import Foundation
import Observation
import TrifectaProtocol

@Observable
@MainActor
public final class ThreadDetailStore {
    public var thread: OrchestrationThread?
    public var isLoading: Bool = false
    public var error: String?
    public private(set) var activeThreadId: String?

    private var subscriptionTask: Task<Void, Never>?

    public init() {}

    public func open(threadId: String, transport: RpcTransport) async {
        close()
        activeThreadId = threadId
        isLoading = true
        error = nil

        let stream = await transport.subscribe(
            tag: "orchestration.subscribeThread",
            payload: .object(["threadId": .string(threadId)])
        )
        subscriptionTask = Task {
            do {
                for try await value in stream {
                    do {
                        let data = try JSONEncoder().encode(value)
                        let item = try JSONDecoder().decode(OrchestrationThreadStreamItem.self, from: data)
                        self.apply(item)
                    } catch {
                        // Skip undecodable events rather than killing the subscription
                        print("[ThreadDetailStore] skipping undecodable event: \(error)")
                    }
                }
            } catch {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    public func close() {
        subscriptionTask?.cancel()
        subscriptionTask = nil
        activeThreadId = nil
        thread = nil
        isLoading = false
        error = nil
    }

    private func apply(_ item: OrchestrationThreadStreamItem) {
        switch item {
        case .snapshot(let snap):
            thread = snap.thread
            isLoading = false
        case .messageSent(let message):
            guard var t = thread else { return }
            if let i = t.messages.firstIndex(where: { $0.id == message.id }) {
                t.messages[i] = message
            } else {
                t.messages.append(message)
            }
            thread = t
        case .activityAppended(let activity):
            guard var t = thread else { return }
            if !t.activities.contains(where: { $0.id == activity.id }) {
                t.activities.append(activity)
            }
            thread = t
        case .sessionSet(let session):
            guard var t = thread else { return }
            t.session = session
            thread = t
        case .unknown:
            break
        }
    }
}
