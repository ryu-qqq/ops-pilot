// OPSP-42: 전역 설정 — 지라/노션 인증.
import { settingsViewSchema, type SettingsUpdate, type SettingsView } from "@opspilot/shared-types";
import { apiGet, apiPut } from "../../lib/api-client";

export const settingsKeys = {
  all: ["settings"] as const,
};

export function getSettings(): Promise<SettingsView> {
  return apiGet("/api/settings", settingsViewSchema);
}

export function updateSettings(input: SettingsUpdate): Promise<SettingsView> {
  return apiPut("/api/settings", input, settingsViewSchema);
}
