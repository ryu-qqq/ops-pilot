import { useState } from "react";
import { useCreateHumanScore, useScores } from "../use-run";

// 사람이 트레이스를 시나리오 성공조건과 대조해 직접 점수·이유를 남긴다 (OPSP-17).
// 이 데이터가 OPSP-21(피드백→더 나은 프롬프트 추천) 플라이휠의 연료.
export function HumanScore({ runId }: { runId: string | null }) {
  const { data: scores } = useScores(runId);
  const create = useCreateHumanScore(runId ?? "");
  const [passed, setPassed] = useState(true);
  const [score, setScore] = useState("0.8");
  const [reason, setReason] = useState("");

  if (runId === null) return null;

  const humanScores = (scores ?? []).filter((s) => s.scorer === "human");

  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>사람 평가</div>

      {humanScores.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", fontSize: 13 }}>
          {humanScores.map((s) => (
            <li key={s.id} style={{ borderLeft: `3px solid ${s.passed ? "#1a7f37" : "crimson"}`, padding: "2px 8px", marginBottom: 4 }}>
              <span style={{ color: s.passed ? "#1a7f37" : "crimson", fontWeight: 600 }}>
                {s.passed ? "PASS" : "FAIL"}
              </span>
              {s.score !== null && <span> · {s.score.toFixed(2)}</span>}
              {s.detail?.reason && <span style={{ color: "#444" }}> — {s.detail.reason}</span>}
              <span style={{ color: "#999" }}> · {s.createdAt.slice(0, 16).replace("T", " ")}</span>
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
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}
      >
        <label>
          <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} /> 통과
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
            style={{ width: 60, padding: 4 }}
          />
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="이유 (성공조건 대비 왜 이 점수인가)"
          style={{ flex: 1, minWidth: 200, padding: 6 }}
        />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? "저장 중…" : "평가 저장"}
        </button>
        {create.isError && <span style={{ color: "crimson" }}>{create.error.message}</span>}
      </form>
    </div>
  );
}
