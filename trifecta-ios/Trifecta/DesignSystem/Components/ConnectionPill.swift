import SwiftUI

enum ConnectionState: Equatable {
    case offline
    case connecting
    case connected
    case error(String)

    var label: String {
        switch self {
        case .offline:    "Offline"
        case .connecting: "Connecting"
        case .connected:  "Connected"
        case .error:      "Error"
        }
    }

    var tint: Color {
        switch self {
        case .offline:    T3Color.textTertiary
        case .connecting: T3Color.warning
        case .connected:  T3Color.success
        case .error:      T3Color.danger
        }
    }

    var detail: String? {
        switch self {
        case .error(let message):
            message.isEmpty ? "Unknown connection error" : message
        default:
            nil
        }
    }
}

struct ConnectionPill: View {
    let state: ConnectionState

    var body: some View {
        HStack(spacing: T3Spacing.xs) {
            Circle()
                .fill(state.tint)
                .frame(width: 6, height: 6)
            Text(state.label)
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textSecondary)
        }
        .padding(.horizontal, T3Spacing.md)
        .padding(.vertical, T3Spacing.xs)
        .background(
            Capsule().fill(T3Color.surfaceElevated)
        )
        .overlay {
            Capsule().stroke(T3Color.separator, lineWidth: 0.5)
        }
    }
}
