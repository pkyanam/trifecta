import Foundation

// Mirrors packages/contracts/src/auth.ts

public struct AuthBearerBootstrapResult: Decodable {
    public let authenticated: Bool
    public let role: String
    public let sessionMethod: String
    public let expiresAt: String
    public let sessionToken: String
}

public struct AuthWebSocketTokenResult: Decodable {
    public let token: String
    public let expiresAt: String
}

public struct AuthServerDescriptor: Decodable {
    public let policy: String
    public let bootstrapMethods: [String]
    public let sessionMethods: [String]
}

public struct AuthSessionState: Decodable {
    public let authenticated: Bool
    public let auth: AuthServerDescriptor
    public let role: String?
    public let sessionMethod: String?
    public let expiresAt: String?
}
