import { useEffect, useMemo, useState } from "react";
import type { AssetKind } from "@opspilot/shared-types";
import { ExternalLink, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { useAssets } from "../../registry/use-registry";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetContent, useAuthorAsset, useReviewAuthoring } from "../use-authoring";
import {
  DOCS_URL,
  KEY_META,
  KIND_KEYS,
  type ModelChoice,
  bodyTemplate,
  parseFile,
  serializeFrontmatter,
  validateFrontmatter,
} from "../lib/frontmatter";

interface Props {
  projectId: string;
  selectedAssetId: string | null;
}

const MODEL_OPTIONS: ModelChoice[] = ["inherit", "sonnet", "opus", "haiku"];

export function AssetAuthor({ projectId, selectedAssetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const editing = (assets ?? []).find((a) => a.id === selectedAssetId) ?? null;
  const { data: loadedContent } = useAssetContent(editing ? selectedAssetId : null);
  const author = useAuthorAsset(projectId);
  const review = useReviewAuthoring();

  const [kind, setKind] = useState<AssetKind>("agent");
  const [fm, setFm] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const isEdit = editing !== null;
  const name = fm.name ?? "";

  useEffect(() => {
    if (isEdit) return;
    setFm((prev) => {
      const next: Record<string, string> = {};
      for (const k of KIND_KEYS[kind]) {
        if (typeof prev[k] === "string") next[k] = prev[k];
      }
      return next;
    });
  }, [kind, isEdit]);

  useEffect(() => {
    if (editing) setKind(editing.kind);
  }, [editing]);
  useEffect(() => {
    if (editing && loadedContent !== undefined) {
      const parsed = parseFile(loadedContent);
      setFm({ ...parsed.frontmatter, name: editing.name });
      setBody(parsed.body);
    }
  }, [editing, loadedContent]);

  const serialized = useMemo(() => {
    const fmOnly: Record<string, string> = {};
    for (const k of KIND_KEYS[kind]) {
      const v = fm[k as string];
      if (typeof v === "string" && v.trim() !== "") fmOnly[k as string] = v.trim();
    }
    return serializeFrontmatter(fmOnly) + body;
  }, [fm, body, kind]);

  const validationError = useMemo(() => validateFrontmatter(kind, fm), [kind, fm]);
  const canSubmit = validationError === null && body.trim() !== "" && changeSummary.trim() !== "";

  const setField = (key: string, value: string) => setFm((prev) => ({ ...prev, [key]: value }));
  const applyTemplate = () => setBody(bodyTemplate(kind, name));

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          author.mutate(
            { projectId, kind, name: name.trim(), content: serialized, changeSummary, rationale },
            {
              onSuccess: () => {
                setChangeSummary("");
                setRationale("");
              },
            },
          );
        }}
      >
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {isEdit ? `자산 수정 → 새 버전: ${editing.kind}/${editing.name}` : "새 자산 작성"}
              <InfoMark
                label="자산 저작"
                help="작성/저장은 클론의 .claude 에 파일을 쓰고 ‘ops(kind/name): 변경요약 [opspilot authored]’ 구조화 커밋을 만들며, 그 커밋이 곧 새 자산 버전이 됩니다. 변경 요약이 없으면 저장이 거부됩니다."
              />
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={kind} onValueChange={(v) => !isEdit && setKind(v as AssetKind)} disabled={isEdit}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">agent</SelectItem>
                  <SelectItem value="skill">skill</SelectItem>
                  <SelectItem value="command">command</SelectItem>
                </SelectContent>
              </Select>
              <Button asChild variant="ghost" size="sm">
                <a href={DOCS_URL[kind]} target="_blank" rel="noreferrer noopener">
                  공식 스펙
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              {!isEdit && (
                <Button type="button" variant="outline" size="sm" onClick={applyTemplate}>
                  본문 템플릿
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {KIND_KEYS[kind].map((k) => {
            const key = k as string;
            const meta = KEY_META[key] ?? { label: key, help: "" };
            const value = fm[key] ?? "";
            return (
              <div key={key} className="space-y-1">
                <Label htmlFor={`fm-${key}`} className="flex items-center gap-1">
                  {meta.label}
                  {meta.required && <span className="text-destructive">*</span>}
                  <InfoMark label={meta.label} help={meta.help} />
                </Label>
                {key === "model" ? (
                  <Select value={value} onValueChange={(v) => setField(key, v)}>
                    <SelectTrigger id={`fm-${key}`}>
                      <SelectValue placeholder="inherit" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m === "inherit" ? " " : m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`fm-${key}`}
                    value={value}
                    onChange={(e) => setField(key, e.target.value)}
                    disabled={isEdit && key === "name"}
                    placeholder={meta.placeholder}
                  />
                )}
              </div>
            );
          })}

          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              본문 (markdown)
              <InfoMark
                label="본문"
                help="에이전트/스킬/커맨드의 실제 지시문. frontmatter 위에 자동으로 합쳐져 파일로 저장됩니다."
              />
            </Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="본문(markdown). 위의 ‘본문 템플릿’ 버튼으로 kind별 기본 골격을 얻을 수 있습니다."
              className="font-mono text-xs"
            />
          </div>

          <details
            open={showRaw}
            onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              저장될 파일 미리보기
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              {serialized}
            </pre>
          </details>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">변경 요약 (필수, 커밋에 기록)</Label>
            <Input
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="무엇을 바꿨나"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">이유 (선택)</Label>
            <Input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="왜" />
          </div>

          {validationError !== null && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}

          {/* OPSP-27 A: AI 검수 */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={review.isPending || name.trim() === "" || body.trim() === ""}
              onClick={() => review.mutate({ kind, name: name.trim(), content: serialized })}
            >
              {review.isPending ? (
                <Loading label="Claude 검수 중…" />
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 검수 (의도·개선)
                </>
              )}
            </Button>
            <InfoMark
              label="AI 검수"
              help="저장 전 초안을 로컬 Claude 에 보내 ‘어떤 의도로 읽히는가 + 개선 제안’을 받습니다. 자동 적용 X. 실 토큰 소모."
            />
            {review.isError && <InlineError error={review.error} />}
          </div>
          {review.isSuccess && (
            <Alert variant="info">
              <Sparkles className="h-4 w-4" />
              <AlertTitle>AI 검수 결과</AlertTitle>
              <AlertDescription>
                <pre className="whitespace-pre-wrap font-sans text-sm">{review.data}</pre>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-end gap-3 border-t pt-3">
          {author.isSuccess && (
            <span className="text-xs text-success">
              커밋 {author.data.committed.slice(0, 8)} · 버전 +{author.data.scanned.versions}
            </span>
          )}
          {author.isError && <InlineError error={author.error} />}
          <Button type="submit" disabled={author.isPending || !canSubmit}>
            {author.isPending ? (
              <Loading label="커밋 중…" />
            ) : isEdit ? (
              "수정 저장 → 새 버전"
            ) : (
              "작성 → 버전 생성"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
