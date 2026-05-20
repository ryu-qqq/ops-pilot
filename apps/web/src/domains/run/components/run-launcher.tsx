import { useMemo, useState, type CSSProperties } from "react";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetVersions } from "../../registry/use-registry";
import { useLaunchBatchRun, useLaunchRun, useSuggestScenario } from "../use-run";

// OPSP-10: onLaunched 시그니처를 runIds[] 로 통일 — 길이 1=단일, 2+=비교 모드.
interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runIds: string[]) => void;
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
  const [hint, setHint] = useState("");
  const [compare, setCompare] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(() => new Set([assetVersionId]));
  const launch = useLaunchRun();
  const launchBatch = useLaunchBatchRun();
  const suggest = useSuggestScenario();
  const versions = useAssetVersions(assetId);

  // 비교 모드 켜질 때 현재 선택 버전을 기본 체크.
  const versionList = versions.data ?? [];
  const compareList = useMemo(() => [...compareIds], [compareIds]);
  const compareCount = compareList.length;
  const isPending = launch.isPending || launchBatch.isPending;
  const launchError = launch.error ?? launchBatch.error;
  const isError = launch.isError || launchBatch.isError;

  const canSubmit =
    name.trim() !== "" &&
    input.trim() !== "" &&
    (!compare || (compareCount >= 2 && compareCount <= 5));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const successCriteria = successText
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        if (compare) {
          launchBatch.mutate(
            {
              assetId,
              assetVersionIds: compareList,
              cwd,
              source,
              name,
              purpose,
              input,
              expectedBehavior,
              successCriteria,
            },
            { onSuccess: (res) => onLaunched(res.runs.map((r) => r.id)) },
          );
        } else {
          launch.mutate(
            { assetId, assetVersionId, cwd, source, name, purpose, input, expectedBehavior, successCriteria },
            { onSuccess: (run) => onLaunched([run.id]) },
          );
        }
      }}
      style={{ border: "1px solid #e1e4e8", borderRadius: 6, padding: 12, marginTop: 12 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        이 버전으로 시나리오 실행
        <InfoMark
          label="시나리오 실행"
          help="선택한 버전의 git 커밋으로 격리 worktree 를 만들고 그 안에서 에이전트를 돌립니다(클론·원본 무오염). 실행은 비동기 — 즉시 트레이스 탭으로 이동하고, 단계가 실시간으로 채워집니다."
        />
      </div>

      {/* OPSP-27 B: 자산 본문 + hint 로 시나리오 폼 5필드 초안 자동 채움. */}
      <div
        style={{
          border: "1px solid #8250df",
          background: "#faf5ff",
          borderRadius: 6,
          padding: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>🤖 AI 시나리오 초안</strong>
          <InfoMark
            label="AI 시나리오 초안"
            help="이 자산의 최신 버전 본문을 로컬 Claude 가 읽고, 시나리오 5필드(이름·목적·입력·기대·성공조건) 초안을 JSON 으로 받아 폼에 자동 채워줍니다. 거부하면 그대로 진행. 실 토큰 소모, 약 10-40초."
          />
        </div>
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="(선택) 어떤 상황을 검증하고 싶나 — 예: ‘추측 없이 정답을 찾는지 본다’"
          style={{ ...field, marginBottom: 4 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            disabled={suggest.isPending}
            onClick={() =>
              suggest.mutate(
                { assetId, hint: hint.trim() === "" ? undefined : hint.trim() },
                {
                  onSuccess: (s) => {
                    setName(s.name);
                    setPurpose(s.purpose);
                    setInput(s.input);
                    setExpectedBehavior(s.expectedBehavior);
                    setSuccessText(s.successCriteria.join("\n"));
                  },
                },
              )
            }
          >
            {suggest.isPending ? <Loading label="Claude 초안 생성 중…" /> : "초안 생성 → 폼 채움"}
          </button>
          {suggest.isSuccess && (
            <span style={{ color: "green", fontSize: 12 }}>초안 적용됨 — 다듬어 실행하세요</span>
          )}
          {suggest.isError && <InlineError error={suggest.error} />}
        </div>
      </div>

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

      {/* OPSP-10: 비교 모드 — 같은 자산의 여러 버전을 한 번에 같은 시나리오로. */}
      <div
        style={{
          border: "1px solid #0969da",
          background: "#ddf4ff",
          borderRadius: 6,
          padding: 8,
          marginBottom: 8,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
          />
          📊 버전 비교 모드 (2~5개 버전을 같은 시나리오로 동시 실행)
          <InfoMark
            label="버전 비교"
            help="같은 자산의 여러 버전을 한 시나리오로 한 번에 돌려, 컬럼별로 나란히 비교합니다. ‘프롬프트 한 줄 바꿨는데 더 나아졌나?’를 즉답."
          />
        </label>
        {compare && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "#0a3069", marginBottom: 4 }}>
              실행할 버전 ({compareCount} / 5)
            </div>
            <div style={{ maxHeight: 140, overflowY: "auto", paddingRight: 4 }}>
              {versionList.length === 0 && (
                <p style={{ fontSize: 12, color: "#57606a", margin: 0 }}>버전이 없습니다.</p>
              )}
              {versionList.map((v) => {
                const checked = compareIds.has(v.id);
                return (
                  <label
                    key={v.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && compareCount >= 5}
                      onChange={(e) => {
                        setCompareIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(v.id);
                          else next.delete(v.id);
                          return next;
                        });
                      }}
                    />
                    <code style={{ fontSize: 11 }}>{v.gitCommit.slice(0, 8)}</code>
                    <span style={{ color: "#57606a" }}>{v.committedAt.slice(0, 10)}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.commitMessage ?? "(no message)"}
                    </span>
                  </label>
                );
              })}
            </div>
            {compareCount < 2 && (
              <p style={{ fontSize: 11, color: "#9a6700", margin: "4px 0 0" }}>
                최소 2개 선택해야 비교 의미가 있어요.
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <label>
          <input type="radio" name="src" checked={source === "fixture"} onChange={() => setSource("fixture")} /> fixture (토큰0)
          <InfoMark
            label="fixture 소스"
            help="결정론적 가짜 트레이스(6단계)로 실행 — 실제 Claude를 부르지 않아 토큰·비용 0. UI 흐름·평가 로직 검증용. CI 회귀에도 안전."
          />
        </label>
        <label>
          <input type="radio" name="src" checked={source === "local-claude"} onChange={() => setSource("local-claude")} /> local-claude
          <InfoMark
            label="local-claude 소스"
            help="로컬에 설치된 claude CLI 를 격리 worktree 안에서 spawn 합니다(별도 API 키·과금 없음, 기존 로컬 인증 재사용). 실 토큰 소비 — 비결정적, 실제 평가용."
          />
        </label>
        <button type="submit" disabled={isPending || !canSubmit} style={{ marginLeft: "auto" }}>
          {isPending ? (
            <Loading label={compare ? `${String(compareCount)}개 실행 중…` : "실행 중…"} />
          ) : compare ? (
            `▶ ${String(compareCount)}개 버전 동시 실행`
          ) : (
            "▶ 실행"
          )}
        </button>
      </div>
      {isError && launchError !== null && (
        <p style={{ margin: "6px 0 0" }}>
          <InlineError error={launchError} />
        </p>
      )}
    </form>
  );
}
