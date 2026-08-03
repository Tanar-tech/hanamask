import { describe, expect, it } from "vitest";
import { parseTaskPatch } from "@/lib/task-patch";

// PATCH /api/tasks/[id] のリクエストボディ構造検証（構造化レビュー Critical 1・2 の再発防止）。
describe("parseTaskPatch", () => {
  it("正常な完全パッチを受理する", () => {
    const result = parseTaskPatch({
      name: "設計",
      projectId: "p1",
      startTime: "2026-07-23T09:00:00.000Z",
      endTime: "2026-07-23T10:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.name).toBe("設計");
      expect(result.patch.projectId).toBe("p1");
      expect(result.patch.startTime).toEqual(new Date("2026-07-23T09:00:00.000Z"));
      expect(result.patch.endTime).toEqual(new Date("2026-07-23T10:00:00.000Z"));
    }
  });

  it("部分パッチ（nameのみ）を受理し、他フィールドはundefinedのまま", () => {
    const result = parseTaskPatch({ name: "変更後" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.name).toBe("変更後");
      expect(result.patch.startTime).toBeUndefined();
      expect(result.patch.endTime).toBeUndefined();
      expect(result.patch.projectId).toBeUndefined();
    }
  });

  it("projectId: null（未分類化）と endTime: null（実行中化）は許容する", () => {
    const result = parseTaskPatch({ projectId: null, endTime: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.projectId).toBeNull();
      expect(result.patch.endTime).toBeNull();
    }
  });

  // Critical 1: new Date(null) は 1970-01-01 になりサイレント書換されるため、構造レベルで拒否する
  it("startTime: null は拒否する（エポックへのサイレント書換防止）", () => {
    const result = parseTaskPatch({ startTime: null });
    expect(result.ok).toBe(false);
  });

  it("startTime: 数値・真偽値は拒否する", () => {
    expect(parseTaskPatch({ startTime: 0 }).ok).toBe(false);
    expect(parseTaskPatch({ startTime: false }).ok).toBe(false);
  });

  // Critical 2: name: null が null.trim() でTypeError→500になるため、構造レベルで拒否する
  it("name: null・非文字列は拒否する", () => {
    expect(parseTaskPatch({ name: null }).ok).toBe(false);
    expect(parseTaskPatch({ name: 123 }).ok).toBe(false);
    expect(parseTaskPatch({ name: { x: 1 } }).ok).toBe(false);
  });

  it("projectId: 数値・オブジェクトは拒否する", () => {
    expect(parseTaskPatch({ projectId: 42 }).ok).toBe(false);
    expect(parseTaskPatch({ projectId: {} }).ok).toBe(false);
  });

  it("endTime: 数値は拒否する（nullと文字列のみ許容）", () => {
    expect(parseTaskPatch({ endTime: 0 }).ok).toBe(false);
  });

  it("ボディがオブジェクトでない場合は拒否する", () => {
    expect(parseTaskPatch(null).ok).toBe(false);
    expect(parseTaskPatch("text").ok).toBe(false);
    expect(parseTaskPatch([1, 2]).ok).toBe(false);
  });

  it("不正な日時文字列はDateとしてはパースするが後段バリデーションで検出できるようInvalid Dateを返す", () => {
    const result = parseTaskPatch({ startTime: "not-a-date" });
    // 構造上は文字列なので受理し、意味的検証は validateTaskEdit（NaNチェック）に委ねる
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isNaN(result.patch.startTime?.getTime())).toBe(true);
    }
  });
});
