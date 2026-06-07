/**
 * World 1(자산별 시나리오 채점 + human/machine 점수) 고유 UI 표면 플래그.
 *
 * ADR 0006(World 1 역할 정리 — 격하 후 시한부 정리)의 "즉시(격하)" 단계.
 * 콜드오픈 혼란을 없애려 기본 숨김. scenario/run/score 인프라는 World 2(Cursor
 * 피드백 eval)가 재사용하므로 코드·라우트·도메인은 보존한다 — 되살리려면 true.
 *
 * 가드 지점: registry "시나리오·실행" 탭(asset-detail-panel), work-list 벤치/compare 패널.
 */
export const WORLD1_SCENARIO_SCORING_ENABLED = false;
