import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { InlineError } from "../../../lib/ui";
import { useSettings, useUpdateSettings } from "../use-settings";

/**
 * 전역 설정 — 지라/노션 인증 (OPSP-42).
 * 헤더 톱니 버튼 → Dialog. 토큰은 write-only: 저장 여부만 표시, 새로 입력해야 교체.
 */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { data } = useSettings();
  const update = useUpdateSettings();

  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [autoReview, setAutoReview] = useState(false);

  // Dialog 가 열릴 때 저장된 값으로 초기화 — 토큰은 write-only 라 항상 빈 칸.
  useEffect(() => {
    if (open && data) {
      setSiteUrl(data.jira.siteUrl);
      setEmail(data.jira.email);
      setJiraToken("");
      setNotionToken("");
      setAutoReview(data.autoReview);
    }
  }, [open, data]);

  const handleSave = () => {
    update.mutate(
      {
        jira: { siteUrl, email, apiToken: jiraToken || undefined },
        notion: { token: notionToken || undefined },
        autoReview,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="설정" aria-label="설정">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>설정 — 지라 / 노션 연동</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            지라·노션에서 할 일을 가져와 시나리오로 쓰려면 인증 정보가 필요합니다. OpsPilot
            인스턴스 전역 설정이라 한 번만 입력하면 됩니다.
          </p>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Jira</h3>
            <div className="space-y-1.5">
              <Label htmlFor="jira-site">사이트 URL</Label>
              <Input
                id="jira-site"
                placeholder="example.atlassian.net"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jira-email">이메일</Label>
              <Input
                id="jira-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jira-token">API 토큰</Label>
              <Input
                id="jira-token"
                type="password"
                placeholder={
                  data?.jira.apiTokenSet ? "설정됨 — 변경하려면 새로 입력" : "API 토큰 입력"
                }
                value={jiraToken}
                onChange={(e) => setJiraToken(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Notion</h3>
            <div className="space-y-1.5">
              <Label htmlFor="notion-token">Integration 토큰</Label>
              <Input
                id="notion-token"
                type="password"
                placeholder={
                  data?.notion.tokenSet ? "설정됨 — 변경하려면 새로 입력" : "Integration 토큰 입력"
                }
                value={notionToken}
                onChange={(e) => setNotionToken(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">자동 검토</h3>
            <label
              htmlFor="auto-review"
              className="flex cursor-pointer items-start gap-3"
            >
              <Checkbox
                id="auto-review"
                checked={autoReview}
                onCheckedChange={(v) => setAutoReview(v === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm">평가 후 개선안 검토를 자동 실행</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  켜면 평가가 끝나면 proposal-reviewer 가 바로 돌아 검토까지 마칩니다. 끄면 작업이
                  완료에서 멈추고, 검토는 작업별로 직접 실행합니다.
                </span>
              </span>
            </label>
          </section>

          {update.isError && <InlineError error={update.error} />}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
