import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DURATION_S,
  EASING,
  REDUCED_MOTION_POLICY,
  TRANSITION,
  prefersReducedMotion,
} from "../../src/renderer/styles/motion";

const themeCss = readFileSync(
  fileURLToPath(new URL("../../src/renderer/styles/theme.css", import.meta.url)),
  "utf-8",
);

describe("モーションの共通定数", () => {
  it("duration / easing を1箇所で定義している", () => {
    expect(Object.keys(DURATION_S)).toEqual(["fast", "base", "slow"]);
    expect(DURATION_S.fast).toBeLessThan(DURATION_S.base);
    expect(DURATION_S.base).toBeLessThan(DURATION_S.slow);
    expect(EASING.standard).toHaveLength(4);
  });

  it("プリセットは duration と easing を組み合わせて返す", () => {
    expect(TRANSITION.base).toEqual({
      duration: DURATION_S.base,
      ease: EASING.standard,
    });
  });

  it("reduced motion の方針を motion 側にも公開している", () => {
    expect(REDUCED_MOTION_POLICY).toBe("user");
  });

  it("prefers-reduced-motion の判定をOSの設定から読む", () => {
    const matches = (query: string): boolean =>
      query.includes("prefers-reduced-motion");
    const stub = { matchMedia: (q: string) => ({ matches: matches(q) }) };
    expect(prefersReducedMotion(stub as unknown as Window)).toBe(true);
    expect(prefersReducedMotion(undefined)).toBe(false);
  });
});

describe("CSSトランジションとの整合", () => {
  it("CSS変数のduration がTS側の定数と一致する", () => {
    expect(themeCss).toContain(`--duration-fast: ${DURATION_S.fast * 1000}ms;`);
    expect(themeCss).toContain(`--duration-base: ${DURATION_S.base * 1000}ms;`);
    expect(themeCss).toContain(`--duration-slow: ${DURATION_S.slow * 1000}ms;`);
  });

  it("prefers-reduced-motion: reduce で duration を 0 にする", () => {
    const index = themeCss.indexOf("prefers-reduced-motion: reduce");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(themeCss.slice(index)).toContain("--duration-fast: 0ms;");
  });
});
