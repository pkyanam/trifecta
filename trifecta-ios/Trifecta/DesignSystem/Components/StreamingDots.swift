import SwiftUI

struct StreamingDots: View {
    @State private var phase: Double = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(T3Color.textTertiary)
                    .frame(width: 5, height: 5)
                    .opacity(opacity(for: i))
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: false)) {
                phase = 3
            }
        }
    }

    private func opacity(for index: Int) -> Double {
        let p = phase.truncatingRemainder(dividingBy: 3)
        let distance = abs(p - Double(index))
        return max(0.3, 1 - distance * 0.5)
    }
}
