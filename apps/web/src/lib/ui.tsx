import type { ReactNode } from "react";
import { AlertCircle, HelpCircle, Info, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { ApiError } from "./api-client";
import { cn } from "./utils";

// OPSP-32 (재작성): shadcn/ui 기반 공통 프리미티브.
// 인라인 스타일·CSS Modules 모두 제거 — Tailwind 클래스 + Radix.

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-label="로딩 중" role="status" />;
}

export function Loading({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner />
      {label}
    </span>
  );
}

// InfoMark — hover/포커스 시 Radix Tooltip(접근성·모바일 친화).
// span 으로 렌더 — Button 안에 들어가도 button 중첩 경고 안 남.
export function InfoMark({ help, label }: { help: string; label?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            tabIndex={0}
            aria-label={label === undefined ? help : `${label}: ${help}`}
            className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted-foreground hover:text-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <HelpCircle className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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

export function ErrorNotice({ error }: { error: unknown }) {
  const f = friendlyError(error);
  return (
    <Alert variant={f.tone === "info" ? "info" : "destructive"}>
      {f.tone === "info" ? <Info className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      <AlertTitle>{f.title}</AlertTitle>
      <AlertDescription>
        <div>{f.body}</div>
        {f.cta !== undefined && <div className="mt-1.5 font-semibold">{f.cta}</div>}
      </AlertDescription>
    </Alert>
  );
}

export function InlineError({ error }: { error: unknown }) {
  const f = friendlyError(error);
  return (
    <span className={cn("text-xs", f.tone === "info" ? "text-info" : "text-destructive")}>
      {f.body}
    </span>
  );
}

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
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint !== undefined && (
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      )}
      {children}
    </div>
  );
}
