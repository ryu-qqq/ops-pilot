import { useQuery } from "@tanstack/react-query";
import { dashboardKeys, getStatsOverview } from "./api";

// OPSP-35: 대시보드 — 진행 중 run 이 있으면 2초 폴링, 없으면 멈춤.
export function useStatsOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: getStatsOverview,
    // 진행 중 run 또는 진행 중 AI 분석이 있으면 폴링.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.runs.running > 0 || d.runningAnalyses > 0) ? 2000 : false;
    },
  });
}
