import Foundation

struct ProjectSearchEntry: Decodable, Hashable, Sendable {
    let path: String
    let kind: String
    let parentPath: String?

    var isDirectory: Bool { kind == "directory" }
}

struct ProjectSearchEntriesResult: Decodable, Sendable {
    let entries: [ProjectSearchEntry]
    let truncated: Bool
}
