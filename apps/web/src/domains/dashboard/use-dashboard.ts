import { useQuery } from "@tanstack/react-query";
import { dashboardKeys, getStatsOverview } from "./api";

// OPSP-35: 대시보드 — 진행 중 run 이 있으면 2초 폴링, 없으면 멈춤.
export function useStatsOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: getStatsOverview,
    refetchInterval: (q) => (q.state.data?.runs.running ? 2000 : false),
  });
}
