import AppKit
import SwiftUI
import TrifectaCore

struct PairingFlowView: View {
    @Environment(ConnectionStore.self) private var store
    @Binding var isPresented: Bool

    @State private var mode: Mode = .url
    @State private var urlText = ""
    @State private var hostText = ""
    @State private var tokenText = ""
    @State private var isPairing = false
    @State private var errorMessage: String?

    enum Mode: String, CaseIterable {
        case url = "Pairing URL"
        case manual = "Manual"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider()

            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)

            Group {
                switch mode {
                case .url: urlSection
                case .manual: manualSection
                }
            }
            .padding(.horizontal, 20)

            if let err = errorMessage {
                Text(err)
                    .foregroundStyle(.red)
                    .font(.callout)
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
            }

            Divider()
                .padding(.top, 16)

            footer
        }
        .frame(width: 460)
        .trifectaSurface()
        .overlay {
            if isPairing {
                Color.clear
                    .overlay(alignment: .center) {
                        ProgressView("Connecting…")
                            .padding(24)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    }
            }
        }
        .allowsHitTesting(!isPairing)
    }

    // MARK: - Sections

    private var header: some View {
        HStack {
            Text("Add Connection")
                .font(.title2)
                .fontWeight(.semibold)
            Spacer()
            Button {
                isPresented = false
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
        }
        .padding([.horizontal, .top], 20)
        .padding(.bottom, 16)
    }

    private var urlSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Paste the pairing URL printed by the Trifecta server.")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack {
                TextField("http://host:3773/pair#token=…", text: $urlText)
                    .textFieldStyle(.roundedBorder)
                Button("Paste") {
                    if let s = NSPasteboard.general.string(forType: .string) {
                        urlText = s
                    }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.bottom, 8)
    }

    private var manualSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Server URL")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                TextField("http://host:3773", text: $hostText)
                    .textFieldStyle(.roundedBorder)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Pairing Token")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                SecureField("One-time token", text: $tokenText)
                    .textFieldStyle(.roundedBorder)
            }
        }
        .padding(.bottom, 8)
    }

    private var footer: some View {
        HStack {
            Button("Cancel") { isPresented = false }
                .keyboardShortcut(.cancelAction)
            Spacer()
            Button("Connect") { performPairing() }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(!canSubmit)
        }
        .padding(20)
    }

    // MARK: - Actions

    private var canSubmit: Bool {
        switch mode {
        case .url: !urlText.trimmingCharacters(in: .whitespaces).isEmpty
        case .manual:
            !hostText.trimmingCharacters(in: .whitespaces).isEmpty &&
            !tokenText.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    private func performPairing() {
        errorMessage = nil
        isPairing = true
        Task {
            defer { isPairing = false }
            do {
                switch mode {
                case .url:
                    try await store.pairWith(rawURL: urlText.trimmingCharacters(in: .whitespaces))
                case .manual:
                    try await store.pairWith(
                        host: hostText.trimmingCharacters(in: .whitespaces),
                        token: tokenText.trimmingCharacters(in: .whitespaces)
                    )
                }
                isPresented = false
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
