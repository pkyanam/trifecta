import SwiftUI

// Central helpers for Apple's Liquid Glass (iOS 26+) with materials + hairline
// fallbacks on earlier OS versions and when Reduce Transparency is enabled.

enum T3GlassChrome {
    /// Standard frosted panel (composer, bubbles, bars).
    static func panelTint(accentHighlight: Color? = nil) -> Color {
        if let accentHighlight {
            return accentHighlight
        }
        return T3Color.surfaceElevated.opacity(0.45)
    }
}

extension View {
    /// Rounded-rectangle glass (search fields, cards). Falls back to ultra-thin material on earlier OS.
    func t3AdaptiveRoundedRectGlass(
        cornerRadius: CGFloat,
        interactive: Bool = false,
        tint: Color? = nil,
        fallbackFill: Color? = nil,
        fallbackStroke: Color? = nil
    ) -> some View {
        modifier(T3AdaptiveRoundedRectGlassModifier(
            cornerRadius: cornerRadius,
            interactive: interactive,
            tint: tint,
            fallbackFill: fallbackFill,
            fallbackStroke: fallbackStroke
        ))
    }

    /// Capsule-shaped glass or material, for pills and connection status.
    func t3AdaptiveCapsuleGlass(
        interactive: Bool = false,
        tint: Color? = nil,
        fallbackFill: Color? = nil,
        fallbackStroke: Color? = nil
    ) -> some View {
        modifier(T3AdaptiveCapsuleGlassModifier(
            interactive: interactive,
            tint: tint,
            fallbackFill: fallbackFill,
            fallbackStroke: fallbackStroke
        ))
    }

    /// Circular glass affordance (sidebar action rings, icon wells).
    func t3AdaptiveCircleGlass(
        diameter: CGFloat,
        interactive: Bool = true,
        tint: Color? = nil
    ) -> some View {
        modifier(T3AdaptiveCircleGlassModifier(
            diameter: diameter,
            interactive: interactive,
            tint: tint
        ))
    }

    /// Soft fade at scroll edges on iOS 26+ (complements system Liquid Glass chrome).
    func t3ScrollEdgeSoftFade() -> some View {
        modifier(T3ScrollEdgeSoftFadeModifier())
    }
}

// MARK: - Scroll edge

private struct T3ScrollEdgeSoftFadeModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .scrollEdgeEffectStyle(.soft, for: .top)
                .scrollEdgeEffectStyle(.soft, for: .bottom)
        } else {
            content
        }
    }
}

// MARK: - Rounded rectangle

private struct T3AdaptiveRoundedRectGlassModifier: ViewModifier {
    var cornerRadius: CGFloat
    var interactive: Bool
    var tint: Color?
    var fallbackFill: Color?
    var fallbackStroke: Color?
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if #available(iOS 26.0, *), !reduceTransparency {
            content
                .glassEffect(glassConfiguration, in: shape)
        } else {
            Group {
                if let fallbackFill {
                    content
                        .background(fallbackFill, in: shape)
                } else {
                    content
                        .background(.ultraThinMaterial, in: shape)
                }
            }
            .overlay(shape.stroke(fallbackStroke ?? T3Color.separator, lineWidth: 0.5))
        }
    }

    @available(iOS 26.0, *)
    private var glassConfiguration: Glass {
        let tinted = tint.map { Glass.regular.tint($0) } ?? Glass.regular
        return interactive ? tinted.interactive() : tinted
    }
}

// MARK: - Capsule

private struct T3AdaptiveCapsuleGlassModifier: ViewModifier {
    var interactive: Bool
    var tint: Color?
    var fallbackFill: Color?
    var fallbackStroke: Color?
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = Capsule()
        if #available(iOS 26.0, *), !reduceTransparency {
            content
                .glassEffect(glassConfiguration, in: shape)
        } else {
            Group {
                if let fallbackFill {
                    content
                        .background(fallbackFill, in: shape)
                } else {
                    content
                        .background(.ultraThinMaterial, in: shape)
                }
            }
            .overlay(shape.stroke(fallbackStroke ?? T3Color.separator, lineWidth: 0.5))
        }
    }

    @available(iOS 26.0, *)
    private var glassConfiguration: Glass {
        let tinted = tint.map { Glass.regular.tint($0) } ?? Glass.regular
        return interactive ? tinted.interactive() : tinted
    }
}

// MARK: - Circle

private struct T3AdaptiveCircleGlassModifier: ViewModifier {
    var diameter: CGFloat
    var interactive: Bool
    var tint: Color?
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = Circle()
        if #available(iOS 26.0, *), !reduceTransparency {
            content
                .frame(width: diameter, height: diameter)
                .glassEffect(glassConfiguration, in: shape)
        } else {
            content
                .frame(width: diameter, height: diameter)
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(T3Color.separator, lineWidth: 0.5))
        }
    }

    @available(iOS 26.0, *)
    private var glassConfiguration: Glass {
        let tinted = tint.map { Glass.regular.tint($0) } ?? Glass.regular
        return interactive ? tinted.interactive() : tinted
    }
}
