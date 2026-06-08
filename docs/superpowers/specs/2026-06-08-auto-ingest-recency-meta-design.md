# auto-ingest 전체 커밋 최신순 + 작업 목록 날짜·저자

2026-06-08. (1) auto-ingest가 앞 프로젝트만 처리해 다른 프로젝트가 굶는 문제. (2) 작업 목록에 커밋 날짜·저자가 안 보임.

## A. auto-ingest — 전체 커밋 최신순

현재 `runAutoIngestScan`(auto-ingest.ts:90-128)은 listProjects 순서대로 앞 프로젝트 candidates를 batch까지 채우고 return. 앞 프로젝트(platform-bootstrap)에 미평가 많으면 뒤 프로젝트(spc) 굶음. 게다가 candidates를 `reverse()`로 오래된 것부터 넣음.

**바꿈**: 전체 프로젝트의 미평가 커밋을 한 데 모아 **커밋 시각 내림차순**으로 정렬해 상위 batch개. 라운드로빈·공평 분배 불필요 — 최신순이 곧 합리적 우선순위(최근 활동 프로젝트 우선, 한 프로젝트 독점 해소).

- `listRecentCommits`(diff.ts:25, 현재 `{sha, subject}`)에 **committedAt(ISO)·author** 추가. git log 포맷에 `%aI`·`%an` 탭 구분.
- runAutoIngestScan: 프로젝트별 candidates 수집(미ingest·ops커밋 제외) → 전체 합쳐 **committedAt DESC 정렬 → 상위 batch개** ingest.
- 정렬·상위 N 선택을 **순수 함수**로 분리(예: `pickRecentCandidates(candidates[], batch)`) → 단위 테스트(auto-ingest.test.ts 있음). 여러 프로젝트·batch < N에서 최신 커밋 우선·batch cap 검증.

## B. 작업 목록에 커밋 날짜 + 저자

지금 작업 컨텍스트엔 commitSubject만 있다(service.ts:47 resolveCommitSubject로 git 조회). 커밋 날짜·저자도 같이.

- ingest 시 `resolveCommitSubject` 옆에서 커밋 **author·date도 조회**(git show/log `%an`·%aI). commitSubject 저장하는 경로에 commitDate·commitAuthor 함께 저장.
- `ingestBundleContextSchema`(domain.ts:452)에 `commitDate`·`commitAuthor` optional 추가.
- 작업 목록 응답 타입(`IngestBundleListItem`·`ProposalWithSource` 등 commitSubject 들고 가는 것)에 commitDate·commitAuthor 추가. repository의 `json_extract(... commitSubject)` 옆에 commitDate·commitAuthor extract(repository.ts:212·260 등).
- UI: 작업 목록(WorkSection)·상세에 `2026-06-08 · 홍길동` 식 표시. 저자는 공동 레포면 그 커밋을 한 동료 이름. 기존 작업(메타 없음)은 git_ref만 — graceful(없으면 생략).

## 검증
auto-ingest 분배 순수 함수 단위 테스트 + typecheck·lint·build + 실제 스캔으로 여러 프로젝트 최신 커밋이 날짜·저자와 함께 뜨는지.

## 비포함 (YAGNI)
작업 목록 정렬 자체 변경(ingest 시점 DESC 그대로 — auto가 최신 커밋 가져오면 자연히 위), batch/interval 변경, 라운드로빈.
