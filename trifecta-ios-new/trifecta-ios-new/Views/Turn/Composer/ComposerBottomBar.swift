// FILE: ComposerBottomBar.swift
// Purpose: Bottom bar with attachment menu, model picker pill, queue controls, and send button.
// Layer: View Component
// Exports: ComposerBottomBar, TurnComposerVoiceButtonPresentation
// Depends on: SwiftUI, ModelPickerPill

import SwiftUI

struct ComposerBottomBar: View {
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(UserBubbleColor.storageKey) private var userBubbleColorRawValue = UserBubbleColor.defaultStoredRawValue

    // Data
    let orderedModelOptions: [CodexModelOption]
    let selectedModelID: String?
    let selectedModelTitle: String
    let isLoadingModels: Bool
    let isRuntimeSelectionLoading: Bool
    let modelsErrorMessage: String?
    let runtimeState: TurnComposerRuntimeState
    let runtimeActions: TurnComposerRuntimeActions
    let onReloadModels: (() -> Void)?
    let remainingAttachmentSlots: Int
    let isComposerInteractionLocked: Bool
    let isSendDisabled: Bool
    let isSending: Bool
    let isPlanModeArmed: Bool
    let queuedCount: Int
    let isQueuePaused: Bool
    let activeTurnID: String?
    let isThreadRunning: Bool
    let voiceButtonPresentation: TurnComposerVoiceButtonPresentation
    let onTapAddImage: () -> Void
    let onTapTakePhoto: () -> Void
    let onTapVoice: () -> Void
    let onSetPlanModeArmed: (Bool) -> Void
    let onResumeQueue: () -> Void
    let onStopTurn: (String?) -> Void
    let onSend: () -> Void

    // MARK: - Constants

    private let metaLabelColor = Color(.secondaryLabel)
    private var metaTextFont: Font { AppFont.subheadline() }
    private var metaSymbolFont: Font { AppFont.system(size: 11, weight: .regular) }
    private let metaVerticalPadding: CGFloat = 6
    private let plusTapTargetSide: CGFloat = 22

    private var selectedUserBubbleColor: UserBubbleColor {
        UserBubbleColor(rawValue: userBubbleColorRawValue) ?? .default
    }

    private var sendButtonIconColor: Color {
        if isSendDisabled { return Color(.systemGray2) }
        return selectedUserBubbleColor.bubbleForeground(for: colorScheme)
    }

    private var sendButtonBackgroundColor: Color {
        if isSendDisabled { return Color(.systemGray5) }
        return selectedUserBubbleColor.bubbleBackground(for: colorScheme)
    }

    // MARK: - Body

    var body: some View {
        HStack(spacing: 12) {
            attachmentMenu
            ModelPickerPill(
                models: orderedModelOptions,
                selectedModelID: selectedModelID,
                selectedModelTitle: selectedModelTitle,
                isLoadingModels: isLoadingModels,
                isRuntimeSelectionLoading: isRuntimeSelectionLoading,
                modelsErrorMessage: modelsErrorMessage,
                runtimeState: runtimeState,
                runtimeActions: runtimeActions,
                onSelectModel: runtimeActions.selectModel,
                onReloadModels: onReloadModels
            )
            if isPlanModeArmed {
                Divider()
                    .frame(height: 16)
                planModeIndicator
            }
            Spacer(minLength: 0)

            if isQueuePaused && queuedCount > 0 {
                Button {
                    HapticFeedback.shared.triggerImpactFeedback(style: .light)
                    onResumeQueue()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(AppFont.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(.systemBackground))
                        .frame(width: 28, height: 28)
                        .background(Color(.systemGray2), in: Circle())
                }
                .accessibilityLabel("Resume queued messages")
            }

            // Voice -> Stop/loading -> Send. New sends can look running before the turn id is interruptible.
            Button {
                HapticFeedback.shared.triggerImpactFeedback()
                onTapVoice()
            } label: {
                voiceButtonLabel
            }
            .disabled(voiceButtonPresentation.isDisabled)
            .accessibilityLabel(voiceButtonPresentation.accessibilityLabel)

            if isThreadRunning && isSending && activeTurnID == nil {
                ProgressView()
                    .tint(Color(.label))
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Starting run")
            } else if isThreadRunning {
                Button {
                    HapticFeedback.shared.triggerImpactFeedback()
                    onStopTurn(activeTurnID)
                } label: {
                    Image(systemName: "stop.fill")
                        .font(AppFont.system(size: 12, weight: .bold))
                        .foregroundStyle(selectedUserBubbleColor.bubbleForeground(for: colorScheme))
                        .frame(width: 32, height: 32)
                        .background(selectedUserBubbleColor.bubbleBackground(for: colorScheme), in: Circle())
                }
                .accessibilityLabel("Stop current run")
            }

            Button {
                HapticFeedback.shared.triggerImpactFeedback()
                onSend()
            } label: {
                Image(systemName: "arrow.up")
                    .font(AppFont.system(size: 12, weight: .bold))
                    .foregroundStyle(sendButtonIconColor)
                    .frame(width: 32, height: 32)
                    .background(sendButtonBackgroundColor, in: Circle())
            }
            .overlay(alignment: .topTrailing) {
                if queuedCount > 0 {
                    queueBadge
                        .offset(x: 8, y: -8)
                }
            }
            .disabled(isSendDisabled)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
        .padding(.top, 2)
    }

    private var voiceButtonLabel: some View {
        Group {
            if voiceButtonPresentation.showsProgress {
                ProgressView()
                    .tint(voiceButtonPresentation.foregroundColor)
                    .frame(width: 32, height: 32)
                    .background(voiceButtonPresentation.backgroundColor, in: Circle())
            } else if voiceButtonPresentation.hasCircleBackground {
                Image(systemName: voiceButtonPresentation.systemImageName)
                    .font(AppFont.system(size: 12, weight: .bold))
                    .foregroundStyle(voiceButtonPresentation.foregroundColor)
                    .frame(width: 32, height: 32)
                    .background(voiceButtonPresentation.backgroundColor, in: Circle())
            } else {
                Image(systemName: voiceButtonPresentation.systemImageName)
                    .font(metaTextFont)
                    .foregroundStyle(metaLabelColor)
                    .frame(width: plusTapTargetSide, height: plusTapTargetSide)
                    .contentShape(Rectangle())
            }
        }
    }

    // MARK: - Menus

    private var attachmentMenu: some View {
        Menu {
            Toggle(isOn: Binding(
                get: { isPlanModeArmed },
                set: { newValue in
                    HapticFeedback.shared.triggerImpactFeedback(style: .light)
                    onSetPlanModeArmed(newValue)
                }
            )) {
                Label("Plan mode", systemImage: "checklist")
            }

            if runtimeState.supportsFastMode {
                Button {
                    HapticFeedback.shared.triggerImpactFeedback(style: .light)
                    toggleFastMode()
                } label: {
                    Label("Fast Mode", systemImage: fastModePlusMenuIconName)
                }
            }

            Section {
                Button("Photo library") {
                    HapticFeedback.shared.triggerImpactFeedback()
                    onTapAddImage()
                }
                .disabled(remainingAttachmentSlots == 0)

                Button("Take a photo") {
                    HapticFeedback.shared.triggerImpactFeedback()
                    onTapTakePhoto()
                }
                .disabled(remainingAttachmentSlots == 0)
            }
        } label: {
            Image(systemName: "plus")
                .font(metaTextFont)
                .fontWeight(.regular)
                .frame(width: plusTapTargetSide, height: plusTapTargetSide)
                .contentShape(Capsule())
        }
        .tint(metaLabelColor)
        .disabled(isComposerInteractionLocked)
        .accessibilityLabel("Composer options")
    }

    private var planModeIndicator: some View {
        HStack(spacing: 5) {
            Image(systemName: "checklist")
                .font(metaSymbolFont)
            Text("Plan")
                .font(metaTextFont)
                .fontWeight(.regular)
                .lineLimit(1)
        }
        .padding(.vertical, metaVerticalPadding)
        .padding(.horizontal, 4)
        .foregroundStyle(Color(.plan))
    }

    // Toggling Fast Mode from the plus menu mirrors the runtime speed menu without adding another visible pill.
    private func toggleFastMode() {
        runtimeActions.selectServiceTier(runtimeState.isSelectedServiceTier(.fast) ? nil : .fast)
    }

    private var fastModePlusMenuIconName: String {
        runtimeState.isSelectedServiceTier(.fast) ? "bolt.fill" : "bolt"
    }

    private var queueBadge: some View {
        HStack(spacing: 3) {
            if isQueuePaused {
                Image(systemName: "pause.fill")
                    .font(AppFont.system(size: 8, weight: .bold))
            }
            Text("\(queuedCount)")
                .font(AppFont.caption2(weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule().fill(isQueuePaused ? Color(.systemGray3) : Color(.systemGray4))
        )
    }
}


// Keeps the mic button state and styling decisions outside the layout code.
struct TurnComposerVoiceButtonPresentation {
    let systemImageName: String
    let foregroundColor: Color
    let backgroundColor: Color
    let accessibilityLabel: String
    let isDisabled: Bool
    let showsProgress: Bool
    let hasCircleBackground: Bool
}
