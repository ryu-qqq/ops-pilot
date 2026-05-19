import { useMemo, useState } from "react";
import type { Asset, AssetKind } from "@opspilot/shared-types";
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

  if (projectId === null) return <p style={{ color: "#888" }}>프로젝트를 선택하세요.</p>;
  if (isPending) return <p>불러오는 중…</p>;
  if (isError) return <p style={{ color: "crimson" }}>{error.message}</p>;
  if (assets.length === 0)
    return <p style={{ color: "#888" }}>스캔된 자산 없음. 스캔하세요.</p>;

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
