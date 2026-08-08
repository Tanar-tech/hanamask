import { describe, expect, it } from "vitest";
import { BODY_PREVIEW_LENGTH, toBodyPreview } from "../../src/renderer/text/bodyPreview";

describe("toBodyPreview", () => {
  it("素のテキストはそのまま返す", () => {
    expect(toBodyPreview("MCPサーバーの設計についてのメモ本文")).toBe(
      "MCPサーバーの設計についてのメモ本文",
    );
  });

  it("見出しの記号を落とす", () => {
    expect(toBodyPreview("# 設計方針\n\n本文です")).toBe("設計方針 本文です");
  });

  it("箇条書きと番号付きリストの記号を落とす", () => {
    expect(toBodyPreview("- 一つ目\n- 二つ目\n1. 三つ目")).toBe("一つ目 二つ目 三つ目");
  });

  it("強調・打ち消し・インラインコードの記号を落とす", () => {
    expect(toBodyPreview("**太字**と*斜体*と~~打ち消し~~と`code`")).toBe(
      "太字と斜体と打ち消しとcode",
    );
  });

  it("リンクは表示文字だけ残し、画像は取り除く", () => {
    expect(toBodyPreview("詳細は[設計メモ](https://example.com)を見る")).toBe(
      "詳細は設計メモを見る",
    );
    expect(toBodyPreview("図: ![構成図](./a.png) 以上")).toBe("図: 以上");
  });

  it("引用と水平線の記号を落とす", () => {
    expect(toBodyPreview("> 引用文\n\n---\n\n本文")).toBe("引用文 本文");
  });

  it("Mermaidのコードフェンスは中身ごと取り除く", () => {
    const body = ["前書き", "```mermaid", "flowchart TD", "  A --> B", "```", "後書き"].join("\n");

    expect(toBodyPreview(body)).toBe("前書き 後書き");
  });

  it("閉じられていないMermaidフェンスも中身ごと取り除く", () => {
    expect(toBodyPreview("前書き\n```mermaid\nflowchart TD\n  A --> B")).toBe("前書き");
  });

  it("Mermaid以外のコードフェンスは中身を残して記号だけ落とす", () => {
    const body = ["```ts", "const a = 1;", "```"].join("\n");

    expect(toBodyPreview(body)).toBe("const a = 1;");
  });

  it("空白のみの本文は空文字になる", () => {
    expect(toBodyPreview("")).toBe("");
    expect(toBodyPreview("   \n\n  ")).toBe("");
    expect(toBodyPreview("```mermaid\nflowchart TD\n```")).toBe("");
  });

  it("長い本文は省略記号付きで切り詰める", () => {
    const preview = toBodyPreview("あ".repeat(BODY_PREVIEW_LENGTH + 10));

    expect(preview).toBe(`${"あ".repeat(BODY_PREVIEW_LENGTH)}…`);
  });

  it("上限ちょうどの本文は切り詰めない", () => {
    const body = "あ".repeat(BODY_PREVIEW_LENGTH);

    expect(toBodyPreview(body)).toBe(body);
  });
});
