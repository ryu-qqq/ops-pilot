import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { GUIDES } from "./workflow-guide";

// 헤더 ⓘ 는 본문 배너를 숨긴 탭(overview·registry)에서만 노출한다 — 타입도 그 둘로
// 좁혀 의도를 코드로 강제(미노출 탭 메타가 GUIDES 와 따로 노는 드리프트 방지).
type InfoTab = Extract<keyof typeof GUIDES, "overview" | "registry">;

// 탭별 사용법을 헤더 ⓘ Dialog 로 띄운다. 안내 내용(제목·steps)은 GUIDES 단일 출처에서
// 가져오고, 보조 description 만 여기서 정의한다.
const DIALOG_META: Record<InfoTab, { description: string; label: string }> = {
  overview: {
    description: "개요 탭에서 무엇을 보는지 한눈에.",
    label: "개요 사용법",
  },
  registry: {
    description: "Harness 자산 — 등록 · 저작 · 실행 · 채택 흐름.",
    label: "프로젝트 사용법",
  },
};

export function InfoDialog({ tab }: { tab: InfoTab }) {
  const [open, setOpen] = useState(false);
  const guide = GUIDES[tab];
  const meta = DIALOG_META[tab];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={meta.label}
        aria-label={`${meta.label} 열기`}
      >
        <Info className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{guide.headline}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2.5">
            {guide.steps.map((step) => (
              <li key={step.label} className="flex gap-3 text-sm">
                <span className="shrink-0 font-medium text-foreground">
                  {step.label}
                </span>
                <span className="text-muted-foreground">{step.detail}</span>
              </li>
            ))}
          </ol>
          {guide.footnote !== undefined && (
            <p className="text-xs text-muted-foreground/80">{guide.footnote}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
