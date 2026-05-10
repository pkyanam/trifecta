import SwiftUI

private enum ArchivedSortOrder: String, CaseIterable {
    case recent = "Recently Archived"
    case title = "Title"
    case project = "Project"
}

struct ArchivedThreadsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var actionError: String?
    @State private var pendingDeleteThread: ThreadShell?
    @State private var searchText: String = ""
    @State private var showBulkActionDialog: Bool = false
    @State private var showConfirmBulkDelete: Bool = false
    @State private var showConfirmBulkUnarchive: Bool = false
    @State private var sortOrder: ArchivedSortOrder = .recent

    var body: some View {
        ZStack {
            T3Color.surfaceGrouped.ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                    .padding(.horizontal, T3Spacing.lg)
                    .padding(.top, T3Spacing.md)
                    .padding(.bottom, T3Spacing.md)

                if archivedThreads.isEmpty {
                    emptyState
                } else {
                    archivedList
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search archived threads")
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
        .confirmationDialog("Bulk actions", isPresented: $showBulkActionDialog, titleVisibility: .visible) {
            Button("Unarchive all shown") {
                showConfirmBulkUnarchive = true
            }
            Button("Delete all shown", role: .destructive) {
                showConfirmBulkDelete = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Applies to the currently filtered archived threads.")
        }
        .alert("Unarchive all shown threads?",
               isPresented: $showConfirmBulkUnarchive) {
            Button("Unarchive") {
                unarchiveAllVisible()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(archivedThreads.count) thread\(archivedThreads.count == 1 ? "" : "s") will be moved back to active.")
        }
        .alert("Delete all shown threads?",
               isPresented: $showConfirmBulkDelete) {
            Button("Delete", role: .destructive) {
                deleteAllVisible()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes \(archivedThreads.count) thread\(archivedThreads.count == 1 ? "" : "s") from the desktop server.")
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(spacing: T3Spacing.sm) {
            T3Style.ToolbarChip(action: { dismiss() }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(T3Color.textPrimary)
            }
            VStack(alignment: .leading, spacing: 2) {
                T3WordmarkLabel()
                Text("\(archivedThreads.count) thread\(archivedThreads.count == 1 ? "" : "s")")
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
            }
            Spacer()
            Menu {
                ForEach(ArchivedSortOrder.allCases, id: \.self) { option in
                    Button {
                        sortOrder = option
                    } label: {
                        if sortOrder == option {
                            Label(option.rawValue, systemImage: "checkmark")
                        } else {
                            Text(option.rawValue)
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 34, height: 34)
                    .foregroundStyle(T3Color.textPrimary)
                    .background(T3Color.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                            .stroke(T3Color.separator, lineWidth: 0.5)
                    )
            }
            if !archivedThreads.isEmpty {
                T3Style.ToolbarChip(action: { showBulkActionDialog = true }) {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                }
            }
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: T3Spacing.md) {
            Spacer()
            Image(systemName: "archivebox")
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(T3Color.textTertiary)
                .frame(width: 56, height: 56)
                .background(T3Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                        .stroke(T3Color.separator, lineWidth: 0.5)
                )
            Text(searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                 ? "No archived threads"
                 : "No matches")
                .font(T3Typography.title)
            Text(searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                 ? "Archive threads from the chat list to keep them around without cluttering your active conversations."
                 : "Try a different search term or clear the filter.")
                .font(T3Typography.callout)
                .foregroundStyle(T3Color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, T3Spacing.xl)
            Spacer()
        }
    }

    // MARK: - List

    private var archivedList: some View {
        List {
            ForEach(archivedGrouped, id: \.0.id) { project, threads in
                Section {
                    ForEach(threads, id: \.id) { thread in
                        NavigationLink {
                            ThreadView(threadShell: thread)
                                .environment(env)
                        } label: {
                            ThreadRow(thread: thread)
                        }
                        .listRowBackground(T3Color.surfaceElevated)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                unarchive(thread: thread)
                            } label: {
                                Label("Unarchive", systemImage: "tray.and.arrow.up")
                            }
                            .tint(T3Color.success)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                pendingDeleteThread = thread
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .contextMenu {
                            Button {
                                unarchive(thread: thread)
                            } label: {
                                Label("Unarchive", systemImage: "tray.and.arrow.up")
                            }
                            Button(role: .destructive) {
                                pendingDeleteThread = thread
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                } header: {
                    Text(project.title.uppercased())
                        .font(T3Typography.caption)
                        .tracking(0.6)
                        .foregroundStyle(T3Color.textTertiary)
                        .padding(.leading, -T3Spacing.xs)
                }
            }

            if !ungroupedArchived.isEmpty {
                Section {
                    ForEach(ungroupedArchived, id: \.id) { thread in
                        NavigationLink {
                            ThreadView(threadShell: thread)
                                .environment(env)
                        } label: {
                            ThreadRow(thread: thread)
                        }
                        .listRowBackground(T3Color.surfaceElevated)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                unarchive(thread: thread)
                            } label: {
                                Label("Unarchive", systemImage: "tray.and.arrow.up")
                            }
                            .tint(T3Color.success)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                pendingDeleteThread = thread
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                } header: {
                    Text("UNKNOWN PROJECT")
                        .font(T3Typography.caption)
                        .tracking(0.6)
                        .foregroundStyle(T3Color.textTertiary)
                        .padding(.leading, -T3Spacing.xs)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(T3Color.surfaceGrouped)
    }

    // MARK: - Actions

    private func unarchive(thread: ThreadShell) {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.unarchiveThread(threadId: thread.id)
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

    private func unarchiveAllVisible() {
        guard let client = env.client else { return }
        let targets = archivedThreads
        Task {
            for thread in targets {
                do {
                    try await client.unarchiveThread(threadId: thread.id)
                } catch {
                    await MainActor.run { actionError = error.localizedDescription }
                    break
                }
            }
        }
    }

    private func deleteAllVisible() {
        guard let client = env.client else { return }
        let targets = archivedThreads
        Task {
            for thread in targets {
                do {
                    try await client.deleteThread(threadId: thread.id)
                } catch {
                    await MainActor.run { actionError = error.localizedDescription }
                    break
                }
            }
        }
    }

    // MARK: - Data

    private var archivedThreads: [ThreadShell] {
        let filtered = env.threadList.threads
            .filter { $0.archivedAt != nil }
            .filter { thread in
                let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !query.isEmpty else { return true }
                let inTitle = thread.title.localizedCaseInsensitiveContains(query)
                let projectTitle = env.threadList.project(id: thread.projectId)?.title ?? ""
                return inTitle || projectTitle.localizedCaseInsensitiveContains(query)
            }
        switch sortOrder {
        case .recent:
            return filtered.sorted { ($0.archivedAt ?? $0.updatedAt) > ($1.archivedAt ?? $1.updatedAt) }
        case .title:
            return filtered.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .project:
            return filtered.sorted {
                let lhsProject = env.threadList.project(id: $0.projectId)?.title ?? ""
                let rhsProject = env.threadList.project(id: $1.projectId)?.title ?? ""
                if lhsProject != rhsProject {
                    return lhsProject.localizedStandardCompare(rhsProject) == .orderedAscending
                }
                return $0.title.localizedStandardCompare($1.title) == .orderedAscending
            }
        }
    }

    private var archivedGrouped: [(ProjectShell, [ThreadShell])] {
        var byProject: [ProjectID: [ThreadShell]] = [:]
        for thread in archivedThreads { byProject[thread.projectId, default: []].append(thread) }
        return env.threadList.projects.compactMap { project in
            guard let threads = byProject[project.id], !threads.isEmpty else { return nil }
            return (project, threads)
        }
    }

    private var ungroupedArchived: [ThreadShell] {
        let projectIds = Set(env.threadList.projects.map(\.id))
        return archivedThreads.filter { !projectIds.contains($0.projectId) }
    }
}
