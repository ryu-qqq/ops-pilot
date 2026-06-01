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
import { AssetLint } from "./asset-lint";
import { AssetList } from "./asset-list";
import { TriggerEvalPanel } from "./trigger-eval-panel";
import { VersionTimeline } from "./version-timeline";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onRunCreated: (runIds: string[]) => void;
  onBenchmarkStarted: (runIds: string[]) => void;
}

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
  const { data: projects } = useProjects();

  const project = (projects ?? []).find((p) => p.id === projectId) ?? null;
  // OPSP-33 (b): 다음 스텝 시각 가이드 — 단계별로 *한 곳*만 펄스.
  const nextStep: "project" | "asset" | "version" | "benchmark" =
    project === null
      ? "project"
      : assetId === null
        ? "asset"
        : versionId === null
          ? "version"
          : "benchmark";
  const pulse = (step: typeof nextStep) =>
    step === nextStep ? "opspilot-next-step" : "";

  const handleSelectAsset = (id: string | null) => {
    setAssetId(id);
    setVersionId(null);
  };

  return (
    <div className="space-y-4">
      <div className={pulse("project")}>
        <ProjectBar
          selectedProjectId={projectId}
          onSelect={(id) => {
            onProjectIdChange(id);
            setAssetId(null);
            setVersionId(null);
          }}
        />
      </div>
      {/* 첫 줄: 자산 패널 + git 버전 타임라인 — 같은 grid row 에서 동일 높이 stretch */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[320px_1fr]">
        <Card className={`flex flex-col p-4 ${pulse("asset")}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              자산 (Claude · Cursor harness)
            </h2>
            {project !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSelectAsset(null)}
                disabled={assetId === null}
                title={
                  assetId === null
                    ? "이미 새 자산 작성 모드입니다"
                    : "선택 해제 → 아래 폼이 새 자산 작성 모드로 전환"
                }
              >
                <Plus className="h-3.5 w-3.5" />
                새로 만들기
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <AssetList
              projectId={projectId}
              selectedId={assetId}
              onSelect={handleSelectAsset}
            />
          </div>
        </Card>
        <Card className={`flex flex-col p-4 ${pulse("version")}`}>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            git 버전 타임라인
          </h2>
          <div className="flex-1 overflow-y-auto">
            <VersionTimeline
              assetId={assetId}
              selectedVersionId={versionId}
              onSelectVersion={setVersionId}
            />
          </div>
        </Card>
      </div>

      {/* 폼·실행 영역 — grid 밖 전체 너비, 시각 흐름 분리 */}
      {project !== null && (
        <AssetAuthor projectId={project.id} selectedAssetId={assetId} />
      )}
      {/* T4-c: 선택 자산 frontmatter 검증 (저작 게이트와 동일 규칙) */}
      {assetId !== null && project !== null && <AssetLint assetId={assetId} />}
      {/* OPSP-34: 자산 선택 시 그 자산의 시나리오 목록·본문·편집·삭제 */}
      {assetId !== null && project !== null && (
        <ScenarioManager assetId={assetId} />
      )}
      {/* T4: 선택 자산이 skill/agent 면 트리거 정확도 평가 패널 */}
      {assetId !== null && project !== null && (
        <TriggerEvalPanel projectId={project.id} assetId={assetId} />
      )}
      {assetId !== null && versionId !== null && project !== null && (
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
          <div className={pulse("benchmark")}>
            <BenchmarkLauncher
              assetId={assetId}
              assetVersionId={versionId}
              onLaunched={onBenchmarkStarted}
            />
          </div>
        </>
      )}
    </div>
  );
}
