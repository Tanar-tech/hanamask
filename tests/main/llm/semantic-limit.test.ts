import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEMANTIC_LIMIT,
  MAX_SEMANTIC_LIMIT,
  normalizeSemanticLimit,
} from "../../../src/main/llm/semantic-search-service";

describe("normalizeSemanticLimit", () => {
  it("未指定なら既定件数を返す", () => {
    expect(normalizeSemanticLimit(undefined)).toBe(DEFAULT_SEMANTIC_LIMIT);
  });

  it("呼び出し側が既定を指定できる", () => {
    expect(normalizeSemanticLimit(undefined, 5)).toBe(5);
  });

  it("上限を超える値は上限に丸める", () => {
    expect(normalizeSemanticLimit(MAX_SEMANTIC_LIMIT + 1)).toBe(MAX_SEMANTIC_LIMIT);
    expect(normalizeSemanticLimit(100_000)).toBe(MAX_SEMANTIC_LIMIT);
  });

  it("範囲内の値はそのまま返す", () => {
    expect(normalizeSemanticLimit(1)).toBe(1);
    expect(normalizeSemanticLimit(MAX_SEMANTIC_LIMIT)).toBe(MAX_SEMANTIC_LIMIT);
  });

  it("正の整数でなければ受け付けない", () => {
    expect(() => normalizeSemanticLimit(0)).toThrow();
    expect(() => normalizeSemanticLimit(-1)).toThrow();
    expect(() => normalizeSemanticLimit(1.5)).toThrow();
    expect(() => normalizeSemanticLimit(Number.NaN)).toThrow();
    expect(() => normalizeSemanticLimit("10")).toThrow();
    expect(() => normalizeSemanticLimit(null)).toThrow();
  });
});
