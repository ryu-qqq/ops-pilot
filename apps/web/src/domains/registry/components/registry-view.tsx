import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { AssetAuthor } from "../../authoring/components/asset-author";
import { RegressionLauncher } from "../../run/components/regression-launcher";
import { RunLauncher } from "../../run/components/run-launcher";
import { AssetList } from "./asset-list";
import { VersionTimeline } from "./version-timeline";

interface Props {
  onRunCreated: (runIds: string[]) => void;
}

export function RegistryView({ onRunCreated }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
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
          setProjectId(id);
          setAssetId(null);
          setVersionId(null);
        }}
      />
      {/* 첫 줄: 자산 패널 + git 버전 타임라인 — 같은 grid row 에서 동일 높이 stretch */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              자산 (agents · skills · commands)
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
        <Card className="flex flex-col p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">git 버전 타임라인</h2>
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
      {assetId !== null && versionId !== null && project !== null && (
        <>
          <RunLauncher
            assetId={assetId}
            assetVersionId={versionId}
            defaultCwd={project.clonePath}
            onLaunched={onRunCreated}
          />
          <RegressionLauncher
            assetId={assetId}
            assetVersionId={versionId}
            defaultCwd={project.clonePath}
            onLaunched={onRunCreated}
          />
        </>
      )}
    </div>
  );
}
