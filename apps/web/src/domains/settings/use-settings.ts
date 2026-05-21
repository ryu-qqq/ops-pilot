import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, settingsKeys, updateSettings } from "./api";

// OPSP-42: 전역 설정 조회·갱신.
export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: getSettings });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
