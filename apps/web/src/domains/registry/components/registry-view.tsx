import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { AssetAuthor } from "../../authoring/components/asset-author";
import { AssetDetailPanel } from "./asset-detail-panel";
import { AssetHealthDashboard } from "./asset-health-dashboard";
import { UsageLeaderboard } from "./usage-leaderboard";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onRunCreated: (runIds: string[]) => void;
  onBenchmarkStarted: (runIds: string[]) => void;
}

// T5: "프로젝트" 탭 = 평가·사용량·prune 허브.
// (1) 상단 전역 리더보드(프로젝트 무관, 최근 N일 Top 5)
// (2) 프로젝트 선택 → Toolkit 표(쓰임·형식·prune) | 선택 자산 상세(오른쪽 패널, master-detail)
// 저작은 후순위 — "+새 자산" 토글. 보통 터미널/agent-crew creator 로 만들어 커밋·자동 등록.
export function RegistryView({
  projectId,
  onProjectIdChange,
  onRunCreated,
  onBenchmarkStarted,
}: Props) {
  const [assetId, setAssetId] = usePersistedState<string | null>(
    "opspilot.registry.assetId",
    null,
  );
  const [versionId, setVersionId] = usePersistedState<string | null>(
    "opspilot.registry.versionId",
    null,
  );
  const [showAuthor, setShowAuthor] = useState(false);
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === projectId) ?? null;

  const handleSelectAsset = (id: string | null) => {
    setAssetId(id);
    setVersionId(null);
  };

  return (
    <div className="space-y-4">
      {/* (1) 전역 사용량 리더보드 */}
      <UsageLeaderboard />

      {/* (2) 프로젝트 선택 */}
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          onProjectIdChange(id);
          setAssetId(null);
          setVersionId(null);
        }}
      />

      {/* master-detail: Toolkit 표 | 선택 자산 상세 */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_minmax(360px,44%)]">
        <Card className="p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Toolkit</h2>
              <p className="text-xs text-muted-foreground">
                이 프로젝트의 에이전트·스킬. 행을 클릭하면 오른쪽에 상세가
                뜹니다.
              </p>
            </div>
            {project !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAuthor((v) => !v)}
                title="보통 터미널/creator 로 만들지만 여기서 직접 작성·편집도 가능"
              >
                <Plus className="h-3.5 w-3.5" />
                {assetId === null ? "새 자산" : "편집/새 자산"}
              </Button>
            )}
          </div>
          <AssetHealthDashboard
            projectId={projectId}
            selectedId={assetId}
            onSelect={handleSelectAsset}
          />
        </Card>

        <div className="lg:sticky lg:top-4">
          {assetId !== null && project !== null ? (
            <AssetDetailPanel
              projectId={project.id}
              assetId={assetId}
              versionId={versionId}
              onSelectVersion={setVersionId}
              onRunCreated={onRunCreated}
              onBenchmarkStarted={onBenchmarkStarted}
            />
          ) : (
            <Card className="flex h-40 items-center justify-center p-4 text-center text-sm text-muted-foreground">
              왼쪽에서 자산을 클릭하면
              <br />
              버전·형식·시나리오·트리거 평가가 여기 표시됩니다.
            </Card>
          )}
        </div>
      </div>

      {/* 저작 (후순위 — 접힘) */}
      {showAuthor && project !== null && (
        <AssetAuthor projectId={project.id} selectedAssetId={assetId} />
      )}
    </div>
  );
}
