import SwiftUI

struct ThreadView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var store: ThreadStore
    @State private var isImplementingPlan: Bool = false
    @State private var showRenameSheet: Bool = false
    @State private var showDiffSheet: Bool = false
    @State private var gitStatus: VcsStatusSummary?
    @State private var gitStatusError: String?
    @State private var isRefreshingGitStatus: Bool = false
    @State private var isRunningGitAction: Bool = false
    @State private var commitMessageDraft: String = ""
    @State private var renameDraft: String = ""
    @State private var showGitSheet: Bool = false
    @State private var commitInlineExpanded: Bool = false
    @State private var confirmPullPresented: Bool = false
    @State private var confirmPushPresented: Bool = false
    @State private var gitToast: GitToastInfo?
    @State private var gitToastDismissTask: Task<Void, Never>?
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    let threadShell: ThreadShell

    init(threadShell: ThreadShell) {
        self.threadShell = threadShell
        _store = State(initialValue: ThreadStore(threadId: threadShell.id))
    }

    var body: some View {
        VStack(spacing: 0) {
            ThreadHeaderView(thread: resolvedThread,
                             project: env.threadList.project(id: threadShell.projectId),
                             session: store.session,
                             onBack: { dismiss() },
                             onRename: { showRenameSheet = true },
                             onSetInteractionMode: { mode in
                                 Task { await store.setInteractionMode(mode) }
                             },
                             onSetRuntimeMode: { mode in
                                 Task { await store.setRuntimeMode(mode) }
                             },
                             onViewDiffs: { showDiffSheet = true },
                             onArchive: archiveThread,
                             onUnarchive: unarchiveThread,
                             onDelete: deleteThread,
                             isArchived: threadShell.archivedAt != nil,
                             onOpenGit: gitCwd == nil ? nil : { openGitSheet() },
                             gitIndicatorTint: gitIndicatorTint)
            MessageTimelineView(store: store, threadShell: threadShell)
            actionablePanels
            ComposerView(store: store)
        }
        .background(T3Color.surfaceGrouped)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            guard let client = env.client else { return }
            await store.start(client: client)
            await refreshGitStatus()
        }
        .onDisappear {
            Task { await store.stop() }
        }
        .sheet(isPresented: $showRenameSheet) {
            ThreadRenameSheet(initial: store.detail?.title ?? threadShell.title) { newTitle in
                showRenameSheet = false
                Task { await renameThread(newTitle) }
            } onCancel: {
                showRenameSheet = false
            }
            .presentationDetents([.height(220), .medium])
        }
        .sheet(isPresented: $showDiffSheet) {
            ThreadDiffSheet(changes: store.diffChanges)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showGitSheet) {
            gitSheet
        }
    }

    @ViewBuilder
    private var actionablePanels: some View {
        VStack(spacing: T3Spacing.md) {
            if let plan = store.latestProposedPlan {
                ProposedPlanCard(plan: plan,
                                 isImplementing: isImplementingPlan) {
                    Task { await implementPlan(plan) }
                }
            }

            ForEach(store.pendingApprovals) { approval in
                PendingApprovalCard(approval: approval) { decision in
                    Task { await store.respondApproval(approval, decision: decision) }
                }
            }

            ForEach(store.pendingUserInputs) { input in
                PendingUserInputCard(pendingInput: input) { answers in
                    Task { await store.respondUserInput(input, answers: answers) }
                }
            }

            if let lastError = store.lastError {
                Text(lastError)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(T3Spacing.md)
                    .background(T3Color.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
            }
        }
        .padding(.horizontal, T3Spacing.lg)
        .padding(.bottom, store.pendingApprovals.isEmpty
                          && store.pendingUserInputs.isEmpty
                          && store.latestProposedPlan == nil
                          && store.lastError == nil ? 0 : T3Spacing.sm)
    }

    private func openGitSheet() {
        commitInlineExpanded = false
        commitMessageDraft = ""
        showGitSheet = true
        Task { await refreshGitStatus() }
    }

    private var gitIndicatorTint: Color? {
        guard let status = gitStatus, status.isRepo else { return nil }
        if status.behindCount > 0 { return T3Color.warning }
        if status.hasWorkingTreeChanges || status.aheadCount > 0 || status.hasUpstream == false {
            return AppAccent.color(for: accentRaw)
        }
        return nil
    }

    private var gitSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: T3Spacing.lg) {
                    if let status = gitStatus, let cwd = gitCwd {
                        if !status.isRepo {
                            Text("Not a git repository.")
                                .font(T3Typography.footnote)
                                .foregroundStyle(T3Color.textSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            gitStatusBlock(status: status, cwd: cwd)
                            if status.hasWorkingTreeChanges {
                                gitFilesList(status: status)
                            }
                            if commitInlineExpanded {
                                commitInlineEditor(status: status)
                            } else {
                                gitActionRow(status: status)
                            }
                            if let gitToast {
                                gitToastView(gitToast)
                            }
                        }
                    } else if let gitStatusError {
                        Text(gitStatusError)
                            .font(T3Typography.footnote)
                            .foregroundStyle(T3Color.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        HStack(spacing: T3Spacing.sm) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Loading git status…")
                                .font(T3Typography.footnote)
                                .foregroundStyle(T3Color.textSecondary)
                        }
                    }
                }
                .padding(T3Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(T3Color.surfaceGrouped)
            .navigationTitle("Git")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await refreshGitStatus() }
                    } label: {
                        if isRefreshingGitStatus {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(isRefreshingGitStatus)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showGitSheet = false }
                }
            }
            .confirmationDialog(pullConfirmTitle,
                                isPresented: $confirmPullPresented,
                                titleVisibility: .visible) {
                Button("Pull", role: .none) {
                    Task { await runPull() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(pullConfirmMessage)
            }
            .confirmationDialog(pushConfirmTitle,
                                isPresented: $confirmPushPresented,
                                titleVisibility: .visible) {
                Button("Push", role: .none) {
                    Task { await runGitAction(.push) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(pushConfirmMessage)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func gitStatusBlock(status: VcsStatusSummary, cwd: String) -> some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            HStack(spacing: T3Spacing.sm) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(T3Color.textTertiary)
                Text(status.refName ?? "No branch")
                    .font(T3Typography.bodyEmphasis)
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: T3Spacing.sm)
                if status.aheadCount > 0 {
                    Label("\(status.aheadCount)", systemImage: "arrow.up")
                        .labelStyle(.titleAndIcon)
                        .font(T3Typography.footnote.weight(.semibold))
                        .foregroundStyle(AppAccent.color(for: accentRaw))
                        .monospacedDigit()
                }
                if status.behindCount > 0 {
                    Label("\(status.behindCount)", systemImage: "arrow.down")
                        .labelStyle(.titleAndIcon)
                        .font(T3Typography.footnote.weight(.semibold))
                        .foregroundStyle(T3Color.warning)
                        .monospacedDigit()
                }
                if status.hasUpstream == false {
                    T3Style.Pill(text: "NO UPSTREAM",
                                 systemImage: "exclamationmark.triangle.fill",
                                 tint: T3Color.warning,
                                 emphasized: true)
                }
            }
            Text(gitStatusSummaryLine(status))
                .font(T3Typography.footnote)
                .foregroundStyle(gitStatusSummaryTint(status))
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(cwd)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(T3Color.textTertiary)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(T3Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T3Color.surfaceElevated, in: RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                .stroke(T3Color.separator, lineWidth: 0.5)
        )
    }

    private func gitFilesList(status: VcsStatusSummary) -> some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            HStack(spacing: 4) {
                Text("CHANGED FILES")
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textTertiary)
                    .tracking(0.6)
                Spacer()
                Text("\(status.workingTree.files.count)")
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textTertiary)
                    .monospacedDigit()
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(status.workingTree.files.prefix(60).enumerated()), id: \.offset) { index, file in
                    HStack(spacing: T3Spacing.sm) {
                        Text(file.path)
                            .font(.system(.footnote, design: .monospaced))
                            .foregroundStyle(T3Color.textPrimary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if file.insertions > 0 {
                            Text("+\(file.insertions)")
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(T3Color.success)
                                .monospacedDigit()
                        }
                        if file.deletions > 0 {
                            Text("−\(file.deletions)")
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(T3Color.danger)
                                .monospacedDigit()
                        }
                    }
                    .padding(.horizontal, T3Spacing.md)
                    .padding(.vertical, 8)
                    if index < min(status.workingTree.files.count, 60) - 1 {
                        Divider().foregroundStyle(T3Color.separator)
                    }
                }
                if status.workingTree.files.count > 60 {
                    Text("+\(status.workingTree.files.count - 60) more…")
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.textTertiary)
                        .padding(.horizontal, T3Spacing.md)
                        .padding(.vertical, 8)
                }
            }
            .background(T3Color.surfaceElevated, in: RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .stroke(T3Color.separator, lineWidth: 0.5)
            )
        }
    }

    private func gitActionRow(status: VcsStatusSummary) -> some View {
        HStack(spacing: T3Spacing.sm) {
            Button {
                confirmPullPresented = true
            } label: {
                Label("Pull", systemImage: "arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(!canPull(status: status))

            Button {
                commitMessageDraft = ""
                withAnimation(.easeInOut(duration: 0.18)) {
                    commitInlineExpanded = true
                }
            } label: {
                Label("Commit", systemImage: "checkmark.seal")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(isRunningGitAction || !status.hasWorkingTreeChanges)

            Button {
                confirmPushPresented = true
            } label: {
                Label("Push", systemImage: "arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppAccent.color(for: accentRaw))
            .disabled(!canPush(status: status))
        }
    }

    private func commitInlineEditor(status: VcsStatusSummary) -> some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            Text("COMMIT MESSAGE")
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textTertiary)
                .tracking(0.6)
            TextField("Describe these changes…", text: $commitMessageDraft, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.plain)
                .padding(T3Spacing.md)
                .background(T3Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                        .stroke(T3Color.separator, lineWidth: 0.5)
                )
            HStack(spacing: T3Spacing.sm) {
                Button("Cancel") {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        commitInlineExpanded = false
                    }
                    commitMessageDraft = ""
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)

                Button {
                    let message = commitMessageDraft
                    withAnimation(.easeInOut(duration: 0.18)) {
                        commitInlineExpanded = false
                    }
                    Task { await runGitAction(.commit, commitMessage: message) }
                } label: {
                    Label("Commit", systemImage: "checkmark.seal.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppAccent.color(for: accentRaw))
                .disabled(commitMessageDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                          || isRunningGitAction
                          || !status.hasWorkingTreeChanges)
            }
        }
    }

    private func gitToastView(_ toast: GitToastInfo) -> some View {
        let tint = toast.isSuccess ? T3Color.success : T3Color.danger
        let icon = toast.isSuccess ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
        return HStack(alignment: .top, spacing: T3Spacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title)
                    .font(T3Typography.footnote.weight(.semibold))
                    .foregroundStyle(T3Color.textPrimary)
                if let detail = toast.detail, !detail.isEmpty {
                    Text(detail)
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, T3Spacing.sm)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: T3Radius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: T3Radius.sm, style: .continuous)
                .stroke(tint.opacity(0.30), lineWidth: 0.5)
        )
        .transition(.opacity)
    }

    private func canPull(status: VcsStatusSummary) -> Bool {
        guard !isRunningGitAction, status.isRepo, status.hasUpstream else { return false }
        return status.behindCount > 0
    }

    private func canPush(status: VcsStatusSummary) -> Bool {
        guard !isRunningGitAction, status.isRepo, status.hasUpstream else { return false }
        return status.aheadCount > 0
    }

    private func gitStatusSummaryLine(_ status: VcsStatusSummary) -> String {
        if status.hasWorkingTreeChanges {
            let count = status.workingTree.files.count
            let plural = count == 1 ? "file" : "files"
            return "\(count) \(plural)  +\(status.workingTree.insertions)  −\(status.workingTree.deletions)"
        }
        if status.hasUpstream == false {
            return "Working tree clean • no upstream"
        }
        if status.aheadCount == 0 && status.behindCount == 0 {
            return "Up to date"
        }
        var parts: [String] = ["Working tree clean"]
        if status.aheadCount > 0 { parts.append("\(status.aheadCount) to push") }
        if status.behindCount > 0 { parts.append("\(status.behindCount) to pull") }
        return parts.joined(separator: " • ")
    }

    private func gitStatusSummaryTint(_ status: VcsStatusSummary) -> Color {
        if status.hasWorkingTreeChanges { return T3Color.textPrimary }
        if status.behindCount > 0 { return T3Color.warning }
        return T3Color.textSecondary
    }

    private var pullConfirmTitle: String {
        guard let status = gitStatus, status.behindCount > 0 else { return "Pull from upstream?" }
        let s = status.behindCount == 1 ? "" : "s"
        return "Pull \(status.behindCount) commit\(s)?"
    }

    private var pullConfirmMessage: String {
        let branch = gitStatus?.refName ?? "current branch"
        return "Fetch and fast-forward \(branch) from its upstream. Local commits won't be lost."
    }

    private var pushConfirmTitle: String {
        guard let status = gitStatus, status.aheadCount > 0 else { return "Push to upstream?" }
        let s = status.aheadCount == 1 ? "" : "s"
        return "Push \(status.aheadCount) commit\(s)?"
    }

    private var pushConfirmMessage: String {
        let branch = gitStatus?.refName ?? "current branch"
        return "Push local commits on \(branch) to its upstream remote."
    }

    private var resolvedThread: ThreadHeaderView.ThreadDescriptor {
        let title = store.detail?.title ?? threadShell.title
        let selection = store.detail?.modelSelection ?? threadShell.modelSelection
        let model = env.serverConfig?.modelDisplayLabel(selection: selection) ?? selection.model
        let interaction = store.detail?.interactionMode ?? threadShell.interactionMode
        let runtime = store.detail?.runtimeMode ?? threadShell.runtimeMode
        let updated = store.detail?.updatedAt ?? threadShell.updatedAt
        return .init(title: title,
                     model: model,
                     interactionMode: interaction,
                     runtimeMode: runtime,
                     updatedAt: updated)
    }

    private var gitCwd: String? {
        if let path = store.detail?.worktreePath, !path.isEmpty { return path }
        if let path = threadShell.worktreePath, !path.isEmpty { return path }
        return env.threadList.project(id: threadShell.projectId)?.workspaceRoot
    }

    private func renameThread(_ newTitle: String) async {
        let trimmed = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != store.detail?.title else { return }
        guard let client = env.client else { return }
        do {
            try await client.renameThread(threadId: threadShell.id, title: trimmed)
        } catch {
            await MainActor.run { store.lastError = error.localizedDescription }
        }
    }

    private func archiveThread() {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.archiveThread(threadId: threadShell.id)
                await MainActor.run { dismiss() }
            } catch {
                await MainActor.run { store.lastError = error.localizedDescription }
            }
        }
    }

    private func refreshGitStatus() async {
        guard let client = env.client, let cwd = gitCwd else { return }
        await MainActor.run {
            isRefreshingGitStatus = true
            gitStatusError = nil
        }
        defer { Task { @MainActor in isRefreshingGitStatus = false } }
        do {
            let status = try await client.refreshVcsStatus(cwd: cwd)
            await MainActor.run { gitStatus = status }
        } catch {
            await MainActor.run { gitStatusError = error.localizedDescription }
        }
    }

    private func runPull() async {
        guard let client = env.client, let cwd = gitCwd else { return }
        let beforeBehind = gitStatus?.behindCount ?? 0
        await MainActor.run {
            isRunningGitAction = true
            gitStatusError = nil
        }
        defer { Task { @MainActor in isRunningGitAction = false } }
        do {
            let summary = try await client.vcsPull(cwd: cwd)
            await refreshGitStatus()
            await MainActor.run {
                presentGitToast(.init(
                    title: pullToastTitle(status: summary.status, count: beforeBehind),
                    detail: pullToastDetail(summary: summary),
                    isSuccess: true
                ))
            }
        } catch {
            await MainActor.run {
                gitStatusError = error.localizedDescription
                presentGitToast(.init(title: "Pull failed",
                                      detail: error.localizedDescription,
                                      isSuccess: false))
            }
        }
    }

    private func runGitAction(_ action: GitStackedAction, commitMessage: String? = nil) async {
        guard let client = env.client, let cwd = gitCwd else { return }
        await MainActor.run {
            isRunningGitAction = true
            gitStatusError = nil
        }
        defer { Task { @MainActor in isRunningGitAction = false } }
        do {
            let summary = try await client.runGitStackedAction(cwd: cwd, action: action, commitMessage: commitMessage)
            await refreshGitStatus()
            await MainActor.run {
                presentGitToast(.init(title: summary.toastTitle,
                                      detail: summary.toastDescription,
                                      isSuccess: true))
            }
        } catch {
            let label: String
            switch action {
            case .commit: label = "Commit failed"
            case .push:   label = "Push failed"
            }
            await MainActor.run {
                gitStatusError = error.localizedDescription
                presentGitToast(.init(title: label,
                                      detail: error.localizedDescription,
                                      isSuccess: false))
            }
        }
    }

    private func presentGitToast(_ toast: GitToastInfo) {
        gitToastDismissTask?.cancel()
        withAnimation(.easeInOut(duration: 0.18)) {
            gitToast = toast
        }
        gitToastDismissTask = Task { [toastID = toast.id] in
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if gitToast?.id == toastID {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        gitToast = nil
                    }
                }
            }
        }
    }

    private func pullToastTitle(status: String, count: Int) -> String {
        switch status.lowercased() {
        case "uptodate", "up_to_date", "up-to-date":
            return "Already up to date"
        case "fastforward", "fast_forward", "fast-forward":
            let s = count == 1 ? "" : "s"
            return count > 0 ? "Pulled \(count) commit\(s)" : "Pulled latest commits"
        default:
            return "Pull complete"
        }
    }

    private func pullToastDetail(summary: VcsPullSummary) -> String? {
        if let upstream = summary.upstreamRef, !upstream.isEmpty {
            return "\(summary.refName) ← \(upstream)"
        }
        return summary.refName
    }

    private func unarchiveThread() {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.unarchiveThread(threadId: threadShell.id)
            } catch {
                await MainActor.run { store.lastError = error.localizedDescription }
            }
        }
    }

    private func deleteThread() {
        guard let client = env.client else { return }
        Task {
            do {
                try await client.deleteThread(threadId: threadShell.id)
                await MainActor.run { dismiss() }
            } catch {
                await MainActor.run { store.lastError = error.localizedDescription }
            }
        }
    }

    private func implementPlan(_ plan: ProposedPlan) async {
        guard !isImplementingPlan else { return }
        await MainActor.run { isImplementingPlan = true }
        defer { Task { @MainActor in isImplementingPlan = false } }
        await store.implementProposedPlan(plan)
    }
}

private struct GitToastInfo: Equatable, Identifiable {
    let id: UUID = UUID()
    let title: String
    let detail: String?
    let isSuccess: Bool
}

// MARK: - Thread Header

struct ThreadHeaderView: View {
    struct ThreadDescriptor {
        let title: String
        let model: String
        let interactionMode: ProviderInteractionMode
        let runtimeMode: RuntimeMode
        let updatedAt: Date
    }

    let thread: ThreadDescriptor
    let project: ProjectShell?
    let session: OrchestrationSession?
    let onBack: () -> Void
    let onRename: () -> Void
    let onSetInteractionMode: (ProviderInteractionMode) -> Void
    let onSetRuntimeMode: (RuntimeMode) -> Void
    let onViewDiffs: () -> Void
    let onArchive: () -> Void
    let onUnarchive: () -> Void
    let onDelete: () -> Void
    let isArchived: Bool
    var onOpenGit: (() -> Void)? = nil
    var gitIndicatorTint: Color? = nil

    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    @State private var confirmDelete: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: T3Spacing.md) {
            topRow
            titleBlock
        }
        .padding(.horizontal, T3Spacing.lg)
        .padding(.top, T3Spacing.md)
        .padding(.bottom, T3Spacing.md)
        .background(T3Color.surfaceGrouped)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(T3Color.separator)
                .frame(height: 0.5)
        }
        .confirmationDialog("Delete this thread?",
                            isPresented: $confirmDelete,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: onDelete)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This thread will be permanently removed from the desktop server.")
        }
    }

    private var topRow: some View {
        HStack(spacing: T3Spacing.sm) {
            T3Style.ToolbarChip(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(T3Color.textPrimary)
            }

            T3WordmarkLabel()

            Spacer(minLength: T3Spacing.sm)

            sessionStatePill

            if let onOpenGit {
                gitChip(action: onOpenGit)
            }

            actionsMenu
        }
    }

    private func gitChip(action: @escaping () -> Void) -> some View {
        T3Style.ToolbarChip(action: action) {
            Image(systemName: "arrow.triangle.branch")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(T3Color.textPrimary)
        }
        .overlay(alignment: .topTrailing) {
            if let tint = gitIndicatorTint {
                Circle()
                    .fill(tint)
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle().stroke(T3Color.surfaceGrouped, lineWidth: 1.5)
                    )
                    .offset(x: 3, y: -3)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel("Git")
    }

    @ViewBuilder
    private var actionsMenu: some View {
        Menu {
            Button {
                onRename()
            } label: {
                Label("Rename thread", systemImage: "pencil")
            }
            Button {
                onViewDiffs()
            } label: {
                Label("View changes", systemImage: "doc.text.magnifyingglass")
            }
            if isArchived {
                Button {
                    onUnarchive()
                } label: {
                    Label("Unarchive", systemImage: "tray.and.arrow.up")
                }
            } else {
                Button {
                    onArchive()
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
            }
            Divider()
            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(T3Color.textPrimary)
                .frame(width: 34, height: 34)
                .background(T3Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                        .stroke(T3Color.separator, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            Text(thread.title)
                .font(T3Typography.headline)
                .foregroundStyle(T3Color.textPrimary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(alignment: .center, spacing: T3Spacing.sm) {
                if let project {
                    Text(project.title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(T3Color.textSecondary)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(T3Color.surfaceElevated,
                                    in: RoundedRectangle(cornerRadius: T3Radius.sm, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: T3Radius.sm, style: .continuous)
                                .stroke(T3Color.separator, lineWidth: 0.5)
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                interactionModeMenu
                    .fixedSize(horizontal: true, vertical: false)
            }

            HStack(spacing: T3Spacing.xs) {
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(accentColor)
                Text(thread.model)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textSecondary)
                Text("·")
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
                runtimeModeMenu
                if let session, session.status == .running {
                    Text("·")
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.textTertiary)
                    Text("running")
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.warning)
                }
                Spacer(minLength: 0)
            }
        }
    }

    @ViewBuilder
    private var sessionStatePill: some View {
        if let session {
            switch session.status {
            case .running:
                T3Style.Pill(text: "Running",
                             systemImage: "circle.fill",
                             tint: T3Color.warning,
                             emphasized: true)
            case .error:
                T3Style.Pill(text: "Error",
                             systemImage: "exclamationmark.triangle.fill",
                             tint: T3Color.danger,
                             emphasized: true)
            default:
                EmptyView()
            }
        }
    }

    private var interactionModeMenu: some View {
        Menu {
            Button {
                onSetInteractionMode(.default)
            } label: {
                Label("Build", systemImage: thread.interactionMode == .default ? "checkmark" : "hammer")
            }
            Button {
                onSetInteractionMode(.plan)
            } label: {
                Label("Plan", systemImage: thread.interactionMode == .plan ? "checkmark" : "doc.plaintext")
            }
        } label: {
            interactionModeBadge
        }
    }

    private var interactionModeBadge: some View {
        let mode = thread.interactionMode
        let label = mode == .plan ? "PLAN" : "BUILD"
        let tint: Color = mode == .plan ? accentColor : T3Color.success
        return T3Style.Pill(text: label, tint: tint, emphasized: true)
    }

    private var runtimeModeMenu: some View {
        Menu {
            Button {
                onSetRuntimeMode(.approvalRequired)
            } label: {
                Label("Supervised",
                      systemImage: thread.runtimeMode == .approvalRequired ? "checkmark" : "checkmark.shield")
            }
            Button {
                onSetRuntimeMode(.autoAcceptEdits)
            } label: {
                Label("Auto edits",
                      systemImage: thread.runtimeMode == .autoAcceptEdits ? "checkmark" : "wand.and.stars")
            }
            Button {
                onSetRuntimeMode(.fullAccess)
            } label: {
                Label("Full access",
                      systemImage: thread.runtimeMode == .fullAccess ? "checkmark" : "lock.open")
            }
        } label: {
            HStack(spacing: 3) {
                Text(runtimeModeLabel)
                    .font(T3Typography.footnote)
                    .foregroundStyle(runtimeModeTint)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(T3Color.textTertiary)
            }
        }
    }

    private var runtimeModeLabel: String {
        switch thread.runtimeMode {
        case .approvalRequired: "supervised"
        case .autoAcceptEdits: "auto edits"
        case .fullAccess: "full access"
        }
    }

    private var runtimeModeTint: Color {
        switch thread.runtimeMode {
        case .approvalRequired: T3Color.warning
        case .autoAcceptEdits: T3Color.primary
        case .fullAccess: T3Color.success
        }
    }

    private var accentColor: Color {
        AppAccent.color(for: accentRaw)
    }
}

private struct ThreadDiffSheet: View {
    let changes: [ThreadDiffChange]

    var body: some View {
        NavigationStack {
            Group {
                if changes.isEmpty {
                    ContentUnavailableView("No file changes yet",
                                           systemImage: "doc.text",
                                           description: Text("When the agent edits files, they will show up here."))
                } else {
                    List {
                        ForEach(changes) { change in
                            Section {
                                if let command = change.command, !command.isEmpty {
                                    Text(command)
                                        .font(.system(.footnote, design: .monospaced))
                                        .textSelection(.enabled)
                                }
                                ForEach(change.files, id: \.self) { file in
                                    HStack(spacing: T3Spacing.sm) {
                                        Image(systemName: "doc")
                                            .foregroundStyle(T3Color.textTertiary)
                                        Text(file)
                                            .font(.system(.footnote, design: .monospaced))
                                            .foregroundStyle(T3Color.textPrimary)
                                    }
                                }
                                if let detail = change.detail, !detail.isEmpty {
                                    Text(detail)
                                        .font(T3Typography.footnote)
                                        .foregroundStyle(T3Color.textSecondary)
                                        .textSelection(.enabled)
                                }
                            } header: {
                                Text(change.title)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Changes")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Rename Sheet

private struct ThreadRenameSheet: View {
    @State private var draft: String
    let onSubmit: (String) -> Void
    let onCancel: () -> Void
    @FocusState private var focused: Bool

    init(initial: String,
         onSubmit: @escaping (String) -> Void,
         onCancel: @escaping () -> Void) {
        _draft = State(initialValue: initial)
        self.onSubmit = onSubmit
        self.onCancel = onCancel
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: T3Spacing.lg) {
                TextField("Thread title", text: $draft)
                    .textFieldStyle(.roundedBorder)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit { onSubmit(draft) }
                Spacer()
            }
            .padding(T3Spacing.lg)
            .navigationTitle("Rename thread")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSubmit(draft)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
    }
}
