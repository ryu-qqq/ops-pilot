import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { useAssetLint } from "../use-registry";

interface Props {
  assetId: string | null;
}

// T4-c: 선택 자산의 frontmatter lint (저작 게이트와 동일 규칙) 표시.
export function AssetLint({ assetId }: Props) {
  const { data } = useAssetLint(assetId);
  if (!data) return null;

  const errors = data.issues.filter((i) => i.severity === "error");
  const warnings = data.issues.filter((i) => i.severity === "warning");

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          frontmatter 검증
        </span>
        {data.ok && warnings.length === 0 ? (
          <Badge variant="success" className="text-[10px]">
            통과
          </Badge>
        ) : (
          <>
            {errors.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                error {errors.length}
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="warning" className="text-[10px]">
                warning {warnings.length}
              </Badge>
            )}
          </>
        )}
        {!data.ok && (
          <span className="text-[10px] text-muted-foreground">
            — error 가 있으면 OpsPilot 저작 시 저장이 막힙니다
          </span>
        )}
      </div>
      {data.issues.length > 0 && (
        <ul className="space-y-0.5">
          {data.issues.map((issue, i) => (
            <li
              key={i}
              className={`text-xs ${issue.severity === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
            >
              {issue.severity === "error" ? "✗" : "⚠"}{" "}
              <span className="font-mono">{issue.field}</span> — {issue.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
