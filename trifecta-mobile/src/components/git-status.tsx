import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { Pressable, Text, View, Modal, ScrollView, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import Animated, { Layout } from "react-native-reanimated";
import { useGitService, type VcsStatusResult, type VcsRef } from "@/services/git";
import { GitActionsAdvanced } from "./git-actions-advanced";

interface GitStatusProps {
  cwd: string;
  onPress?: () => void;
}

export function GitStatus({ cwd, onPress }: GitStatusProps) {
  const git = useGitService();
  const [status, setStatus] = useState<VcsStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [branches, setBranches] = useState<VcsRef[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const loadBranches = async () => {
    setLoadingBranches(true);
    try {
      const result = await git.listRefs(cwd);
      // Filter to show only local branches, not remote tracking branches
      const localBranches = result.refs.filter(ref => !ref.isRemote);
      setBranches(localBranches);
    } catch (error) {
      console.error("Failed to load branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSwitchBranch = async (refName: string) => {
    try {
      await git.switchRef(cwd, refName);
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      setShowBranchSelector(false);
    } catch (error) {
      console.error("Branch switch failed:", error);
    }
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await git.refreshStatus(cwd);
        setStatus(result);
      } catch (error) {
        console.error("Failed to load git status:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();

    // Subscribe to status updates
    const unsubscribe = git.subscribeVcsStatus(cwd, (event) => {
      if (event._tag === "snapshot" || event._tag === "localUpdated") {
        setStatus((prev) => ({
          ...prev,
          ...event.local,
          ...(event._tag === "snapshot" && event.remote ? event.remote : {}),
        }) as VcsStatusResult);
      } else if (event._tag === "remoteUpdated") {
        setStatus((prev) => ({
          ...prev,
          ...event.remote,
        }) as VcsStatusResult);
      }
    });

    return () => unsubscribe();
  }, [cwd, git]);

  // Always show something for debugging
  return (
    <>
      <Animated.View layout={Layout.springify()}>
        <Pressable
          onPress={() => setShowActions(true)}
          className={cn(
            "flex-row items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg",
            onPress && "active:bg-muted/50"
          )}
        >
          {/* Status indicator */}
          <Animated.View
            layout={Layout.springify()}
            className={cn(
              "w-2 h-2 rounded-full",
              loading && "bg-gray-400",
              !loading && status?.hasWorkingTreeChanges && "bg-orange-500",
              !loading && !status?.hasWorkingTreeChanges && (status?.aheadCount ?? 0) > 0 && "bg-blue-500",
              !loading && !status?.hasWorkingTreeChanges && (status?.behindCount ?? 0) > 0 && "bg-yellow-500",
              !loading && !status?.hasWorkingTreeChanges && (status?.aheadCount ?? 0) === 0 && (status?.behindCount ?? 0) === 0 && "bg-green-500",
              !loading && !status && "bg-gray-400"
            )}
          />

          {/* Branch name or loading state */}
          <Pressable
            onPress={() => {
              loadBranches();
              setShowBranchSelector(true);
            }}
            disabled={loading}
            className="flex-1"
          >
            <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
              {loading ? "Loading..." : status?.refName || "No git"}
            </Text>
          </Pressable>

          {/* Changes count */}
          {status?.hasWorkingTreeChanges && (
            <Animated.View layout={Layout.springify()} className="flex-row items-center gap-1">
              <Text className="text-xs text-muted-foreground">
                +{status.workingTree.insertions}
              </Text>
              <Text className="text-xs text-muted-foreground">
                -{status.workingTree.deletions}
              </Text>
            </Animated.View>
          )}

          {/* Sync status */}
          {((status?.aheadCount ?? 0) > 0 || (status?.behindCount ?? 0) > 0) && (
            <Animated.View layout={Layout.springify()} className="flex-row items-center gap-1">
              {(status?.aheadCount ?? 0) > 0 && (
                <SymbolImage name="arrow.up" size={10} className="text-blue-500" />
              )}
              {(status?.behindCount ?? 0) > 0 && (
                <SymbolImage name="arrow.down" size={10} className="text-yellow-500" />
              )}
            </Animated.View>
          )}

          {/* PR indicator */}
          {status?.pr?.state === "open" && (
            <Animated.View layout={Layout.springify()}>
              <SymbolImage name="arrow.triangle.2.circlepath" size={12} className="text-purple-500" />
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>

      <GitActionsAdvanced
        visible={showActions}
        onClose={() => setShowActions(false)}
        cwd={cwd}
      />

      {/* Branch Selector Modal */}
      <Modal
        visible={showBranchSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchSelector(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center"
          onPress={() => setShowBranchSelector(false)}
        >
          <View className="bg-background rounded-2xl w-11/12 max-h-96 overflow-hidden">
            <View className="px-4 py-3 border-b border-border">
              <Text className="text-lg font-semibold text-foreground">Switch Branch</Text>
            </View>
            <ScrollView className="flex-1">
              {loadingBranches ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator size="small" className="text-foreground" />
                </View>
              ) : (
                branches.map((branch) => (
                  <Pressable
                    key={branch.name}
                    onPress={() => handleSwitchBranch(branch.name)}
                    disabled={branch.current}
                    className={cn(
                      "flex-row items-center gap-3 px-4 py-3 border-b border-border/50",
                      !branch.current && "active:bg-muted/30",
                      branch.current && "opacity-50"
                    )}
                  >
                    <View className="w-8 h-8 items-center justify-center bg-muted/50 rounded-full">
                      <SymbolImage name="branch" size={16} className="text-foreground" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">{branch.name}</Text>
                    </View>
                    {branch.current && (
                      <View className="px-2 py-1 bg-green-500/10 rounded">
                        <Text className="text-xs text-green-500">Current</Text>
                      </View>
                    )}
                    {branch.isDefault && (
                      <View className="px-2 py-1 bg-blue-500/10 rounded">
                        <Text className="text-xs text-blue-500">Default</Text>
                      </View>
                    )}
                  </Pressable>
                ))
              )}
              {branches.length === 0 && !loadingBranches && (
                <View className="items-center justify-center py-8">
                  <SymbolImage name="branch" size={32} className="text-muted-foreground mb-2" />
                  <Text className="text-sm text-muted-foreground">No local branches found</Text>
                </View>
              )}
            </ScrollView>
            <View className="px-4 py-3 border-t border-border/50">
              <Pressable
                onPress={() => setShowBranchSelector(false)}
                className="bg-muted/50 active:bg-muted rounded-lg px-4 py-2"
              >
                <Text className="text-center text-sm font-medium text-foreground">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}