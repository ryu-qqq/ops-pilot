import type { SettingsUpdate, SettingsView } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";

// OPSP-42: 전역 설정 — key-value 테이블 위에 구조화 뷰를 얹는다.
// 토큰은 write-only: 조회는 설정 여부만, 갱신은 새 값이 있을 때만 교체.

const nowIso = () => new Date().toISOString();

const SETTING_KEYS = {
  jiraSiteUrl: "jira.siteUrl",
  jiraEmail: "jira.email",
  jiraApiToken: "jira.apiToken",
  notionToken: "notion.token",
} as const;

function getRaw(key: string): string {
  const row = getDb().prepare("SELECT value FROM setting WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

function setRaw(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO setting (key, value, updated_at) VALUES (@key, @value, @now)
       ON CONFLICT (key) DO UPDATE SET value = @value, updated_at = @now`,
    )
    .run({ key, value, now: nowIso() });
}

export function getSettingsView(): SettingsView {
  return {
    jira: {
      siteUrl: getRaw(SETTING_KEYS.jiraSiteUrl),
      email: getRaw(SETTING_KEYS.jiraEmail),
      apiTokenSet: getRaw(SETTING_KEYS.jiraApiToken) !== "",
    },
    notion: {
      tokenSet: getRaw(SETTING_KEYS.notionToken) !== "",
    },
  };
}

export function updateSettings(input: SettingsUpdate): SettingsView {
  setRaw(SETTING_KEYS.jiraSiteUrl, input.jira.siteUrl);
  setRaw(SETTING_KEYS.jiraEmail, input.jira.email);
  // 토큰은 새 값이 들어왔을 때만 교체 — 빈값/미지정이면 기존 유지(write-only).
  if (input.jira.apiToken !== undefined && input.jira.apiToken !== "") {
    setRaw(SETTING_KEYS.jiraApiToken, input.jira.apiToken);
  }
  if (input.notion.token !== undefined && input.notion.token !== "") {
    setRaw(SETTING_KEYS.notionToken, input.notion.token);
  }
  return getSettingsView();
}

/** 내부용 — 지라/노션 REST 호출 시 평문 인증값 조회 (후속 import 작업에서 사용). */
export function getJiraCredentials(): { siteUrl: string; email: string; apiToken: string } {
  return {
    siteUrl: getRaw(SETTING_KEYS.jiraSiteUrl),
    email: getRaw(SETTING_KEYS.jiraEmail),
    apiToken: getRaw(SETTING_KEYS.jiraApiToken),
  };
}

export function getNotionToken(): string {
  return getRaw(SETTING_KEYS.notionToken);
}
