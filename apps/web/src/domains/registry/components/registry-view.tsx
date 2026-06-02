import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ProjectBar } from "../../project/components/project-bar";
import { ProjectRegisterDialog } from "../../project/components/project-register-dialog";
import { useProjects } from "../../project/use-project";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { EmptyState } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { AssetAuthor } from "../../authoring/components/asset-author";
import { AssetDetailPanel } from "./asset-detail-panel";
import { AssetToolkit } from "./asset-toolkit";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onRunCreated: (runIds: string[]) => void;
  onBenchmarkStarted: (runIds: string[]) => void;
}

// "프로젝트" 탭 = Harness 자산 등록·저작·실행·채택 허브.
// 전역 리더보드는 개요 탭에 있어 여기선 제거(중복 방지). 컴팩트 툴바(ProjectBar) +
// 프로젝트 선택 시 master-detail(좌 헬스 표 | 우 넓은 상세 패널).
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
  const [registerOpen, setRegisterOpen] = useState(false);
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === projectId) ?? null;

  const handleSelectProject = (id: string) => {
    onProjectIdChange(id);
    setAssetId(null);
    setVersionId(null);
  };

  const handleSelectAsset = (id: string | null) => {
    setAssetId(id);
    setVersionId(null);
  };

  return (
    <div className="space-y-4">
      {/* 컴팩트 툴바: 프로젝트 선택 + 스캔·작업 신호 스캔·훅 설치 + 등록 */}
      <ProjectBar selectedProjectId={projectId} onSelect={handleSelectProject} />

      {project === null ? (
        <EmptyState
          title="프로젝트를 선택하거나 등록하세요"
          hint="상단에서 프로젝트를 고르면 자산 헬스(쓰임·형식·prune)와 상세가 여기 표시됩니다."
        >
          <div className="mt-3">
            <Button type="button" size="sm" onClick={() => setRegisterOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              프로젝트 등록
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* master-detail: 미선택이면 목록 풀폭(이름 안 잘림), 선택 시에만 2분할(좌 목록 | 우 넓은 상세). */}
          <div
            className={cn(
              "grid items-start gap-4",
              assetId !== null &&
                "lg:grid-cols-[minmax(340px,420px)_1fr]",
            )}
          >
            <Card className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Toolkit</h2>
                  <p className="text-xs text-muted-foreground">
                    이 프로젝트의 에이전트·스킬. 행을 클릭하면 오른쪽에 상세가
                    뜹니다.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAuthor((v) => !v)}
                  title="보통 터미널/creator 로 만들지만 여기서 직접 작성·편집도 가능"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {assetId === null ? "새 자산" : "편집/새 자산"}
                </Button>
              </div>
              <AssetToolkit
                projectId={project.id}
                selectedId={assetId}
                onSelect={handleSelectAsset}
              />
            </Card>

            {assetId !== null && (
              <div className="lg:sticky lg:top-4">
                <AssetDetailPanel
                  projectId={project.id}
                  assetId={assetId}
                  versionId={versionId}
                  onSelectVersion={setVersionId}
                  onRunCreated={onRunCreated}
                  onBenchmarkStarted={onBenchmarkStarted}
                  onDeleted={() => {
                    handleSelectAsset(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* 저작 (후순위 — 접힘) */}
          {showAuthor && (
            <AssetAuthor projectId={project.id} selectedAssetId={assetId} />
          )}
        </>
      )}

      {/* 미선택 빈 상태에서 등록 버튼으로 여는 모달(ProjectBar 의 등록과 동일). */}
      <ProjectRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={handleSelectProject}
      />
    </div>
  );
}
