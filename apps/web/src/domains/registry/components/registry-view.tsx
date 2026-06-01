import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { AssetAuthor } from "../../authoring/components/asset-author";
import { BenchmarkLauncher } from "../../run/components/benchmark-launcher";
import { RegressionLauncher } from "../../run/components/regression-launcher";
import { RunLauncher } from "../../run/components/run-launcher";
import { ScenarioManager } from "../../run/components/scenario-manager";
import { AssetHealthDashboard } from "./asset-health-dashboard";
import { AssetLint } from "./asset-lint";
import { TriggerEvalPanel } from "./trigger-eval-panel";
import { VersionTimeline } from "./version-timeline";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onRunCreated: (runIds: string[]) => void;
  onBenchmarkStarted: (runIds: string[]) => void;
}

// T5: "프로젝트" 탭을 자산 헬스(쓰임·검증·prune) 대시보드 중심으로 재편.
// 저작은 후순위(접힘) — 보통 터미널/agent-crew creator 로 만들어 커밋·자동 등록.
// 행을 고르면 아래에 상세(버전·검증·시나리오·트리거 평가·실행)가 펼쳐진다.
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
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          onProjectIdChange(id);
          setAssetId(null);
          setVersionId(null);
        }}
      />

      {/* 허브: 자산 헬스 대시보드 */}
      <Card className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">자산 헬스</h2>
            <p className="text-xs text-muted-foreground">
              쓰임·검증·prune 한눈에. 행을 클릭하면 아래에서
              버전·평가·시나리오가 펼쳐집니다.
            </p>
          </div>
          {project !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAuthor((v) => !v)}
              title="보통 터미널/creator 로 만들지만, 여기서 직접 작성·편집할 수도 있습니다"
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

      {/* 저작 (후순위 — 접힘) */}
      {showAuthor && project !== null && (
        <AssetAuthor projectId={project.id} selectedAssetId={assetId} />
      )}

      {/* 선택 자산 상세 */}
      {assetId !== null && project !== null && (
        <>
          <AssetLint assetId={assetId} />
          <Card className="flex flex-col p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              git 버전 타임라인
            </h2>
            <VersionTimeline
              assetId={assetId}
              selectedVersionId={versionId}
              onSelectVersion={setVersionId}
            />
          </Card>
          <ScenarioManager assetId={assetId} />
          <TriggerEvalPanel projectId={project.id} assetId={assetId} />
          {versionId !== null && (
            <>
              <RunLauncher
                assetId={assetId}
                assetVersionId={versionId}
                onLaunched={onRunCreated}
              />
              <RegressionLauncher
                assetId={assetId}
                assetVersionId={versionId}
                onLaunched={onRunCreated}
              />
              <BenchmarkLauncher
                assetId={assetId}
                assetVersionId={versionId}
                onLaunched={onBenchmarkStarted}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
