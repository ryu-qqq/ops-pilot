import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import type { AssetSource } from "@opspilot/shared-types";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { ErrorNotice } from "../../../lib/ui";
import { useAssets, usePruneAsset } from "../use-registry";

interface Props {
  projectId: string;
  assetId: string;
  // 삭제 성공 시 부모가 선택을 해제하도록(상세 패널이 닫힌다).
  onDeleted?: () => void;
}

// crew/unknown 은 공용 오삭제 방지를 위해 서버가 차단한다. 프론트는 같은 사유를
// 미리 보여주고 버튼을 비활성화해 헛클릭을 줄인다(서버 가드가 최종 권위).
const blockedReason: Record<Exclude<AssetSource, "project-local">, string> = {
  crew: "공용 crew 자산은 삭제 차단",
  unknown: "출처 미확인 — re-sync 후 판정되면 삭제 가능",
};

// 카드 C(prune): 상세 패널 하단의 파괴적 액션 섹션.
// project-local 일 때만 활성. 2단계 확인(버튼 → 사유 입력 + 확정/취소)으로 오삭제 방지.
export function AssetPruneSection({ projectId, assetId, onDeleted }: Props) {
  const { data: assets } = useAssets(projectId);
  const asset = (assets ?? []).find((a) => a.id === assetId) ?? null;
  const prune = usePruneAsset(projectId);

  const [confirming, setConfirming] = useState(false);
  const [rationale, setRationale] = useState("");

  // 자산이 아직 로드 전이면 섹션을 그리지 않는다(분기 판단 불가).
  if (asset === null) return null;

  const handleConfirm = () => {
    prune.mutate(
      { assetId, rationale },
      {
        onSuccess: () => {
          setConfirming(false);
          setRationale("");
          onDeleted?.();
        },
      },
    );
  };

  return (
    <Card className="border-destructive/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        삭제 (prune)
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        클론 .claude 에서 파일을 제거하고 구조화 커밋을 남긴 뒤 등록을 지웁니다.
        파일은 git 에서 복구할 수 있지만,{" "}
        <span className="text-destructive">
          이 자산의 실행·평가(점수·트레이스) 이력은 함께 영구 삭제되어 복구할 수 없습니다.
        </span>
      </p>

      {asset.source !== "project-local" ? (
        <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {blockedReason[asset.source]}
        </div>
      ) : !confirming ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          이 자산 삭제
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            삭제 사유 (선택 — 커밋 메시지에 기록)
          </label>
          <Textarea
            value={rationale}
            onChange={(e) => {
              setRationale(e.target.value);
            }}
            placeholder="예: 6개월 미사용, 기능이 X 스킬로 통합됨"
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={prune.isPending}
              onClick={handleConfirm}
            >
              {prune.isPending ? "삭제 중…" : "정말 삭제"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={prune.isPending}
              onClick={() => {
                setConfirming(false);
                setRationale("");
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {prune.isError && (
        <div className="mt-3">
          <ErrorNotice error={prune.error} />
        </div>
      )}
    </Card>
  );
}
