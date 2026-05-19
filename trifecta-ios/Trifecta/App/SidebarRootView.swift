import SwiftUI

struct SidebarRootView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var selectedThread: ThreadShell?
    @State private var isSidebarOpen = false
    @State private var dragOffset: CGFloat = 0
    @State private var showNewThread = false
    @State private var showSettings = false
    @State private var showArchived = false
    @State private var showSSH = false
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue

    private let sidebarWidth: CGFloat = 330

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                mainContent
                    .frame(width: geometry.size.width, height: geometry.size.height)

                if openFraction > 0.01 {
                    Color.black
                        .opacity(0.36 * openFraction)
                        .ignoresSafeArea()
                        .contentShape(Rectangle())
                        .onTapGesture { closeSidebar() }
                }

                SidebarPanel(selectedThread: $selectedThread,
                             onNewThread: {
                                 closeSidebar()
                                 showNewThread = true
                             },
                             onOpenSettings: {
                                 closeSidebar()
                                 showSettings = true
                             },
                             onOpenArchived: {
                                 closeSidebar()
                                 showArchived = true
                             },
                             onClose: closeSidebar)
                    .frame(width: min(sidebarWidth, geometry.size.width - 38))
                    .offset(x: sidebarOffset(width: min(sidebarWidth, geometry.size.width - 38)))
                    .shadow(color: .black.opacity(0.16 * openFraction), radius: 18, x: 6, y: 0)
                    .ignoresSafeArea(.all, edges: [.top, .bottom])
            }
            .gesture(sidebarDrag(in: geometry))
        }
        .sheet(isPresented: $showNewThread) {
            NewThreadView()
                .environment(env)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(isModal: true)
                .environment(env)
        }
        .sheet(isPresented: $showArchived) {
            NavigationStack {
                ArchivedThreadsView()
                    .environment(env)
            }
        }
        .sheet(isPresented: $showSSH) {
            NavigationStack {
                SshClientView()
                    .environment(env)
            }
        }
        .environment(\.t3OpenSidebar, openSidebar)
        .environment(\.t3NavigateHome, navigateHome)
    }

    @ViewBuilder
    private var mainContent: some View {
        ZStack {
            T3Color.surfaceGrouped.ignoresSafeArea()

            if let selectedThread {
                ThreadView(threadShell: selectedThread)
                    .id(selectedThread.id)
                    .environment(env)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .opacity))
            } else {
                SidebarHomeView(onOpenSidebar: openSidebar,
                                onNewThread: { showNewThread = true },
                                onOpenSettings: { showSettings = true },
                                onOpenSSH: { showSSH = true })
                    .environment(env)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.9), value: selectedThread?.id)
    }

    private var openFraction: CGFloat {
        let base = isSidebarOpen ? sidebarWidth : 0
        return max(0, min(1, (base + dragOffset) / sidebarWidth))
    }

    private func sidebarOffset(width: CGFloat) -> CGFloat {
        -width + (width * openFraction)
    }

    private func openSidebar() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            isSidebarOpen = true
            dragOffset = 0
        }
        HapticFeedback.impact(.light)
    }

    private func closeSidebar() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            isSidebarOpen = false
            dragOffset = 0
        }
    }

    private func navigateHome() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.9)) {
            selectedThread = nil
        }
    }

    private func sidebarDrag(in geometry: GeometryProxy) -> some Gesture {
        DragGesture(minimumDistance: 14, coordinateSpace: .local)
            .onChanged { value in
                let horizontal = abs(value.translation.width)
                let vertical = abs(value.translation.height)
                guard horizontal > vertical else { return }

                if isSidebarOpen {
                    dragOffset = min(0, value.translation.width)
                } else if value.startLocation.x < 34 {
                    dragOffset = max(0, min(sidebarWidth, value.translation.width))
                }
            }
            .onEnded { value in
                let predicted = value.predictedEndTranslation.width
                let threshold = sidebarWidth * 0.34
                withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                    if isSidebarOpen {
                        isSidebarOpen = !(dragOffset < -threshold || predicted < -sidebarWidth * 0.5)
                    } else {
                        isSidebarOpen = dragOffset > threshold || predicted > sidebarWidth * 0.5
                    }
                    dragOffset = 0
                }
            }
    }
}

private struct SidebarHomeView: View {
    @Environment(AppEnvironment.self) private var env
    @AppStorage("accent") private var accentRaw: String = AppAccent.blue.rawValue
    let onOpenSidebar: () -> Void
    let onNewThread: () -> Void
    let onOpenSettings: () -> Void
    let onOpenSSH: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: T3Spacing.sm) {
                T3Style.ToolbarChip(size: 42, action: onOpenSidebar) {
                    Image(systemName: "sidebar.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                }
                Spacer()
                ConnectionPill(state: env.connectionStatus)
            }
            .padding(.horizontal, T3Spacing.lg)
            .padding(.top, T3Spacing.md)

            Spacer(minLength: 40)

            VStack(spacing: T3Spacing.xl) {
                VStack(spacing: T3Spacing.md) {
                    T3WordmarkLabel(size: 28)
                    Text("Open a thread from the glass sidebar.")
                        .font(T3Typography.callout)
                        .foregroundStyle(T3Color.textSecondary)
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: T3Spacing.md) {
                    Button(action: onOpenSidebar) {
                        Label("Browse", systemImage: "sidebar.left")
                            .font(T3Typography.bodyEmphasis)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, T3Spacing.sm)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppAccent.color(for: accentRaw))

                    Button(action: onNewThread) {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(env.connectionStatus != .connected || env.threadList.projects.isEmpty)
                }
                .frame(maxWidth: 320)
            }
            .padding(.horizontal, T3Spacing.xxxl)

            Spacer()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            T3BottomNavBar(items: [
                .init(title: "Threads", systemImage: "sidebar.left", action: onOpenSidebar),
                .init(title: "SSH", systemImage: "terminal", action: onOpenSSH),
                .init(title: "New", systemImage: "plus", action: onNewThread, isEnabled: env.connectionStatus == .connected && !env.threadList.projects.isEmpty),
                .init(title: "Settings", systemImage: "gearshape", action: onOpenSettings),
            ])
            .padding(.horizontal, T3Spacing.lg)
            .padding(.bottom, 8)
        }
    }
}

struct T3BottomNavBar: View {
    struct Item: Identifiable {
        let id = UUID()
        let title: String
        let systemImage: String
        let action: () -> Void
        var isEnabled: Bool = true
    }

    let items: [Item]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(items) { item in
                Button(action: item.action) {
                    VStack(spacing: 4) {
                        Image(systemName: item.systemImage)
                            .font(.system(size: 17, weight: .semibold))
                            .frame(height: 19)
                        Text(item.title)
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(item.isEnabled ? T3Color.textPrimary : T3Color.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!item.isEnabled)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .t3Glass(radius: 28,
                 tint: T3GlassChrome.panelTint(),
                 stroke: T3Color.separator,
                 interactive: false)
        .shadow(color: .black.opacity(0.14), radius: 16, x: 0, y: 6)
    }
}
