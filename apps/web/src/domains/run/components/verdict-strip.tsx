import { ChevronRight, CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { MachineGateStatus } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { InfoMark } from "../../../lib/ui";
import { useRun, useRunDiff, useRuns, useScenario, useScores } from "../use-run";
import { sourceToken } from "../lib/source-token";

// 관측소 (1)+(2): 판정 한 줄 + 출처 브레드크럼.
// 흩어진 숫자를 한 줄로 모아 "됐나?"를 스크롤 없이. 새 백엔드 0 —
// run/scores/diff/scenario 다 기존 훅 재사용. run 은 landing 이므로 출처를 항상 보여줌.

function fmtScore(s: { passed: boolean; score: number | null } | null | undefined): string {
  if (s === null || s === undefined) return "—";
  if (s.score !== null) return s.score.toFixed(2);
  return s.passed ? "PASS" : "FAIL";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "succeeded") {
    return (
      <Badge variant="success" className="gap-1">
        <CircleCheck className="h-3.5 w-3.5" />
        succeeded
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleX className="h-3.5 w-3.5" />
        failed
      </Badge>
    );
  }
  if (status === "running" || status === "pending") {
    return (
      <Badge variant="warning" className="gap-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {status}
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-sm" title={hint}>
        {value}
      </span>
    </div>
  );
}

// 머신 스코어러 게이트 3상태 표면화 — verdict/compare/benchmark 공통 의미.
//  scored        🟢 score 그대로
//  criteria_weak 🟡 score + "신뢰 보류"
//  no_criteria   🔴 "기준 없음" (score 칸 —)
// SSOT: 게이트 메타(emoji·label·help·variant)는 여기 한 곳뿐. grade-panel·comparison-view 가 import.
export const machineGateMeta: Record<
  MachineGateStatus,
  { emoji: string; label: string; help: string; variant: "success" | "warning" | "destructive" }
> = {
  scored: {
    emoji: "🟢",
    label: "기준 충분",
    help: "successCriteria 가 충분해 머신이 정상 채점했습니다. 점수는 0~1.",
    variant: "success",
  },
  criteria_weak: {
    emoji: "🟡",
    label: "신뢰 보류",
    help: "기준이 있으나 모호해 점수는 내되 신뢰를 보류합니다. detail 의 기준 보강 제안을 참고하세요.",
    variant: "warning",
  },
  no_criteria: {
    emoji: "🔴",
    label: "기준 없음",
    help: "successCriteria 가 비어 채점 불가(통과로 위장 금지). 기준 초안 제안을 시나리오에 반영하세요.",
    variant: "destructive",
  },
};

// machine score 의 detail.gateStatus 기준으로 verdict-strip 의 한 칸 표시.
// 구조적 타입(fmtScore 호환 + detail.gateStatus)으로 받아 hook 추론과의 타입 결합 회피.
interface MachineScoreLike {
  passed: boolean;
  score: number | null;
  detail?: { gateStatus?: MachineGateStatus } | null;
}
function MachineMetric({ machine }: { machine: MachineScoreLike | null | undefined }) {
  if (machine === null || machine === undefined) {
    return <Metric label="머신" value="—" />;
  }
  const gate = machine.detail?.gateStatus;
  if (gate === undefined) {
    // gateStatus 없는 레거시 machine score — score/PASS-FAIL 만.
    return <Metric label="머신" value={fmtScore(machine)} />;
  }
  const meta = machineGateMeta[gate];
  const valueText =
    gate === "no_criteria" ? "—" : `${meta.emoji} ${fmtScore(machine)}`;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        머신
        <InfoMark label={`머신 스코어러 — ${meta.label}`} help={meta.help} />
      </span>
      <span className="font-mono text-sm">
        {gate === "no_criteria" ? `🔴 ${meta.label}` : valueText}
        {gate === "criteria_weak" && (
          <Badge variant="warning" className="ml-1 text-[10px]">
            {meta.label}
          </Badge>
        )}
      </span>
    </div>
  );
}

export function VerdictStrip({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const { data: scores } = useScores(runId);
  const { data: scenario } = useScenario(run?.scenarioId);
  const running = run?.status === "running" || run?.status === "pending";
  const { data: diffFiles } = useRunDiff(runId, running);
  // run 은 assetName/commit 을 안 들고 있어 목록 항목으로 보강(기존 useRuns 재사용).
  const { data: runs } = useRuns();

  if (runId === null || run === undefined) return null;

  const listItem = (runs ?? []).find((r) => r.id === runId);
  const allScores = scores ?? [];
  // 직전 점수 — 같은 scorer 가 여러 번이면 마지막 것.
  const lastBy = (scorer: string) => {
    const filtered = allScores.filter((s) => s.scorer === scorer);
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  };
  const assertion = lastBy("assertion");
  const judge = lastBy("llm_judge");
  const human = lastBy("human");
  const machine = lastBy("machine");

  const duration =
    run.startedAt !== null && run.finishedAt !== null
      ? Date.parse(run.finishedAt) - Date.parse(run.startedAt)
      : null;
  const fmtDuration =
    duration === null ? (running ? "진행 중" : "—") : duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;

  const tokens =
    run.promptTokens === null && run.completionTokens === null
      ? running
        ? "집계 대기"
        : "—"
      : `${(run.promptTokens ?? 0).toLocaleString()} + ${(run.completionTokens ?? 0).toLocaleString()}`;
  const cost = run.costUsd === null ? "—" : `$${run.costUsd.toFixed(4)}`;
  const changedFiles = diffFiles === undefined ? "—" : String(diffFiles.length);

  const src = sourceToken(run.source);
  const scenarioName = scenario?.name ?? listItem?.scenarioName ?? "—";
  const assetKind = listItem?.assetKind ?? "";
  const assetName = listItem?.assetName ?? "—";
  const commit = listItem?.gitCommit ?? "";

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-2.5 p-3">
        {/* (2) 출처 브레드크럼 — run 은 어디선가 점프해온 landing */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">출처</span>
          <ChevronRight className="h-3 w-3" />
          <span>
            시나리오 <span className="text-foreground">{scenarioName}</span>
          </span>
          <ChevronRight className="h-3 w-3" />
          <span>
            {assetKind !== "" && <span className="opacity-70">{assetKind} </span>}
            <span className="text-foreground">{assetName}</span>
          </span>
          {commit !== "" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="font-mono text-foreground">{commit.slice(0, 8)}</span>
            </>
          )}
        </div>

        {/* (1) 판정 한 줄 — 흩어진 숫자를 한 줄로 */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <Badge variant={src.variant} className="gap-1">
              {src.label}
              <InfoMark label={`설계 source: ${src.label}`} help={src.help} />
            </Badge>
          </div>
          <Metric label="단언" value={fmtScore(assertion)} />
          <Metric label="LLM 판정" value={fmtScore(judge)} />
          <MachineMetric machine={machine} />
          <Metric label="사람" value={fmtScore(human)} />
          <Metric label="토큰 (p+c)" value={tokens} />
          <Metric label="비용" value={cost} />
          <Metric label="시간" value={fmtDuration} />
          <Metric label="변경 파일" value={changedFiles} />
        </div>
      </CardContent>
    </Card>
  );
}
