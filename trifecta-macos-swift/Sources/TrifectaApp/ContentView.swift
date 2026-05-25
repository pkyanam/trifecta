import SwiftUI
import TrifectaCore

struct ContentView: View {
    @Environment(ConnectionStore.self) private var store
    @Environment(ThreadDetailStore.self) private var threadDetailStore
    @State private var showingPairingFlow = false
    @State private var selectedThreadId: String?

    var body: some View {
        NavigationSplitView {
            UnifiedSidebarView(
                showingPairingFlow: $showingPairingFlow,
                selectedThreadId: $selectedThreadId
            )
            .navigationSplitViewColumnWidth(min: 220, ideal: 290, max: 360)
            .navigationTitle("Trifecta")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingPairingFlow = true
                    } label: {
                        Label("Add Connection", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .status) {
                    ConnectionStatusView()
                }
            }
        } detail: {
            ThreadDetailView()
        }
        .sheet(isPresented: $showingPairingFlow) {
            PairingFlowView(isPresented: $showingPairingFlow)
                .environment(store)
        }
        .onChange(of: store.connectionStatus) { _, status in
            if !status.isConnected {
                selectedThreadId = nil
                threadDetailStore.close()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .trifectaShowPairingFlow)) { _ in
            showingPairingFlow = true
        }
    }
}

extension Notification.Name {
    static let trifectaShowPairingFlow = Notification.Name("ai.belweave.trifecta.showPairingFlow")
}
