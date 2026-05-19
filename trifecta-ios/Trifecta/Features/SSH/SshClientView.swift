import SwiftUI
import SwiftTerm

struct SshClientView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    @State private var hosts: [SshHostProfile] = []
    @State private var selectedHostId: String?
    @State private var session: SshSessionSnapshot?
    @State private var subscription: StreamSubscription?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showAddHost = false
    @State private var pendingHostKeyPrompt: SshHostKeyPrompt?
    @State private var showShellProfileAlert = false
    @State private var shellProfileResult: T3Client.ShellProfileSetupResult?
    @State private var showKeychainBanner = false

    @State private var terminalHandle = TerminalHandle()
    @State private var shouldFocusTerminal = false
    @State private var pendingResizeCols = 0
    @State private var pendingResizeRows = 0

    private var selectedHost: SshHostProfile? {
        guard let selectedHostId else { return hosts.first }
        return hosts.first { $0.id == selectedHostId } ?? hosts.first
    }

    private var hasLiveSession: Bool {
        guard let status = session?.status else { return false }
        switch status {
        case .pendingHostKey, .authenticating, .running:
            return true
        case .closed, .error:
            return false
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if env.connectionStatus != .connected {
                disconnectedView
            } else if env.serverConfig?.sshEnabled == false {
                desktopOnlyView
            } else {
                hostBar
                Divider()
                if hasLiveSession {
                    terminalArea
                    keychainBanner
                    hostKeyApprovalPanel
                    terminalKeyBar
                } else {
                    placeholderView
                }
            }
        }
        .navigationTitle("SSH")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Done") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddHost = true
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(env.connectionStatus != .connected)
            }
        }
        .task {
            guard env.serverConfig?.sshEnabled != false else { return }
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
    }

    @ViewBuilder
    private var keychainBanner: some View {
        if showKeychainBanner {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "lock.sha256")
                        .foregroundStyle(.cyan)
                    Text("macOS Keychain Unlock")
                        .font(T3Typography.bodyEmphasis)
                    Spacer()
                    Button {
                        withAnimation { showKeychainBanner = false }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(T3Color.textSecondary)
                    }
                }
                Text("Type your Mac login password to unlock the keychain. Claude Code stores its credentials in the macOS Keychain, which stays locked during SSH sessions until you unlock it.")
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textSecondary)
            }
            .padding(12)
            .background(.cyan.opacity(0.1))
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(.cyan.opacity(0.3))
                    .frame(height: 1)
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    @ViewBuilder
    private var hostKeyApprovalPanel: some View {
        if let prompt = pendingHostKeyPrompt {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "key.horizontal")
                        .foregroundStyle(.yellow)
                    Text("Trust SSH host key?")
                        .font(T3Typography.bodyEmphasis)
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(prompt.hostname):\(prompt.port)")
                        .font(.system(.footnote, design: .monospaced))
                    Text(prompt.keyType)
                        .font(T3Typography.caption)
                        .foregroundStyle(T3Color.textSecondary)
                    Text(prompt.fingerprintSha256)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(T3Color.textSecondary)
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
                Rectangle()
                    .fill(.yellow.opacity(0.35))
                    .frame(height: 1)
            }
        } else if session?.status == .pendingHostKey {
            VStack(alignment: .leading, spacing: 6) {
                Text("Waiting for host key details")
                    .font(T3Typography.bodyEmphasis)
                Text("Close and reconnect after updating Desktop if this does not change.")
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.yellow.opacity(0.1))
        }
    }

    private var disconnectedView: some View {
        ContentUnavailableView("Desktop server offline",
                               systemImage: "wifi.slash",
                               description: Text("Pair or reconnect to Trifecta Desktop before opening SSH."))
    }

    private var desktopOnlyView: some View {
        ContentUnavailableView("Requires Trifecta Desktop",
                               systemImage: "desktopcomputer",
                               description: Text("SSH is only available when connected to Trifecta Desktop on your Mac. This server does not support SSH sessions."))
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
                                .foregroundStyle(T3Color.textPrimary)
                                .lineLimit(1)
                            Text(selectedHost.map { "\($0.username)@\($0.hostname):\($0.port)" } ?? "Add an SSH host")
                                .font(.system(size: 12, weight: .medium, design: .monospaced))
                                .foregroundStyle(T3Color.textSecondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.78)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(T3Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(T3Color.surfaceMuted, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
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
                    connectSelectedHost()
                } label: {
                    Label(hasLiveSession ? "Connected" : "Connect", systemImage: "terminal")
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedHost == nil || hasLiveSession || isLoading)
                .labelStyle(.iconOnly)

                Menu {
                    Button {
                        Task { await setupShellProfile() }
                    } label: {
                        Label("Setup Keychain Unlock", systemImage: "key.horizontal")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .disabled(hasLiveSession)
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
                    .font(T3Typography.caption)
                    .foregroundStyle(.yellow)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(T3Color.surfaceElevated)
    }

    private var terminalArea: some View {
        TerminalRepresentable(
            handle: terminalHandle,
            onSend: { data in
                let string = String(decoding: Data(data), as: UTF8.self)
                Task { await sendRaw(string) }
            },
            onResize: { cols, rows in
                Task { @MainActor in
                    pendingResizeCols = cols
                    pendingResizeRows = rows
                    if session?.sessionId != nil {
                        await sendResize(cols: cols, rows: rows)
                    }
                }
            },
            shouldFocus: shouldFocusTerminal
        )
        .background(Color(red: 0.055, green: 0.071, blue: 0.094))
    }

    private var terminalKeyBar: some View {
        TerminalKeyBar { keySequence in
            Task { await sendRaw(keySequence) }
        }
    }

    private var placeholderView: some View {
        VStack(spacing: 12) {
            Image(systemName: "terminal")
                .font(.system(size: 36))
                .foregroundStyle(T3Color.textTertiary)
            Text("Select a host and tap Connect")
                .font(T3Typography.body)
                .foregroundStyle(T3Color.textSecondary)
            if isLoading {
                ProgressView()
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.055, green: 0.071, blue: 0.094))
    }

    private var statusText: String {
        guard let session else { return "No active session" }
        switch session.status {
        case .pendingHostKey: return "Waiting for host key approval"
        case .authenticating: return "Authenticating"
        case .running: return "Running \(session.cols)x\(session.rows)"
        case .closed: return "Closed"
        case .error: return "Error"
        }
    }

    private func refreshHosts() async {
        guard let client = env.client else { return }
        await MainActor.run { isLoading = true }
        do {
            let nextHosts = try await client.sshListHosts()
            await MainActor.run {
                hosts = nextHosts
                if selectedHostId == nil || !nextHosts.contains(where: { $0.id == selectedHostId }) {
                    selectedHostId = nextHosts.first?.id
                }
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                isLoading = false
            }
        }
    }

    private func addHost(_ input: SshAddHostInput) async {
        guard let client = env.client else { return }
        do {
            let host = try await client.sshAddHost(label: input.label,
                                                   hostname: input.hostname,
                                                   port: input.port,
                                                   username: input.username,
                                                   authMethod: input.authMethod)
            await MainActor.run {
                hosts.append(host)
                selectedHostId = host.id
                showAddHost = false
            }
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    private func connectSelectedHost() {
        guard let client = env.client, let host = selectedHost else { return }
        guard !isLoading else { return }
        isLoading = true
        Task {
            await connectToHost(host, client: client)
        }
    }

    private func connectToHost(_ host: SshHostProfile, client: T3Client) async {
        if session != nil || subscription != nil {
            await tearDownSession(closeRemote: true)
        }

        terminalHandle.clear()
        pendingHostKeyPrompt = nil

        do {
            let result = try await client.sshOpenSession(hostId: host.id, cols: terminalHandle.currentCols(), rows: terminalHandle.currentRows())
            let stream = try await client.subscribeSshTerminal(sessionId: result.snapshot.sessionId) { event in
                Task { @MainActor in handle(event) }
            }
            session = result.snapshot
            subscription = stream
            isLoading = false

            if pendingResizeCols > 0 && pendingResizeRows > 0 {
                await sendResize(cols: pendingResizeCols, rows: pendingResizeRows)
            }

            shouldFocusTerminal = true
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
                subscription = nil
                pendingHostKeyPrompt = nil
                shouldFocusTerminal = false
                showKeychainBanner = false
            case .pendingHostKey, .authenticating, .running:
                session = snapshot
            }
        case .output(let data):
            terminalHandle.feed(data)
            if data.localizedCaseInsensitiveContains("unlock") &&
                (data.localizedCaseInsensitiveContains("keychain") || data.localizedCaseInsensitiveContains("login.keychain")) {
                if !showKeychainBanner {
                    withAnimation { showKeychainBanner = true }
                }
            }
        case .hostKeyPrompt(let prompt):
            pendingHostKeyPrompt = prompt
            terminalHandle.feed("\n[ssh] host key approval required for \(prompt.hostname):\(prompt.port)\n")
        case .error(let message):
            errorMessage = message
            terminalHandle.feed("\n[ssh error] \(message)\n")
            if message.localizedCaseInsensitiveContains("permission denied") {
                terminalHandle.feed("[ssh] Public-key auth failed. Make sure this Mac account has a key loaded in ssh-agent or its public key in ~/.ssh/authorized_keys.\n")
            }
        case .exited(let exitCode):
            terminalHandle.feed("\n[ssh exited \(exitCode.map(String.init) ?? "without status")]\n")
            session = nil
            subscription = nil
            shouldFocusTerminal = false
            showKeychainBanner = false
        }
    }

    private func respondToHostKey(approve: Bool, remember: Bool) async {
        guard let client = env.client, let prompt = pendingHostKeyPrompt else { return }
        do {
            let snapshot = try await client.sshConfirmHostKey(sessionId: prompt.sessionId,
                                                              fingerprintSha256: prompt.fingerprintSha256,
                                                              approve: approve,
                                                              remember: remember)
            await MainActor.run {
                session = snapshot
                pendingHostKeyPrompt = nil
                terminalHandle.feed("[ssh] host key accepted\n")
            }
        } catch {
            await MainActor.run {
                pendingHostKeyPrompt = nil
                errorMessage = error.localizedDescription
            }
        }
    }

    private func sendRaw(_ data: String) async {
        guard let client = env.client, let current = session, current.status == .running else { return }
        let sessionId = current.sessionId
        if showKeychainBanner && data.contains("\n") {
            withAnimation { showKeychainBanner = false }
        }
        do {
            try await client.sshSendInput(sessionId: sessionId, data: data)
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    private func sendResize(cols: Int, rows: Int) async {
        guard let client = env.client, let sessionId = session?.sessionId else { return }
        do {
            try await client.sshResize(sessionId: sessionId, cols: cols, rows: rows)
        } catch {
        }
    }

    private func tearDownSession(closeRemote: Bool) async {
        let currentSubscription = subscription
        let currentSessionId = session?.sessionId
        await MainActor.run {
            subscription = nil
            session = nil
            pendingHostKeyPrompt = nil
            shouldFocusTerminal = false
        }
        await currentSubscription?.cancel()
        guard closeRemote, let client = env.client, let currentSessionId else { return }
        try? await client.sshCloseSession(sessionId: currentSessionId)
    }

    private func removeSelectedHost() async {
        guard let client = env.client, let host = selectedHost else { return }
        do {
            try await client.sshRemoveHost(hostId: host.id)
            await MainActor.run {
                hosts.removeAll { $0.id == host.id }
                selectedHostId = hosts.first?.id
            }
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    private func hostMenuTitle(_ host: SshHostProfile) -> String {
        "\(host.label)  \(host.username)@\(host.hostname):\(host.port)"
    }

    private func setupShellProfile() async {
        guard let client = env.client else { return }
        do {
            let result = try await client.sshSetupShellProfile()
            await MainActor.run {
                shellProfileResult = result
                showShellProfileAlert = true
            }
        } catch {
            await MainActor.run {
                errorMessage = "Failed to update shell profile: \(error.localizedDescription)"
            }
        }
    }
}

private struct SshAddHostInput {
    var label: String
    var hostname: String
    var port: Int
    var username: String
    var authMethod: SshAuthMethod
}

private struct SshAddHostView: View {
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
                Text(authMethod.testingNote)
                    .font(T3Typography.caption)
                    .foregroundStyle(T3Color.textSecondary)
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
        Task {
            await onSave(input)
        }
    }
}
