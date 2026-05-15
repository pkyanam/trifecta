import SwiftUI

struct ThinkingBlockView: View {
    let content: String
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: expanded ? T3Spacing.sm : 0) {
            Button {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                    expanded.toggle()
                }
                HapticFeedback.selection()
            } label: {
                HStack(spacing: T3Spacing.sm) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .semibold))
                    Text(expanded ? "Thinking" : "Thinking...")
                        .font(.system(size: 13, weight: .semibold))
                    Spacer(minLength: T3Spacing.sm)
                }
                .foregroundStyle(T3Color.textSecondary)
                .padding(.horizontal, T3Spacing.md)
                .frame(height: 38)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded {
                MarkdownText(source: content, baseFont: T3Typography.footnote)
                    .padding(.horizontal, T3Spacing.md)
                    .padding(.bottom, T3Spacing.md)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .t3Glass(radius: T3Radius.md, tint: T3Color.surfaceMuted.opacity(0.44))
    }
}
