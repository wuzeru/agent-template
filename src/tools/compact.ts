import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type { CompactionRefs } from "../context-compaction.js";

const compactParameters = Type.Object({});

/**
 * 第三层：手动触发与 s06 auto_compact 相同的摘要流程（在下次模型调用前的 transformContext 中执行）。
 */
export function createCompactTool(refs: CompactionRefs): AgentTool<typeof compactParameters> {
  return {
    name: "compact",
    label: "Compact context",
    description:
      "手动压缩对话上下文。下一次调用模型前会：把完整历史写入 .transcripts/*.jsonl，用模型生成摘要，并将可见历史替换为 [Compressed] 摘要 + 确认句。在长对话或阶段任务结束时使用。",
    parameters: compactParameters,
    execute: async () => {
      refs.manualCompactRequested = true;
      return {
        content: [
          {
            type: "text",
            text: "[compact] 已排队：将在下一次模型调用前执行全文摘要与占位替换（见系统说明中的三层压缩）。",
          },
        ],
        details: { queued: true },
      };
    },
  };
}
