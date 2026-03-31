import type { AgentTool } from "@mariozechner/pi-agent-core";
import { bashTool } from "./bash.js";

/** 在此注册全部工具，createAppAgent 会挂载到 agent.state.tools */
export const defaultTools: AgentTool<any>[] = [bashTool];
