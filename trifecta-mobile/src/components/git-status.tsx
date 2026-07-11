import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { Pressable, Text } from "react-native";
import { useEffect, useState } from "react";
import Animated, { Layout } from "react-native-reanimated";
import { useGitService, type VcsStatusResult } from "@/services/git";

interface GitStatusProps {
  cwd: string;
  onPress?: () => void;
}

export function GitStatus({ cwd, onPress }: GitStatusProps) {
  const git = useGitService();
  const [status, setStatus] = useState<VcsStatusResult | null>(null);
  const [loading, setLoading] = useState(true);

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
          onPress={onPress}
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
          <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
            {loading ? "Loading..." : status?.refName || "No git"}
          </Text>

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
    </>
  );
}
