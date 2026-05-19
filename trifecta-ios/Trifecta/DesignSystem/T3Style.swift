import SwiftUI

// Reusable visual primitives aligned with Apple's Liquid Glass design language on
// iOS 26+ (.glassEffect, GlassEffectContainer, .buttonStyle(.glass)), with
// ultra-thin materials and hairline strokes on earlier versions.

enum T3Style {
    // Card with subtle border and slightly elevated surface.
    struct Card<Content: View>: View {
        var padding: CGFloat = T3Spacing.lg
        var radius: CGFloat = T3Radius.lg
        @ViewBuilder var content: () -> Content

        var body: some View {
            content()
                .padding(padding)
                .frame(maxWidth: .infinity, alignment: .leading)
                .t3Glass(radius: radius,
                         tint: T3GlassChrome.panelTint(),
                         stroke: T3Color.separator,
                         interactive: false)
        }
    }

    // Small-caps tracked label used above grouped sections.
    struct SectionHeader: View {
        let title: String

        var body: some View {
            Text(title.uppercased())
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textTertiary)
                .tracking(0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // Compact pill used for tags, status, and inline metadata.
    struct Pill: View {
        let text: String
        var systemImage: String? = nil
        var tint: Color = T3Color.textSecondary
        var emphasized: Bool = false

        var body: some View {
            HStack(spacing: 4) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 10, weight: .semibold))
                }
                Text(text)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.4)
            }
            .foregroundStyle(emphasized ? tint : T3Color.textTertiary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .t3AdaptiveCapsuleGlass(
                interactive: false,
                tint: emphasized ? tint.opacity(0.22) : T3GlassChrome.panelTint(),
                fallbackFill: emphasized ? tint.opacity(0.16) : nil,
                fallbackStroke: emphasized ? tint.opacity(0.30) : nil
            )
        }
    }

    // Chip-style toolbar button: icon inside a hairline-bordered rounded square.
    // Matches the desktop toolbar icon-buttons (e.g. square-arrow, plus-minus).
    struct ToolbarChip<Label: View>: View {
        var size: CGFloat = 34
        let action: () -> Void
        @ViewBuilder var label: () -> Label

        var body: some View {
            Button(action: action) {
                label()
                    .frame(width: size, height: size)
                    .t3Glass(radius: T3Radius.md,
                             tint: T3GlassChrome.panelTint(),
                             stroke: T3Color.separator,
                             interactive: true)
            }
            .buttonStyle(T3ScaleButtonStyle())
        }
    }
}

// MARK: - Liquid glass fallback

struct T3Glass: ViewModifier {
    var radius: CGFloat = T3Radius.lg
    var tint: Color = T3Color.surfaceElevated.opacity(0.72)
    var stroke: Color = T3Color.separator
    var interactive: Bool = false

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)

        if #available(iOS 26.0, *), !reduceTransparency {
            let glassTint = tint
            let base = Glass.regular.tint(glassTint)
            let glass: Glass = interactive ? base.interactive() : base
            content
                .glassEffect(glass, in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
                .overlay(
                    shape.stroke(stroke, lineWidth: 0.5)
                )
        }
    }
}

extension View {
    func t3Glass(radius: CGFloat = T3Radius.lg,
                 tint: Color = T3Color.surfaceElevated.opacity(0.72),
                 stroke: Color = T3Color.separator,
                 interactive: Bool = false) -> some View {
        modifier(T3Glass(radius: radius, tint: tint, stroke: stroke, interactive: interactive))
    }
}

// MARK: - Sidebar navigation actions

private struct T3SidebarActionKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

private struct T3NavigateHomeActionKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    var t3OpenSidebar: (() -> Void)? {
        get { self[T3SidebarActionKey.self] }
        set { self[T3SidebarActionKey.self] = newValue }
    }

    var t3NavigateHome: (() -> Void)? {
        get { self[T3NavigateHomeActionKey.self] }
        set { self[T3NavigateHomeActionKey.self] = newValue }
    }
}

// MARK: - Wordmark label

// Renders a label like "Trifecta  ALPHA" used in headers across the app.
struct T3WordmarkLabel: View {
    var size: CGFloat = 17
    var showsAlpha: Bool = true

    var body: some View {
        HStack(spacing: 4) {
            Text("Trifecta")
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(T3Color.textPrimary)
            if showsAlpha {
                Text("ALPHA")
                    .font(.system(size: max(9, size - 7), weight: .semibold))
                    .foregroundStyle(T3Color.textTertiary)
                    .tracking(0.4)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .t3AdaptiveCapsuleGlass(interactive: false,
                                            tint: T3GlassChrome.panelTint())
                    .padding(.leading, 2)
            }
        }
    }
}
