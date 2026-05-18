// FILE: ProviderOptionSelection.swift
// Purpose: Canonical provider option selections aligned with trifecta-desktop modelSelection.options.
// Layer: Model
// Exports: ProviderOptionSelection, ModelProviderSelectDescriptor, ModelProviderSelectChoice
// Depends on: Foundation

import Foundation

struct ProviderOptionSelection: Codable, Equatable, Hashable, Sendable {
    let id: String
    let stringValue: String?
    let boolValue: Bool?

    init(id: String, stringValue: String) {
        self.id = id
        self.stringValue = stringValue
        self.boolValue = nil
    }

    init(id: String, boolValue: Bool) {
        self.id = id
        self.stringValue = nil
        self.boolValue = boolValue
    }

    func encodedValue() -> Any {
        if let boolValue {
            return boolValue
        }
        return stringValue ?? ""
    }

    static func from(dictionary: [String: Any]) -> ProviderOptionSelection? {
        guard let id = (dictionary["id"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !id.isEmpty else {
            return nil
        }

        if let boolValue = dictionary["value"] as? Bool {
            return ProviderOptionSelection(id: id, boolValue: boolValue)
        }

        if let stringValue = dictionary["value"] as? String {
            let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            return ProviderOptionSelection(id: id, stringValue: trimmed)
        }

        return nil
    }

    static func fromLegacyObject(_ object: [String: Any]) -> [ProviderOptionSelection] {
        var selections: [ProviderOptionSelection] = []
        for (key, value) in object {
            let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalizedKey.isEmpty else { continue }
            if let boolValue = value as? Bool {
                selections.append(ProviderOptionSelection(id: normalizedKey, boolValue: boolValue))
            } else if let stringValue = value as? String {
                let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                selections.append(ProviderOptionSelection(id: normalizedKey, stringValue: trimmed))
            }
        }
        return selections
    }

    func toDictionary() -> [String: Any] {
        [
            "id": id,
            "value": encodedValue(),
        ]
    }
}

struct ModelProviderSelectChoice: Codable, Equatable, Hashable, Sendable {
    let id: String
    let label: String
    let isDefault: Bool

    init(id: String, label: String, isDefault: Bool = false) {
        self.id = id
        self.label = label
        self.isDefault = isDefault
    }
}

struct ModelProviderSelectDescriptor: Codable, Equatable, Hashable, Sendable {
    let id: String
    let label: String
    let options: [ModelProviderSelectChoice]
    let currentValue: String?

    var isContextWindow: Bool {
        id.lowercased() == "contextwindow"
    }

    var isReasoningEffort: Bool {
        let normalized = id
            .lowercased()
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "_", with: "")
        return ["effort", "reasoning", "reasoningeffort"].contains(normalized)
    }
}

struct ComposerModelSelection: Codable, Equatable, Sendable {
    var instanceId: String?
    var model: String?
    var options: [ProviderOptionSelection]

    init(
        instanceId: String? = nil,
        model: String? = nil,
        options: [ProviderOptionSelection] = []
    ) {
        self.instanceId = instanceId
        self.model = model
        self.options = options
    }

    static func from(dictionary: [String: Any]) -> ComposerModelSelection {
        let instanceId = (dictionary["instanceId"] as? String)
            ?? (dictionary["providerInstanceId"] as? String)
            ?? (dictionary["provider"] as? String)
        let model = (dictionary["model"] as? String)
            ?? (dictionary["modelId"] as? String)
            ?? (dictionary["slug"] as? String)

        let options: [ProviderOptionSelection]
        if let array = dictionary["options"] as? [[String: Any]] {
            options = array.compactMap(ProviderOptionSelection.from(dictionary:))
        } else if let legacyObject = dictionary["options"] as? [String: Any] {
            options = ProviderOptionSelection.fromLegacyObject(legacyObject)
        } else {
            options = []
        }

        return ComposerModelSelection(
            instanceId: instanceId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            model: model?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            options: options
        )
    }

    func toDictionary() -> [String: Any] {
        var payload: [String: Any] = [:]
        if let instanceId {
            payload["instanceId"] = instanceId
        }
        if let model {
            payload["model"] = model
        }
        if !options.isEmpty {
            payload["options"] = options.map { $0.toDictionary() }
        }
        return payload
    }

    func optionValue(for id: String) -> String? {
        let normalized = id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return options.first {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized
        }?.stringValue
    }

    func boolOptionValue(for id: String) -> Bool? {
        let normalized = id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return options.first {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized
        }?.boolValue
    }

    func reasoningEffortValue(supportedDescriptorIds: [String]) -> String? {
        let normalizedIds = Set(
            supportedDescriptorIds.map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            }
        )
        for option in options {
            let normalized = option.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if normalizedIds.contains(normalized), let value = option.stringValue {
                return value
            }
        }
        return optionValue(for: "reasoningEffort")
            ?? optionValue(for: "effort")
            ?? optionValue(for: "reasoning")
    }
}

struct ComposerThreadDraft: Codable, Equatable, Sendable {
    var modelSelection: ComposerModelSelection
    var runtimeMode: CodexAccessMode
    var hasLocalEdits: Bool

    init(
        modelSelection: ComposerModelSelection = ComposerModelSelection(),
        runtimeMode: CodexAccessMode = .approvalRequired,
        hasLocalEdits: Bool = false
    ) {
        self.modelSelection = modelSelection
        self.runtimeMode = runtimeMode
        self.hasLocalEdits = hasLocalEdits
    }
}

extension JSONValue {
    var jsonObjectValue: Any {
        switch self {
        case .string(let value):
            return value
        case .integer(let value):
            return value
        case .double(let value):
            return value
        case .bool(let value):
            return value
        case .null:
            return NSNull()
        case .array(let values):
            return values.map { $0.jsonObjectValue }
        case .object(let object):
            var mapped: [String: Any] = [:]
            for (key, value) in object {
                mapped[key] = value.jsonObjectValue
            }
            return mapped
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
