import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

type TerminalEvent = { type: string; threadId: string; terminalId: string; data?: string; message?: string; snapshot?: { history?: string; status?: string } };
const TERMINAL_ID = "mobile";

export default function TerminalScreen() {
  const params = useLocalSearchParams<{ command?: string }>();
  const { activeThreadId } = useActiveThread();
  const { getThread, getProject } = useThreadList();
  const { request, subscribe } = useWsClient();
  const thread = activeThreadId ? getThread(activeThreadId) : undefined;
  const project = thread ? getProject(thread.projectId) : undefined;
  const cwd = thread?.worktreePath ?? project?.workspaceRoot ?? "";
  const webView = useRef<WebView>(null);
  const [html, setHtml] = useState("");
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const commandSent = useRef(false);
  const write = useCallback((data: string) => {
    webView.current?.injectJavaScript(`window.term?.write(${JSON.stringify(data)}); true;`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const assets = await Asset.loadAsync([
          require("../../assets/xterm/xterm.min.xjs"),
          require("../../assets/xterm/addon-fit.min.xjs"),
          require("../../assets/xterm/xterm.xcss"),
        ]);
        /* eslint-enable @typescript-eslint/no-require-imports */
        const values = await Promise.all(assets.map((asset) => FileSystem.readAsStringAsync(asset.localUri ?? asset.uri)));
        if (!cancelled) setHtml(terminalHtml(values[0], values[1], values[2]));
      } catch (cause) { Alert.alert("Terminal unavailable", messageOf(cause)); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    return subscribe("subscribeTerminalEvents", {}, (value) => {
      const event = value as TerminalEvent;
      if (event.threadId !== activeThreadId || event.terminalId !== TERMINAL_ID) return;
      if (event.type === "output" && event.data) write(event.data);
      else if ((event.type === "started" || event.type === "restarted") && event.snapshot?.history) write(event.snapshot.history);
      else if (event.type === "cleared") webView.current?.injectJavaScript("window.term?.clear(); true;");
      else if (event.type === "error") write(`\r\n\x1b[31m${event.message ?? "Terminal error"}\x1b[0m\r\n`);
    });
  }, [activeThreadId, subscribe, write]);

  useEffect(() => {
    if (!ready || !activeThreadId || !cwd || opened) return;
    const timer = setTimeout(() => {
      void request("terminal.open", { threadId: activeThreadId, terminalId: TERMINAL_ID, cwd, worktreePath: thread?.worktreePath ?? null, cols: 80, rows: 24 })
        .then(async (value) => {
          const snapshot = value as { history?: string };
          if (snapshot.history) write(snapshot.history);
          setOpened(true);
          if (params.command && !commandSent.current) {
            commandSent.current = true;
            await request("terminal.write", {
              threadId: activeThreadId,
              terminalId: TERMINAL_ID,
              data: `${params.command}\r`,
            });
          }
        })
        .catch((cause) => Alert.alert("Couldn’t open terminal", messageOf(cause)));
    }, 0);
    return () => clearTimeout(timer);
  }, [activeThreadId, cwd, opened, params.command, ready, request, thread?.worktreePath, write]);
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (!activeThreadId) return;
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; data?: string; cols?: number; rows?: number };
      if (message.type === "ready") setReady(true);
      else if (message.type === "input" && message.data) void request("terminal.write", { threadId: activeThreadId, terminalId: TERMINAL_ID, data: message.data });
      else if (message.type === "resize" && message.cols && message.rows) void request("terminal.resize", { threadId: activeThreadId, terminalId: TERMINAL_ID, cols: message.cols, rows: message.rows });
    } catch {}
  }, [activeThreadId, request]);
  const send = (data: string) => { if (activeThreadId) void request("terminal.write", { threadId: activeThreadId, terminalId: TERMINAL_ID, data }); };

  if (!activeThreadId || !cwd) return <View className="flex-1 items-center justify-center bg-background px-8"><Text className="text-center text-muted-foreground">Open a thread to use its terminal.</Text></View>;
  return (
    <View className="flex-1 bg-black">
      {html ? <WebView ref={webView} source={{ html }} onMessage={onMessage} javaScriptEnabled bounces={false} overScrollMode="never" keyboardDisplayRequiresUserAction={false} hideKeyboardAccessoryView onShouldStartLoadWithRequest={(navigation) => navigation.url.startsWith("about:blank")} /> : <ActivityIndicator className="mt-20" color="white" />}
      <View className="flex-row items-center gap-1 border-t border-white/15 bg-black px-2 pb-safe pt-2">
        {[{ label: "ESC", value: "\x1b" }, { label: "TAB", value: "\t" }, { label: "CTRL-C", value: "\x03" }, { label: "↑", value: "\x1b[A" }, { label: "↓", value: "\x1b[B" }].map((key) => <Pressable key={key.label} onPress={() => send(key.value)} className="flex-1 rounded-lg bg-white/10 px-2 py-2 active:bg-white/20"><Text className="text-center text-xs font-semibold text-white">{key.label}</Text></Pressable>)}
        <Pressable onPress={() => Keyboard.dismiss()} className="rounded-lg bg-white/10 px-3 py-2"><Text className="text-white">⌨︎</Text></Pressable>
      </View>
    </View>
  );
}

function terminalHtml(xterm: string, fitAddon: string, css: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>${css}\nhtml,body,#terminal{width:100%;height:100%;margin:0;background:#000;overflow:hidden}</style><script>${xterm}</script><script>${fitAddon}</script></head><body><div id="terminal"></div><script>const term=new Terminal({cursorBlink:true,fontSize:13,fontFamily:'ui-monospace, Menlo, monospace',theme:{background:'#000000',foreground:'#f5f5f5',cursor:'#ffffff'}});const fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open(document.getElementById('terminal'));window.term=term;const resize=()=>{fit.fit();window.ReactNativeWebView.postMessage(JSON.stringify({type:'resize',cols:term.cols,rows:term.rows}))};term.onData(data=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'input',data})));new ResizeObserver(resize).observe(document.body);resize();window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));</script></body></html>`;
}
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Please try again."; }
