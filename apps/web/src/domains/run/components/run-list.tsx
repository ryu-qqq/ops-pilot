import { useRuns } from "../use-run";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const statusColor: Record<string, string> = {
  succeeded: "#1a7f37",
  failed: "crimson",
  running: "#9a6700",
  pending: "#888",
};

export function RunList({ selectedId, onSelect }: Props) {
  const { data: runs, isPending, isError, error } = useRuns();

  if (isPending) return <p>불러오는 중…</p>;
  if (isError) return <p style={{ color: "crimson" }}>{error.message}</p>;
  if (runs.length === 0) return <p style={{ color: "#888" }}>실행(run) 없음.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {runs.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px",
              border: "none",
              borderBottom: "1px solid #eee",
              background: r.id === selectedId ? "#e6f0ff" : "transparent",
              cursor: "pointer",
            }}
          >
            <div>
              <span style={{ color: statusColor[r.status] ?? "#333", fontWeight: 600 }}>
                ● {r.status}
              </span>{" "}
              <code style={{ color: "#888" }}>{r.assetKind}</code> {r.assetName}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {r.scenarioName} · <code>{r.gitCommit.slice(0, 8)}</code> · {r.runner}
              {r.promptTokens !== null && ` · ${String(r.promptTokens + (r.completionTokens ?? 0))} tok`}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
