import type {
  EnvironmentId,
  ProjectListEntriesResult,
  ProjectReadFileResult,
} from "@belweave/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { readEnvironmentApi } from "~/environmentApi";

const EMPTY_PROJECT_FILE_PATH = "";

interface ProjectQueryState<A> {
  readonly data: A | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

interface OptimisticProjectFileState {
  readonly data: ProjectReadFileResult;
  readonly confirmedAgainst: string | null;
}

const optimisticFilesByKey = new Map<string, OptimisticProjectFileState>();

function projectEntriesQueryKey(environmentId: EnvironmentId, cwd: string) {
  return ["projectEntries", environmentId, cwd] as const;
}

function projectFileQueryKey(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string | null,
) {
  return ["projectFile", environmentId, cwd, relativePath ?? EMPTY_PROJECT_FILE_PATH] as const;
}

function optimisticFileKey(environmentId: EnvironmentId, cwd: string, relativePath: string) {
  return `${environmentId}:${cwd}:${relativePath}`;
}

export function setProjectFileQueryData(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
  contents: string,
): void {
  optimisticFilesByKey.set(optimisticFileKey(environmentId, cwd, relativePath), {
    confirmedAgainst: null,
    data: {
      relativePath,
      contents,
      byteLength: new TextEncoder().encode(contents).byteLength,
      truncated: false,
    },
  });
}

export function getOptimisticProjectFileQueryData(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
): ProjectReadFileResult | null {
  return (
    optimisticFilesByKey.get(optimisticFileKey(environmentId, cwd, relativePath))?.data ?? null
  );
}

export function confirmProjectFileQueryData(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
  contents: string,
  queryClient: ReturnType<typeof useQueryClient>,
): boolean {
  const key = optimisticFileKey(environmentId, cwd, relativePath);
  const optimisticFile = optimisticFilesByKey.get(key);
  if (optimisticFile?.data.contents !== contents) return false;

  optimisticFilesByKey.set(key, {
    ...optimisticFile,
    confirmedAgainst: contents,
  });
  void queryClient.invalidateQueries({
    queryKey: projectFileQueryKey(environmentId, cwd, relativePath),
  });
  const next = optimisticFilesByKey.get(key);
  if (next?.confirmedAgainst === contents) {
    optimisticFilesByKey.delete(key);
  }
  return true;
}

export function clearProjectFileQueryData(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
): void {
  optimisticFilesByKey.delete(optimisticFileKey(environmentId, cwd, relativePath));
}

export function useProjectEntriesQuery(
  environmentId: EnvironmentId,
  cwd: string,
): ProjectQueryState<ProjectListEntriesResult> {
  const query = useQuery({
    queryKey: projectEntriesQueryKey(environmentId, cwd),
    queryFn: async () => {
      const api = readEnvironmentApi(environmentId);
      if (!api) throw new Error("Environment API unavailable.");
      return api.projects.listEntries({ cwd });
    },
    staleTime: 15_000,
  });
  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);
  return {
    data: query.data ?? null,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Workspace query failed."
          : null,
    isPending: query.isPending || query.isFetching,
    refresh,
  };
}

export function useProjectFileQuery(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string | null,
): ProjectQueryState<ProjectReadFileResult> {
  const query = useQuery({
    queryKey: projectFileQueryKey(environmentId, cwd, relativePath),
    queryFn: async () => {
      if (relativePath === null) return null;
      const api = readEnvironmentApi(environmentId);
      if (!api) throw new Error("Environment API unavailable.");
      return api.projects.readFile({ cwd, relativePath });
    },
    enabled: relativePath !== null,
    staleTime: 15_000,
  });
  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);
  const optimisticFile =
    relativePath === null
      ? null
      : (getOptimisticProjectFileQueryData(environmentId, cwd, relativePath) ?? null);
  return {
    data: optimisticFile ?? query.data ?? null,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Workspace query failed."
          : null,
    isPending: relativePath !== null && (query.isPending || query.isFetching),
    refresh,
  };
}
