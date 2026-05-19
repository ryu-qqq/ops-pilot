import { useState } from "react";
import { ScanForm } from "./domains/registry/components/scan-form";
import { AssetList } from "./domains/registry/components/asset-list";
import { VersionTimeline } from "./domains/registry/components/version-timeline";

export function App() {
  // UI/로컬 상태만 useState, 서버 데이터는 TanStack Query (CONVENTIONS.md 2).
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>OpsPilot — Harness Control Plane</h1>
      <ScanForm />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>자산 ({"agents · skills · commands"})</h2>
          <AssetList selectedId={selectedAssetId} onSelect={setSelectedAssetId} />
        </section>
        <section>
          <h2 style={{ fontSize: 14, color: "#555" }}>git 버전 타임라인</h2>
          <VersionTimeline assetId={selectedAssetId} />
        </section>
      </div>
    </main>
  );
}
