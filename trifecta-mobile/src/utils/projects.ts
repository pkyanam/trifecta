import type { ProjectShell } from "@/types/thread";

type ProjectLike = ProjectShell & {
  name?: string | null;
  cwd?: string | null;
};

function lastPathComponent(path: string | null | undefined): string | null {
  const value = path?.trim();
  if (!value) return null;
  return value.split("/").filter(Boolean).pop() ?? null;
}

export function projectDisplayName(project: ProjectLike): string {
  return (
    project.title?.trim() ||
    project.name?.trim() ||
    lastPathComponent(project.workspaceRoot) ||
    lastPathComponent(project.cwd) ||
    "Project"
  );
}

export function projectDisplayPath(project: ProjectLike): string | null {
  const path = project.workspaceRoot?.trim() || project.cwd?.trim();
  return path ? path.replace(/^\/Users\/[^/]+/, "~") : null;
}
