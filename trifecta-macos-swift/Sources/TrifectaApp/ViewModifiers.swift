import SwiftUI

extension View {
    /// Cross-version surface modifier.
    /// macOS 26+: Liquid Glass (.glassEffect). macOS 14–25: .regularMaterial.
    func trifectaSurface() -> some View {
        self.background(.regularMaterial)
        // TODO: add #available(macOS 26, *) glassEffect branch once SDK ships
    }
}
