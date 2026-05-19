import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { useAssetVersions } from "../use-registry";

interface Props {
  assetId: string | null;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
}

// 자산별 git 버전 타임라인 (커밋 = 버전의 단일 원천). 버전 클릭 시 선택.
export function VersionTimeline({ assetId, selectedVersionId, onSelectVersion }: Props) {
  const { data: versions, isPending, isError, error } = useAssetVersions(assetId);

  if (assetId === null)
    return (
      <EmptyState
        title="자산을 선택하세요"
        hint="왼쪽 목록에서 자산을 고르면 git 커밋 기반 버전 타임라인이 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p style={{ color: "#57606a" }}>
        <Loading label="버전 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (versions.length === 0)
    return <EmptyState title="버전이 없어요" hint="이 자산을 수정·저장하면 첫 버전이 생성됩니다." />;

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {versions.map((v) => (
        <li key={v.id} style={{ marginLeft: 6 }}>
          <button
            type="button"
            onClick={() => onSelectVersion(v.id)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              borderLeft: `2px solid ${v.id === selectedVersionId ? "#0969da" : "#ccc"}`,
              background: v.id === selectedVersionId ? "#e6f0ff" : "transparent",
              padding: "4px 0 12px 12px",
              cursor: "pointer",
            }}
          >
            <div>
              <code>{v.gitCommit.slice(0, 8)}</code>{" "}
              <span style={{ color: "#888" }}>{v.committedAt.slice(0, 10)}</span>
            </div>
            <div style={{ fontSize: 13 }}>{v.commitMessage ?? "(메시지 없음)"}</div>
          </button>
        </li>
      ))}
    </ol>
  );
}
