import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../registry/api";
import { adoptVersion } from "./api";

// OPSP-45: 과거 버전 채택 → 새 latest. registry 전체 무효화로 버전 타임라인 갱신.
// (자산 저작/편집 훅은 제거됨 — 저작은 터미널/agent-crew harness-creator 담당.)
export function useAdoptVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adoptVersion,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: registryKeys.all });
    },
  });
}
