import SwiftUI

struct SidebarThreadRow: View {
    let thread: ThreadShell
    let project: ProjectShell
    let isSelected: Bool
    let isPinned: Bool
    let timingLabel: String?
    let onRename: () -> Void
    let onPinToggle: () -> Void
    let onArchiveToggle: () -> Void
    let onDelete: () -> Void
    let onTap: () -> Void
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: T3Spacing.sm) {
                leadingIndicator

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if isPinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(T3Color.textSecondary)
                        }
                        Text(thread.title)
                            .font(.system(size: 15, weight: isSelected ? .semibold : .regular))
                            .foregroundStyle(T3Color.textPrimary)
                            .lineLimit(1)
                    }

                    HStack(spacing: 6) {
                        if let branch = thread.branch, !branch.isEmpty {
                            Label(branch, systemImage: "arrow.triangle.branch")
                                .labelStyle(.titleAndIcon)
                                .lineLimit(1)
                        } else {
                            Text(project.workspaceRoot.components(separatedBy: "/").last ?? project.title)
                                .lineLimit(1)
                        }
                        Text("•")
                        Text(thread.updatedAt, style: .relative)
                            .monospacedDigit()
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(T3Color.textTertiary)
                }

                Spacer(minLength: T3Spacing.xs)

                trailingMeta
            }
            .padding(.horizontal, T3Spacing.md)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
            .background {
                if isSelected {
                    T3Color.surfaceMuted.opacity(0.9)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, T3Spacing.sm)
        .contextMenu { contextMenuContent }
    }

    private var leadingIndicator: some View {
        Group {
            if runBadgeState != nil {
                SidebarStatusDot(thread: thread)
            } else {
                Color.clear.frame(width: 10, height: 10)
            }
        }
        .frame(width: 16, alignment: .center)
    }

    private var trailingMeta: some View {
        HStack(spacing: 6) {
            if thread.hasPendingApprovals || thread.hasPendingUserInput || thread.hasActionableProposedPlan {
                Image(systemName: thread.hasPendingUserInput ? "questionmark.circle.fill" : "exclamationmark.circle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(thread.hasPendingUserInput ? T3Color.warning : AppAccent.color(for: accentRaw))
            }

            if let state = thread.latestTurn?.state {
                switch state {
                case .error:
                    Image(systemName: thread.hasPendingUserInput ? "questionmark.circle.fill" : "exclamationmark.circle.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(T3Color.danger)
                case .interrupted:
                    Image(systemName: "stop.circle")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(T3Color.textSecondary)
                default:
                    EmptyView()
                }
            }

            if let timingLabel {
                Text(timingLabel)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textSecondary)
                    .lineLimit(1)
            }
        }
    }

    private var runBadgeState: LatestTurnState? {
        if thread.latestTurn?.state == .running || thread.session?.status == .running || thread.session?.status == .starting {
            return .running
        }
        if thread.latestTurn?.state == .completed { return .completed }
        if thread.latestTurn?.state == .error { return .error }
        return nil
    }

    @ViewBuilder
    private var contextMenuContent: some View {
        Button {
            UIPasteboard.general.string = thread.id.rawValue
            HapticFeedback.impact(.light)
        } label: {
            Label("Copy Thread ID", systemImage: "doc.on.doc")
        }

        Button {
            onRename()
        } label: {
            Label("Rename", systemImage: "pencil")
        }

        Button {
            onPinToggle()
        } label: {
            Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
        }

        Button {
            onArchiveToggle()
        } label: {
            Label("Archive", systemImage: "archivebox")
        }

        Button(role: .destructive) {
            onDelete()
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }
}

private struct SidebarStatusDot: View {
    let thread: ThreadShell

    var body: some View {
        ZStack {
            if isRunning {
                Circle()
                    .fill(color.opacity(0.22))
                    .frame(width: 18, height: 18)
            }

            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
        }
        .frame(width: 18, height: 18)
    }

    private var isRunning: Bool {
        thread.latestTurn?.state == .running || thread.session?.status == .running || thread.session?.status == .starting
    }

    private var color: Color {
        if thread.hasPendingApprovals || thread.hasPendingUserInput { return T3Color.warning }
        switch thread.latestTurn?.state {
        case .running: return T3Color.warning
        case .completed: return T3Color.success
        case .error: return T3Color.danger
        case .interrupted: return T3Color.textTertiary
        case nil: return T3Color.textTertiary
        }
    }
}
