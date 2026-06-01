import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const STORAGE_KEY = "opspilot-workflow-guide";

type GuideTab = "overview" | "feedback" | "runs" | "registry";

const GUIDES: Record<
  GuideTab,
  { headline: string; steps: { label: string; detail: string }[]; footnote?: string }
> = {
  overview: {
    headline: "내 자산이 제대로·일관되게 쓰이나 — 한눈에",
    steps: [
      {
        label: "① Top 5",
        detail:
          "위 리더보드는 최근 7/30일 내 로컬 세션 전체에서 가장 많이 쓴 에이전트·스킬입니다. 프로젝트와 무관하게 항상 채워집니다.",
      },
      {
        label: "② 미사용 N",
        detail:
          "아래 자산 헬스에서 프로젝트를 고르면 미사용(prune 후보)·형식 오류가 한눈에 보입니다. 호출된 적 없는 자산이 prune 1순위입니다.",
      },
      {
        label: "③ 자세히",
        detail:
          "행을 누르거나 「프로젝트 탭에서 자세히」로 넘어가면 버전·시나리오·트리거 평가까지 깊게 봅니다.",
      },
    ],
    footnote: "여기는 보는 화면. 등록·스캔·저작·실행은 프로젝트 탭에서.",
  },
  feedback: {
    headline: "Cursor 작업 → eval → 개선안 검토 (HITL)",
    steps: [
      {
        label: "1. Ingest",
        detail:
          "Cursor에서 작업을 마친 뒤 MCP `ingest_cursor_session`(또는 REST ingest)으로 세션 번들을 넣습니다.",
      },
      {
        label: "2. Eval 관측",
        detail:
          "ingest 상세 「처리 단계」에서 Ingest→Eval→Review→HITL→반영 진행을 확인합니다. evaluating이면 eval 트레이스가 「실행 / 트레이스」 탭으로 열립니다.",
      },
      {
        label: "3. 개선안",
        detail:
          "done/reviewed 후 draft proposal을 승인·거절합니다. 승인한 뒤 「clone에 반영」하면 등록된 프로젝트 클론에 git 커밋됩니다.",
      },
      {
        label: "4. (선택) Review",
        detail:
          "proposal-reviewer가 자동 검토합니다. draft가 남으면 「review 시작」으로 수동 재큐할 수 있습니다.",
      },
    ],
    footnote: "거절 패턴이 다음 eval에 자동 반영되지는 않습니다 (플라이휠 미구현).",
  },
  runs: {
    headline: "모든 run의 트레이스·점수·diff 관측실",
    steps: [
      {
        label: "어디서 오나",
        detail:
          "피드백 eval/review run, 프로젝트 탭에서 띄운 harness run, 벤치마크·버전 비교 run이 같은 목록에 쌓입니다.",
      },
      {
        label: "흐름 그래프",
        detail: "에이전트가 어떤 도구를 호출했는지, 하위 에이전트에 위임했는지 단계별로 봅니다.",
      },
      {
        label: "평가",
        detail: "시나리오 assertion 자동 채점, 사람 점수·회고 메모, AI 트레이스 분석, 변경 diff를 같은 run에서 확인합니다.",
      },
      {
        label: "피드백으로 돌아가기",
        detail: "eval/review run은 피드백 ingest 상세의 「eval 트레이스」「review 트레이스」 버튼과 연결됩니다.",
      },
    ],
  },
  registry: {
    headline: "Harness 자산 — 등록 · 저작 · 실행 · 채택",
    steps: [
      {
        label: "준비",
        detail: "git URL로 프로젝트 등록 → 스캔 → (권장) 버전 강제 훅 설치. agent-crew는 sync로 `.claude`에 반영.",
      },
      {
        label: "저작",
        detail: "자산 폼으로 에이전트/스킬/커맨드 작성. 저장 시 구조화 커밋 = 버전 하나.",
      },
      {
        label: "실행",
        detail: "버전 × 시나리오로 격리 worktree 실행. fixture(0토큰) 또는 local-claude.",
      },
      {
        label: "채택",
        detail: "버전 비교·벤치마크로 가린 버전을 「이 버전 채택」 — git 앞으로 감기.",
      },
    ],
    footnote: "일상 Cursor 코딩 루프는 피드백 탭이 중심, harness 실험은 이 탭.",
  },
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function WorkflowGuide({ tab }: { tab: GuideTab }) {
  const [open, setOpen] = useState(() => !readCollapsed());
  const guide = GUIDES[tab];

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="h-4 w-4 text-primary" />
          {guide.headline}
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={toggle}>
          {open ? (
            <>
              접기
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              사용법 펼치기
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 border-t border-primary/10 pt-3 pb-4">
          <ol className="space-y-2.5">
            {guide.steps.map((step) => (
              <li key={step.label} className="flex gap-3 text-sm">
                <span className="shrink-0 font-medium text-foreground">{step.label}</span>
                <span className="text-muted-foreground">{step.detail}</span>
              </li>
            ))}
          </ol>
          {guide.footnote !== undefined && (
            <p className="text-xs text-muted-foreground/80">{guide.footnote}</p>
          )}
          <p className="text-xs text-muted-foreground">
            상세·MCP 등록·한계는 레포{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">README.md</code>{" "}
            「5분 시작 — Cursor 피드백 루프」 참고.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
