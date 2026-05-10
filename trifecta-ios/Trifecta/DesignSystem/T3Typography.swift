import SwiftUI
import UIKit

enum T3Typography {
    static func display(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        if let _ = UIFont(name: "DMSans-Regular", size: size) {
            let psName: String
            switch weight {
            case .bold, .heavy, .black: psName = "DMSans-Bold"
            case .semibold:             psName = "DMSans-SemiBold"
            case .medium:               psName = "DMSans-Medium"
            default:                    psName = "DMSans-Regular"
            }
            return Font.custom(psName, size: size)
        }
        return Font.system(size: size, weight: weight, design: .default)
    }

    static let largeTitle = display(size: 34, weight: .bold)
    static let title      = display(size: 22, weight: .semibold)
    static let headline   = display(size: 17, weight: .semibold)

    static let body         = display(size: 16, weight: .regular)
    static let bodyEmphasis = display(size: 16, weight: .semibold)
    static let callout      = display(size: 15, weight: .regular)
    static let footnote     = display(size: 13, weight: .regular)
    static let caption      = display(size: 12, weight: .medium)

    static let code         = Font.system(.footnote, design: .monospaced)
    static let codeBlock    = Font.system(.callout,  design: .monospaced)
}
