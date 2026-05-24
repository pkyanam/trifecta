import { Icon } from "@/components/icon";
import { exchangeToken, fetchEnvironment, parsePairingURL } from "@/services/pairing";
import { useConnection } from "@/stores/connection";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Check, Copy, Link2, Terminal, Wifi, Zap } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

const NPX_COMMAND = "npx @belweave/trifecta";

const TIPS = [
  "Open the desktop app → Settings → Connections → copy the pairing URL",
  "HTTPS and Cloudflare Tunnel URLs work — the app upgrades to WSS automatically",
  "Use Tailscale or stay on the same LAN when not using a public tunnel",
  "Pairing tokens are one-time. After exchange, this app keeps a persistent session in your keychain",
];

export default function PairScreen() {
  const { pair } = useConnection();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [serverURL, setServerURL] = useState("");
  const [token, setToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const appForeground = useCSSVariable("--app-foreground") as string;
  const appMutedFg = useCSSVariable("--app-muted-foreground") as string;

  const tokenRef = useRef<TextInput>(null);

  const canConnect = (() => {
    if (!serverURL.trim() || !token.trim()) return false;
    try {
      new URL(serverURL.trim());
      return true;
    } catch {
      return false;
    }
  })();

  const handlePasteLink = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) return;
      const parsed = parsePairingURL(text.trim());
      if (parsed) {
        setServerURL(parsed.serverURL);
        setToken(parsed.token);
        setError(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (text.startsWith("http")) {
        setServerURL(text.trim());
      } else {
        setToken(text.trim());
      }
    } catch {}
  }, []);

  const handleCopyCommand = useCallback(async () => {
    await Clipboard.setStringAsync(NPX_COMMAND);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const handleConnect = useCallback(async () => {
    if (!canConnect || isConnecting) return;
    const url = serverURL.trim().replace(/\/+$/, "");
    const tok = token.trim();

    setIsConnecting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await fetchEnvironment(url);
      const result = await exchangeToken(url, tok);
      await pair(url, result.bearerToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConnecting(false);
    }
  }, [canConnect, isConnecting, serverURL, token, pair, router]);

  const monoFont = Platform.OS === "ios" ? "Menlo" : "monospace";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────── */}
        <View className="flex-row items-center mb-8">
          <Text
            className="text-[22px] font-bold text-foreground tracking-tight"
            style={{ fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined }}
          >
            Trifecta
          </Text>
          <View className="flex-1" />
          <View className="flex-row items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
            <Icon icon={Wifi} className="w-3 h-3 text-foreground" />
            <Text className="text-[12px] font-semibold text-foreground">Pair</Text>
          </View>
        </View>

        {/* ── Hero ──────────────────────────────────────── */}
        <View className="mb-7">
          <Text className="text-[32px] font-bold text-foreground leading-tight mb-3">
            Connect to your{"\n"}Trifecta server
          </Text>
          <Text className="text-[15px] text-muted-foreground leading-relaxed">
            Pair this app with your desktop to access your AI models, projects, and conversations.
          </Text>
        </View>

        {/* ── NPX Command ───────────────────────────────── */}
        <View className="mb-7">
          <View className="flex-row items-center gap-2 mb-2.5">
            <Icon icon={Zap} className="w-3.5 h-3.5 text-foreground" />
            <Text className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
              Quick setup — run on your computer
            </Text>
          </View>
          <Pressable
            onPress={handleCopyCommand}
            className="bg-muted rounded-2xl px-4 py-4 flex-row items-center gap-3 active:opacity-70"
          >
            <Icon icon={Terminal} className="w-4 h-4 text-muted-foreground" />
            <Text
              className="flex-1 text-[15px] text-foreground"
              style={{ fontFamily: monoFont }}
            >
              {NPX_COMMAND}
            </Text>
            <Icon
              icon={copied ? Check : Copy}
              className={`w-4 h-4 ${copied ? "text-sf-green" : "text-muted-foreground"}`}
            />
          </Pressable>
          <Text className="text-[12px] text-muted-foreground mt-2 px-1">
            Starts the server and prints your pairing URL
          </Text>
        </View>

        {/* ── Divider ───────────────────────────────────── */}
        <View className="flex-row items-center gap-3 mb-6">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-[12px] text-muted-foreground font-medium">
            or enter details manually
          </Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        {/* ── Form ──────────────────────────────────────── */}
        <View className="mb-4">
          <View className="bg-muted rounded-2xl overflow-hidden">
            {/* Server URL */}
            <View className="px-4 pt-4 pb-3">
              <Text className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Server URL
              </Text>
              <TextInput
                value={serverURL}
                onChangeText={(v) => {
                  setServerURL(v);
                  setError(null);
                }}
                placeholder="http://localhost:8080"
                placeholderTextColor={appMutedFg}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"
                onSubmitEditing={() => tokenRef.current?.focus()}
                style={{
                  fontSize: 15,
                  color: appForeground,
                  height: 36,
                  padding: 0,
                }}
              />
            </View>

            <View className="h-px bg-border mx-4" />

            {/* Pairing Token */}
            <View className="px-4 pt-3 pb-4">
              <View className="flex-row items-center mb-2">
                <Text className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Pairing token
                </Text>
                <Pressable onPress={handlePasteLink} className="active:opacity-60">
                  <View className="flex-row items-center gap-1">
                    <Icon icon={Link2} className="w-3 h-3 text-sf-blue" />
                    <Text className="text-[12px] text-sf-blue font-semibold">Paste link</Text>
                  </View>
                </Pressable>
              </View>
              <TextInput
                ref={tokenRef}
                value={token}
                onChangeText={(v) => {
                  setToken(v);
                  setError(null);
                }}
                placeholder="XXXXXXXXXXXX"
                placeholderTextColor={appMutedFg}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleConnect}
                style={{
                  fontSize: 15,
                  color: appForeground,
                  height: 36,
                  padding: 0,
                  fontFamily: monoFont,
                  letterSpacing: 2,
                }}
              />
            </View>
          </View>
        </View>

        {/* ── Error ─────────────────────────────────────── */}
        {error ? (
          <View className="bg-sf-red/10 rounded-xl px-4 py-3 mb-4">
            <Text
              className="text-[13px] leading-relaxed"
              style={{ color: "#ef4444" }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* ── Connect Button ────────────────────────────── */}
        <Pressable
          onPress={handleConnect}
          disabled={!canConnect || isConnecting}
          className={`rounded-2xl px-4 py-4 items-center mb-8 ${
            canConnect && !isConnecting ? "bg-foreground active:opacity-70" : "bg-muted"
          }`}
        >
          <Text
            className={`text-[16px] font-semibold ${
              canConnect && !isConnecting ? "text-background" : "text-muted-foreground"
            }`}
          >
            {isConnecting ? "Connecting…" : "Connect"}
          </Text>
        </Pressable>

        {/* ── Tips ──────────────────────────────────────── */}
        <View>
          <Text className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
            Tips
          </Text>
          <View className="bg-muted rounded-2xl px-4 py-3 gap-3">
            {TIPS.map((tip, i) => (
              <View key={i} className="flex-row gap-2.5">
                <View
                  className="bg-muted-foreground rounded-full"
                  style={{ width: 4, height: 4, marginTop: 7 }}
                />
                <Text className="flex-1 text-[13px] text-muted-foreground leading-relaxed">
                  {tip}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
