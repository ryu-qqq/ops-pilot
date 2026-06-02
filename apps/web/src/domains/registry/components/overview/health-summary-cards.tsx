import { useMemo } from "react";
import { EmptyState, ErrorNotice, Loading } from "../../../../lib/ui";
import { computeAssetHealthSummary } from "../../asset-health-summary";
import {
  useAssets,
  useProjectAssetLint,
  useProjectAssetUsage,
} from "../../use-registry";
import { StatCard } from "./stat-card";

// 개요 (4) 헬스 요약 — 이 프로젝트. 4 stat 카드만(풀 테이블은 프로젝트 탭).
// 헬스 대시보드와 같은 computeAssetHealthSummary 사용(수치 일치 보장).
interface Props {
  projectId: string | null;
}

export function HealthSummaryCards({ projectId }: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const { data: usage } = useProjectAssetUsage(projectId);
  const { data: lint } = useProjectAssetLint(projectId);

  const summary = useMemo(
    () => computeAssetHealthSummary(assets, usage, lint),
    [assets, usage, lint],
  );

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 고르면 미사용·형식 헬스가 보여요"
        hint="위 선택에서 프로젝트를 고르면 prune 후보·형식 오류를 한눈에 봅니다."
      />
    );
  if (isPending) return <Loading label="자산 헬스 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (assets.length === 0)
    return (
      <EmptyState
        title="아직 자산이 없어요"
        hint="터미널/creator 로 .claude 에 만들고 커밋하면 자동 등록됩니다."
      />
    );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard
        label="자산"
        value={summary.total}
        title="이 프로젝트에 등록된 전체 자산 수"
      />
      <StatCard
        label="미사용"
        value={summary.unused}
        tone="warn"
        title="어디서도 호출된 적 없음 (prune 후보)"
      />
      <StatCard
        label="다른 곳만"
        value={summary.otherOnly}
        title="이 프로젝트에선 안 쓰지만 다른 곳에서 쓰임 (공용 crew 자산)"
      />
      <StatCard
        label="형식 오류"
        value={summary.formatErrors}
        tone="danger"
        title="frontmatter 형식 오류 — 자동 발화가 안 됨"
      />
    </div>
  );
}
