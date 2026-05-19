// FILE: SettingsRuntimeDefaultsCard.swift
// Purpose: Presents default model, reasoning, speed, access, and git-writer settings.
// Layer: Settings UI component
// Exports: SettingsRuntimeDefaultsCard
// Depends on: SwiftUI, CodexService runtime configuration, TurnComposerMetaMapper,
//             ModelPickerSheet, ProviderIcon

import SwiftUI

struct SettingsRuntimeDefaultsCard: View {
    @Environment(CodexService.self) private var codex
    @State private var isModelPickerPresented = false

    private let runtimeAutoValue = "__AUTO__"
    private let runtimeNormalValue = "__NORMAL__"
    private let settingsAccentColor = Color.primary

    var body: some View {
        SettingsCard(title: "Runtime defaults") {
            modelRow

            Picker("Reasoning", selection: runtimeReasoningSelection) {
                Text("Auto").tag(runtimeAutoValue)
                ForEach(runtimeReasoningOptions, id: \.id) { option in
                    Text(option.title).tag(option.effort)
                }
            }
            .pickerStyle(.menu)
            .tint(settingsAccentColor)
            .disabled(runtimeReasoningOptions.isEmpty)

            if codex.selectedModelSupportsServiceTier(.fast) {
                Picker("Speed", selection: runtimeServiceTierSelection) {
                    Text("Normal").tag(runtimeNormalValue)
                    ForEach(CodexServiceTier.allCases, id: \.rawValue) { tier in
                        Text(tier.displayName).tag(tier.rawValue)
                    }
                }
                .pickerStyle(.menu)
                .tint(settingsAccentColor)
            }

            Picker("Access", selection: runtimeAccessSelection) {
                ForEach(CodexAccessMode.allCases, id: \.self) { mode in
                    Text(mode.displayName).tag(mode)
                }
            }
            .pickerStyle(.menu)
            .tint(settingsAccentColor)

            Picker("Git writer model", selection: gitWriterModelSelection) {
                ForEach(gitWriterModelOptions, id: \.id) { model in
                    Text(TurnComposerMetaMapper.modelTitle(for: model))
                        .tag(model.id)
                }
            }
            .pickerStyle(.menu)
            .tint(settingsAccentColor)
            .disabled(gitWriterModelOptions.isEmpty)

            Text("Used for AI-generated commit messages and PR drafts. Defaults to GPT-5.4 Mini when available.")
                .font(AppFont.caption())
                .foregroundStyle(.secondary)
        }
    }

    private var modelRow: some View {
        Button {
            HapticFeedback.shared.triggerImpactFeedback(style: .light)
            isModelPickerPresented = true
        } label: {
            HStack(spacing: 12) {
                Text("Model")
                    .foregroundStyle(Color(.label))
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    if let driver = selectedProviderDriver, !driver.isEmpty {
                        ProviderIcon(driver: driver, size: 13)
                    }
                    Text(selectedModelDisplayTitle)
                        .foregroundStyle(Color(.secondaryLabel))
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(AppFont.system(size: 11, weight: .regular))
                        .foregroundStyle(Color(.tertiaryLabel))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $isModelPickerPresented) {
            ModelPickerSheet(
                models: runtimeModelOptions,
                selectedModelID: codex.selectedModelOption()?.id,
                isLoadingModels: codex.isLoadingModels,
                modelsErrorMessage: codex.modelsErrorMessage,
                runtimeState: TurnComposerRuntimeState.resolve(
                    codex: codex,
                    threadId: nil,
                    reasoningDisplayOptions: runtimeReasoningOptions
                ),
                runtimeActions: TurnComposerRuntimeActions.resolve(codex: codex, threadId: nil),
                onSelectModel: { modelID in
                    codex.setSelectedModelId(modelID)
                },
                onReloadModels: { Task { try? await codex.listModels() } }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var selectedModelDisplayTitle: String {
        if let model = codex.selectedModelOption() {
            return TurnComposerMetaMapper.modelTitle(for: model)
        }
        return "Auto"
    }

    private var selectedProviderDriver: String? {
        guard let model = codex.selectedModelOption() else { return nil }
        return model.providerDriver ?? model.providerId ?? model.providerDisplayName
    }

    private var runtimeModelOptions: [CodexModelOption] {
        TurnComposerMetaMapper.orderedModels(from: codex.availableModels)
    }

    private var runtimeReasoningOptions: [TurnComposerReasoningDisplayOption] {
        TurnComposerMetaMapper.reasoningDisplayOptions(
            from: codex.supportedReasoningEffortsForSelectedModel().map(\.reasoningEffort)
        )
    }

    private var runtimeReasoningSelection: Binding<String> {
        Binding(
            get: { codex.selectedReasoningEffort ?? runtimeAutoValue },
            set: { selection in
                codex.setSelectedReasoningEffort(selection == runtimeAutoValue ? nil : selection)
            }
        )
    }

    private var runtimeAccessSelection: Binding<CodexAccessMode> {
        Binding(
            get: { codex.selectedAccessMode },
            set: { codex.setSelectedAccessMode($0) }
        )
    }

    private var runtimeServiceTierSelection: Binding<String> {
        Binding(
            get: { codex.selectedServiceTier?.rawValue ?? runtimeNormalValue },
            set: { selection in
                codex.setSelectedServiceTier(
                    selection == runtimeNormalValue ? nil : CodexServiceTier(rawValue: selection)
                )
            }
        )
    }

    private var gitWriterModelOptions: [CodexModelOption] {
        TurnComposerMetaMapper.orderedModels(from: codex.availableModels)
    }

    private var gitWriterModelSelection: Binding<String> {
        Binding(
            get: { codex.selectedGitWriterModelOption()?.id ?? gitWriterModelOptions.first?.id ?? "" },
            set: { codex.setSelectedGitWriterModelId($0.isEmpty ? nil : $0) }
        )
    }
}
