package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

sealed class ProviderOptionValue {
    data class Str(val value: String) : ProviderOptionValue()
    data class Bool(val value: Boolean) : ProviderOptionValue()

    val jsonValue: kotlinx.serialization.json.JsonElement
        get() = when (this) {
            is Str -> JsonPrimitive(value)
            is Bool -> JsonPrimitive(value)
        }

    companion object {
        fun fromJson(element: kotlinx.serialization.json.JsonElement?): ProviderOptionValue? {
            if (element !is JsonPrimitive) return null
            element.booleanOrNull?.let { return Bool(it) }
            element.contentOrNull?.let { return Str(it) }
            return null
        }
    }
}

data class ProviderOptionSelection(
    val id: String,
    val value: ProviderOptionValue
) {
    fun encoded(): JsonObject = buildJsonObject {
        put("id", id)
        put("value", value.jsonValue)
    }
}

data class ModelSelection(
    val instanceId: ProviderInstanceID,
    val model: String,
    val options: List<ProviderOptionSelection>? = null
) {
    fun encoded(): JsonObject = buildJsonObject {
        put("instanceId", instanceId.rawValue)
        put("model", model)
        if (!options.isNullOrEmpty()) {
            put("options", buildJsonArray { options.forEach { add(it.encoded()) } })
        }
    }

    companion object {
        fun fromJson(obj: JsonObject?): ModelSelection? {
            if (obj == null) return null
            val instance = obj.str("instanceId") ?: obj.str("provider") ?: return null
            val model = obj.str("model") ?: return null
            val options = when {
                obj["options"]?.asArrayOrNull() != null -> obj["options"]?.asArrayOrNull()?.mapNotNull { entry ->
                    val o = entry.asObjectOrNull() ?: return@mapNotNull null
                    val id = o.str("id") ?: return@mapNotNull null
                    val value = ProviderOptionValue.fromJson(o["value"]) ?: return@mapNotNull null
                    ProviderOptionSelection(id, value)
                }
                obj.obj("options") != null -> obj.obj("options")
                    ?.entries
                    ?.mapNotNull { (id, value) ->
                        val parsedValue = ProviderOptionValue.fromJson(value) ?: return@mapNotNull null
                        ProviderOptionSelection(id, parsedValue)
                    }
                    ?.sortedBy { it.id }
                else -> null
            }
            return ModelSelection(ProviderInstanceID(instance), model, options)
        }
    }
}
