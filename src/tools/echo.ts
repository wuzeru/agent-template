import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

const echoParameters = Type.Object({
  text: Type.String({ description: "要回显的文本" }),
});

/** 示例工具：把输入原样返回，演示 AgentTool + TypeBox 参数定义 */
export const echoTool: AgentTool<typeof echoParameters> = {
  name: "echo",
  label: "Echo",
  description: "回显用户传入的文本，用于测试工具调用链路。",
  parameters: echoParameters,
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: params.text }],
    details: { echoedLength: params.text.length },
  }),
};
