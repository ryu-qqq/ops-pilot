import { Badge } from "../../../components/ui/badge";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useRuns } from "../use-run";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
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
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={statusVariant[r.status] ?? "secondary"} className="px-1.5 py-0 text-[10px]">
                {r.status}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{r.assetKind}</span>
              <span className="truncate">{r.assetName}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {r.projectName}
              </Badge>
              <span className="truncate">{r.scenarioName}</span>
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
