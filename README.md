# agent-template

基于 [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-mono/tree/main/packages/agent) 与 [@mariozechner/pi-ai](https://github.com/badlogic/pi-mono/tree/main/packages/ai) 的 **Node 20+** 应用骨架：有状态 Agent、工具执行、流式事件（与上游 README 中的事件序列一致）。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY 等

npm install
npm run dev -- "用 echo 工具回显：你好"
```

环境变量（二选一）：

**自定义 OpenAI 兼容端点**（方舟、Moonshot、DeepSeek 等任意兼容服务）：

| 变量 | 说明 |
|------|------|
| `PI_BASE_URL` | 端点地址，如 `https://ark.cn-beijing.volces.com/api/v3` |
| `PI_MODEL` | 模型 / endpoint ID，如 `doubao-seed-2-0-lite-260215` |
| `PI_API_KEY` | API Key |

**pi-ai 内置模型**（无需 `PI_BASE_URL`）：

| 变量 | 说明 |
|------|------|
| `PI_PROVIDER` | 厂商，如 `openai`、`anthropic`、`google` |
| `PI_MODEL` | 模型 ID，如 `gpt-4o-mini` |
| 各厂商 Key | 如 `OPENAI_API_KEY`，详见 [pi-ai 环境变量](https://github.com/badlogic/pi-mono/tree/main/packages/ai) |

## 目录结构

| 路径 | 作用 |
|------|------|
| `src/agent-factory.ts` | `createAppAgent()`：组装 `Agent`、系统提示、模型与工具 |
| `src/config/model.ts` | 从环境变量解析 `getModel` |
| `src/tools/` | 工具定义与 `defaultTools` 注册表 |
| `src/cli.ts` | 命令行示例：订阅 `message_update` 流式输出 |
| `src/index.ts` | 库入口，便于在其他模块中 `import` |

## 扩展方式

1. **新工具**：在 `src/tools/` 新增文件，实现 `AgentTool<YourParamsSchema>`，并加入 `src/tools/index.ts` 的 `defaultTools`。
2. **自定义消息类型 / 裁剪上下文**：在 `new Agent({ ... })` 中传入 `convertToLlm`、`transformContext`（参见上游 [agent README](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)）。
3. **代理后端**：使用 `streamFn: streamProxy` 等（同上游文档）。

## 脚本

- `npm run dev` — `tsx` 直接跑 `src/cli.ts`
- `npm run build` — 输出到 `dist/`
- `npm start` — `node dist/cli.js`（需先 `build`）

## 许可

上游 pi-mono 为 MIT；本骨架可按需修改。
