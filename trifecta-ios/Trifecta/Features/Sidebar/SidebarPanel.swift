import SwiftUI

struct SidebarPanel: View {
    @Environment(AppEnvironment.self) private var env
    @Binding var selectedThread: ThreadShell?
    let onNewThread: () -> Void
    let onOpenSettings: () -> Void
    let onOpenArchived: () -> Void
    let onClose: () -> Void

    @State private var searchText = ""
    @State private var debouncedSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var cachedGroups: [(project: ProjectShell, threads: [ThreadShell])] = []
    @State private var cachedPinnedIDs: Set<String> = []
    @State private var collapsedProjects: Set<ProjectID> = []
    @State private var pendingTopAction: SidebarTopAction?
    @State private var renameTarget: ThreadShell?
    @State private var renameDraft = ""
    @State private var pendingDeleteThread: ThreadShell?
    @State private var pendingArchiveProject: SidebarProjectGroup?
    @State private var actionError: String?
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    @AppStorage("sidebarPinnedThreadIDs") private var pinnedThreadIDsRaw = ""

    var body: some View {
        sidebarContent
            .alert("Rename Chat",
                   isPresented: Binding(get: { renameTarget != nil },
                                        set: { if !$0 { renameTarget = nil } })) {
                TextField("Name", text: $renameDraft)
                Button("Cancel", role: .cancel) { renameTarget = nil }
                Button("Rename") { renameThread() }
                    .disabled(renameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .confirmationDialog("Remove this chat?",
                                isPresented: Binding(get: { pendingDeleteThread != nil },
                                                     set: { if !$0 { pendingDeleteThread = nil } }),
                                titleVisibility: .visible,
                                presenting: pendingDeleteThread) { thread in
                Button("Delete", role: .destructive) { delete(thread) }
                Button("Cancel", role: .cancel) { pendingDeleteThread = nil }
            } message: { _ in
                Text("This removes the chat from the Trifecta server.")
            }
            .confirmationDialog("Archive project?",
                                isPresented: Binding(get: { pendingArchiveProject != nil },
                                                     set: { if !$0 { pendingArchiveProject = nil } }),
                                titleVisibility: .visible,
                                presenting: pendingArchiveProject) { group in
                Button("Archive Project") { archiveProject(group) }
                Button("Cancel", role: .cancel) { pendingArchiveProject = nil }
            } message: { group in
                Text("All active chats in \(group.project.title) will be archived.")
            }
            .alert("Action failed",
                   isPresented: Binding(get: { actionError != nil },
                                        set: { if !$0 { actionError = nil } })) {
                Button("OK", role: .cancel) { actionError = nil }
            } message: {
                Text(actionError ?? "Please try again.")
            }
            .onAppear { refreshCachedGroups() }
            .onChange(of: env.threadList.mutationCount) { _, _ in refreshCachedGroups() }
            .onChange(of: debouncedSearchText) { _, _ in refreshCachedGroups() }
            .onChange(of: pinnedThreadIDsRaw) { _, _ in refreshCachedGroups() }
    }

    @ViewBuilder
    private var sidebarContent: some View {
        VStack(spacing: 0) {
            SidebarHeader(onClose: onClose)
            SidebarSearchField(text: $searchText)
                .padding(.horizontal, T3Spacing.md)
                .padding(.top, T3Spacing.xs)
                .padding(.bottom, T3Spacing.sm)
                .onChange(of: searchText) { _, new in
                    searchDebounceTask?.cancel()
                    if new.isEmpty {
                        debouncedSearchText = ""
                    } else {
                        searchDebounceTask = Task {
                            try? await Task.sleep(nanoseconds: 200_000_000)
                            if !Task.isCancelled {
                                debouncedSearchText = new
                            }
                        }
                    }
                }
            SidebarTopActionsRow(pendingAction: pendingTopAction,
                                 isEnabled: env.connectionStatus == .connected,
                                 onNewChat: performNewChat,
                                 onQuickChat: performQuickChat,
                                 onNewProject: performNewProject)
                .padding(.horizontal, T3Spacing.md)
                .padding(.bottom, T3Spacing.md)
            scrollContent
            footer
        }
        .safeAreaPadding(.top, 34)
        .padding(.bottom, T3Spacing.lg)
        .frame(maxHeight: .infinity)
        .background {
            Group {
                if #available(iOS 26.0, *) {
                    Rectangle().fill(.ultraThinMaterial)
                } else {
                    Rectangle().fill(T3Color.surface.opacity(0.96))
                }
            }
            .ignoresSafeArea()
        }
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(T3Color.separator)
                .frame(width: 0.5)
                .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private var scrollContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(cachedGroups, id: \.project.id) { group in
                    projectSection(project: group.project, threads: group.threads, pinnedIDs: cachedPinnedIDs)
                }
                if !archivedThreads.isEmpty {
                    archivedSection
                }
                if cachedGroups.isEmpty {
                    emptySearchState
                }
            }
            .padding(.horizontal, T3Spacing.md)
            .padding(.bottom, T3Spacing.xl)
        }
        .scrollIndicators(.hidden)
    }

    private func refreshCachedGroups() {
        cachedGroups = groupedThreads
        cachedPinnedIDs = pinnedThreadIDs
    }

    private func projectSection(project: ProjectShell,
                                threads: [ThreadShell],
                                pinnedIDs: Set<String>) -> some View {
        let collapsed = collapsedProjects.contains(project.id)
        return VStack(alignment: .leading, spacing: T3Spacing.xs) {
            HStack(spacing: T3Spacing.sm) {
                Button {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        if collapsed { collapsedProjects.remove(project.id) }
                        else { collapsedProjects.insert(project.id) }
                    }
                    HapticFeedback.selection()
                } label: {
                    HStack(spacing: T3Spacing.sm) {
                        Image(systemName: "folder")
                            .font(.system(size: 15, weight: .medium))
                        Text(project.title)
                            .font(T3Typography.bodyEmphasis)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button {
                        pendingArchiveProject = SidebarProjectGroup(project: project, threads: threads)
                    } label: {
                        Label("Archive Project", systemImage: "archivebox")
                    }
                }

                Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(T3Color.textSecondary)
                    .frame(width: 18, height: 18)

                Button {
                    performNewChat()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                        .frame(width: 30, height: 30)
                        .background(T3Color.surfaceMuted, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(env.connectionStatus != .connected)
            }
            .padding(.horizontal, T3Spacing.md)
            .padding(.top, T3Spacing.sm)
            .padding(.bottom, T3Spacing.xs)

            if !collapsed {
                VStack(spacing: 4) {
                    ForEach(threads) { thread in
                        SidebarThreadRow(thread: thread,
                                         project: project,
                                         isSelected: selectedThread?.id == thread.id,
                                         isPinned: pinnedIDs.contains(thread.id.rawValue),
                                         timingLabel: SidebarRelativeTimeFormatter.compactLabel(for: thread),
                                         onRename: { beginRename(thread) },
                                         onPinToggle: { togglePin(thread) },
                                         onArchiveToggle: { archive(thread) },
                                         onDelete: { pendingDeleteThread = thread }) {
                            selectedThread = thread
                            onClose()
                            HapticFeedback.selection()
                        }
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var archivedSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.xs) {
            Button(action: onOpenArchived) {
                HStack(spacing: T3Spacing.sm) {
                    Image(systemName: "archivebox")
                        .font(.system(size: 15, weight: .medium))
                    Text("Archived")
                        .font(T3Typography.bodyEmphasis)
                    Spacer()
                    Text("\(archivedThreads.count)")
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.textTertiary)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(T3Color.textSecondary)
                }
                .padding(.horizontal, T3Spacing.md)
                .padding(.vertical, T3Spacing.md)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var footer: some View {
        VStack(spacing: T3Spacing.sm) {
            Divider().overlay(T3Color.separator)
            HStack(spacing: T3Spacing.sm) {
                Button(action: onOpenArchived) {
                    Label("Archive", systemImage: "archivebox")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                }
                .buttonStyle(.bordered)

                Button(action: onOpenSettings) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 42, height: 38)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, T3Spacing.md)
        }
        .padding(.top, T3Spacing.xs)
    }

    private var emptySearchState: some View {
        VStack(spacing: T3Spacing.sm) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(T3Color.textTertiary)
            Text(searchText.isEmpty ? "No threads yet" : "No matching threads")
                .font(T3Typography.callout)
                .foregroundStyle(T3Color.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, T3Spacing.xxxl)
    }

    private var groupedThreads: [(project: ProjectShell, threads: [ThreadShell])] {
        let query = debouncedSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pinned = pinnedThreadIDs
        let liveGroups: [(project: ProjectShell, threads: [ThreadShell])] = env.threadList.projects.compactMap { project in
            let lowerProject = project.title.lowercased()
            let threads = env.threadList.threads(in: project.id)
                .filter { thread in
                    query.isEmpty
                    || thread.title.lowercased().contains(query)
                    || lowerProject.contains(query)
                    || (thread.branch?.lowercased().contains(query) ?? false)
                }
            guard !threads.isEmpty else { return nil }
            return (project: project, threads: threads)
        }
        // Precompute sort keys once outside the comparator to avoid O(n²) map calls.
        struct SortKey {
            let hasPinned: Bool
            let latestDate: Date
        }
        let keys: [ProjectID: SortKey] = Dictionary(uniqueKeysWithValues: liveGroups.map { group in
            let hasPinned = group.threads.contains { pinned.contains($0.id.rawValue) }
            let latestDate = group.threads.lazy.map { $0.latestUserMessageAt ?? $0.updatedAt }.max() ?? .distantPast
            return (group.project.id, SortKey(hasPinned: hasPinned, latestDate: latestDate))
        })
        return liveGroups.sorted { lhs, rhs in
            let lKey = keys[lhs.project.id]!
            let rKey = keys[rhs.project.id]!
            if lKey.hasPinned != rKey.hasPinned { return lKey.hasPinned }
            return lKey.latestDate > rKey.latestDate
        }
    }

    private var archivedThreads: [ThreadShell] {
        env.threadList.archivedThreads
    }

    private var pinnedThreadIDs: Set<String> {
        get {
            Set(pinnedThreadIDsRaw.split(separator: ",").map(String.init))
        }
        nonmutating set {
            pinnedThreadIDsRaw = newValue.sorted().joined(separator: ",")
        }
    }

    private func performNewChat() {
        pendingTopAction = .newChat
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 120_000_000)
            pendingTopAction = nil
            onNewThread()
        }
    }

    private func performQuickChat() {
        pendingTopAction = .quickChat
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 120_000_000)
            pendingTopAction = nil
            onNewThread()
        }
    }

    private func performNewProject() {
        pendingTopAction = .newProject
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            pendingTopAction = nil
            actionError = "Trifecta projects come from the desktop server. Add or open a project on desktop, then refresh mobile."
        }
    }

    private func beginRename(_ thread: ThreadShell) {
        renameTarget = thread
        renameDraft = thread.title
    }

    private func renameThread() {
        guard let thread = renameTarget,
              let client = env.client else {
            renameTarget = nil
            return
        }
        let title = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        renameTarget = nil
        Task {
            do {
                try await client.renameThread(threadId: thread.id, title: title)
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }

    private func togglePin(_ thread: ThreadShell) {
        var ids = pinnedThreadIDs
        if ids.contains(thread.id.rawValue) {
            ids.remove(thread.id.rawValue)
        } else {
            ids.insert(thread.id.rawValue)
        }
        pinnedThreadIDs = ids
        HapticFeedback.selection()
    }

    private func archive(_ thread: ThreadShell) {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.archiveThread(threadId: thread.id)
                if selectedThread?.id == thread.id {
                    await MainActor.run { selectedThread = nil }
                }
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }

    private func delete(_ thread: ThreadShell) {
        pendingDeleteThread = nil
        guard let client = env.client else { return }
        Task {
            do {
                try await client.deleteThread(threadId: thread.id)
                if selectedThread?.id == thread.id {
                    await MainActor.run { selectedThread = nil }
                }
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }

    private func archiveProject(_ group: SidebarProjectGroup) {
        pendingArchiveProject = nil
        guard let client = env.client else { return }
        Task {
            do {
                for thread in group.threads {
                    try await client.archiveThread(threadId: thread.id)
                }
                if let selectedThread, group.threads.contains(where: { $0.id == selectedThread.id }) {
                    await MainActor.run { self.selectedThread = nil }
                }
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }
}

private struct SidebarProjectGroup: Identifiable {
    var id: ProjectID { project.id }
    let project: ProjectShell
    let threads: [ThreadShell]
}

private enum SidebarTopAction {
    case newChat
    case quickChat
    case newProject
}

private struct SidebarHeader: View {
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: T3Spacing.sm) {
            Image("trifectaAppLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 34, height: 34)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .accessibilityHidden(true)

            T3WordmarkLabel(size: 21)

            Spacer(minLength: 0)

            Button(action: onClose) {
                TwoLineHamburgerIcon()
                    .stroke(T3Color.textPrimary, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: 18, height: 12)
                    .frame(width: 42, height: 42)
                    .t3Glass(radius: 21,
                             tint: T3GlassChrome.panelTint(),
                             stroke: T3Color.separator,
                             interactive: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close menu")
        }
        .padding(.horizontal, T3Spacing.md)
        .padding(.top, T3Spacing.sm)
        .padding(.bottom, T3Spacing.sm)
    }
}

private struct TwoLineHamburgerIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let firstY = rect.minY + rect.height * 0.28
        let secondY = rect.minY + rect.height * 0.72
        path.move(to: CGPoint(x: rect.minX, y: firstY))
        path.addLine(to: CGPoint(x: rect.maxX, y: firstY))
        path.move(to: CGPoint(x: rect.minX, y: secondY))
        path.addLine(to: CGPoint(x: rect.maxX, y: secondY))
        return path
    }
}

private struct SidebarSearchField: View {
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: T3Spacing.sm) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(T3Typography.callout)
                    .foregroundStyle(T3Color.textSecondary)
                TextField("Search conversations", text: $text)
                    .font(T3Typography.callout)
                    .focused($focused)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                if !text.isEmpty {
                    Button { text = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(T3Typography.callout)
                            .foregroundStyle(T3Color.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.leading, 10)
            .padding(.trailing, 14)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .t3Glass(radius: 14,
                     tint: T3GlassChrome.panelTint(),
                     stroke: T3Color.separator,
                     interactive: false)

            if focused {
                Button("Cancel") {
                    text = ""
                    focused = false
                }
                .font(T3Typography.callout)
                .foregroundStyle(T3Color.textPrimary)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: focused)
    }
}

private struct SidebarTopActionsRow: View {
    let pendingAction: SidebarTopAction?
    let isEnabled: Bool
    let onNewChat: () -> Void
    let onQuickChat: () -> Void
    let onNewProject: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 30) {
            if #available(iOS 26.0, *) {
                GlassEffectContainer(spacing: 30) {
                    HStack(alignment: .top, spacing: 30) {
                        actionButtonGlass(.newChat, systemImage: "square.and.pencil", title: "New Chat", action: onNewChat)
                        actionButtonGlass(.quickChat, systemImage: "message", title: "Quick Chat", action: onQuickChat)
                        actionButtonGlass(.newProject, systemImage: "folder.badge.plus", title: "New Project", action: onNewProject)
                    }
                }
            } else {
                actionButton(.newChat, systemImage: "square.and.pencil", title: "New Chat", action: onNewChat)
                actionButton(.quickChat, systemImage: "message", title: "Quick Chat", action: onQuickChat)
                actionButton(.newProject, systemImage: "folder.badge.plus", title: "New Project", action: onNewProject)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .disabled(!isEnabled || pendingAction != nil)
        .opacity(isEnabled ? 1 : 0.42)
    }

    @available(iOS 26.0, *)
    @ViewBuilder
    private func actionButtonGlass(_ topAction: SidebarTopAction,
                                   systemImage: String,
                                   title: String,
                                   action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    if pendingAction == topAction {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: systemImage)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(T3Color.textPrimary)
                            .frame(width: 55, height: 55)
                            .glassEffect(Glass.regular.interactive(), in: Circle())
                    }
                }
                .frame(height: 55)
                Text(title)
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
        }
        .buttonStyle(.plain)
    }

    private func actionButton(_ topAction: SidebarTopAction,
                              systemImage: String,
                              title: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(T3Color.surfaceMuted)
                        .frame(width: 55, height: 55)
                    if pendingAction == topAction {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: systemImage)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(T3Color.textPrimary)
                    }
                }
                Text(title)
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
        }
        .buttonStyle(.plain)
    }
}

private enum SidebarRelativeTimeFormatter {
    static func compactLabel(for thread: ThreadShell) -> String? {
        let date = thread.latestUserMessageAt ?? thread.updatedAt
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        if days < 7 { return "\(days)d" }
        let weeks = days / 7
        if weeks < 8 { return "\(weeks)w" }
        return nil
    }
}
