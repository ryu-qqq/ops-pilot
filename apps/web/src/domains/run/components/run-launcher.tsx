import { useState } from "react";
import { useLaunchRun } from "../use-run";

interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runId: string) => void;
}

// 선택한 버전으로 시나리오를 즉석 정의·실행 → 끝나면 트레이스로 이동.
export function RunLauncher({ assetId, assetVersionId, defaultCwd, onLaunched }: Props) {
  const [name, setName] = useState("데모 시나리오");
  const [input, setInput] = useState("샘플 작업을 수행하라");
  const [cwd, setCwd] = useState(defaultCwd);
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");
  const launch = useLaunchRun();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        launch.mutate(
          { assetId, assetVersionId, name, input, cwd, source },
          { onSuccess: (run) => onLaunched(run.id) },
        );
      }}
      style={{ border: "1px solid #e1e4e8", borderRadius: 6, padding: 12, marginTop: 12 }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>이 버전으로 실행</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="시나리오 이름"
        style={{ width: "100%", padding: 6, marginBottom: 6 }}
      />
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="에이전트에 줄 입력"
        rows={2}
        style={{ width: "100%", padding: 6, marginBottom: 6, fontFamily: "monospace" }}
      />
      <input
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
        placeholder="대상 레포 cwd"
        style={{ width: "100%", padding: 6, marginBottom: 6, fontFamily: "monospace", fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <label>
          <input
            type="radio"
            name="src"
            checked={source === "fixture"}
            onChange={() => setSource("fixture")}
          />{" "}
          fixture (토큰0·결정론)
        </label>
        <label>
          <input
            type="radio"
            name="src"
            checked={source === "local-claude"}
            onChange={() => setSource("local-claude")}
          />{" "}
          local-claude (실행)
        </label>
        <button type="submit" disabled={launch.isPending} style={{ marginLeft: "auto" }}>
          {launch.isPending ? "실행 중…" : "▶ 실행"}
        </button>
      </div>
      {launch.isError && (
        <p style={{ color: "crimson", fontSize: 12 }}>{launch.error.message}</p>
      )}
    </form>
  );
}
