import { getModel, type Model } from "@mariozechner/pi-ai";

type ModelMeta = Pick<
  Model<"openai-completions">,
  "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens"
>;

/**
 * 已知自定义 endpoint 的本地元数据。
 * cost 单位：USD / 1M tokens（0 = 未知）。
 * 匹配规则：endpoint / model id 包含 key 字符串即命中。
 */
const KNOWN_MODEL_META: Record<string, ModelMeta> = {
  "doubao-seed-2-0-lite": {
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 131072,
  },
  "doubao-seed-2-0-flash": {
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 131072,
  },
};

const DEFAULT_META: ModelMeta = {
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262144,
  maxTokens: 131072,
};

function resolveModelMeta(id: string): ModelMeta {
  const key = Object.keys(KNOWN_MODEL_META).find((k) =>
    id.toLowerCase().includes(k),
  );
  return key ? KNOWN_MODEL_META[key] : DEFAULT_META;
}

const OPENAI_COMPAT_FIXED = {
  api: "openai-completions" as const,
  provider: "openai" as const,
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStore: false,
  },
};

function createOpenAICompatModel(baseUrl: string, id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    baseUrl: baseUrl.replace(/\/$/, ""),
    ...OPENAI_COMPAT_FIXED,
    ...resolveModelMeta(id),
  } satisfies Model<"openai-completions">;
}

/**
 * 从环境变量解析模型，两条路径：
 *
 * 1. PI_BASE_URL 有值 → 自定义 OpenAI 兼容端点（方舟、Moonshot、DeepSeek…）
 *    需同时设 PI_MODEL（endpoint / model id）、PI_API_KEY
 * 2. 否则 → PI_PROVIDER + PI_MODEL 走 pi-ai 内置注册表
 */
export function createModelFromEnv(): Model<any> {
  const baseUrl = process.env.PI_BASE_URL?.trim();
  if (baseUrl) {
    const id = process.env.PI_MODEL?.trim();
    if (!id) throw new Error("PI_MODEL is required when PI_BASE_URL is set");
    return createOpenAICompatModel(baseUrl, id);
  }

  const provider = process.env.PI_PROVIDER ?? "openai";
  const modelId = process.env.PI_MODEL ?? "gpt-4o-mini";
  return getModel(provider as never, modelId as never);
}

/**
 * 可选：仅用于上下文摘要（auto/manual compact），便于换便宜、快的小模型省费。
 * 未设置 `AGENT_COMPACT_MODEL` 时返回 `null`，调用方应回退到 `createModelFromEnv()` 的主模型。
 *
 * - `AGENT_COMPACT_BASE_URL` + `AGENT_COMPACT_MODEL`：OpenAI 兼容端点；密钥 `AGENT_COMPACT_API_KEY`，缺省用 `PI_API_KEY`
 * - 仅 `AGENT_COMPACT_MODEL`：`AGENT_COMPACT_PROVIDER`（缺省同 `PI_PROVIDER` 或 `openai`）+ pi-ai 注册表
 */
export function createSummarizeModelFromEnv(): Model<any> | null {
  const id = process.env.AGENT_COMPACT_MODEL?.trim();
  if (!id) return null;

  const baseUrl = process.env.AGENT_COMPACT_BASE_URL?.trim();
  if (baseUrl) return createOpenAICompatModel(baseUrl, id);

  const provider =
    process.env.AGENT_COMPACT_PROVIDER?.trim() ??
    process.env.PI_PROVIDER ??
    "openai";
  return getModel(provider as never, id as never);
}
