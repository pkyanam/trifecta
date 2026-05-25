import Foundation

// Minimal ServerConfig for M0 display — full typed struct deferred until M2+.
// We decode the fields we care about for the conformance test and
// keep the rest opaque (JSONValue).

public struct ServerConfigMinimal: Decodable {
    public let cwd: String
    public let providers: [ServerProviderMinimal]
    public let settings: JSONValue
}

public struct ServerProviderMinimal: Decodable {
    public let instanceId: String
    public let driver: String
    public let displayName: String?
    public let enabled: Bool
    public let installed: Bool
    public let status: String
    public let version: String?
}
