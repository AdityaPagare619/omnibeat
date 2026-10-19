/**
 * Contract bindings to @omnibeat/schemas.
 *
 * The schemas package exports the eight tool objects (each carrying its Zod
 * inputSchema/outputSchema) but not per-tool type aliases, so we derive them
 * here with z.infer. Everything still comes from the single source of truth -
 * nothing is redeclared.
 */
import { toolDefinitions } from "@omnibeat/schemas";
import type { z } from "zod";

export const tools = toolDefinitions;

// music_resolve_request
export const musicResolveRequestInputSchema = toolDefinitions.music_resolve_request.inputSchema;
export const musicResolveRequestOutputSchema = toolDefinitions.music_resolve_request.outputSchema;
export type MusicResolveRequestInput = z.infer<typeof toolDefinitions.music_resolve_request.inputSchema>;
export type MusicResolveRequestOutput = z.infer<typeof toolDefinitions.music_resolve_request.outputSchema>;

// music_preview_hooks
export const musicPreviewHooksInputSchema = toolDefinitions.music_preview_hooks.inputSchema;
export const musicPreviewHooksOutputSchema = toolDefinitions.music_preview_hooks.outputSchema;
export type MusicPreviewHooksInput = z.infer<typeof toolDefinitions.music_preview_hooks.inputSchema>;
export type MusicPreviewHooksOutput = z.infer<typeof toolDefinitions.music_preview_hooks.outputSchema>;

// music_confirm_selection
export const musicConfirmSelectionInputSchema = toolDefinitions.music_confirm_selection.inputSchema;
export const musicConfirmSelectionOutputSchema = toolDefinitions.music_confirm_selection.outputSchema;
export type MusicConfirmSelectionInput = z.infer<typeof toolDefinitions.music_confirm_selection.inputSchema>;
export type MusicConfirmSelectionOutput = z.infer<typeof toolDefinitions.music_confirm_selection.outputSchema>;

// music_explain_last_action
export const musicExplainLastActionInputSchema = toolDefinitions.music_explain_last_action.inputSchema;
export const musicExplainLastActionOutputSchema = toolDefinitions.music_explain_last_action.outputSchema;
export type MusicExplainLastActionInput = z.infer<typeof toolDefinitions.music_explain_last_action.inputSchema>;
export type MusicExplainLastActionOutput = z.infer<typeof toolDefinitions.music_explain_last_action.outputSchema>;

// session_set_response_style
export const sessionSetResponseStyleInputSchema = toolDefinitions.session_set_response_style.inputSchema;
export const sessionSetResponseStyleOutputSchema = toolDefinitions.session_set_response_style.outputSchema;
export type SessionSetResponseStyleInput = z.infer<typeof toolDefinitions.session_set_response_style.inputSchema>;
export type SessionSetResponseStyleOutput = z.infer<typeof toolDefinitions.session_set_response_style.outputSchema>;

// music_plan_offline_cache
export const musicPlanOfflineCacheInputSchema = toolDefinitions.music_plan_offline_cache.inputSchema;
export const musicPlanOfflineCacheOutputSchema = toolDefinitions.music_plan_offline_cache.outputSchema;
export type MusicPlanOfflineCacheInput = z.infer<typeof toolDefinitions.music_plan_offline_cache.inputSchema>;
export type MusicPlanOfflineCacheOutput = z.infer<typeof toolDefinitions.music_plan_offline_cache.outputSchema>;

// account_link_music_service
export const accountLinkMusicServiceInputSchema = toolDefinitions.account_link_music_service.inputSchema;
export const accountLinkMusicServiceOutputSchema = toolDefinitions.account_link_music_service.outputSchema;
export type AccountLinkMusicServiceInput = z.infer<typeof toolDefinitions.account_link_music_service.inputSchema>;

// privacy_forget_my_data
export const privacyForgetMyDataInputSchema = toolDefinitions.privacy_forget_my_data.inputSchema;
export const privacyForgetMyDataOutputSchema = toolDefinitions.privacy_forget_my_data.outputSchema;
export type PrivacyForgetMyDataInput = z.infer<typeof toolDefinitions.privacy_forget_my_data.inputSchema>;
export type PrivacyForgetMyDataOutput = z.infer<typeof toolDefinitions.privacy_forget_my_data.outputSchema>;
