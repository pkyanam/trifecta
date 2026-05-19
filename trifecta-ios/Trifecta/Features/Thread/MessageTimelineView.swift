import SwiftUI

struct MessageTimelineView: View {
    @Bindable var store: ThreadStore
    let threadShell: ThreadShell
    @AppStorage("transcriptDensity") private var transcriptDensityRaw: String = TranscriptDensity.comfortable.rawValue
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue

    @State private var isNearBottom: Bool = true
    @State private var didInitialScroll: Bool = false
    @State private var hasNewWhileScrolledUp: Bool = false

    private let bottomAnchor = "BOTTOM"
    private let stickyThreshold: CGFloat = 120

    var body: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: messageSpacing) {
                        if store.timelineRows.isEmpty {
                            emptyState.padding(.top, 96)
                        } else {
                            ForEach(store.timelineRows) { row in
                                rowView(row)
                            }
                        }
                        Color.clear
                            .frame(height: 1)
                            .id(bottomAnchor)
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.top, T3Spacing.lg)
                    .padding(.bottom, T3Spacing.xxl)
                }
                .t3ScrollEdgeSoftFade()
                .background(T3Color.surfaceGrouped)
                .contentShape(Rectangle())
                .scrollDismissesKeyboard(.interactively)
                .onTapGesture {
                    UIApplication.dismissKeyboard()
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    let distanceFromBottom = geometry.contentSize.height
                        - (geometry.contentOffset.y + geometry.containerSize.height)
                    return distanceFromBottom <= stickyThreshold
                } action: { _, near in
                    isNearBottom = near
                    if near { hasNewWhileScrolledUp = false }
                }
                .onChange(of: store.timelineRows.count) { _, _ in
                    handleStreamUpdate(proxy: proxy, animated: true)
                }
                .onChange(of: store.messages.last?.text) { _, _ in
                    handleStreamUpdate(proxy: proxy, animated: false)
                }
                .onChange(of: store.messages.last?.attachments?.count) { _, _ in
                    handleStreamUpdate(proxy: proxy, animated: false)
                }
                .onChange(of: latestActivitySignature) { _, _ in
                    handleStreamUpdate(proxy: proxy, animated: false)
                }
                .onAppear {
                    guard !didInitialScroll else { return }
                    didInitialScroll = true
                    DispatchQueue.main.async {
                        proxy.scrollTo(bottomAnchor, anchor: .bottom)
                    }
                }

                if !isNearBottom && !store.timelineRows.isEmpty {
                    jumpToLatestButton(proxy: proxy)
                        .padding(.trailing, T3Spacing.lg)
                        .padding(.bottom, T3Spacing.md)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.32, dampingFraction: 0.85), value: isNearBottom)
            .animation(.easeInOut(duration: 0.2), value: hasNewWhileScrolledUp)
        }
    }

    @ViewBuilder
    private func rowView(_ row: ThreadTimelineRow) -> some View {
        switch row {
        case .message(let message):
            MessageBubble(role: message.role,
                          text: message.text,
                          attachments: message.attachments,
                          isStreaming: message.streaming,
                          timestamp: message.createdAt)
                .id(row.id)
        case .activity(let activity):
            ActivityRow(activity: activity)
                .id(row.id)
        }
    }

    /// A coarse signature that changes when activities arrive or transition
    /// from in-progress to complete, so we can re-trigger sticky scroll.
    private var latestActivitySignature: String {
        guard let last = store.activities.last else { return "" }
        return last.id + ":" + last.kind
    }

    // MARK: - Scroll behavior

    private func handleStreamUpdate(proxy: ScrollViewProxy, animated: Bool) {
        if isNearBottom {
            if animated {
                withAnimation(.easeOut(duration: 0.18)) {
                    proxy.scrollTo(bottomAnchor, anchor: .bottom)
                }
            } else {
                proxy.scrollTo(bottomAnchor, anchor: .bottom)
            }
        } else {
            hasNewWhileScrolledUp = true
        }
    }

    private func jumpToLatestButton(proxy: ScrollViewProxy) -> some View {
        let isStreaming = store.messages.last?.streaming == true
        let hasActivity = hasNewWhileScrolledUp || isStreaming
        let label = hasActivity ? "New message" : "Jump to latest"
        return Button {
            HapticFeedback.impact(.light)
            hasNewWhileScrolledUp = false
            withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                proxy.scrollTo(bottomAnchor, anchor: .bottom)
            }
        } label: {
            Group {
                if #available(iOS 26.0, *) {
                    HStack(spacing: 5) {
                        Image(systemName: hasActivity ? "arrow.down.circle.fill" : "arrow.down")
                            .font(.system(size: 12, weight: .semibold))
                        Text(label)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(hasActivity ? Color.white : accentColor)
                    .padding(.horizontal, T3Spacing.md)
                    .padding(.vertical, 8)
                    .glassEffect(
                        hasActivity
                        ? Glass.regular.tint(accentColor.opacity(0.92)).interactive()
                        : Glass.regular.interactive(),
                        in: Capsule()
                    )
                    .shadow(color: .black.opacity(0.20), radius: 10, y: 3)
                } else {
                    HStack(spacing: 5) {
                        Image(systemName: hasActivity ? "arrow.down.circle.fill" : "arrow.down")
                            .font(.system(size: 12, weight: .semibold))
                        Text(label)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(hasActivity ? Color.white : accentColor)
                    .padding(.horizontal, T3Spacing.md)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(hasActivity ? accentColor : T3Color.surfaceElevated)
                    )
                    .overlay(
                        Capsule()
                            .stroke(hasActivity ? Color.clear : T3Color.separator, lineWidth: 0.5)
                    )
                    .shadow(color: .black.opacity(0.20), radius: 10, y: 3)
                }
            }
        }
        .buttonStyle(T3ScaleButtonStyle())
        .accessibilityLabel(label)
    }

    // MARK: - Layout

    private var density: TranscriptDensity {
        TranscriptDensity(rawValue: transcriptDensityRaw) ?? .comfortable
    }

    private var messageSpacing: CGFloat {
        switch density {
        case .compact:     T3Spacing.sm
        case .comfortable: T3Spacing.md
        case .spacious:    T3Spacing.xl
        }
    }

    private var horizontalPadding: CGFloat {
        switch density {
        case .compact:     T3Spacing.lg
        case .comfortable: T3Spacing.xl
        case .spacious:    T3Spacing.xxl
        }
    }

    private var accentColor: Color {
        AppAccent.color(for: accentRaw)
    }

    private var emptyState: some View {
        VStack(spacing: T3Spacing.md) {
            Image(systemName: "sparkles")
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(accentColor)
                .frame(width: 48, height: 48)
                .t3Glass(radius: T3Radius.md,
                         tint: T3GlassChrome.panelTint(),
                         stroke: T3Color.separator,
                         interactive: false)
            VStack(spacing: T3Spacing.xs) {
                Text("Ready")
                    .font(T3Typography.headline)
                    .foregroundStyle(T3Color.textPrimary)
                Text("Send a message to continue this thread.")
                    .font(T3Typography.callout)
                    .foregroundStyle(T3Color.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
