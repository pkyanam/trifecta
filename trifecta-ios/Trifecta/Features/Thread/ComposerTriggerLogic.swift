import Foundation

enum ComposerTriggerKind: Equatable, Sendable {
    case path
    case slashCommand
    case skill
}

struct ComposerTrigger: Equatable, Sendable {
    var kind: ComposerTriggerKind
    var query: String
    var rangeStart: Int
    var rangeEnd: Int
}

enum ComposerLogic {
    private static func clampCursor(lengthUTF16: Int, _ cursor: Int) -> Int {
        max(0, min(lengthUTF16, cursor))
    }

    private static func isWhitespaceUTF16(_ u: unichar) -> Bool {
        guard let scalar = UnicodeScalar(UInt32(u)) else { return false }
        return CharacterSet.whitespacesAndNewlines.contains(scalar)
    }

    private static func tokenStartUTF16(ns: NSString, cursor: Int) -> Int {
        var index = cursor - 1
        while index >= 0 {
            if isWhitespaceUTF16(ns.character(at: index)) { break }
            index -= 1
        }
        return index + 1
    }

    private static func lineStartUTF16(ns: NSString, cursor: Int) -> Int {
        let capped = clampCursor(lengthUTF16: ns.length, cursor)
        if capped <= 0 { return 0 }
        let search = NSRange(location: 0, length: capped)
        let nl = ns.range(of: "\n", options: .backwards, range: search)
        if nl.location != NSNotFound {
            return nl.location + nl.length
        }
        return 0
    }

    /// UTF-16 offsets, aligned with `UITextView.selectedRange`.
    static func detectTrigger(text: String, cursorUTF16: Int) -> ComposerTrigger? {
        let ns = text as NSString
        let len = ns.length
        let cursor = clampCursor(lengthUTF16: len, cursorUTF16)

        let lineStart = lineStartUTF16(ns: ns, cursor: cursor)
        let lineLen = cursor - lineStart
        if lineLen >= 0, lineStart + lineLen <= len {
            let linePrefix = ns.substring(with: NSRange(location: lineStart, length: lineLen))
            if linePrefix.hasPrefix("/"),
               let regex = try? NSRegularExpression(pattern: #"^\/(\S*)$"#, options: []),
               let match = regex.firstMatch(in: linePrefix, range: NSRange(location: 0, length: (linePrefix as NSString).length)),
               match.numberOfRanges >= 2 {
                let r = match.range(at: 1)
                if r.location != NSNotFound {
                    let commandQuery = (linePrefix as NSString).substring(with: r)
                    return ComposerTrigger(
                        kind: .slashCommand,
                        query: commandQuery,
                        rangeStart: lineStart,
                        rangeEnd: cursor
                    )
                }
            }
        }

        let tokenStart = tokenStartUTF16(ns: ns, cursor: cursor)
        let tokenLen = cursor - tokenStart
        guard tokenLen > 0, tokenStart + tokenLen <= len else { return nil }
        let token = ns.substring(with: NSRange(location: tokenStart, length: tokenLen))

        if token.hasPrefix("$") {
            return ComposerTrigger(
                kind: .skill,
                query: String(token.dropFirst()),
                rangeStart: tokenStart,
                rangeEnd: cursor
            )
        }
        if token.hasPrefix("@") {
            return ComposerTrigger(
                kind: .path,
                query: String(token.dropFirst()),
                rangeStart: tokenStart,
                rangeEnd: cursor
            )
        }
        return nil
    }

    static func replaceRangeUTF16(in text: String, rangeStart: Int, rangeEnd: Int, replacement: String) -> (text: String, cursorUTF16: Int) {
        let ns = text as NSString
        let len = ns.length
        let s = max(0, min(len, rangeStart))
        let e = max(s, min(len, rangeEnd))
        let prefix = ns.substring(to: s)
        let suffix = ns.substring(from: e)
        let next = prefix + replacement + suffix
        let cursor = s + (replacement as NSString).length
        return (next, cursor)
    }

    static func parseStandaloneModeSlash(_ trimmed: String) -> ProviderInteractionMode? {
        let t = trimmed.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: #"^/plan\s*$"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return .plan
        }
        if t.range(of: #"^/default\s*$"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return .default
        }
        return nil
    }

    static func isStandaloneModelSlash(_ trimmed: String) -> Bool {
        let t = trimmed.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.range(of: #"^/model\s*$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
