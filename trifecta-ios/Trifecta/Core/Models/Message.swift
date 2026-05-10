import Foundation

enum MessageRole: String, Codable, Sendable {
    case user, assistant, system
}

struct ChatImageAttachment: Codable, Hashable, Sendable, Identifiable {
    var id: String
    let type: String
    let name: String
    let mimeType: String
    let sizeBytes: Int
    /// Inline image as `data:image/...;base64,...` when the server echoes upload content.
    let dataUrl: String?
    /// Remote asset URL when the server stores images separately.
    let url: String?

    private enum CodingKeys: String, CodingKey {
        case id, type, name, mimeType, sizeBytes, dataUrl, dataURL, url
    }

    init(id: String,
         type: String = "image",
         name: String = "",
         mimeType: String = "image/jpeg",
         sizeBytes: Int = 0,
         dataUrl: String? = nil,
         url: String? = nil) {
        self.id = id
        self.type = type
        self.name = name
        self.mimeType = mimeType
        self.sizeBytes = sizeBytes
        self.dataUrl = dataUrl
        self.url = url
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "image"
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        mimeType = try c.decodeIfPresent(String.self, forKey: .mimeType) ?? "image/jpeg"
        sizeBytes = try c.decodeIfPresent(Int.self, forKey: .sizeBytes) ?? 0
        dataUrl = try c.decodeIfPresent(String.self, forKey: .dataUrl)
            ?? c.decodeIfPresent(String.self, forKey: .dataURL)
        url = try c.decodeIfPresent(String.self, forKey: .url)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(name, forKey: .name)
        try c.encode(mimeType, forKey: .mimeType)
        try c.encode(sizeBytes, forKey: .sizeBytes)
        try c.encodeIfPresent(dataUrl, forKey: .dataUrl)
        try c.encodeIfPresent(url, forKey: .url)
    }
}

extension ChatImageAttachment {
    /// Decodes attachment objects from JSON-RPC / WebSocket payloads (looser than `Codable` snapshots).
    init?(dictionary: [String: Any]) {
        let id = (dictionary["id"] as? String) ?? UUID().uuidString
        let type = (dictionary["type"] as? String) ?? "image"
        let name = (dictionary["name"] as? String) ?? ""
        let mimeType = (dictionary["mimeType"] as? String) ?? "image/jpeg"
        let sizeBytes: Int
        if let i = dictionary["sizeBytes"] as? Int {
            sizeBytes = i
        } else if let n = dictionary["sizeBytes"] as? NSNumber {
            sizeBytes = n.intValue
        } else {
            sizeBytes = 0
        }
        let dataUrl = (dictionary["dataUrl"] as? String) ?? (dictionary["dataURL"] as? String)
        let url = dictionary["url"] as? String
        self.init(id: id, type: type, name: name, mimeType: mimeType, sizeBytes: sizeBytes, dataUrl: dataUrl, url: url)
    }
}

struct Message: Codable, Hashable, Sendable, Identifiable {
    let id: MessageID
    let role: MessageRole
    var text: String
    var attachments: [ChatImageAttachment]?
    let turnId: TurnID?
    var streaming: Bool
    let createdAt: Date
    var updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, role, text, attachments, turnId, streaming, createdAt, updatedAt
    }

    init(id: MessageID, role: MessageRole, text: String,
         attachments: [ChatImageAttachment]? = nil, turnId: TurnID? = nil,
         streaming: Bool = false, createdAt: Date = Date(),
         updatedAt: Date = Date()) {
        self.id = id
        self.role = role
        self.text = text
        self.attachments = attachments
        self.turnId = turnId
        self.streaming = streaming
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(MessageID.self, forKey: .id)
        role = try c.decode(MessageRole.self, forKey: .role)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        attachments = try c.decodeIfPresent([ChatImageAttachment].self, forKey: .attachments)
        turnId = try c.decodeIfPresent(TurnID.self, forKey: .turnId)
        streaming = try c.decode(Bool.self, forKey: .streaming)
        createdAt = try ISO8601Decoder.decodeDate(c, key: .createdAt)
        updatedAt = try ISO8601Decoder.decodeDate(c, key: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(role, forKey: .role)
        try c.encode(text, forKey: .text)
        try c.encodeIfPresent(attachments, forKey: .attachments)
        try c.encodeIfPresent(turnId, forKey: .turnId)
        try c.encode(streaming, forKey: .streaming)
        try c.encode(ISO8601Decoder.formatter.string(from: createdAt), forKey: .createdAt)
        try c.encode(ISO8601Decoder.formatter.string(from: updatedAt), forKey: .updatedAt)
    }
}

nonisolated enum ISO8601Decoder {
    nonisolated(unsafe) static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) static let formatterNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func decodeDate<K: CodingKey>(_ container: KeyedDecodingContainer<K>,
                                         key: K) throws -> Date {
        let raw = try container.decode(String.self, forKey: key)
        return parse(raw) ?? Date()
    }

    static func parse(_ raw: String) -> Date? {
        if let d = formatter.date(from: raw) { return d }
        return formatterNoFraction.date(from: raw)
    }
}
