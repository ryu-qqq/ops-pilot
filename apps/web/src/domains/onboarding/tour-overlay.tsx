import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type { TourStep } from "./tour-steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  active: boolean;
  step: TourStep | undefined;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function TourOverlay({ active, step, stepIndex, total, onNext, onPrev, onClose }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    // 비활성이거나 타겟 없는 단계면 측정하지 않음(중앙 말풍선).
    if (!active || step == null || step.target == null) {
      setRect(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    // 탭/드릴다운 직후 타겟이 아직 안 붙었을 수 있어 RAF로 최대 30프레임 재시도.
    const measure = () => {
      // app.tsx 가 모든 탭을 forceMount(inactive 는 hidden)하므로 같은 data-tour 가
      // 숨은 탭에도 존재할 수 있다 → 0 크기(숨김)는 건너뛰고 실제로 보이는 요소를 고른다.
      const candidates = document.querySelectorAll(`[data-tour="${step.target}"]`);
      for (const cand of candidates) {
        const r = cand.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      if (tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(measure);
      } else {
        setRect(null);
      }
    };
    measure();
    // 리사이즈·스크롤 시 위치 갱신.
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, step, stepIndex]);

  if (!active || step == null) return null;

  const isLast = stepIndex >= total - 1;
  const pad = 6;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* 클릭하면 닫힘 — 투명 레이어(딤은 아래 스포트라이트 box-shadow 가 담당) */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      {rect != null ? (
        // 스포트라이트: 타겟 영역만 밝게 두고 주변을 box-shadow 로 어둡게 + 펄스 링.
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        >
          <span className="absolute inset-0 animate-pulse rounded-lg ring-2 ring-primary/70" />
        </div>
      ) : (
        // 타겟이 없으면(엣지) 전체 딤 + 중앙 말풍선.
        <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      )}
      <div
        className="absolute w-[320px] max-w-[90vw] rounded-lg border bg-background p-4 shadow-lg"
        style={
          rect != null
            ? {
                top: Math.min(rect.top + rect.height + 12, window.innerHeight - 200),
                left: Math.min(Math.max(rect.left, 12), window.innerWidth - 332),
              }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
        role="dialog"
        aria-label="가이드 투어"
      >
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold">{step.title}</h4>
          <span className="text-xs text-muted-foreground tabular-nums">
            {stepIndex + 1}/{total}
          </span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                이전
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLast ? "완료" : "다음"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
