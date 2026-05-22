import { useQuery } from "@tanstack/react-query";
import { type DashboardPeriod, dashboardKeys, getStatsOverview } from "./api";

// OPSP-35: 대시보드 — 진행 중 run 이 있으면 2초 폴링, 없으면 멈춤.
// OPSP-47: 기간(period)별로 쿼리 캐시를 분리한다.
export function useStatsOverview(period: DashboardPeriod) {
  return useQuery({
    queryKey: dashboardKeys.overview(period),
    queryFn: () => getStatsOverview(period),
    // 진행 중 run 또는 진행 중 AI 분석이 있으면 폴링.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.runs.running > 0 || d.runningAnalyses > 0) ? 2000 : false;
    },
  });
}
