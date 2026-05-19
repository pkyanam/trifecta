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
    @State private var pulseScale: CGFloat = 1.0
    @State private var pulseOpacity: Double = 0.6

    var body: some View {
        HStack(spacing: T3Spacing.xs) {
            ZStack {
                if state == .connecting {
                    Circle()
                        .fill(state.tint.opacity(pulseOpacity))
                        .frame(width: 11, height: 11)
                        .scaleEffect(pulseScale)
                }
                Circle()
                    .fill(state.tint)
                    .frame(width: 6, height: 6)
            }
            .frame(width: 11, height: 11)
            Text(state.label)
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textSecondary)
        }
        .padding(.horizontal, T3Spacing.md)
        .padding(.vertical, T3Spacing.xs)
        .t3AdaptiveCapsuleGlass(interactive: false, tint: T3GlassChrome.panelTint())
        .onAppear { startPulseIfNeeded() }
        .onChange(of: state) { _, _ in startPulseIfNeeded() }
    }

    private func startPulseIfNeeded() {
        guard state == .connecting else { return }
        withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
            pulseScale = 1.9
            pulseOpacity = 0.0
        }
    }
}
