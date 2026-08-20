import { describe, expect, it } from "vitest";
import { buildDocumentText, maxCharsForContext } from "../../../src/main/llm/text-for-embedding";

describe("maxCharsForContext", () => {
  it("コンテキスト長より多い文字数を許す（1トークンあたり複数文字）", () => {
    expect(maxCharsForContext(8192)).toBeGreaterThan(8192);
  });

  it("コンテキスト長に比例し、整数を返す", () => {
    const small = maxCharsForContext(512);
    const large = maxCharsForContext(1024);
    expect(Number.isInteger(small)).toBe(true);
    expect(large).toBe(small * 2);
  });
});

describe("buildDocumentText", () => {
  it("タイトルと本文を改行でつなぐ", () => {
    expect(buildDocumentText("題名", "本文", 100)).toBe("題名\n本文");
  });

  it("上限を超えたら切り詰める", () => {
    const text = buildDocumentText("あいうえお", "かきくけこ", 3);
    expect(text).toBe("あいう");
    expect(text.length).toBe(3);
  });

  it("空タイトルなら本文だけを返す", () => {
    expect(buildDocumentText("", "本文", 100)).toBe("本文");
  });

  it("空本文ならタイトルだけを返す", () => {
    expect(buildDocumentText("題名", "", 100)).toBe("題名");
  });

  it("両方空なら空文字を返す", () => {
    expect(buildDocumentText("", "", 100)).toBe("");
  });

  it("上限が0以下なら空文字を返す", () => {
    expect(buildDocumentText("題名", "本文", 0)).toBe("");
    expect(buildDocumentText("題名", "本文", -5)).toBe("");
  });
});
