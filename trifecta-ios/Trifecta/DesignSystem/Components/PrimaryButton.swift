import SwiftUI

// MARK: - Legacy full-width buttons

struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: T3Spacing.sm) {
                if isLoading {
                    ProgressView().controlSize(.small).tint(T3Color.onPrimary)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .font(T3Typography.bodyEmphasis)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(T3Color.onPrimary)
            .background(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .fill(T3Color.primary.opacity(isEnabled ? 1.0 : 0.45))
            )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: T3Spacing.sm) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .font(T3Typography.bodyEmphasis)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(T3Color.textPrimary)
            .background(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .fill(T3Color.surfaceElevated)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Desktop-style toolbar buttons

/// Compact pill button with hairline border, matching the desktop toolbar style.
/// Use for actions like "Add action", "Open", "Commit & push", etc.
struct T3ToolbarButton: View {
    let title: String
    var systemImage: String? = nil
    var showsChevron: Bool = false
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: T3Spacing.xs) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(T3Color.textPrimary)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .medium))
                }
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                if showsChevron {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .semibold))
                }
            }
            .padding(.horizontal, T3Spacing.md)
            .padding(.vertical, 8)
            .foregroundStyle(isEnabled ? T3Color.textPrimary : T3Color.textTertiary)
            .background(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .fill(T3Color.surfaceElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .stroke(T3Color.separator, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
    }
}

/// Compact icon-only button with hairline border, matching the desktop toolbar style.
/// Use for icon-only actions like the square-arrow or plus-minus buttons in the screenshot.
struct T3ToolbarIconButton: View {
    let systemImage: String
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 34, height: 34)
                .foregroundStyle(isEnabled ? T3Color.textPrimary : T3Color.textTertiary)
                .background(
                    RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                        .fill(T3Color.surfaceElevated)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                        .stroke(T3Color.separator, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

/// A bordered capsule used for small toggles / segmented controls in toolbars.
/// This replaces the old filled-chip look with the desktop hairline style.
struct T3ToolbarToggle: View {
    let title: String
    var systemImage: String? = nil
    var isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: T3Spacing.xs) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .medium))
                }
                Text(title)
                    .font(.system(size: 13, weight: .medium))
            }
            .padding(.horizontal, T3Spacing.sm)
            .padding(.vertical, 6)
            .foregroundStyle(isOn ? T3Color.textPrimary : T3Color.textTertiary)
            .background(
                Capsule()
                    .fill(isOn ? T3Color.surfaceMuted : T3Color.surfaceElevated)
            )
            .overlay(
                Capsule()
                    .stroke(isOn ? T3Color.separator.opacity(0.6) : T3Color.separator,
                            lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}
