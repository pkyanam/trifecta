import { SymbolImage } from "@/components/symbol-image";
import { cn } from "@/utils/tailwind";
import { useState, useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGitService, type WorktreeInfo } from "@/services/git";

interface WorktreeManagerProps {
  visible: boolean;
  onClose: () => void;
  cwd: string;
}

export function WorktreeManager({ visible, onClose, cwd }: WorktreeManagerProps) {
  const git = useGitService();
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorktreePath, setNewWorktreePath] = useState("");
  const [newWorktreeBranch, setNewWorktreeBranch] = useState("");
  const [actionInProgress, setActionInProgress] = useState<"create" | "remove" | null>(null);

  useEffect(() => {
    if (visible) {
      loadWorktrees();
    }
  }, [visible]);

  const loadWorktrees = async () => {
    setLoading(true);
    try {
      const result = await git.listWorktrees(cwd);
      setWorktrees(result.worktrees);
    } catch (error) {
      console.error("Failed to load worktrees:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorktree = async () => {
    if (!newWorktreePath.trim()) return;
    setActionInProgress("create");
    setShowCreateDialog(false);
    
    try {
      await git.createWorktree(
        cwd,
        newWorktreePath.trim(),
        newWorktreeBranch.trim() || null
      );
      setNewWorktreePath("");
      setNewWorktreeBranch("");
      loadWorktrees();
    } catch (error) {
      console.error("Worktree creation failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveWorktree = async (worktreePath: string) => {
    setActionInProgress("remove");
    try {
      await git.removeWorktree(cwd, worktreePath);
      loadWorktrees();
    } catch (error) {
      console.error("Worktree removal failed:", error);
    } finally {
      setActionInProgress(null);
    }
  };

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
              {/* Header */}
              <View className="px-4 py-3 border-b border-border/50 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <SymbolImage name="rectangle.on.rectangle" size={20} className="text-foreground" />
                  <Text className="text-lg font-semibold text-foreground">Worktrees</Text>
                </View>
                <Pressable
                  onPress={() => setShowCreateDialog(true)}
                  className="px-3 py-1.5 bg-foreground/10 active:bg-foreground/20 rounded-lg"
                  disabled={actionInProgress !== null}
                >
                  <Text className="text-sm font-medium text-foreground">New Worktree</Text>
                </Pressable>
              </View>

              {/* Content */}
              <ScrollView className="max-h-96">
                {loading ? (
                  <View className="items-center justify-center py-8">
                    <ActivityIndicator size="small" className="text-foreground" />
                  </View>
                ) : worktrees.length > 0 ? (
                  worktrees.map((worktree) => (
                    <WorktreeItem
                      key={worktree.path}
                      worktree={worktree}
                      onRemove={() => handleRemoveWorktree(worktree.path)}
                      disabled={actionInProgress !== null}
                    />
                  ))
                ) : (
                  <View className="items-center justify-center py-8 px-4">
                    <SymbolImage name="rectangle.on.rectangle" size={48} className="text-muted-foreground mb-3" />
                    <Text className="text-sm text-muted-foreground text-center mb-2">No worktrees found</Text>
                    <Text className="text-xs text-muted-foreground text-center">
                      Create a worktree to work on multiple branches simultaneously
                    </Text>
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

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        visible={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        path={newWorktreePath}
        setPath={setNewWorktreePath}
        branch={newWorktreeBranch}
        setBranch={setNewWorktreeBranch}
        onCreate={handleCreateWorktree}
        loading={actionInProgress === "create"}
      />
    </Modal>
  );
}

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  onRemove: () => void;
  disabled: boolean;
}

function WorktreeItem({ worktree, onRemove, disabled }: WorktreeItemProps) {
  const isCurrent = worktree.isCurrent;

  return (
    <View className="bg-muted/30 rounded-lg p-3 mb-2">
      <View className="flex-row items-start gap-3">
        <View className="w-8 h-8 items-center justify-center bg-muted/50 rounded-full">
          <SymbolImage name="folder" size={16} className="text-foreground" />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
              {worktree.branch}
            </Text>
            {isCurrent && (
              <View className="px-1.5 py-0.5 bg-green-500/10 rounded">
                <Text className="text-xs text-green-500">current</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-muted-foreground mb-2" numberOfLines={1}>
            {worktree.path}
          </Text>
          <View className="flex-row items-center gap-2">
            {worktree.isBare && (
              <View className="px-1.5 py-0.5 bg-orange-500/10 rounded">
                <Text className="text-xs text-orange-500">bare</Text>
              </View>
            )}
            {worktree.isDetached && (
              <View className="px-1.5 py-0.5 bg-yellow-500/10 rounded">
                <Text className="text-xs text-yellow-500">detached</Text>
              </View>
            )}
            {worktree.isLocked && (
              <View className="px-1.5 py-0.5 bg-red-500/10 rounded">
                <Text className="text-xs text-red-500">locked</Text>
              </View>
            )}
          </View>
        </View>
        {!isCurrent && (
          <Pressable
            onPress={onRemove}
            disabled={disabled}
            className={cn(
              "p-2 bg-red-500/10 active:bg-red-500/20 rounded-lg",
              disabled && "opacity-50"
            )}
          >
            <SymbolImage name="trash" size={16} className="text-red-500" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface CreateWorktreeDialogProps {
  visible: boolean;
  onClose: () => void;
  path: string;
  setPath: (value: string) => void;
  branch: string;
  setBranch: (value: string) => void;
  onCreate: () => void;
  loading: boolean;
}

function CreateWorktreeDialog({
  visible,
  onClose,
  path,
  setPath,
  branch,
  setBranch,
  onCreate,
  loading,
}: CreateWorktreeDialogProps) {
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
              <Text className="text-lg font-semibold text-foreground mb-3">Create Worktree</Text>
              
              <View className="mb-3">
                <Text className="text-sm font-medium text-foreground mb-1">Path</Text>
                <TextInput
                  className="bg-muted/50 rounded-lg px-4 py-3 text-foreground"
                  placeholder="Relative path (e.g., ../feature-branch)"
                  placeholderTextColor="#9ca3af"
                  value={path}
                  onChangeText={setPath}
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-foreground mb-1">Branch (optional)</Text>
                <TextInput
                  className="bg-muted/50 rounded-lg px-4 py-3 text-foreground"
                  placeholder="Branch name (defaults to HEAD)"
                  placeholderTextColor="#9ca3af"
                  value={branch}
                  onChangeText={setBranch}
                />
              </View>

              <View className="flex-row gap-2">
                <Pressable
                  onPress={onClose}
                  disabled={loading}
                  className="flex-1 bg-muted/50 active:bg-muted rounded-lg px-4 py-2.5"
                >
                  <Text className="text-center text-sm font-medium text-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onCreate}
                  disabled={!path.trim() || loading}
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