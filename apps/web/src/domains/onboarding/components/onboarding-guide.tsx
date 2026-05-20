import { useProjects } from "../../project/use-project";
import { useRuns } from "../../run/use-run";
import { useOnboardingDismissed } from "../use-onboarding";

type Tab = "registry" | "runs";

interface Props {
  tab: Tab;
  onSwitchTab: (tab: Tab) => void;
}

// 컨텍스트 기반 next-action 배너. "지금 무엇을 하면 되는지"를 전역 상태로 판단.
// 정밀 가이드(.claude 유무 등)는 OPSP-25 EmptyState/ErrorNotice 가 담당 —
// 여기는 *전체 흐름* 안내. 의존성 0(투어 라이브러리 미사용).
type Step =
  | "register-project"
  | "run-scenario"
  | "review-traces"
  | "done"; // 모든 길을 한 번씩 밟은 뒤 — 가이드는 닫힘 안내만

interface StepCopy {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

function pickStep(args: { projects: number; runs: number; tab: Tab }): Step {
  if (args.projects === 0) return "register-project";
  if (args.runs === 0) return "run-scenario";
  if (args.tab !== "runs") return "review-traces";
  return "done";
}

export function OnboardingGuide({ tab, onSwitchTab }: Props) {
  const { data: projects } = useProjects();
  const { data: runs } = useRuns();
  const { dismissed, dismiss, reopen } = useOnboardingDismissed();

  // 가이드 끈 상태에선 우상단에 "가이드 보기" 토글만.
  if (dismissed) {
    return (
      <div style={{ textAlign: "right", marginBottom: 8 }}>
        <button
          type="button"
          onClick={reopen}
          style={{
            background: "transparent",
            border: "1px solid #d0d7de",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 12,
            color: "#57606a",
            cursor: "pointer",
          }}
        >
          가이드 보기
        </button>
      </div>
    );
  }

  // 데이터 로딩 전엔 자리만 잡고 카피 표시 보류 (깜빡임 방지).
  const projectCount = projects?.length ?? null;
  const runCount = runs?.length ?? null;
  if (projectCount === null || runCount === null) return null;

  const step = pickStep({ projects: projectCount, runs: runCount, tab });

  const copy: Record<Step, StepCopy> = {
    "register-project": {
      title: "1단계 — 프로젝트를 등록하세요",
      body:
        "상단 ‘프로젝트 등록’에 git URL(또는 로컬 경로)을 넣고 등록하면 OpsPilot이 클론해 작업 베이스를 만듭니다. " +
        "보통 프로젝트엔 .claude가 없는 게 정상 — 다음 단계에서 첫 자산을 작성하면 자동으로 생성됩니다.",
    },
    "run-scenario": {
      title: "2단계 — 자산을 만들고 시나리오를 실행하세요",
      body:
        "프로젝트를 선택하면 오른쪽 ‘새 자산 작성’으로 에이전트/스킬/커맨드를 만들 수 있어요. " +
        "저장하면 강제 구조화 커밋으로 v1 버전이 생기고, 그 버전을 골라 시나리오(목적·입력·기대·성공조건)를 실행하면 격리 worktree에서 돌아갑니다.",
    },
    "review-traces": {
      title: "3단계 — 트레이스와 사람 평가로 결과를 살피세요",
      body:
        "실행이 끝나면 ‘실행 / 트레이스’ 탭에서 단계별 흐름을 볼 수 있어요. " +
        "트레이스 옆 사람 점수(0~1)와 메모로 ‘성공조건 대비 어땠는지’를 기록해 두면 회귀·추천의 연료가 됩니다.",
      action: { label: "‘실행 / 트레이스’ 탭으로", onClick: () => onSwitchTab("runs") },
    },
    done: {
      title: "기본 흐름 완료 — 평가가 OpsPilot의 본질",
      body:
        "저작 → 격리 실행 → 트레이스 → 사람 평가 루프를 한 번씩 밟았습니다. " +
        "같은 시나리오를 다른 버전으로 다시 돌려 비교해 보세요. 가이드는 우상단 ‘가이드 보기’로 언제든 다시 열 수 있습니다.",
    },
  };

  const c = copy[step];

  return (
    <div
      style={{
        border: "1px solid #0969da",
        background: "#ddf4ff",
        color: "#0a3069",
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 12,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{c.title}</strong>
        <button
          type="button"
          onClick={dismiss}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            color: "#0969da",
            cursor: "pointer",
            fontSize: 12,
          }}
          title="이 가이드를 닫습니다 (우상단 ‘가이드 보기’로 다시 열 수 있음)"
        >
          닫기
        </button>
      </div>
      <div style={{ marginTop: 4 }}>{c.body}</div>
      {c.action && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={c.action.onClick}
            style={{
              background: "#0969da",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {c.action.label}
          </button>
        </div>
      )}
    </div>
  );
}
