import { describe, expect, it } from "vitest";

// upload-artifact v7 でスクリーンショットが実際に保存されるかを確かめるための一時的な失敗。
// 確認後に削除する。
describe("temporary", () => {
  it("fails on purpose to trigger the artifact upload", () => {
    expect(true).toBe(false);
  });
});
