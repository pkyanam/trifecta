import SwiftUI
import WebKit

struct MermaidBlockView: View {
    let code: String

    var body: some View {
        MermaidWebView(code: code)
            .frame(minHeight: 220)
            .clipShape(RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: T3Radius.md, style: .continuous)
                    .stroke(T3Color.separator, lineWidth: 0.5)
            )
            .accessibilityLabel("Mermaid diagram")
    }
}

private struct MermaidWebView: UIViewRepresentable {
    let code: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = true
        webView.loadHTMLString(html, baseURL: URL(string: "https://cdn.jsdelivr.net"))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: URL(string: "https://cdn.jsdelivr.net"))
    }

    private var html: String {
        let escaped = code
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")

        return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: transparent;
              color: #f5f5f7;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            }
            .wrap {
              min-height: 190px;
              padding: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
            }
            .mermaid {
              width: 100%;
              overflow: auto;
            }
            svg {
              max-width: 100%;
              height: auto !important;
            }
          </style>
          <script type="module">
            import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
            mermaid.initialize({
              startOnLoad: true,
              theme: 'dark',
              securityLevel: 'strict',
              flowchart: { curve: 'basis' }
            });
          </script>
        </head>
        <body>
          <div class="wrap">
            <pre class="mermaid">\(escaped)</pre>
          </div>
        </body>
        </html>
        """
    }
}
