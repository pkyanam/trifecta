import SwiftUI
import UIKit

/// Multiline editor with reliable UTF-16 selection updates for @ / $ triggers.
struct ComposerBackedTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var isFocused: Bool
    var font: UIFont
    var textColor: UIColor
    var tintColor: UIColor
    var cursorUTF16: Int?
    var onClearPendingCursor: () -> Void
    var onEdit: (_ text: String, _ selectedEndUTF16: Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        tv.font = font
        tv.textColor = textColor
        tv.tintColor = tintColor
        tv.backgroundColor = .clear
        tv.textContainerInset = UIEdgeInsets(top: 8, left: 2, bottom: 8, right: 2)
        tv.textContainer.lineFragmentPadding = 0
        tv.isScrollEnabled = true
        tv.keyboardDismissMode = .interactive
        tv.autocorrectionType = .default
        tv.autocapitalizationType = .sentences
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return tv
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        context.coordinator.parent = self
        if uiView.font != font { uiView.font = font }
        if uiView.textColor != textColor { uiView.textColor = textColor }
        if uiView.tintColor != tintColor { uiView.tintColor = tintColor }

        let incoming = text
        if uiView.text != incoming {
            let ns = incoming as NSString
            let fullLen = ns.length
            uiView.text = incoming
            if let c = cursorUTF16, c >= 0, c <= fullLen {
                uiView.selectedRange = NSRange(location: c, length: 0)
                DispatchQueue.main.async(execute: onClearPendingCursor)
            } else {
                let end = (incoming as NSString).length
                uiView.selectedRange = NSRange(location: end, length: 0)
            }
        } else if let c = cursorUTF16 {
            let fullLen = (uiView.text as NSString?)?.length ?? 0
            if c >= 0, c <= fullLen, uiView.selectedRange.location != c || uiView.selectedRange.length != 0 {
                uiView.selectedRange = NSRange(location: c, length: 0)
                DispatchQueue.main.async(execute: onClearPendingCursor)
            }
        }

        // Only push focus when SwiftUI explicitly sets it. Don't resign here:
        // user taps focus the UITextView directly, and re-renders triggered by
        // suggestion menu updates would otherwise dismiss the keyboard.
        if isFocused, !uiView.isFirstResponder {
            DispatchQueue.main.async { uiView.becomeFirstResponder() }
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerBackedTextView

        init(_ parent: ComposerBackedTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            let t = textView.text ?? ""
            let end = textView.selectedRange.location + textView.selectedRange.length
            if parent.text != t {
                parent.text = t
            }
            parent.onEdit(t, end)
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            let t = textView.text ?? ""
            let end = textView.selectedRange.location + textView.selectedRange.length
            parent.onEdit(t, end)
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if !self.parent.isFocused { self.parent.isFocused = true }
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if self.parent.isFocused { self.parent.isFocused = false }
            }
        }
    }
}
