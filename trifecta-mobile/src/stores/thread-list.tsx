import type { ProjectShell, ThreadShell } from "@/types/thread";
import React, {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWsClient } from "./ws-client";

interface ThreadListContextValue {
  projects: ProjectShell[];
  threads: ThreadShell[];
  activeThreads: ThreadShell[];
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
  const threadsRef = useRef<ThreadShell[]>([]);
  const projectsRef = useRef<ProjectShell[]>([]);

  useEffect(() => {
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
            projectsRef.current = newProjects;
            threadsRef.current = newThreads;
            setProjects(newProjects);
            setThreads(newThreads);
            break;
          }
          case "thread-upserted": {
            const thread = item.thread as ThreadShell;
            const cur = threadsRef.current;
            const idx = cur.findIndex((t) => t.id === thread.id);
            const next =
              idx >= 0
                ? cur.map((t) => (t.id === thread.id ? thread : t))
                : [thread, ...cur];
            const sorted = sortByRecency(next);
            threadsRef.current = sorted;
            setThreads(sorted);
            break;
          }
          case "thread-removed": {
            const threadId = item.threadId as string;
            const next = threadsRef.current.filter((t) => t.id !== threadId);
            threadsRef.current = next;
            setThreads(next);
            break;
          }
          case "project-upserted": {
            const project = item.project as ProjectShell;
            const cur = projectsRef.current;
            const idx = cur.findIndex((p) => p.id === project.id);
            const next =
              idx >= 0
                ? cur.map((p) => (p.id === project.id ? project : p))
                : [...cur, project];
            projectsRef.current = next;
            setProjects(next);
            break;
          }
          case "project-removed": {
            const projectId = item.projectId as string;
            const nextP = projectsRef.current.filter((p) => p.id !== projectId);
            const nextT = threadsRef.current.filter(
              (t) => t.projectId !== projectId,
            );
            projectsRef.current = nextP;
            threadsRef.current = nextT;
            setProjects(nextP);
            setThreads(nextT);
            break;
          }
        }
      },
    );

    return unsubscribe;
  }, [status, subscribe]);

  const activeThreads = threads.filter((t) => !t.archivedAt);

  return (
    <ThreadListContext value={{ projects, threads, activeThreads }}>
      {children}
    </ThreadListContext>
  );
}

export function useThreadList() {
  const ctx = use(ThreadListContext);
  if (!ctx) throw new Error("useThreadList must be used within ThreadListProvider");
  return ctx;
}
