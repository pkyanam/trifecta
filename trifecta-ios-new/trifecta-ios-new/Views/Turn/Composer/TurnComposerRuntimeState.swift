// FILE: TurnComposerRuntimeState.swift
// Purpose: Bundles the composer runtime selection state shared by the bottom bar and input context menu.
// Layer: View Helper
// Exports: TurnComposerRuntimeState
// Depends on: CodexService, TurnComposerMetaMapper, CodexServiceTier

import Foundation

struct TurnComposerRuntimeState: Equatable {
    let threadId: String?
    let reasoningDisplayOptions: [TurnComposerReasoningDisplayOption]
    let effectiveReasoningEffort: String?
    let selectedReasoningEffort: String?
    let reasoningMenuDisabled: Bool
    let selectedServiceTier: CodexServiceTier?
    let supportsFastMode: Bool
    let contextWindowDescriptor: ModelProviderSelectDescriptor?
    let selectedContextWindowValue: String?

    var selectedReasoningTitle: String {
        effectiveReasoningEffort.map(TurnComposerMetaMapper.reasoningTitle(for:)) ?? "Select reasoning"
    }

    var showsSpeedBadgeInModelMenu: Bool {
        supportsFastMode && selectedServiceTier != nil
    }

    func isSelectedReasoning(_ effort: String) -> Bool {
        (selectedReasoningEffort ?? effectiveReasoningEffort) == effort
    }

    func isSelectedServiceTier(_ serviceTier: CodexServiceTier?) -> Bool {
        selectedServiceTier == serviceTier
    }

    func isSelectedContextWindow(_ value: String) -> Bool {
        (selectedContextWindowValue ?? contextWindowDescriptor?.currentValue) == value
    }

    static func resolve(
        codex: CodexService,
        threadId: String?,
        reasoningDisplayOptions: [TurnComposerReasoningDisplayOption]
    ) -> TurnComposerRuntimeState {
        let selectedModel = codex.selectedModelOption(for: threadId)
        return TurnComposerRuntimeState(
            threadId: threadId,
            reasoningDisplayOptions: reasoningDisplayOptions,
            effectiveReasoningEffort: codex.selectedReasoningEffortForSelectedModel(threadId: threadId),
            selectedReasoningEffort: codex.effectiveComposerModelSelection(for: threadId)
                .reasoningEffortValue(
                    supportedDescriptorIds: selectedModel?
                        .selectOptionDescriptors
                        .filter(\.isReasoningEffort)
                        .map(\.id) ?? ["reasoningEffort", "effort", "reasoning"]
                ),
            reasoningMenuDisabled: reasoningDisplayOptions.isEmpty || selectedModel == nil,
            selectedServiceTier: codex.effectiveServiceTier(for: threadId),
            supportsFastMode: selectedModel?.supportsServiceTier(.fast) == true,
            contextWindowDescriptor: codex.contextWindowDescriptor(for: threadId),
            selectedContextWindowValue: codex.selectedContextWindowValue(for: threadId)
        )
    }
}
