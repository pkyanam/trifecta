import SwiftUI
import UIKit

enum T3Color {
    static let primary = Color(light: Color(red: 0.255, green: 0.333, blue: 0.780),
                               dark:  Color(red: 0.310, green: 0.420, blue: 0.930))

    static let onPrimary = Color.white

    static let success = Color(light: Color(red: 0.05,  green: 0.62,  blue: 0.42),
                               dark:  Color(red: 0.18,  green: 0.78,  blue: 0.55))
    static let warning = Color(light: Color(red: 0.96,  green: 0.62,  blue: 0.07),
                               dark:  Color(red: 0.99,  green: 0.74,  blue: 0.21))
    static let danger  = Color(light: Color(red: 0.86,  green: 0.20,  blue: 0.27),
                               dark:  Color(red: 0.98,  green: 0.34,  blue: 0.38))

    static let surface = Color(light: .white,
                               dark: Color(red: 0.035, green: 0.035, blue: 0.038))
    static let surfaceElevated = Color(light: Color(red: 0.965, green: 0.965, blue: 0.970),
                                       dark: Color(red: 0.086, green: 0.086, blue: 0.094))
    static let surfaceMuted = Color(light: Color(red: 0.925, green: 0.925, blue: 0.935),
                                    dark: Color(red: 0.125, green: 0.125, blue: 0.135))
    static let surfaceGrouped = Color(light: Color(red: 0.950, green: 0.950, blue: 0.958),
                                      dark: .black)

    static let textPrimary   = Color(.label)
    static let textSecondary = Color(.secondaryLabel)
    static let textTertiary  = Color(.tertiaryLabel)

    static let separator = Color(light: Color.black.opacity(0.12),
                                 dark: Color.white.opacity(0.11))
}

extension Color {
    init(light: Color, dark: Color) {
        self = Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}
