import SwiftUI
import UIKit

struct MessageBubble: View {
    @Environment(AppEnvironment.self) private var env
    let role: MessageRole
    let text: String
    let attachments: [ChatImageAttachment]?
    let isStreaming: Bool
    let timestamp: Date
    @AppStorage("transcriptDensity") private var transcriptDensityRaw: String = TranscriptDensity.comfortable.rawValue
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    @AppStorage("userBubbleColor") private var userBubbleColorRaw: String = UserBubbleColor.accent.rawValue
    @State private var previewImage: IdentifiableImage? = nil

    var body: some View {
        if role == .user {
            userBubble
        } else {
            assistantBubble
        }
    }

    // MARK: - User bubble (right-aligned, accent-colored)

    private var userBubble: some View {
        HStack(alignment: .bottom, spacing: 0) {
            Spacer(minLength: 52)
            VStack(alignment: .trailing, spacing: T3Spacing.xs) {
                if let attachments, !attachments.isEmpty {
                    attachmentStrip(attachments, alignment: .trailing)
                }
                if !text.isEmpty {
                    Text(text)
                        .font(textFont)
                        .foregroundStyle(.white)
                        .lineSpacing(3)
                        .textSelection(.enabled)
                        .multilineTextAlignment(.leading)
                        .padding(.horizontal, horizontalPadding)
                        .padding(.vertical, verticalPadding)
                        .background(userBubbleColor, in: RoundedRectangle(cornerRadius: T3Radius.xl, style: .continuous))
                        .shadow(color: userBubbleColor.opacity(0.22), radius: 14, x: 0, y: 8)
                }
                if isStreaming {
                    StreamingDots()
                        .padding(.trailing, T3Spacing.sm)
                }
                Text(timestamp, style: .time)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
                    .monospacedDigit()
            }
            .contextMenu {
                if !text.isEmpty {
                    Button {
                        UIPasteboard.general.string = text
                        HapticFeedback.impact(.light)
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                }
            }
        }
        .sheet(item: $previewImage) { wrapped in
            ImagePreviewSheet(wrapped: wrapped)
        }
    }

    // MARK: - Assistant / system bubble (left-aligned, surface)

    private var assistantBubble: some View {
        VStack(alignment: .leading, spacing: T3Spacing.sm) {
            roleHeader

            if let attachments, !attachments.isEmpty {
                attachmentStrip(attachments, alignment: .leading)
            }

            if !text.isEmpty {
                MarkdownText(source: text, baseFont: textFont)
            }

            if isStreaming {
                TerminalThinkingIndicator()
                    .padding(.top, T3Spacing.xs)
            }

            HStack(spacing: T3Spacing.xs) {
                Spacer()
                Text(timestamp, style: .time)
                    .font(T3Typography.footnote)
                    .foregroundStyle(T3Color.textTertiary)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .t3Glass(radius: T3Radius.lg,
                 tint: T3Color.surfaceElevated.opacity(0.48),
                 stroke: T3Color.separator,
                 interactive: false)
        .contextMenu {
            if !text.isEmpty {
                Button {
                    UIPasteboard.general.string = text
                    HapticFeedback.impact(.light)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
            }
        }
        .sheet(item: $previewImage) { wrapped in
            ImagePreviewSheet(wrapped: wrapped)
        }
    }

    // MARK: - Role header

    private var roleHeader: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(roleColor)
                .frame(width: 6, height: 6)
            Text(roleLabel)
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textSecondary)
                .tracking(0.4)
            Spacer()
        }
    }

    private var roleLabel: String {
        switch role {
        case .system: "SYSTEM"
        case .assistant: "TRIFECTA"
        case .user: "YOU"
        }
    }

    private var roleColor: Color {
        switch role {
        case .system: T3Color.textTertiary
        case .assistant: accentColor
        case .user: T3Color.textSecondary
        }
    }

    // MARK: - Layout helpers

    private var textFont: Font {
        switch density {
        case .compact:     text.contains("\n") ? T3Typography.footnote : T3Typography.callout
        case .comfortable: text.contains("\n") ? T3Typography.callout  : T3Typography.body
        case .spacious:    T3Typography.body
        }
    }

    private var horizontalPadding: CGFloat {
        density == .compact ? T3Spacing.md : T3Spacing.lg
    }

    private var verticalPadding: CGFloat {
        switch density {
        case .compact:     T3Spacing.md
        case .comfortable: T3Spacing.lg
        case .spacious:    T3Spacing.xl
        }
    }

    private var density: TranscriptDensity {
        TranscriptDensity(rawValue: transcriptDensityRaw) ?? .comfortable
    }

    private var accentColor: Color {
        AppAccent.color(for: accentRaw)
    }

    private var userBubbleColor: Color {
        (UserBubbleColor(rawValue: userBubbleColorRaw) ?? .accent).color(accentRaw: accentRaw)
    }

    private func attachmentStrip(_ items: [ChatImageAttachment], alignment: HorizontalAlignment) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: T3Spacing.sm) {
                ForEach(items) { att in
                    ChatImageThumbnailView(attachment: att) { wrapped in
                        previewImage = wrapped
                    }
                }
            }
        }
    }
}

private struct TerminalThinkingIndicator: View {
    @State private var cursorOpacity: Double = 1
    @State private var shimmerOffset: CGFloat = -1

    var body: some View {
        HStack(spacing: 7) {
            HStack(alignment: .bottom, spacing: 1) {
                Text(">")
                    .font(.system(.caption2, design: .monospaced).weight(.semibold))
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(T3Color.textSecondary)
                    .frame(width: 4, height: 1)
                    .padding(.bottom, 2)
                    .opacity(cursorOpacity)
            }
            .foregroundStyle(T3Color.textSecondary)
            .frame(width: 22, height: 22)
            .background(T3Color.surfaceMuted.opacity(0.65), in: Circle())
            .overlay(Circle().stroke(T3Color.separator, lineWidth: 0.5))

            Text("Trifecta is thinking...")
                .font(T3Typography.caption)
                .foregroundStyle(T3Color.textSecondary)
                .overlay { shimmerMask }
                .mask(Text("Trifecta is thinking...").font(T3Typography.caption))
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) {
                cursorOpacity = 0.18
            }
            withAnimation(.easeInOut(duration: 3.8).repeatForever(autoreverses: false)) {
                shimmerOffset = 5
            }
        }
        .accessibilityLabel("Trifecta is thinking")
    }

    private var shimmerMask: some View {
        GeometryReader { geo in
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .white.opacity(0.38), location: 0.42),
                    .init(color: .white.opacity(0.38), location: 0.58),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: geo.size.width * 0.5)
            .offset(x: shimmerOffset * geo.size.width)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Identifiable wrapper for UIImage sheet binding

private struct IdentifiableImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

// MARK: - Image preview sheet

private struct ImagePreviewSheet: View {
    let wrapped: IdentifiableImage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            GeometryReader { _ in
                Image(uiImage: wrapped.image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            }
            .background(Color.black)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(.white)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        UIImageWriteToSavedPhotosAlbum(wrapped.image, nil, nil, nil)
                        HapticFeedback.notification(.success)
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                            .foregroundStyle(.white)
                    }
                }
            }
        }
    }
}

// MARK: - Chat image thumbnail

private struct ChatImageThumbnailView: View {
    let attachment: ChatImageAttachment
    let onTap: (IdentifiableImage) -> Void

    private let thumbWidth: CGFloat = 160
    private let thumbHeight: CGFloat = 120

    var body: some View {
        Group {
            if let urlStr = attachment.url, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if let ui = image.asUIImage() {
                                    HapticFeedback.impact(.light)
                                    onTap(IdentifiableImage(image: ui))
                                }
                            }
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                    @unknown default:
                        placeholder
                    }
                }
                .frame(width: thumbWidth, height: thumbHeight)
                .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
            } else if let dataUrl = attachment.dataUrl,
                      let data = Self.dataFromDataURL(dataUrl),
                      let ui = UIImage(data: data) {
                Image(uiImage: ui)
                    .resizable()
                    .scaledToFill()
                    .frame(width: thumbWidth, height: thumbHeight)
                    .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        HapticFeedback.impact(.light)
                        onTap(IdentifiableImage(image: ui))
                    }
            } else {
                AuthenticatedAttachmentThumbnail(attachment: attachment,
                                                 width: thumbWidth,
                                                 height: thumbHeight,
                                                 onTap: onTap)
            }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: T3Radius.md)
            .fill(T3Color.surfaceMuted)
            .frame(width: thumbWidth, height: thumbHeight)
            .overlay {
                Image(systemName: "photo")
                    .foregroundStyle(T3Color.textTertiary)
            }
    }

    private static func dataFromDataURL(_ string: String) -> Data? {
        if let range = string.range(of: ";base64,", range: string.startIndex..<string.endIndex) {
            let b64 = String(string[range.upperBound...])
            return Data(base64Encoded: b64)
        }
        return Data(base64Encoded: string)
    }
}

private struct AuthenticatedAttachmentThumbnail: View {
    @Environment(AppEnvironment.self) private var env
    let attachment: ChatImageAttachment
    let width: CGFloat
    let height: CGFloat
    let onTap: (IdentifiableImage) -> Void

    @State private var image: UIImage?
    @State private var didFail = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        HapticFeedback.impact(.light)
                        onTap(IdentifiableImage(image: image))
                    }
            } else if didFail {
                placeholder
            } else {
                ProgressView()
                    .task { await load() }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
            .fill(T3Color.surfaceMuted)
            .overlay {
                VStack(spacing: 4) {
                    Image(systemName: "photo")
                    if !attachment.name.isEmpty {
                        Text(attachment.name)
                            .font(T3Typography.caption)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                .foregroundStyle(T3Color.textTertiary)
                .padding(8)
            }
    }

    @MainActor
    private func load() async {
        guard image == nil, !didFail, let client = env.client else {
            didFail = env.client == nil
            return
        }
        do {
            let data = try await client.attachmentData(id: attachment.id)
            guard let ui = UIImage(data: data) else {
                didFail = true
                return
            }
            image = ui
        } catch {
            didFail = true
        }
    }
}

// MARK: - SwiftUI Image → UIImage helper

private extension Image {
    @MainActor
    func asUIImage() -> UIImage? {
        let renderer = ImageRenderer(content: self)
        return renderer.uiImage
    }
}

// MARK: - Code block

struct CodeBlockView: View {
    let code: String
    let language: String?
    @State private var didCopy: Bool = false

    private var isDiffLikeLanguage: Bool {
        guard let language else { return false }
        switch language.lowercased() {
        case "diff", "patch", "udiff", "git": return true
        default: return false
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if isDiffLikeLanguage {
                DiffCodeLines(code: code)
            } else {
                Text(code)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(T3Color.textPrimary)
                    .lineSpacing(3)
                    .multilineTextAlignment(.leading)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, T3Spacing.md)
        .padding(.vertical, T3Spacing.sm)
        .padding(.top, T3Spacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T3Color.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                .stroke(T3Color.separator, lineWidth: 0.5)
        )
        .overlay(alignment: .topTrailing) {
            codeBlockHeader
        }
    }

    private var codeBlockHeader: some View {
        HStack(spacing: T3Spacing.xs) {
            if let language, !language.isEmpty {
                Text(language.lowercased())
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(T3Color.textTertiary)
                    .tracking(0.4)
            }
            Spacer(minLength: 0)
            copyButton
        }
        .padding(.horizontal, T3Spacing.sm)
        .padding(.top, 6)
    }

    private var copyButton: some View {
        Button {
            UIPasteboard.general.string = code
            HapticFeedback.notification(.success)
            withAnimation(.easeInOut(duration: 0.15)) { didCopy = true }
            Task {
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.15)) { didCopy = false }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: didCopy ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 10, weight: .semibold))
                Text(didCopy ? "Copied" : "Copy")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(didCopy ? T3Color.success : T3Color.textTertiary)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(T3Color.surfaceElevated, in: Capsule())
            .overlay(Capsule().stroke(T3Color.separator, lineWidth: 0.5))
        }
        .buttonStyle(T3ScaleButtonStyle(scale: 0.90))
    }
}

// MARK: - Diff / patch highlighting

private struct DiffCodeLines: View {
    let code: String

    private var lines: [String] {
        code.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline)
            .map(String.init)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(foreground(for: line))
                    .multilineTextAlignment(.leading)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func foreground(for line: String) -> Color {
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("+++ ") || t.hasPrefix("--- ") { return T3Color.textSecondary }
        if t.hasPrefix("diff --git") || t.hasPrefix("Index: ") { return T3Color.textSecondary }
        if t.hasPrefix("@@") { return T3Color.warning }
        guard let c = line.first else { return T3Color.textPrimary }
        switch c {
        case "+": return T3Color.success
        case "-": return T3Color.danger
        case " ": return T3Color.textPrimary
        default:  return T3Color.textPrimary
        }
    }
}
