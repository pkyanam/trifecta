// FILE: TurnComposerRuntimeActions.swift
// Purpose: Centralizes the composer runtime selection callbacks shared across nested views.
// Layer: View Helper
// Exports: TurnComposerRuntimeActions
// Depends on: CodexService, CodexServiceTier

import Foundation

struct TurnComposerRuntimeActions {
    let selectModel: (String) -> Void
    let selectAutomaticReasoning: () -> Void
    let selectReasoning: (String) -> Void
    let selectServiceTier: (CodexServiceTier?) -> Void
    let selectContextWindow: (String) -> Void

    static func resolve(codex: CodexService, threadId: String?) -> TurnComposerRuntimeActions {
        TurnComposerRuntimeActions(
            selectModel: { modelId in
                let model = codex.availableModels.first { $0.id == modelId || $0.model == modelId }
                codex.setComposerModelSelection(
                    modelId: model?.model ?? modelId,
                    instanceId: model?.providerId,
                    for: threadId
                )
            },
            selectAutomaticReasoning: {
                let descriptorId = codex.reasoningEffortDescriptorId(for: threadId)
                codex.setComposerProviderOption(id: descriptorId, stringValue: nil, for: threadId)
                codex.clearThreadReasoningEffortOverride(for: threadId)
                codex.setSelectedReasoningEffort(nil)
            },
            selectReasoning: { effort in
                let descriptorId = codex.reasoningEffortDescriptorId(for: threadId)
                codex.setComposerProviderOption(
                    id: descriptorId,
                    stringValue: effort,
                    for: threadId
                )
            },
            selectServiceTier: { serviceTier in
                codex.setComposerFastModeEnabled(serviceTier != nil, for: threadId)
            },
            selectContextWindow: { value in
                codex.setComposerProviderOption(
                    id: "contextWindow",
                    stringValue: value,
                    for: threadId
                )
            }
        )
    }
}
