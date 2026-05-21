import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getJiraIssue,
  getJiraIssues,
  getNotionPage,
  getNotionPages,
  integrationKeys,
} from "./api";

// OPSP-43: 지라/노션 → 시나리오 import.
// 목록은 useQuery(검색 트리거 시 enabled), 상세는 useMutation(목록에서 1건 선택 = 사용자 액션).
// 외부 API 인증 실패는 재시도 무의미 — retry: false.

export function useJiraIssues(projectKey: string, enabled: boolean) {
  return useQuery({
    queryKey: integrationKeys.jiraIssues(projectKey),
    queryFn: () => getJiraIssues(projectKey),
    enabled,
    retry: false,
  });
}

export function useNotionPages(query: string, enabled: boolean) {
  return useQuery({
    queryKey: integrationKeys.notionPages(query),
    queryFn: () => getNotionPages(query),
    enabled,
    retry: false,
  });
}

export function useImportJiraIssue() {
  return useMutation({ mutationFn: getJiraIssue });
}

export function useImportNotionPage() {
  return useMutation({ mutationFn: getNotionPage });
}
