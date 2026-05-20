import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { useRunsCompare } from "../use-run";

// OPSP-10 비교 뷰: N개 run 을 컬럼으로, 행에 핵심 메트릭 매트릭스.
// 실행 중인 run 있으면 폴링으로 실시간 갱신. fixture/local-claude 둘 다.

interface Props {
  runIds: string[];
  onSelectRun: (runId: string) => void;
}

const statusEmoji: Record<string, string> = {
  running: "🟡",
  succeeded: "✅",
  failed: "❌",
  pending: "⏳",
};

const cellStyle = {
  padding: "6px 8px",
  borderTop: "1px solid #eee",
  fontSize: 12,
  verticalAlign: "top" as const,
};

export function ComparisonView({ runIds, onSelectRun }: Props) {
  const anyRunning = false; // 폴링 트리거: 첫 응답 이후 결정.
  const { data: items, isPending, isError, error } = useRunsCompare(runIds, anyRunning);

  if (runIds.length === 0) return null;
  if (isPending)
    return (
      <p style={{ color: "#57606a" }}>
        <Loading label="비교 데이터 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (items.length === 0)
    return <EmptyState title="비교할 run 이 없어요" hint="버전 비교 모드로 다시 실행해 보세요." />;

  // 응답 받은 뒤 실행 중 run 이 있으면 다음 폴링 의미 — 단순히 위 hook 의 anyRunning 을 동적으로
  // 하면 좋지만, 1차는 컴포넌트 키를 runIds 로 잡아 새로 마운트되게 함. 추후 useRun + interval 로 분리.

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...cellStyle, textAlign: "left", color: "#57606a" }}>지표</th>
            {items.map((it) => (
              <th
                key={it.run.id}
                style={{ ...cellStyle, textAlign: "left", cursor: "pointer", color: "#0969da" }}
                onClick={() => onSelectRun(it.run.id)}
                title="이 run 의 트레이스 보기"
              >
                <code style={{ fontSize: 11 }}>{it.run.id.slice(0, 8)}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>상태</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {statusEmoji[it.run.status] ?? "?"} {it.run.status}
                {it.run.error !== null && (
                  <div style={{ color: "#cf222e", fontSize: 11 }}>{it.run.error.slice(0, 80)}</div>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>실행 소스</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.runner}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>토큰 (입력/출력)</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.promptTokens === null && it.run.completionTokens === null
                  ? "—"
                  : `${String(it.run.promptTokens ?? "—")} / ${String(it.run.completionTokens ?? "—")}`}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>비용 (USD)</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.costUsd === null ? "—" : it.run.costUsd.toFixed(4)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>변경 파일 수</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.diffFileCount}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600, verticalAlign: "top" }}>마지막 응답 미리보기</td>
            {items.map((it) => (
              <td key={it.run.id} style={{ ...cellStyle, maxWidth: 240 }}>
                {it.lastAssistantText === null ? (
                  <span style={{ color: "#888" }}>(없음)</span>
                ) : (
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {it.lastAssistantText}
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#57606a", marginTop: 6 }}>
        컬럼 헤더(run id) 를 클릭하면 그 run 의 트레이스로 이동. 사람 점수 컬럼은 OPSP-17 데이터가 쌓이면 추가됩니다.
      </p>
    </div>
  );
}
