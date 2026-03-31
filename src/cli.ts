#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import {
  CancellableLoader,
  CombinedAutocompleteProvider,
  Container,
  Editor,
  Markdown,
  ProcessTerminal,
  Spacer,
  TUI,
  type EditorTheme,
  type MarkdownTheme,
  type SelectListTheme,
} from "@mariozechner/pi-tui";
import { createAppAgent } from "./agent-factory.js";

// ─── .env ────────────────────────────────────────────────────────────────────

async function loadDotEnv(path = ".env"): Promise<void> {
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* 无 .env 时依赖已 export 的环境变量 */
  }
}

await loadDotEnv(process.env.ENV_FILE ?? ".env");

// ─── Theme ───────────────────────────────────────────────────────────────────

const selectListTheme: SelectListTheme = {
  selectedPrefix: chalk.cyan,
  selectedText: chalk.bold,
  description: chalk.gray,
  scrollInfo: chalk.gray,
  noMatch: chalk.gray,
};

const editorTheme: EditorTheme = {
  borderColor: chalk.gray,
  selectList: selectListTheme,
};

const markdownTheme: MarkdownTheme = {
  heading: chalk.bold.cyan,
  link: chalk.underline.blue,
  linkUrl: chalk.gray,
  code: chalk.yellow,
  codeBlock: chalk.yellow,
  codeBlockBorder: chalk.gray,
  quote: chalk.italic.gray,
  quoteBorder: chalk.gray,
  hr: chalk.gray,
  listBullet: chalk.cyan,
  bold: chalk.bold,
  italic: chalk.italic,
  strikethrough: chalk.strikethrough,
  underline: chalk.underline,
};

// ─── TUI ─────────────────────────────────────────────────────────────────────

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

const chatArea = new Container();
const agent = createAppAgent();

let currentMd: Markdown | null = null;
let accumulatedText = "";

agent.subscribe((event) => {
  if (event.type === "message_start") {
    accumulatedText = "";
    currentMd = new Markdown("", 1, 0, markdownTheme);
    chatArea.addChild(currentMd);
  }

  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    accumulatedText += event.assistantMessageEvent.delta;
    currentMd?.setText(accumulatedText);
    tui.requestRender();
  }

  if (event.type === "tool_execution_start") {
    chatArea.addChild(
      new Markdown(
        `_[工具] \`${event.toolName}\` …_`,
        1,
        0,
        markdownTheme,
      ),
    );
    tui.requestRender();
  }

  if (event.type === "agent_end") {
    const last = event.messages[event.messages.length - 1];
    if (last?.role === "assistant" && (last as any).errorMessage) {
      chatArea.addChild(
        new Markdown(
          `> **错误**: ${(last as any).errorMessage}`,
          1,
          0,
          markdownTheme,
        ),
      );
    }
    chatArea.addChild(new Spacer(1));
    editor.disableSubmit = false;
    tui.setFocus(editor);
    tui.requestRender();
  }
});

async function sendAgentPrompt(text: string, label = "思考中…"): Promise<void> {
  editor.disableSubmit = true;
  currentMd = null;

  const loader = new CancellableLoader(tui, chalk.cyan, chalk.gray, label);
  loader.onAbort = () => {
    agent.abort?.();
  };
  chatArea.addChild(loader);
  loader.start();

  await agent.prompt(text);

  loader.stop();
  chatArea.removeChild(loader);
  tui.setFocus(editor);
  tui.requestRender();
}

// ─── Editor ──────────────────────────────────────────────────────────────────

const slashCommands = [
  { name: "clear", description: "清空对话" },
  { name: "exit", description: "退出" },
];

const autocomplete = new CombinedAutocompleteProvider(
  slashCommands,
  process.cwd(),
);

const editor = new Editor(tui, editorTheme);
editor.setAutocompleteProvider(autocomplete);

editor.onSubmit = async (text) => {
  const input = text.trim();
  if (!input) return;

  if (input === "/exit" || input === "/quit") {
    tui.stop();
    process.exit(0);
  }

  if (input === "/clear") {
    chatArea.clear();
    agent.clearMessages?.();
    tui.requestRender();
    return;
  }

  chatArea.addChild(
    new Markdown(`**你**: ${input}`, 1, 0, markdownTheme),
  );
  chatArea.addChild(new Spacer(1));

  await sendAgentPrompt(input);
};

tui.addChild(chatArea);
tui.addChild(editor);
tui.setFocus(editor);

tui.addInputListener((data) => {
  if (data === "\x03") {
    tui.stop();
    process.exit(0);
  }
  return undefined;
});

tui.start();
