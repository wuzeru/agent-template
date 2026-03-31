import fs from "node:fs";
import path from "node:path";

export type SkillIndexEntry = {
  id: string;
  description: string;
  filePath: string;
};

/** 解析 SKILL.md 顶部的 YAML frontmatter（简单 key: value 行）。 */
export function parseSkillFrontmatter(raw: string): {
  meta: Record<string, string>;
  rest: string;
} {
  let s = raw;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (!s.startsWith("---")) {
    return { meta: {}, rest: raw };
  }
  const openEnd = s.indexOf("\n", 3);
  if (openEnd === -1) return { meta: {}, rest: raw };
  const closeStart = s.indexOf("\n---", openEnd);
  if (closeStart === -1) return { meta: {}, rest: raw };
  const block = s.slice(openEnd + 1, closeStart);
  const rest = s.slice(closeStart + 4).replace(/^\r?\n/, "");

  const meta: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, rest };
}

/**
 * 扫描 `skillsRoot` 下一层子目录，若存在 `SKILL.md` 则登记；目录名为 skill id。
 */
export function loadSkillIndex(skillsRoot: string): SkillIndexEntry[] {
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    return [];
  }

  const entries: SkillIndexEntry[] = [];
  for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const id = dirent.name;
    const skillMd = path.join(skillsRoot, id, "SKILL.md");
    if (!fs.existsSync(skillMd) || !fs.statSync(skillMd).isFile()) continue;

    const raw = fs.readFileSync(skillMd, "utf8");
    const { meta } = parseSkillFrontmatter(raw);
    const description =
      meta.description ?? meta.name ?? "（无 description/name frontmatter）";

    entries.push({ id, description, filePath: skillMd });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

export function readSkillFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function defaultSkillsDir(cwd = process.cwd()): string {
  return path.resolve(cwd, "skills");
}
