import Foundation

// MARK: - Pairing URL

/// Parsed representation of a Trifecta pairing URL.
///
/// Supported formats:
///   1. Full hosted pairing URL:
///      `https://app.trifecta.belweave.ai/pair?host=https://backend.example.com:3773#token=PAIRCODE`
///   2. Direct URL (just the backend base):
///      `http://localhost:3773`  + token supplied separately
public struct PairingURL {
    public let httpBaseURL: URL
    public let token: String

    /// Parse from a full pairing URL.
    public static func parse(string: String) throws -> PairingURL {
        guard let components = URLComponents(string: string) else {
            throw PairingError.invalidURL("Cannot parse URL: \(string)")
        }
        // Hosted pairing: host= query param, token= in fragment
        if let hostParam = components.queryItems?.first(where: { $0.name == "host" }),
           let rawHost = hostParam.value,
           let fragment = components.fragment {
            guard let hostURL = URL(string: rawHost) else {
                throw PairingError.invalidURL("Invalid host URL: \(rawHost)")
            }
            let token = try parseToken(from: fragment)
            return PairingURL(httpBaseURL: hostURL, token: token)
        }
        // Fragment-only: http://host:port/pair#token=PAIRCODE or http://host:port#PAIRCODE
        // Strip the path — the /pair route is the server's pairing UI, not the API base.
        // API base is always just scheme://host:port.
        if let fragment = components.fragment, !fragment.isEmpty {
            let token = try parseToken(from: fragment)
            var origin = components
            origin.path = ""
            origin.query = nil
            origin.fragment = nil
            guard let baseURL = origin.url else {
                throw PairingError.invalidURL("Cannot reconstruct base URL")
            }
            return PairingURL(httpBaseURL: baseURL, token: token)
        }
        throw PairingError.invalidURL(
            "No token found. Expected ?host=<url>#token=PAIRCODE or <url>#token=PAIRCODE"
        )
    }

    /// Parse from explicit host + token (for CLI --host / --token flags).
    public static func direct(host: String, token: String) throws -> PairingURL {
        guard let url = URL(string: host) else {
            throw PairingError.invalidURL("Invalid host URL: \(host)")
        }
        return PairingURL(httpBaseURL: url, token: token)
    }

    private static func parseToken(from fragment: String) throws -> String {
        // Fragment may be "token=PAIRCODE" or just "PAIRCODE"
        if fragment.hasPrefix("token=") {
            let value = String(fragment.dropFirst("token=".count))
            if value.isEmpty { throw PairingError.invalidURL("Empty token in fragment") }
            return value
        }
        if !fragment.isEmpty { return fragment }
        throw PairingError.invalidURL("Empty fragment — expected token=PAIRCODE")
    }
}

// MARK: - Errors

public enum PairingError: Error, LocalizedError {
    case invalidURL(String)
    case httpError(statusCode: Int, body: String)
    case decodingError(String)
    case networkError(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidURL(let msg): "Invalid URL: \(msg)"
        case .httpError(let code, let body): "HTTP \(code): \(body)"
        case .decodingError(let msg): "Decode error: \(msg)"
        case .networkError(let e): "Network error: \(e.localizedDescription)"
        }
    }
}

// MARK: - HTTP helpers

private let jsonDecoder = JSONDecoder()

private func fetchJSON<T: Decodable>(
    url: URL,
    method: String = "GET",
    bearerToken: String? = nil,
    body: (some Encodable)? = nil as String?
) async throws -> T {
    var request = URLRequest(url: url)
    request.httpMethod = method
    if let bearerToken {
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    }
    if let body {
        let data = try JSONEncoder().encode(body)
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (data, response): (Data, URLResponse)
    do {
        (data, response) = try await URLSession.shared.data(for: request)
    } catch {
        throw PairingError.networkError(error)
    }
    guard let http = response as? HTTPURLResponse else {
        throw PairingError.networkError(URLError(.badServerResponse))
    }
    guard (200..<300).contains(http.statusCode) else {
        let body = String(data: data, encoding: .utf8) ?? ""
        throw PairingError.httpError(statusCode: http.statusCode, body: body)
    }
    do {
        return try jsonDecoder.decode(T.self, from: data)
    } catch {
        throw PairingError.decodingError("\(error)")
    }
}

private func endpoint(_ base: URL, _ path: String) -> URL {
    var components = URLComponents(url: base, resolvingAgainstBaseURL: false)!
    let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
    let suffix = path.hasPrefix("/") ? path : "/\(path)"
    components.path = basePath.isEmpty ? suffix : basePath + suffix
    components.query = nil
    components.fragment = nil
    return components.url!
}

// MARK: - PairingClient

public struct PairingClient {
    public let httpBaseURL: URL

    public init(httpBaseURL: URL) {
        self.httpBaseURL = httpBaseURL
    }

    /// Exchange a one-time pairing token for a bearer session token.
    public func bootstrap(credential: String) async throws -> AuthBearerBootstrapResult {
        struct Body: Encodable { let credential: String }
        return try await fetchJSON(
            url: endpoint(httpBaseURL, "/api/auth/bootstrap/bearer"),
            method: "POST",
            body: Body(credential: credential)
        )
    }

    /// Verify an existing bearer session token.
    public func sessionState(bearerToken: String) async throws -> AuthSessionState {
        return try await fetchJSON(
            url: endpoint(httpBaseURL, "/api/auth/session"),
            bearerToken: bearerToken
        )
    }

    /// Mint a short-lived WebSocket ticket from a bearer session token.
    public func mintWebSocketToken(bearerToken: String) async throws -> AuthWebSocketTokenResult {
        return try await fetchJSON(
            url: endpoint(httpBaseURL, "/api/auth/ws-token"),
            method: "POST",
            bearerToken: bearerToken
        )
    }

    /// Build the authenticated WebSocket URL.
    ///
    /// Converts http(s):// → ws(s)://, appends /ws to the path, and attaches wsToken as a query param.
    public func webSocketURL(wsToken: String) -> URL {
        var components = URLComponents(url: httpBaseURL, resolvingAgainstBaseURL: false)!
        components.scheme = httpBaseURL.scheme == "https" ? "wss" : "ws"
        let path = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = (path.isEmpty || path == "/") ? "/ws" : "\(path)/ws"
        components.queryItems = [URLQueryItem(name: "wsToken", value: wsToken)]
        components.fragment = nil
        return components.url!
    }
}
