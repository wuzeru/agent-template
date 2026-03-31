import path from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import { createModelFromEnv } from "./config/model.js";
import { defaultSkillsDir, loadSkillIndex } from "./skills/loader.js";
import { bashTool } from "./tools/bash.js";
import { createLoadSkillTool } from "./tools/load-skill.js";

export type CreateAppAgentOptions = {
  systemPrompt?: string;
  /** Skill 根目录，默认 `<cwd>/skills` */
  skillsDir?: string;
};

const DEFAULT_BASE_PROMPT = `你是一个有帮助的助手。可使用 bash 在本机执行命令（受安全策略限制）。
领域流程与专长写在项目 skills/<技能目录名>/SKILL.md。系统提示里只列出技能 id 与简述；需要严格按某套流程执行时，请先调用 load_skill(skill_id) 拉取完整 SKILL.md 正文，再按其说明行动。`;

function buildSkillsIndexBlock(
  entries: ReturnType<typeof loadSkillIndex>
): string {
  if (entries.length === 0) {
    return "\n\n（当前 skills/ 下没有含 SKILL.md 的子目录，暂无 load_skill 可用。）";
  }
  const lines = entries.map((e) => `- **${e.id}**: ${e.description}`);
  return `\n\n## 可用 Skills（仅索引；完整内容请调用 load_skill）\n${lines.join("\n")}`;
}

/**
 * 创建带默认配置的应用 Agent：模型来自环境变量；工具含 bash，以及按 skills/ 扫描得到的 load_skill。
 * @see https://github.com/badlogic/pi-mono/tree/main/packages/agent
 */
export function createAppAgent(options: CreateAppAgentOptions = {}) {
  const skillsRoot = path.resolve(options.skillsDir ?? defaultSkillsDir());
  const skillIndex = loadSkillIndex(skillsRoot);
  const loadSkillTool = createLoadSkillTool(skillsRoot, skillIndex);
  const tools = loadSkillTool ? [bashTool, loadSkillTool] : [bashTool];

  const systemPrompt =
    (options.systemPrompt ?? DEFAULT_BASE_PROMPT) +
    buildSkillsIndexBlock(skillIndex);

  return new Agent({
    initialState: {
      systemPrompt,
      model: createModelFromEnv(),
      tools,
      messages: [],
    },
    getApiKey: () => process.env.PI_API_KEY,
  });
}
