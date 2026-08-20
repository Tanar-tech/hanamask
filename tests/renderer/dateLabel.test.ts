import { describe, expect, it } from "vitest";
import { toDateLabel, toUpdatedLabel } from "../../src/renderer/text/dateLabel";

describe("dateLabel", () => {
  it("ISO文字列を利用者のタイムゾーンの日付にする", () => {
    const iso = "2026-08-03T00:00:00.000Z";
    const expected = new Date(iso);
    const pad = (value: number): string => String(value).padStart(2, "0");
    expect(toDateLabel(iso)).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    );
  });

  it("更新ラベルは「更新 」を前置する", () => {
    expect(toUpdatedLabel("2026-08-03T00:00:00.000Z")).toMatch(/^更新 \d{4}-\d{2}-\d{2}$/);
  });

  it("解釈できない文字列は空にする（欄を壊さない）", () => {
    expect(toDateLabel("not-a-date")).toBe("");
    expect(toUpdatedLabel("not-a-date")).toBe("");
  });
});
