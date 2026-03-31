import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BLOCKED_PATTERNS = [
  // 删除类
  /\brm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r/i, // rm -rf / rm -fr
  /\brmdir\b/i,
  // 格式化 / 覆盖磁盘
  /\bmkfs\b/i,
  /\bdd\b.*\bof\s*=\s*\/dev/i,
  /\bshred\b/i,
  // 权限提升
  /\bsudo\b/i,
  /\bsu\b\s/i,
  /\bchmod\s+[0-7]*7[0-7]{2}/i, // chmod 777 等
  // 网络攻击 / 端口扫描
  /\bnmap\b/i,
  /\bnetcat\b|\bnc\b.*-[a-z]*e/i,
  // Fork bomb
  /:\(\)\s*\{.*:\|:&/,
  // 写入系统关键路径
  />\s*\/etc\//i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  // 关机 / 重启
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\bpoweroff\b/i,
  // 清空文件
  />\s*\/[a-z]/i, // 重定向到根目录下的文件（宽泛保护）
];

function isBlocked(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `命令包含被禁止的模式：${pattern}`;
    }
  }
  return null;
}

const bashParameters = Type.Object({
  command: Type.String({ description: "要执行的 bash 命令（单行或多行）" }),
  timeout_ms: Type.Optional(
    Type.Number({ description: "超时毫秒数，默认 10000", default: 10000 })
  ),
});

export const bashTool: AgentTool<typeof bashParameters> = {
  name: "bash",
  label: "Bash",
  description:
    "在本机执行 bash 命令并返回 stdout / stderr。高危命令（rm -rf、sudo、dd、shutdown 等）会被拒绝执行。",
  parameters: bashParameters,
  execute: async (_toolCallId, params) => {
    const blocked = isBlocked(params.command);
    if (blocked) {
      return {
        content: [{ type: "text", text: `[拒绝执行] ${blocked}` }],
        details: { blocked: true },
      };
    }

    const timeout = params.timeout_ms ?? 10000;

    try {
      const { stdout, stderr } = await execFileAsync(
        "bash",
        ["-c", params.command],
        { timeout, maxBuffer: 1024 * 1024 }
      );

      const output = [stdout, stderr].filter(Boolean).join("\n--- stderr ---\n");
      return {
        content: [{ type: "text", text: output || "(无输出)" }],
        details: { exitCode: 0 },
      };
    } catch (err: any) {
      const msg =
        err.killed
          ? `[超时] 命令超过 ${timeout}ms 被终止`
          : `[错误] 退出码 ${err.code ?? "?"}\n${err.stderr ?? err.message}`;
      return {
        content: [{ type: "text", text: msg }],
        details: { exitCode: err.code ?? -1, killed: err.killed ?? false },
      };
    }
  },
};
