import { GitCommit } from "lucide-react";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useAssetVersions } from "../use-registry";

interface Props {
  assetId: string | null;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
}

// 자산별 git 버전 타임라인 (커밋 = 버전의 단일 원천). 좌측 점·선·메타 정렬.
export function VersionTimeline({ assetId, selectedVersionId, onSelectVersion }: Props) {
  const { data: versions, isPending, isError, error } = useAssetVersions(assetId);

  if (assetId === null)
    return (
      <EmptyState
        title="자산을 선택하세요"
        hint="왼쪽 목록에서 자산을 고르면 git 커밋 기반 버전 타임라인이 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="버전 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (versions.length === 0)
    return <EmptyState title="버전이 없어요" hint="이 자산을 수정·저장하면 첫 버전이 생성됩니다." />;

  return (
    <ol className="relative ml-3 space-y-1 border-l border-border">
      {versions.map((v, i) => {
        const selected = v.id === selectedVersionId;
        return (
          <li key={v.id} className="relative pl-5">
            {/* 점(dot) — 선택 시 primary, 아니면 muted */}
            <span
              className={cn(
                "absolute -left-[7px] top-3 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-background",
                selected ? "bg-primary" : "bg-border",
              )}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => onSelectVersion(v.id)}
              className={cn(
                "block w-full rounded-md px-3 py-2 text-left transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <div className="flex items-center gap-2 text-xs">
                <GitCommit className="h-3 w-3 text-muted-foreground" />
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {v.gitCommit.slice(0, 8)}
                </code>
                <span className="text-muted-foreground">{v.committedAt.slice(0, 10)}</span>
                {i === 0 && (
                  <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    latest
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm leading-snug">
                {v.commitMessage ?? "(메시지 없음)"}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
