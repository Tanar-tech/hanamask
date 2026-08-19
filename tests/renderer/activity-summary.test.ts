import { describe, expect, it } from "vitest";
import {
  STALE_THRESHOLD_DAYS,
  summarizeActivity,
} from "../../src/renderer/components/activity-summary";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW_MS = Date.parse("2026-08-18T12:00:00.000Z");

const agoIso = (elapsedMs: number): string => new Date(NOW_MS - elapsedMs).toISOString();

const summarize = (lastRecordedAt: string | null, recentCount: number) =>
  summarizeActivity({ lastRecordedAt, recentCount }, NOW_MS);

describe("summarizeActivity", () => {
  describe("まだ記録が無いとき", () => {
    it("日数も件数も出さない", () => {
      const summary = summarize(null, 0);

      expect(summary.text).toBe("まだ記録がありません");
      expect(summary.text).not.toMatch(/\d/);
      expect(summary.highlight).toBe(false);
    });

    it("件数が残っていても日数・件数を出さない", () => {
      expect(summarize(null, 5).text).toBe("まだ記録がありません");
    });

    it("日時として読めない文字列も「まだ記録がありません」に倒す", () => {
      expect(summarize("not-a-date", 3).text).toBe("まだ記録がありません");
    });
  });

  describe("途絶えの境界", () => {
    it(`${STALE_THRESHOLD_DAYS}日未満なら目立たせない`, () => {
      const summary = summarize(agoIso(STALE_THRESHOLD_DAYS * DAY_MS - MINUTE_MS), 12);

      expect(summary.highlight).toBe(false);
      expect(summary.text).toBe("今週 12 件 · 最後の記録は 2 日前");
    });

    it(`${STALE_THRESHOLD_DAYS}日ちょうどで目立たせる`, () => {
      const summary = summarize(agoIso(STALE_THRESHOLD_DAYS * DAY_MS), 0);

      expect(summary.highlight).toBe(true);
      expect(summary.text).toBe("3 日間、記録がありません · 最後の記録は 3 日前");
    });

    it(`${STALE_THRESHOLD_DAYS}日超でも目立たせ、日数が伸びる`, () => {
      const summary = summarize(agoIso(8 * DAY_MS), 0);

      expect(summary.highlight).toBe(true);
      expect(summary.text).toBe("8 日間、記録がありません · 最後の記録は 8 日前");
    });
  });

  describe("経過時間の表現", () => {
    it("1分未満は「たった今」", () => {
      expect(summarize(agoIso(30_000), 1).text).toBe("今週 1 件 · 最後の記録は たった今");
    });

    it("1分から60分未満は分で出す", () => {
      expect(summarize(agoIso(MINUTE_MS), 1).text).toContain("1 分前");
      expect(summarize(agoIso(59 * MINUTE_MS), 1).text).toContain("59 分前");
    });

    it("1時間から24時間未満は時間で出す", () => {
      expect(summarize(agoIso(HOUR_MS), 1).text).toContain("1 時間前");
      expect(summarize(agoIso(2 * HOUR_MS), 12).text).toBe("今週 12 件 · 最後の記録は 2 時間前");
      expect(summarize(agoIso(23 * HOUR_MS), 1).text).toContain("23 時間前");
    });

    it("24時間以上は日で出す", () => {
      expect(summarize(agoIso(DAY_MS), 1).text).toContain("1 日前");
    });
  });

  describe("時計がずれているとき", () => {
    it("未来の日時でも壊れず「たった今」に倒す", () => {
      const summary = summarize(agoIso(-3 * DAY_MS), 4);

      expect(summary.text).toBe("今週 4 件 · 最後の記録は たった今");
      expect(summary.highlight).toBe(false);
    });
  });

  describe("直近7日が0件のとき", () => {
    it("記録はあるので0件として出す", () => {
      expect(summarize(agoIso(2 * DAY_MS), 0).text).toBe("今週 0 件 · 最後の記録は 2 日前");
    });
  });
});
