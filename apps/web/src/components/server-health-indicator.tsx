import { Circle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";
import { useServerHealth } from "../lib/use-server-health";

export function ServerHealthIndicator() {
  const { isSuccess, isFetching, isError, data, failureCount } = useServerHealth();
  const online = isSuccess && data.status === "ok";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground"
          aria-live="polite"
          aria-label={online ? "API 서버 연결됨" : "API 서버 연결 안 됨"}
        >
          <Circle
            className={cn(
              "h-2 w-2 fill-current",
              online ? "text-success animate-none" : "text-destructive",
              isFetching && online && "opacity-70",
            )}
          />
          API {online ? "연결됨" : "끊김"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs">
        {online ? (
          <p>
            <span className="font-medium">{data.service}</span>
            <br />
            <span className="text-muted-foreground">:3001 · 15초마다 확인</span>
          </p>
        ) : (
          <p className="space-y-1">
            <span className="font-medium">서버에 연결할 수 없습니다</span>
            <br />
            <code className="text-[11px]">cd apps/server && corepack pnpm dev</code>
            {failureCount > 0 && (
              <>
                <br />
                <span className="text-muted-foreground">실패 {String(failureCount)}회</span>
              </>
            )}
            {isError && <span className="block text-muted-foreground">피드백·실행 탭 API 호출 불가</span>}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
