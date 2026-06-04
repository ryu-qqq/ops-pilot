import { useEffect } from "react";
import { Badge } from "../../../components/ui/badge";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useRuns } from "../use-run";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  projectId?: string | null;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  succeeded: "success",
  failed: "destructive",
  running: "warning",
  pending: "secondary",
};

export function RunList({ selectedId, onSelect, projectId }: Props) {
  const { data: runs, isPending, isError, error } = useRuns(projectId);

  // 선택 동기화: 목록 로드 완료(로딩/에러 아님) 후 selectedId 가 현재 목록에 없으면
  // 첫 run 으로 교체(목록이 비면 null). 프로젝트 전환으로 생긴 stale 과
  // localStorage 에 남은 죽은 id 를 정리한다. 이미 일치하면 호출하지 않아 깜빡임·루프 방지.
  const synced =
    !isPending && !isError && runs.some((r) => r.id === selectedId);
  useEffect(() => {
    if (isPending || isError) return;
    if (synced) return;
    onSelect(runs[0]?.id ?? null);
  }, [synced, isPending, isError, runs, onSelect]);

  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="실행 목록 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (runs.length === 0)
    return (
      <EmptyState
        title="아직 실행한 적이 없어요"
        hint="레지스트리 탭에서 자산·버전을 고르고 시나리오를 실행하면 여기에 트레이스가 쌓입니다."
      />
    );

  return (
    <ul className="space-y-1">
      {runs.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left transition-colors",
              r.id === selectedId
                ? "border-primary bg-accent"
                : "border-transparent hover:border-border hover:bg-accent/50",
            )}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Badge
                variant={statusVariant[r.status] ?? "secondary"}
                className="shrink-0 px-1.5 py-0 text-[10px]"
              >
                {r.status}
              </Badge>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.assetKind}</span>
              <span className="truncate">{r.assetName}</span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {/* 프로젝트명은 식별 핵심이라 우선 보존(shrink-0), 공간 부족 시 시나리오명이 줄어듦 */}
              <Badge variant="secondary" className="max-w-[140px] shrink-0 truncate px-1.5 py-0 text-[10px]">
                {r.projectName}
              </Badge>
              <span className="truncate min-w-0">{r.scenarioName}</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              <code className="font-mono">{r.gitCommit.slice(0, 8)}</code> · {r.runner}
              {r.promptTokens !== null &&
                ` · ${String(r.promptTokens + (r.completionTokens ?? 0))} tok`}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
