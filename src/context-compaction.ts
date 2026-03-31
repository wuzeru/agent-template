import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  completeSimple,
  type AssistantMessage,
  type Model,
  type TextContent,
  type ToolResultMessage,
  type UserMessage,
} from "@mariozechner/pi-ai";

// ─── 类型 ───────────────────────────────────────────────────────────────────

export type CompactionRefs = {
  manualCompactRequested: boolean;
};

export type ApiKeyResolver = (
  provider: string,
) => string | undefined | Promise<string | undefined>;

export type CompactionOptions = {
  /** 主会话模型：压缩后占位 assistant 的元数据与其一致 */
  conversationModel: Model<any>;
  /** 摘要 API 所用模型（可与主模型相同） */
  summarizeModel: Model<any>;
  /** 仅用于 `summarizeModel` 的请求鉴权 */
  resolveSummarizeApiKey: ApiKeyResolver;
  transcriptsDir?: string;
  tokenThreshold: number;
  keepRecentToolResults: number;
  minToolResultChars: number;
  transcriptMaxChars: number;
  refs: CompactionRefs;
  syncMessages: (messages: AgentMessage[]) => void;
};

type FullCompactParams = Pick<
  CompactionOptions,
  | "conversationModel"
  | "summarizeModel"
  | "resolveSummarizeApiKey"
  | "transcriptsDir"
  | "transcriptMaxChars"
> & { signal?: AbortSignal };

// ─── 第一层 micro_compact ───────────────────────────────────────────────────

function isToolResult(m: AgentMessage): m is ToolResultMessage {
  return m.role === "toolResult";
}

function toolResultTextLen(m: ToolResultMessage): number {
  return m.content
    .filter((p): p is TextContent => p.type === "text")
    .reduce((n, p) => n + p.text.length, 0);
}

export function microCompactInPlace(
  messages: AgentMessage[],
  keepRecent: number,
  minChars: number,
): void {
  const toolIndices = messages.flatMap((m, i) => (isToolResult(m) ? [i] : []));
  for (const i of toolIndices.slice(0, -keepRecent)) {
    const tr = messages[i] as ToolResultMessage;
    if (toolResultTextLen(tr) > minChars) {
      tr.content = [{ type: "text", text: `[Previous: used ${tr.toolName}]` }];
    }
  }
}

function estimateTokensRough(messages: AgentMessage[]): number {
  try {
    return Math.ceil(JSON.stringify(messages).length / 4);
  } catch {
    return 0;
  }
}

// ─── 第二层 / 第三层 full compact ─────────────────────────────────────────────

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

function stubAssistantAck(conversationModel: Model<any>, text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: conversationModel.api,
    provider: conversationModel.provider,
    model: conversationModel.id,
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function assistantPlainText(msg: AssistantMessage): string {
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

async function resolveKey(
  model: Model<any>,
  resolver?: ApiKeyResolver,
): Promise<string | undefined> {
  if (!resolver) return process.env.PI_API_KEY;
  const v = resolver(model.provider);
  return v instanceof Promise ? await v : v;
}

function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return String(value);
  return value;
}

function writeTranscript(
  messages: AgentMessage[],
  dir: string,
): string {
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  const file = path.join(resolved, `transcript_${Date.now()}.jsonl`);
  const body = messages.map((m) => JSON.stringify(m, jsonSafeReplacer)).join("\n");
  fs.writeFileSync(file, `${body}\n`, "utf8");
  return file;
}

function clipTranscriptJson(messages: AgentMessage[], maxChars: number): string {
  const payload = JSON.stringify(messages, jsonSafeReplacer);
  if (payload.length <= maxChars) return payload;
  return `${payload.slice(0, maxChars)}\n…[truncated]`;
}

const SUMMARIZE_PROMPT_PREFIX = `Summarize this agent conversation for continuity. Preserve: current goal, important file paths, commands run, errors, and what is left to do. Use the same language as the conversation when possible. Be concise.

Conversation JSON:
`;

async function summarizeTranscript(
  transcriptJson: string,
  summarizeModel: Model<any>,
  resolveSummarizeApiKey: ApiKeyResolver,
  signal: AbortSignal | undefined,
  transcriptPath: string,
): Promise<string> {
  const userMsg: UserMessage = {
    role: "user",
    content: SUMMARIZE_PROMPT_PREFIX + transcriptJson,
    timestamp: Date.now(),
  };
  try {
    const apiKey = await resolveKey(summarizeModel, resolveSummarizeApiKey);
    const out = await completeSimple(
      summarizeModel,
      { messages: [userMsg] },
      { signal, apiKey, maxTokens: 2048 },
    );
    return assistantPlainText(out).trim() || "(empty summary)";
  } catch {
    return `[Compaction failed: kept transcript at ${transcriptPath}]`;
  }
}

/**
 * 落盘、摘要、用两条消息替换当前历史。
 */
export async function fullCompactInPlace(
  messages: AgentMessage[],
  params: FullCompactParams,
): Promise<void> {
  const dir = params.transcriptsDir ?? path.join(process.cwd(), ".transcripts");
  const transcriptPath = writeTranscript(messages, dir);
  const slice = clipTranscriptJson(messages, params.transcriptMaxChars);

  const summary = await summarizeTranscript(
    slice,
    params.summarizeModel,
    params.resolveSummarizeApiKey,
    params.signal,
    transcriptPath,
  );

  const now = Date.now();
  const compressed: UserMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `[Compressed]\n\n${summary}\n\n(Transcript: ${transcriptPath})`,
      },
    ],
    timestamp: now,
  };

  messages.length = 0;
  messages.push(compressed, stubAssistantAck(params.conversationModel, "Understood. Continuing."));
}

// ─── transformContext 工厂 ─────────────────────────────────────────────────

export function createCompactionTransformContext(
  opts: CompactionOptions,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  const { refs, syncMessages, tokenThreshold, keepRecentToolResults, minToolResultChars } =
    opts;

  const fullParams: Omit<FullCompactParams, "signal"> = {
    conversationModel: opts.conversationModel,
    summarizeModel: opts.summarizeModel,
    resolveSummarizeApiKey: opts.resolveSummarizeApiKey,
    transcriptsDir: opts.transcriptsDir,
    transcriptMaxChars: opts.transcriptMaxChars,
  };

  return async (messages, signal) => {
    microCompactInPlace(messages, keepRecentToolResults, minToolResultChars);

    const shouldFull =
      estimateTokensRough(messages) > tokenThreshold || refs.manualCompactRequested;

    if (!shouldFull) return messages;

    refs.manualCompactRequested = false;
    try {
      await fullCompactInPlace(messages, { ...fullParams, signal });
      syncMessages(messages.slice());
    } catch {
      refs.manualCompactRequested = false;
    }

    return messages;
  };
}

export function compactionEnvOptions(): Pick<
  CompactionOptions,
  "tokenThreshold" | "keepRecentToolResults" | "minToolResultChars" | "transcriptMaxChars"
> {
  const n = (raw: string | undefined, fallback: number) => {
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    tokenThreshold: n(process.env.AGENT_COMPACT_TOKEN_THRESHOLD, 50_000),
    keepRecentToolResults: n(process.env.AGENT_MICRO_COMPACT_KEEP_RECENT, 3),
    minToolResultChars: n(process.env.AGENT_MICRO_COMPACT_MIN_CHARS, 100),
    transcriptMaxChars: n(process.env.AGENT_COMPACT_TRANSCRIPT_CHARS, 80_000),
  };
}
