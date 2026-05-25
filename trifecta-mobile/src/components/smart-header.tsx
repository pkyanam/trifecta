import { SymbolImage } from "@/components/symbol-image";
import { GitActionsSheet } from "@/components/git-actions-sheet";
import { cn } from "@/utils/tailwind";
import { useEffect, useState } from "react";
import {
  Pressable,
  Text,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useWsClient } from "@/stores/ws-client";
import { useModel } from "@/components/model-context";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useRouter } from "expo-router";

interface SmartHeaderProps {
  onMenuPress?: () => void;
}

export function SmartHeader({ onMenuPress }: SmartHeaderProps) {
  const { serverConfig, request } = useWsClient();
  const [showGitActions, setShowGitActions] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const { selectedModelLabel } = useModel();
  const { activeThreadId } = useActiveThread();
  const { getThread, getProject } = useThreadList();
  const router = useRouter();

  // Get the actual thread data using the thread ID
  const activeThread = activeThreadId ? getThread(activeThreadId) : null;
  const project = activeThread?.projectId ? getProject(activeThread.projectId) : null;

  // Get the correct CWD: thread worktreePath > project workspaceRoot > server cwd
  const cwd = activeThread?.worktreePath || project?.workspaceRoot || serverConfig?.cwd || "";

  // Fetch git status whenever cwd changes (mirrors iOS header behavior)
  useEffect(() => {
    if (!cwd) {
      setBranchName("");
      setHasChanges(false);
      return;
    }
    const fetchGitStatus = async () => {
      try {
        const status = await request("vcs.refreshStatus", { cwd }) as any;
        if (status?.refName) {
          setBranchName(status.refName);
          setHasChanges(status?.hasWorkingTreeChanges || false);
        } else {
          setBranchName("");
        }
      } catch {
        setBranchName("");
      }
    };
    fetchGitStatus();
  }, [cwd, request]);

  const showGitButton = Boolean(cwd && branchName);

  return (
    <SafeAreaView className="bg-background" edges={["top"]}>
      <StatusBar barStyle="auto" />
      <Animated.View entering={FadeIn.duration(300)}>
        <View className="flex-row items-center px-2 py-1 min-h-[52px]">
          {/* Left – Menu button */}
          <Pressable
            onPress={onMenuPress}
            className="w-10 h-10 items-center justify-center rounded-full active:bg-muted/50"
          >
            <SymbolImage name="line.3.horizontal" size={20} className="text-foreground" />
          </Pressable>

          {/* Center – Model name + subtitle */}
          <Pressable
            onPress={() => router.navigate("/model-picker")}
            className="flex-1 mx-2 items-center active:opacity-70"
          >
            <Text
              className="text-base font-semibold text-foreground text-center"
              numberOfLines={2}
            >
              {selectedModelLabel}
            </Text>
            <View className="flex-row items-center gap-1">
              <SymbolImage name="chevron.down" size={10} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">Change model</Text>
            </View>
          </Pressable>

          {/* Right – Simple "Git" button (mirrors iOS toolbar button) */}
          {showGitButton ? (
            <Pressable
              onPress={() => setShowGitActions(true)}
              className="flex-row items-center gap-1.5 px-2 py-1 rounded-md active:bg-muted/50"
            >
              <View
                className={cn(
                  "w-2 h-2 rounded-full",
                  hasChanges ? "bg-orange-500" : "bg-foreground/40"
                )}
              />
              <Text className="text-sm font-medium text-foreground">Git</Text>
            </Pressable>
          ) : (
            // Spacer to keep center title actually centered
            <View className="w-10" />
          )}
        </View>
      </Animated.View>

      <GitActionsSheet
        visible={showGitActions}
        onClose={() => setShowGitActions(false)}
        cwd={cwd}
      />
    </SafeAreaView>
  );
}
