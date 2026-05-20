import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { useRuns } from "../use-run";
import s from "./run-list.module.css";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const cls = (s as Record<string, string | undefined>);
const statusClass: Record<string, string> = {
  succeeded: cls.statusSucceeded ?? "",
  failed: cls.statusFailed ?? "",
  running: cls.statusRunning ?? "",
  pending: cls.statusPending ?? "",
};

export function RunList({ selectedId, onSelect }: Props) {
  const { data: runs, isPending, isError, error } = useRuns();

  if (isPending)
    return (
      <p className={s.loading}>
        <Loading label="실행 목록 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (runs.length === 0)
    return (
      <EmptyState
        title="아직 실행한 적이 없어요"
        hint="레지스트리 탭에서 자산·버전을 고르고 시나리오를 실행하면 여기에 트레이스가 쌓입니다."
      />
    );

  return (
    <ul className={s.list}>
      {runs.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            className={`${s.itemBtn} ${r.id === selectedId ? s.itemSelected : ""}`}
          >
            <div>
              <span className={statusClass[r.status] ?? ""}>● {r.status}</span>{" "}
              <code className={s.assetKind}>{r.assetKind}</code> {r.assetName}
            </div>
            <div className={s.meta}>
              {r.scenarioName} · <code>{r.gitCommit.slice(0, 8)}</code> · {r.runner}
              {r.promptTokens !== null &&
                ` · ${String(r.promptTokens + (r.completionTokens ?? 0))} tok`}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
