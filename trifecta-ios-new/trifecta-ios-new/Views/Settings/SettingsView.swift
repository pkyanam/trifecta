// FILE: SettingsView.swift
// Purpose: Settings for Local Mode (Trifecta runs on the paired computer, relay WebSocket).
// Layer: View
// Exports: SettingsView

import SwiftUI
import UIKit

struct SettingsView: View {
    @AppStorage("codex.appFontStyle") private var appFontStyleRawValue = AppFont.defaultStoredStyleRawValue

    var body: some View {
        List {
            SettingsArchivedChatsCard()
            SettingsAppearanceCard(appFontStyle: appFontStyleBinding)
            SettingsNotificationsCard()
            SettingsRuntimeDefaultsCard()
            SettingsAboutCard()
            SettingsConnectionCard()
        }
        .listStyle(.insetGrouped)
        .font(AppFont.body())
        .tint(.primary)
        .navigationTitle("Settings")
    }

    private var appFontStyleBinding: Binding<AppFont.Style> {
        Binding(
            get: { AppFont.Style(rawValue: appFontStyleRawValue) ?? AppFont.defaultStyle },
            set: { appFontStyleRawValue = $0.rawValue }
        )
    }
}

private struct SettingsAppearanceCard: View {
    @Binding var appFontStyle: AppFont.Style
    @AppStorage("codex.useLiquidGlass") private var useLiquidGlass = true
    @AppStorage(UserBubbleColor.storageKey) private var userBubbleColorRawValue = UserBubbleColor.defaultStoredRawValue
    @AppStorage("codex.appearanceMode") private var appearanceModeRawValue = "system"
    private let settingsAccentColor = Color.primary

    var body: some View {
        SettingsCard(title: "Appearance") {
            Picker("Mode", selection: $appearanceModeRawValue) {
                Text("System").tag("system")
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
            .pickerStyle(.menu)
            .tint(settingsAccentColor)

            Picker("Font", selection: $appFontStyle) {
                ForEach(AppFont.Style.allCases) { style in
                    Text(style.title).tag(style)
                }
            }
            .pickerStyle(.menu)
            .tint(settingsAccentColor)

            HStack {
                Text("Message Bubble")
                Menu {
                    ForEach(UserBubbleColor.allCases) { color in
                        Button {
                            userBubbleColorRawValue = color.rawValue
                        } label: {
                            Label {
                                Text(color.title)
                            } icon: {
                                Image(uiImage: color.menuSwatchImage)
                                    .renderingMode(.original)
                            }
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        Circle()
                            .fill(selectedUserBubbleColor.swatchColor)
                            .frame(width: 14, height: 14)
                    }
                    .frame(maxWidth: .infinity, minHeight: 28, alignment: .trailing)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Message Bubble color")
                .accessibilityValue(selectedUserBubbleColor.title)
                .tint(settingsAccentColor)
            }

            if GlassPreference.isSupported {
                Toggle("Liquid Glass", isOn: $useLiquidGlass)
                    .tint(settingsAccentColor)
            }
        }
    }

    private var selectedUserBubbleColor: UserBubbleColor {
        UserBubbleColor(rawValue: userBubbleColorRawValue) ?? .default
    }
}

private struct SettingsNotificationsCard: View {
    @Environment(CodexService.self) private var codex
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        SettingsCard(title: "Notifications") {
            HStack(spacing: 10) {
                Image(systemName: "bell.badge")
                    .foregroundStyle(.primary)
                Text("Status")
                Spacer()
                Text(statusLabel)
                    .foregroundStyle(.secondary)
            }

            Text("Used for local alerts when a run finishes while the app is in background.")
                .font(AppFont.caption())
                .foregroundStyle(.secondary)

            if codex.notificationAuthorizationStatus == .notDetermined {
                SettingsButton("Allow notifications") {
                    HapticFeedback.shared.triggerImpactFeedback()
                    Task {
                        await codex.requestNotificationPermission()
                    }
                }
            }

            if codex.notificationAuthorizationStatus == .denied {
                SettingsButton("Open iOS Settings") {
                    HapticFeedback.shared.triggerImpactFeedback()
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
        }
        .task {
            await codex.refreshManagedNotificationRegistrationState()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else {
                return
            }
            Task {
                await codex.refreshManagedNotificationRegistrationState()
            }
        }
    }

    private var statusLabel: String {
        switch codex.notificationAuthorizationStatus {
        case .authorized: "Authorized"
        case .denied: "Denied"
        case .provisional: "Provisional"
        case .ephemeral: "Ephemeral"
        case .notDetermined: "Not requested"
        @unknown default: "Unknown"
        }
    }
}

private struct SettingsArchivedChatsCard: View {
    @Environment(CodexService.self) private var codex

    private var archivedCount: Int {
        codex.threads.filter { $0.syncState == .archivedLocal }.count
    }

    var body: some View {
        SettingsCard(title: "Archived Chats") {
            NavigationLink {
                ArchivedChatsView()
            } label: {
                HStack {
                    Label("Archived Chats", systemImage: "archivebox")
                    Spacer()
                    if archivedCount > 0 {
                        Text("\(archivedCount)")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
            .environment(CodexService())
    }
}
