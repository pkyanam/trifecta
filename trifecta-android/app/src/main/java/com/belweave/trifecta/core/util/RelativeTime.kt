package com.belweave.trifecta.core.util

import java.time.Duration
import java.time.Instant

/** Compact relative-time formatter modelled on iOS `RelativeDateTimeFormatter(.abbreviated)`. */
object RelativeTime {

    fun format(target: Instant, now: Instant = Instant.now()): String {
        val seconds = Duration.between(target, now).seconds
        val absolute = kotlin.math.abs(seconds)
        val unit: String
        val value: Long
        when {
            absolute < 60 -> { unit = "s"; value = absolute }
            absolute < 60 * 60 -> { unit = "m"; value = absolute / 60 }
            absolute < 60 * 60 * 24 -> { unit = "h"; value = absolute / 3_600 }
            absolute < 60 * 60 * 24 * 7 -> { unit = "d"; value = absolute / 86_400 }
            absolute < 60 * 60 * 24 * 30L -> { unit = "w"; value = absolute / (86_400 * 7) }
            absolute < 60 * 60 * 24 * 365L -> { unit = "mo"; value = absolute / (86_400 * 30) }
            else -> { unit = "y"; value = absolute / (86_400 * 365) }
        }
        val display = if (value <= 0) 1 else value
        return if (seconds >= 0) "${display}${unit} ago" else "in ${display}${unit}"
    }
}
