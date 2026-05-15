import SwiftUI

struct StreamingDots: View {
    @State private var phase: Double = 0

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(T3Color.textTertiary)
                    .frame(width: 5, height: 5)
                    .scaleEffect(scale(for: i))
                    .opacity(opacity(for: i))
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: false)) {
                phase = 3
            }
        }
    }

    private func opacity(for index: Int) -> Double {
        let p = phase.truncatingRemainder(dividingBy: 3)
        let dist = min(abs(p - Double(index)), 3 - abs(p - Double(index)))
        return dist < 1.0 ? 0.4 + (1.0 - dist) * 0.6 : 0.4
    }

    private func scale(for index: Int) -> CGFloat {
        let p = phase.truncatingRemainder(dividingBy: 3)
        let dist = min(abs(p - Double(index)), 3 - abs(p - Double(index)))
        return dist < 0.5 ? 1.0 + CGFloat(1.0 - dist * 2) * 0.4 : 1.0
    }
}
