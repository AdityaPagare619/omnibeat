/**
 * Tool registry — blueprint §5.2 (7 tools) + the privacy tool as the eighth
 * (§5.2 final paragraph: "Counted as the eighth tool").
 *
 * Registry order is blueprint order: the §5.2 table rows 1..7, then privacy.
 * Every entry carries name, title, description (written for an LLM: what it
 * does, when to use it, when not to), annotations, inputSchema, outputSchema —
 * exactly what tools/list must serve (AC-03).
 */
import { accountLinkMusicServiceTool } from "./account_link_music_service.js";
import { musicConfirmSelectionTool } from "./music_confirm_selection.js";
import { musicExplainLastActionTool } from "./music_explain_last_action.js";
import { musicPlanOfflineCacheTool } from "./music_plan_offline_cache.js";
import { musicPreviewHooksTool } from "./music_preview_hooks.js";
import { musicResolveRequestTool } from "./music_resolve_request.js";
import { privacyForgetMyDataTool } from "./privacy_forget_my_data.js";
import { sessionSetResponseStyleTool } from "./session_set_response_style.js";

export {
  accountLinkMusicServiceTool,
  musicConfirmSelectionTool,
  musicExplainLastActionTool,
  musicPlanOfflineCacheTool,
  musicPreviewHooksTool,
  musicResolveRequestTool,
  privacyForgetMyDataTool,
  sessionSetResponseStyleTool,
};

export const toolDefinitions = {
  music_resolve_request: musicResolveRequestTool,
  music_preview_hooks: musicPreviewHooksTool,
  music_confirm_selection: musicConfirmSelectionTool,
  music_explain_last_action: musicExplainLastActionTool,
  session_set_response_style: sessionSetResponseStyleTool,
  music_plan_offline_cache: musicPlanOfflineCacheTool,
  account_link_music_service: accountLinkMusicServiceTool,
  privacy_forget_my_data: privacyForgetMyDataTool,
} as const;

export type ToolName = keyof typeof toolDefinitions;

export const toolNames = [
  "music_resolve_request",
  "music_preview_hooks",
  "music_confirm_selection",
  "music_explain_last_action",
  "session_set_response_style",
  "music_plan_offline_cache",
  "account_link_music_service",
  "privacy_forget_my_data",
] as const satisfies readonly ToolName[];

/** Runtime check that registry keys and declared order agree. */
export function assertRegistryConsistent(): void {
  const keys = Object.keys(toolDefinitions);
  if (keys.length !== toolNames.length) {
    throw new Error(
      `toolDefinitions has ${keys.length} entries but toolNames declares ${toolNames.length}`,
    );
  }
  for (const name of toolNames) {
    if (!(name in toolDefinitions)) {
      throw new Error(`toolNames declares missing tool: ${name}`);
    }
    if (toolDefinitions[name].name !== name) {
      throw new Error(
        `toolDefinitions key ${name} does not match its tool.name ${toolDefinitions[name].name}`,
      );
    }
  }
}
