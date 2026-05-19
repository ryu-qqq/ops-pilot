import { useAssets } from "../use-registry";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AssetList({ selectedId, onSelect }: Props) {
  const { data: assets, isPending, isError, error } = useAssets();

  if (isPending) return <p>불러오는 중…</p>;
  if (isError) return <p style={{ color: "crimson" }}>{error.message}</p>;
  if (assets.length === 0) return <p style={{ color: "#888" }}>스캔된 자산 없음. 위에서 스캔하세요.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {assets.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onSelect(a.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "6px 8px",
              border: "none",
              background: a.id === selectedId ? "#e6f0ff" : "transparent",
              cursor: "pointer",
            }}
          >
            <code style={{ color: "#888" }}>{a.kind}</code> {a.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
