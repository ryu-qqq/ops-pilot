import { useState, type CSSProperties } from "react";
import { useLaunchRun } from "../use-run";

interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runId: string) => void;
}

const field: CSSProperties = {
  width: "100%",
  padding: 6,
  marginBottom: 6,
  boxSizing: "border-box",
};
const label: CSSProperties = { fontSize: 12, color: "#57606a", margin: "4px 0 2px" };

// 시나리오 구체화 (OPSP-16): 막연한 한 줄 대신 목적·입력·기대·성공조건을 구조로.
export function RunLauncher({ assetId, assetVersionId, defaultCwd, onLaunched }: Props) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [input, setInput] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [successText, setSuccessText] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");
  const launch = useLaunchRun();

  const canSubmit = name.trim() !== "" && input.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const successCriteria = successText
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        launch.mutate(
          { assetId, assetVersionId, cwd, source, name, purpose, input, expectedBehavior, successCriteria },
          { onSuccess: (run) => onLaunched(run.id) },
        );
      }}
      style={{ border: "1px solid #e1e4e8", borderRadius: 6, padding: 12, marginTop: 12 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>이 버전으로 시나리오 실행</div>

      <div style={label}>시나리오 이름 *</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 큰 코드베이스에서 X 찾기" style={field} />

      <div style={label}>목적 — 이 시나리오로 무엇을 검증하나</div>
      <input
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="예: 불필요한 툴 호출 없이 정답을 찾는가"
        style={field}
      />

      <div style={label}>입력 — 에이전트에 줄 지시 *</div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        placeholder="구체적으로. 예: src/ 에서 결제 검증 로직 위치를 찾아 함수명을 답하라"
        style={{ ...field, fontFamily: "monospace" }}
      />

      <div style={label}>기대 동작 — 어떻게 행동해야 옳은가 (judge 기준)</div>
      <textarea
        value={expectedBehavior}
        onChange={(e) => setExpectedBehavior(e.target.value)}
        rows={2}
        placeholder="예: Grep 으로 좁힌 뒤 해당 파일만 Read, 추측 금지"
        style={field}
      />

      <div style={label}>성공조건 — 한 줄에 하나 (결정론 체크)</div>
      <textarea
        value={successText}
        onChange={(e) => setSuccessText(e.target.value)}
        rows={3}
        placeholder={"정답 함수명이 응답에 포함\nGrep 호출 3회 이하\n파일 수정 0건"}
        style={{ ...field, fontFamily: "monospace" }}
      />

      <div style={label}>대상 레포 cwd</div>
      <input value={cwd} onChange={(e) => setCwd(e.target.value)} style={{ ...field, fontSize: 12, fontFamily: "monospace" }} />

      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <label>
          <input type="radio" name="src" checked={source === "fixture"} onChange={() => setSource("fixture")} /> fixture (토큰0)
        </label>
        <label>
          <input type="radio" name="src" checked={source === "local-claude"} onChange={() => setSource("local-claude")} /> local-claude
        </label>
        <button type="submit" disabled={launch.isPending || !canSubmit} style={{ marginLeft: "auto" }}>
          {launch.isPending ? "실행 중…" : "▶ 실행"}
        </button>
      </div>
      {launch.isError && <p style={{ color: "crimson", fontSize: 12 }}>{launch.error.message}</p>}
    </form>
  );
}
