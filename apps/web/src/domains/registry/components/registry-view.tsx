import { useState } from "react";
import { RunLauncher } from "../../run/components/run-launcher";
import { ScanForm } from "./scan-form";
import { AssetList } from "./asset-list";
import { VersionTimeline } from "./version-timeline";

const DEFAULT_CWD = "/Users/ryu-qqq/Documents/ryu-qqq/MarketPlace";

interface Props {
  onRunCreated: (runId: string) => void;
}

export function RegistryView({ onRunCreated }: Props) {
  const [assetId, setAssetId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);

  return (
    <>
      <ScanForm />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>자산 (agents · skills · commands)</h2>
          <AssetList
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
          {assetId !== null && versionId !== null && (
            <RunLauncher
              assetId={assetId}
              assetVersionId={versionId}
              defaultCwd={DEFAULT_CWD}
              onLaunched={onRunCreated}
            />
          )}
        </section>
      </div>
    </>
  );
}
