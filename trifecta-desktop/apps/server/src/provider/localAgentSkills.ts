// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * Discover locally installed agent skills (folders containing `SKILL.md`) under
 * common roots. Used when a provider runtime does not expose a skills API
 * (e.g. Cursor ACP) so the `$` composer menu can still list workspace and user
 * skills, similar to Codex `skills/list`.
 *
 * @module provider/localAgentSkills
 */
import * as Fs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as Path from "node:path";
import type { ServerProviderSkill } from "@belweave/contracts";
import * as Effect from "effect/Effect";

const SKILL_FILE = "SKILL.md";

/** Skill directory layouts shared by Cursor, Codex CLI, and community tools. */
const RELATIVE_SKILL_ROOTS: ReadonlyArray<readonly string[]> = [
  [".cursor", "skills"],
  [".codex", "skills"],
  [".agents", "skills"],
  [".claude", "skills"],
];

function skillNameFromDirectoryName(dirName: string): string {
  const trimmed = dirName.trim();
  return trimmed.length > 0 ? trimmed : "skill";
}

async function collectSkillsUnderRoot(root: string): Promise<ServerProviderSkill[]> {
  let stat: Awaited<ReturnType<typeof Fs.stat>>;
  try {
    stat = await Fs.stat(root);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  let names: string[];
  try {
    names = await Fs.readdir(root);
  } catch {
    return [];
  }

  const out: ServerProviderSkill[] = [];
  for (const name of names) {
    if (name.length === 0) continue;
    const skillMdPath = Path.join(root, name, SKILL_FILE);
    try {
      const dirStat = await Fs.stat(Path.join(root, name));
      if (!dirStat.isDirectory()) continue;
    } catch {
      continue;
    }
    try {
      const fileStat = await Fs.stat(skillMdPath);
      if (!fileStat.isFile()) continue;
    } catch {
      continue;
    }
    out.push({
      name: skillNameFromDirectoryName(name),
      path: skillMdPath,
      enabled: true,
    });
  }
  return out;
}

/**
 * Scan `cwd` and the user home directory for skill trees. Dedupes by absolute
 * skill path (same skill linked from cwd and home is only listed once).
 */
export async function discoverLocalAgentSkillsFromDisk(input: {
  readonly cwd: string;
  readonly homeDir?: string;
}): Promise<ReadonlyArray<ServerProviderSkill>> {
  const homeDir = input.homeDir ?? NodeOs.homedir();
  const bases = [...new Set([Path.resolve(input.cwd), Path.resolve(homeDir)])];
  const byPath = new Map<string, ServerProviderSkill>();

  for (const base of bases) {
    for (const segments of RELATIVE_SKILL_ROOTS) {
      const root = Path.join(base, ...segments);
      const batch = await collectSkillsUnderRoot(root);
      for (const skill of batch) {
        const key = Path.resolve(skill.path);
        if (!byPath.has(key)) {
          byPath.set(key, skill);
        }
      }
    }
  }

  return [...byPath.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

export const discoverLocalAgentSkills = (input: { cwd: string; homeDir?: string }) =>
  Effect.tryPromise({
    try: () => discoverLocalAgentSkillsFromDisk(input),
    catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
  });
