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

// 모든 탭이 본문 배너를 없애고 헤더 ⓘ Dialog 로 통일한다(화면 점유 제거).
// 타입을 GUIDES 키 전체로 두어 메타가 GUIDES 와 따로 노는 드리프트를 코드로 방지.
type InfoTab = keyof typeof GUIDES;

// 탭별 사용법을 헤더 ⓘ Dialog 로 띄운다. 안내 내용(제목·steps)은 GUIDES 단일 출처에서
// 가져오고, 보조 description 만 여기서 정의한다.
const DIALOG_META: Record<InfoTab, { description: string; label: string }> = {
  overview: {
    description: "개요 탭에서 무엇을 보는지 한눈에.",
    label: "개요 사용법",
  },
  registry: {
    description: "자산을 등록·스캔하고, 상태를 읽고, 트리거를 평가하고, 안 쓰는 건 정리하는 곳.",
    label: "프로젝트 사용법",
  },
  work: {
    description: "Cursor 작업을 골라 평가·개선안·트레이스를 한 화면에서.",
    label: "작업 사용법",
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
