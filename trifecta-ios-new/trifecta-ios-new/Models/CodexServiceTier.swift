// FILE: CodexServiceTier.swift
// Purpose: User-selectable service tier for Trifecta app-server speed controls.
// Layer: Model
// Exports: CodexServiceTier
// Depends on: Foundation

import Foundation

enum CodexServiceTier: String, CaseIterable, Codable, Hashable, Sendable {
    case fast

    var displayName: String {
        switch self {
        case .fast:
            return "Fast"
        }
    }

    var description: String {
        switch self {
        case .fast:
            return "Lower latency using Trifecta Fast Mode."
        }
    }

    var iconName: String {
        switch self {
        case .fast:
            return "bolt.fill"
        }
    }
}
