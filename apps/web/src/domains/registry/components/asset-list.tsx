import { useMemo, useState } from "react";
import type { Asset, AssetKind } from "@opspilot/shared-types";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { useAssets } from "../use-registry";

interface Props {
  projectId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const KIND_ORDER: AssetKind[] = ["skill", "command", "agent"];
const KIND_LABEL: Record<AssetKind, string> = {
  skill: "스킬",
  command: "커맨드",
  agent: "에이전트",
};

export function AssetList({ projectId, selectedId, onSelect }: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const [q, setQ] = useState("");

  // 검색·그룹은 파생값 — useMemo (서버데이터는 Query, UI필터는 로컬).
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (assets ?? []).filter((a) =>
      needle === "" ? true : a.name.toLowerCase().includes(needle),
    );
    const byKind = new Map<AssetKind, Asset[]>();
    for (const a of filtered) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: (byKind.get(k) ?? []).sort((x, y) => x.name.localeCompare(y.name)),
    }));
  }, [assets, q]);

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 먼저 선택하세요"
        hint="위의 프로젝트 바에서 git URL로 등록하거나 목록에서 고르면 자산이 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p style={{ color: "#57606a" }}>
        <Loading label="자산 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (assets.length === 0)
    return (
      <EmptyState
        title="아직 자산이 없어요"
        hint="상단 ‘스캔’으로 이 프로젝트의 .claude를 적재하거나, 오른쪽 ‘새 자산 작성’으로 첫 에이전트/스킬/커맨드를 만드세요. .claude가 없는 프로젝트는 작성부터 하면 OpsPilot이 자동으로 만들고 버전을 생성합니다."
      />
    );

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`이름 검색 (총 ${String(assets.length)}개)`}
        style={{ width: "100%", padding: 6, marginBottom: 8, boxSizing: "border-box" }}
      />
      {groups.length === 0 && <p style={{ color: "#888" }}>검색 결과 없음.</p>}
      {groups.map((g) => (
        <div key={g.kind} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#57606a",
              textTransform: "uppercase",
              padding: "2px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            {KIND_LABEL[g.kind]} <span style={{ color: "#999" }}>({g.items.length})</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {g.items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 8px",
                    border: "none",
                    background: a.id === selectedId ? "#e6f0ff" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
