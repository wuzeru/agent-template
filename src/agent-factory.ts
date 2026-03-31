import { Agent } from "@mariozechner/pi-agent-core";
import { createModelFromEnv } from "./config/model.js";
import { defaultTools } from "./tools/index.js";

export type CreateAppAgentOptions = {
  systemPrompt?: string;
};

/**
 * 创建带默认配置的应用 Agent：模型来自环境变量，工具来自 defaultTools。
 * @see https://github.com/badlogic/pi-mono/tree/main/packages/agent
 */
export function createAppAgent(options: CreateAppAgentOptions = {}) {
  const systemPrompt =
    options.systemPrompt ??
    "你是一个有帮助的助手。需要时用 echo 工具回显文本以验证工具是否正常。";

  return new Agent({
    initialState: {
      systemPrompt,
      model: createModelFromEnv(),
      tools: defaultTools,
      messages: [],
    },
    getApiKey: () => process.env.PI_API_KEY,
  });
}
