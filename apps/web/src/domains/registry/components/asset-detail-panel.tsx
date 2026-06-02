import { Card } from "../../../components/ui/card";
import { BenchmarkLauncher } from "../../run/components/benchmark-launcher";
import { RegressionLauncher } from "../../run/components/regression-launcher";
import { RunLauncher } from "../../run/components/run-launcher";
import { ScenarioManager } from "../../run/components/scenario-manager";
import { AssetLint } from "./asset-lint";
import { AssetPruneSection } from "./asset-prune-section";
import { TriggerEvalPanel } from "./trigger-eval-panel";
import { VersionTimeline } from "./version-timeline";

interface Props {
  projectId: string;
  assetId: string;
  versionId: string | null;
  onSelectVersion: (id: string | null) => void;
  onRunCreated: (runIds: string[]) => void;
  onBenchmarkStarted: (runIds: string[]) => void;
  // 카드 C(prune): 삭제 성공 시 부모가 선택을 해제(패널 닫힘).
  onDeleted: () => void;
}

// T5: 선택한 자산의 상세 — master-detail 의 오른쪽 패널.
// 표에서 100개를 스크롤하지 않게, 상세는 한 자산만 여기 모아 보여준다.
export function AssetDetailPanel({
  projectId,
  assetId,
  versionId,
  onSelectVersion,
  onRunCreated,
  onBenchmarkStarted,
  onDeleted,
}: Props) {
  return (
    <div className="space-y-3">
      <AssetLint assetId={assetId} />
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          git 버전 타임라인
        </h2>
        <VersionTimeline
          assetId={assetId}
          selectedVersionId={versionId}
          onSelectVersion={onSelectVersion}
        />
      </Card>
      <TriggerEvalPanel projectId={projectId} assetId={assetId} />
      <ScenarioManager assetId={assetId} />
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
      {/* 파괴적 액션은 맨 아래, 다른 액션과 시각적으로 분리. */}
      <AssetPruneSection
        projectId={projectId}
        assetId={assetId}
        onDeleted={onDeleted}
      />
    </div>
  );
}
