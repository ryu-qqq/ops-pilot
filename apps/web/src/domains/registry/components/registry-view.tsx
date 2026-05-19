import { useState } from "react";
import { ScanForm } from "./scan-form";
import { AssetList } from "./asset-list";
import { VersionTimeline } from "./version-timeline";

export function RegistryView() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  return (
    <>
      <ScanForm />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>자산 (agents · skills · commands)</h2>
          <AssetList selectedId={selectedAssetId} onSelect={setSelectedAssetId} />
        </section>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>git 버전 타임라인</h2>
          <VersionTimeline assetId={selectedAssetId} />
        </section>
      </div>
    </>
  );
}
