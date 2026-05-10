package com.belweave.trifecta.core.models

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Project-wide JSON parser. Lenient but explicit; matches the iOS client behaviour.
 */
val T3Json: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    encodeDefaults = true
    explicitNulls = false
    classDiscriminator = "_kind"
}

// region Convenience JsonElement accessors

fun JsonElement?.asObjectOrNull(): JsonObject? = (this as? JsonObject)
fun JsonElement?.asArrayOrNull(): JsonArray? = (this as? JsonArray)
fun JsonElement?.stringOrNull(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    ?: (this as? JsonPrimitive)?.contentOrNull
fun JsonElement?.intOrNull(): Int? = (this as? JsonPrimitive)?.intOrNull
fun JsonElement?.longOrNull(): Long? = (this as? JsonPrimitive)?.longOrNull
fun JsonElement?.doubleOrNull(): Double? = (this as? JsonPrimitive)?.doubleOrNull
fun JsonElement?.booleanOrNull(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull

fun JsonObject.str(key: String): String? = this[key].stringOrNull()
fun JsonObject.bool(key: String): Boolean? = this[key].booleanOrNull()
fun JsonObject.intAt(key: String): Int? = this[key].intOrNull()
fun JsonObject.longAt(key: String): Long? = this[key].longOrNull()
fun JsonObject.obj(key: String): JsonObject? = this[key].asObjectOrNull()
fun JsonObject.arr(key: String): JsonArray? = this[key].asArrayOrNull()

// endregion

// region ISO-8601 dates

object Iso8601 {
    private val isoFractional: DateTimeFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME

    fun parse(raw: String?): Instant? {
        if (raw.isNullOrBlank()) return null
        return try {
            OffsetDateTime.parse(raw, isoFractional).toInstant()
        } catch (_: DateTimeParseException) {
            try {
                Instant.parse(raw)
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    fun format(instant: Instant): String =
        instant.atOffset(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
}

// endregion
