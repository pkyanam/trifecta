package com.belweave.trifecta.features.thread

import com.belweave.trifecta.core.models.ProviderInteractionMode

/**
 * Detection result for a composer trigger token (`@`, `$`, `/`).
 *
 * The range is expressed in UTF-16 offsets so it lines up with
 * [androidx.compose.ui.text.input.TextFieldValue.selection] which uses
 * UTF-16 code unit indices internally.
 */
enum class ComposerTriggerKind { PATH, SLASH_COMMAND, SKILL }

data class ComposerTrigger(
    val kind: ComposerTriggerKind,
    val query: String,
    val rangeStart: Int,
    val rangeEnd: Int
)

/** Result returned by [ComposerLogic.replaceRangeUtf16]. */
data class ReplaceResult(val text: String, val cursorUtf16: Int)

object ComposerLogic {

    private fun clampCursor(length: Int, cursor: Int): Int =
        cursor.coerceIn(0, length)

    private fun isWhitespace(c: Char): Boolean = c.isWhitespace()

    private fun tokenStart(text: CharSequence, cursor: Int): Int {
        var index = cursor - 1
        while (index >= 0) {
            if (isWhitespace(text[index])) break
            index -= 1
        }
        return index + 1
    }

    private fun lineStart(text: CharSequence, cursor: Int): Int {
        val capped = clampCursor(text.length, cursor)
        if (capped <= 0) return 0
        val nl = text.lastIndexOf('\n', capped - 1)
        return if (nl >= 0) nl + 1 else 0
    }

    /** UTF-16 offsets, matching `TextFieldValue.selection`. */
    fun detectTrigger(text: String, cursorUtf16: Int): ComposerTrigger? {
        val len = text.length
        val cursor = clampCursor(len, cursorUtf16)

        val ls = lineStart(text, cursor)
        val lineLen = cursor - ls
        if (lineLen >= 0 && ls + lineLen <= len) {
            val linePrefix = text.substring(ls, ls + lineLen)
            if (linePrefix.startsWith("/")) {
                val match = SLASH_LINE_REGEX.matchEntire(linePrefix)
                if (match != null) {
                    val q = match.groupValues.getOrNull(1) ?: ""
                    return ComposerTrigger(
                        kind = ComposerTriggerKind.SLASH_COMMAND,
                        query = q,
                        rangeStart = ls,
                        rangeEnd = cursor
                    )
                }
            }
        }

        val ts = tokenStart(text, cursor)
        val tokenLen = cursor - ts
        if (tokenLen <= 0 || ts + tokenLen > len) return null
        val token = text.substring(ts, ts + tokenLen)
        return when {
            token.startsWith("$") -> ComposerTrigger(
                kind = ComposerTriggerKind.SKILL,
                query = token.drop(1),
                rangeStart = ts,
                rangeEnd = cursor
            )
            token.startsWith("@") -> ComposerTrigger(
                kind = ComposerTriggerKind.PATH,
                query = token.drop(1),
                rangeStart = ts,
                rangeEnd = cursor
            )
            else -> null
        }
    }

    fun replaceRangeUtf16(
        text: String,
        rangeStart: Int,
        rangeEnd: Int,
        replacement: String
    ): ReplaceResult {
        val len = text.length
        val s = rangeStart.coerceIn(0, len)
        val e = rangeEnd.coerceIn(s, len)
        val next = text.substring(0, s) + replacement + text.substring(e)
        val cursor = s + replacement.length
        return ReplaceResult(next, cursor)
    }

    fun parseStandaloneModeSlash(trimmed: String): ProviderInteractionMode? {
        val t = trimmed.trim()
        if (PLAN_REGEX.matches(t)) return ProviderInteractionMode.PLAN
        if (DEFAULT_REGEX.matches(t)) return ProviderInteractionMode.DEFAULT
        return null
    }

    fun isStandaloneModelSlash(trimmed: String): Boolean =
        MODEL_REGEX.matches(trimmed.trim())

    private val SLASH_LINE_REGEX = Regex("""^/(\S*)$""")
    private val PLAN_REGEX = Regex("""^/plan\s*$""", RegexOption.IGNORE_CASE)
    private val DEFAULT_REGEX = Regex("""^/default\s*$""", RegexOption.IGNORE_CASE)
    private val MODEL_REGEX = Regex("""^/model\s*$""", RegexOption.IGNORE_CASE)
}
