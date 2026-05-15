import SwiftUI
import UIKit

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum AppAccent: String, CaseIterable, Identifiable {
    case blue, violet, green, orange, rose, teal

    var id: String { rawValue }

    var label: String {
        switch self {
        case .blue:   "Blue"
        case .violet: "Violet"
        case .green:  "Green"
        case .orange: "Orange"
        case .rose:   "Rose"
        case .teal:   "Teal"
        }
    }

    var color: Color {
        switch self {
        case .blue:
            Color(light: Color(red: 0.255, green: 0.333, blue: 0.780),
                  dark:  Color(red: 0.310, green: 0.420, blue: 0.930))
        case .violet:
            Color(light: Color(red: 0.410, green: 0.310, blue: 0.820),
                  dark:  Color(red: 0.560, green: 0.470, blue: 0.960))
        case .green:
            Color(light: Color(red: 0.050, green: 0.520, blue: 0.360),
                  dark:  Color(red: 0.180, green: 0.760, blue: 0.520))
        case .orange:
            Color(light: Color(red: 0.800, green: 0.360, blue: 0.080),
                  dark:  Color(red: 0.940, green: 0.520, blue: 0.180))
        case .rose:
            Color(light: Color(red: 0.820, green: 0.190, blue: 0.350),
                  dark:  Color(red: 0.960, green: 0.360, blue: 0.500))
        case .teal:
            Color(light: Color(red: 0.050, green: 0.520, blue: 0.560),
                  dark:  Color(red: 0.150, green: 0.720, blue: 0.760))
        }
    }

    static func color(for rawValue: String) -> Color {
        (AppAccent(rawValue: rawValue) ?? .blue).color
    }
}

enum TranscriptDensity: String, CaseIterable, Identifiable {
    case compact, comfortable, spacious

    var id: String { rawValue }

    var label: String {
        switch self {
        case .compact:     "Compact"
        case .comfortable: "Comfort"
        case .spacious:    "Spacious"
        }
    }
}

enum ComposerSize: String, CaseIterable, Identifiable {
    case compact, comfortable, expanded

    var id: String { rawValue }

    var label: String {
        switch self {
        case .compact:     "Compact"
        case .comfortable: "Comfort"
        case .expanded:    "Expanded"
        }
    }

    var maxLines: Int {
        switch self {
        case .compact:     3
        case .comfortable: 5
        case .expanded:    8
        }
    }
}

enum UserBubbleColor: String, CaseIterable, Identifiable {
    case accent, blue, indigo, violet, purple, pink, rose, red, orange, yellow, green, mint, teal, cyan

    var id: String { rawValue }

    var label: String {
        switch self {
        case .accent: "Accent"
        case .blue: "Blue"
        case .indigo: "Indigo"
        case .violet: "Violet"
        case .purple: "Purple"
        case .pink: "Pink"
        case .rose: "Rose"
        case .red: "Red"
        case .orange: "Orange"
        case .yellow: "Yellow"
        case .green: "Green"
        case .mint: "Mint"
        case .teal: "Teal"
        case .cyan: "Cyan"
        }
    }

    func color(accentRaw: String) -> Color {
        switch self {
        case .accent:
            AppAccent.color(for: accentRaw)
        case .blue:
            Color(light: Color(red: 0.13, green: 0.35, blue: 0.92),
                  dark:  Color(red: 0.28, green: 0.49, blue: 1.00))
        case .indigo:
            Color(light: Color(red: 0.29, green: 0.27, blue: 0.86),
                  dark:  Color(red: 0.42, green: 0.42, blue: 1.00))
        case .violet:
            Color(light: Color(red: 0.43, green: 0.24, blue: 0.84),
                  dark:  Color(red: 0.57, green: 0.42, blue: 0.96))
        case .purple:
            Color(light: Color(red: 0.56, green: 0.20, blue: 0.75),
                  dark:  Color(red: 0.72, green: 0.40, blue: 0.90))
        case .pink:
            Color(light: Color(red: 0.80, green: 0.18, blue: 0.55),
                  dark:  Color(red: 0.96, green: 0.38, blue: 0.70))
        case .rose:
            Color(light: Color(red: 0.83, green: 0.18, blue: 0.34),
                  dark:  Color(red: 0.98, green: 0.36, blue: 0.50))
        case .red:
            Color(light: Color(red: 0.82, green: 0.17, blue: 0.20),
                  dark:  Color(red: 0.98, green: 0.34, blue: 0.37))
        case .orange:
            Color(light: Color(red: 0.82, green: 0.36, blue: 0.08),
                  dark:  Color(red: 0.96, green: 0.55, blue: 0.20))
        case .yellow:
            Color(light: Color(red: 0.66, green: 0.50, blue: 0.04),
                  dark:  Color(red: 0.95, green: 0.75, blue: 0.20))
        case .green:
            Color(light: Color(red: 0.06, green: 0.52, blue: 0.34),
                  dark:  Color(red: 0.18, green: 0.76, blue: 0.52))
        case .mint:
            Color(light: Color(red: 0.00, green: 0.56, blue: 0.48),
                  dark:  Color(red: 0.22, green: 0.82, blue: 0.70))
        case .teal:
            Color(light: Color(red: 0.00, green: 0.49, blue: 0.58),
                  dark:  Color(red: 0.20, green: 0.76, blue: 0.84))
        case .cyan:
            Color(light: Color(red: 0.00, green: 0.45, blue: 0.74),
                  dark:  Color(red: 0.23, green: 0.72, blue: 0.96))
        }
    }
}

extension UIApplication {
    static func dismissKeyboard() {
        shared.sendAction(#selector(UIResponder.resignFirstResponder),
                          to: nil,
                          from: nil,
                          for: nil)
    }
}
