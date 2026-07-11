import { useModel } from "@/components/model-context";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import { GitActionsSheet } from "./git-actions-sheet";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import {
  Button,
  Host,
  HStack,
  Menu,
  Section,
  Image as SUIImage,
  Text as SUIText,
  VStack,
} from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { Alert, useColorScheme, Pressable, Text } from "react-native";
import { useDrawer } from "./drawer-content";
import { SymbolImage } from "@/components/symbol-image";
import { shouldRestoreGitActions } from "@/utils/git-actions-restore";
import { secureRandomId } from "@/utils/secure-id";

function HeaderTitleMenu() {
  const { selectedModelLabel } = useModel();
  const { activeThreadId } = useActiveThread();
  const { request } = useWsClient();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const headerFg = isDark ? "#fff" : "#000";
  const headerFgMuted = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";

  function handleRename() {
    if (!activeThreadId) return;
    Alert.prompt(
      "Rename Thread",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          onPress: async (title?: string) => {
            if (!title?.trim()) return;
            try {
              await request("orchestration.dispatchCommand", {
                type: "thread.meta.update",
                commandId: secureRandomId(),
                threadId: activeThreadId,
                title: title.trim(),
              });
            } catch {}
          },
        },
      ],
      "plain-text",
    );
  }

  function handleDelete() {
    if (!activeThreadId) return;
    Alert.alert("Delete Thread", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await request("orchestration.dispatchCommand", {
              type: "thread.delete",
              commandId: secureRandomId(),
              threadId: activeThreadId,
              createdAt: new Date().toISOString(),
            });
            router.replace("/chats");
          } catch {}
        },
      },
    ]);
  }

  return (
    <Host style={{ minWidth: 200, minHeight: 40 }}>
      <Menu
        label={
          <VStack spacing={0}>
            <HStack spacing={4} alignment="center">
              <SUIText
                modifiers={[
                  foregroundStyle(headerFg),
                  font({ weight: "semibold", size: 17 }),
                ]}
              >
                {selectedModelLabel}
              </SUIText>
              <SUIImage systemName="chevron.down" size={10} color={headerFg} />
            </HStack>
            <SUIText modifiers={[foregroundStyle(headerFgMuted), font({ size: 12 })]}>
              Change model
            </SUIText>
          </VStack>
        }
      >
        <Section title="Model">
          <Button
            systemImage="cpu"
            label="Change model…"
            onPress={() => router.navigate("/model-picker")}
          />
        </Section>
        {activeThreadId ? (
          <Section title="Thread">
            <Button systemImage="pencil" label="Rename" onPress={handleRename} />
            <Button
              systemImage="trash"
              label="Delete"
              role="destructive"
              onPress={handleDelete}
            />
          </Section>
        ) : null}
      </Menu>
    </Host>
  );
}

export function MainHeader() {
  const { openDrawer } = useDrawer();
  const { request } = useWsClient();
  const { activeThreadId, newChatProjectId } = useActiveThread();
  const { getThread, getProject } = useThreadList();
  const [showGitActions, setShowGitActions] = useState(false);
  const [branchName, setBranchName] = useState("");

  // Get the actual thread data using the thread ID
  const activeThread = activeThreadId ? getThread(activeThreadId) : null;
  const project = activeThread?.projectId ? getProject(activeThread.projectId) : null;
  const newChatProject = newChatProjectId ? getProject(newChatProjectId) : null;

  // Get the correct CWD: thread worktreePath > project workspaceRoot > new chat project.
  // Only use a CWD if we have an active thread or new chat project with valid paths.
  // Never fall back to server cwd to avoid fetching git status for unrelated directories.
  const cwd = activeThreadId && !activeThread
    ? ""
    : activeThread?.worktreePath || project?.workspaceRoot || newChatProject?.workspaceRoot || "";

  useEffect(() => {
    let cancelled = false;
    shouldRestoreGitActions(cwd).then((shouldRestore) => {
      if (!cancelled && shouldRestore) {
        setShowGitActions(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  // Fetch git status whenever the thread changes
  useEffect(() => {
    if (!cwd) {
      setBranchName("");
      return;
    }

    const fetchGitStatus = async () => {
      try {
        const status = await request("vcs.refreshStatus", { cwd }) as any;
        if (status?.refName) {
          setBranchName(status.refName);
        } else {
          setBranchName("");
        }
      } catch {
        setBranchName("");
      }
    };

    fetchGitStatus();
  }, [cwd, request]); // This will re-run whenever cwd changes (i.e., when thread changes)

  const handleGitPress = () => {
    setShowGitActions(true);
  };

  // For iOS, use the native SwiftUI header for better performance
  return (
    <>
      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
      </Stack.Toolbar>
      {cwd && branchName && (
        <Stack.Toolbar placement="right" asChild>
          <Pressable
            onPress={handleGitPress}
            className="flex-row items-center gap-1.5 px-2 py-1 active:opacity-60"
          >
            <SymbolImage
              name="arrow.triangle.2.circlepath"
              size={16}
              className="text-foreground"
            />
            <Text className="text-sm font-medium text-foreground">Git</Text>
          </Pressable>
        </Stack.Toolbar>
      )}
      <GitActionsSheet
        visible={showGitActions}
        onClose={() => setShowGitActions(false)}
        cwd={cwd}
      />
    </>
  );
}
