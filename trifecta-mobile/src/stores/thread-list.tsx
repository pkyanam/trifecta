import type { ProjectShell, ThreadShell } from "@/types/thread";
import React, {
  createContext,
  use,
  useEffect,
  useState,
} from "react";
import { useWsClient } from "./ws-client";

interface ThreadListContextValue {
  projects: ProjectShell[];
  threads: ThreadShell[];
  activeThreads: ThreadShell[];
  getThread: (threadId: string) => ThreadShell | undefined;
  getProject: (projectId: string) => ProjectShell | undefined;
}

const ThreadListContext = createContext<ThreadListContextValue | null>(null);

function sortByRecency(threads: ThreadShell[]): ThreadShell[] {
  return [...threads].sort((a, b) => {
    const aTime = a.latestUserMessageAt ?? a.updatedAt;
    const bTime = b.latestUserMessageAt ?? b.updatedAt;
    return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
  });
}

export function ThreadListProvider({ children }: { children: React.ReactNode }) {
  const { subscribe, status } = useWsClient();
  const [projects, setProjects] = useState<ProjectShell[]>([]);
  const [threads, setThreads] = useState<ThreadShell[]>([]);

  useEffect(() => {
    // Only subscribe when connected, but don't clear data on disconnect
    // This preserves thread list during temporary connection drops
    if (status !== "connected") return;

    const unsubscribe = subscribe(
      "orchestration.subscribeShell",
      {},
      (value) => {
        const item = value as Record<string, unknown>;
        const kind = item.kind as string;

        switch (kind) {
          case "snapshot": {
            const snap = item.snapshot as Record<string, unknown>;
            const newProjects = (snap.projects as ProjectShell[]) ?? [];
            const newThreads = sortByRecency(
              (snap.threads as ThreadShell[]) ?? [],
            );
            setProjects(newProjects);
            setThreads(newThreads);
            break;
          }
          case "thread-upserted": {
            const thread = item.thread as ThreadShell;
            setThreads((cur) => {
              const idx = cur.findIndex((t) => t.id === thread.id);
              const next =
                idx >= 0
                  ? cur.map((t) => (t.id === thread.id ? thread : t))
                  : [thread, ...cur];
              return sortByRecency(next);
            });
            break;
          }
          case "thread-removed": {
            const threadId = item.threadId as string;
            setThreads((cur) => cur.filter((t) => t.id !== threadId));
            break;
          }
          case "project-upserted": {
            const project = item.project as ProjectShell;
            setProjects((cur) => {
              const idx = cur.findIndex((p) => p.id === project.id);
              return idx >= 0
                ? cur.map((p) => (p.id === project.id ? project : p))
                : [...cur, project];
            });
            break;
          }
          case "project-removed": {
            const projectId = item.projectId as string;
            setProjects((cur) => cur.filter((p) => p.id !== projectId));
            setThreads((cur) => cur.filter((t) => t.projectId !== projectId));
            break;
          }
        }
      },
    );

    return unsubscribe;
  }, [status, subscribe]);

  const activeThreads = threads.filter((t) => !t.archivedAt);

  const getThread = (threadId: string): ThreadShell | undefined => {
    return threads.find((t) => t.id === threadId);
  };

  const getProject = (projectId: string): ProjectShell | undefined => {
    return projects.find((p) => p.id === projectId);
  };

  return (
    <ThreadListContext value={{ projects, threads, activeThreads, getThread, getProject }}>
      {children}
    </ThreadListContext>
  );
}

export function useThreadList() {
  const ctx = use(ThreadListContext);
  if (!ctx) throw new Error("useThreadList must be used within ThreadListProvider");
  return ctx;
}
