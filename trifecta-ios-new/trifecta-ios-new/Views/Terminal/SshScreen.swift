// FILE: SshScreen.swift
// Purpose: SSH terminal screen backed by the Trifecta desktop bridge SSH RPCs.
// Layer: View
// Exports: SshScreen

import Foundation
import SwiftUI

struct SshScreen: View {
    @Environment(CodexService.self) private var codex
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var hosts: [SshHostProfile] = []
    @State private var selectedHostId: String?
    @State private var session: SshSessionSnapshot?
    @State private var subscriptionId: String?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showAddHost = false
    @State private var pendingHostKeyPrompt: SshHostKeyPrompt?
    @State private var shellProfileResult: SshShellProfileResult?
    @State private var showShellProfileAlert = false
    @State private var showKeychainBanner = false
    @State private var terminalBuffer = Data()
    @State private var terminalCols = 80
    @State private var terminalRows = 24
    @State private var pendingInputBuffer = ""
    @State private var pendingInputFlushTask: Task<Void, Never>?
    @State private var pendingResizeTask: Task<Void, Never>?
    @AppStorage("codex.terminal.fontSize") private var terminalFontSize = trifectaTerminalDefaultFontSize

    private var selectedHost: SshHostProfile? {
        guard let selectedHostId else { return hosts.first }
        return hosts.first { $0.id == selectedHostId } ?? hosts.first
    }

    private var hasLiveSession: Bool {
        session?.status.isLive == true
    }

    private var theme: TrifectaTerminalTheme {
        TrifectaTerminalTheme.resolved(for: colorScheme)
    }

    private var terminalKey: String {
        session?.sessionId ?? "idle"
    }

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                if !codex.isTrifectaDesktopSSHAvailable {
                    disconnectedView
                } else {
                    hostBar
                    Divider()
                    if hasLiveSession {
                        ZStack {
                            Color(hexString: theme.background)
                                .ignoresSafeArea()
                            terminalArea
                        }
                        .clipped()
                        keychainBanner
                        hostKeyApprovalPanel
                        terminalKeyBar
                    } else {
                        placeholderView
                    }
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .navigationTitle("SSH")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("Back")
            }

            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 4) {
                    Menu {
                        Button {
                            Task { await setupShellProfile() }
                        } label: {
                            Label("Setup Keychain Unlock", systemImage: "key.horizontal")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .disabled(!codex.isTrifectaDesktopSSHAvailable || hasLiveSession)

                    Button {
                        showAddHost = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(!codex.isTrifectaDesktopSSHAvailable)
                }
            }
        }
        .task {
            await refreshHosts()
        }
        .sheet(isPresented: $showAddHost) {
            NavigationStack {
                SshAddHostView { input in
                    await addHost(input)
                }
            }
        }
        .alert("SSH Error", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .alert("Shell Profile Setup", isPresented: $showShellProfileAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            if let result = shellProfileResult {
                if result.alreadyPresent {
                    Text("Keychain unlock snippet already present in your \(result.shellProfile).")
                } else {
                    Text("Added keychain unlock snippet to your \(result.shellProfile). SSH sessions will now unlock your keychain automatically.")
                }
            } else {
                Text("Shell profile updated.")
            }
        }
        .onDisappear {
            Task { await tearDownSession(closeRemote: true) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                Task { await tearDownSession(closeRemote: true) }
            }
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var keychainBanner: some View {
        if showKeychainBanner {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "lock.sha256")
                        .foregroundStyle(.cyan)
                    Text("macOS Keychain Unlock")
                        .font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Button {
                        withAnimation { showKeychainBanner = false }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.secondary)
                    }
                }
                Text("Type your Mac login password to unlock the keychain. Claude Code stores its credentials in the macOS Keychain, which stays locked during SSH sessions until you unlock it.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .background(.cyan.opacity(0.1))
            .overlay(alignment: .top) {
                Rectangle().fill(.cyan.opacity(0.3)).frame(height: 1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    @ViewBuilder
    private var hostKeyApprovalPanel: some View {
        if let prompt = pendingHostKeyPrompt {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "key.horizontal").foregroundStyle(.yellow)
                    Text("Trust SSH host key?").font(.system(size: 15, weight: .semibold))
                    Spacer()
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(prompt.hostname):\(prompt.port)")
                        .font(.system(.footnote, design: .monospaced))
                    Text(prompt.keyType)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Text(prompt.fingerprintSha256)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                HStack(spacing: 8) {
                    Button("Reject", role: .destructive) {
                        Task { await respondToHostKey(approve: false, remember: false) }
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                    Button("Trust Once") {
                        Task { await respondToHostKey(approve: true, remember: false) }
                    }
                    .buttonStyle(.bordered)
                    Button("Remember") {
                        Task { await respondToHostKey(approve: true, remember: true) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(12)
            .background(.yellow.opacity(0.13))
            .overlay(alignment: .top) {
                Rectangle().fill(.yellow.opacity(0.35)).frame(height: 1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if session?.status == .pendingHostKey {
            VStack(alignment: .leading, spacing: 6) {
                Text("Waiting for host key details").font(.system(size: 15, weight: .semibold))
                Text("Close and reconnect after updating Desktop if this does not change.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.yellow.opacity(0.1))
        }
    }

    private var disconnectedView: some View {
        ContentUnavailableView(
            "Desktop server offline",
            systemImage: "wifi.slash",
            description: Text("Pair or reconnect to Trifecta Desktop before opening SSH.")
        )
    }

    private var hostBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Menu {
                    ForEach(hosts) { host in
                        Button {
                            selectedHostId = host.id
                        } label: {
                            if host.id == selectedHost?.id {
                                Label(hostMenuTitle(host), systemImage: "checkmark")
                            } else {
                                Text(hostMenuTitle(host))
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(selectedHost?.label ?? "No host")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Text(selectedHost.map { "\($0.username)@\($0.hostname):\($0.port)" } ?? "Add an SSH host")
                                .font(.system(size: 12, weight: .medium, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.78)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .frame(minWidth: 0, maxWidth: .infinity)
                .layoutPriority(1)
                .disabled(hosts.isEmpty || hasLiveSession)

                Button {
                    Task { await refreshHosts() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isLoading)

                Button {
                    Task { await removeSelectedHost() }
                } label: {
                    Image(systemName: "trash")
                }
                .disabled(selectedHost == nil || hasLiveSession || isLoading)

                Button {
                    if hasLiveSession {
                        Task { await tearDownSession(closeRemote: true) }
                    } else {
                        connectSelectedHost()
                    }
                } label: {
                    Label(hasLiveSession ? "Disconnect" : "Connect",
                          systemImage: hasLiveSession ? "xmark.circle.fill" : "terminal")
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedHost == nil || isLoading)
                .labelStyle(.iconOnly)
            }

            if hosts.isEmpty {
                Button {
                    showAddHost = true
                } label: {
                    Label("Add SSH Host", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }

            if selectedHost?.username == "mobile" {
                Label("This host is using the iPhone user `mobile`; reconnect with your macOS username.",
                      systemImage: "exclamationmark.triangle")
                    .font(.system(size: 12))
                    .foregroundStyle(.yellow)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(.systemBackground))
    }

    private var terminalArea: some View {
        GhosttyTerminalSurface(
            terminalKey: terminalKey,
            buffer: terminalBuffer,
            fontSize: CGFloat(terminalFontSize),
            colorScheme: colorScheme,
            theme: theme,
            onInput: { data in
                let text = String(data: data, encoding: .utf8) ?? ""
                guard !text.isEmpty else { return }
                enqueueTerminalInput(text)
            },
            onResize: { cols, rows in
                scheduleTerminalResize(cols: cols, rows: rows)
            }
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 4)
        .padding(.vertical, 6)
    }

    private var terminalKeyBar: some View {
        SshTerminalKeyBar(
            sendKey: { keySequence in
                flushPendingTerminalInput()
                Task { await sendRaw(keySequence) }
            },
            dismissKeyboard: dismissSystemKeyboard
        )
    }

    private var placeholderView: some View {
        VStack(spacing: 12) {
            Image(systemName: "terminal")
                .font(.system(size: 36))
                .foregroundStyle(.tertiary)
            Text("Select a host and tap Connect")
                .font(.body)
                .foregroundStyle(.secondary)
            if isLoading {
                ProgressView().padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hexString: theme.background))
    }

    // MARK: - Actions

    private func refreshHosts() async {
        isLoading = true
        do {
            let nextHosts = try await codex.sshListHosts()
            hosts = nextHosts
            if selectedHostId == nil || !nextHosts.contains(where: { $0.id == selectedHostId }) {
                selectedHostId = nextHosts.first?.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func addHost(_ input: SshAddHostInput) async {
        do {
            let host = try await codex.sshAddHost(
                label: input.label,
                hostname: input.hostname,
                port: input.port,
                username: input.username,
                authMethod: input.authMethod
            )
            hosts.append(host)
            selectedHostId = host.id
            showAddHost = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func connectSelectedHost() {
        guard let host = selectedHost, !isLoading else { return }
        isLoading = true
        Task { await connectToHost(host) }
    }

    private func connectToHost(_ host: SshHostProfile) async {
        if session != nil || subscriptionId != nil {
            await tearDownSession(closeRemote: true)
        }

        terminalBuffer = Data()
        pendingHostKeyPrompt = nil

        do {
            let result = try await codex.sshOpenSession(
                hostId: host.id,
                cols: terminalCols,
                rows: terminalRows
            )
            let subId = try await codex.sshSubscribeTerminal(sessionId: result.snapshot.sessionId) { event in
                Task { @MainActor in self.handle(event) }
            }
            session = result.snapshot
            subscriptionId = subId
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    @MainActor
    private func handle(_ event: SshTerminalEvent) {
        switch event {
        case .status(let snapshot):
            switch snapshot.status {
            case .closed, .error:
                session = nil
                subscriptionId = nil
                pendingHostKeyPrompt = nil
                showKeychainBanner = false
            case .pendingHostKey, .authenticating, .running:
                session = snapshot
            }
        case .output(let text):
            if let data = text.data(using: .utf8) {
                terminalBuffer.append(data)
            }
            if text.localizedCaseInsensitiveContains("unlock") &&
                (text.localizedCaseInsensitiveContains("keychain") || text.localizedCaseInsensitiveContains("login.keychain")) {
                if !showKeychainBanner {
                    withAnimation { showKeychainBanner = true }
                }
            }
        case .hostKeyPrompt(let prompt):
            pendingHostKeyPrompt = prompt
            let msg = "\n[ssh] host key approval required for \(prompt.hostname):\(prompt.port)\n"
            if let data = msg.data(using: .utf8) { terminalBuffer.append(data) }
        case .error(let message):
            errorMessage = message
            let msg = "\n[ssh error] \(message)\n"
            if let data = msg.data(using: .utf8) { terminalBuffer.append(data) }
            if message.localizedCaseInsensitiveContains("permission denied") {
                let hint = "[ssh] Public-key auth failed. Make sure this Mac has a key loaded in ssh-agent or its public key in ~/.ssh/authorized_keys.\n"
                if let data = hint.data(using: .utf8) { terminalBuffer.append(data) }
            }
        case .exited(let exitCode):
            let msg = "\n[ssh exited \(exitCode.map(String.init) ?? "without status")]\n"
            if let data = msg.data(using: .utf8) { terminalBuffer.append(data) }
            session = nil
            subscriptionId = nil
            showKeychainBanner = false
        }
    }

    private func respondToHostKey(approve: Bool, remember: Bool) async {
        guard let prompt = pendingHostKeyPrompt else { return }
        do {
            let snapshot = try await codex.sshConfirmHostKey(
                sessionId: prompt.sessionId,
                fingerprintSha256: prompt.fingerprintSha256,
                approve: approve,
                remember: remember
            )
            session = snapshot
            pendingHostKeyPrompt = nil
            let msg = "[ssh] host key \(approve ? "accepted" : "rejected")\n"
            if let data = msg.data(using: .utf8) { terminalBuffer.append(data) }
        } catch {
            pendingHostKeyPrompt = nil
            errorMessage = error.localizedDescription
        }
    }

    private func sendRaw(_ text: String) async {
        guard let current = session, current.status == .running else { return }
        let sessionId = current.sessionId
        if showKeychainBanner && text.contains("\n") {
            withAnimation { showKeychainBanner = false }
        }
        do {
            try await codex.sshSendInput(sessionId: sessionId, data: text)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func enqueueTerminalInput(_ text: String) {
        guard !text.isEmpty else { return }
        if shouldSendTerminalInputImmediately(text) {
            flushPendingTerminalInput()
            Task { await sendRaw(text) }
            return
        }

        pendingInputBuffer += text
        pendingInputFlushTask?.cancel()
        pendingInputFlushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 18_000_000)
            guard !Task.isCancelled else { return }
            flushPendingTerminalInput()
        }
    }

    private func flushPendingTerminalInput() {
        pendingInputFlushTask?.cancel()
        pendingInputFlushTask = nil
        let buffered = pendingInputBuffer
        pendingInputBuffer = ""
        guard !buffered.isEmpty else { return }
        Task { await sendRaw(buffered) }
    }

    private func shouldSendTerminalInputImmediately(_ text: String) -> Bool {
        text.unicodeScalars.contains { scalar in
            scalar.value == 0x7F || scalar.value == 0x1B || scalar.value == 0x0D || scalar.value == 0x0A || scalar.value < 0x20
        }
    }

    private func dismissSystemKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }

    private func sendResize(cols: Int, rows: Int) async {
        guard let sessionId = session?.sessionId else { return }
        try? await codex.sshResize(sessionId: sessionId, cols: cols, rows: rows)
    }

    private func scheduleTerminalResize(cols: Int, rows: Int) {
        guard cols > 0, rows > 0 else { return }
        pendingResizeTask?.cancel()
        pendingResizeTask = Task { @MainActor in
            await Task.yield()
            guard !Task.isCancelled else { return }
            terminalCols = cols
            terminalRows = rows
            if hasLiveSession {
                await sendResize(cols: cols, rows: rows)
            }
        }
    }

    private func tearDownSession(closeRemote: Bool) async {
        pendingResizeTask?.cancel()
        pendingResizeTask = nil
        flushPendingTerminalInput()
        let currentSubId = subscriptionId
        let currentSessionId = session?.sessionId
        session = nil
        subscriptionId = nil
        pendingHostKeyPrompt = nil
        if let subId = currentSubId {
            await codex.sshCancelSubscription(requestId: subId)
        }
        guard closeRemote, let sessionId = currentSessionId else { return }
        try? await codex.sshCloseSession(sessionId: sessionId)
    }

    private func removeSelectedHost() async {
        guard let host = selectedHost else { return }
        do {
            try await codex.sshRemoveHost(hostId: host.id)
            hosts.removeAll { $0.id == host.id }
            selectedHostId = hosts.first?.id
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func hostMenuTitle(_ host: SshHostProfile) -> String {
        "\(host.label)  \(host.username)@\(host.hostname):\(host.port)"
    }

    private func setupShellProfile() async {
        do {
            let result = try await codex.sshSetupShellProfile()
            shellProfileResult = result
            showShellProfileAlert = true
        } catch {
            errorMessage = "Failed to update shell profile: \(error.localizedDescription)"
        }
    }
}

// MARK: - Add Host

struct SshAddHostInput {
    var label: String
    var hostname: String
    var port: Int
    var username: String
    var authMethod: SshAuthMethod
}

struct SshAddHostView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var label = "My Mac"
    @State private var hostname = "127.0.0.1"
    @State private var port = "22"
    @State private var username = ""
    @State private var authMethod: SshAuthMethod = .agentForward
    @State private var errorMessage: String?

    let onSave: (SshAddHostInput) async -> Void

    var body: some View {
        Form {
            Section("Host") {
                TextField("Label", text: $label)
                TextField("Hostname", text: $hostname)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Port", text: $port)
                    .keyboardType(.numberPad)
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section("Authentication") {
                Picker("Method", selection: $authMethod) {
                    ForEach(SshAuthMethod.allCases) { method in
                        Text(method.label).tag(method)
                    }
                }
                Text(authMethod.note)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Section {
                Button {
                    save()
                } label: {
                    Label("Save Host", systemImage: "checkmark")
                }
                .disabled(!canSave)
            } footer: {
                Text("Use SSH Agent or Keychain Key for current testing. Password auth is not fully wired on Desktop yet.")
            }
        }
        .navigationTitle("Add SSH Host")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
        }
        .alert("Invalid Host", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var canSave: Bool {
        !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !hostname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && Int(port).map { (1...65_535).contains($0) } == true
    }

    private func save() {
        guard let parsedPort = Int(port), (1...65_535).contains(parsedPort) else {
            errorMessage = "Port must be between 1 and 65535."
            return
        }
        let input = SshAddHostInput(
            label: label.trimmingCharacters(in: .whitespacesAndNewlines),
            hostname: hostname.trimmingCharacters(in: .whitespacesAndNewlines),
            port: parsedPort,
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            authMethod: authMethod
        )
        Task { await onSave(input) }
    }
}

// MARK: - Key Bar

private struct SshTerminalKeyBar: View {
    let sendKey: (String) -> Void
    let dismissKeyboard: () -> Void
    @State private var isExpanded = false

    var body: some View {
        VStack(spacing: 4) {
            if isExpanded {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        keyButton("Esc") { sendKey("\u{1B}") }
                        keyButton("Tab") { sendKey("\t") }
                        keyButton("Enter", minWidth: 56) { sendKey("\r") }
                        keyButton("Del") { sendKey("\u{1B}[3~") }
                        keyButton("Home", minWidth: 54) { sendKey("\u{1B}[H") }
                        keyButton("End", minWidth: 46) { sendKey("\u{1B}[F") }
                        keyButton("PgUp", minWidth: 54) { sendKey("\u{1B}[5~") }
                        keyButton("PgDn", minWidth: 54) { sendKey("\u{1B}[6~") }
                        keyButton("^A") { sendKey("\u{1}") }
                        keyButton("^E") { sendKey("\u{5}") }
                        keyButton("^K") { sendKey("\u{B}") }
                        keyButton("^U") { sendKey("\u{15}") }
                        keyButton("^W") { sendKey("\u{17}") }
                        keyButton("^Z") { sendKey("\u{1A}") }
                    }
                    .padding(.horizontal, 6)
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    keyButton(isExpanded ? "⌄" : "⌃", minWidth: 34) {
                        withAnimation(.easeInOut(duration: 0.16)) { isExpanded.toggle() }
                    }
                    keyButton("Esc") { sendKey("\u{1B}") }
                    keyButton("Tab") { sendKey("\t") }
                    keyButton("Enter", minWidth: 58) { sendKey("\r") }
                    keyButton("^C") { sendKey("\u{3}") }
                    keyButton("^D") { sendKey("\u{4}") }
                    keyButton("^L") { sendKey("\u{C}") }
                    iconButton("keyboard.chevron.compact.down", minWidth: 38, action: dismissKeyboard)
                    keyButton("←", minWidth: 34) { sendKey("\u{1B}[D") }
                    keyButton("↑", minWidth: 34) { sendKey("\u{1B}[A") }
                    keyButton("↓", minWidth: 34) { sendKey("\u{1B}[B") }
                    keyButton("→", minWidth: 34) { sendKey("\u{1B}[C") }
                }
                .padding(.horizontal, 6)
            }
        }
        .padding(.vertical, 5)
        .background(.black)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private func keyButton(_ label: String, minWidth: CGFloat = 36, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .frame(minWidth: minWidth, minHeight: 30)
                .background(Color.white.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }

    private func iconButton(_ systemName: String, minWidth: CGFloat = 36, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
                .frame(minWidth: minWidth, minHeight: 30)
                .background(Color.white.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dismiss keyboard")
    }
}
