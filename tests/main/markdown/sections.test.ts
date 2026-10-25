import { describe, expect, it } from "vitest";
import {
  appendToMarkdown,
  listHeadings,
  replaceMarkdownSection,
  type SectionEditResult,
} from "../../../src/main/markdown/sections";

const markdownOf = (result: SectionEditResult): string => {
  if (!result.ok) throw new Error(`edit failed: ${result.reason}`);
  return result.markdown;
};

const DOC = [
  "# 案件",
  "",
  "概要",
  "",
  "## 進捗",
  "",
  "- 済み",
  "",
  "### 詳細",
  "",
  "細かい話",
  "",
  "## 残り",
  "",
  "- 未着手",
  "",
].join("\n");

describe("listHeadings", () => {
  it("見出しの深さと文字列を順に返す", () => {
    expect(listHeadings(DOC)).toEqual([
      { depth: 1, text: "案件" },
      { depth: 2, text: "進捗" },
      { depth: 3, text: "詳細" },
      { depth: 2, text: "残り" },
    ]);
  });

  it("コードフェンス内の # は見出しに数えない", () => {
    const md = ["## 本物", "", "```sh", "# コメント", "```", ""].join("\n");
    expect(listHeadings(md)).toEqual([{ depth: 2, text: "本物" }]);
  });

  it("装飾付きの見出しは素の文字列で返す", () => {
    expect(listHeadings("## **太字** と `code`\n")).toEqual([
      { depth: 2, text: "太字 と code" },
    ]);
  });

  it("空の本文では空配列", () => {
    expect(listHeadings("")).toEqual([]);
  });
});

describe("appendToMarkdown", () => {
  it("見出しなしなら末尾に1行空けて追記し、末尾の改行を1つにそろえる", () => {
    expect(markdownOf(appendToMarkdown("本文\n\n\n", "追記"))).toBe("本文\n\n追記\n");
  });

  it("末尾に改行がない本文にも追記できる", () => {
    expect(markdownOf(appendToMarkdown("本文", "追記\n\n"))).toBe("本文\n\n追記\n");
  });

  it("空の本文への追記は内容だけになる", () => {
    expect(markdownOf(appendToMarkdown("", "追記"))).toBe("追記\n");
  });

  it("節の末尾（子の見出しを含む）、次の同格の見出しの前に追記する", () => {
    const result = markdownOf(appendToMarkdown(DOC, "- 追加", "進捗"));
    expect(result).toBe(DOC.replace("細かい話\n\n## 残り", "細かい話\n\n- 追加\n\n## 残り"));
  });

  it("最後の節に追記する", () => {
    const result = markdownOf(appendToMarkdown(DOC, "- 追加", "残り"));
    expect(result).toBe(`${DOC.trimEnd()}\n\n- 追加\n`);
  });

  it("## 付きの形でも指定できる", () => {
    const result = markdownOf(appendToMarkdown(DOC, "- 追加", "  ## 残り  "));
    expect(result).toBe(`${DOC.trimEnd()}\n\n- 追加\n`);
  });

  it("## 付きの形は深さも一致しなければ見つからない", () => {
    const result = appendToMarkdown(DOC, "x", "### 残り");
    expect(result).toEqual({
      ok: false,
      reason: "not_found",
      candidates: ["# 案件", "## 進捗", "### 詳細", "## 残り"],
    });
  });

  it("見出しが見つからなければ全見出しを候補として返す", () => {
    expect(appendToMarkdown(DOC, "x", "存在しない")).toEqual({
      ok: false,
      reason: "not_found",
      candidates: ["# 案件", "## 進捗", "### 詳細", "## 残り"],
    });
  });

  it("同じ見出しが複数あれば ambiguous で該当する見出しを返す", () => {
    const md = "## メモ\n\na\n\n### メモ\n\nb\n";
    expect(appendToMarkdown(md, "x", "メモ")).toEqual({
      ok: false,
      reason: "ambiguous",
      candidates: ["## メモ", "### メモ"],
    });
    expect(markdownOf(appendToMarkdown(md, "x", "### メモ"))).toBe(
      "## メモ\n\na\n\n### メモ\n\nb\n\nx\n",
    );
  });

  it("コードフェンス内の # 行を見出しとして扱わない", () => {
    const md = ["## 手順", "", "```sh", "# 残り", "```", "", "## 残り", "", "a", ""].join(
      "\n",
    );
    const result = markdownOf(appendToMarkdown(md, "追記", "手順"));
    expect(result).toBe(md.replace("```\n\n## 残り", "```\n\n追記\n\n## 残り"));
  });

  it("中身のない見出しの直後に追記する", () => {
    expect(markdownOf(appendToMarkdown("## 空\n## 次\n", "a", "空"))).toBe(
      "## 空\n\na\n\n## 次\n",
    );
  });

  it("CRLF の本文では CRLF のまま追記する", () => {
    const md = "## 進捗\r\n\r\n- 済み\r\n\r\n## 残り\r\n\r\n- 未着手\r\n";
    const result = markdownOf(appendToMarkdown(md, "- 追加\n- 追加2", "進捗"));
    expect(result).toBe(
      "## 進捗\r\n\r\n- 済み\r\n\r\n- 追加\r\n- 追加2\r\n\r\n## 残り\r\n\r\n- 未着手\r\n",
    );
  });
});

describe("replaceMarkdownSection", () => {
  it("見出し行を残し、節の中身（子の見出しを含む）だけを置き換える", () => {
    const result = markdownOf(replaceMarkdownSection(DOC, "進捗", "- 全部済み"));
    expect(result).toBe(
      ["# 案件", "", "概要", "", "## 進捗", "", "- 全部済み", "", "## 残り", "", "- 未着手", ""].join(
        "\n",
      ),
    );
  });

  it("最後の節を置き換え、末尾の改行を1つにそろえる", () => {
    const result = markdownOf(replaceMarkdownSection(DOC, "## 残り", "なし\n\n\n"));
    expect(result).toBe(DOC.replace("- 未着手\n", "なし\n"));
  });

  it("子の見出しの節だけを置き換える", () => {
    const result = markdownOf(replaceMarkdownSection(DOC, "詳細", "新しい話"));
    expect(result).toBe(DOC.replace("細かい話", "新しい話"));
  });

  it("空の内容で置き換えると見出しだけが残る", () => {
    const result = markdownOf(replaceMarkdownSection(DOC, "詳細", ""));
    expect(result).toBe(DOC.replace("### 詳細\n\n細かい話\n\n", "### 詳細\n\n"));
  });

  it("見つからなければ書き換えずに候補を返す", () => {
    expect(replaceMarkdownSection(DOC, "無い", "x")).toEqual({
      ok: false,
      reason: "not_found",
      candidates: ["# 案件", "## 進捗", "### 詳細", "## 残り"],
    });
  });

  it("同名の見出しが複数あれば ambiguous", () => {
    const md = "## a\n\n1\n\n## a\n\n2\n";
    expect(replaceMarkdownSection(md, "## a", "x")).toEqual({
      ok: false,
      reason: "ambiguous",
      candidates: ["## a", "## a"],
    });
  });

  it("CRLF の本文を置き換える", () => {
    const md = "# t\r\n\r\n## a\r\n\r\nold\r\n\r\n## b\r\n\r\nkeep\r\n";
    expect(markdownOf(replaceMarkdownSection(md, "a", "new\nline"))).toBe(
      "# t\r\n\r\n## a\r\n\r\nnew\r\nline\r\n\r\n## b\r\n\r\nkeep\r\n",
    );
  });

  it("Setext 形式の見出しも扱える", () => {
    const md = "題\n===\n\n古い\n";
    expect(markdownOf(replaceMarkdownSection(md, "# 題", "新しい"))).toBe("題\n===\n\n新しい\n");
  });
});
