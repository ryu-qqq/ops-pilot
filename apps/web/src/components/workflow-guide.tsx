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
    headline: "Harness 자산 — 등록 · 스캔 · 상태 읽기 · 평가 · 정리",
    steps: [
      {
        label: "준비",
        detail:
          "프로젝트 등록 → 스캔 → (권장) 버전 강제 훅 설치. agent-crew 같은 공용 자산은 「agent-crew 동기화」로 `.claude`에 받아옵니다. 스캔하면 자산이 목록에 잡힙니다.",
      },
      {
        label: "상태 읽기",
        detail:
          "자산마다 점 색으로 상태를 봅니다. 빨강(문제)=형식 오류로 트리거가 안 됨, 노랑(주의)=형식 경고가 있거나 한 번도 안 쓰임, 초록(정상)=형식 OK에 쓰이거나 다른 자산에 엮여 있음. 점에 마우스를 올리면 왜 그 색인지 한 줄로 나옵니다. 행을 누르면 그 자산이 뭘 하는지(description)도 상세에 보입니다.",
      },
      {
        label: "트리거 평가",
        detail:
          "트리거 탭에서 이 자산의 description이 제대로 발화하는지 잽니다. 「쿼리 자동생성」으로 켜질·안 켜질 예시 쿼리를 만들고(직접 입력도 됨), 「트리거 평가 실행」이 그 쿼리에서 실제로 트리거되는지 측정합니다(작업을 끝까지 수행하진 않고 첫 호출만 봅니다). 「description 자동개선」은 틀린 케이스로 더 나은 description을 제안합니다 — 자동 반영은 안 하니 복사해 넣으세요.",
      },
      {
        label: "실행 · 채택",
        detail:
          "시나리오 · 실행 탭에서 버전 × 시나리오로 격리 worktree 실행(fixture는 0토큰, local-claude는 실토큰). 버전 비교·벤치마크로 더 나은 버전을 「이 버전 채택」하면 git이 앞으로 감깁니다.",
      },
      {
        label: "정리 (prune)",
        detail:
          "안 쓰는 전용 자산은 버전 탭 아래 「삭제(prune)」로 지웁니다. 파일을 빼고 구조화 커밋을 남긴 뒤 등록·평가 이력까지 영구 삭제합니다(파일은 git에서 복구되지만 평가 이력은 못 살림). 여러 곳이 쓰는 공용 crew 자산은 실수 방지로 막혀 있습니다.",
      },
    ],
    footnote: "일상 Cursor 코딩 루프는 작업 탭이 중심, harness 실험·정리는 이 탭.",
  },
};
