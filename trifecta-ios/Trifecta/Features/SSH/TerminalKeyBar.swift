import SwiftUI

struct TerminalKeyBar: View {
    let sendKey: (String) -> Void

    var body: some View {
        HStack(spacing: 3) {
            keyButton("Esc") { sendKey("\u{1B}") }
            keyButton("Tab") { sendKey("\t") }
            keyButton("^C") { sendKey("\u{3}") }
            keyButton("^D") { sendKey("\u{4}") }
            keyButton("^L") { sendKey("\u{C}") }
            Spacer(minLength: 2)
            keyButton("←", minWidth: 34) { sendKey("\u{1B}[D") }
            keyButton("↑", minWidth: 34) { sendKey("\u{1B}[A") }
            keyButton("↓", minWidth: 34) { sendKey("\u{1B}[B") }
            keyButton("→", minWidth: 34) { sendKey("\u{1B}[C") }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .background(.black)
    }

    private func keyButton(_ label: String, minWidth: CGFloat = 36, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .frame(minWidth: minWidth, minHeight: 30)
                .background(Color.white.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }
}