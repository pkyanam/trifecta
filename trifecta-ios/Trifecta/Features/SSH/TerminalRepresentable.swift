import SwiftUI
import SwiftTerm
import UIKit
import UniformTypeIdentifiers

@MainActor
final class TerminalHandle {
    weak var terminalView: TerminalView?

    func feed(_ text: String) {
        terminalView?.feed(text: text)
    }

    func clear() {
        terminalView?.feed(text: "\u{1B}c")
    }

    func focus() {
        terminalView?.becomeFirstResponder()
    }

    func currentCols() -> Int {
        terminalView?.getTerminal().cols ?? 80
    }

    func currentRows() -> Int {
        terminalView?.getTerminal().rows ?? 24
    }
}

struct TerminalRepresentable: UIViewRepresentable {
    let handle: TerminalHandle
    let onSend: ([UInt8]) -> Void
    let onResize: ((Int, Int) -> Void)?
    let shouldFocus: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(handle: handle, onSend: onSend, onResize: onResize)
    }

    func makeUIView(context: Context) -> TerminalView {
        let tv = TerminalView(frame: .zero)
        tv.terminalDelegate = context.coordinator
        tv.nativeBackgroundColor = UIColor(red: 0.055, green: 0.071, blue: 0.094, alpha: 1)
        tv.nativeForegroundColor = UIColor(white: 0.92, alpha: 1)
        tv.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        context.coordinator.handle.terminalView = tv
        return tv
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        if shouldFocus {
            DispatchQueue.main.async {
                uiView.becomeFirstResponder()
            }
        }
    }

    final class Coordinator: NSObject, TerminalViewDelegate {
        let handle: TerminalHandle
        let onSend: ([UInt8]) -> Void
        let onResize: ((Int, Int) -> Void)?

        init(handle: TerminalHandle, onSend: @escaping ([UInt8]) -> Void, onResize: ((Int, Int) -> Void)?) {
            self.handle = handle
            self.onSend = onSend
            self.onResize = onResize
        }

        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            onSend(Array(data))
        }

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            onResize?(newCols, newRows)
        }

        func clipboardCopy(source: TerminalView, content: Data) {
            UIPasteboard.general.setData(content, forPasteboardType: UTType.plainText.identifier)
        }

        func setTerminalTitle(source: TerminalView, title: String) {}

        func scrolled(source: TerminalView, position: Double) {}

        func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
            guard let url = URL(string: link) else { return }
            UIApplication.shared.open(url)
        }

        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    }
}