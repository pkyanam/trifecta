import SwiftUI

/// Mobile-friendly block-level markdown renderer.
///
/// Supports the markdown subset assistants typically emit:
/// - Fenced code blocks (```lang … ```)
/// - ATX headings (`#` through `######`)
/// - Bullet lists (`-`, `*`, `+`)
/// - Numbered lists (`1.`, `2.`, …)
/// - Block quotes (`> …`)
/// - Horizontal rules (`---`, `***`, `___`)
/// - Paragraphs separated by blank lines
///
/// Inline markdown (bold, italic, inline code, links) is rendered via Apple's
/// `AttributedString(markdown:)` so SwiftUI handles wrapping/selection natively.
struct MarkdownText: View {
    let source: String
    var baseFont: Font = T3Typography.body
    var secondaryColor: Color = T3Color.textSecondary
    var inlineCodeBackground: Color = T3Color.surfaceMuted

    var body: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
    }

    private var blocks: [Block] {
        MarkdownBlockParser.parse(source)
    }

    @ViewBuilder
    private func blockView(_ block: Block) -> some View {
        switch block {
        case .paragraph(let text):
            paragraphText(text)
        case .heading(let level, let text):
            paragraphText(text, font: headingFont(for: level), bold: true)
                .padding(.top, level <= 2 ? T3Spacing.xs : 0)
        case .code(let code, let language):
            CodeBlockView(code: code, language: language)
        case .bullet(let items):
            ListBlockView(items: items,
                          ordered: false,
                          baseFont: baseFont,
                          inlineBackground: inlineCodeBackground)
        case .numbered(let items):
            ListBlockView(items: items,
                          ordered: true,
                          baseFont: baseFont,
                          inlineBackground: inlineCodeBackground)
        case .quote(let lines):
            QuoteBlockView(lines: lines,
                           baseFont: baseFont,
                           inlineBackground: inlineCodeBackground,
                           textColor: secondaryColor)
        case .divider:
            Rectangle()
                .fill(T3Color.separator)
                .frame(height: 0.5)
                .padding(.vertical, T3Spacing.xs)
        }
    }

    private func paragraphText(_ source: String,
                               font: Font? = nil,
                               bold: Bool = false) -> some View {
        Text(InlineMarkdown.attributed(source,
                                       inlineCodeBackground: inlineCodeBackground,
                                       boldAll: bold))
            .font(font ?? baseFont)
            .foregroundStyle(T3Color.textPrimary)
            .lineSpacing(3)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func headingFont(for level: Int) -> Font {
        switch level {
        case 1: return T3Typography.title
        case 2: return T3Typography.headline
        case 3: return T3Typography.bodyEmphasis
        default: return T3Typography.callout
        }
    }

    // MARK: - Block model

    enum Block {
        case paragraph(String)
        case heading(Int, String)
        case code(String, String?)
        case bullet([ListItem])
        case numbered([ListItem])
        case quote([String])
        case divider
    }

    struct ListItem {
        let depth: Int
        let text: String
    }
}

// MARK: - Inline rendering

private enum InlineMarkdown {
    static func attributed(_ source: String,
                           inlineCodeBackground: Color,
                           boldAll: Bool = false) -> AttributedString {
        let mdOptions = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        guard var attributed = try? AttributedString(markdown: source, options: mdOptions) else {
            var fallback = AttributedString(source)
            if boldAll { fallback.font = .body.bold() }
            return fallback
        }
        for run in attributed.runs {
            guard let intent = run.inlinePresentationIntent,
                  intent.contains(.code) else { continue }
            attributed[run.range].backgroundColor = inlineCodeBackground
            attributed[run.range].foregroundColor = T3Color.textPrimary
            attributed[run.range].font = .system(.footnote, design: .monospaced).weight(.medium)
        }
        return attributed
    }
}

// MARK: - List & quote helpers

private struct ListBlockView: View {
    let items: [MarkdownText.ListItem]
    let ordered: Bool
    let baseFont: Font
    let inlineBackground: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    marker(index: index)
                        .font(baseFont)
                        .foregroundStyle(T3Color.textSecondary)
                        .frame(minWidth: ordered ? 22 : 14, alignment: .trailing)
                    Text(InlineMarkdown.attributed(item.text,
                                                   inlineCodeBackground: inlineBackground))
                        .font(baseFont)
                        .foregroundStyle(T3Color.textPrimary)
                        .lineSpacing(3)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.leading, CGFloat(item.depth) * 16)
            }
        }
    }

    @ViewBuilder
    private func marker(index: Int) -> some View {
        if ordered {
            Text("\(index + 1).").fontWeight(.semibold)
        } else {
            Text("•")
        }
    }
}

private struct QuoteBlockView: View {
    let lines: [String]
    let baseFont: Font
    let inlineBackground: Color
    let textColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: T3Spacing.sm) {
            Rectangle()
                .fill(T3Color.separator)
                .frame(width: 3)
            Text(InlineMarkdown.attributed(lines.joined(separator: "\n"),
                                           inlineCodeBackground: inlineBackground))
                .font(baseFont)
                .foregroundStyle(textColor)
                .lineSpacing(3)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, T3Spacing.xs)
    }
}

// MARK: - Block parser

private enum MarkdownBlockParser {
    static func parse(_ source: String) -> [MarkdownText.Block] {
        var blocks: [MarkdownText.Block] = []
        let lines = source.components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Fenced code block
            if trimmed.hasPrefix("```") {
                let langCandidate = trimmed.dropFirst(3).trimmingCharacters(in: .whitespaces)
                let language = langCandidate.isEmpty ? nil : String(langCandidate)
                i += 1
                var codeLines: [String] = []
                while i < lines.count {
                    let l = lines[i]
                    if l.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                        i += 1
                        break
                    }
                    codeLines.append(l)
                    i += 1
                }
                blocks.append(.code(codeLines.joined(separator: "\n"), language))
                continue
            }

            // Heading
            if let heading = parseHeading(trimmed) {
                blocks.append(.heading(heading.level, heading.text))
                i += 1
                continue
            }

            // Horizontal rule
            if isHorizontalRule(trimmed) {
                blocks.append(.divider)
                i += 1
                continue
            }

            // Block quote (consume contiguous quote lines)
            if trimmed.hasPrefix(">") {
                var quoteLines: [String] = []
                while i < lines.count {
                    let lineTrimmed = lines[i].trimmingCharacters(in: .whitespaces)
                    if !lineTrimmed.hasPrefix(">") { break }
                    var content = lineTrimmed
                    content.removeFirst()
                    if content.hasPrefix(" ") { content.removeFirst() }
                    quoteLines.append(content)
                    i += 1
                }
                blocks.append(.quote(quoteLines))
                continue
            }

            // Unfenced unified diff / patch (common in assistant output without ```)
            if let diff = consumeUnfencedDiff(lines: lines, start: i) {
                blocks.append(.code(diff.text, "diff"))
                i = diff.end
                continue
            }

            // List
            if let kind = listKind(for: line) {
                var items: [MarkdownText.ListItem] = []
                while i < lines.count, let next = listKind(for: lines[i]), next == kind {
                    items.append(parseListItem(line: lines[i]))
                    i += 1
                }
                if kind == .bullet {
                    blocks.append(.bullet(items))
                } else {
                    blocks.append(.numbered(items))
                }
                continue
            }

            // Blank line
            if trimmed.isEmpty {
                i += 1
                continue
            }

            // Paragraph: collect contiguous non-empty, non-special lines
            var paraLines: [String] = []
            while i < lines.count {
                let raw = lines[i]
                let lineTrimmed = raw.trimmingCharacters(in: .whitespaces)
                if lineTrimmed.isEmpty { break }
                if lineTrimmed.hasPrefix("```") { break }
                if isHorizontalRule(lineTrimmed) { break }
                if parseHeading(lineTrimmed) != nil { break }
                if lineTrimmed.hasPrefix(">") { break }
                if listKind(for: raw) != nil { break }
                if isDiffStrongHeader(lineTrimmed) { break }
                if looksLikeWeakDiffRun(lines: lines, start: i) { break }
                paraLines.append(raw)
                i += 1
            }
            if !paraLines.isEmpty {
                blocks.append(.paragraph(paraLines.joined(separator: "\n")))
            }
        }
        return blocks
    }

    private static func parseHeading(_ trimmed: String) -> (level: Int, text: String)? {
        guard trimmed.hasPrefix("#") else { return nil }
        var level = 0
        var rest = Substring(trimmed)
        while rest.first == "#", level < 6 {
            rest = rest.dropFirst()
            level += 1
        }
        guard level > 0, rest.first == " " else { return nil }
        let text = rest.dropFirst().trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return nil }
        return (level, text)
    }

    private static func isHorizontalRule(_ trimmed: String) -> Bool {
        guard trimmed.count >= 3 else { return false }
        let chars = Set(trimmed)
        return chars == ["-"] || chars == ["*"] || chars == ["_"]
    }

    enum ListKind { case bullet, numbered }

    private static func listKind(for raw: String) -> ListKind? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        // Omit `+ ` — it collides with unified-diff added lines in streamed output.
        if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
            return .bullet
        }
        if let dot = trimmed.firstIndex(of: ".") {
            let prefix = trimmed[..<dot]
            if !prefix.isEmpty,
               prefix.allSatisfy({ $0.isASCII && $0.isNumber }) {
                let after = trimmed.index(after: dot)
                if after < trimmed.endIndex, trimmed[after] == " " {
                    return .numbered
                }
            }
        }
        return nil
    }

    private static func parseListItem(line: String) -> MarkdownText.ListItem {
        var leadingSpaces = 0
        for c in line {
            if c == " " { leadingSpaces += 1 }
            else if c == "\t" { leadingSpaces += 4 }
            else { break }
        }
        let depth = max(0, leadingSpaces / 2)
        var text = line.trimmingCharacters(in: .whitespaces)
        if let first = text.first, "-*".contains(first), text.count >= 2 {
            let afterMarker = text.index(after: text.startIndex)
            if text[afterMarker] == " " {
                text = String(text[text.index(after: afterMarker)...])
            }
        } else if let dot = text.firstIndex(of: ".") {
            let prefix = text[..<dot]
            if prefix.allSatisfy({ $0.isASCII && $0.isNumber }) {
                let after = text.index(after: dot)
                if after < text.endIndex, text[after] == " " {
                    text = String(text[text.index(after: after)...])
                }
            }
        }
        return MarkdownText.ListItem(depth: depth, text: text)
    }

    // MARK: - Unfenced diff

    /// Captures git-style patches when the model omits fenced code blocks so `-` / `+`
    /// lines are not mis-parsed as bullet lists and hunks stay monospace.
    private static func consumeUnfencedDiff(lines: [String], start: Int) -> (text: String, end: Int)? {
        guard start < lines.count else { return nil }
        let line = lines[start]
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        if isDiffStrongHeader(trimmed) {
            return consumeDiffBody(lines: lines, start: start)
        }
        guard looksLikeWeakDiffRun(lines: lines, start: start) else { return nil }
        return consumeDiffBody(lines: lines, start: start)
    }

    private static func consumeDiffBody(lines: [String], start: Int) -> (text: String, end: Int)? {
        var j = start
        var collected: [String] = []
        while j < lines.count {
            let raw = lines[j]
            let t = raw.trimmingCharacters(in: .whitespaces)
            if t.isEmpty {
                if !collected.isEmpty { break }
                j += 1
                continue
            }
            if !isDiffBodyLine(raw) { break }
            collected.append(raw)
            j += 1
        }
        guard !collected.isEmpty else { return nil }
        return (collected.joined(separator: "\n"), j)
    }

    private static func isDiffStrongHeader(_ trimmed: String) -> Bool {
        if trimmed.hasPrefix("@@") { return true }
        if trimmed.hasPrefix("diff --git") { return true }
        if trimmed.hasPrefix("Index: ") { return true }
        if trimmed.hasPrefix("--- a/") || trimmed.hasPrefix("--- b/")
            || trimmed.hasPrefix("+++ a/") || trimmed.hasPrefix("+++ b/") {
            return true
        }
        return false
    }

    /// Weak detection: ≥2 lines that look like a unified hunk without file headers.
    private static func looksLikeWeakDiffRun(lines: [String], start: Int) -> Bool {
        guard start + 1 < lines.count else { return false }
        var i = start
        var sawPlus = false
        var sawMinus = false
        var allMinusSpaceBullets = true

        while i < lines.count {
            let raw = lines[i]
            if raw.trimmingCharacters(in: .whitespaces).isEmpty { break }
            guard let first = raw.first else { break }

            if first == "+" {
                sawPlus = true
                allMinusSpaceBullets = false
            } else if first == "-" {
                sawMinus = true
                let rest = raw.dropFirst()
                if rest.first != " " {
                    allMinusSpaceBullets = false
                }
            } else if first == " " || first == "\t" {
                allMinusSpaceBullets = false
            } else {
                break
            }
            i += 1
        }

        let count = i - start
        guard count >= 2 else { return false }
        if sawPlus { return true }
        if allMinusSpaceBullets { return false }
        return sawMinus
    }

    private static func isDiffBodyLine(_ raw: String) -> Bool {
        let t = raw.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("@@") || t.hasPrefix("diff --git") || t.hasPrefix("Index: ") {
            return true
        }
        if t.hasPrefix("+++ ") || t.hasPrefix("--- ") {
            return true
        }
        if t.hasPrefix("index ") && t.contains("..") {
            return true
        }
        if t == "\\ No newline at end of file" {
            return true
        }
        guard let first = raw.first else { return false }
        if first == "+" || first == "-" {
            return true
        }
        if first == " " || first == "\t" {
            return raw.count > 1
        }
        if first == "\\" {
            return true
        }
        return false
    }
}
