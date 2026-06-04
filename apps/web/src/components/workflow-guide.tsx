// 탭별 사용법 안내의 단일 출처(GUIDES). 본문 인라인 배너는 제거됐고, 모든 탭이
// 헤더 ⓘ Dialog(overview-info-dialog.tsx)에서 이 GUIDES 를 읽어 띄운다.

type GuideTab = "overview" | "work" | "registry";

export interface GuideContent {
  headline: string;
  steps: { label: string; detail: string }[];
  footnote?: string;
}

export const GUIDES: Record<GuideTab, GuideContent> = {
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
  work: {
    headline: "Cursor 작업을 골라 평가·개선안·트레이스를 한 화면에서",
    steps: [
      {
        label: "1. 작업 목록",
        detail:
          "Cursor 작업(ingest)과 수동 실행(run)이 한 목록에 쌓입니다. 자동 ingest(ADR 0004)가 켜져 있으면 새 커밋이 주기 스캔으로 자동 평가됩니다. 항목을 누르면 상세로 들어갑니다.",
      },
      {
        label: "2. 평가·트레이스",
        detail:
          "상세에서 판정(VerdictStrip)·처리 단계·시나리오 자동 채점·사람 점수·AI 트레이스 분석을 봅니다. 트레이스 리스트와 흐름 그래프로 에이전트의 도구 호출·위임을 단계별로 확인합니다.",
      },
      {
        label: "3. 개선안 (HITL)",
        detail:
          "done/reviewed 후 draft proposal을 승인·거절합니다. 승인 뒤 「clone에 반영」하면 등록된 프로젝트 클론에 git 커밋됩니다.",
      },
      {
        label: "4. 파이프라인 액션",
        detail:
          "막히거나 실패한 작업은 eval 재처리·review 시작/재처리, 멈춘 eval 강제 종료로 다시 흘려보냅니다.",
      },
    ],
    footnote: "거절 패턴이 다음 eval에 자동 반영되지는 않습니다 (플라이휠 미구현).",
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
    footnote: "일상 Cursor 코딩 루프는 작업 탭이 중심, harness 실험은 이 탭.",
  },
};
