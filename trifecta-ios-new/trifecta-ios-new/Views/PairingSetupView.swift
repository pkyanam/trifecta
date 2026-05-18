// FILE: PairingSetupView.swift
// Purpose: Manual pairing form — server URL and token entry replacing the QR scanner.
// Layer: View
// Exports: PairingSetupView
// Depends on: SwiftUI, UIKit, CodexPairingQRPayload, QRScannerPairingValidator

import SwiftUI
import UIKit

struct PairingSetupView: View {
    let onBack: (() -> Void)?
    let onConnect: (CodexPairingQRPayload) -> Void

    @State private var serverURL = ""
    @State private var pairingToken = ""
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field { case serverURL, token }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                formContent
                    .padding(.horizontal, 24)
                    .padding(.top, 32)

                Spacer()

                connectButton
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)
            }
            .navigationTitle("New Pairing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onBack {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Back", action: onBack)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Paste Link") {
                        pasteLinkFromClipboard()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var formContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Server URL")
                    .font(AppFont.caption(weight: .semibold))
                    .foregroundStyle(.secondary)

                TextField("http://192.168.1.10:4000", text: $serverURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .focused($focusedField, equals: .serverURL)
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.secondarySystemFill))
                    )
                    .submitLabel(.next)
                    .onSubmit { focusedField = .token }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Pairing Token")
                    .font(AppFont.caption(weight: .semibold))
                    .foregroundStyle(.secondary)

                TextField("Token", text: $pairingToken)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .token)
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.secondarySystemFill))
                    )
                    .submitLabel(.done)
                    .onSubmit { attemptConnect() }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(AppFont.caption())
                    .foregroundStyle(.red)
            }
        }
    }

    private var connectButton: some View {
        Button(action: attemptConnect) {
            Text("Connect")
                .font(AppFont.body(weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(Color(.systemBackground))
                .background(Color.primary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                  || pairingToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func pasteLinkFromClipboard() {
        let clipboard = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !clipboard.isEmpty else {
            errorMessage = "Nothing to paste from clipboard."
            return
        }

        switch validatePairingQRCode(clipboard) {
        case .success(let payload):
            serverURL = payload.relay
            pairingToken = payload.sessionId
            errorMessage = nil
        case .shortCode(let code):
            pairingToken = code
            errorMessage = nil
        case .bridgeUpdateRequired(let prompt):
            errorMessage = prompt.message
        case .scanError:
            pairingToken = clipboard
            errorMessage = nil
        }
    }

    private func attemptConnect() {
        let url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = pairingToken.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !url.isEmpty else {
            errorMessage = "Enter the server URL."
            return
        }
        guard !token.isEmpty else {
            errorMessage = "Enter the pairing token."
            return
        }
        guard URL(string: url) != nil else {
            errorMessage = "The server URL is not valid."
            return
        }

        errorMessage = nil
        onConnect(makeTrifectaPairingPayload(serverURL: url, token: token))
    }
}
