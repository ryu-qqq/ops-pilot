import { useState } from "react";
import { EmptyState, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetScenarios } from "../../registry/use-registry";
import { useLaunchBatchScenarios } from "../use-run";
import s from "./regression-launcher.module.css";

// OPSP-9: 같은 자산 버전을 N개 *기존 시나리오* 로 한 번에 회귀.
// RunLauncher 와 별도 — RunLauncher 는 새 시나리오 작성·실행, 이건 누적된 시나리오 셋 회귀.

interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runIds: string[]) => void;
}

export function RegressionLauncher({ assetId, assetVersionId, defaultCwd, onLaunched }: Props) {
  const scenarios = useAssetScenarios(assetId);
  const launch = useLaunchBatchScenarios();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cwd, setCwd] = useState(defaultCwd);
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");

  const list = scenarios.data ?? [];
  const count = selected.size;
  const canSubmit = count >= 2 && count <= 10;

  if (scenarios.isPending) {
    return (
      <p className={s.loadingP}>
        <Loading label="시나리오 목록 불러오는 중…" />
      </p>
    );
  }
  if (list.length < 2) {
    return (
      <EmptyState
        title="회귀 셋 만들려면 시나리오가 2개 이상 필요해요"
        hint="위의 ‘이 버전으로 시나리오 실행’ 폼으로 시나리오를 더 만들고 한 번씩 실행해 두세요. 그러면 여기서 다중 선택해 한 번에 회귀할 수 있습니다."
      />
    );
  }

  return (
    <div className={s.card}>
      <div className={s.header}>
        <strong className={s.title}>🎯 회귀 셋 (이 버전 × N 시나리오 일괄)</strong>
        <InfoMark
          label="회귀 셋"
          help="누적된 시나리오 중 N개(2~10)를 골라 같은 자산 버전으로 한 번에 돌립니다. 자산이 도메인 접다른 시나리오 셋에 일관되게 작동하는지 한 번에 확인."
        />
        <span className={s.count}>
          선택: {count} / 10
        </span>
      </div>
      <div className={s.list}>
        {list.map((sc) => {
          const checked = selected.has(sc.id);
          return (
            <label key={sc.id} className={s.item}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && count >= 10}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(sc.id);
                    else next.delete(sc.id);
                    return next;
                  });
                }}
              />
              <span className={s.itemName}>{sc.name}</span>
              {sc.description !== null && (
                <span className={s.itemDesc}>— {sc.description.slice(0, 40)}</span>
              )}
            </label>
          );
        })}
      </div>
      {count > 0 && count < 2 && (
        <p className={s.warn}>최소 2개 선택해야 회귀 의미가 있어요.</p>
      )}

      <div className={s.actionRow}>
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} className={s.cwd} />
        <label>
          <input
            type="radio"
            name="reg-src"
            checked={source === "fixture"}
            onChange={() => setSource("fixture")}
          />{" "}
          fixture
        </label>
        <label>
          <input
            type="radio"
            name="reg-src"
            checked={source === "local-claude"}
            onChange={() => setSource("local-claude")}
          />{" "}
          local-claude
        </label>
        <button
          type="button"
          disabled={launch.isPending || !canSubmit}
          onClick={() =>
            launch.mutate(
              { assetVersionId, scenarioIds: [...selected], cwd, source },
              { onSuccess: (res) => onLaunched(res.runs.map((r) => r.id)) },
            )
          }
        >
          {launch.isPending ? (
            <Loading label={`${String(count)}개 회귀 실행 중…`} />
          ) : (
            `▶ ${String(count)} 시나리오 일괄 실행`
          )}
        </button>
      </div>
      {launch.isError && (
        <p className={s.errorWrap}>
          <InlineError error={launch.error} />
        </p>
      )}
    </div>
  );
}
