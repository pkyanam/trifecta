import SwiftUI
import PhotosUI
import UIKit

private enum ComposerMenuRow: Identifiable, Hashable {
    case path(ProjectSearchEntry)
    case builtIn(id: String, command: BuiltInSlashCommand)
    case providerSlash(providerLabel: String, command: ServerProviderSlashCommand)
    case skill(ServerProviderSkill)

    enum BuiltInSlashCommand: String, CaseIterable {
        case model
        case plan
        case defaultMode = "default"

        var label: String {
            switch self {
            case .model: return "/model"
            case .plan: return "/plan"
            case .defaultMode: return "/default"
            }
        }
    }

    var id: String {
        switch self {
        case .path(let e): return "path:\(e.path)"
        case .builtIn(let id, _): return id
        case .providerSlash(let pl, let c): return "pslash:\(pl):\(c.name)"
        case .skill(let s): return "skill:\(s.name)"
        }
    }

    var title: String {
        switch self {
        case .path(let e):
            return (e.path as NSString).lastPathComponent
        case .builtIn(_, let c):
            switch c {
            case .model: return "/model"
            case .plan: return "/plan"
            case .defaultMode: return "/default"
            }
        case .providerSlash(_, let c):
            return "/\(c.name)"
        case .skill(let s):
            return s.name
        }
    }

    var subtitle: String {
        switch self {
        case .path(let e):
            return e.parentPath ?? e.path
        case .builtIn(_, let c):
            switch c {
            case .model: return "Switch response model for this thread"
            case .plan: return "Switch this thread into plan mode"
            case .defaultMode: return "Switch this thread back to normal build mode"
            }
        case .providerSlash(let label, let c):
            let hint = c.description ?? c.input?.hint
            var parts: [String] = [label]
            if let h = hint?.trimmingCharacters(in: .whitespacesAndNewlines), !h.isEmpty {
                parts.append(h)
            }
            return parts.joined(separator: " · ")
        case .skill(let s):
            return s.shortDescription ?? s.description ?? ""
        }
    }
}

struct ComposerView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.colorScheme) private var colorScheme
    @Bindable var store: ThreadStore
    @State private var draft: String = ""
    @State private var selectionEndUTF16: Int = 0
    @State private var appliedCursorUTF16: Int?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var attachments: [LocalAttachment] = []
    @State private var showModelPicker = false
    @State private var composerFocused = false
    @State private var menuRows: [ComposerMenuRow] = []
    @State private var pathSearchTask: Task<Void, Never>?
    @AppStorage("composerSize") private var composerSizeRaw: String = ComposerSize.comfortable.rawValue
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    @AppStorage("userBubbleColor") private var userBubbleColorRaw: String = UserBubbleColor.accent.rawValue

    private let maxChars = 120_000
    private let maxAttachments = 8

    var body: some View {
        VStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                if !attachments.isEmpty {
                    attachmentRow
                        .padding(.top, T3Spacing.sm)
                }

                textField
                    .padding(.horizontal, 16)
                    .padding(.top, attachments.isEmpty ? 14 : 8)
                    .padding(.bottom, 8)

                controlRow
                    .padding(.horizontal, 16)
                    .padding(.bottom, 7)
            }
            .t3Glass(radius: 26,
                     tint: composerFocused ? accentColor.opacity(0.12) : T3Color.surfaceElevated.opacity(0.62),
                     stroke: composerFocused ? accentColor.opacity(0.44) : T3Color.separator)
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(.white.opacity(colorScheme == .dark ? 0.06 : 0.45), lineWidth: 0.5)
            )
            .overlay(alignment: .topLeading) {
                if !menuRows.isEmpty {
                    composerMenu
                        .padding(.horizontal, 8)
                        .offset(y: -214)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .zIndex(2)

            composerMetaBar
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeInOut(duration: 0.18), value: composerFocused)
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: menuRows.count)
        .onChange(of: pickerItems) { _, items in
            Task { await loadAttachments(items) }
        }
    }

    // MARK: - Suggestion menu

    private var composerMenu: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(menuRows) { row in
                    Button {
                        selectMenuRow(row)
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: T3Spacing.sm) {
                            Image(systemName: rowIcon(row))
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(T3Color.textTertiary)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.title)
                                    .font(T3Typography.callout)
                                    .fontWeight(.medium)
                                    .foregroundStyle(T3Color.textPrimary)
                                if !row.subtitle.isEmpty {
                                    Text(row.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(T3Color.textTertiary)
                                        .lineLimit(2)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, T3Spacing.sm)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().opacity(0.35)
                }
            }
        }
        .frame(maxHeight: 200)
        .t3Glass(radius: 18, tint: T3Color.surface.opacity(0.78))
        .shadow(color: .black.opacity(0.16), radius: 18, x: 0, y: 8)
    }

    private func rowIcon(_ row: ComposerMenuRow) -> String {
        switch row {
        case .path(let e): return e.isDirectory ? "folder" : "doc.text"
        case .builtIn: return "command"
        case .providerSlash: return "terminal"
        case .skill: return "sparkles"
        }
    }

    // MARK: - Text field

    private var textField: some View {
        ZStack(alignment: .topLeading) {
            if draft.isEmpty {
                Text("Ask anything, @tag files/folders, $skills, or / for commands")
                    .foregroundStyle(T3Color.textTertiary)
                    .font(T3Typography.callout)
                    .padding(.top, 7)
                    .padding(.leading, 4)
                    .allowsHitTesting(false)
                    .lineLimit(2)
            }
            ComposerBackedTextView(
                text: $draft,
                isFocused: $composerFocused,
                font: UIFont.preferredFont(forTextStyle: .callout),
                textColor: .label,
                tintColor: UIColor(accentColor),
                cursorUTF16: appliedCursorUTF16,
                onClearPendingCursor: { appliedCursorUTF16 = nil },
                onEdit: { newText, selectedEndUTF16 in
                    draft = newText
                    selectionEndUTF16 = selectedEndUTF16
                    refreshMenu()
                }
            )
            .frame(height: editorHeight)
        }
    }

    // MARK: - Bottom control row

    private var controlRow: some View {
        HStack(spacing: 12) {
            composerPlusMenu

            PhotosPicker(selection: $pickerItems,
                         maxSelectionCount: maxAttachments,
                         matching: .images) {
                Image(systemName: "photo")
                    .font(metaSymbolFont)
                    .foregroundStyle(attachments.count >= maxAttachments ? T3Color.textTertiary : T3Color.textSecondary)
                    .frame(width: 24, height: 24)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(attachments.count >= maxAttachments)

            modelChip

            if store.detail?.interactionMode == .plan {
                planModeIndicator
            }

            Spacer(minLength: 0)

            runtimeChip

            Image(systemName: "mic")
                .font(metaSymbolFont)
                .foregroundStyle(T3Color.textSecondary)
                .frame(width: 24, height: 24)
                .contentShape(Circle())
                .accessibilityHidden(true)

            sendOrStopButton
        }
    }

    private var composerPlusMenu: some View {
        Menu {
            Button {
                HapticFeedback.selection()
                Task { await store.setInteractionMode(.plan) }
            } label: {
                Label("Plan mode", systemImage: store.detail?.interactionMode == .plan ? "checkmark" : "checklist")
            }

            Button {
                HapticFeedback.selection()
                Task { await store.setInteractionMode(.default) }
            } label: {
                Label("Build mode", systemImage: store.detail?.interactionMode == .default ? "checkmark" : "hammer")
            }

            Section("Access") {
                Button {
                    Task { await store.setRuntimeMode(.approvalRequired) }
                } label: {
                    Label("Ask before edits", systemImage: runtimeMode == .approvalRequired ? "checkmark" : "checkmark.shield")
                }
                Button {
                    Task { await store.setRuntimeMode(.autoAcceptEdits) }
                } label: {
                    Label("Auto-accept edits", systemImage: runtimeMode == .autoAcceptEdits ? "checkmark" : "wand.and.stars")
                }
                Button {
                    Task { await store.setRuntimeMode(.fullAccess) }
                } label: {
                    Label("Full access", systemImage: runtimeMode == .fullAccess ? "checkmark" : "lock.open")
                }
            }

            Button {
                showModelPicker = true
            } label: {
                Label("Change model", systemImage: "sparkles")
            }
        } label: {
            Image(systemName: "plus")
                .font(metaTextFont)
                .foregroundStyle(T3Color.textSecondary)
                .frame(width: 24, height: 24)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(store.isSending)
        .accessibilityLabel("Composer options")
    }

    @ViewBuilder
    private var sendOrStopButton: some View {
        if isTurnRunning {
            Button {
                HapticFeedback.impact(.medium)
                Task { await store.interruptTurn() }
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(selectedBubbleForeground)
                    .frame(width: 32, height: 32)
                    .background(selectedBubbleColor, in: Circle())
            }
            .buttonStyle(T3ScaleButtonStyle())
            .accessibilityLabel("Stop turn")
        } else {
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(canSend ? selectedBubbleForeground : T3Color.textTertiary)
                    .frame(width: 32, height: 32)
                    .background(
                        canSend ? selectedBubbleColor : Color(.systemGray5),
                        in: Circle()
                    )
            }
            .buttonStyle(T3ScaleButtonStyle())
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
    }

    private var isTurnRunning: Bool {
        store.isTurnRunning
    }

    private var modelChip: some View {
        Button { showModelPicker = true } label: {
            HStack(spacing: 5) {
                if let driver = currentProviderDriver {
                    ProviderIcon(driver: driver, size: 13)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(accentColor)
                }
                Text(modelName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(T3Color.textTertiary)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showModelPicker) {
            modelPickerSheet
        }
    }

    private var runtimeChip: some View {
        Menu {
            Button {
                Task { await store.setRuntimeMode(.approvalRequired) }
            } label: {
                Label("Ask before edits", systemImage: runtimeMode == .approvalRequired ? "checkmark" : "checkmark.shield")
            }
            Button {
                Task { await store.setRuntimeMode(.autoAcceptEdits) }
            } label: {
                Label("Auto-accept edits", systemImage: runtimeMode == .autoAcceptEdits ? "checkmark" : "wand.and.stars")
            }
            Button {
                Task { await store.setRuntimeMode(.fullAccess) }
            } label: {
                Label("Full access", systemImage: runtimeMode == .fullAccess ? "checkmark" : "lock.open")
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: runtimeModeIcon)
                    .font(.system(size: 11, weight: .semibold))
                Text(runtimeModeLabel)
                    .font(metaTextFont)
                    .lineLimit(1)
            }
            .foregroundStyle(runtimeModeTint)
            .padding(.vertical, 6)
            .padding(.horizontal, 4)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var planModeIndicator: some View {
        HStack(spacing: 5) {
            Image(systemName: "checklist")
                .font(metaSymbolFont)
            Text("Plan")
                .font(metaTextFont)
                .lineLimit(1)
        }
        .foregroundStyle(T3Color.warning)
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
        .contentShape(Capsule())
    }

    private var currentProviderDriver: String? {
        guard let selection = store.detail?.modelSelection else { return nil }
        return env.serverConfig?.providers
            .first { $0.instanceId == selection.instanceId }?
            .driver
    }

    private var modelPickerSheet: some View {
        ModelPickerSheet(
            providers: env.serverConfig?.providers ?? [],
            currentSelection: store.detail?.modelSelection,
            accentColor: accentColor,
            onSelect: { provider, slug in
                selectModel(provider: provider, slug: slug)
            }
        )
    }

    private func selectModel(provider: ServerProvider, slug: String) {
        let selection = ModelSelection(instanceId: provider.instanceId, model: slug)
        Task { await store.updateModelSelection(selection) }
    }

    // MARK: - Attachments

    private var attachmentRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 8) {
                ForEach(attachments) { attachment in
                    AttachmentChip(attachment: attachment) {
                        attachments.removeAll { $0.id == attachment.id }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 2)
            .padding(.bottom, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Composer triggers & menu

    private var workspaceCwd: String? {
        guard let pid = store.detail?.projectId else { return nil }
        return env.threadList.project(id: pid)?.workspaceRoot
    }

    private var selectedProvider: ServerProvider? {
        guard let sel = store.detail?.modelSelection else { return nil }
        return env.serverConfig?.providers.first { $0.instanceId == sel.instanceId }
    }

    private func refreshMenu() {
        pathSearchTask?.cancel()
        pathSearchTask = nil

        guard let trigger = ComposerLogic.detectTrigger(text: draft, cursorUTF16: selectionEndUTF16) else {
            menuRows = []
            return
        }

        switch trigger.kind {
        case .slashCommand:
            menuRows = slashMenuRows(trigger: trigger)
        case .skill:
            menuRows = skillMenuRows(trigger: trigger)
        case .path:
            schedulePathSearch(trigger: trigger)
        }
    }

    private func slashMenuRows(trigger: ComposerTrigger) -> [ComposerMenuRow] {
        let q = trigger.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var rows: [ComposerMenuRow] = ComposerMenuRow.BuiltInSlashCommand.allCases.map {
            ComposerMenuRow.builtIn(id: "slash:\($0.rawValue)", command: $0)
        }
        if let p = selectedProvider {
            for c in p.slashCommands {
                rows.append(.providerSlash(providerLabel: p.label, command: c))
            }
        }
        if q.isEmpty { return rows }
        return rows.filter {
            let t = $0.title.lowercased()
            let s = $0.subtitle.lowercased()
            let stripped = t.hasPrefix("/") ? String(t.dropFirst()) : t
            return t.contains(q) || s.contains(q) || stripped.hasPrefix(q)
        }
    }

    private func skillMenuRows(trigger: ComposerTrigger) -> [ComposerMenuRow] {
        let skills = selectedProvider?.skills ?? []
        let q = trigger.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mapped = skills.map { ComposerMenuRow.skill($0) }
        if q.isEmpty { return mapped }
        return mapped.filter {
            guard case .skill(let s) = $0 else { return false }
            let hay = (s.name + " " + (s.shortDescription ?? "") + " " + (s.description ?? "")).lowercased()
            return hay.contains(q)
        }
    }

    private func schedulePathSearch(trigger: ComposerTrigger) {
        let query = trigger.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let cwd = workspaceCwd else {
            menuRows = []
            return
        }
        if query.isEmpty {
            menuRows = []
            return
        }

        menuRows = []

        pathSearchTask = Task {
            try? await Task.sleep(nanoseconds: 220_000_000)
            guard !Task.isCancelled else { return }
            guard let client = env.client else {
                return
            }
            do {
                let result = try await client.searchProjectEntries(cwd: cwd, query: query, limit: 50)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    let still = ComposerLogic.detectTrigger(text: draft, cursorUTF16: selectionEndUTF16)
                    guard still?.kind == .path,
                          still?.query.trimmingCharacters(in: .whitespacesAndNewlines) == query else { return }
                    menuRows = result.entries.map { ComposerMenuRow.path($0) }
                }
            } catch {
                await MainActor.run {
                    menuRows = []
                }
            }
        }
    }

    private func selectMenuRow(_ row: ComposerMenuRow) {
        guard let trigger = ComposerLogic.detectTrigger(text: draft, cursorUTF16: selectionEndUTF16) else {
            menuRows = []
            return
        }

        switch row {
        case .path(let entry):
            let replacement = "@\(entry.path) "
            let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: replacement)
            draft = out.text
            appliedCursorUTF16 = out.cursorUTF16
            menuRows = []
        case .builtIn(_, let cmd):
            switch cmd {
            case .model:
                showModelPicker = true
                let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: "")
                draft = out.text
                appliedCursorUTF16 = out.cursorUTF16
            case .plan:
                Task { await store.setInteractionMode(.plan) }
                let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: "")
                draft = out.text
                appliedCursorUTF16 = out.cursorUTF16
            case .defaultMode:
                Task { await store.setInteractionMode(.default) }
                let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: "")
                draft = out.text
                appliedCursorUTF16 = out.cursorUTF16
            }
            menuRows = []
        case .providerSlash(_, let command):
            let replacement = "/\(command.name) "
            let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: replacement)
            draft = out.text
            appliedCursorUTF16 = out.cursorUTF16
            menuRows = []
        case .skill(let skill):
            let replacement = "$\(skill.name) "
            let out = ComposerLogic.replaceRangeUTF16(in: draft, rangeStart: trigger.rangeStart, rangeEnd: trigger.rangeEnd, replacement: replacement)
            draft = out.text
            appliedCursorUTF16 = out.cursorUTF16
            menuRows = []
        }
    }

    // MARK: - Helpers

    private var modelName: String {
        guard let detail = store.detail else { return "Model" }
        return env.serverConfig?.modelDisplayLabel(selection: detail.modelSelection)
            ?? detail.modelSelection.model
    }

    private var editorHeight: CGFloat {
        let lines = max(1, draft.components(separatedBy: .newlines).count)
        let textExtra = min(4, draft.count / 42)
        let visibleLines = min(composerSize.maxLines, max(2, lines + textExtra))
        return CGFloat(visibleLines) * 22 + 12
    }

    private var composerSize: ComposerSize {
        ComposerSize(rawValue: composerSizeRaw) ?? .comfortable
    }

    private var accentColor: Color {
        AppAccent.color(for: accentRaw)
    }

    private var metaTextFont: Font {
        .system(size: 13, weight: .regular)
    }

    private var metaSymbolFont: Font {
        .system(size: 14, weight: .regular)
    }

    private var selectedBubbleColor: Color {
        (UserBubbleColor(rawValue: userBubbleColorRaw) ?? .accent).color(accentRaw: accentRaw)
    }

    private var selectedBubbleForeground: Color {
        colorScheme == .dark ? .black : .white
    }

    private var runtimeMode: RuntimeMode {
        store.detail?.runtimeMode ?? .fullAccess
    }

    private var runtimeModeLabel: String {
        switch runtimeMode {
        case .approvalRequired: "Ask"
        case .autoAcceptEdits: "Auto"
        case .fullAccess: "Full"
        }
    }

    private var runtimeModeIcon: String {
        switch runtimeMode {
        case .approvalRequired: "checkmark.shield"
        case .autoAcceptEdits: "wand.and.stars"
        case .fullAccess: "lock.open"
        }
    }

    private var runtimeModeTint: Color {
        switch runtimeMode {
        case .approvalRequired: T3Color.textSecondary
        case .autoAcceptEdits: T3Color.success
        case .fullAccess: T3Color.warning
        }
    }

    private var characterUsageLabel: String? {
        guard draft.count > 10_000 else { return nil }
        return "\(draft.count.formatted())/\(maxChars.formatted())"
    }

    private var composerMetaBar: some View {
        HStack(spacing: T3Spacing.sm) {
            if let usage = characterUsageLabel {
                Text(usage)
                    .font(T3Typography.caption)
                    .foregroundStyle(draft.count > maxChars ? T3Color.danger : T3Color.textTertiary)
            }
            Spacer(minLength: 0)
            if !attachments.isEmpty {
                Text("\(attachments.count)/\(maxAttachments) images")
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textTertiary)
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 14)
    }

    private var canSend: Bool {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return (!text.isEmpty || !attachments.isEmpty)
            && text.count <= maxChars
            && !store.isSending
    }

    private func send() {
        HapticFeedback.impact(.light)
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        if attachments.isEmpty {
            if ComposerLogic.isStandaloneModelSlash(trimmed) {
                showModelPicker = true
                draft = ""
                appliedCursorUTF16 = 0
                menuRows = []
                return
            }
            if let mode = ComposerLogic.parseStandaloneModeSlash(trimmed) {
                Task { await store.setInteractionMode(mode) }
                draft = ""
                appliedCursorUTF16 = 0
                menuRows = []
                return
            }
        }

        let text = trimmed
        let uploads = attachments.map { $0.upload }
        draft = ""
        appliedCursorUTF16 = 0
        attachments = []
        pickerItems = []
        menuRows = []
        Task {
            await store.sendMessage(text: text,
                                    attachments: uploads,
                                    fallbackModelSelection: nil)
        }
    }

    private func loadAttachments(_ items: [PhotosPickerItem]) async {
        var loaded: [LocalAttachment] = []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let mime = item.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg"
            let name = "image-\(UUID().uuidString.prefix(6)).\(mime.split(separator: "/").last ?? "jpg")"
            let dataUrl = "data:\(mime);base64,\(data.base64EncodedString())"
            let upload = UploadImage(name: String(name),
                                     mimeType: mime,
                                     sizeBytes: data.count,
                                     dataURL: dataUrl)
            loaded.append(LocalAttachment(upload: upload, preview: data))
            if loaded.count >= maxAttachments { break }
        }
        await MainActor.run {
            attachments = loaded
        }
    }
}

struct LocalAttachment: Identifiable, Equatable {
    let id = UUID()
    let upload: UploadImage
    let preview: Data

    static func == (lhs: LocalAttachment, rhs: LocalAttachment) -> Bool {
        lhs.id == rhs.id
    }
}

struct AttachmentChip: View {
    let attachment: LocalAttachment
    let onRemove: () -> Void

    private let side: CGFloat = 62

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let image = UIImage(data: attachment.preview) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(T3Color.surfaceMuted)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(T3Color.textSecondary)
                        )
                }
            }
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(.white.opacity(0.16), lineWidth: 0.5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(T3Color.separator, lineWidth: 0.5)
            )

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white, .black.opacity(0.68))
            }
            .offset(x: 7, y: -7)
            .accessibilityLabel("Remove image")
        }
    }
}
