import Foundation

enum EffectRPCMessage {
    case request(id: String, tag: String, payload: Any, headers: [[String]])
    case streamRequest(id: String, tag: String, payload: Any, headers: [[String]])
    case interrupt(requestId: String, interruptors: [String])
    case ack(requestId: String)
    case ping
    case eof

    case chunk(requestId: String, values: [Any])
    case exit(requestId: String, success: Bool, value: Any?, errorTag: String?, errorMessage: String?)
    case pong
    case defect(message: String)
    case unknown(json: Any)

    var isOutbound: Bool {
        switch self {
        case .request, .streamRequest, .interrupt, .ack, .ping, .pong, .eof: true
        default: false
        }
    }
}

enum EffectRPCEncoder {
    static func encode(_ message: EffectRPCMessage) throws -> Data {
        try JSONSerialization.data(withJSONObject: encodeOne(message), options: [])
    }

    private static func encodeOne(_ msg: EffectRPCMessage) -> [String: Any] {
        switch msg {
        case let .request(id, tag, payload, headers):
            return ["_tag": "Request", "id": id, "tag": tag,
                    "payload": payload, "headers": headers,
                    "spanId": randomHex(count: 16), "traceId": randomHex(count: 32),
                    "sampled": false]
        case let .streamRequest(id, tag, payload, headers):
            return ["_tag": "Request", "id": id, "tag": tag,
                    "payload": payload, "headers": headers,
                    "spanId": randomHex(count: 16), "traceId": randomHex(count: 32),
                    "sampled": false]
        case let .interrupt(requestId, interruptors):
            return ["_tag": "Interrupt", "requestId": requestId, "interruptors": interruptors]
        case let .ack(requestId):
            return ["_tag": "Ack", "requestId": requestId]
        case .ping:
            return ["_tag": "Ping"]
        case .pong:
            return ["_tag": "Pong"]
        case .eof:
            return ["_tag": "Eof"]
        default:
            return [:]
        }
    }

    private static func randomHex(count: Int) -> String {
        UUID().uuidString
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
            .prefix(count)
            .description
    }
}

enum EffectRPCDecoder {
    static func decodeFrame(_ data: Data) throws -> [EffectRPCMessage] {
        let raw = try JSONSerialization.jsonObject(with: data)
        if let array = raw as? [Any] {
            return try array.map(decodeOne)
        }
        return [try decodeOne(raw)]
    }

    private static func decodeOne(_ any: Any) throws -> EffectRPCMessage {
        guard let dict = any as? [String: Any], let tag = dict["_tag"] as? String else {
            return .unknown(json: any)
        }
        switch tag {
        case "Ping":
            return .ping
        case "Pong":
            return .pong
        case "Chunk":
            let id = (dict["requestId"] as? String) ?? ""
            let values = (dict["values"] as? [Any]) ?? []
            return .chunk(requestId: id, values: values)
        case "Exit":
            let id = (dict["requestId"] as? String) ?? ""
            let exit = dict["exit"] as? [String: Any] ?? [:]
            let exitTag = exit["_tag"] as? String ?? "Failure"
            if exitTag == "Success" {
                return .exit(requestId: id, success: true, value: exit["value"],
                             errorTag: nil, errorMessage: nil)
            } else {
                let cause = exit["cause"] as? [String: Any] ?? [:]
                let error = findErrorPayload(in: cause)
                let errorMessage = findErrorMessage(in: cause) ?? "Server error"
                let errorTag = error?["_tag"] as? String
                return .exit(requestId: id, success: false, value: nil,
                             errorTag: errorTag, errorMessage: errorMessage)
            }
        case "Defect":
            let message = (dict["defect"] as? String) ?? "Unknown server defect"
            return .defect(message: message)
        case "ClientProtocolError":
            let message = (dict["error"] as? String) ?? "Client protocol error"
            return .defect(message: message)
        default:
            return .unknown(json: any)
        }
    }

    private static func findErrorPayload(in value: Any) -> [String: Any]? {
        if let dict = value as? [String: Any] {
            if let error = dict["error"] as? [String: Any] {
                return error
            }
            for child in dict.values {
                if let found = findErrorPayload(in: child) {
                    return found
                }
            }
        } else if let array = value as? [Any] {
            for child in array {
                if let found = findErrorPayload(in: child) {
                    return found
                }
            }
        }
        return nil
    }

    private static func findErrorMessage(in value: Any) -> String? {
        if let dict = value as? [String: Any] {
            if let message = taggedErrorMessage(in: dict) {
                return message
            }
            for key in ["message", "detail", "reason", "description", "errorDescription", "defect"] {
                if let message = dict[key] as? String,
                   !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   !isRawFingerprint(message) {
                    return message
                }
            }
            for key in ["error", "cause", "failure", "defect"] {
                if let child = dict[key],
                   let found = findErrorMessage(in: child) {
                    return found
                }
            }
            for (key, child) in dict where !ignoredErrorValueKeys.contains(key) {
                if let found = findErrorMessage(in: child) {
                    return found
                }
            }
        } else if let array = value as? [Any] {
            for child in array {
                if let found = findErrorMessage(in: child) {
                    return found
                }
            }
        } else if let message = value as? String,
                  !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  !isRawFingerprint(message) {
            return message
        }
        return nil
    }

    private static let ignoredErrorValueKeys = Set([
        "_tag", "id", "requestId", "tag", "sessionId", "hostId",
        "fingerprintSha256", "expectedFingerprint", "actualFingerprint",
    ])

    private static func taggedErrorMessage(in dict: [String: Any]) -> String? {
        guard let tag = dict["_tag"] as? String else { return nil }
        switch tag {
        case "SshHostProfileNotFoundError":
            return "SSH host profile was not found. Refresh the host list and try again."
        case "SshHostProfileConflictError":
            return "An SSH host with this label or address already exists."
        case "SshHostKeyMismatchError":
            let hostname = dict["hostname"] as? String ?? "host"
            let port = dict["port"].map { "\($0)" } ?? "22"
            return "Host key mismatch for \(hostname):\(port). Refusing to connect."
        case "SshSessionNotFoundError":
            return "SSH session is no longer active. Reconnect and try again."
        case "SshSessionTokenInvalidError":
            let reason = dict["reason"] as? String ?? "invalid"
            return "SSH session token rejected (\(reason)). Reconnect and try again."
        case "SshAuthorizationError":
            let reason = dict["reason"] as? String ?? "not authorized"
            return "SSH operation denied: \(reason)"
        case "SshSessionLimitError":
            let limit = dict["limit"].map { "\($0)" } ?? "maximum"
            return "SSH session limit reached (\(limit)). Close another SSH session and try again."
        default:
            return nil
        }
    }

    private static func isRawFingerprint(_ text: String) -> Bool {
        text.hasPrefix("SHA256:") && !text.contains(" ")
    }
}
