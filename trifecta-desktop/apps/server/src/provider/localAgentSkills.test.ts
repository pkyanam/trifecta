// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";

import { discoverLocalAgentSkillsFromDisk } from "./localAgentSkills.ts";

describe("discoverLocalAgentSkillsFromDisk", () => {
  it("finds SKILL.md entries under .cursor/skills and dedupes by path", async () => {
    const tmpBase = await Fs.mkdtemp(Path.join(Os.tmpdir(), "trifecta-local-skills-"));
    try {
      const skillDir = Path.join(tmpBase, ".cursor", "skills", "my-skill");
      await Fs.mkdir(skillDir, { recursive: true });
      await Fs.writeFile(Path.join(skillDir, "SKILL.md"), "---\nname: test\n---\n", "utf8");

      const skills = await discoverLocalAgentSkillsFromDisk({ cwd: tmpBase, homeDir: tmpBase });
      expect(skills).toHaveLength(1);
      expect(skills[0]?.name).toBe("my-skill");
      expect(skills[0]?.path).toBe(Path.join(skillDir, "SKILL.md"));
      expect(skills[0]?.enabled).toBe(true);
    } finally {
      await Fs.rm(tmpBase, { recursive: true, force: true });
    }
  });
});
