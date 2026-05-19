// 공유 ESLint flat config 베이스 (CONVENTIONS.md 4. 도구 설정).
// typescript-eslint: recommended + strict + stylistic. prettier 충돌 규칙은 마지막에 off.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      // 예측가능성: 안 쓰는 변수는 명시적으로 _ 접두사로만 허용
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 결합도: any 남발 차단(불가피하면 명시적으로 주석과 함께 disable)
      "@typescript-eslint/no-explicit-any": "error",
      // 가독성: 타입 import는 type 키워드로 분리(verbatimModuleSyntax와 정합)
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettier,
);
