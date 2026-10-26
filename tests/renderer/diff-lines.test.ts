import { describe, expect, it } from "vitest";
import { buildLineDiff } from "../../src/renderer/diff-lines";

const lines = (count: number, prefix = "line"): string =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(
    "\n",
  );

describe("buildLineDiff", () => {
  it("同じ内容なら変化なし", () => {
    const diff = buildLineDiff("a\nb", "a\nb");

    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it("足した行と消した行を行数で数える", () => {
    const diff = buildLineDiff("a\nb\nc", "a\nB\nc\nd");

    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
  });

  it("変わった行を add / del、周りを ctx として並べる", () => {
    const diff = buildLineDiff("a\nb\nc", "a\nB\nc");

    expect(diff.rows).toEqual([
      { kind: "ctx", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "ctx", text: "c" },
    ]);
  });

  it("末尾の改行の有無だけの違いは変化と扱わない", () => {
    const diff = buildLineDiff("a\nb", "a\nb\n");

    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it("空行も1行として数える", () => {
    const diff = buildLineDiff("a", "a\n\n\nb");

    expect(diff.added).toBe(3);
    expect(
      diff.rows.filter((row) => row.kind === "add").map((row) => row.text),
    ).toEqual(["", "", "b"]);
  });

  it("空から書いたときは全行が add", () => {
    const diff = buildLineDiff("", "x\ny");

    expect(diff.rows).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
    expect(diff.removed).toBe(0);
  });

  it("変わらない行が3行までなら畳まない", () => {
    const diff = buildLineDiff(`${lines(3)}\nold`, `${lines(3)}\nnew`);

    expect(diff.rows.filter((row) => row.kind === "skip")).toEqual([]);
    expect(diff.rows.filter((row) => row.kind === "ctx")).toHaveLength(3);
  });

  it("先頭の変わらない4行以上は、変更の直前1行だけ残して畳む", () => {
    const diff = buildLineDiff(`${lines(5)}\nold`, `${lines(5)}\nnew`);

    expect(diff.rows).toEqual([
      { kind: "skip", text: "", skipped: 4 },
      { kind: "ctx", text: "line5" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
    ]);
  });

  it("末尾の変わらない4行以上は、変更の直後1行だけ残して畳む", () => {
    const diff = buildLineDiff(`old\n${lines(5)}`, `new\n${lines(5)}`);

    expect(diff.rows).toEqual([
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "ctx", text: "line1" },
      { kind: "skip", text: "", skipped: 4 },
    ]);
  });

  it("変更に挟まれた変わらない4行以上は、両側1行ずつ残して畳む", () => {
    const diff = buildLineDiff(`a\n${lines(6)}\nb`, `A\n${lines(6)}\nB`);

    expect(diff.rows).toEqual([
      { kind: "del", text: "a" },
      { kind: "add", text: "A" },
      { kind: "ctx", text: "line1" },
      { kind: "skip", text: "", skipped: 4 },
      { kind: "ctx", text: "line6" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
    ]);
  });

  it("挟まれた4行ちょうどなら、真ん中の2行を畳む", () => {
    const diff = buildLineDiff(`a\n${lines(4)}\nb`, `A\n${lines(4)}\nB`);

    expect(diff.rows.find((row) => row.kind === "skip")).toEqual({
      kind: "skip",
      text: "",
      skipped: 2,
    });
  });
});
