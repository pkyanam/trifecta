import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    var isModal: Bool = true
    @State private var confirmSignOut: Bool = false
    @State private var didCopyURL: Bool = false
    @State private var isRefreshingConfig: Bool = false
    @State private var switchingProfileID: SavedServerProfile.ID?
    @State private var renamingProfile: SavedServerProfile?
    @State private var renameDraft: String = ""
    @State private var pendingDeleteProfile: SavedServerProfile?

    @AppStorage("appearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    @AppStorage("transcriptDensity") private var transcriptDensityRaw: String = TranscriptDensity.comfortable.rawValue
    @AppStorage("composerSize") private var composerSizeRaw: String = ComposerSize.comfortable.rawValue

    var body: some View {
        NavigationStack {
            ZStack {
                T3Color.surfaceGrouped.ignoresSafeArea()

                VStack(spacing: 0) {
                    headerBar
                        .padding(.horizontal, T3Spacing.lg)
                        .padding(.top, T3Spacing.md)
                        .padding(.bottom, T3Spacing.lg)

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: T3Spacing.xl) {
                            connectionSection
                            appearanceSection
                            chatSection
                            archivedThreadsSection
                            serverSection
                            providersSection
                            aboutSection
                            signOutSection
                        }
                        .padding(.horizontal, T3Spacing.lg)
                        .padding(.bottom, T3Spacing.xxxl)
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .navigationBarHidden(true)
            .overlay(alignment: .top) {
                if didCopyURL {
                    Text("URL copied")
                        .font(T3Typography.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, T3Spacing.md)
                        .padding(.vertical, T3Spacing.sm)
                        .background(T3Color.surfaceElevated, in: Capsule())
                        .overlay(Capsule().stroke(T3Color.separator, lineWidth: 0.5))
                        .padding(.top, T3Spacing.sm)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: didCopyURL)
            .confirmationDialog(
                "Sign out of this server?",
                isPresented: $confirmSignOut,
                titleVisibility: .visible
            ) {
                Button("Sign out", role: .destructive) {
                    Task {
                        await env.signOut()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Your bearer token will be removed from this device. Pair again from the desktop app to reconnect.")
            }
            .confirmationDialog("Delete saved server?",
                                isPresented: Binding(get: { pendingDeleteProfile != nil },
                                                     set: { if !$0 { pendingDeleteProfile = nil } }),
                                titleVisibility: .visible,
                                presenting: pendingDeleteProfile) { profile in
                Button("Delete", role: .destructive) {
                    let target = profile
                    pendingDeleteProfile = nil
                    Task { await env.removeProfile(id: target.id) }
                }
                Button("Cancel", role: .cancel) { pendingDeleteProfile = nil }
            } message: { profile in
                Text("Remove \"\(profile.name)\" from this device?")
            }
            .sheet(item: $renamingProfile) { profile in
                NavigationStack {
                    Form {
                        TextField("Server name", text: $renameDraft)
                            .textInputAutocapitalization(.never)
                    }
                    .navigationTitle("Rename Server")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { renamingProfile = nil }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                env.renameProfile(id: profile.id, name: renameDraft)
                                renamingProfile = nil
                            }
                            .disabled(renameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                }
                .presentationDetents([.height(220)])
            }
        }
    }

    // MARK: - Header bar (matches ThreadsListView)

    private var headerBar: some View {
        HStack(spacing: T3Spacing.sm) {
            T3WordmarkLabel()
            Spacer()
            ConnectionPill(state: env.connectionStatus)
            if isModal {
                T3Style.ToolbarChip(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                }
            }
        }
    }

    // MARK: - Connection

    private var connectionSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Connection")
            T3Style.Card {
                VStack(alignment: .leading, spacing: T3Spacing.md) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: T3Spacing.xs) {
                            Text(connectionHeadline)
                                .font(T3Typography.title)
                                .foregroundStyle(T3Color.textPrimary)
                            if case .configured(let url) = env.sessionState {
                                Text(url.host ?? url.absoluteString)
                                    .font(T3Typography.callout)
                                    .foregroundStyle(T3Color.textSecondary)
                                    .lineLimit(1)
                            } else {
                                Text("Not paired with a server")
                                    .font(T3Typography.callout)
                                    .foregroundStyle(T3Color.textSecondary)
                            }
                        }
                        Spacer(minLength: T3Spacing.md)
                        ConnectionPill(state: env.connectionStatus)
                    }

                    if let detail = env.connectionStatus.detail {
                        Text(detail)
                            .font(T3Typography.footnote)
                            .foregroundStyle(T3Color.danger)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if !env.savedProfiles.isEmpty {
                        Divider().overlay(T3Color.separator)
                        VStack(alignment: .leading, spacing: T3Spacing.sm) {
                            Text("Saved servers")
                                .font(T3Typography.callout)
                                .foregroundStyle(T3Color.textSecondary)
                            ForEach(env.savedProfiles.sorted(by: { $0.lastUsedAt > $1.lastUsedAt })) { profile in
                                HStack(spacing: T3Spacing.sm) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(profile.name)
                                            .font(T3Typography.body)
                                            .foregroundStyle(T3Color.textPrimary)
                                            .lineLimit(1)
                                        Text(profile.serverURL.host ?? profile.serverURL.absoluteString)
                                            .font(T3Typography.footnote)
                                            .foregroundStyle(T3Color.textTertiary)
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: T3Spacing.sm)
                                    if env.activeProfileID == profile.id {
                                        T3Style.Pill(text: "Active", tint: T3Color.success, emphasized: true)
                                    } else {
                                        Button {
                                            switchingProfileID = profile.id
                                            Task {
                                                await env.switchToProfile(id: profile.id)
                                                await MainActor.run { switchingProfileID = nil }
                                            }
                                        } label: {
                                            if switchingProfileID == profile.id {
                                                ProgressView()
                                                    .controlSize(.small)
                                            } else {
                                                Text("Switch")
                                                    .font(T3Typography.footnote.weight(.semibold))
                                            }
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(switchingProfileID != nil)
                                    }

                                    Menu {
                                        Button {
                                            renameDraft = profile.name
                                            renamingProfile = profile
                                        } label: {
                                            Label("Rename", systemImage: "pencil")
                                        }
                                        Button(role: .destructive) {
                                            pendingDeleteProfile = profile
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    } label: {
                                        Image(systemName: "ellipsis")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(T3Color.textSecondary)
                                            .frame(width: 28, height: 28)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var connectionHeadline: String {
        switch env.connectionStatus {
        case .connected: "Live"
        case .connecting: "Connecting…"
        case .offline: "Offline"
        case .error: "Needs attention"
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Look & feel")
            T3Style.Card {
                VStack(alignment: .leading, spacing: T3Spacing.lg) {
                    VStack(alignment: .leading, spacing: T3Spacing.sm) {
                        Text("Appearance")
                            .font(T3Typography.callout)
                            .foregroundStyle(T3Color.textSecondary)
                        Picker("Appearance", selection: $appearanceRaw) {
                            ForEach(AppAppearance.allCases) { a in
                                Text(a.label).tag(a.rawValue)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    Divider().overlay(T3Color.separator)

                    VStack(alignment: .leading, spacing: T3Spacing.sm) {
                        Text("Accent")
                            .font(T3Typography.callout)
                            .foregroundStyle(T3Color.textSecondary)
                        HStack(spacing: T3Spacing.md) {
                            ForEach(AppAccent.allCases) { accent in
                                accentSwatch(accent)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    private func accentSwatch(_ accent: AppAccent) -> some View {
        let selected = accentRaw == accent.rawValue
        return Button {
            accentRaw = accent.rawValue
        } label: {
            ZStack {
                Circle()
                    .fill(accent.color)
                    .frame(width: 32, height: 32)
                if selected {
                    Circle()
                        .stroke(T3Color.textPrimary.opacity(0.95), lineWidth: 2)
                        .frame(width: 32, height: 32)
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accent.label)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    // MARK: - Chat experience

    private var chatSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Chat experience")
            T3Style.Card(padding: T3Spacing.md) {
                VStack(spacing: 0) {
                    settingsMenuRow(
                        title: "Transcript density",
                        value: (TranscriptDensity(rawValue: transcriptDensityRaw) ?? .comfortable).label
                    ) {
                        ForEach(TranscriptDensity.allCases) { d in
                            Button(d.label) { transcriptDensityRaw = d.rawValue }
                        }
                    }
                    Divider().overlay(T3Color.separator)
                    settingsMenuRow(
                        title: "Composer height",
                        value: (ComposerSize(rawValue: composerSizeRaw) ?? .comfortable).label
                    ) {
                        ForEach(ComposerSize.allCases) { s in
                            Button(s.label) { composerSizeRaw = s.rawValue }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Archived threads

    private var archivedThreadsSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Threads")
            T3Style.Card(padding: T3Spacing.md) {
                NavigationLink {
                    ArchivedThreadsView()
                        .environment(env)
                } label: {
                    HStack(spacing: T3Spacing.md) {
                        Image(systemName: "archivebox")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(T3Color.textSecondary)
                            .frame(width: 28, height: 28)
                            .background(T3Color.surfaceMuted, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Archived threads")
                                .font(T3Typography.body)
                                .foregroundStyle(T3Color.textPrimary)
                            Text(archivedSubtitle)
                                .font(T3Typography.footnote)
                                .foregroundStyle(T3Color.textTertiary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: T3Spacing.sm)
                        if archivedCount > 0 {
                            Text("\(archivedCount)")
                                .font(T3Typography.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(T3Color.textSecondary)
                                .padding(.horizontal, T3Spacing.sm)
                                .padding(.vertical, 4)
                                .background(T3Color.surfaceMuted, in: Capsule())
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(T3Color.textTertiary)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var archivedCount: Int {
        env.threadList.threads.filter { $0.archivedAt != nil }.count
    }

    private var archivedSubtitle: String {
        if archivedCount == 0 {
            return "No threads archived yet"
        }
        return "\(archivedCount) archived thread\(archivedCount == 1 ? "" : "s")"
    }

    // MARK: - Server

    private var serverSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Server")
            T3Style.Card {
                VStack(alignment: .leading, spacing: T3Spacing.lg) {
                    if case .configured(let url) = env.sessionState {
                        VStack(alignment: .leading, spacing: T3Spacing.sm) {
                            Text("Endpoint")
                                .font(T3Typography.callout)
                                .foregroundStyle(T3Color.textSecondary)
                            Text(url.absoluteString)
                                .font(T3Typography.code)
                                .foregroundStyle(T3Color.textPrimary)
                                .padding(.horizontal, T3Spacing.sm)
                                .padding(.vertical, T3Spacing.sm)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(T3Color.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: T3Radius.sm, style: .continuous))
                                .textSelection(.enabled)
                                .lineLimit(3)
                        }

                        HStack(spacing: T3Spacing.sm) {
                            Button {
                                UIPasteboard.general.string = url.absoluteString
                                didCopyURL = true
                                Task {
                                    try? await Task.sleep(nanoseconds: 1_800_000_000)
                                    didCopyURL = false
                                }
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc")
                                    .font(T3Typography.bodyEmphasis)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 4)
                            }
                            .buttonStyle(.bordered)

                            Button {
                                Task {
                                    isRefreshingConfig = true
                                    await env.refreshServerConfig()
                                    isRefreshingConfig = false
                                }
                            } label: {
                                Group {
                                    if isRefreshingConfig {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Label("Refresh", systemImage: "arrow.clockwise")
                                    }
                                }
                                .font(T3Typography.bodyEmphasis)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 4)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(AppAccent.color(for: accentRaw))
                            .disabled(isRefreshingConfig)
                        }
                    } else {
                        Text("Not connected")
                            .font(T3Typography.body)
                            .foregroundStyle(T3Color.textSecondary)
                    }

                    if let err = env.serverConfigError {
                        Divider().overlay(T3Color.separator)
                        Text(err)
                            .font(T3Typography.footnote)
                            .foregroundStyle(T3Color.danger)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    // MARK: - Providers

    @ViewBuilder
    private var providersSection: some View {
        if let config = env.serverConfig, !config.providers.isEmpty {
            VStack(alignment: .leading, spacing: T3Spacing.sm) {
                T3Style.SectionHeader(title: "Model providers")
                T3Style.Card(padding: T3Spacing.md) {
                    VStack(spacing: 0) {
                        let shown = Array(config.providers.prefix(8))
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, p in
                            providerRow(p)
                            if index < shown.count - 1 {
                                Divider().overlay(T3Color.separator)
                            }
                        }
                    }
                }
                Text("Configured on your desktop server.")
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
                    .padding(.horizontal, T3Spacing.xs)
            }
        }
    }

    private func providerRow(_ p: ServerProvider) -> some View {
        HStack(alignment: .center, spacing: T3Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.label)
                    .font(T3Typography.body)
                    .foregroundStyle(T3Color.textPrimary)
                    .lineLimit(1)
                Text(p.brandDisplayName)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: T3Spacing.sm)
            T3Style.Pill(text: providerStatusLabel(p),
                         tint: providerStatusTint(p),
                         emphasized: true)
        }
        .padding(.vertical, T3Spacing.sm)
    }

    private func providerStatusLabel(_ p: ServerProvider) -> String {
        if p.isUsable { return "Ready" }
        if !p.installed { return "Missing" }
        if !p.enabled { return "Off" }
        return p.auth.status
    }

    private func providerStatusTint(_ p: ServerProvider) -> Color {
        if p.isUsable { return T3Color.success }
        if !p.enabled || !p.installed { return T3Color.textTertiary }
        return T3Color.warning
    }

    // MARK: - About

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "About")
            T3Style.Card(padding: T3Spacing.md) {
                VStack(spacing: 0) {
                    HStack {
                        Text("Version")
                            .font(T3Typography.body)
                            .foregroundStyle(T3Color.textPrimary)
                        Spacer()
                        Text(appVersion)
                            .font(T3Typography.callout)
                            .foregroundStyle(T3Color.textSecondary)
                            .monospacedDigit()
                    }
                    .frame(minHeight: 44)

                }
            }
        }
    }

    // MARK: - Sign out

    private var signOutSection: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            T3Style.SectionHeader(title: "Account")
            T3Style.Card {
                VStack(alignment: .leading, spacing: T3Spacing.md) {
                    Text("Signing out clears the saved server URL and token from this iPhone.")
                        .font(T3Typography.footnote)
                        .foregroundStyle(T3Color.textSecondary)
                    Button(role: .destructive) {
                        confirmSignOut = true
                    } label: {
                        Text("Sign out")
                            .font(T3Typography.bodyEmphasis)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(T3Color.danger)
                }
            }
        }
    }

    // MARK: - Primitives

    private func settingsMenuRow<MenuContent: View>(
        title: String,
        value: String,
        @ViewBuilder menu: () -> MenuContent
    ) -> some View {
        HStack {
            Text(title)
                .font(T3Typography.body)
                .foregroundStyle(T3Color.textPrimary)
            Spacer()
            Menu {
                menu()
            } label: {
                HStack(spacing: T3Spacing.xs) {
                    Text(value)
                        .font(T3Typography.callout)
                        .foregroundStyle(T3Color.textPrimary)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(T3Color.textTertiary)
                }
                .padding(.horizontal, T3Spacing.md)
                .padding(.vertical, 6)
                .background(T3Color.surfaceMuted, in: Capsule())
                .overlay(Capsule().stroke(T3Color.separator, lineWidth: 0.5))
            }
        }
        .frame(minHeight: 44)
        .padding(.horizontal, T3Spacing.xs)
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(v) (\(b))"
    }
}
