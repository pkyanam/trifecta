import Foundation

public struct SavedEnvironment: Identifiable, Codable, Sendable, Hashable {
    public let id: UUID
    public var label: String
    public var httpBaseURL: URL

    public init(id: UUID = UUID(), label: String, httpBaseURL: URL) {
        self.id = id
        self.label = label
        self.httpBaseURL = httpBaseURL
    }
}
