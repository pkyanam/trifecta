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
/// Items are protected by SecAccessControl with .userPresence (Touch ID preferred, passcode
/// fallback). This avoids app-ACL password dialogs that appear when the binary path changes
/// between builds. The in-memory cache ensures at most one biometric scan per app session.
/// All callers run on @MainActor; no lock is needed on the cache.
public struct KeychainStore {
    // v2 service name so old items with traditional app-ACLs (which prompt for password)
    // are never touched. Old environments will need to re-pair once.
    private static let service = "ai.belweave.trifecta.session-tokens.v2"

    private static var cache: [UUID: String] = [:]

    // MARK: - Save

    public static func save(token: String, for id: UUID) throws {
        cache[id] = token

        let account = id.uuidString
        let data = Data(token.utf8)

        // Delete-then-add avoids SecItemUpdate, which can trigger its own auth prompt.
        let deleteQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // SecAccessControl with .userPresence: Touch ID preferred, passcode fallback.
        // This policy is identity-independent (not tied to the app binary path), so the
        // same item works across debug/release builds and swift run invocations.
        var addQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecValueData: data,
        ]
        // kSecAttrAccessibleWhenUnlocked (not ThisDeviceOnly) avoids Secure Enclave and
        // the keychain-access-groups entitlement requirement — compatible with swift run
        // ad-hoc signing. .userPresence still enforces Touch ID / passcode on read.
        var cfErr: Unmanaged<CFError>?
        if let ac = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlocked,
            .userPresence,
            &cfErr
        ) {
            addQuery[kSecAttrAccessControl] = ac
        } else {
            addQuery[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlocked
        }

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        if status != errSecSuccess { throw KeychainError.unhandledError(status) }
    }

    // MARK: - Load

    public static func load(for id: UUID) throws -> String? {
        if let cached = cache[id] { return cached }

        // Only look in v2. Old items (v1 with app-ACL) are deliberately skipped to
        // avoid the macOS password dialog that appears when the binary path changes.
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: id.uuidString,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var ref: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &ref)
        if status == errSecItemNotFound { return nil }
        if status != errSecSuccess { throw KeychainError.unhandledError(status) }
        guard let data = ref as? Data, let token = String(data: data, encoding: .utf8) else {
            throw KeychainError.unexpectedData
        }
        cache[id] = token
        return token
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
