// FILE: CodexAccessMode.swift
// Purpose: Runtime permission mode for thread/turn operations (aligned with trifecta-desktop RuntimeMode).
// Layer: Model
// Exports: CodexAccessMode
// Depends on: Foundation

import Foundation

enum CodexAccessMode: String, Codable, CaseIterable, Hashable, Sendable {
    case approvalRequired = "approval-required"
    case autoAcceptEdits = "auto-accept-edits"
    case fullAccess = "full-access"

    init?(canonicalRawValue rawValue: String) {
        let normalized = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        switch normalized {
        case "approval-required", "approvalrequired", "on-request", "onrequest", "supervised":
            self = .approvalRequired
        case "auto-accept-edits", "autoacceptedits", "auto-accept", "autoaccept":
            self = .autoAcceptEdits
        case "full-access", "fullaccess", "full":
            self = .fullAccess
        default:
            return nil
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let resolved = CodexAccessMode(canonicalRawValue: raw) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported runtime mode: \(raw)"
            )
        }
        self = resolved
    }

    var displayName: String {
        switch self {
        case .approvalRequired:
            return "Supervised"
        case .autoAcceptEdits:
            return "Auto"
        case .fullAccess:
            return "Full"
        }
    }

    var menuTitle: String {
        switch self {
        case .approvalRequired:
            return "Supervised"
        case .autoAcceptEdits:
            return "Auto-accept edits"
        case .fullAccess:
            return "Full access"
        }
    }

    var menuDescription: String {
        switch self {
        case .approvalRequired:
            return "Approve commands and edits before they run."
        case .autoAcceptEdits:
            return "Auto-accept file edits; still ask for other commands."
        case .fullAccess:
            return "Run commands and edits without prompts."
        }
    }

    var menuIconName: String {
        switch self {
        case .approvalRequired:
            return "hand.raised"
        case .autoAcceptEdits:
            return "checkmark.circle"
        case .fullAccess:
            return "hand.thumbsup"
        }
    }

    // Tries modern approval-policy enums first, then the bridge's kebab-case sandbox enum fallback.
    var approvalPolicyCandidates: [String] {
        switch self {
        case .approvalRequired:
            return ["untrusted", "on-request", "onRequest"]
        case .autoAcceptEdits:
            return ["on-request", "onRequest"]
        case .fullAccess:
            return ["never"]
        }
    }

    var sandboxLegacyValue: String {
        switch self {
        case .approvalRequired:
            return "read-only"
        case .autoAcceptEdits:
            return "workspace-write"
        case .fullAccess:
            return "danger-full-access"
        }
    }
}
