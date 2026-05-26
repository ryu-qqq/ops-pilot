# PR 제목 convention

커밋 subject와 **동일 규칙** — [commit-format.md](./commit-format.md) 참조.

## 규칙

```
<type>(<scope>): <TICKET> <한 줄 요약>
```

- GitHub/GitLab PR 제목 = squash merge 시 최종 커밋 메시지가 되는 경우가 많다.
- PR 본문에는 `why:`·스크린샷·테스트 plan. **제목에 why를 넣지 않는다.**

## Anti-pattern

| 나쁜 예 | 이유 |
|---|---|
| `Update docs` | type·티켓 없음 |
| `SPC-120` | 요약 없음 |
| `fix bug` | TICKET·scope 없음 |

## GitHub PR template (각 레포 `.github/` — agent-crew 밖)

레포 루트에 두는 것을 권장:

```markdown
## Summary
- 

## Test plan
- [ ] 

<!-- PR 제목 = commit-format subject (squash 시 그대로 사용) -->
```

agent-crew는 PR template 파일을 sync하지 않는다 — 앱 레포마다 CI·리뷰 규칙이 다르기 때문.
