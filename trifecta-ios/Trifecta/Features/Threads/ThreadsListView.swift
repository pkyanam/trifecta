import SwiftUI

enum ThreadSortOrder: String, CaseIterable {
    case recent = "Recent"
    case name   = "Name"
}

struct ThreadsListView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showNewThread: Bool = false
    @State private var pendingDeleteThread: ThreadShell?
    @State private var actionError: String?
    @State private var sortOrder: ThreadSortOrder = .recent
    @State private var collapsedProjects: Set<ProjectID> = []
    @State private var expandedThreadCounts: [ProjectID: Int] = [:]
    @State private var showQuickActions: Bool = false
    @State private var showArchivedView: Bool = false
    @State private var showSettingsView: Bool = false
    @State private var quickActionQuery: String = ""
    @State private var quickOpenThread: ThreadShell?
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue

    private let defaultVisibleThreadCount = 6

    var body: some View {
        NavigationStack {
            content
                .navigationDestination(item: $quickOpenThread) { thread in
                    ThreadView(threadShell: thread)
                        .environment(env)
                }
                .navigationDestination(isPresented: $showArchivedView) {
                    ArchivedThreadsView()
                        .environment(env)
                }
                .toolbar(.hidden, for: .navigationBar)
                .sheet(isPresented: $showNewThread) {
                    NewThreadView()
                        .environment(env)
                        .presentationDetents([.large])
                }
                .sheet(isPresented: $showQuickActions) {
                    quickActionsSheet
                        .presentationDetents([.medium, .large])
                }
                .sheet(isPresented: $showSettingsView) {
                    SettingsView(isModal: true)
                        .environment(env)
                }
                .alert("Couldn't update thread",
                       isPresented: Binding(get: { actionError != nil },
                                            set: { if !$0 { actionError = nil } })) {
                    Button("OK", role: .cancel) { actionError = nil }
                } message: {
                    Text(actionError ?? "")
                }
                .confirmationDialog("Delete this thread?",
                                    isPresented: Binding(get: { pendingDeleteThread != nil },
                                                         set: { if !$0 { pendingDeleteThread = nil } }),
                                    titleVisibility: .visible,
                                    presenting: pendingDeleteThread) { thread in
                    Button("Delete", role: .destructive) {
                        let target = thread
                        pendingDeleteThread = nil
                        delete(thread: target)
                    }
                    Button("Cancel", role: .cancel) { pendingDeleteThread = nil }
                } message: { _ in
                    Text("This thread will be permanently removed from the desktop server.")
                }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if activeThreads.isEmpty && projectsWithoutThreads.isEmpty {
            emptyState
        } else {
            populatedList
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 0) {
            headerBar
                .padding(.horizontal, T3Spacing.lg)
                .padding(.top, T3Spacing.md)
                .padding(.bottom, T3Spacing.lg)

            Spacer()

            VStack(spacing: T3Spacing.md) {
                Image(systemName: "terminal")
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(accentColor)
                    .frame(width: 56, height: 56)
                    .background(T3Color.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                            .stroke(T3Color.separator, lineWidth: 0.5)
                    )
                Text("No Threads")
                    .font(T3Typography.title)
                Text(env.connectionStatus == .connected
                     ? emptyStateMessage
                     : "Waiting to connect to a Trifecta-compatible server…")
                    .font(T3Typography.callout)
                    .foregroundStyle(T3Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, T3Spacing.xl)
                if env.connectionStatus == .connected && !env.threadList.projects.isEmpty {
                    T3ToolbarButton(title: "New Thread",
                                    systemImage: "plus") {
                        showNewThread = true
                    }
                }
                if let detail = env.connectionStatus.detail {
                    Text(detail)
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.danger)
                        .multilineTextAlignment(.center)
                        .textSelection(.enabled)
                        .padding(.horizontal, T3Spacing.xl)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(T3Color.surfaceGrouped)
    }

    private var emptyStateMessage: String {
        env.threadList.projects.isEmpty
            ? "No projects are available from the desktop server yet."
            : "Create a mobile thread from one of your desktop projects."
    }

    // MARK: - Populated list

    private var populatedList: some View {
        VStack(spacing: 0) {
            headerBar
                .padding(.horizontal, T3Spacing.lg)
                .padding(.top, T3Spacing.md)
                .padding(.bottom, T3Spacing.lg)

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: []) {
                    ForEach(Array(filteredGroupedThreads.enumerated()), id: \.element.0.id) { index, group in
                        projectSection(project: group.0, threads: group.1, isLast: index == filteredGroupedThreads.count - 1)
                    }

                    if !filteredEmptyProjects.isEmpty {
                        emptyProjectsSection
                    }
                }
                .padding(.horizontal, T3Spacing.lg)
                .padding(.bottom, T3Spacing.xxxl)
            }
            .scrollIndicators(.hidden)
        }
        .background(T3Color.surfaceGrouped)
    }

    // MARK: - Header bar

    private var headerBar: some View {
        HStack(spacing: T3Spacing.sm) {
            VStack(alignment: .leading, spacing: 3) {
                T3WordmarkLabel()
                Text("PROJECTS")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(T3Color.textTertiary)
                    .textCase(.uppercase)
            }

            Spacer(minLength: T3Spacing.sm)

            // Sort
            Menu {
                ForEach(ThreadSortOrder.allCases, id: \.self) { order in
                    Button {
                        sortOrder = order
                    } label: {
                        if sortOrder == order {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 34, height: 34)
                    .foregroundStyle(T3Color.textPrimary)
                    .background(T3Color.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                            .stroke(T3Color.separator, lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)

            // Expand / collapse all
            T3Style.ToolbarChip(action: toggleAllExpansion) {
                Image(systemName: allCollapsed ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(T3Color.textPrimary)
            }

            // New thread
            T3Style.ToolbarChip(action: { showNewThread = true }) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(env.threadList.projects.isEmpty || env.connectionStatus != .connected
                                     ? T3Color.textTertiary
                                     : T3Color.textPrimary)
            }
            .disabled(env.threadList.projects.isEmpty || env.connectionStatus != .connected)

            T3Style.ToolbarChip(action: { showQuickActions = true }) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(T3Color.textPrimary)
            }
        }
    }

    private var quickActionsSheet: some View {
        NavigationStack {
            List {
                Section("Actions") {
                    Button {
                        showQuickActions = false
                        showNewThread = true
                    } label: {
                        Label("New Thread", systemImage: "plus.bubble")
                    }
                    .disabled(env.threadList.projects.isEmpty || env.connectionStatus != .connected)

                    Button {
                        showQuickActions = false
                        showArchivedView = true
                    } label: {
                        Label("Archived Threads", systemImage: "archivebox")
                    }

                    Button {
                        showQuickActions = false
                        showSettingsView = true
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }

                    Button {
                        showQuickActions = false
                        Task { await env.refreshServerConfig() }
                    } label: {
                        Label("Refresh Server Config", systemImage: "arrow.clockwise")
                    }
                    .disabled(env.client == nil)
                }
                if !filteredQuickThreads.isEmpty {
                    Section("Recent Threads") {
                        ForEach(filteredQuickThreads, id: \.id) { thread in
                            Button {
                                showQuickActions = false
                                Task { @MainActor in
                                    quickOpenThread = thread
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(thread.title)
                                        .font(T3Typography.body)
                                        .foregroundStyle(T3Color.textPrimary)
                                        .lineLimit(1)
                                    Text(env.threadList.project(id: thread.projectId)?.title ?? "Unknown project")
                                        .font(T3Typography.footnote)
                                        .foregroundStyle(T3Color.textTertiary)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $quickActionQuery, prompt: "Search actions and threads")
            .navigationTitle("Quick Actions")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var filteredQuickThreads: [ThreadShell] {
        let query = quickActionQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let active = activeThreads
        let filtered = query.isEmpty ? active : active.filter { thread in
            let titleMatch = thread.title.localizedCaseInsensitiveContains(query)
            let projectMatch = (env.threadList.project(id: thread.projectId)?.title ?? "")
                .localizedCaseInsensitiveContains(query)
            return titleMatch || projectMatch
        }
        return Array(filtered.prefix(12))
    }

    // MARK: - Project section

    private func projectSection(project: ProjectShell, threads: [ThreadShell], isLast: Bool) -> some View {
        let isCollapsed = collapsedProjects.contains(project.id)
        let visibleCount = expandedThreadCounts[project.id] ?? defaultVisibleThreadCount
        let visibleThreads = Array(threads.prefix(visibleCount))
        let hasMore = threads.count > visibleCount

        return VStack(alignment: .leading, spacing: 0) {
            // Project header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isCollapsed {
                        collapsedProjects.remove(project.id)
                    } else {
                        collapsedProjects.insert(project.id)
                    }
                }
            } label: {
                HStack(spacing: T3Spacing.sm) {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(T3Color.textTertiary)
                        .frame(width: 16)

                    Image(systemName: "folder")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(T3Color.textSecondary)

                    Text(project.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                        .lineLimit(1)

                    Spacer(minLength: 0)
                }
                .padding(.vertical, T3Spacing.sm)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !isCollapsed {
                // Thread rows
                ForEach(Array(visibleThreads.enumerated()), id: \.element.id) { index, thread in
                    threadRow(thread: thread, isFirst: index == 0)
                }

                // Show more
                if hasMore {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            expandedThreadCounts[project.id] = (expandedThreadCounts[project.id] ?? defaultVisibleThreadCount) + defaultVisibleThreadCount
                        }
                    } label: {
                        HStack(spacing: T3Spacing.sm) {
                            Spacer().frame(width: 16 + T3Spacing.sm + 14 + T3Spacing.sm)
                            Text("Show more")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(T3Color.textSecondary)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, T3Spacing.sm)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }

            if !isLast {
                Divider()
                    .overlay(T3Color.separator.opacity(0.5))
                    .padding(.vertical, T3Spacing.xs)
            }
        }
    }

    // MARK: - Thread row

    private func threadRow(thread: ThreadShell, isFirst: Bool) -> some View {
        NavigationLink {
            ThreadView(threadShell: thread)
                .environment(env)
        } label: {
            HStack(spacing: T3Spacing.md) {
                Spacer().frame(width: 16 + T3Spacing.sm)

                Text(thread.title)
                    .font(.system(size: 15, weight: isFirst ? .semibold : .regular))
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)

                Spacer(minLength: T3Spacing.md)

                Text(relativeDate(for: thread))
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(isFirst ? T3Color.textSecondary : T3Color.textTertiary)
                    .monospacedDigit()
            }
            .padding(.vertical, T3Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                archive(thread: thread)
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
            Button(role: .destructive) {
                pendingDeleteThread = thread
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Empty projects section

    private var emptyProjectsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(filteredEmptyProjects.enumerated()), id: \.element.id) { index, project in
                Button {
                    showNewThread = true
                } label: {
                    HStack(spacing: T3Spacing.sm) {
                        Image(systemName: "folder")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(T3Color.textSecondary)

                        Text(project.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(T3Color.textPrimary)
                            .lineLimit(1)

                        Spacer(minLength: 0)

                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(accentColor)
                    }
                    .padding(.vertical, T3Spacing.sm)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < filteredEmptyProjects.count - 1 {
                    Divider()
                        .overlay(T3Color.separator.opacity(0.5))
                        .padding(.vertical, T3Spacing.xs)
                }
            }
        }
    }

    // MARK: - Helpers

    private func relativeDate(for thread: ThreadShell) -> String {
        let date = thread.latestUserMessageAt ?? thread.updatedAt
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private var allCollapsed: Bool {
        let projectIDs = Set(filteredGroupedThreads.map { $0.0.id })
        return !projectIDs.isEmpty && projectIDs.isSubset(of: collapsedProjects)
    }

    private func toggleAllExpansion() {
        withAnimation(.easeInOut(duration: 0.2)) {
            if allCollapsed {
                collapsedProjects.removeAll()
            } else {
                collapsedProjects = Set(filteredGroupedThreads.map { $0.0.id })
            }
        }
    }

    // MARK: - Actions

    private func archive(thread: ThreadShell) {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.archiveThread(threadId: thread.id)
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }

    private func delete(thread: ThreadShell) {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.deleteThread(threadId: thread.id)
            } catch {
                await MainActor.run { actionError = error.localizedDescription }
            }
        }
    }

    // MARK: - Filtered data

    private var activeThreads: [ThreadShell] {
        env.threadList.threads.filter { $0.archivedAt == nil }
    }

    private var groupedThreads: [(ProjectShell, [ThreadShell])] {
        var byProject: [ProjectID: [ThreadShell]] = [:]
        for t in activeThreads { byProject[t.projectId, default: []].append(t) }
        return env.threadList.projects.compactMap { project in
            guard let threads = byProject[project.id], !threads.isEmpty else { return nil }
            return (project, threads)
        }
    }

    private var filteredGroupedThreads: [(ProjectShell, [ThreadShell])] {
        groupedThreads.map { project, threads in
            (project, sortThreads(threads))
        }
    }

    private func sortThreads(_ threads: [ThreadShell]) -> [ThreadShell] {
        switch sortOrder {
        case .recent:
            return threads.sorted {
                let l = $0.latestUserMessageAt ?? $0.updatedAt
                let r = $1.latestUserMessageAt ?? $1.updatedAt
                return l > r
            }
        case .name:
            return threads.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        }
    }

    private var projectsWithoutThreads: [ProjectShell] {
        let projectIdsWithThreads = Set(activeThreads.map(\.projectId))
        return env.threadList.projects.filter { !projectIdsWithThreads.contains($0.id) }
    }

    private var filteredEmptyProjects: [ProjectShell] {
        projectsWithoutThreads
    }

    private var accentColor: Color {
        AppAccent.color(for: accentRaw)
    }
}
