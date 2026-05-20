import type { ReactNode } from "react";
import { ApiError } from "./api-client";
import s from "./ui.module.css";

// OPSP-25/28 공통 UX 프리미티브: 일관 스피너 / 친화 에러 / 빈상태 / 정보 마커.
// OPSP-28: 인라인 스타일 제거 → CSS Modules + 디자인 토큰.

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-label="로딩 중"
      role="status"
      className={s.spinner}
      style={{ width: size, height: size }}
    />
  );
}

// 스피너 + 라벨 (버튼 안에서 사용). 진행 중임을 한눈에.
export function Loading({ label }: { label: string }) {
  return (
    <span className={s.loading}>
      <Spinner size={12} />
      {label}
    </span>
  );
}

// 라벨 옆 의미 표시: hover/포커스 시 풍부한 설명(HTML title — 의존성 0).
// 모바일/접근성 보완은 OPSP-28 이후 popover 컴포넌트 도입 시 교체.
export function InfoMark({ help, label }: { help: string; label?: string }) {
  return (
    <span
      tabIndex={0}
      title={help}
      aria-label={label === undefined ? help : `${label}: ${help}`}
      className={s.infoMark}
    >
      ?
    </span>
  );
}

// .claude 미존재(빈 레포)는 정상 동작 — raw JSON 대신 다음 행동을 안내.
function isMissingClaude(err: ApiError): boolean {
  return err.code === "ScanError" && (err.detail ?? "").includes(".claude");
}

interface FriendlyError {
  title: string;
  body: string;
  cta?: string;
  tone: "info" | "error";
}

export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof ApiError) {
    if (isMissingClaude(error)) {
      return {
        tone: "info",
        title: "이 프로젝트엔 아직 자산이 없어요",
        body:
          ".claude 디렉터리가 없는 정상 상태입니다(보통의 프로젝트). " +
          "아래 ‘새 자산 작성’으로 첫 에이전트/스킬/커맨드를 만들면 " +
          "OpsPilot이 .claude를 만들고 자동으로 버전을 생성합니다.",
        cta: "아래에서 첫 자산을 작성하세요 ↓",
      };
    }
    if (error.code === "Duplicate") {
      return { tone: "error", title: "이미 등록된 프로젝트", body: error.detail ?? error.message };
    }
    return {
      tone: "error",
      title: "요청을 처리하지 못했어요",
      body: error.detail ?? error.message,
    };
  }
  return {
    tone: "error",
    title: "오류가 발생했어요",
    body: error instanceof Error ? error.message : String(error),
  };
}

// 친화 에러 패널: 사람말 + (선택) 다음 행동 CTA. raw JSON 절대 노출 안 함.
export function ErrorNotice({ error }: { error: unknown }) {
  const f = friendlyError(error);
  const cls = `${s.notice} ${f.tone === "info" ? s.noticeInfo : s.noticeError}`;
  return (
    <div role="alert" className={cls}>
      <div className={s.noticeTitle}>{f.title}</div>
      <div>{f.body}</div>
      {f.cta !== undefined && <div className={s.noticeCta}>{f.cta}</div>}
    </div>
  );
}

// 한 줄짜리 인라인 에러(폼 제출 옆 등 좁은 자리).
export function InlineError({ error }: { error: unknown }) {
  const f = friendlyError(error);
  const cls = f.tone === "info" ? s.inlineInfo : s.inlineError;
  return <span className={cls}>{f.body}</span>;
}

// 빈상태: 왜 비었고 무엇을 하면 되는지를 문구로 명시.
export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.emptyState}>
      <div className={s.emptyStateTitle}>{title}</div>
      {hint !== undefined && <div className={s.emptyStateHint}>{hint}</div>}
      {children}
    </div>
  );
}
