import { useState } from "react";
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
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            자산 (agents · skills · commands)
          </h2>
          <AssetList
            projectId={projectId}
            selectedId={assetId}
            onSelect={(id) => {
              setAssetId(id);
              setVersionId(null);
            }}
          />
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">git 버전 타임라인</h2>
            <VersionTimeline
              assetId={assetId}
              selectedVersionId={versionId}
              onSelectVersion={setVersionId}
            />
          </Card>
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
      </div>
    </div>
  );
}
