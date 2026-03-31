import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import path from "node:path";
import type { SkillIndexEntry } from "../skills/loader.js";
import { readSkillFile } from "../skills/loader.js";

export function createLoadSkillTool(
  skillsRoot: string,
  entries: SkillIndexEntry[]
): AgentTool<any> | null {
  if (entries.length === 0) return null;

  const idList = entries.map((e) => e.id).join(", ");
  const byId = new Map(entries.map((e) => [e.id, e.filePath] as const));

  const loadSkillParameters = Type.Object({
    skill_id: Type.String({
      description: `技能目录名（与 skills/ 下子目录一致）。当前可用: ${idList}`,
    }),
  });

  const tool: AgentTool<typeof loadSkillParameters> = {
    name: "load_skill",
    label: "Load skill",
    description:
      "按需加载项目 skills/<skill_id>/SKILL.md 的完整正文（含 frontmatter），用于遵循该领域工作流。仅在需要时再调用。",
    parameters: loadSkillParameters,
    execute: async (_toolCallId, params) => {
      const id = params.skill_id.trim();
      const filePath = byId.get(id);
      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: `[load_skill] 未找到技能 "${params.skill_id}"。可用 id: ${idList}`,
            },
          ],
          details: { notFound: true },
        };
      }

      const resolved = path.resolve(filePath);
      const root = path.resolve(skillsRoot);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return {
          content: [{ type: "text", text: "[load_skill] 路径无效。" }],
          details: { invalidPath: true },
        };
      }

      const full = readSkillFile(resolved);
      return {
        content: [
          {
            type: "text",
            text: `以下为技能 "${id}" 的完整 SKILL.md，请按其说明执行：\n\n${full}`,
          },
        ],
        details: { skillId: id },
      };
    },
  };

  return tool;
}
