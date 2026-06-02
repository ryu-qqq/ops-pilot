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

// 개요 탭 본문 배너를 대체하는 헤더 ⓘ — 클릭 시 사용법 Dialog.
// 안내 내용은 GUIDES.overview 단일 출처에서 가져온다(중복 방지).
export function OverviewInfoDialog() {
  const [open, setOpen] = useState(false);
  const guide = GUIDES.overview;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="개요 사용법"
        aria-label="개요 사용법 열기"
      >
        <Info className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{guide.headline}</DialogTitle>
            <DialogDescription>
              개요 탭에서 무엇을 보는지 한눈에.
            </DialogDescription>
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
