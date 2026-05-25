/**
 * Project search service for @ mentions.
 * Calls projects.searchEntries via WebSocket RPC.
 */

import { useWsClient } from "@/stores/ws-client";

export interface ProjectEntry {
  path: string;
  kind: "file" | "directory";
  parentPath?: string;
}

export interface ProjectSearchResult {
  entries: ProjectEntry[];
  truncated: boolean;
}

export interface ProjectSearchOptions {
  cwd: string;
  query: string;
  limit?: number;
}

/**
 * Hook for searching project entries with React state management.
 * This is used for @ mentions in the composer.
 */
export function useProjectSearch() {
  const { request } = useWsClient();

  const search = async (
    options: ProjectSearchOptions,
  ): Promise<ProjectSearchResult> => {
    const trimmedQuery = options.query.trim();
    if (!trimmedQuery) {
      return { entries: [], truncated: false };
    }

    const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
    
    try {
      const result = await request("projects.searchEntries", {
        cwd: options.cwd,
        query: trimmedQuery,
        limit,
      }) as ProjectSearchResult;
      
      return result;
    } catch (error) {
      console.error("Project search failed:", error);
      return { entries: [], truncated: false };
    }
  };

  return { search };
}