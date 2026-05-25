import SwiftUI
import TrifectaCore
import TrifectaProtocol

struct ThreadDetailView: View {
    @Environment(ThreadDetailStore.self) private var store

    var body: some View {
        Group {
            if let thread = store.thread {
                ThreadConversationView(thread: thread)
                    .navigationTitle(thread.title)
            } else if store.isLoading {
                ProgressView("Loading thread…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "Select a Thread",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("Choose a thread from the sidebar to view the conversation.")
                )
            }
        }
    }
}

// MARK: - Timeline

private enum TimelineItem: Identifiable {
    case message(OrchestrationMessage)
    case activity(OrchestrationThreadActivity)

    var id: String {
        switch self {
        case .message(let m): "msg-\(m.id)"
        case .activity(let a): "act-\(a.id)"
        }
    }

    var createdAt: String {
        switch self {
        case .message(let m): m.createdAt
        case .activity(let a): a.createdAt
        }
    }
}

private struct ThreadConversationView: View {
    let thread: OrchestrationThread

    private var timeline: [TimelineItem] {
        let messages = thread.messages.map(TimelineItem.message)
        let activities = thread.activities.map(TimelineItem.activity)
        return (messages + activities).sorted { $0.createdAt < $1.createdAt }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(timeline) { item in
                        switch item {
                        case .message(let msg):
                            MessageBubbleView(message: msg)
                        case .activity(let act):
                            ActivityRowView(activity: act)
                        }
                    }
                }
                .padding()
                Color.clear.frame(height: 1).id("bottom")
            }
            .onChange(of: timeline.count) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }
}

// MARK: - Message bubble

private struct MessageBubbleView: View {
    let message: OrchestrationMessage

    private var isUser: Bool { message.role == "user" }

    var body: some View {
        if isUser {
            HStack {
                Spacer(minLength: 80)
                Text(message.text)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .textSelection(.enabled)
            }
        } else {
            HStack(alignment: .bottom, spacing: 6) {
                Text(message.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if message.streaming {
                    PulsingCursor()
                }
            }
        }
    }
}

private struct PulsingCursor: View {
    @State private var opacity: Double = 1

    var body: some View {
        Rectangle()
            .fill(Color.primary)
            .frame(width: 2, height: 14)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.6).repeatForever()) {
                    opacity = 0.15
                }
            }
    }
}

// MARK: - Activity row

private struct ActivityRowView: View {
    let activity: OrchestrationThreadActivity
    @State private var isExpanded = false

    private var icon: String {
        switch activity.tone {
        case "tool": return "wrench.and.screwdriver"
        case "approval": return "checkmark.circle"
        case "error": return "exclamationmark.triangle"
        default: return "info.circle"
        }
    }

    private var iconColor: Color {
        switch activity.tone {
        case "tool": return .blue
        case "approval": return .green
        case "error": return .red
        default: return .secondary
        }
    }

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundStyle(iconColor)
                    .font(.caption)
                    .frame(width: 16)

                Text(activity.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(isExpanded ? nil : 1)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .foregroundStyle(.tertiary)
                    .font(.caption2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray).opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }
}
