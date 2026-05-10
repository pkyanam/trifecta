import Foundation

enum ProviderOptionValue: Codable, Hashable, Sendable {
    case string(String)
    case bool(Bool)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let value = try? c.decode(Bool.self) {
            self = .bool(value)
        } else {
            self = .string(try c.decode(String.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try c.encode(value)
        case .bool(let value):
            try c.encode(value)
        }
    }

    var jsonValue: Any {
        switch self {
        case .string(let value): value
        case .bool(let value): value
        }
    }
}

struct ProviderOptionSelection: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let value: ProviderOptionValue

    var encoded: [String: Any] {
        ["id": id, "value": value.jsonValue]
    }
}

struct ModelSelection: Codable, Hashable, Sendable {
    let instanceId: ProviderInstanceID
    let model: String
    let options: [ProviderOptionSelection]?

    init(instanceId: ProviderInstanceID, model: String, options: [ProviderOptionSelection]? = nil) {
        self.instanceId = instanceId
        self.model = model
        self.options = options
    }

    private enum CodingKeys: String, CodingKey {
        case instanceId, provider, model, options
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let instanceId = try c.decodeIfPresent(ProviderInstanceID.self, forKey: .instanceId) {
            self.instanceId = instanceId
        } else {
            self.instanceId = try c.decode(ProviderInstanceID.self, forKey: .provider)
        }
        model = try c.decode(String.self, forKey: .model)
        if let arrayOptions = try? c.decodeIfPresent([ProviderOptionSelection].self, forKey: .options) {
            options = arrayOptions
        } else if let objectOptions = try? c.decodeIfPresent([String: ProviderOptionValue].self, forKey: .options) {
            options = objectOptions
                .map { ProviderOptionSelection(id: $0.key, value: $0.value) }
                .sorted { $0.id < $1.id }
        } else {
            options = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(instanceId, forKey: .instanceId)
        try c.encode(model, forKey: .model)
        try c.encodeIfPresent(options, forKey: .options)
    }

    var encoded: [String: Any] {
        var out: [String: Any] = [
            "instanceId": instanceId.rawValue,
            "model": model
        ]
        if let options {
            out["options"] = options.map(\.encoded)
        }
        return out
    }
}
