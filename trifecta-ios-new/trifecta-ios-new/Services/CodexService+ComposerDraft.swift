// FILE: CodexService+ComposerDraft.swift
// Purpose: Per-thread composer drafts (model, traits, runtime mode) aligned with trifecta-desktop.
// Layer: Service
// Exports: CodexService composer draft APIs
// Depends on: ComposerModelSelection, ComposerThreadDraft, CodexThread

import Foundation

extension CodexService {
    func composerDraft(for threadId: String?) -> ComposerThreadDraft? {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else {
            return nil
        }
        return composerDraftsByThreadID[normalizedThreadID]
    }

    func hydrateComposerDraft(for threadId: String?) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId),
              let thread = thread(for: normalizedThreadID) else {
            return
        }

        if let existingDraft = composerDraftsByThreadID[normalizedThreadID],
           existingDraft.hasLocalEdits {
            applyComposerDraftToGlobalSelections(existingDraft, threadId: normalizedThreadID)
            return
        }

        let serverSelection = serverModelSelection(for: thread)
        let serverRuntimeMode = serverRuntimeMode(for: thread)
        let draft = ComposerThreadDraft(
            modelSelection: serverSelection,
            runtimeMode: serverRuntimeMode,
            hasLocalEdits: false
        )
        composerDraftsByThreadID[normalizedThreadID] = draft
        applyComposerDraftToGlobalSelections(draft, threadId: normalizedThreadID)
        persistComposerDrafts()
    }

    func setComposerModelSelection(
        modelId: String?,
        instanceId: String?,
        for threadId: String?
    ) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else {
            setSelectedModelId(modelId)
            return
        }

        var draft = composerDraftsByThreadID[normalizedThreadID]
            ?? ComposerThreadDraft(
                modelSelection: serverModelSelection(for: thread(for: normalizedThreadID)),
                runtimeMode: serverRuntimeMode(for: thread(for: normalizedThreadID))
            )

        draft.modelSelection.model = modelId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        draft.modelSelection.instanceId = instanceId?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
            ?? draft.modelSelection.instanceId
        draft.hasLocalEdits = true
        composerDraftsByThreadID[normalizedThreadID] = draft
        applyComposerDraftToGlobalSelections(draft, threadId: normalizedThreadID)
        persistComposerDrafts()
    }

    func setComposerProviderOption(
        id: String,
        stringValue: String?,
        for threadId: String?
    ) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else {
            applyGlobalProviderOption(id: id, stringValue: stringValue)
            return
        }

        var draft = composerDraftsByThreadID[normalizedThreadID]
            ?? ComposerThreadDraft(
                modelSelection: serverModelSelection(for: thread(for: normalizedThreadID)),
                runtimeMode: serverRuntimeMode(for: thread(for: normalizedThreadID))
            )

        let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.modelSelection.options.removeAll {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalizedID.lowercased()
        }

        if let stringValue = stringValue?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
            draft.modelSelection.options.append(
                ProviderOptionSelection(id: normalizedID, stringValue: stringValue)
            )
        }

        draft.hasLocalEdits = true
        composerDraftsByThreadID[normalizedThreadID] = draft
        applyComposerDraftToGlobalSelections(draft, threadId: normalizedThreadID)
        persistComposerDrafts()
    }

    func setComposerFastModeEnabled(_ isEnabled: Bool, for threadId: String?) {
        if isEnabled {
            setComposerProviderBoolOption(id: "fastMode", boolValue: true, for: threadId)
            setThreadServiceTierOverride(.fast, for: threadId)
        } else {
            clearComposerProviderOption(id: "fastMode", for: threadId)
            setThreadServiceTierOverride(nil, for: threadId)
        }
    }

    func setComposerRuntimeMode(_ runtimeMode: CodexAccessMode, for threadId: String?) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else {
            setSelectedAccessMode(runtimeMode)
            return
        }

        var draft = composerDraftsByThreadID[normalizedThreadID]
            ?? ComposerThreadDraft(
                modelSelection: serverModelSelection(for: thread(for: normalizedThreadID)),
                runtimeMode: serverRuntimeMode(for: thread(for: normalizedThreadID))
            )
        draft.runtimeMode = runtimeMode
        draft.hasLocalEdits = true
        composerDraftsByThreadID[normalizedThreadID] = draft
        selectedAccessMode = runtimeMode
        persistComposerDrafts()
    }

    func effectiveComposerModelSelection(for threadId: String?) -> ComposerModelSelection {
        if let normalizedThreadID = normalizedInterruptIdentifier(threadId),
           let draft = composerDraftsByThreadID[normalizedThreadID] {
            return draft.modelSelection
        }

        if let normalizedThreadID = normalizedInterruptIdentifier(threadId),
           let thread = thread(for: normalizedThreadID) {
            return serverModelSelection(for: thread)
        }

        let selectedModel = selectedModelOption()
        return ComposerModelSelection(
            instanceId: selectedModel?.providerId,
            model: selectedModel?.model ?? selectedModelId,
            options: globalProviderOptionSelections()
        )
    }

    func effectiveComposerRuntimeMode(for threadId: String?) -> CodexAccessMode {
        if let normalizedThreadID = normalizedInterruptIdentifier(threadId),
           let draft = composerDraftsByThreadID[normalizedThreadID] {
            return draft.runtimeMode
        }

        if let normalizedThreadID = normalizedInterruptIdentifier(threadId),
           let thread = thread(for: normalizedThreadID) {
            return serverRuntimeMode(for: thread)
        }

        return selectedAccessMode
    }

    func composerModelSelectionPayload(for threadId: String?) -> [String: Any] {
        effectiveComposerModelSelection(for: threadId).toDictionary()
    }

    func composerRuntimeModePayload(for threadId: String?) -> String {
        effectiveComposerRuntimeMode(for: threadId).rawValue
    }

    func selectedModelOption(for threadId: String?) -> CodexModelOption? {
        let selection = effectiveComposerModelSelection(for: threadId)
        if let model = selection.model?.trimmingCharacters(in: .whitespacesAndNewlines), !model.isEmpty {
            if let instanceId = selection.instanceId?.trimmingCharacters(in: .whitespacesAndNewlines),
               !instanceId.isEmpty,
               let providerMatch = availableModelsByProviderAndModel["\(instanceId)|\(model)"] {
                return providerMatch
            }
            if let byId = availableModelsById[model] {
                return byId
            }
            if let byModel = availableModelsByModel[model] {
                return byModel
            }
        }
        return selectedModelOption()
    }

    func supportedReasoningEfforts(for threadId: String?) -> [CodexReasoningEffortOption] {
        selectedModelOption(for: threadId)?.supportedReasoningEfforts ?? []
    }

    func contextWindowDescriptor(for threadId: String?) -> ModelProviderSelectDescriptor? {
        selectedModelOption(for: threadId)?.selectOptionDescriptors.first(where: \.isContextWindow)
    }

    func selectedContextWindowValue(for threadId: String?) -> String? {
        let selection = effectiveComposerModelSelection(for: threadId)
        if let explicit = selection.optionValue(for: "contextWindow") {
            return explicit
        }
        return contextWindowDescriptor(for: threadId)?.currentValue
    }

    func reasoningEffortDescriptorId(for threadId: String?) -> String {
        if let descriptor = selectedModelOption(for: threadId)?
            .selectOptionDescriptors
            .first(where: \.isReasoningEffort) {
            return descriptor.id
        }
        return "reasoningEffort"
    }
}

extension CodexService {
    static let composerDraftsDefaultsKey = "codex.composerDraftsByThreadID"

    func setComposerProviderBoolOption(id: String, boolValue: Bool, for threadId: String?) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else { return }

        var draft = composerDraftsByThreadID[normalizedThreadID]
            ?? ComposerThreadDraft(
                modelSelection: serverModelSelection(for: thread(for: normalizedThreadID)),
                runtimeMode: serverRuntimeMode(for: thread(for: normalizedThreadID))
            )

        let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.modelSelection.options.removeAll {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == normalizedID.lowercased()
        }
        draft.modelSelection.options.append(
            ProviderOptionSelection(id: normalizedID, boolValue: boolValue)
        )
        draft.hasLocalEdits = true
        composerDraftsByThreadID[normalizedThreadID] = draft
        applyComposerDraftToGlobalSelections(draft, threadId: normalizedThreadID)
        persistComposerDrafts()
    }

    func clearComposerProviderOption(id: String, for threadId: String?) {
        guard let normalizedThreadID = normalizedInterruptIdentifier(threadId) else { return }
        guard var draft = composerDraftsByThreadID[normalizedThreadID] else { return }

        let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        draft.modelSelection.options.removeAll {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedID
        }
        draft.hasLocalEdits = true
        composerDraftsByThreadID[normalizedThreadID] = draft
        applyComposerDraftToGlobalSelections(draft, threadId: normalizedThreadID)
        persistComposerDrafts()
    }

    func applyGlobalProviderOption(id: String, stringValue: String?) {
        if id.lowercased().contains("reason") || id.lowercased() == "effort" {
            setSelectedReasoningEffort(stringValue)
            return
        }
        if id.lowercased().contains("fast") {
            setSelectedServiceTier((stringValue == "true") ? .fast : nil)
        }
    }

    func applyComposerDraftToGlobalSelections(_ draft: ComposerThreadDraft, threadId: String) {
        if let model = draft.modelSelection.model {
            setSelectedModelId(model)
        }

        if let effort = draft.modelSelection.reasoningEffortValue(
            supportedDescriptorIds: selectedModelOption(for: threadId)?
                .selectOptionDescriptors
                .filter(\.isReasoningEffort)
                .map(\.id) ?? ["reasoningEffort", "effort", "reasoning"]
        ) {
            setThreadReasoningEffortOverride(effort, for: threadId)
        } else {
            clearThreadReasoningEffortOverride(for: threadId)
            setSelectedReasoningEffort(nil)
        }

        if let fastMode = draft.modelSelection.boolOptionValue(for: "fastMode") {
            if fastMode {
                setThreadServiceTierOverride(.fast, for: threadId)
            } else {
                setThreadServiceTierOverride(nil, for: threadId)
            }
        }

        selectedAccessMode = draft.runtimeMode
    }

    func serverModelSelection(for thread: CodexThread?) -> ComposerModelSelection {
        guard let thread else {
            return ComposerModelSelection(
                instanceId: selectedModelOption()?.providerId,
                model: selectedModelId
            )
        }

        if let metadata = thread.metadata,
           let rawSelection = metadata["modelSelection"]?.objectValue {
            var dictionary: [String: Any] = [:]
            for (key, value) in rawSelection {
                dictionary[key] = value.jsonObjectValue
            }
            let parsed = ComposerModelSelection.from(dictionary: dictionary)
            if parsed.model != nil || parsed.instanceId != nil || !parsed.options.isEmpty {
                return parsed
            }
        }

        return ComposerModelSelection(
            instanceId: thread.modelProvider,
            model: thread.model,
            options: []
        )
    }

    func serverRuntimeMode(for thread: CodexThread?) -> CodexAccessMode {
        guard let thread,
              let metadata = thread.metadata,
              let rawMode = metadata["runtimeMode"]?.stringValue else {
            return selectedAccessMode
        }
        return CodexAccessMode(canonicalRawValue: rawMode) ?? selectedAccessMode
    }

    func globalProviderOptionSelections() -> [ProviderOptionSelection] {
        var options: [ProviderOptionSelection] = []
        if let effort = selectedReasoningEffort {
            options.append(ProviderOptionSelection(id: "reasoningEffort", stringValue: effort))
        }
        if let tier = effectiveServiceTier(), tier == .fast {
            options.append(ProviderOptionSelection(id: "fastMode", boolValue: true))
        }
        return options
    }

    func persistComposerDrafts() {
        guard !composerDraftsByThreadID.isEmpty,
              let encoded = try? encoder.encode(composerDraftsByThreadID) else {
            defaults.removeObject(forKey: Self.composerDraftsDefaultsKey)
            return
        }
        defaults.set(encoded, forKey: Self.composerDraftsDefaultsKey)
    }

    func loadComposerDraftsFromDefaults() {
        guard let data = defaults.data(forKey: Self.composerDraftsDefaultsKey),
              let decoded = try? decoder.decode([String: ComposerThreadDraft].self, from: data) else {
            composerDraftsByThreadID = [:]
            return
        }
        composerDraftsByThreadID = decoded
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
