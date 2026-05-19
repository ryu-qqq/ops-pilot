import { useAssetVersions } from "../use-registry";

// 자산별 git 버전 타임라인 (커밋 = 버전의 단일 원천).
export function VersionTimeline({ assetId }: { assetId: string | null }) {
  const { data: versions, isPending, isError, error } = useAssetVersions(assetId);

  if (assetId === null) return <p style={{ color: "#888" }}>자산을 선택하세요.</p>;
  if (isPending) return <p>불러오는 중…</p>;
  if (isError) return <p style={{ color: "crimson" }}>{error.message}</p>;
  if (versions.length === 0) return <p style={{ color: "#888" }}>버전 없음.</p>;

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {versions.map((v) => (
        <li
          key={v.id}
          style={{ borderLeft: "2px solid #ccc", padding: "4px 0 12px 12px", marginLeft: 6 }}
        >
          <div>
            <code>{v.gitCommit.slice(0, 8)}</code>{" "}
            <span style={{ color: "#888" }}>{v.committedAt.slice(0, 10)}</span>
          </div>
          <div style={{ fontSize: 13 }}>{v.commitMessage ?? "(메시지 없음)"}</div>
        </li>
      ))}
    </ol>
  );
}
