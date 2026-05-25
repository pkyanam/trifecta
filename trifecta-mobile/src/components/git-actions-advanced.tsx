import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { useState, useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGitService, GitStackedAction, type VcsStatusResult, type VcsRef } from "@/services/git";
import { WorktreeManager } from "./worktree-manager";

interface GitActionsProps {
  visible: boolean;
  onClose: () => void;
  cwd: string;
  status: VcsStatusResult | null;
}

export function GitActionsAdvanced({ visible, onClose, cwd, status }: GitActionsProps) {
  const git = useGitService();
  const [actionInProgress, setActionInProgress] = useState<GitStackedAction | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showPRDialog, setShowPRDialog] = useState(false);
  const [showWorktreeManager, setShowWorktreeManager] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "branches" | "pr" | "worktrees">("basic");
  const [branches, setBranches] = useState<VcsRef[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Load branches when switching to branches tab
  useEffect(() => {
    if (visible && activeTab === "branches") {
      loadBranches();
    }
  }, [visible, activeTab]);

  const loadBranches = async () => {
    setLoadingBranches(true);
    try {
      const result = await git.listRefs(cwd);
      setBranches(result.refs);
    } catch (error) {
      console.error("Failed to load branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

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
    if (!commitMessage.trim()) return;
    setActionInProgress("commit");
    setShowCommitDialog(false);
    
    const actionId = `commit-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit", {
        commitMessage: commitMessage.trim(),
      });
      setCommitMessage("");
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
    if (!commitMessage.trim() || !status?.refName) return;
    setActionInProgress("commit_push");
    setShowCommitDialog(false);
    
    const actionId = `commit-push-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit_push", {
        commitMessage: commitMessage.trim(),
      });
      setCommitMessage("");
    } catch (error) {
      console.error("Commit & push failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim()) return;
    setActionInProgress("commit"); // Reuse commit action for branch creation
    setShowBranchDialog(false);
    
    try {
      await git.createRef(cwd, branchName.trim(), true);
      setBranchName("");
      loadBranches(); // Reload branches
    } catch (error) {
      console.error("Branch creation failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSwitchBranch = async (refName: string) => {
    setActionInProgress("commit"); // Reuse for loading state
    try {
      await git.switchRef(cwd, refName);
      loadBranches(); // Reload branches
    } catch (error) {
      console.error("Branch switch failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreatePR = async () => {
    if (!prTitle.trim() || !status?.refName) return;
    setActionInProgress("create_pr");
    setShowPRDialog(false);
    
    const actionId = `pr-${Date.now()}`;
    try {
      await git.runStackedAction(actionId, cwd, "commit_push_pr", {
        commitMessage: prTitle.trim(),
        featureBranch: true,
      });
      setPrTitle("");
    } catch (error) {
      console.error("PR creation failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const hasChanges = status?.hasWorkingTreeChanges;
  const isAhead = status?.aheadCount && status.aheadCount > 0;
  const canPull = status?.behindCount && status.behindCount > 0;
  const canCommit = hasChanges;
  const canPush = isAhead && !hasChanges;
  const canCreatePR = isAhead && !hasChanges && status?.hasUpstream;

  const GlassComponent = View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50 items-center justify-center"
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="w-full max-w-sm mx-4 max-h-[85vh]"
        >
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden"
              style={{ borderRadius: 16 }}
            >
              {/* Header with Tabs */}
              <View className="px-4 py-3 border-b border-border/50">
                <Text className="text-lg font-semibold text-foreground mb-3">Git Actions</Text>
                <View className="flex-row gap-1 bg-muted/50 p-1 rounded-lg">
                  <TabButton
                    label="Basic"
                    active={activeTab === "basic"}
                    onPress={() => setActiveTab("basic")}
                  />
                  <TabButton
                    label="Branches"
                    active={activeTab === "branches"}
                    onPress={() => setActiveTab("branches")}
                  />
                  <TabButton
                    label="PR"
                    active={activeTab === "pr"}
                    onPress={() => setActiveTab("pr")}
                  />
                  <TabButton
                    label="Worktrees"
                    active={activeTab === "worktrees"}
                    onPress={() => setActiveTab("worktrees")}
                  />
                </View>
              </View>

              {/* Content based on active tab */}
              <ScrollView className="max-h-96">
                {activeTab === "basic" && (
                  <View className="p-2">
                    <GitSectionHeader title="Sync" />
                    <GitActionButton
                      icon="arrow.down"
                      label="Pull"
                      subtitle={canPull ? `Behind by ${status?.behindCount} commits` : "Up to date"}
                      disabled={!canPull || actionInProgress !== null}
                      onPress={handlePull}
                      loading={actionInProgress === "pull"}
                    />
                    <GitActionButton
                      icon="arrow.up.circle"
                      label="Push"
                      subtitle={isAhead ? `Ahead by ${status?.aheadCount} commits` : "Nothing to push"}
                      disabled={!canPush || actionInProgress !== null}
                      onPress={handlePush}
                      loading={actionInProgress === "push"}
                    />

                    <GitSectionHeader title="Changes" />
                    <GitActionButton
                      icon="checkmark.circle"
                      label="Commit"
                      subtitle={hasChanges ? `${status?.workingTree.insertions} insertions, ${status?.workingTree.deletions} deletions` : "No changes"}
                      disabled={!canCommit || actionInProgress !== null}
                      onPress={() => setShowCommitDialog(true)}
                      loading={actionInProgress === "commit"}
                    />
                    <GitActionButton
                      icon="arrow.up.arrow.down.circle"
                      label="Commit & Push"
                      subtitle="Commit changes and push to remote"
                      disabled={!canCommit || actionInProgress !== null}
                      onPress={() => setShowCommitDialog(true)}
                      loading={actionInProgress === "commit_push"}
                    />
                  </View>
                )}

                {activeTab === "branches" && (
                  <View className="p-2">
                    <GitSectionHeader 
                      title="Branches" 
                      action={{
                        label: "New Branch",
                        onPress: () => setShowBranchDialog(true),
                      }}
                    />
                    {loadingBranches ? (
                      <View className="items-center justify-center py-8">
                        <ActivityIndicator size="small" className="text-foreground" />
                      </View>
                    ) : (
                      branches.map((branch) => (
                        <BranchItem
                          key={branch.name}
                          branch={branch}
                          currentBranch={status?.refName}
                          onSwitch={() => handleSwitchBranch(branch.name)}
                          disabled={actionInProgress !== null}
                        />
                      ))
                    )}
                    {branches.length === 0 && (
                      <View className="items-center justify-center py-8">
                        <SymbolImage name="branch" size={32} className="text-muted-foreground mb-2" />
                        <Text className="text-sm text-muted-foreground">No branches found</Text>
                      </View>
                    )}
                  </View>
                )}

                {activeTab === "pr" && (
                  <View className="p-2">
                    <GitSectionHeader title="Pull Request" />
                    {status?.pr ? (
                      <View className="bg-muted/50 rounded-lg p-3 mb-2">
                        <View className="flex-row items-center gap-2 mb-2">
                          <SymbolImage 
                            name={status.pr.state === "open" ? "arrow.triangle.2.circlepath" : "checkmark.circle"} 
                            size={16} 
                            className={status.pr.state === "open" ? "text-green-500" : "text-muted-foreground"}
                          />
                          <Text className="text-sm font-medium text-foreground">
                            {status.pr.title}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground mb-2">
                          #{status.pr.number} · {status.pr.state}
                        </Text>
                        <Pressable
                          onPress={() => {/* Open PR in browser */}}
                          className="flex-row items-center gap-2 bg-foreground/10 rounded px-3 py-2"
                        >
                          <SymbolImage name="arrow.up.right.square" size={14} className="text-foreground" />
                          <Text className="text-sm text-foreground">Open in browser</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <GitActionButton
                          icon="plus.circle"
                          label="Create Pull Request"
                          subtitle={canCreatePR ? "Create PR from current branch" : "Commit and push changes first"}
                          disabled={!canCreatePR || actionInProgress !== null}
                          onPress={() => setShowPRDialog(true)}
                          loading={actionInProgress === "create_pr"}
                        />
                        {!canCreatePR && (
                          <Text className="text-xs text-muted-foreground text-center mt-2">
                            {hasChanges ? "Commit your changes first" : !isAhead ? "Push your changes first" : "Set up remote tracking"}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                )}

                {activeTab === "worktrees" && (
                  <View className="p-2">
                    <GitSectionHeader 
                      title="Worktrees" 
                      action={{
                        label: "Manage",
                        onPress: () => setShowWorktreeManager(true),
                      }}
                    />
                    <View className="items-center justify-center py-8 px-4">
                      <SymbolImage name="rectangle.on.rectangle" size={48} className="text-muted-foreground mb-3" />
                      <Text className="text-sm text-muted-foreground text-center mb-2">Worktree Management</Text>
                      <Text className="text-xs text-muted-foreground text-center mb-4">
                        Worktrees allow you to work on multiple branches simultaneously
                      </Text>
                      <Pressable
                        onPress={() => setShowWorktreeManager(true)}
                        className="bg-foreground/10 active:bg-foreground/20 rounded-lg px-4 py-2.5"
                      >
                        <Text className="text-sm font-medium text-foreground">Manage Worktrees</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </ScrollView>

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

      {/* Commit Dialog */}
      <CommitDialog
        visible={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        commitMessage={commitMessage}
        setCommitMessage={setCommitMessage}
        onCommit={handleCommit}
        onCommitPush={handleCommitPush}
        loading={actionInProgress === "commit" || actionInProgress === "commit_push"}
      />

      {/* Branch Dialog */}
      <BranchDialog
        visible={showBranchDialog}
        onClose={() => setShowBranchDialog(false)}
        branchName={branchName}
        setBranchName={setBranchName}
        onCreate={handleCreateBranch}
        loading={actionInProgress !== null}
      />

      {/* PR Dialog */}
      <PRDialog
        visible={showPRDialog}
        onClose={() => setShowPRDialog(false)}
        prTitle={prTitle}
        setPrTitle={setPrTitle}
        onCreate={handleCreatePR}
        loading={actionInProgress === "create_pr"}
      />

      <WorktreeManager
        visible={showWorktreeManager}
        onClose={() => setShowWorktreeManager(false)}
        cwd={cwd}
      />
    </Modal>
  );
}

// Helper Components

interface GitSectionHeaderProps {
  title: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

function GitSectionHeader({ title, action }: GitSectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-2 mt-2">
      <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          className="px-2 py-1 bg-foreground/10 active:bg-foreground/20 rounded"
        >
          <Text className="text-xs text-foreground">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function TabButton({ label, active, onPress }: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "flex-1 py-1.5 rounded-md transition-colors",
        active ? "bg-background shadow-sm" : "bg-transparent"
      )}
    >
      <Text
        className={cn(
          "text-xs font-medium text-center",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface BranchItemProps {
  branch: VcsRef;
  currentBranch: string | null;
  onSwitch: () => void;
  disabled: boolean;
}

function BranchItem({ branch, currentBranch, onSwitch, disabled }: BranchItemProps) {
  const isCurrent = branch.current;
  const isRemote = branch.isRemote;
  const isDefault = branch.isDefault;

  return (
    <Pressable
      onPress={onSwitch}
      disabled={disabled || isCurrent || isRemote}
      className={cn(
        "flex-row items-center gap-3 px-3 py-2.5 rounded-lg mb-1",
        !disabled && !isCurrent && !isRemote && "active:bg-muted/30",
        (disabled || isCurrent || isRemote) && "opacity-50"
      )}
    >
      <View className="w-8 h-8 items-center justify-center bg-muted/50 rounded-full">
        <SymbolImage name="branch" size={16} className="text-foreground" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {branch.name}
        </Text>
        <View className="flex-row items-center gap-1 mt-0.5">
          {isDefault && (
            <View className="px-1.5 py-0.5 bg-green-500/10 rounded">
              <Text className="text-xs text-green-500">default</Text>
            </View>
          )}
          {isRemote && (
            <View className="px-1.5 py-0.5 bg-blue-500/10 rounded">
              <Text className="text-xs text-blue-500">remote</Text>
            </View>
          )}
          {isCurrent && (
            <View className="px-1.5 py-0.5 bg-foreground/10 rounded">
              <Text className="text-xs text-foreground">current</Text>
            </View>
          )}
        </View>
      </View>
      {isCurrent && (
        <SymbolImage name="checkmark.circle.fill" size={16} className="text-green-500" />
      )}
    </Pressable>
  );
}

interface CommitDialogProps {
  visible: boolean;
  onClose: () => void;
  commitMessage: string;
  setCommitMessage: (value: string) => void;
  onCommit: () => void;
  onCommitPush: () => void;
  loading: boolean;
}

function CommitDialog({ visible, onClose, commitMessage, setCommitMessage, onCommit, onCommitPush, loading }: CommitDialogProps) {
  const GlassComponent = View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 items-center justify-center" onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} className="w-full max-w-sm mx-4">
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden p-4"
              style={{ borderRadius: 16 }}
            >
              <Text className="text-lg font-semibold text-foreground mb-3">Commit Changes</Text>
              <TextInput
                className="bg-muted/50 rounded-lg px-4 py-3 text-foreground mb-4 min-h-24"
                placeholder="Enter commit message..."
                placeholderTextColor="#9ca3af"
                multiline
                value={commitMessage}
                onChangeText={setCommitMessage}
                autoFocus
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={onClose}
                  className="flex-1 bg-muted/50 active:bg-muted rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onCommit}
                  disabled={!commitMessage.trim() || loading}
                  className="flex-1 bg-foreground active:bg-muted-foreground rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-background">Commit</Text>
                </Pressable>
                <Pressable
                  onPress={onCommitPush}
                  disabled={!commitMessage.trim() || loading}
                  className="flex-1 bg-blue-500 active:bg-blue-600 rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-white">Commit & Push</Text>
                </Pressable>
              </View>
            </GlassComponent>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface BranchDialogProps {
  visible: boolean;
  onClose: () => void;
  branchName: string;
  setBranchName: (value: string) => void;
  onCreate: () => void;
  loading: boolean;
}

function BranchDialog({ visible, onClose, branchName, setBranchName, onCreate, loading }: BranchDialogProps) {
  const GlassComponent = View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 items-center justify-center" onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} className="w-full max-w-sm mx-4">
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden p-4"
              style={{ borderRadius: 16 }}
            >
              <Text className="text-lg font-semibold text-foreground mb-3">Create Branch</Text>
              <TextInput
                className="bg-muted/50 rounded-lg px-4 py-3 text-foreground mb-4"
                placeholder="Branch name"
                placeholderTextColor="#9ca3af"
                value={branchName}
                onChangeText={setBranchName}
                autoFocus
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={onClose}
                  className="flex-1 bg-muted/50 active:bg-muted rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onCreate}
                  disabled={!branchName.trim() || loading}
                  className="flex-1 bg-foreground active:bg-muted-foreground rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-background">Create</Text>
                </Pressable>
              </View>
            </GlassComponent>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface PRDialogProps {
  visible: boolean;
  onClose: () => void;
  prTitle: string;
  setPrTitle: (value: string) => void;
  onCreate: () => void;
  loading: boolean;
}

function PRDialog({ visible, onClose, prTitle, setPrTitle, onCreate, loading }: PRDialogProps) {
  const GlassComponent = View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 items-center justify-center" onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} className="w-full max-w-sm mx-4">
          <Pressable className="w-full" onPress={(e) => e.stopPropagation()}>
            <GlassComponent
              className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden p-4"
              style={{ borderRadius: 16 }}
            >
              <Text className="text-lg font-semibold text-foreground mb-3">Create Pull Request</Text>
              <TextInput
                className="bg-muted/50 rounded-lg px-4 py-3 text-foreground mb-4"
                placeholder="PR title"
                placeholderTextColor="#9ca3af"
                value={prTitle}
                onChangeText={setPrTitle}
                autoFocus
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={onClose}
                  className="flex-1 bg-muted/50 active:bg-muted rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onCreate}
                  disabled={!prTitle.trim() || loading}
                  className="flex-1 bg-purple-500 active:bg-purple-600 rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-white">Create PR</Text>
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
        "flex-row items-center gap-3 px-3 py-2 rounded-lg mb-1",
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