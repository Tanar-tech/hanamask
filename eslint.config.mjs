import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const config = [
  {
    ignores: ["out/**", "dist/**", "release/**", "node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // LazyMotion(strict)構成のため、初期ロードに載る motion.* を機械的に禁止する
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "motion/react",
              importNames: ["motion"],
              message:
                "アニメーションは motion/react-m の m.* を使う（motion.* は初期ロードを約120kB増やす）。",
            },
          ],
        },
      ],
    },
  },
];

export default config;
