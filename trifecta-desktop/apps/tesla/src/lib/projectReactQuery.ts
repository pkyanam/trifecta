import type {
  EnvironmentId,
  ProjectListAgentSkillsResult,
  ProjectSearchEntriesResult,
} from "@belweave/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureEnvironmentApi } from "~/environmentApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  searchEntries: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    query: string,
    limit: number,
  ) => ["projects", "search-entries", environmentId ?? null, cwd, query, limit] as const,
  listAgentSkills: (environmentId: EnvironmentId | null, cwd: string | null) =>
    ["projects", "list-agent-skills", environmentId ?? null, cwd] as const,
};

const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};

const DEFAULT_LIST_AGENT_SKILLS_STALE_TIME = 60_000;
const EMPTY_LIST_AGENT_SKILLS_RESULT: ProjectListAgentSkillsResult = {
  skills: [],
};

export function projectSearchEntriesQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.environmentId, input.cwd, input.query, limit),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace entry search is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

export function projectListAgentSkillsQueryOptions(input: {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly enabled?: boolean;
  readonly staleTime?: number;
}) {
  return queryOptions({
    queryKey: projectQueryKeys.listAgentSkills(input.environmentId, input.cwd),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace agent skills are unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.listAgentSkills({ cwd: input.cwd });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null && input.cwd !== null,
    staleTime: input.staleTime ?? DEFAULT_LIST_AGENT_SKILLS_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_LIST_AGENT_SKILLS_RESULT,
  });
}
