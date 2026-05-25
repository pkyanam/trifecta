/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SymbolImage } from "@/components/symbol-image";
import { useGitService, type VcsStatusResult, type GitStackedAction } from "@/services/git";
import { cn } from "@/utils/tailwind";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface GitActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  cwd: string;
}

export function GitActionsSheet({ visible, onClose, cwd }: GitActionsSheetProps) {
  const git = useGitService();
  const [status, setStatus] = useState<VcsStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [toast, setToast] = useState<{ title: string; detail?: string; success: boolean } | null>(null);
  const [filesExpanded, setFilesExpanded] = useState(false);

  useEffect(() => {
    if (!visible || !cwd) return;

    setLoading(true);
    setError(null);

    // Initial load
    const loadStatus = async () => {
      try {
        const result = await git.refreshStatus(cwd);
        setStatus(result);
      } catch (err) {
        setError("Failed to fetch git status");
        console.error("Git status error:", err);
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
  }, [visible, cwd, git]);

  // git.runStackedAction is a STREAMING RPC; calling it as a single-response
  // request hangs forever. Subscribe to the progress stream and resolve when
  // we see action_finished or action_failed.
  const runAction = (action: GitStackedAction): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const actionId = `${action}-${Date.now()}`;
      let unsubscribe: (() => void) | null = null;
      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };
      // Safety timeout in case the stream never sends a terminal event
      const timeout = setTimeout(() => {
        console.warn("[GitActionsSheet] Action timed out:", action);
        cleanup();
        resolve();
      }, 30000);
      unsubscribe = git.subscribeGitActionProgress(actionId, cwd, action, (event) => {
        console.log("[GitActionsSheet] Progress event:", event.kind, event.phase ?? "");
        if (event.kind === "action_finished") {
          clearTimeout(timeout);
          cleanup();
          resolve();
        } else if (event.kind === "action_failed") {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(event.message ?? `${action} failed`));
        }
      });
    });
  };

  const handlePull = async () => {
    setActionInProgress(true);
    try {
      await git.pull(cwd);
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Pull successful", true);
    } catch (err) {
      setError("Pull failed");
      showToast("Pull failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCommit = async () => {
    setActionInProgress(true);
    try {
      await runAction("commit");
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Commit successful", true);
    } catch (err) {
      setError("Commit failed");
      showToast("Commit failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const handlePush = async () => {
    setActionInProgress(true);
    try {
      await runAction("push");
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Push successful", true);
    } catch (err) {
      setError("Push failed");
      showToast("Push failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCommitPush = async () => {
    setActionInProgress(true);
    try {
      await runAction("commit_push");
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Commit & push successful", true);
    } catch (err) {
      setError("Commit & push failed");
      showToast("Commit & push failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCommitPushPr = async () => {
    setActionInProgress(true);
    try {
      await runAction("commit_push_pr");
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Commit, push & PR successful", true);
    } catch (err) {
      setError("Commit, push & PR failed");
      showToast("Commit, push & PR failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const handlePushPr = async () => {
    setActionInProgress(true);
    try {
      await runAction("create_pr");
      const newStatus = await git.refreshStatus(cwd);
      setStatus(newStatus);
      showToast("Push & create PR successful", true);
    } catch (err) {
      setError("Push & create PR failed");
      showToast("Push & create PR failed", false, err instanceof Error ? err.message : undefined);
    } finally {
      setActionInProgress(false);
    }
  };

  const showToast = (title: string, success: boolean, detail?: string) => {
    setToast({ title, detail, success });
    setTimeout(() => setToast(null), 3000);
  };

  const canPull = status?.isRepo && status?.hasUpstream && status?.behindCount > 0;
  const canPush = status?.isRepo && status?.hasUpstream && status?.aheadCount > 0;
  const canCommit = status?.hasWorkingTreeChanges;
  const isDefaultRef = status?.isDefaultRef ?? false;
  const hasOpenPr = status?.pr?.state === "open";
  const hasDefaultBranchDelta = (status?.aheadOfDefaultCount ?? status?.aheadCount ?? 0) > 0;
  
  // Determine if we should show PR options instead of push
  const shouldShowPrOptions = !isDefaultRef && !hasOpenPr && hasDefaultBranchDelta && !status?.hasWorkingTreeChanges && canPush;
  const shouldShowCommitPushPr = !isDefaultRef && !hasOpenPr && status?.hasWorkingTreeChanges;

  const summaryLine = () => {
    if (!status?.isRepo) return "Not a git repository";
    if (status?.hasWorkingTreeChanges) {
      const count = status.workingTree.files.length;
      const plural = count === 1 ? "file" : "files";
      return `${count} ${plural} changed`;
    }
    if (!status?.hasUpstream) return "Working tree clean • no upstream";
    if (status?.aheadCount === 0 && status?.behindCount === 0) return "Up to date";
    const parts = ["Working tree clean"];
    if (status?.aheadCount > 0) parts.push(`${status.aheadCount} ahead`);
    if (status?.behindCount > 0) parts.push(`${status.behindCount} behind`);
    return parts.join(" • ");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* Backdrop */}
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />

        {/* Bottom sheet card */}
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="w-full"
          style={{ maxHeight: "85%" }}
        >
          <View
            className="bg-background/95 backdrop-blur-xl border-t border-border/50 overflow-hidden"
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "100%",
            }}
          >
            {/* Header */}
            <View className="px-5 py-4 border-b border-border/50">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <SymbolImage name="arrow.triangle.branch" size={20} className="text-foreground" />
                  <Text className="text-xl font-bold text-foreground">Git Status</Text>
                </View>
                <Pressable
                  onPress={onClose}
                  className="w-8 h-8 items-center justify-center rounded-full active:bg-muted/50"
                >
                  <SymbolImage name="xmark" size={18} className="text-foreground" />
                </Pressable>
              </View>
            </View>

            {/* Scrollable Content */}
            <ScrollView style={{ maxHeight: 500 }}>
              <View className="p-5 space-y-4">
                {loading && !status ? (
                  <View className="items-center justify-center py-12">
                    <ActivityIndicator size="small" />
                    <Text className="text-sm text-muted-foreground mt-3">Loading git status…</Text>
                  </View>
                ) : error ? (
                  <View>
                    <Text className="text-sm text-destructive">{error}</Text>
                  </View>
                ) : status ? (
                  <>
                    {/* Status Block */}
                    <View className="p-4 bg-muted/30 rounded-xl border border-border/50">
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                          <SymbolImage name="arrow.triangle.branch" size={14} className="text-muted-foreground" />
                          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                            {status.refName || "No branch"}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          {status.aheadCount > 0 && (
                            <View className="flex-row items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-full">
                              <SymbolImage name="arrow.up" size={10} className="text-blue-500" />
                              <Text className="text-xs font-semibold text-blue-500">{status.aheadCount}</Text>
                            </View>
                          )}
                          {status.behindCount > 0 && (
                            <View className="flex-row items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-full">
                              <SymbolImage name="arrow.down" size={10} className="text-yellow-500" />
                              <Text className="text-xs font-semibold text-yellow-500">{status.behindCount}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <Text className="text-sm text-foreground mb-1">{summaryLine()}</Text>
                      <View className="flex-row items-center gap-2">
                        {status.hasWorkingTreeChanges && (
                          <View className="flex-row items-center gap-1">
                            <Text className="text-xs text-success">+{status.workingTree.insertions}</Text>
                            <Text className="text-xs text-destructive">-{status.workingTree.deletions}</Text>
                          </View>
                        )}
                        {!status.hasUpstream && (
                          <View className="flex-row items-center gap-1 bg-warning/20 px-2 py-0.5 rounded-full">
                            <SymbolImage name="exclamationmark.triangle.fill" size={10} className="text-warning" />
                            <Text className="text-xs font-semibold text-warning">NO UPSTREAM</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Changed Files - Collapsible */}
                    {status.hasWorkingTreeChanges && status.workingTree.files.length > 0 && (
                      <View className="rounded-xl border border-border/50 overflow-hidden bg-muted/20">
                        <Pressable
                          onPress={() => setFilesExpanded(!filesExpanded)}
                          className="flex-row items-center justify-between px-4 py-3 border-b border-border/30 active:bg-muted/30"
                        >
                          <View className="flex-row items-center gap-2">
                            <SymbolImage name="doc.text" size={14} className="text-muted-foreground" />
                            <Text className="text-sm font-semibold text-foreground">Changed Files</Text>
                            <View className="px-2 py-0.5 bg-accent/20 rounded-full">
                              <Text className="text-xs font-semibold text-accent">{status.workingTree.files.length}</Text>
                            </View>
                          </View>
                          <SymbolImage
                            name={filesExpanded ? "chevron.up" : "chevron.down"}
                            size={14}
                            className="text-muted-foreground"
                          />
                        </Pressable>
                        {filesExpanded && (
                          <View>
                            {status.workingTree.files.slice(0, 50).map((file, index) => (
                              <View
                                key={index}
                                className={cn(
                                  "flex-row items-center gap-2 px-4 py-2",
                                  index < Math.min(status.workingTree.files.length, 50) - 1 && "border-b border-border/20"
                                )}
                              >
                                <Text className="flex-1 text-sm text-foreground font-mono" numberOfLines={1}>
                                  {file.path}
                                </Text>
                                <View className="flex-row items-center gap-2">
                                  {file.insertions > 0 && (
                                    <Text className="text-xs text-success font-mono">+{file.insertions}</Text>
                                  )}
                                  {file.deletions > 0 && (
                                    <Text className="text-xs text-destructive font-mono">-{file.deletions}</Text>
                                  )}
                                </View>
                              </View>
                            ))}
                            {status.workingTree.files.length > 50 && (
                              <Text className="text-xs text-muted-foreground px-4 py-2 text-center">
                                +{status.workingTree.files.length - 50} more files…
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Actions */}
                    <View className="space-y-2">
                      {/* Pull */}
                      <Pressable
                        onPress={handlePull}
                        disabled={!canPull || actionInProgress}
                        className={cn(
                          "flex-row items-center gap-3 px-4 py-3 rounded-lg border border-border active:bg-muted/30",
                          (!canPull || actionInProgress) && "opacity-50"
                        )}
                      >
                        <SymbolImage name="arrow.down" size={16} className="text-foreground" />
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-foreground">Pull</Text>
                          <Text className="text-xs text-muted-foreground">
                            {canPull ? `Behind by ${status?.behindCount} commits` : "Up to date"}
                          </Text>
                        </View>
                      </Pressable>

                      {/* Commit */}
                      <Pressable
                        onPress={handleCommit}
                        disabled={!canCommit || actionInProgress}
                        className={cn(
                          "flex-row items-center gap-3 px-4 py-3 rounded-lg border border-border active:bg-muted/30",
                          (!canCommit || actionInProgress) && "opacity-50"
                        )}
                      >
                        <SymbolImage name="checkmark.circle" size={16} className="text-foreground" />
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-foreground">Commit</Text>
                          <Text className="text-xs text-muted-foreground">
                            {status?.hasWorkingTreeChanges 
                              ? `${status.workingTree.insertions} insertions, ${status.workingTree.deletions} deletions` 
                              : "No changes"}
                          </Text>
                        </View>
                      </Pressable>

                      {/* Push or Push & Create PR */}
                      {shouldShowPrOptions ? (
                        <Pressable
                          onPress={handlePushPr}
                          disabled={!canPush || actionInProgress}
                          className={cn(
                            "flex-row items-center gap-3 px-4 py-3 rounded-lg bg-blue-500 active:bg-blue-600",
                            (!canPush || actionInProgress) && "opacity-50"
                          )}
                        >
                          <SymbolImage name="arrow.triangle.2.circlepath" size={16} className="text-white" />
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-white">Push & Create PR</Text>
                            <Text className="text-xs text-white/80">Push commits and create pull request</Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={handlePush}
                          disabled={!canPush || actionInProgress}
                          className={cn(
                            "flex-row items-center gap-3 px-4 py-3 rounded-lg bg-blue-500 active:bg-blue-600",
                            (!canPush || actionInProgress) && "opacity-50"
                          )}
                        >
                          <SymbolImage name="arrow.up.circle" size={16} className="text-white" />
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-white">Push</Text>
                            <Text className="text-xs text-white/80">
                              {(status?.aheadCount ?? 0) > 0 ? `Ahead by ${status?.aheadCount} commits` : "Nothing to push"}
                            </Text>
                          </View>
                        </Pressable>
                      )}

                      {/* Commit & Push or Commit, Push & PR */}
                      {shouldShowCommitPushPr ? (
                        <Pressable
                          onPress={handleCommitPushPr}
                          disabled={!canCommit || actionInProgress}
                          className={cn(
                            "flex-row items-center gap-3 px-4 py-3 rounded-lg border border-border active:bg-muted/30",
                            (!canCommit || actionInProgress) && "opacity-50"
                          )}
                        >
                          <SymbolImage name="arrow.triangle.2.circlepath" size={16} className="text-foreground" />
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">Commit, Push & PR</Text>
                            <Text className="text-xs text-muted-foreground">Commit changes, push, and create pull request</Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={handleCommitPush}
                          disabled={!canCommit || actionInProgress}
                          className={cn(
                            "flex-row items-center gap-3 px-4 py-3 rounded-lg border border-border active:bg-muted/30",
                            (!canCommit || actionInProgress) && "opacity-50"
                          )}
                        >
                          <SymbolImage name="arrow.up.arrow.down.circle" size={16} className="text-foreground" />
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">Commit & Push</Text>
                            <Text className="text-xs text-muted-foreground">Commit changes and push to remote</Text>
                          </View>
                        </Pressable>
                      )}
                    </View>

                    {/* Toast */}
                    {toast && (
                      <View className={cn(
                        "p-3 rounded-xl border",
                        toast.success
                          ? "border-success/30 bg-success/10"
                          : "border-destructive/30 bg-destructive/10"
                      )}>
                        <View className="flex-row items-start gap-2">
                          <SymbolImage
                            name={toast.success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
                            size={14}
                            className={toast.success ? "text-success" : "text-destructive"}
                          />
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">{toast.title}</Text>
                            {toast.detail && <Text className="text-sm text-muted-foreground">{toast.detail}</Text>}
                          </View>
                        </View>
                      </View>
                    )}
                  </>
                ) : null}
              </View>
            </ScrollView>

            {/* Footer */}
            <View className="px-5 py-3 border-t border-border/50 bg-muted/20">
              <Text className="text-xs text-center text-muted-foreground">
                {cwd}
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}