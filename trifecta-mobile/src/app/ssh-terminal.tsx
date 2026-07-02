import "@/global.css";

import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { useSsh } from "@/stores/ssh";
import type { SshTerminalEvent } from "@/types/ssh";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, Dimensions, Modal, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { X, Maximize2, Minimize2, Copy, Check, Shield, AlertTriangle } from "lucide-react-native";

// ─── Terminal key bar ────────────────────────────────────────────────────────

type TermKey = { label: string; seq: string; variant?: 'danger' | 'dim' };
type KeyBarItem = TermKey | { divider: true };

const TERM_KEYS: KeyBarItem[] = [
  // Navigation
  { label: 'ESC',  seq: '\x1b' },
  { label: 'TAB',  seq: '\t' },
  { divider: true },
  // Arrow keys
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
  { divider: true },
  // Common ctrl shortcuts
  { label: '^C', seq: '\x03', variant: 'danger' },
  { label: '^Z', seq: '\x1a' },
  { label: '^D', seq: '\x04' },
  { label: '^L', seq: '\x0c' },
  { label: '^A', seq: '\x01' },
  { label: '^E', seq: '\x05' },
  { label: '^R', seq: '\x12' },
  { label: '^U', seq: '\x15' },
  { label: '^K', seq: '\x0b' },
  { label: '^W', seq: '\x17' },
  { divider: true },
  // Scroll / navigation
  { label: 'PgUp', seq: '\x1b[5~', variant: 'dim' },
  { label: 'PgDn', seq: '\x1b[6~', variant: 'dim' },
  { label: 'Home', seq: '\x1b[H',  variant: 'dim' },
  { label: 'End',  seq: '\x1b[F',  variant: 'dim' },
  { divider: true },
  // Special characters
  { label: '|',  seq: '|' },
  { label: '~',  seq: '~' },
  { label: '/',  seq: '/' },
  { label: '\\', seq: '\\' },
  { label: '`',  seq: '`' },
  { label: '-',  seq: '-' },
  { label: '_',  seq: '_' },
  { label: ':',  seq: ':' },
];

function TerminalKeybar({ onKey, onKeyboardToggle, keyboardOpen }: {
  onKey: (seq: string) => void;
  onKeyboardToggle: () => void;
  keyboardOpen: boolean;
}) {
  return (
    <View style={styles.keybar}>
      {/* Keyboard toggle — always visible, reliable native button */}
      <Pressable
        onPress={onKeyboardToggle}
        className="active:opacity-50"
        style={styles.keyboardToggle}
      >
        <Text style={[styles.keyLabel, { fontSize: 14 }]}>
          {keyboardOpen ? '⌨︎↓' : '⌨︎↑'}
        </Text>
      </Pressable>
      <View style={styles.keybarDividerV} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.keybarContent}
      >
        {TERM_KEYS.map((item, i) => {
          if ('divider' in item) {
            return <View key={`div-${i}`} style={styles.divider} />;
          }
          const isDanger = item.variant === 'danger';
          const isDim = item.variant === 'dim';
          return (
            <Pressable
              key={item.label}
              onPress={() => onKey(item.seq)}
              className="active:opacity-50"
              style={[
                styles.key,
                isDanger && styles.keyDanger,
                isDim && styles.keyDim,
                item.label.length === 1 && styles.keySquare,
              ]}
            >
              <Text
                style={[
                  styles.keyLabel,
                  isDanger && styles.keyLabelDanger,
                  isDim && styles.keyLabelDim,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  keybar: {
    backgroundColor: '#161618',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#38383a',
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyboardToggle: {
    height: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  keybarDividerV: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: '#48484a',
  },
  keybarContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: '#48484a',
    marginHorizontal: 4,
  },
  key: {
    backgroundColor: '#363638',
    borderRadius: 6,
    height: 32,
    paddingHorizontal: 10,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySquare: {
    width: 36,
    paddingHorizontal: 0,
  },
  keyDanger: {
    backgroundColor: '#4a1515',
  },
  keyDim: {
    backgroundColor: '#2a2a2c',
  },
  keyLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0,
  },
  keyLabelDanger: {
    color: '#ff6b6b',
  },
  keyLabelDim: {
    color: '#8e8e93',
  },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function SshTerminalScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { 
    activeSession, 
    terminalEvents, 
    isLoadingSession, 
    getSession, 
    sendInput, 
    closeSession,
    resize,
    hosts,
    confirmHostKey
  } = useSsh();
  const webViewRef = useRef<WebView>(null);
  const sessionLoadedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [hostKeyPrompt, setHostKeyPrompt] = useState<any>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  // Get host label from hosts list
  const hostLabel = hosts.find(h => h.id === activeSession?.hostId)?.label || "SSH Terminal";

  // Track keyboard height so the TerminalKeybar always floats above the keyboard.
  // We subtract the bottom safe area inset because SafeAreaView already reserves that space.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height - insets.bottom));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);

  // Force-dismiss the keyboard when the host key modal appears.
  // Keyboard.dismiss() resigns the native first responder, which works even
  // when the keyboard is owned by a WKWebView's internal textarea.
  useEffect(() => {
    if (hostKeyPrompt) {
      Keyboard.dismiss();
    }
  }, [hostKeyPrompt]);

  // Handle dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  // Load session on mount
  useEffect(() => {
    if (sessionId && !sessionLoadedRef.current) {
      sessionLoadedRef.current = true;
      getSession({ sessionId }).then((session) => {
        // Check if session is in error state
        if (session.status === "error") {
          // Show error if session is in error state
          Alert.alert("Connection Error", "Failed to establish SSH connection. Please check your server logs and try again.");
        }
        // Note: We don't show host key prompt here - we wait for the host-key-prompt event from server
        // The original iOS/Android apps only show the popup when the actual event arrives
      }).catch((error) => {
        console.error("[SSH Terminal] Failed to load session:", error);
        Alert.alert("Error", "Failed to load SSH session");
      });
    }
    return () => {
      sessionLoadedRef.current = false;
    };
  }, [sessionId, getSession]);

  // Handle session cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionId) {
        closeSession({ sessionId }).catch(console.error);
      }
    };
  }, [sessionId, closeSession]);

  // Write newly-arrived terminal events to the WebView exactly once.
  //
  // We track the last-written event by object identity (event objects are
  // stable across the store's bounded buffer), then process everything after
  // it. This is lossless when several events land in one render (writing only
  // the last would drop output) and idempotent across unrelated re-renders
  // (e.g. the `router` dependency) — which is what caused duplicate output.
  const lastWrittenEventRef = useRef<SshTerminalEvent | null>(null);
  useEffect(() => {
    if (!webViewRef.current || terminalEvents.length === 0) return;

    let startIndex = 0;
    if (lastWrittenEventRef.current) {
      const idx = terminalEvents.indexOf(lastWrittenEventRef.current);
      // -1 => the marker scrolled out of the buffer or the buffer was reset for
      // a new session; fall back to writing the whole current buffer.
      startIndex = idx >= 0 ? idx + 1 : 0;
    }
    const newEvents = terminalEvents.slice(startIndex);
    if (newEvents.length === 0) return;
    lastWrittenEventRef.current = terminalEvents[terminalEvents.length - 1];

    for (const event of newEvents) {
      if (event.type === "output") {
        webViewRef.current.injectJavaScript(
          `if (window.term) { window.term.write(${JSON.stringify(event.data)}); } true;`,
        );
      } else if (event.type === "host-key-prompt") {
        webViewRef.current.injectJavaScript(`if (window.term) { window.term.reset(); } true;`);
        // Blur the terminal textarea so iOS dismisses the keyboard before the modal renders.
        webViewRef.current.injectJavaScript(`document.activeElement && document.activeElement.blur(); true;`);
        const prompt = event.prompt;
        // Defer to avoid setState during the render/commit phase.
        setTimeout(() => setHostKeyPrompt(prompt), 0);
      } else if (event.type === "status") {
        if (event.snapshot.status === "pending-host-key") {
          webViewRef.current.injectJavaScript(
            `if (window.term) { window.term.write('[ssh] waiting for host key approval...\\r\\n'); } true;`,
          );
        } else if (event.snapshot.status === "error") {
          Alert.alert(
            "Connection Error",
            "SSH session encountered an error. Please check your server logs.",
          );
        } else if (event.snapshot.status === "closed") {
          Alert.alert("Session Closed", "The SSH session has been closed.");
          router.back();
        }
      } else if (event.type === "error") {
        Alert.alert("SSH Error", event.message);
      }
    }
  }, [terminalEvents, router]);

  // When native layout changes (keyboard, rotation), ask xterm to refit.
  // xterm's fitAddon measures actual character metrics and posts a 'dimensions'
  // message with the real cols/rows, which handleMessage uses to call resize.
  useEffect(() => {
    if (!sessionId) return;
    const t = setTimeout(() => {
      webViewRef.current?.injectJavaScript(
        `if (window.fitAddon) { window.fitAddon.fit(); } true;`,
      );
    }, 50);
    return () => clearTimeout(t);
  }, [dimensions, sessionId, keyboardHeight]);

  const handleClose = () => {
    Alert.alert(
      "Close Terminal",
      "Are you sure you want to close this SSH session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          style: "destructive",
          onPress: async () => {
            try {
              await closeSession({ sessionId });
              router.back();
            } catch {
              Alert.alert("Error", "Failed to close session");
            }
          },
        },
      ],
    );
  };

  const handleHostKeyDecision = useCallback(async (decision: "approve" | "reject", remember: boolean) => {
    if (!hostKeyPrompt) return;
    
    try {
      await confirmHostKey({
        sessionId,
        fingerprintSha256: hostKeyPrompt.fingerprintSha256,
        decision,
        remember,
      });
      setHostKeyPrompt(null);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      console.error("[SSH Terminal] Host key confirmation error:", error);

      if (raw.includes("SshHostKeyMismatchError")) {
        Alert.alert(
          "Host Key Mismatch",
          "The server's host key doesn't match the expected fingerprint. This could indicate a security issue or that the host key has changed. Please verify the fingerprint on your server and update the host profile if needed.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Update Profile",
              onPress: () => {
                setHostKeyPrompt(null);
                router.back();
              },
            },
          ]
        );
      } else if (raw.includes("SshSessionNotFoundError")) {
        // Session expired between the host-key prompt and approval — just go back.
        setHostKeyPrompt(null);
        Alert.alert("Session Expired", "The SSH session expired before the host key could be confirmed. Please reconnect.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("Error", "Failed to confirm host key. Please try again.");
      }
    }
  }, [hostKeyPrompt, sessionId, confirmHostKey, router]);

  const handleCopy = useCallback(() => {
    // Copy terminal content to clipboard
    webViewRef.current?.injectJavaScript(`
      if (window.term) {
        const selection = window.term.getSelection();
        if (selection) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'copy', data: selection }));
        }
      }
    `);
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "input") {
        sendInput({ sessionId, data: message.data });
      } else if (message.type === "dimensions") {
        // xterm reports its actual cols/rows after fitAddon.fit() — use these
        // to sync the PTY so COLUMNS matches what xterm renders exactly.
        resize({ sessionId, cols: message.cols, rows: message.rows }).catch(console.error);
      } else if (message.type === "ready") {
        // xterm.js ready
      } else if (message.type === "error") {
        console.error("[SSH Terminal] WebView error:", message.message);
        Alert.alert("Terminal Error", message.message);
      } else if (message.type === "copy") {
        Clipboard.setStringAsync(message.data);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      console.error("Failed to handle WebView message");
    }
  }, [sessionId, sendInput, resize]);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.jsdelivr.net 'unsafe-inline'; style-src https://cdn.jsdelivr.net 'unsafe-inline'; img-src data:; connect-src 'none';">
      <!-- xterm.css is REQUIRED: it positions rows/characters and hides xterm's
           character-measurement element (a row of "W"s). Without it the measure
           element is visible and the terminal layout is garbled. -->
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          background: #000;
          color: #fff;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          overflow: hidden;
          height: 100%;
          width: 100%;
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        #terminal {
          width: 100%;
          height: 100%;
          outline: none;
        }
        #terminal:focus {
          outline: none;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
    </head>
    <body>
      <div id="terminal" tabindex="0"></div>
      <script>
        // Wait for DOM to be ready
        document.addEventListener('DOMContentLoaded', function() {
          try {
            const term = new Terminal({
              cursorBlink: true,
              fontSize: 14,
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              theme: {
                background: '#000000',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selection: 'rgba(255, 255, 255, 0.3)',
              },
            });
            
            const fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);

            term.open(document.getElementById('terminal'));

            // Expose so native side can trigger refit via injectJavaScript.
            window.term = term;
            window.fitAddon = fitAddon;

            // After every fit, report the actual cols/rows so the PTY stays in
            // sync with what xterm renders (avoids COLUMNS mismatch that causes
            // zsh PROMPT_SP % to wrap and TUI apps to overflow).
            function reportDimensions() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'dimensions',
                cols: term.cols,
                rows: term.rows,
              }));
            }

            fitAddon.fit();
            reportDimensions();

            // Clear terminal on initialization
            term.reset();

            term.onData((data) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'input', data }));
            });

            // Tap to dismiss: intercept touchstart in capture phase so xterm.js
            // never sees the event and cannot queue a re-focus call. Without this,
            // xterm's own touchstart listener calls term.focus(), which immediately
            // reopens the keyboard right after our blur() on touchend.
            document.getElementById('terminal').addEventListener('touchstart', function(e) {
              var ta = term.textarea;
              if (ta && document.activeElement === ta) {
                e.stopImmediatePropagation();
                e.preventDefault();
              }
            }, { capture: true, passive: false });

            // touchend: dismiss keyboard when terminal is tapped while keyboard is open.
            // No show path — use the ⌨ button in the keybar to reopen the keyboard.
            document.getElementById('terminal').addEventListener('touchend', function(e) {
              var ta = term.textarea;
              if (!ta) return;
              if (document.activeElement === ta) {
                e.preventDefault();
                ta.blur();
              }
            });

            // Auto-focus terminal
            term.focus();

            window.addEventListener('resize', () => {
              fitAddon.fit();
              reportDimensions();
            });

            // Initial fit with delay to let the WebView finish layout.
            setTimeout(() => { fitAddon.fit(); reportDimensions(); }, 100);
            setTimeout(() => { fitAddon.fit(); reportDimensions(); }, 500);

            // Send ready signal
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: error.message }));
          }
        });
      </script>
    </body>
    </html>
  `;

  if (isLoadingSession) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color="#fff" />
          <Text className="text-muted-foreground mt-4 text-center">Connecting to terminal...</Text>
          <Text className="text-muted-foreground mt-2 text-xs text-center">Establishing secure SSH connection to {hostLabel}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 py-3 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 min-w-0">
            <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
              {hostLabel}
            </Text>
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {activeSession?.status || "Connecting..."}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableGlass
              onPress={handleCopy}
              className="rounded-full p-2 active:opacity-60"
            >
              <Icon icon={copied ? Check : Copy} className="w-5 h-5 text-foreground" />
            </TouchableGlass>
            <TouchableGlass
              onPress={() => setIsFullscreen(!isFullscreen)}
              className="rounded-full p-2 active:opacity-60"
            >
              <Icon icon={isFullscreen ? Minimize2 : Maximize2} className="w-5 h-5 text-foreground" />
            </TouchableGlass>
            <Pressable onPress={handleClose} className="p-2 active:opacity-60">
              <Icon icon={X} className="w-5 h-5 text-foreground" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        {/* Terminal */}
        <View className="flex-1 bg-black">
          <WebView
            ref={webViewRef}
            source={{ html }}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scalesPageToFit={false}
            bounces={false}
            overScrollMode="never"
            keyboardDisplayRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            startInLoadingState={false}
            allowsBackForwardNavigationGestures={false}
            keyboardAppearance="dark"
            hideKeyboardAccessoryView={true}
            textInteractionEnabled={true}
            onShouldStartLoadWithRequest={(request) => {
              // Only allow the initial static HTML load. Block all external
              // navigation to prevent a compromised CDN or injected content
              // from redirecting the WebView to an attacker-controlled origin.
              return request.url === "about:blank" || request.url.startsWith("about:blank");
            }}
          />
        </View>

        {/* Terminal key bar — sits above the iOS keyboard */}
        <TerminalKeybar
          onKey={(seq) => sendInput({ sessionId, data: seq })}
          keyboardOpen={keyboardHeight > 0}
          onKeyboardToggle={() => {
            if (keyboardHeight > 0) {
              // Dismiss: blur in JS + native dismiss
              webViewRef.current?.injectJavaScript(
                `document.activeElement && document.activeElement.blur(); true;`
              );
              Keyboard.dismiss();
            } else {
              // Show: inject the positioning trick into the WebView.
              // Since keyboardDisplayRequiresUserAction={false}, programmatic
              // focus from injectJavaScript is allowed to display the keyboard.
              webViewRef.current?.injectJavaScript(`
                (function() {
                  var ta = window.term && window.term.textarea;
                  if (!ta) return;
                  ta.style.position = 'fixed';
                  ta.style.left = '50%';
                  ta.style.top = '50%';
                  ta.style.width = '20px';
                  ta.style.height = '20px';
                  ta.style.opacity = '0';
                  ta.style.zIndex = '9999';
                  ta.style.fontSize = '16px';
                  ta.focus();
                  requestAnimationFrame(function() { ta.style.cssText = ''; });
                })();
                true;
              `);
            }
          }}
        />
      </View>

      {/* Host Key Verification Modal */}
      <Modal
        visible={!!hostKeyPrompt}
        transparent
        animationType="slide"
        onRequestClose={() => setHostKeyPrompt(null)}
      >
        <View className="flex-1 justify-end" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 }}>
          {/* Backdrop */}
          <Pressable className="absolute inset-0 bg-black/60" onPress={() => setHostKeyPrompt(null)} />

          {/* Bottom sheet card */}
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            className="w-full bg-background/95 backdrop-blur-xl border-t border-border/50"
            style={{
              maxHeight: "85%",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center gap-3">
                  <View className="w-12 h-12 rounded-full bg-yellow-500/20 items-center justify-center">
                    <Icon icon={AlertTriangle} className="w-6 h-6 text-yellow-500" />
                  </View>
                  <View>
                    <Text className="text-xl font-bold text-foreground">Verify Host Key</Text>
                    <Text className="text-sm text-muted-foreground">Security verification required</Text>
                  </View>
                </View>
                <Pressable onPress={() => setHostKeyPrompt(null)} className="p-2 active:opacity-60">
                  <Icon icon={X} className="w-6 h-6 text-foreground" />
                </Pressable>
              </View>

              {/* Host Info */}
              <View className="bg-muted rounded-2xl p-4 mb-6">
                <Text className="text-sm font-medium text-foreground mb-2">Host</Text>
                <Text className="text-base text-foreground mb-4">
                  {hostKeyPrompt?.hostname}:{hostKeyPrompt?.port}
                </Text>

                <Text className="text-sm font-medium text-foreground mb-2">Key Type</Text>
                <Text className="text-base text-foreground mb-4">
                  {hostKeyPrompt?.keyType}
                </Text>

                <Text className="text-sm font-medium text-foreground mb-2">Fingerprint (SHA256)</Text>
                <Text className="text-sm text-muted-foreground font-mono break-all">
                  {hostKeyPrompt?.fingerprintSha256}
                </Text>
              </View>

              {/* Warning */}
              <View className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
                <View className="flex-row items-start gap-3">
                  <Icon icon={Shield} className="w-5 h-5 text-yellow-500 mt-0.5" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground mb-1">Security Notice</Text>
                    <Text className="text-xs text-muted-foreground">
                      Verify this fingerprint matches your server&apos;s host key. Only approve if you trust this host.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View className="gap-3">
                <TouchableGlass
                  onPress={() => handleHostKeyDecision("approve", true)}
                  className="rounded-xl py-4 items-center"
                >
                  <Text className="text-foreground font-semibold">Approve & Remember</Text>
                </TouchableGlass>

                <TouchableGlass
                  onPress={() => handleHostKeyDecision("approve", false)}
                  className="rounded-xl py-4 items-center bg-muted"
                >
                  <Text className="text-foreground font-semibold">Approve Once</Text>
                </TouchableGlass>

                <Pressable
                  onPress={() => handleHostKeyDecision("reject", false)}
                  className="rounded-xl py-4 items-center"
                >
                  <Text className="text-red-500 font-semibold">Reject</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
