import Foundation

/// Visual tone for an activity row, mapped to color and emphasis.
enum ActivityTone: String, Sendable {
    case info
    case tool
    case thinking
    case error
    case approval
    case success
}

/// A `ThreadActivity` projected into a UI-ready shape: title, optional command,
/// changed files, free-form detail, plus an icon + tone for compact rendering.
///
/// Mirrors the shape of the desktop's `WorkLogEntry` but stays minimal — just
/// what's needed for an inline mobile timeline chip.
struct RenderableActivity: Identifiable, Hashable, Sendable {
    let id: String
    let createdAt: Date
    let turnId: TurnID?
    let title: String
    let detail: String?
    let command: String?
    let changedFiles: [String]
    let iconName: String
    let tone: ActivityTone
    /// True when the activity is still in progress (`tool.updated`,
    /// `task.progress`) so the row can render a spinner.
    let isInProgress: Bool

    /// Returns nil if the activity should not be rendered inline (handled by
    /// dedicated cards or considered noise).
    static func from(_ activity: ThreadActivity) -> RenderableActivity? {
        switch activity.kind {
        case "tool.started", "task.started", "context-window.updated":
            return nil
        case "approval.requested", "approval.resolved",
             "user-input.requested", "user-input.resolved",
             "turn.plan.updated":
            return nil
        default:
            break
        }
        if activity.summary == "Checkpoint captured" { return nil }
        if isPlanBoundaryToolActivity(activity) { return nil }

        let payload = activity.payload
        let title = trimNonEmpty(payload?["title"].stringValue) ?? activity.summary
        let command = extractCommand(payload: payload)
        let files = extractChangedFiles(payload: payload)
        let detail = extractDetail(payload: payload, title: title, hasCommand: command != nil)
        let icon = pickIcon(activity: activity,
                            payload: payload,
                            hasCommand: command != nil,
                            hasFiles: !files.isEmpty)
        let tone = pickTone(activity: activity)
        let inProgress = activity.kind == "tool.updated" || activity.kind == "task.progress"

        return RenderableActivity(
            id: activity.id,
            createdAt: activity.createdAt,
            turnId: activity.turnId,
            title: title,
            detail: detail,
            command: command,
            changedFiles: files,
            iconName: icon,
            tone: tone,
            isInProgress: inProgress
        )
    }

    // MARK: - Collapsing

    /// Folds tool lifecycle entries with the same `data.toolCallId` so that
    /// `tool.updated` followed by `tool.completed` appears as a single row.
    /// Mirrors the desktop's `collapseDerivedWorkLogEntries`.
    static func collapse(_ activities: [ThreadActivity]) -> [RenderableActivity] {
        let ordered = activities.sorted {
            if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
            return $0.id < $1.id
        }

        var byKey: [String: RenderableActivity] = [:]
        var orderedKeys: [String] = []

        for activity in ordered {
            guard let rendered = RenderableActivity.from(activity) else { continue }
            let key = collapseKey(for: activity) ?? rendered.id
            if let existing = byKey[key] {
                let merged = merge(previous: existing, next: rendered)
                byKey[key] = merged
            } else {
                byKey[key] = rendered
                orderedKeys.append(key)
            }
        }
        return orderedKeys.compactMap { byKey[$0] }
    }

    private static func merge(previous: RenderableActivity,
                              next: RenderableActivity) -> RenderableActivity {
        // Keep the earliest createdAt (so chronological ordering is stable as
        // updates flow in), but adopt the most recent state for everything
        // else. Title/command/files prefer non-empty values from either side.
        let title = next.title.isEmpty ? previous.title : next.title
        let command = next.command ?? previous.command
        let files = !next.changedFiles.isEmpty ? next.changedFiles : previous.changedFiles
        let detail = next.detail ?? previous.detail
        return RenderableActivity(
            id: previous.id,
            createdAt: previous.createdAt,
            turnId: next.turnId ?? previous.turnId,
            title: title,
            detail: detail,
            command: command,
            changedFiles: files,
            iconName: next.iconName,
            tone: next.tone,
            isInProgress: next.isInProgress
        )
    }

    private static func collapseKey(for activity: ThreadActivity) -> String? {
        switch activity.kind {
        case "tool.updated", "tool.completed":
            let data = activity.payload?["data"].objectValue
            if let toolCallId = data?["toolCallId"].stringValue, !toolCallId.isEmpty {
                return "tool:" + toolCallId
            }
            return nil
        default:
            return nil
        }
    }

    // MARK: - Payload extraction

    private static func trimNonEmpty(_ s: String?) -> String? {
        guard let s = s else { return nil }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func extractCommand(payload: [String: AnyCodable]?) -> String? {
        guard let payload = payload else { return nil }
        let data = payload["data"].objectValue
        let item = data?["item"].objectValue
        let itemInput = item?["input"].objectValue
        let itemResult = item?["result"].objectValue
        let candidates: [AnyCodable?] = [
            item?["command"],
            itemInput?["command"],
            itemResult?["command"],
            data?["command"]
        ]
        for c in candidates {
            if let s = normalizeCommand(c) { return s }
        }
        if payload["itemType"].stringValue == "command_execution",
           let detail = trimNonEmpty(payload["detail"].stringValue) {
            return stripExitCodeSuffix(detail)
        }
        return nil
    }

    private static func normalizeCommand(_ value: AnyCodable?) -> String? {
        guard let value = value else { return nil }
        switch value.value {
        case .string(let s):
            return trimNonEmpty(s)
        case .array(let parts):
            let strings = parts.compactMap { $0.stringValue }
            guard strings.count == parts.count, !strings.isEmpty else { return nil }
            return strings.map { quoteIfNeeded($0) }.joined(separator: " ")
        default:
            return nil
        }
    }

    private static func quoteIfNeeded(_ s: String) -> String {
        if s.isEmpty { return "\"\"" }
        let needsQuoting = s.rangeOfCharacter(from: .whitespacesAndNewlines) != nil
            || s.contains("\"")
            || s.contains("'")
        guard needsQuoting else { return s }
        let escaped = s.replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }

    private static func extractChangedFiles(payload: [String: AnyCodable]?) -> [String] {
        guard let payload = payload else { return [] }
        let data = payload["data"].objectValue
        let item = data?["item"].objectValue
        let candidates: [[AnyCodable]?] = [
            item?["changedFiles"].arrayValue,
            data?["changedFiles"].arrayValue,
            data?["files"].arrayValue
        ]
        for arr in candidates {
            if let arr = arr {
                let strings = arr.compactMap { $0.stringValue }
                if !strings.isEmpty { return strings }
            }
        }
        return []
    }

    private static func extractDetail(payload: [String: AnyCodable]?,
                                      title: String,
                                      hasCommand: Bool) -> String? {
        guard let payload = payload else { return nil }
        if hasCommand { return nil }
        guard let raw = trimNonEmpty(payload["detail"].stringValue) else { return nil }
        let stripped = stripExitCodeSuffix(raw)
        if stripped.lowercased() == title.lowercased() { return nil }
        return stripped
    }

    private static func stripExitCodeSuffix(_ s: String) -> String {
        let pattern = #"^([\s\S]*?)(?:\s*<exited with exit code \d+>)\s*$"#
        if let regex = try? NSRegularExpression(pattern: pattern, options: []),
           let match = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
           let range = Range(match.range(at: 1), in: s) {
            return String(s[range]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func pickIcon(activity: ThreadActivity,
                                 payload: [String: AnyCodable]?,
                                 hasCommand: Bool,
                                 hasFiles: Bool) -> String {
        if let itemType = payload?["itemType"].stringValue {
            switch itemType {
            case "command_execution":
                return "terminal"
            case "file_read":
                return "doc.text.magnifyingglass"
            case "file_change", "file_write", "apply_patch":
                return "pencil.line"
            case "task_progress":
                return "ellipsis.bubble"
            case "task_completed":
                return "checkmark.circle"
            case "search", "web_search":
                return "magnifyingglass"
            case "fetch_url", "web_fetch":
                return "globe"
            default:
                break
            }
        }
        if hasCommand { return "terminal" }
        if hasFiles { return "pencil.line" }
        switch activity.kind {
        case "task.progress": return "ellipsis.bubble"
        case "task.completed": return "checkmark.circle"
        case "tool.completed", "tool.updated": return "wrench.and.screwdriver"
        case "provider.error", "tool.error": return "exclamationmark.triangle.fill"
        default: break
        }
        return "sparkles"
    }

    private static func pickTone(activity: ThreadActivity) -> ActivityTone {
        switch activity.kind {
        case "task.progress": return .thinking
        case "task.completed": return .success
        case "tool.updated", "tool.completed": return .tool
        case "provider.error", "tool.error": return .error
        default: break
        }
        switch activity.tone.lowercased() {
        case "tool": return .tool
        case "thinking": return .thinking
        case "error", "failure": return .error
        case "approval": return .approval
        case "success": return .success
        default: return .info
        }
    }

    private static func isPlanBoundaryToolActivity(_ activity: ThreadActivity) -> Bool {
        guard activity.kind == "tool.updated" || activity.kind == "tool.completed" else {
            return false
        }
        if let detail = activity.payload?["detail"].stringValue,
           detail.hasPrefix("ExitPlanMode:") {
            return true
        }
        return false
    }
}
