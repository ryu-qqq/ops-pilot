// 루트 ESLint flat config. 실제 규칙은 packages/config 한 곳에서만 정의(설정 드리프트 제거).
import base from "@opspilot/config/eslint";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.vite/**", "**/coverage/**"] },
  ...base,
];
