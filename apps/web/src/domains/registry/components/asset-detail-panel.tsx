import { useEffect, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { EmptyState } from "../../../lib/ui";
import { BenchmarkLauncher } from "../../run/components/benchmark-launcher";
import { RegressionLauncher } from "../../run/components/regression-launcher";
import { RunLauncher } from "../../run/components/run-launcher";
import { ScenarioManager } from "../../run/components/scenario-manager";
import { useAssets } from "../use-registry";
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

const KIND_LABEL: Record<string, string> = {
  agent: "agent",
  skill: "skill",
  command: "command",
  cursor_skill: "cursor·skill",
  cursor_command: "cursor·cmd",
  cursor_rule: "cursor·rule",
};

type DetailTab = "version" | "format" | "trigger" | "scenario" | "run";

// T5: 선택한 자산의 상세 — master-detail 의 오른쪽 패널.
// 세로 스택 대신 탭으로 분리(버전·형식·트리거 정확도·시나리오·실행).
// 파괴적 액션(prune)은 헤더 영역에 분리해 오클릭 방지.
export function AssetDetailPanel({
  projectId,
  assetId,
  versionId,
  onSelectVersion,
  onRunCreated,
  onBenchmarkStarted,
  onDeleted,
}: Props) {
  const { data: assets } = useAssets(projectId);
  const asset = (assets ?? []).find((a) => a.id === assetId) ?? null;

  const [tab, setTab] = useState<DetailTab>("version");
  // 자산이 바뀌면 기본 탭(버전)으로 리셋.
  useEffect(() => {
    setTab("version");
  }, [assetId]);

  return (
    <div className="space-y-3">
      {/* 상세 헤더: kind 배지 + 이름. 파괴적 액션(prune)은 버전 탭 하단에 분리. */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {asset ? (KIND_LABEL[asset.kind] ?? asset.kind) : "자산"}
        </Badge>
        <h2 className="text-sm font-semibold">{asset?.name ?? "…"}</h2>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="space-y-3">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="version">버전</TabsTrigger>
          <TabsTrigger value="format">형식</TabsTrigger>
          <TabsTrigger value="trigger">트리거 정확도</TabsTrigger>
          <TabsTrigger value="scenario">시나리오</TabsTrigger>
          <TabsTrigger value="run">실행</TabsTrigger>
        </TabsList>

        <TabsContent value="version" className="mt-0 space-y-3">
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              git 버전 타임라인
            </h3>
            <VersionTimeline
              assetId={assetId}
              selectedVersionId={versionId}
              onSelectVersion={onSelectVersion}
            />
          </Card>
          {/* 파괴적 액션은 버전 탭 하단, 다른 액션과 시각적으로 분리. */}
          <AssetPruneSection
            projectId={projectId}
            assetId={assetId}
            onDeleted={onDeleted}
          />
        </TabsContent>

        <TabsContent value="format" className="mt-0">
          <AssetLint assetId={assetId} />
        </TabsContent>

        <TabsContent value="trigger" className="mt-0">
          <TriggerEvalPanel projectId={projectId} assetId={assetId} />
        </TabsContent>

        <TabsContent value="scenario" className="mt-0">
          <ScenarioManager assetId={assetId} />
        </TabsContent>

        <TabsContent value="run" className="mt-0 space-y-3">
          {versionId !== null ? (
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
          ) : (
            <EmptyState
              title="버전을 먼저 선택하세요"
              hint="‘버전’ 탭에서 git 버전을 선택하면 실행·회귀·벤치마크를 띄울 수 있습니다."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
