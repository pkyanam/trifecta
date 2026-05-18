// FILE: TurnFooterErrorFilter.swift
// Purpose: Filters transient recovery noise out of the turn timeline footer error slot.
// Layer: View Support
// Exports: TurnFooterErrorFilter
// Depends on: Foundation

import Foundation

enum TurnFooterErrorFilter {
    static func visibleFooterMessage(from rawMessage: String?) -> String? {
        guard let message = rawMessage?.trimmingCharacters(in: .whitespacesAndNewlines),
              !message.isEmpty else {
            return nil
        }

        if isConnectionRecoveryNoise(message)
            || isBackgroundHistoryRetryNoise(message)
            || isUnmaterializedThreadNoise(message)
            || isCancellationNoise(message)
            || isDesktopBridgeCompletionNoise(message) {
            return nil
        }

        return message
    }

    private static func isConnectionRecoveryNoise(_ message: String) -> Bool {
        let normalizedMessage = message.lowercased()
        return normalizedMessage.contains("tap reconnect")
            || normalizedMessage.hasPrefix("connection was interrupted")
            || normalizedMessage.hasPrefix("connection timed out")
            || normalizedMessage.hasPrefix("trying to reconnect")
    }

    private static func isBackgroundHistoryRetryNoise(_ message: String) -> Bool {
        message.lowercased() == "couldn't load this chat yet. retrying in the background."
    }

    private static func isUnmaterializedThreadNoise(_ message: String) -> Bool {
        let normalizedMessage = message.lowercased()
        return normalizedMessage.contains("not materialized")
            || normalizedMessage.contains("not yet materialized")
            || (
                normalizedMessage.contains("thread/turns/list")
                    && normalizedMessage.contains("unavailable")
            )
    }

    private static func isCancellationNoise(_ message: String) -> Bool {
        let normalizedMessage = message.lowercased()
        return normalizedMessage.contains("cancellationerror")
            || normalizedMessage.contains("cancelled")
            || normalizedMessage.contains("canceled")
    }

    // Filters the generic Effect exit failure that the desktop bridge emits when a command
    // completes with a non-success exit even though the turn itself finished correctly.
    private static func isDesktopBridgeCompletionNoise(_ message: String) -> Bool {
        let normalizedMessage = message.lowercased().trimmingCharacters(in: .punctuationCharacters)
        return normalizedMessage == "trifecta desktop request failed"
            || normalizedMessage == "trifecta desktop defect"
            || normalizedMessage.hasPrefix("unsupported trifecta rpc on trifecta desktop")
    }
}
