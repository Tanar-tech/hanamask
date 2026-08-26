import { describe, expect, it } from "vitest";
import { filterNavItems, pinnedNavItems, type NavItem } from "../../src/renderer/text/navFilter";

const notebook = (
  title: string,
  updatedAt: string,
  pageCount = 0,
  pinnedAt: string | null = null,
): NavItem => ({
  kind: "notebook",
  notebook: { id: `nb-${title}`, title, updatedAt, pageCount, pinnedAt },
});

const page = (
  title: string,
  updatedAt: string,
  notebookTitle: string | null = null,
  pinnedAt: string | null = null,
): NavItem => ({
  kind: "page",
  page: { id: `page-${title}`, title, updatedAt, notebookTitle, pinnedAt },
});

const LOCAL_LLM = notebook("ローカルLLM組み込み", "2026-08-20T00:00:00.000Z", 4);
const RELEASE = notebook("リリース運用", "2026-08-18T00:00:00.000Z", 6);
const UNFILED = page("WSLからMCPへ接続する手順", "2026-08-19T00:00:00.000Z");
const FILED = page("T48 意味検索の実装", "2026-08-17T00:00:00.000Z", "ローカルLLM組み込み");
const ITEMS: NavItem[] = [FILED, RELEASE, UNFILED, LOCAL_LLM];

const titlesOf = (items: NavItem[]): string[] =>
  items.map((item) => (item.kind === "notebook" ? item.notebook.title : item.page.title));

describe("filterNavItems", () => {
  it("絞り込みがないときはノートと無所属ページだけを更新日の新しい順に並べる", () => {
    expect(titlesOf(filterNavItems("", ITEMS))).toEqual([
      "ローカルLLM組み込み",
      "WSLからMCPへ接続する手順",
      "リリース運用",
    ]);
  });

  it("空白だけの絞り込みは絞り込んでいないものとして扱う", () => {
    expect(filterNavItems("   ", ITEMS)).toEqual(filterNavItems("", ITEMS));
  });

  it("ノート名がヒットしたらそのノートを出す", () => {
    expect(titlesOf(filterNavItems("リリース", ITEMS))).toEqual(["リリース運用"]);
  });

  it("ページ名がヒットしたら所属を問わず出す", () => {
    expect(titlesOf(filterNavItems("T48", ITEMS))).toEqual(["T48 意味検索の実装"]);
    expect(titlesOf(filterNavItems("手順", ITEMS))).toEqual(["WSLからMCPへ接続する手順"]);
  });

  it("大文字小文字は区別しない", () => {
    expect(titlesOf(filterNavItems("llm", ITEMS))).toEqual(["ローカルLLM組み込み"]);
  });

  it("ヒットしなければ空になる", () => {
    expect(filterNavItems("該当なし", ITEMS)).toEqual([]);
  });

  it("行が1つも無くても壊れない", () => {
    expect(filterNavItems("", [])).toEqual([]);
    expect(filterNavItems("なにか", [])).toEqual([]);
  });

  it("渡された配列は書き換えない", () => {
    const original = [...ITEMS];
    filterNavItems("", ITEMS);
    expect(ITEMS).toEqual(original);
  });
});

describe("pinnedNavItems", () => {
  it("ピン留めした順（pinnedAt昇順）にノートとページを混ぜて返す", () => {
    const pinnedNotebook = notebook("リリース運用", "2026-08-18T00:00:00.000Z", 6, "2026-08-21T10:00:00.000Z");
    const pinnedPage = page("T48 意味検索の実装", "2026-08-17T00:00:00.000Z", "ローカルLLM組み込み", "2026-08-21T09:00:00.000Z");
    const pinnedUnfiled = page("WSLからMCPへ接続する手順", "2026-08-19T00:00:00.000Z", null, "2026-08-21T11:00:00.000Z");

    expect(titlesOf(pinnedNavItems([pinnedNotebook, pinnedUnfiled, pinnedPage]))).toEqual([
      "T48 意味検索の実装",
      "リリース運用",
      "WSLからMCPへ接続する手順",
    ]);
  });

  it("ピン留めしていない行は除く", () => {
    expect(pinnedNavItems(ITEMS)).toEqual([]);
  });

  it("行が1つも無くても壊れない", () => {
    expect(pinnedNavItems([])).toEqual([]);
  });

  it("渡された配列は書き換えない", () => {
    const pinned = [
      notebook("あと", "2026-08-18T00:00:00.000Z", 0, "2026-08-21T10:00:00.000Z"),
      notebook("さき", "2026-08-18T00:00:00.000Z", 0, "2026-08-21T09:00:00.000Z"),
    ];
    const original = [...pinned];
    pinnedNavItems(pinned);
    expect(pinned).toEqual(original);
  });
});
