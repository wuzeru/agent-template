import path from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import {
  type ApiKeyResolver,
  compactionEnvOptions,
  createCompactionTransformContext,
} from "./context-compaction.js";
import {
  createModelFromEnv,
  createSummarizeModelFromEnv,
} from "./config/model.js";
import { defaultSkillsDir, loadSkillIndex } from "./skills/loader.js";
import { bashTool } from "./tools/bash.js";
import { createCompactTool } from "./tools/compact.js";
import { createLoadSkillTool } from "./tools/load-skill.js";

export type CreateAppAgentOptions = {
  systemPrompt?: string;
  /** Skill 根目录，默认 `<cwd>/skills` */
  skillsDir?: string;
};

const DEFAULT_BASE_PROMPT = `你是一个有帮助的助手。可使用 bash 在本机执行命令（受安全策略限制）。
领域流程与专长写在项目 skills/<技能目录名>/SKILL.md。系统提示里只列出技能 id 与简述；需要严格按某套流程执行时，请先调用 load_skill(skill_id) 拉取完整 SKILL.md 正文，再按其说明行动。

## 上下文三层压缩（对齐 Claude Code / Learn s06）
1. **micro_compact**：每次调用模型前静默执行；较早的 tool 结果若过长会变为 \`[Previous: used <tool>]\`，仅保留最近几条完整结果。
2. **auto_compact**：当估算上下文超过阈值（默认 50000 tokens，可用环境变量 AGENT_COMPACT_TOKEN_THRESHOLD 调整）时，将完整历史写入 .transcripts/*.jsonl，再调用模型生成摘要并替换为简短对话。可选环境变量 AGENT_COMPACT_MODEL（及 AGENT_COMPACT_BASE_URL / AGENT_COMPACT_API_KEY 等）指定更便宜的小模型专做摘要，未配置则与主会话同模型。
3. **compact 工具**：由你在需要时主动触发，与 auto 使用同一套摘要逻辑。长对话或阶段任务完成后可调用 compact。`;

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
  const compactionRefs = { manualCompactRequested: false };
  const compactTool = createCompactTool(compactionRefs);
  const tools = loadSkillTool
    ? [bashTool, loadSkillTool, compactTool]
    : [bashTool, compactTool];

  const systemPrompt =
    (options.systemPrompt ?? DEFAULT_BASE_PROMPT) +
    buildSkillsIndexBlock(skillIndex);

  const conversationModel = createModelFromEnv();
  const summarizeDedicated = createSummarizeModelFromEnv();
  const summarizeModel = summarizeDedicated ?? conversationModel;

  const resolveSummarizeApiKey: ApiKeyResolver = summarizeDedicated
    ? () => process.env.AGENT_COMPACT_API_KEY ?? process.env.PI_API_KEY
    : () => process.env.PI_API_KEY;

  const transcriptsDir = path.join(process.cwd(), ".transcripts");
  const envCompact = compactionEnvOptions();

  const agentRef: { current: Agent | null } = { current: null };
  const transformContext = createCompactionTransformContext({
    conversationModel,
    summarizeModel,
    resolveSummarizeApiKey,
    transcriptsDir,
    refs: compactionRefs,
    syncMessages: (msgs) => agentRef.current?.replaceMessages(msgs),
    ...envCompact,
  });

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: conversationModel,
      tools,
      messages: [],
    },
    transformContext,
    getApiKey: () => process.env.PI_API_KEY,
  });

  agentRef.current = agent;
  return agent;
}
