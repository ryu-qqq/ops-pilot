import { useState } from "react";
import { InlineError, Loading } from "../../../lib/ui";
import { useCreateHumanScore, useScores } from "../use-run";
import s from "./human-score.module.css";

// 사람이 트레이스를 시나리오 성공조건과 대조해 직접 점수·이유를 남긴다 (OPSP-17).
// 이 데이터가 OPSP-21(피드백→더 나은 프롬프트 추천) 플라이휠의 연료.
export function HumanScore({ runId }: { runId: string | null }) {
  const { data: scores } = useScores(runId);
  const create = useCreateHumanScore(runId ?? "");
  const [passed, setPassed] = useState(true);
  const [score, setScore] = useState("0.8");
  const [reason, setReason] = useState("");

  if (runId === null) return null;

  const humanScores = (scores ?? []).filter((sc) => sc.scorer === "human");

  return (
    <div className={s.panel}>
      <div className={s.title}>사람 평가</div>

      {humanScores.length > 0 && (
        <ul className={s.history}>
          {humanScores.map((sc) => (
            <li key={sc.id} className={`${s.histItem} ${sc.passed ? s.histPass : s.histFail}`}>
              <span className={sc.passed ? s.verdictPass : s.verdictFail}>
                {sc.passed ? "PASS" : "FAIL"}
              </span>
              {sc.score !== null && <span> · {sc.score.toFixed(2)}</span>}
              {sc.detail?.reason && <span className={s.reason}> — {sc.detail.reason}</span>}
              <span className={s.date}> · {sc.createdAt.slice(0, 16).replace("T", " ")}</span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(score);
          create.mutate(
            {
              runId,
              passed,
              score: score.trim() === "" || Number.isNaN(n) ? null : n,
              reason: reason.trim() === "" ? null : reason,
            },
            { onSuccess: () => setReason("") },
          );
        }}
        className={s.form}
      >
        <label>
          <input
            type="checkbox"
            checked={passed}
            onChange={(e) => setPassed(e.target.checked)}
          />{" "}
          통과
        </label>
        <label>
          점수{" "}
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={s.scoreInput}
          />
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="이유 (성공조건 대비 왜 이 점수인가)"
          className={s.reasonInput}
        />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loading label="저장 중…" /> : "평가 저장"}
        </button>
        {create.isError && <InlineError error={create.error} />}
      </form>
    </div>
  );
}
