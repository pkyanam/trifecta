import "@/global.css";

import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { useSsh } from "@/stores/ssh";
import { useConnection } from "@/stores/connection";
import { cn } from "@/utils/tailwind";
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, ScrollView, Text, TextInput, View, Animated } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { Plus, Server, Terminal, X, Lock, Key, Shield, RefreshCw } from "lucide-react-native";

export default function SshScreen() {
  const { isPaired } = useConnection();
  const { hosts, isLoadingHosts, listHosts, addHost, removeHost, updateHost, openSession } = useSsh();
  const [showAddHost, setShowAddHost] = useState(false);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const router = useRouter();

  // Load hosts on mount
  useEffect(() => {
    if (isPaired) {
      listHosts();
    }
  }, [isPaired, listHosts]);

  const handleAddHost = async (hostData: {
    label: string;
    hostname: string;
    port: string;
    username: string;
    authMethod: "agent-forward" | "keychain-key" | "password-prompt";
    expectedFingerprint?: string;
  }) => {
    try {
      await addHost({
        label: hostData.label,
        hostname: hostData.hostname,
        port: parseInt(hostData.port, 10),
        username: hostData.username,
        authMethod: hostData.authMethod,
        expectedFingerprint: hostData.expectedFingerprint || null,
      });
      setShowAddHost(false);
    } catch {
      Alert.alert("Error", "Failed to add SSH host");
    }
  };

  const handleRemoveHost = (hostId: string) => {
    Alert.alert(
      "Remove SSH Host",
      "This will remove the saved SSH host profile. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeHost({ hostId });
            } catch {
              Alert.alert("Error", "Failed to remove SSH host");
            }
          },
        },
      ],
    );
  };

  const handleClearHostKeys = (host: { id: string; hostname: string; port: number }) => {
    Alert.alert(
      "Clear Host Key Verification",
      `This will clear the expected fingerprint for ${host.hostname}:${host.port}. You'll need to verify the host key again on next connection.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Verification",
          style: "destructive",
          onPress: async () => {
            try {
              await updateHost({ hostId: host.id, expectedFingerprint: null });
              Alert.alert("Success", "Host key verification cleared successfully");
            } catch {
              Alert.alert("Error", "Failed to clear host key verification");
            }
          },
        },
      ],
    );
  };

  const handleConnect = async (hostId: string) => {
    setConnectingHostId(hostId);
    try {
      // Check if biometric authentication is available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(
          "Biometric Not Available",
          "Biometric authentication is not available on this device. For security, please enable Face ID, Touch ID, or use a device with biometric support.",
          [{ text: "OK" }]
        );
        setConnectingHostId(null);
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          "No Biometric Enrolled",
          "No biometric data is enrolled on this device. Please set up Face ID, Touch ID, or fingerprint authentication in system settings.",
          [{ text: "OK" }]
        );
        setConnectingHostId(null);
        return;
      }

      // Request biometric authentication
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to connect to SSH host",
        fallbackLabel: "Use passcode",
        cancelLabel: "Cancel",
      });

      if (result.success) {
        // Initial estimate — xterm will report actual cols/rows after fitAddon.fit()
        // and the PTY will be resized to match. Just needs to be in the right ballpark.
        const w = Dimensions.get("window");
        const fontSize = 14;
        const charWidth = fontSize * 0.6;
        const charHeight = fontSize * 1.2;
        const cols = Math.floor(w.width / charWidth);
        const rows = Math.floor((w.height - 150) / charHeight); // subtract header + safe area
        const sessionResult = await openSession({ hostId, cols, rows });
        router.push(`/ssh-terminal?sessionId=${sessionResult.snapshot.sessionId}`);
      } else {
        // User cancelled biometric auth, don't show error
        setConnectingHostId(null);
      }
    } catch (error) {
      setConnectingHostId(null);
      if (error instanceof Error && error.message.includes("User canceled")) {
        // User cancelled, don't show error
        return;
      }
      console.error("[SSH] Connection error:", error);
      Alert.alert("Connection Error", error instanceof Error ? error.message : "Failed to connect to SSH host");
    }
  };

  if (!isPaired) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-muted items-center justify-center mb-6">
            <Icon icon={Server} className="w-10 h-10 text-muted-foreground" />
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Not Connected</Text>
          <Text className="text-center text-muted-foreground mb-8">
            Connect to your Trifecta server to manage SSH hosts and terminals
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-foreground">SSH Terminal</Text>
            <Text className="text-sm text-muted-foreground">Manage SSH connections</Text>
          </View>
          <TouchableGlass
            onPress={() => setShowAddHost(true)}
            className="rounded-full p-3 active:opacity-60"
          >
            <Icon icon={Plus} className="w-6 h-6 text-foreground" />
          </TouchableGlass>
        </View>
      </View>

      {/* SSH Hosts List */}
      <ScrollView className="flex-1 px-4 py-4">
        {isLoadingHosts ? (
          <View className="items-center justify-center py-12">
            <Text className="text-muted-foreground">Loading SSH hosts...</Text>
          </View>
        ) : hosts.length === 0 ? (
          <View className="items-center justify-center py-12">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
              <Icon icon={Terminal} className="w-8 h-8 text-muted-foreground" />
            </View>
            <Text className="text-lg font-semibold text-foreground mb-2">No SSH Hosts</Text>
            <Text className="text-center text-muted-foreground mb-6">
              Add your first SSH host to get started with terminal access
            </Text>
            <TouchableGlass
              onPress={() => setShowAddHost(true)}
              className="rounded-full px-6 py-3 active:opacity-60"
            >
              <Text className="text-foreground font-medium">Add SSH Host</Text>
            </TouchableGlass>
          </View>
        ) : (
          <View className="gap-3 pb-4">
            {hosts.map((host) => (
              <View key={host.id} className="rounded-2xl p-4 bg-muted">
                <View className="flex-row items-start justify-between w-full">
                  <TouchableGlass
                    onPress={() => handleConnect(host.id)}
                    disabled={connectingHostId === host.id}
                    className="flex-1 mr-3 min-w-0"
                  >
                    <View className="flex-1 mr-3 min-w-0">
                      <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
                        <Text className="text-lg font-semibold text-foreground flex-shrink min-w-0" numberOfLines={2}>
                          {host.label}
                        </Text>
                        <View className="px-2 py-0.5 rounded-full bg-background flex-shrink">
                          <Text className="text-[10px] font-medium text-foreground">
                            {host.authMethod}
                          </Text>
                        </View>
                        {connectingHostId === host.id && (
                          <ActivityIndicator size="small" color="#fff" />
                        )}
                      </View>
                      <Text className="text-sm text-muted-foreground mb-1" numberOfLines={1} ellipsizeMode="tail">
                        {host.username}@{host.hostname}:{host.port}
                      </Text>
                      {host.expectedFingerprint && (
                        <View className="flex-row items-center gap-1">
                          <Icon icon={Shield} className="w-3 h-3 text-sf-green" />
                          <Text className="text-[11px] text-muted-foreground">Host key verified</Text>
                        </View>
                      )}
                    </View>
                  </TouchableGlass>
                  <View className="flex-shrink ml-1 flex-row items-center">
                    <Pressable
                      onPress={() => handleClearHostKeys({ id: host.id, hostname: host.hostname, port: host.port })}
                      disabled={connectingHostId === host.id}
                      className="p-2 active:opacity-60"
                    >
                      <Icon icon={RefreshCw} className="w-4 h-4 text-muted-foreground" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoveHost(host.id)}
                      disabled={connectingHostId === host.id}
                      className="p-2 active:opacity-60"
                    >
                      <Icon icon={X} className="w-4 h-4 text-muted-foreground" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Host Modal */}
      <Modal
        visible={showAddHost}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddHost(false)}
      >
        <AddHostModal
          onClose={() => setShowAddHost(false)}
          onAddHost={handleAddHost}
        />
      </Modal>
    </View>
  );
}

function AddHostModal({
  onClose,
  onAddHost,
}: {
  onClose: () => void;
  onAddHost: (hostData: {
    label: string;
    hostname: string;
    port: string;
    username: string;
    authMethod: "agent-forward" | "keychain-key" | "password-prompt";
    expectedFingerprint?: string;
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<"agent-forward" | "keychain-key" | "password-prompt">("agent-forward");
  const [expectedFingerprint, setExpectedFingerprint] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!label.trim() || !hostname.trim() || !username.trim()) {
      Alert.alert("Validation Error", "Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      await onAddHost({
        label: label.trim(),
        hostname: hostname.trim(),
        port: port.trim() || "22",
        username: username.trim(),
        authMethod,
        expectedFingerprint: expectedFingerprint.trim() || null,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authMethods = [
    { value: "agent-forward" as const, label: "Agent Forward", icon: Lock, description: "Use SSH agent forwarding" },
    { value: "keychain-key" as const, label: "Keychain Key", icon: Key, description: "Use stored SSH keys from keychain" },
    { value: "password-prompt" as const, label: "Password", icon: Lock, description: "Prompt for password each time" },
  ];

  return (
    <View className="flex-1 justify-end">
      {/* Backdrop */}
      <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />

      {/* Bottom sheet card */}
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        className="w-full bg-background/95 backdrop-blur-xl border-t border-border/50"
        style={{
          maxHeight: "90%",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-3 border-b border-border">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">Add SSH Host</Text>
            <Pressable onPress={onClose} className="p-2 active:opacity-60">
              <Icon icon={X} className="w-6 h-6 text-foreground" />
            </Pressable>
          </View>
        </View>

        <ScrollView className="px-4 py-4" keyboardShouldPersistTaps="handled">
          {/* Label */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Label</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="My Server"
              className="bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground"
              placeholderTextColor="#888"
            />
          </View>

          {/* Hostname */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Hostname</Text>
            <TextInput
              value={hostname}
              onChangeText={setHostname}
              placeholder="192.168.1.100 or example.com"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              className="bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground"
              placeholderTextColor="#888"
            />
          </View>

          {/* Port */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Port</Text>
            <TextInput
              value={port}
              onChangeText={setPort}
              placeholder="22"
              keyboardType="number-pad"
              className="bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground"
              placeholderTextColor="#888"
            />
          </View>

          {/* Username */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="ubuntu"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              className="bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground"
              placeholderTextColor="#888"
            />
          </View>

          {/* Expected Fingerprint */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Expected Fingerprint (Optional)</Text>
            <TextInput
              value={expectedFingerprint}
              onChangeText={setExpectedFingerprint}
              placeholder="SHA256:abc123..."
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              className="bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground font-mono text-xs"
              placeholderTextColor="#888"
            />
            <Text className="text-xs text-muted-foreground mt-1">
              Pre-verify host key to skip verification prompt. Get this from your server: ssh-keyscan -H hostname | ssh-keygen -lf -
            </Text>
          </View>

          {/* Auth Method */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-foreground mb-2">Authentication Method</Text>
            <View className="gap-2">
              {authMethods.map((method) => (
                <TouchableGlass
                  key={method.value}
                  onPress={() => setAuthMethod(method.value)}
                  className={cn(
                    "rounded-xl p-4 flex-row items-center gap-3",
                    authMethod === method.value ? "bg-accent" : "bg-muted"
                  )}
                >
                  <View className="w-10 h-10 rounded-full bg-background items-center justify-center">
                    <Icon icon={method.icon} className="w-5 h-5 text-foreground" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-medium text-foreground">{method.label}</Text>
                    <Text className="text-sm text-muted-foreground">{method.description}</Text>
                  </View>
                  {authMethod === method.value && (
                    <View className="w-5 h-5 rounded-full bg-foreground items-center justify-center">
                      <Icon icon={Shield} className="w-3 h-3 text-background" />
                    </View>
                  )}
                </TouchableGlass>
              ))}
            </View>
          </View>

          {/* Biometric Note */}
          {authMethod === "keychain-key" && (
            <View className="mb-6 p-4 rounded-xl bg-muted/50 border border-border">
              <View className="flex-row items-start gap-3">
                <Icon icon={Shield} className="w-5 h-5 text-sf-blue mt-0.5" />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground mb-1">Biometric Authentication</Text>
                  <Text className="text-xs text-muted-foreground">
                    Your SSH keys will be decrypted using Face ID / Touch ID when connecting
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Footer */}
          <View className="px-4 py-4 border-t border-border mb-4">
            <TouchableGlass
              onPress={handleSubmit}
              disabled={isLoading}
              className={cn(
                "rounded-full py-4 items-center",
                isLoading && "opacity-50"
              )}
            >
              <Text className="text-foreground font-semibold">
                {isLoading ? "Adding..." : "Add SSH Host"}
              </Text>
            </TouchableGlass>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
