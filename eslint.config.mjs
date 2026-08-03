// ESLint 9 flat config（Next.js 16 / eslint-config-next 16 はflat configとeslint>=9が前提）。
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    // ビルド成果物・生成物はlint対象外（旧.eslintrc.jsonのignorePatterns相当）
    ignores: ["out/**", "dist/**", "infra/cdk.out/**", ".next/**"],
  },
  {
    rules: {
      // データ取得（fetch後にsetState）をuseEffectで行う正当なパターンを許容する。
      // Next16同梱のreact-hooksルールがasync fetch内のsetStateを同期扱いで誤検知するため。
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
