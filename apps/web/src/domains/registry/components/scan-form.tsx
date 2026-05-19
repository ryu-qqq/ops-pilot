import { useState } from "react";
import { useScan } from "../use-registry";

// 대상 레포 .claude 스캔 트리거. 결과/에러는 호출부가 아닌 여기서 표시(예측가능성).
export function ScanForm() {
  const [repoPath, setRepoPath] = useState("/Users/ryu-qqq/Documents/ryu-qqq/MarketPlace");
  const scan = useScan();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        scan.mutate(repoPath);
      }}
      style={{ display: "flex", gap: 8, marginBottom: 16 }}
    >
      <input
        value={repoPath}
        onChange={(e) => setRepoPath(e.target.value)}
        placeholder="스캔할 레포 경로"
        style={{ flex: 1, padding: 6, fontFamily: "monospace" }}
      />
      <button type="submit" disabled={scan.isPending}>
        {scan.isPending ? "스캔 중…" : "스캔"}
      </button>
      {scan.isError && <span style={{ color: "crimson" }}>{scan.error.message}</span>}
      {scan.isSuccess && (
        <span style={{ color: "green" }}>
          자산 {scan.data.scannedAssets} · 신규버전 {scan.data.saved.versions}
        </span>
      )}
    </form>
  );
}
