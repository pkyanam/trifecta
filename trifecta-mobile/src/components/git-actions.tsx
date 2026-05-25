import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGitService, GitStackedAction, type VcsStatusResult } from "@/services/git";

interface GitActionsProps {
  visible: boolean;
  onClose: () => void;
  cwd: string;
  status: VcsStatusResult | null;
}

export function GitActions({ visible, onClose, cwd, status }: GitActionsProps) {
  const git = useGitService();
  const [actionInProgress, setActionInProgress] = useState<GitStackedAction | null>(null);

  const handlePull = async () => {
    if (!status?.refName) return;
    setActionInProgress("pull");
    try {
      await git.pull(cwd);
    } catch (error) {
      console.error("Pull failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCommit = async () => {
    setActionInProgress("commit");
    
    const actionId = `commit-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit");
    } catch (error) {
      console.error("Commit failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePush = async () => {
    if (!status?.refName) return;
    setActionInProgress("push");
    const actionId = `push-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "push");
    } catch (error) {
      console.error("Push failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCommitPush = async () => {
    if (!status?.refName) return;
    setActionInProgress("commit_push");
    
    const actionId = `commit-push-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit_push");
    } catch (error) {
      console.error("Commit & push failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCommitPushPr = async () => {
    if (!status?.refName) return;
    setActionInProgress("commit_push_pr");
    
    const actionId = `commit-push-pr-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit_push_pr");
    } catch (error) {
      console.error("Commit, push & PR failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePushPr = async () => {
    if (!status?.refName) return;
    setActionInProgress("create_pr");
    const actionId = `push-pr-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "create_pr");
    } catch (error) {
      console.error("Push & create PR failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const hasChanges = status?.hasWorkingTreeChanges;
  const isAhead = status?.aheadCount && status.aheadCount > 0;
  const canPull = status?.behindCount && status.behindCount > 0;
  const canCommit = hasChanges;
  const canPush = isAhead && !hasChanges;
  const isDefaultRef = status?.isDefaultRef ?? false;
  const hasOpenPr = status?.pr?.state === "open";
  const hasDefaultBranchDelta = (status?.aheadOfDefaultCount ?? status?.aheadCount ?? 0) > 0;
  
  // Determine if we should show PR options instead of push
  const shouldShowPrOptions = !isDefaultRef && !hasOpenPr && hasDefaultBranchDelta && !hasChanges && isAhead;
  const shouldShowCommitPushPr = !isDefaultRef && !hasOpenPr && hasChanges;

  const GlassComponent = isLiquidGlassAvailable() ? GlassView : GlassContainer;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50 items-center justify-center"
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="w-full max-w-sm mx-4"
        >
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              isInteractive={!isLiquidGlassAvailable()}
              glassEffectStyle="regular"
              className="border-continuous rounded-2xl overflow-hidden"
              style={{
                ...(isLiquidGlassAvailable() ? {} : { borderRadius: 16 }),
              }}
            >
              {/* Header */}
              <View className="px-4 py-3 border-b border-border/50">
                <Text className="text-lg font-semibold text-foreground">Git Actions</Text>
                <Text className="text-sm text-muted-foreground">{status?.refName || "HEAD"}</Text>
              </View>

              {/* Actions */}
              <View className="p-2">
                {/* Pull */}
                <GitActionButton
                  icon="arrow.down"
                  label="Pull"
                  subtitle={canPull ? `Behind by ${status?.behindCount} commits` : "Up to date"}
                  disabled={!canPull || actionInProgress !== null}
                  onPress={handlePull}
                  loading={actionInProgress === "pull"}
                />

                {/* Commit */}
                <GitActionButton
                  icon="checkmark.circle"
                  label="Commit"
                  subtitle={hasChanges ? `${status?.workingTree.insertions} insertions, ${status?.workingTree.deletions} deletions` : "No changes"}
                  disabled={!canCommit || actionInProgress !== null}
                  onPress={handleCommit}
                  loading={actionInProgress === "commit"}
                />

                {/* Push or Push & Create PR */}
                {shouldShowPrOptions ? (
                  <GitActionButton
                    icon="arrow.triangle.2.circlepath"
                    label="Push & Create PR"
                    subtitle="Push commits and create pull request"
                    disabled={!canPush || actionInProgress !== null}
                    onPress={handlePushPr}
                    loading={actionInProgress === "create_pr"}
                  />
                ) : (
                  <GitActionButton
                    icon="arrow.up.circle"
                    label="Push"
                    subtitle={isAhead ? `Ahead by ${status?.aheadCount} commits` : "Nothing to push"}
                    disabled={!canPush || actionInProgress !== null}
                    onPress={handlePush}
                    loading={actionInProgress === "push"}
                  />
                )}

                {/* Commit & Push or Commit, Push & PR */}
                {shouldShowCommitPushPr ? (
                  <GitActionButton
                    icon="arrow.triangle.2.circlepath"
                    label="Commit, Push & PR"
                    subtitle="Commit changes, push, and create pull request"
                    disabled={!canCommit || actionInProgress !== null}
                    onPress={handleCommitPushPr}
                    loading={actionInProgress === "commit_push_pr"}
                  />
                ) : (
                  <GitActionButton
                    icon="arrow.up.arrow.down.circle"
                    label="Commit & Push"
                    subtitle="Commit changes and push to remote"
                    disabled={!canCommit || actionInProgress !== null}
                    onPress={handleCommitPush}
                    loading={actionInProgress === "commit_push"}
                  />
                )}
              </View>

              {/* Close button */}
              <View className="px-4 py-3 border-t border-border/50">
                <Pressable
                  onPress={onClose}
                  className="bg-muted/50 active:bg-muted rounded-lg px-4 py-2"
                >
                  <Text className="text-center text-sm font-medium text-foreground">Close</Text>
                </Pressable>
              </View>
            </GlassComponent>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface GitActionButtonProps {
  icon: string;
  label: string;
  subtitle: string;
  disabled: boolean;
  onPress: () => void;
  loading?: boolean;
}

function GitActionButton({ icon, label, subtitle, disabled, onPress, loading }: GitActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "flex-row items-center gap-3 px-3 py-2 rounded-lg",
        !disabled && "active:bg-muted/50",
        disabled && "opacity-50"
      )}
    >
      <View className="w-8 h-8 items-center justify-center">
        {loading ? (
          <ActivityIndicator size="small" className="text-foreground" />
        ) : (
          <SymbolImage name={icon} size={18} className="text-foreground" />
        )}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
    </Pressable>
  );
}