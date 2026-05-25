import Foundation
import Security

public enum KeychainError: Error, LocalizedError {
    case unexpectedData
    case unhandledError(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .unexpectedData: "Unexpected Keychain data format"
        case .unhandledError(let s): "Keychain error: OSStatus \(s)"
        }
    }
}

/// Simple Keychain wrapper for storing one bearer session token per environment UUID.
///
/// Items are stored with kSecAttrAccessibleWhenUnlocked — no user-presence prompt required.
/// An in-memory cache is maintained so the keychain is hit at most once per app session.
/// All callers run on @MainActor; no lock is needed on the cache.
public struct KeychainStore {
    // v2 service name avoids conflicts with older items that have access-control prompts
    private static let service = "ai.belweave.trifecta.session-tokens.v2"
    private static let legacyService = "ai.belweave.trifecta.session-tokens"

    private static var cache: [UUID: String] = [:]

    // MARK: - Save

    public static func save(token: String, for id: UUID) throws {
        cache[id] = token

        let account = id.uuidString
        let data = Data(token.utf8)

        // Delete any existing item (legacy or current) before adding fresh, so we never
        // have to do a SecItemUpdate that might trigger access-control prompts.
        for svc in [service, legacyService] {
            let deleteQuery: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: svc,
                kSecAttrAccount: account,
            ]
            SecItemDelete(deleteQuery as CFDictionary)
        }

        let addQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlocked,
        ]
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        if status != errSecSuccess { throw KeychainError.unhandledError(status) }
    }

    // MARK: - Load

    public static func load(for id: UUID) throws -> String? {
        if let cached = cache[id] { return cached }

        // Try current service first, then legacy (which may have access-control items).
        for svc in [service, legacyService] {
            let query: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: svc,
                kSecAttrAccount: id.uuidString,
                kSecReturnData: true,
                kSecMatchLimit: kSecMatchLimitOne,
            ]
            var ref: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &ref)
            if status == errSecItemNotFound { continue }
            if status != errSecSuccess { throw KeychainError.unhandledError(status) }
            guard let data = ref as? Data, let token = String(data: data, encoding: .utf8) else {
                throw KeychainError.unexpectedData
            }
            cache[id] = token
            // Migrate legacy item to current service (no access-control) silently
            if svc == legacyService { try? save(token: token, for: id) }
            return token
        }
        return nil
    }

    // MARK: - Delete

    public static func delete(for id: UUID) throws {
        cache.removeValue(forKey: id)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: id.uuidString,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unhandledError(status)
        }
    }
}
