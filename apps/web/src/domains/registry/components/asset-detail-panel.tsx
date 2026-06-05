import { useEffect, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { EmptyState, Loading } from "../../../lib/ui";
import { BenchmarkLauncher } from "../../run/components/benchmark-launcher";
import { RegressionLauncher } from "../../run/components/regression-launcher";
import { RunLauncher } from "../../run/components/run-launcher";
import { ScenarioManager } from "../../run/components/scenario-manager";
import { Markdown } from "../../../lib/markdown";
import {
  useAssetLint,
  useAssets,
  useAssetVersions,
  useVersionContent,
} from "../use-registry";
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

type DetailTab = "version" | "trigger" | "scenario";

// 버전 탭 상단 형식 요약 배지 — 형식 *상세*는 트리거 탭에 두고, 여기선 카운트만.
// 형식 데이터(useAssetLint)에서 error/warning 카운트만 뽑아 인라인 배지로 렌더.
function FormatSummaryBadge({ assetId }: { assetId: string }) {
  const { data } = useAssetLint(assetId);
  if (!data) return null;

  const errors = data.issues.filter((i) => i.severity === "error").length;
  const warnings = data.issues.filter((i) => i.severity === "warning").length;

  if (data.ok && warnings === 0) {
    return (
      <Badge variant="success" className="text-[10px]">
        형식 통과
      </Badge>
    );
  }
  return (
    <>
      {errors > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          형식 error {errors}
        </Badge>
      )}
      {warnings > 0 && (
        <Badge variant="warning" className="text-[10px]">
          형식 warning {warnings}
        </Badge>
      )}
    </>
  );
}

// 선택 버전의 마크다운 본문 — 길 수 있어 높이 제한 + 스크롤. 본문 없으면 안내.
function AssetBody({
  assetId,
  versionId,
}: {
  assetId: string;
  versionId: string | null;
}) {
  const { data, isPending } = useVersionContent(assetId, versionId);
  if (versionId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        버전이 없습니다 — 본문을 표시할 수 없어요.
      </p>
    );
  }
  if (isPending) return <Loading label="본문 불러오는 중…" />;
  if (data == null || data.trim() === "") {
    return <p className="text-xs text-muted-foreground">본문이 비어 있습니다.</p>;
  }
  return (
    <div className="max-h-[520px] overflow-auto rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <Markdown>{data}</Markdown>
    </div>
  );
}

// T5: 선택한 자산의 상세 — master-detail 의 오른쪽 패널.
// 3탭: 버전(+형식 요약·prune) / 트리거(형식 상세+트리거 정확도) / 시나리오·실행.
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
  // 자산이 "뭘 하는지" — frontmatter description. 형식이 깨지면 null 로 와서 안내로 대체.
  const { data: lint } = useAssetLint(assetId);

  // 실행 버전 게이트 대체: 선택 버전이 없으면 최신 버전으로 fallback.
  // getVersions 는 committed_at DESC 정렬(repository.ts) → versions[0] = 최신.
  const { data: versions } = useAssetVersions(assetId);
  const latestVersionId = versions?.[0]?.id ?? null;
  const effectiveVersionId = versionId ?? latestVersionId;

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

      {/* 이 자산이 뭘 하는지 — frontmatter description 한 줄. 목록엔 안 보이니 상세에서 노출. */}
      {asset != null && lint != null && (
        <p
          className="text-xs leading-relaxed text-muted-foreground"
          data-tour="asset-description">
          {lint.description != null && lint.description !== "" ? (
            lint.description
          ) : lint.ok ? (
            <span className="italic">frontmatter 에 description 이 없습니다.</span>
          ) : (
            <span className="italic text-amber-600 dark:text-amber-400">
              형식 오류로 설명을 못 읽습니다 — 트리거 탭에서 확인하세요.
            </span>
          )}
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="space-y-3">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="version">버전</TabsTrigger>
          <TabsTrigger value="trigger" data-tour="asset-trigger-tab">
            트리거
          </TabsTrigger>
          <TabsTrigger value="scenario">시나리오 · 실행</TabsTrigger>
        </TabsList>

        {/* ① 버전 — 타임라인 + 형식 요약 배지(상세는 트리거 탭) + prune. */}
        <TabsContent value="version" className="mt-0 space-y-3">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground">
                git 버전 타임라인
              </h3>
              <FormatSummaryBadge assetId={assetId} />
            </div>
            <VersionTimeline
              assetId={assetId}
              selectedVersionId={versionId}
              onSelectVersion={onSelectVersion}
            />
          </Card>
          {/* 선택 버전의 본문(마크다운). frontmatter 는 위 description 으로 이미 보여줌. */}
          <Card className="p-4" data-tour="asset-body">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              본문
            </h3>
            <AssetBody assetId={assetId} versionId={effectiveVersionId} />
          </Card>

          {/* 파괴적 액션은 버전 탭 하단, 다른 액션과 시각적으로 분리. */}
          <div data-tour="asset-prune">
            <AssetPruneSection
              projectId={projectId}
              assetId={assetId}
              onDeleted={onDeleted}
            />
          </div>
        </TabsContent>

        {/* ② 트리거 — 형식 lint 상세 + 트리거 정확도(둘 다 description 품질 맥락). */}
        <TabsContent value="trigger" className="mt-0 space-y-3">
          <AssetLint assetId={assetId} />
          <TriggerEvalPanel projectId={projectId} assetId={assetId} />
        </TabsContent>

        {/* ③ 시나리오 · 실행 — 시나리오 관리 + 실행/회귀/벤치마크. */}
        <TabsContent value="scenario" className="mt-0 space-y-3">
          <ScenarioManager assetId={assetId} />
          {effectiveVersionId !== null ? (
            <>
              <RunLauncher
                assetId={assetId}
                assetVersionId={effectiveVersionId}
                onLaunched={onRunCreated}
                onBenchmark={onBenchmarkStarted}
              />
              <RegressionLauncher
                assetId={assetId}
                assetVersionId={effectiveVersionId}
                onLaunched={onRunCreated}
              />
              <BenchmarkLauncher
                assetId={assetId}
                assetVersionId={effectiveVersionId}
                onLaunched={onBenchmarkStarted}
              />
            </>
          ) : (
            <EmptyState
              title="버전이 없습니다"
              hint="이 자산을 수정·저장하면 첫 버전이 생성되고, 실행·회귀·벤치마크를 띄울 수 있습니다."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
