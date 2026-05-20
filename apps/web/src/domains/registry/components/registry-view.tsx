import { useState } from "react";
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
    <>
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          setProjectId(id);
          setAssetId(null);
          setVersionId(null);
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>자산 (agents · skills · commands)</h2>
          <AssetList
            projectId={projectId}
            selectedId={assetId}
            onSelect={(id) => {
              setAssetId(id);
              setVersionId(null);
            }}
          />
        </section>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>git 버전 타임라인</h2>
          <VersionTimeline
            assetId={assetId}
            selectedVersionId={versionId}
            onSelectVersion={setVersionId}
          />
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
        </section>
      </div>
    </>
  );
}
