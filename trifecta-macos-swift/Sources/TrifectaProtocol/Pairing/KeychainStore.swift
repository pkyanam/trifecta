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
/// An in-memory cache is maintained so the keychain is accessed at most once per app session.
/// All callers run on @MainActor; no lock is needed on the cache.
public struct KeychainStore {
    private static let service = "ai.belweave.trifecta.session-tokens"

    // Populated on first load; cleared on delete. Eliminates repeated keychain prompts
    // within a single app session and prevents the reconnect loop from re-prompting.
    private static var cache: [UUID: String] = [:]

    // MARK: - Save

    public static func save(token: String, for id: UUID) throws {
        cache[id] = token

        let account = id.uuidString
        let data = Data(token.utf8)

        // Build the add query. Attach Touch ID / device-passcode access control where
        // available, so future first-load prompts use biometry instead of the login
        // keychain password dialog.
        var addQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecValueData: data,
        ]
        var cfErr: Unmanaged<CFError>?
        if let ac = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .userPresence,
            &cfErr
        ) {
            addQuery[kSecAttrAccessControl] = ac
        }

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecDuplicateItem {
            // Item already exists — update data only (preserve existing access control).
            let query: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: account,
            ]
            let attrs: [CFString: Any] = [kSecValueData: data]
            let updateStatus = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
            if updateStatus != errSecSuccess { throw KeychainError.unhandledError(updateStatus) }
        } else if addStatus != errSecSuccess {
            throw KeychainError.unhandledError(addStatus)
        }
    }

    // MARK: - Load

    public static func load(for id: UUID) throws -> String? {
        if let cached = cache[id] { return cached }

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
