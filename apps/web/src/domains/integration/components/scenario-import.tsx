import { useState } from "react";
import { Briefcase, Download, FileText, Search } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { EmptyState, InlineError, Loading } from "../../../lib/ui";
import {
  useImportJiraIssue,
  useImportNotionPage,
  useJiraIssues,
  useNotionPages,
} from "../use-integration";

// OPSP-43: 지라/노션 → 시나리오 import.
// 목록에서 1건을 고르면 제목 → name, 본문 → input 으로 폼을 채운다(onImport).
// 성공조건(assertion)은 채우지 않는다 — 실제 업무는 사람·LLM 판정으로 평가(이슈 OPSP-43).

interface Props {
  source: "jira" | "notion";
  onImport: (name: string, input: string) => void;
}

export function ScenarioImport({ source, onImport }: Props) {
  return source === "jira" ? (
    <JiraImport onImport={onImport} />
  ) : (
    <NotionImport onImport={onImport} />
  );
}

type OnImport = (name: string, input: string) => void;

function JiraImport({ onImport }: { onImport: OnImport }) {
  const [projectKey, setProjectKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");
  const issues = useJiraIssues(submittedKey, submittedKey !== "");
  const importIssue = useImportJiraIssue();
  const [importedKey, setImportedKey] = useState<string | null>(null);

  const handleSelect = (key: string) => {
    importIssue.mutate(key, {
      onSuccess: (detail) => {
        onImport(detail.summary, detail.body);
        setImportedKey(detail.key);
      },
    });
  };

  // RunLauncher 가 이미 <form> 이라 여기서 form 중첩은 금지 — div + type="button" 으로.
  const runSearch = () => {
    setSubmittedKey(projectKey.trim());
    setImportedKey(null);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        지라에서 가져오기
      </div>
      <p className="text-xs text-muted-foreground">
        프로젝트 키로 이슈를 조회한 뒤 하나를 고르면 제목·본문이 아래 폼에 채워집니다.
      </p>
      <div className="flex gap-2">
        <Input
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="프로젝트 키 — 예: OPSP"
          className="font-mono"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={projectKey.trim() === ""}
          onClick={runSearch}
        >
          <Search className="h-3.5 w-3.5" />
          조회
        </Button>
      </div>

      {submittedKey !== "" && issues.isPending && <Loading label="이슈 불러오는 중…" />}
      {issues.isError && <InlineError error={issues.error} />}
      {issues.isSuccess && issues.data.length === 0 && (
        <EmptyState
          title="이슈가 없습니다"
          hint="프로젝트 키가 맞는지, 그 프로젝트에 이슈가 있는지 확인하세요."
        />
      )}
      {issues.isSuccess && issues.data.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {issues.data.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                disabled={importIssue.isPending}
                onClick={() => handleSelect(it.key)}
                className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs hover:bg-accent disabled:opacity-50"
              >
                <Badge variant="outline" className="shrink-0 font-mono">
                  {it.key}
                </Badge>
                <span className="flex-1 truncate">{it.summary}</span>
                {it.status !== "" && (
                  <span className="shrink-0 text-muted-foreground">{it.status}</span>
                )}
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {importIssue.isPending && <Loading label="이슈 본문 가져오는 중…" />}
      {importIssue.isError && <InlineError error={importIssue.error} />}
      {importedKey !== null && !importIssue.isPending && !importIssue.isError && (
        <p className="text-xs text-success">
          ✓ {importedKey} 를 폼에 채웠습니다 — 아래에서 다듬어 실행하세요.
        </p>
      )}
    </div>
  );
}

function NotionImport({ onImport }: { onImport: OnImport }) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const pages = useNotionPages(searchedQuery, searched);
  const importPage = useImportNotionPage();
  const [importedId, setImportedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    importPage.mutate(id, {
      onSuccess: (detail) => {
        onImport(detail.title, detail.body);
        setImportedId(detail.id);
      },
    });
  };

  // RunLauncher 가 이미 <form> 이라 여기서 form 중첩은 금지 — div + type="button" 으로.
  const runSearch = () => {
    setSearchedQuery(query.trim());
    setSearched(true);
    setImportedId(null);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-muted-foreground" />
        노션에서 가져오기
      </div>
      <p className="text-xs text-muted-foreground">
        Integration 에 공유된 페이지를 검색합니다. 하나를 고르면 제목·본문이 아래 폼에 채워집니다.
      </p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="검색어 (비우면 공유된 전체)"
        />
        <Button type="button" variant="secondary" size="sm" onClick={runSearch}>
          <Search className="h-3.5 w-3.5" />
          조회
        </Button>
      </div>

      {searched && pages.isPending && <Loading label="페이지 불러오는 중…" />}
      {pages.isError && <InlineError error={pages.error} />}
      {pages.isSuccess && pages.data.length === 0 && (
        <EmptyState
          title="페이지가 없습니다"
          hint="가져오려는 페이지를 노션 Integration 에 공유했는지 확인하세요."
        />
      )}
      {pages.isSuccess && pages.data.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {pages.data.map((pg) => (
            <li key={pg.id}>
              <button
                type="button"
                disabled={importPage.isPending}
                onClick={() => handleSelect(pg.id)}
                className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs hover:bg-accent disabled:opacity-50"
              >
                <span className="flex-1 truncate">{pg.title}</span>
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {importPage.isPending && <Loading label="페이지 본문 가져오는 중…" />}
      {importPage.isError && <InlineError error={importPage.error} />}
      {importedId !== null && !importPage.isPending && !importPage.isError && (
        <p className="text-xs text-success">
          ✓ 페이지를 폼에 채웠습니다 — 아래에서 다듬어 실행하세요.
        </p>
      )}
    </div>
  );
}
