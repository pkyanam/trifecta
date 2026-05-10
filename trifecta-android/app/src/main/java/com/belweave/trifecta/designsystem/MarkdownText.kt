package com.belweave.trifecta.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Mobile-friendly markdown renderer mirroring iOS [MarkdownText]. */
@Composable
fun MarkdownText(
    source: String,
    baseStyle: TextStyle = T3Typography.body,
    secondaryColor: Color = T3Color.textSecondary,
    inlineCodeBackground: Color = T3Color.surfaceMuted,
    modifier: Modifier = Modifier
) {
    val blocks = remember(source) { MarkdownBlockParser.parse(source) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        blocks.forEach { block ->
            BlockView(
                block = block,
                baseStyle = baseStyle,
                secondaryColor = secondaryColor,
                inlineCodeBackground = inlineCodeBackground
            )
        }
    }
}

@Composable
private fun BlockView(
    block: MdBlock,
    baseStyle: TextStyle,
    secondaryColor: Color,
    inlineCodeBackground: Color
) {
    when (block) {
        is MdBlock.Paragraph -> Text(
            text = InlineMarkdown.parse(block.text, inlineCodeBackground),
            style = baseStyle,
            color = T3Color.textPrimary,
            modifier = Modifier.fillMaxWidth()
        )
        is MdBlock.Heading -> Text(
            text = InlineMarkdown.parse(block.text, inlineCodeBackground, boldAll = true),
            style = headingStyle(block.level),
            color = T3Color.textPrimary,
            modifier = Modifier.fillMaxWidth()
        )
        is MdBlock.Code -> CodeBlock(code = block.code, language = block.language)
        is MdBlock.Bullet -> ListBlock(
            items = block.items,
            ordered = false,
            baseStyle = baseStyle,
            inlineBackground = inlineCodeBackground
        )
        is MdBlock.Numbered -> ListBlock(
            items = block.items,
            ordered = true,
            baseStyle = baseStyle,
            inlineBackground = inlineCodeBackground
        )
        is MdBlock.Quote -> QuoteBlock(
            lines = block.lines,
            baseStyle = baseStyle,
            inlineBackground = inlineCodeBackground,
            textColor = secondaryColor
        )
        MdBlock.Divider -> Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = T3Spacing.xs)
                .background(T3Color.separator)
        ) { Box(modifier = Modifier.size(0.dp, 0.5.dp)) }
    }
}

@Composable
private fun headingStyle(level: Int): TextStyle = when (level) {
    1 -> T3Typography.title
    2 -> T3Typography.headline
    3 -> T3Typography.bodyEmphasis
    else -> T3Typography.callout.copy(fontWeight = FontWeight.SemiBold)
}

@Composable
private fun ListBlock(
    items: List<MdListItem>,
    ordered: Boolean,
    baseStyle: TextStyle,
    inlineBackground: Color
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEachIndexed { index, item ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = (item.depth * 16).dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = if (ordered) "${index + 1}." else "•",
                    style = baseStyle.copy(fontWeight = if (ordered) FontWeight.SemiBold else FontWeight.Normal),
                    color = T3Color.textSecondary,
                    modifier = Modifier.width(if (ordered) 22.dp else 14.dp)
                )
                Text(
                    text = InlineMarkdown.parse(item.text, inlineBackground),
                    style = baseStyle,
                    color = T3Color.textPrimary,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun QuoteBlock(
    lines: List<String>,
    baseStyle: TextStyle,
    inlineBackground: Color,
    textColor: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = T3Spacing.xs),
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        Box(modifier = Modifier.width(3.dp).background(T3Color.separator)) {
            Box(modifier = Modifier.size(3.dp, 1.dp))
        }
        Text(
            text = InlineMarkdown.parse(lines.joinToString("\n"), inlineBackground),
            style = baseStyle,
            color = textColor,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun CodeBlock(code: String, language: String?) {
    val isDiff = language?.lowercase() in setOf("diff", "patch", "udiff", "git")
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceMuted)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
    ) {
        if (isDiff) {
            Column {
                code.split("\n").forEach { line ->
                    Text(
                        text = line,
                        style = T3Typography.code,
                        color = diffLineColor(line),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        } else {
            Text(
                text = code,
                style = T3Typography.code,
                color = T3Color.textPrimary,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun diffLineColor(line: String): Color {
    val t = line.trim()
    if (t.startsWith("+++ ") || t.startsWith("--- ")) return T3Color.textSecondary
    if (t.startsWith("diff --git") || t.startsWith("Index: ")) return T3Color.textSecondary
    if (t.startsWith("@@")) return T3Color.warning
    return when (line.firstOrNull()) {
        '+' -> T3Color.success
        '-' -> T3Color.danger
        else -> T3Color.textPrimary
    }
}

// region Block model

internal sealed class MdBlock {
    data class Paragraph(val text: String) : MdBlock()
    data class Heading(val level: Int, val text: String) : MdBlock()
    data class Code(val code: String, val language: String?) : MdBlock()
    data class Bullet(val items: List<MdListItem>) : MdBlock()
    data class Numbered(val items: List<MdListItem>) : MdBlock()
    data class Quote(val lines: List<String>) : MdBlock()
    object Divider : MdBlock()
}

internal data class MdListItem(val depth: Int, val text: String)

// endregion

// region Block parser

internal object MarkdownBlockParser {
    fun parse(source: String): List<MdBlock> {
        val blocks = mutableListOf<MdBlock>()
        val lines = source.split("\n")
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val trimmed = line.trim()

            if (trimmed.startsWith("```")) {
                val langCandidate = trimmed.removePrefix("```").trim()
                val language = langCandidate.takeIf { it.isNotEmpty() }
                i += 1
                val code = StringBuilder()
                var first = true
                while (i < lines.size) {
                    if (lines[i].trim().startsWith("```")) {
                        i += 1
                        break
                    }
                    if (!first) code.append('\n')
                    code.append(lines[i])
                    first = false
                    i += 1
                }
                blocks.add(MdBlock.Code(code.toString(), language))
                continue
            }

            val heading = parseHeading(trimmed)
            if (heading != null) {
                blocks.add(MdBlock.Heading(heading.first, heading.second))
                i += 1
                continue
            }

            if (isHorizontalRule(trimmed)) {
                blocks.add(MdBlock.Divider)
                i += 1
                continue
            }

            if (trimmed.startsWith(">")) {
                val q = mutableListOf<String>()
                while (i < lines.size) {
                    val lt = lines[i].trim()
                    if (!lt.startsWith(">")) break
                    var content = lt.removePrefix(">")
                    if (content.startsWith(" ")) content = content.substring(1)
                    q.add(content)
                    i += 1
                }
                blocks.add(MdBlock.Quote(q))
                continue
            }

            val kind = listKind(line)
            if (kind != null) {
                val items = mutableListOf<MdListItem>()
                while (i < lines.size && listKind(lines[i]) == kind) {
                    items.add(parseListItem(lines[i]))
                    i += 1
                }
                blocks.add(if (kind == ListKind.BULLET) MdBlock.Bullet(items) else MdBlock.Numbered(items))
                continue
            }

            if (trimmed.isEmpty()) {
                i += 1
                continue
            }

            val paraLines = mutableListOf<String>()
            while (i < lines.size) {
                val raw = lines[i]
                val rt = raw.trim()
                if (rt.isEmpty()) break
                if (rt.startsWith("```")) break
                if (isHorizontalRule(rt)) break
                if (parseHeading(rt) != null) break
                if (rt.startsWith(">")) break
                if (listKind(raw) != null) break
                paraLines.add(raw)
                i += 1
            }
            if (paraLines.isNotEmpty()) {
                blocks.add(MdBlock.Paragraph(paraLines.joinToString("\n")))
            }
        }
        return blocks
    }

    private fun parseHeading(trimmed: String): Pair<Int, String>? {
        if (!trimmed.startsWith("#")) return null
        var level = 0
        var rest = trimmed
        while (rest.startsWith("#") && level < 6) {
            rest = rest.substring(1)
            level += 1
        }
        if (level == 0 || !rest.startsWith(" ")) return null
        val text = rest.trim()
        if (text.isEmpty()) return null
        return level to text
    }

    private fun isHorizontalRule(trimmed: String): Boolean {
        if (trimmed.length < 3) return false
        val chars = trimmed.toSet()
        return chars == setOf('-') || chars == setOf('*') || chars == setOf('_')
    }

    private enum class ListKind { BULLET, NUMBERED }

    private fun listKind(raw: String): ListKind? {
        val t = raw.trim()
        if (t.startsWith("- ") || t.startsWith("* ")) return ListKind.BULLET
        val dot = t.indexOf('.')
        if (dot > 0 && t.substring(0, dot).all { it.isDigit() } && dot + 1 < t.length && t[dot + 1] == ' ') {
            return ListKind.NUMBERED
        }
        return null
    }

    private fun parseListItem(line: String): MdListItem {
        var leading = 0
        for (c in line) {
            when (c) {
                ' ' -> leading += 1
                '\t' -> leading += 4
                else -> break
            }
        }
        val depth = leading / 2
        var text = line.trim()
        if (text.isNotEmpty() && (text[0] == '-' || text[0] == '*') && text.length >= 2 && text[1] == ' ') {
            text = text.substring(2)
        } else {
            val dot = text.indexOf('.')
            if (dot > 0 && text.substring(0, dot).all { it.isDigit() } && dot + 1 < text.length && text[dot + 1] == ' ') {
                text = text.substring(dot + 2)
            }
        }
        return MdListItem(depth, text)
    }
}

// endregion

// region Inline parser

internal object InlineMarkdown {
    fun parse(source: String, codeBackground: Color, boldAll: Boolean = false): AnnotatedString =
        buildAnnotatedString {
            val pushBase = if (boldAll) {
                pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
                true
            } else false

            var i = 0
            while (i < source.length) {
                val c = source[i]
                when {
                    c == '\\' && i + 1 < source.length -> {
                        append(source[i + 1])
                        i += 2
                    }
                    c == '`' -> {
                        val end = source.indexOf('`', i + 1)
                        if (end > 0) {
                            val code = source.substring(i + 1, end)
                            pushStyle(SpanStyle(background = codeBackground, fontFamily = FontFamily.Monospace, fontSize = 13.sp))
                            append(code)
                            pop()
                            i = end + 1
                        } else {
                            append(c); i += 1
                        }
                    }
                    c == '*' || c == '_' -> {
                        val isBold = i + 1 < source.length && source[i + 1] == c
                        val marker = if (isBold) source.substring(i, i + 2) else c.toString()
                        val searchFrom = i + marker.length
                        val end = source.indexOf(marker, searchFrom)
                        if (end > 0) {
                            val text = source.substring(searchFrom, end)
                            val style = if (isBold) SpanStyle(fontWeight = FontWeight.Bold)
                                        else SpanStyle(fontStyle = FontStyle.Italic)
                            pushStyle(style)
                            append(text)
                            pop()
                            i = end + marker.length
                        } else {
                            append(c); i += 1
                        }
                    }
                    c == '[' -> {
                        val close = source.indexOf(']', i + 1)
                        if (close > 0 && close + 1 < source.length && source[close + 1] == '(') {
                            val parenClose = source.indexOf(')', close + 2)
                            if (parenClose > 0) {
                                val linkText = source.substring(i + 1, close)
                                pushStyle(SpanStyle(color = Color(0xFF4F6BED)))
                                append(linkText)
                                pop()
                                i = parenClose + 1
                                continue
                            }
                        }
                        append(c); i += 1
                    }
                    else -> {
                        append(c); i += 1
                    }
                }
            }

            if (pushBase) pop()
        }
}
// endregion
