// FILE: ModelPickerSheet.swift
// Purpose: Provider-instance-aware model picker. Ports the legacy trifecta-ios picker layout
//          (horizontal provider chips + sectioned model list with OpenCode bucketing) onto
//          the new app's flat CodexModelOption shape, in iOS 26 Liquid Glass style.
// Layer: View Component
// Exports: ModelPickerSheet, ModelPickerProviderGroup
// Depends on: SwiftUI, CodexModelOption, OpenCodeRoutingBucket, ProviderIcon,
//             TurnComposerRuntimeState, TurnComposerRuntimeActions, TurnComposerMetaMapper

import SwiftUI

struct ModelPickerSheet: View {
    let models: [CodexModelOption]
    let selectedModelID: String?
    let isLoadingModels: Bool
    let modelsErrorMessage: String?
    let runtimeState: TurnComposerRuntimeState
    let runtimeActions: TurnComposerRuntimeActions
    let onSelectModel: (String) -> Void
    let onReloadModels: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var selectedProviderKey: String?
    @State private var hasAutoReloaded = false

    init(
        models: [CodexModelOption],
        selectedModelID: String?,
        isLoadingModels: Bool,
        modelsErrorMessage: String? = nil,
        runtimeState: TurnComposerRuntimeState,
        runtimeActions: TurnComposerRuntimeActions,
        onSelectModel: @escaping (String) -> Void,
        onReloadModels: (() -> Void)? = nil
    ) {
        self.models = models
        self.selectedModelID = selectedModelID
        self.isLoadingModels = isLoadingModels
        self.modelsErrorMessage = modelsErrorMessage
        self.runtimeState = runtimeState
        self.runtimeActions = runtimeActions
        self.onSelectModel = onSelectModel
        self.onReloadModels = onReloadModels
    }

    private var providerGroups: [ModelPickerProviderGroup] {
        ModelPickerProviderGroup.groups(from: models)
    }

    private var selectedProvider: ModelPickerProviderGroup? {
        guard let selectedProviderKey else { return providerGroups.first }
        return providerGroups.first { $0.key == selectedProviderKey } ?? providerGroups.first
    }

    private var selectedModel: CodexModelOption? {
        guard let selectedModelID else { return nil }
        return models.first { $0.id == selectedModelID }
    }

    var body: some View {
        NavigationStack {
            content
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Model")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                            .fontWeight(.medium)
                    }
                }
                .task {
                    if selectedProviderKey == nil {
                        selectedProviderKey = selectedModelID
                            .flatMap { id in models.first(where: { $0.id == id }) }
                            .map(ModelPickerProviderGroup.key(for:))
                            ?? providerGroups.first?.key
                    }
                    // Self-heal: if the sheet opens with no models, kick a refresh once.
                    if models.isEmpty, !isLoadingModels, !hasAutoReloaded, let onReloadModels {
                        hasAutoReloaded = true
                        onReloadModels()
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoadingModels && models.isEmpty {
            ProgressView("Loading models…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if models.isEmpty {
            emptyState
        } else if let provider = selectedProvider {
            VStack(spacing: 0) {
                providerSelector
                Divider().overlay(Color(.separator))
                modelList(for: provider)
                if let model = selectedModel {
                    Divider().overlay(Color(.separator))
                    runtimeFooter(for: model)
                }
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "square.stack.3d.up.slash")
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(Color(.tertiaryLabel))
            VStack(spacing: 6) {
                Text("No models available")
                    .font(AppFont.headline())
                    .foregroundStyle(Color(.label))
                Text(emptyStateDescription)
                    .font(AppFont.subheadline())
                    .foregroundStyle(Color(.secondaryLabel))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            if onReloadModels != nil {
                Button {
                    HapticFeedback.shared.triggerImpactFeedback(style: .light)
                    onReloadModels?()
                } label: {
                    HStack(spacing: 6) {
                        if isLoadingModels {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                        Text(isLoadingModels ? "Refreshing…" : "Try again")
                    }
                    .font(AppFont.body(weight: .medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isLoadingModels)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var emptyStateDescription: String {
        if let modelsErrorMessage, !modelsErrorMessage.isEmpty {
            return modelsErrorMessage
        }
        return "Make sure your Trifecta desktop bridge is connected and has at least one provider configured."
    }

    // MARK: - Provider chips

    @ViewBuilder
    private var providerSelector: some View {
        if providerGroups.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(providerGroups) { provider in
                        providerChip(provider)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        } else {
            EmptyView()
        }
    }

    private func providerChip(_ provider: ModelPickerProviderGroup) -> some View {
        let isSelected = provider.key == selectedProvider?.key
        return Button {
            HapticFeedback.shared.triggerImpactFeedback(style: .light)
            withAnimation(.easeInOut(duration: 0.15)) {
                selectedProviderKey = provider.key
            }
        } label: {
            HStack(spacing: 6) {
                ProviderIcon(driver: provider.driver, size: 14)
                VStack(alignment: .leading, spacing: 1) {
                    Text(provider.brandDisplayName)
                        .font(AppFont.caption(weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(Color(.label))
                    if let instanceLabel = provider.instanceLabel {
                        Text(instanceLabel)
                            .font(AppFont.system(size: 10, weight: .regular))
                            .foregroundStyle(Color(.secondaryLabel))
                            .lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .adaptiveGlass(.regular, in: Capsule(style: .continuous))
            .overlay {
                Capsule(style: .continuous)
                    .stroke(
                        isSelected ? Color.accentColor.opacity(0.55) : Color(.separator),
                        lineWidth: isSelected ? 1.0 : 0.5
                    )
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Model list

    @ViewBuilder
    private func modelList(for provider: ModelPickerProviderGroup) -> some View {
        let sections = provider.sections
        if sections.isEmpty {
            ContentUnavailableView(
                "No models available",
                systemImage: "sparkles",
                description: Text("This provider has not published any selectable models.")
            )
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 16, pinnedViews: [.sectionHeaders]) {
                    ForEach(sections) { section in
                        Section {
                            VStack(spacing: 0) {
                                ForEach(Array(section.models.enumerated()), id: \.element.id) { idx, model in
                                    modelRow(for: model)
                                    if idx < section.models.count - 1 {
                                        Divider()
                                            .overlay(Color(.separator))
                                            .padding(.leading, 16)
                                    }
                                }
                            }
                            .adaptiveGlass(.regular, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(Color(.separator), lineWidth: 0.5)
                            }
                            .padding(.horizontal, 16)
                        } header: {
                            if let title = section.headerTitle {
                                sectionHeader(title)
                            }
                        }
                    }
                }
                .padding(.vertical, 12)
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(AppFont.caption(weight: .semibold))
            .foregroundStyle(Color(.secondaryLabel))
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(.systemGroupedBackground))
    }

    private func modelRow(for model: CodexModelOption) -> some View {
        Button {
            HapticFeedback.shared.triggerImpactFeedback(style: .light)
            onSelectModel(model.id)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(TurnComposerMetaMapper.modelTitle(for: model))
                            .font(AppFont.body(weight: .medium))
                            .foregroundStyle(Color(.label))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        if model.supportsServiceTier(.fast) {
                            Image(systemName: CodexServiceTier.fast.iconName)
                                .font(AppFont.system(size: 11, weight: .regular))
                                .foregroundStyle(Color(.secondaryLabel))
                        }
                    }
                    HStack(spacing: 5) {
                        ProviderIcon(driver: providerDriver(for: model), size: 11)
                        Text(modelSubtitle(for: model))
                            .font(AppFont.caption())
                            .foregroundStyle(Color(.secondaryLabel))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                Spacer(minLength: 8)
                if model.id == selectedModelID {
                    Image(systemName: "checkmark")
                        .font(AppFont.body(weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // Brand · sub-routing · upstream-vendor — mirrors legacy ModelPickerSheet.modelRowSubtitle.
    private func modelSubtitle(for model: CodexModelOption) -> String {
        let brand = ModelPickerProviderGroup.brandDisplayName(for: providerDriver(for: model))
        if model.isOpenCode {
            if let sp = model.subProvider?
                .trimmingCharacters(in: .whitespacesAndNewlines), !sp.isEmpty {
                return "\(brand) · \(sp)"
            }
            if let bucket = model.opencodeRoutingBucket, bucket != .standard {
                return "\(brand) · \(bucket.sectionSuffix)"
            }
        }
        if let upstream = model.opencodeUpstreamVendorLabel {
            return "\(brand) · \(upstream)"
        }
        return brand
    }

    private func providerDriver(for model: CodexModelOption) -> String {
        model.providerDriver
            ?? model.providerId
            ?? model.providerDisplayName
            ?? ""
    }

    // MARK: - Runtime footer (effort + fast mode)

    @ViewBuilder
    private func runtimeFooter(for model: CodexModelOption) -> some View {
        let efforts = runtimeState.reasoningDisplayOptions
        let showsEffort = !efforts.isEmpty && !runtimeState.reasoningMenuDisabled
        let showsFastMode = runtimeState.supportsFastMode
        let contextDescriptor = runtimeState.contextWindowDescriptor
        let showsContextWindow = (contextDescriptor?.options.isEmpty == false)

        if showsEffort || showsFastMode || showsContextWindow {
            VStack(alignment: .leading, spacing: 10) {
                if showsEffort {
                    runtimeRow(title: "Effort") {
                        effortPicker(options: efforts)
                    }
                }
                if showsContextWindow, let contextDescriptor {
                    runtimeRow(title: "Context") {
                        contextWindowPicker(descriptor: contextDescriptor)
                    }
                }
                if showsFastMode {
                    runtimeRow(title: "Speed") {
                        speedPicker
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.systemGroupedBackground))
        }
    }

    @ViewBuilder
    private func runtimeRow<Control: View>(title: String, @ViewBuilder _ control: () -> Control) -> some View {
        HStack(spacing: 10) {
            Text(title)
                .font(AppFont.subheadline(weight: .medium))
                .foregroundStyle(Color(.secondaryLabel))
                .frame(width: 58, alignment: .leading)
            control()
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private func effortPicker(options: [TurnComposerReasoningDisplayOption]) -> some View {
        Picker("Effort", selection: effortSelectionBinding) {
            Text("Auto").tag(Optional<String>.none)
            ForEach(options) { option in
                Text(option.title).tag(Optional(option.effort))
            }
        }
        .pickerStyle(.menu)
        .tint(Color(.label))
    }

    private var effortSelectionBinding: Binding<String?> {
        Binding(
            get: { runtimeState.selectedReasoningEffort },
            set: { newValue in
                HapticFeedback.shared.triggerImpactFeedback(style: .light)
                if let effort = newValue {
                    runtimeActions.selectReasoning(effort)
                } else {
                    runtimeActions.selectAutomaticReasoning()
                }
            }
        )
    }

    private func contextWindowPicker(descriptor: ModelProviderSelectDescriptor) -> some View {
        Picker("Context", selection: contextWindowSelectionBinding(descriptor: descriptor)) {
            ForEach(descriptor.options, id: \.id) { option in
                Text(option.label).tag(Optional(option.id))
            }
        }
        .pickerStyle(.menu)
        .tint(Color(.label))
    }

    private func contextWindowSelectionBinding(
        descriptor: ModelProviderSelectDescriptor
    ) -> Binding<String?> {
        Binding(
            get: {
                runtimeState.selectedContextWindowValue ?? descriptor.currentValue ?? descriptor.options.first?.id
            },
            set: { newValue in
                HapticFeedback.shared.triggerImpactFeedback(style: .light)
                if let newValue {
                    runtimeActions.selectContextWindow(newValue)
                }
            }
        )
    }

    private var speedPicker: some View {
        Picker("Speed", selection: speedSelectionBinding) {
            Text("Normal").tag(Optional<CodexServiceTier>.none)
            ForEach(CodexServiceTier.allCases, id: \.rawValue) { tier in
                Text(tier.displayName).tag(Optional(tier))
            }
        }
        .pickerStyle(.menu)
        .tint(Color(.label))
    }

    private var speedSelectionBinding: Binding<CodexServiceTier?> {
        Binding(
            get: { runtimeState.selectedServiceTier },
            set: { newValue in
                HapticFeedback.shared.triggerImpactFeedback(style: .light)
                runtimeActions.selectServiceTier(newValue)
            }
        )
    }
}

// MARK: - Provider grouping

struct ModelPickerProviderGroup: Identifiable, Equatable {
    let key: String
    let driver: String
    let brandDisplayName: String
    let instanceLabel: String?
    let sections: [ModelPickerProviderSection]

    var id: String { key }

    static func key(for model: CodexModelOption) -> String {
        model.providerId
            ?? model.providerDisplayName
            ?? model.providerDriver
            ?? "default"
    }

    static func groups(from models: [CodexModelOption]) -> [ModelPickerProviderGroup] {
        let grouped = Dictionary(grouping: models) { key(for: $0) }
        return grouped
            .map { ModelPickerProviderGroup(key: $0.key, models: $0.value) }
            .sorted { lhs, rhs in
                let brandCmp = lhs.brandDisplayName.localizedCaseInsensitiveCompare(rhs.brandDisplayName)
                if brandCmp != .orderedSame { return brandCmp == .orderedAscending }
                let lhsLabel = lhs.instanceLabel ?? ""
                let rhsLabel = rhs.instanceLabel ?? ""
                return lhsLabel.localizedCaseInsensitiveCompare(rhsLabel) == .orderedAscending
            }
    }

    init(key: String, models: [CodexModelOption]) {
        self.key = key
        let representative = models.first
        let rawDriver = representative?.providerDriver
            ?? representative?.providerId
            ?? representative?.providerDisplayName
            ?? ""
        self.driver = rawDriver
        self.brandDisplayName = Self.brandDisplayName(for: rawDriver)
        let displayName = representative?.providerDisplayName?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let label = representative?.providerLabel?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // Show the instance label only when it differs from the brand (avoids "OpenAI · OpenAI" noise).
        let candidate = (label?.isEmpty == false ? label : displayName) ?? ""
        let normalizedBrand = Self.brandDisplayName(for: rawDriver)
        self.instanceLabel = (candidate.isEmpty || candidate == normalizedBrand)
            ? nil
            : candidate
        self.sections = Self.sections(driver: rawDriver, models: models)
    }

    // Section grouping logic mirrors the legacy ModelCatalogSection.grouped behavior:
    //   • OpenCode + per-model subProvider field present → group by subProvider
    //   • OpenCode without subProvider → bucket by zen / go / standard via slug prefix
    //   • Other providers → single flat sorted section, no header
    private static func sections(driver: String, models: [CodexModelOption]) -> [ModelPickerProviderSection] {
        let normalizedDriver = driver.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sortedFlat = models.sorted {
            TurnComposerMetaMapper.modelTitle(for: $0).localizedCaseInsensitiveCompare(
                TurnComposerMetaMapper.modelTitle(for: $1)
            ) == .orderedAscending
        }

        guard normalizedDriver == "opencode" else {
            return [ModelPickerProviderSection(id: "all", headerTitle: nil, models: sortedFlat)]
        }

        let subProviderKeys = Set(
            sortedFlat.compactMap {
                $0.subProvider?.trimmingCharacters(in: .whitespacesAndNewlines)
            }.filter { !$0.isEmpty }
        )
        if !subProviderKeys.isEmpty {
            let groups = Dictionary(grouping: sortedFlat) { entry -> String in
                let s = entry.subProvider?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return s.isEmpty ? "__none__" : s
            }
            let orderedKeys = groups.keys.sorted { a, b in
                if a == "__none__" { return false }
                if b == "__none__" { return true }
                return a.localizedCaseInsensitiveCompare(b) == .orderedAscending
            }
            let nonEmptyKeys = orderedKeys.filter { $0 != "__none__" }
            let shouldShowSuffix = nonEmptyKeys.count > 1
                || (orderedKeys.contains("__none__") && !nonEmptyKeys.isEmpty)
            return orderedKeys.map { key in
                let items = (groups[key] ?? []).sorted {
                    TurnComposerMetaMapper.modelTitle(for: $0).localizedCaseInsensitiveCompare(
                        TurnComposerMetaMapper.modelTitle(for: $1)
                    ) == .orderedAscending
                }
                let displayKey = key == "__none__" ? "Other" : key
                return ModelPickerProviderSection(
                    id: key,
                    headerTitle: shouldShowSuffix ? displayKey : nil,
                    models: items
                )
            }
        }

        let buckets = Dictionary(grouping: sortedFlat) { entry -> OpenCodeRoutingBucket in
            entry.opencodeRoutingBucket ?? .standard
        }
        let orderedBuckets = OpenCodeRoutingBucket.allCasesInOrder.filter { buckets[$0] != nil }
        let shouldShowSuffix = !(orderedBuckets.count == 1 && orderedBuckets.first == .standard)
        return orderedBuckets.map { bucket in
            let items = (buckets[bucket] ?? []).sorted {
                TurnComposerMetaMapper.modelTitle(for: $0).localizedCaseInsensitiveCompare(
                    TurnComposerMetaMapper.modelTitle(for: $1)
                ) == .orderedAscending
            }
            return ModelPickerProviderSection(
                id: bucket.rawValue,
                headerTitle: shouldShowSuffix ? bucket.sectionSuffix : nil,
                models: items
            )
        }
    }

    // Same canonical brand mapping as legacy ServerProvider.brandDisplayName.
    static func brandDisplayName(for driver: String) -> String {
        let normalized = driver
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: " ", with: "")
        switch normalized {
        case "claudeagent", "claude", "anthropic", "anthropicchat", "claudecode":
            return "Anthropic"
        case "cursor":
            return "Cursor"
        case "opencode":
            return "OpenCode"
        case "codex", "openai", "openaichat", "openairesponses", "gpt":
            return "OpenAI"
        case "gemini", "googlegemini", "google":
            return "Google"
        case "copilot", "githubcopilot":
            return "GitHub Copilot"
        case "hermesagent", "hermes":
            return "Hermes"
        case "devinagent", "devin":
            return "Devin"
        default:
            return driver
                .replacingOccurrences(of: "([a-z])([A-Z])",
                                       with: "$1 $2",
                                       options: .regularExpression)
                .replacingOccurrences(of: "[-_]+",
                                       with: " ",
                                       options: .regularExpression)
                .capitalized
        }
    }

    static func == (lhs: ModelPickerProviderGroup, rhs: ModelPickerProviderGroup) -> Bool {
        lhs.key == rhs.key
            && lhs.driver == rhs.driver
            && lhs.brandDisplayName == rhs.brandDisplayName
            && lhs.instanceLabel == rhs.instanceLabel
            && lhs.sections == rhs.sections
    }
}

struct ModelPickerProviderSection: Identifiable, Equatable {
    let id: String
    let headerTitle: String?
    let models: [CodexModelOption]
}
