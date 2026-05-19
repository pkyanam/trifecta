import Foundation

/// Token search ranking aligned with the desktop model picker (`modelPickerSearch.ts`): favorites get a
/// modest boost while searching so starred models bubble up under ambiguous queries.
enum ModelPickerSearch {
    private static let favoriteBoost = 24

    static func normalizedTokens(_ query: String) -> [String] {
        query
            .lowercased()
            .folding(options: .diacriticInsensitive, locale: .current)
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .map(String.init)
            .filter { !$0.isEmpty }
    }

    static func haystackFields(for entry: ModelCatalogEntry) -> [String] {
        var raw: [String] = [
            entry.model.label,
            entry.model.name,
            entry.model.slug,
            entry.provider.driver,
            entry.provider.label,
            entry.provider.brandDisplayName,
        ]
        if let sp = entry.model.subProvider?.trimmingCharacters(in: .whitespacesAndNewlines), !sp.isEmpty {
            raw.append(sp)
        }
        if let upstream = entry.provider.upstreamVendorLabel(forModelSlug: entry.model.slug) {
            raw.append(upstream)
        }
        return raw
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { $0.lowercased().folding(options: .diacriticInsensitive, locale: .current) }
    }

    /// `nil` means the entry does not match the query.
    static func rank(entry: ModelCatalogEntry, query: String, isFavorite: Bool) -> (score: Int, tieBreaker: String)? {
        let tokens = normalizedTokens(query)
        let tieBreaker = tieBreakerKey(entry)

        if tokens.isEmpty {
            return (0, tieBreaker)
        }

        let fields = haystackFields(for: entry)
        if fields.isEmpty { return nil }

        var total = 0
        for token in tokens {
            guard let best = bestTokenScore(token: token, fields: fields) else {
                return nil
            }
            total += best
        }

        let adjusted = isFavorite ? total - favoriteBoost : total
        return (adjusted, tieBreaker)
    }

    private static func tieBreakerKey(_ entry: ModelCatalogEntry) -> String {
        "\(entry.model.label)\u{0}\(entry.provider.label)\u{0}\(entry.model.slug)"
    }

    private static func bestTokenScore(token: String, fields: [String]) -> Int? {
        var best: Int?
        for field in fields {
            guard let range = field.range(of: token, options: [.literal]) else {
                continue
            }
            let idx = field.distance(from: field.startIndex, to: range.lowerBound)
            let anchorBonus: Int
            if idx == 0 {
                anchorBonus = -4
            } else if field[..<range.lowerBound].last?.isWhitespace == true {
                anchorBonus = -2
            } else {
                anchorBonus = 0
            }
            let lengthPenalty = max(0, token.count - 3) * 2
            let score = idx + anchorBonus + lengthPenalty
            best = min(best ?? score, score)
        }
        return best
    }
}
