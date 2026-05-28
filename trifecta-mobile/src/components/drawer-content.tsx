import "@/global.css";

import { Icon } from "@/components/icon";
import { SymbolImage } from "@/components/symbol-image";
import { labelForSelection, useModel } from "@/components/model-context";
import { LiquidMetalButton } from "@/components/liquid-metal";
import { TouchableGlass } from "@/components/touchable-glass";
import { SafeAreaView } from "@/components/tw";
import { useActiveThread } from "@/stores/active-thread";
import { useConnection } from "@/stores/connection";
import { useThreadList } from "@/stores/thread-list";
import { useWsClient } from "@/stores/ws-client";
import type { ProjectShell, ThreadShell } from "@/types/thread";
import { projectDisplayName } from "@/utils/projects";
import { cn } from "@/utils/tailwind";
import type { Href } from "expo-router";
import { ChevronDown, ChevronRight, Server, Wifi } from "lucide-react-native";

import React, { createContext, use, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type DrawerContextValue = {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  return (
    <DrawerContext value={{ isOpen, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext>
  );
}

export function useDrawer() {
  const context = use(DrawerContext);
  if (!context) throw new Error("useDrawer must be used within a DrawerProvider");
  return context;
}

function DrawerNavItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="px-4 py-3 mx-2 rounded-[10px] active:bg-muted">
      <Text className="text-base text-foreground">{label}</Text>
    </Pressable>
  );
}

function DrawerThreadItem({
  thread,
  onPress,
  active,
  providers,
}: {
  thread: ThreadShell;
  onPress: () => void;
  active?: boolean;
  providers: import("@/types/thread").ServerProvider[];
}) {
  const modelLabel = labelForSelection(thread.modelSelection, providers);
  return (
    <Pressable
      onPress={onPress}
      className={cn("px-4 py-2.5 mx-2 rounded-[10px] active:bg-accent", active && "bg-muted")}
    >
      <Text
        numberOfLines={1}
        className={cn("text-[15px]", active ? "text-foreground" : "text-muted-foreground")}
      >
        {thread.title || "New thread"}
      </Text>
      <Text numberOfLines={1} className="text-[12px] text-muted-foreground/60 mt-0.5">
        {modelLabel}
      </Text>
    </Pressable>
  );
}

function ProjectSection({
  project,
  threads,
  activeThreadId,
  onSelectThread,
  providers,
  collapsed,
  onToggle,
}: {
  project: ProjectShell;
  threads: ThreadShell[];
  activeThreadId: string | null;
  onSelectThread: (thread: ThreadShell) => void;
  providers: import("@/types/thread").ServerProvider[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (threads.length === 0) return null;
  return (
    <View>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center gap-1.5 px-5 pt-5 pb-1 active:opacity-60"
      >
        <Icon
          icon={collapsed ? ChevronRight : ChevronDown}
          className="w-3.5 h-3.5 text-muted-foreground"
        />
        <Text
          numberOfLines={1}
          className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
        >
          {projectDisplayName(project)}
        </Text>
      </Pressable>
      {!collapsed && (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={threads.length > 4}
          style={{ maxHeight: 260 }}
        >
          {threads.map((thread) => (
            <DrawerThreadItem
              key={thread.id}
              thread={thread}
              active={thread.id === activeThreadId}
              onPress={() => onSelectThread(thread)}
              providers={providers}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function DrawerContent({
  onNavigate,
  onOpenModal,
}: {
  onNavigate: (path: Href) => void;
  onOpenModal: (path: Href) => void;
}) {
  const { serverURL, isPaired } = useConnection();
  const { status: wsStatus } = useWsClient();
  const { activeThreads, projects } = useThreadList();
  const { activeThreadId, setActiveThreadId } = useActiveThread();
  const { providers, setSelectedModelSelection } = useModel();
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());

  const serverHost = (() => {
    if (!serverURL) return null;
    try { return new URL(serverURL).hostname; } catch { return serverURL; }
  })();

  const isConnected = wsStatus === "connected";

  // Group active threads by project, in project order
  const threadsByProject = useMemo(() => {
    const map = new Map<string, ThreadShell[]>();
    for (const t of activeThreads) {
      const list = map.get(t.projectId) ?? [];
      list.push(t);
      map.set(t.projectId, list);
    }
    return map;
  }, [activeThreads]);

  // Projects that have at least one active thread
  const activeProjects = projects.filter((p) => (threadsByProject.get(p.id)?.length ?? 0) > 0);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  function handleSelectThread(thread: ThreadShell) {
    setActiveThreadId(thread.id);
    setSelectedModelSelection(thread.modelSelection);
    onNavigate("/");
  }

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-[28px] font-bold text-foreground">Trifecta</Text>
        {isPaired && serverHost ? (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon
              icon={Wifi}
              className={`w-3 h-3 ${isConnected ? "text-sf-green" : "text-muted-foreground"}`}
            />
            <Text className="text-[12px] text-muted-foreground">{serverHost}</Text>
          </View>
        ) : null}
      </View>

      {/* Nav + Projects/Threads */}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 8 }}>
        <DrawerNavItem
          label="Settings"
          onPress={() => {
            if (process.env.EXPO_OS === "android") {
              onNavigate("/(settings)/settings");
            }
            onOpenModal("/(settings)/settings");
          }}
        />

        {activeProjects.map((project) => (
          <ProjectSection
            key={project.id}
            project={project}
            threads={threadsByProject.get(project.id) ?? []}
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
            providers={providers}
            collapsed={!expandedProjectIds.has(project.id)}
            onToggle={() => toggleProject(project.id)}
          />
        ))}

        {/* Threads without a known project (edge case) */}
        {activeThreads
          .filter((t) => !projects.find((p) => p.id === t.projectId))
          .slice(0, 10)
          .map((thread) => (
            <DrawerThreadItem
              key={thread.id}
              thread={thread}
              active={thread.id === activeThreadId}
              onPress={() => handleSelectThread(thread)}
              providers={providers}
            />
          ))}
      </ScrollView>

      {/* Footer */}
      <View
        className="flex-row items-center px-4 py-3 border-t border-border"
        style={{ borderTopWidth: StyleSheet.hairlineWidth }}
      >
        <TouchableGlass
          onPress={() => {
            if (isPaired) onOpenModal("/(settings)/settings");
            else onNavigate("/pair");
          }}
          className="rounded-full p-2 flex-row items-center gap-2.5 active:opacity-60"
        >
          <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
            <Icon icon={isPaired ? Server : Wifi} className="w-4 h-4 text-foreground" />
          </View>
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {serverHost ?? "Not connected"}
          </Text>
        </TouchableGlass>
        <View className="flex-1" />
        <View className="flex-row items-center gap-3">
          <LiquidMetalButton
            onPress={() => {
              if (process.env.EXPO_OS === "android") {
                onNavigate("/ssh");
              }
              onOpenModal("/ssh");
            }}
            size={40}
            accessibilityLabel="SSH Terminal"
          >
            <SymbolImage
              name="terminal"
              size={22}
              style={{
                tintColor: '#ffffff',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.35,
                shadowRadius: 2,
              }}
            />
          </LiquidMetalButton>
          <LiquidMetalButton
            onPress={() => {
              if (process.env.EXPO_OS === "android") {
                onNavigate("/");
              }
              onOpenModal("/new-chat");
            }}
            size={40}
            accessibilityLabel="New chat"
          >
            <SymbolImage
              name="plus"
              size={24}
              style={{
                tintColor: '#ffffff',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.35,
                shadowRadius: 2,
              }}
            />
          </LiquidMetalButton>
        </View>
      </View>
    </SafeAreaView>
  );
}
