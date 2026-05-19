// FILE: OpenCodeRoutingBucket.swift
// Purpose: OpenCode routing classification for picker section headers.
// Layer: Model helper
// Exports: OpenCodeRoutingBucket
// Depends on: Foundation, CodexModelOption

import Foundation

enum OpenCodeRoutingBucket: String, Hashable, Sendable {
    case zen
    case go
    case standard

    var sectionSuffix: String {
        switch self {
        case .zen: return "Zen"
        case .go: return "Go"
        case .standard: return "Standard routing"
        }
    }

    static let allCasesInOrder: [OpenCodeRoutingBucket] = [.zen, .go, .standard]

    // Slug-prefix inference. Mirrors the legacy ServerProviderModel logic so iOS keeps
    // showing Zen / Go / Standard sub-sections even though the bridge flattens models
    // into the CodexModelOption shape (which drops the desktop tier/catalog metadata).
    static func fromSlugPrefix(_ slug: String) -> OpenCodeRoutingBucket? {
        guard let slash = slug.firstIndex(of: "/") else { return nil }
        switch String(slug[..<slash]).lowercased() {
        case "zen": return .zen
        case "go": return .go
        default: return nil
        }
    }
}

extension CodexModelOption {
    var providerDriverNormalized: String {
        (providerDriver ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    var isOpenCode: Bool { providerDriverNormalized == "opencode" }

    var opencodeRoutingBucket: OpenCodeRoutingBucket? {
        guard isOpenCode else { return nil }
        return OpenCodeRoutingBucket.fromSlugPrefix(model) ?? .standard
    }

    // Strips leading `zen/` or `go/` so the real vendor/model can be parsed for upstream labels.
    private var opencodeRoutedSlug: String {
        guard let slash = model.firstIndex(of: "/") else { return model }
        switch String(model[..<slash]).lowercased() {
        case "zen", "go":
            let rest = model[model.index(after: slash)...]
            return rest.isEmpty ? model : String(rest)
        default:
            return model
        }
    }

    // Returns `Anthropic`, `OpenAI`, etc. for OpenCode models whose slug encodes the upstream vendor.
    var opencodeUpstreamVendorLabel: String? {
        guard isOpenCode else { return nil }
        let routed = opencodeRoutedSlug
        guard let slash = routed.firstIndex(of: "/") else { return nil }
        let prefix = String(routed[..<slash]).lowercased()
        return Self.opencodeVendorTitle(prefix)
    }

    private static func opencodeVendorTitle(_ raw: String) -> String? {
        switch raw {
        case "openai": return "OpenAI"
        case "anthropic": return "Anthropic"
        case "google", "gemini": return "Google"
        case "groq": return "Groq"
        case "x-ai", "xai": return "xAI"
        case "mistralai", "mistral": return "Mistral"
        case "deepseek": return "DeepSeek"
        case "meta-llama", "meta": return "Meta"
        case "cohere": return "Cohere"
        default:
            return raw
                .split(separator: "-")
                .map(\.capitalized)
                .joined(separator: " ")
        }
    }
}
