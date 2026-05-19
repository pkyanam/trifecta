// FILE: ModelPickerPill.swift
// Purpose: Compact trigger button that opens ModelPickerSheet. Shows the selected provider's
//          glyph, the current model title, and a chevron — same single-tap UX as legacy
//          trifecta-ios.
// Layer: View Component
// Exports: ModelPickerPill
// Depends on: SwiftUI, CodexModelOption, ModelPickerSheet, ProviderIcon,
//             TurnComposerRuntimeState, TurnComposerRuntimeActions

import SwiftUI

struct ModelPickerPill: View {
    let models: [CodexModelOption]
    let selectedModelID: String?
    let selectedModelTitle: String
    let isLoadingModels: Bool
    let isRuntimeSelectionLoading: Bool
    let modelsErrorMessage: String?
    let runtimeState: TurnComposerRuntimeState
    let runtimeActions: TurnComposerRuntimeActions
    let onSelectModel: (String) -> Void
    let onReloadModels: (() -> Void)?

    @State private var isSheetPresented = false

    init(
        models: [CodexModelOption],
        selectedModelID: String?,
        selectedModelTitle: String,
        isLoadingModels: Bool,
        isRuntimeSelectionLoading: Bool,
        modelsErrorMessage: String? = nil,
        runtimeState: TurnComposerRuntimeState,
        runtimeActions: TurnComposerRuntimeActions,
        onSelectModel: @escaping (String) -> Void,
        onReloadModels: (() -> Void)? = nil
    ) {
        self.models = models
        self.selectedModelID = selectedModelID
        self.selectedModelTitle = selectedModelTitle
        self.isLoadingModels = isLoadingModels
        self.isRuntimeSelectionLoading = isRuntimeSelectionLoading
        self.modelsErrorMessage = modelsErrorMessage
        self.runtimeState = runtimeState
        self.runtimeActions = runtimeActions
        self.onSelectModel = onSelectModel
        self.onReloadModels = onReloadModels
    }

    private let metaLabelColor = Color(.secondaryLabel)
    private var metaTextFont: Font { AppFont.subheadline() }
    private var metaSymbolFont: Font { AppFont.system(size: 11, weight: .regular) }
    private var metaChevronFont: Font { AppFont.system(size: 9, weight: .regular) }

    private var selectedModel: CodexModelOption? {
        guard let selectedModelID else { return nil }
        return models.first { $0.id == selectedModelID }
    }

    private var providerDriver: String? {
        selectedModel.map {
            $0.providerDriver
                ?? $0.providerId
                ?? $0.providerDisplayName
                ?? ""
        }
    }

    private var compactTitle: String {
        if selectedModelID == nil {
            return isRuntimeSelectionLoading ? "Loading…" : "Select model"
        }
        return selectedModelTitle
    }

    var body: some View {
        Button {
            HapticFeedback.shared.triggerImpactFeedback(style: .light)
            isSheetPresented = true
        } label: {
            HStack(spacing: 6) {
                if let driver = providerDriver, !driver.isEmpty {
                    ProviderIcon(driver: driver, size: 13)
                }
                Text(compactTitle)
                    .font(metaTextFont)
                    .fontWeight(.regular)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                Image(systemName: "chevron.down")
                    .font(metaChevronFont)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 4)
            .foregroundStyle(metaLabelColor)
            .fixedSize(horizontal: true, vertical: false)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Choose model")
        .sheet(isPresented: $isSheetPresented) {
            ModelPickerSheet(
                models: models,
                selectedModelID: selectedModelID,
                isLoadingModels: isLoadingModels,
                modelsErrorMessage: modelsErrorMessage,
                runtimeState: runtimeState,
                runtimeActions: runtimeActions,
                onSelectModel: onSelectModel,
                onReloadModels: onReloadModels
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
