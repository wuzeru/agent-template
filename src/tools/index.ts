import type { AgentTool } from "@mariozechner/pi-agent-core";
import { echoTool } from "./echo.js";

/** 在此注册全部工具，createAppAgent 会挂载到 agent.state.tools */
export const defaultTools: AgentTool<any>[] = [echoTool];
