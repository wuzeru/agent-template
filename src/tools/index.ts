import type { AgentTool } from "@mariozechner/pi-agent-core";
import { bashTool } from "./bash.js";

/** bash 等底层工具；完整列表由 createAppAgent 根据 skills/ 追加 load_skill。 */
export const defaultTools: AgentTool<any>[] = [bashTool];

export { createCompactTool } from "./compact.js";
export { createLoadSkillTool } from "./load-skill.js";
