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

/**
 * 从环境变量解析模型，两条路径：
 *
 * 1. PI_BASE_URL 有值 → 自定义 OpenAI 兼容端点（方舟、Moonshot、DeepSeek…）
 *    需同时设 PI_MODEL（endpoint / model id）、PI_API_KEY
 * 2. 否则 → PI_PROVIDER + PI_MODEL 走 pi-ai 内置注册表
 */
export function createModelFromEnv(): Model<any> {
  const baseUrl = process.env.PI_BASE_URL;
  if (baseUrl) {
    const id = process.env.PI_MODEL;
    if (!id) throw new Error("PI_MODEL is required when PI_BASE_URL is set");
    return {
      id,
      name: id,
      api: "openai-completions",
      provider: "openai",
      baseUrl: baseUrl.replace(/\/$/, ""),
      ...resolveModelMeta(id),
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStore: false,
      },
    } satisfies Model<"openai-completions">;
  }

  const provider = process.env.PI_PROVIDER ?? "openai";
  const modelId = process.env.PI_MODEL ?? "gpt-4o-mini";
  return getModel(provider as never, modelId as never);
}
