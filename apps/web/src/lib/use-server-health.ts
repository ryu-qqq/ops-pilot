import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema } from "@opspilot/shared-types";
import { apiGet } from "./api-client";

export const serverHealthKey = ["server", "health"] as const;

export function useServerHealth() {
  return useQuery({
    queryKey: serverHealthKey,
    queryFn: () => apiGet("/api/health", healthResponseSchema),
    refetchInterval: 15_000,
    retry: false,
    staleTime: 10_000,
  });
}
