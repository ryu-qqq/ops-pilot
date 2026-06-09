/**
 * prismjs 언어 grammar 컴포넌트 모듈 선언.
 * @types/prismjs 는 코어만 타입을 주고 `prismjs/components/prism-*` 서브모듈은 선언이 없어
 * `import('prismjs/components/prism-java')` 동적 import 가 TS7016(implicit any)로 막힌다.
 * 이 grammar 모듈들은 side-effect 로 Prism.languages 에 등록만 하고 값은 안 쓰므로 빈 모듈로 선언한다.
 */
declare module "prismjs/components/prism-*";
