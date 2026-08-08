/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { MarkdownBody, SANITIZE_SCHEMA } from "../../src/renderer/components/MarkdownBody";

// Reactは文字列のイベントハンドラをDOMへ出さないため、DOMを見るだけではサニタイズが
// 効いているのか区別できない。react-markdownがHTMLから作ったpropsを直接捕まえて確かめる。
const renderCapturingImageProps = (
  markdown: string,
  sanitized: boolean,
): Record<string, unknown> => {
  const captured: Record<string, unknown> = {};
  const components: Components = {
    img: (props) => {
      Object.assign(captured, props);
      return <img alt="" src={typeof props.src === "string" ? props.src : undefined} />;
    },
  };
  render(
    <Markdown
      rehypePlugins={sanitized ? [rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]] : [rehypeRaw]}
      components={components}
    >
      {markdown}
    </Markdown>,
  );
  return captured;
};

const IMAGE_WITH_HANDLER = '<img src="https://example.com/a.png" alt="図" onerror="alert(1)">';

describe("MarkdownBody のサニタイズ設定", () => {
  afterEach(cleanup);

  it("イベントハンドラ属性をpropsに残さない", () => {
    const props = renderCapturingImageProps(IMAGE_WITH_HANDLER, true);

    expect(Object.keys(props).filter((key) => key.toLowerCase().startsWith("on"))).toEqual([]);
    expect(props.src).toBe("https://example.com/a.png");
  });

  it("サニタイズを外すとイベントハンドラ属性がpropsまで届く（上のテストが有効であることの確認）", () => {
    const props = renderCapturingImageProps(IMAGE_WITH_HANDLER, false);

    expect(Object.keys(props).filter((key) => key.toLowerCase().startsWith("on"))).toEqual([
      "onError",
    ]);
  });

  it("style属性と埋め込みHTMLは許可する", () => {
    const props = renderCapturingImageProps(
      '<img src="https://example.com/a.png" alt="図" style="width: 10px">',
      true,
    );

    expect(props.style).toEqual({ width: "10px" });
  });

  it("styleタグは要素として描画し、CSSを本文のテキストとして出さない", () => {
    render(<MarkdownBody content={"<style>p { color: red }</style>\n\n本文"} />);

    expect(document.querySelector("style")?.textContent).toBe("p { color: red }");
    expect(document.querySelector("p")?.textContent).toBe("本文");
  });

  it("壊れたstyle属性でも描画は落ちない", () => {
    render(<MarkdownBody content={'<div style="color">壊れたCSS</div>'} />);

    expect(document.body.textContent).toContain("壊れたCSS");
  });
});

/*
 * 上のテスト群は react-markdown をモックして props を見ている。それだけだと
 * 「実際に描画したときに何がDOMへ出るか」は分からないので、本物を通した結果も見る。
 * 本文はAIエージェントが書くため、ここが最後の砦になる。
 */
describe("MarkdownBody（実際に描画した結果）", () => {
  const renderBody = async (content: string): Promise<HTMLElement> => {
    vi.doUnmock("react-markdown");
    vi.resetModules();
    const { MarkdownBody: Real } = await import("../../src/renderer/components/MarkdownBody");
    const { container } = render(<Real content={content} />);
    return container;
  };

  it("scriptタグをDOMへ出さない", async () => {
    const container = await renderBody('前<script>window.pwned = true;</script>後');

    expect(container.querySelector("script")).toBeNull();
  });

  it("iframeをDOMへ出さない", async () => {
    const container = await renderBody('<iframe src="https://example.com"></iframe>');

    expect(container.querySelector("iframe")).toBeNull();
  });

  it("イベントハンドラ属性をDOMへ出さない", async () => {
    const container = await renderBody('<img src="x" onerror="window.pwned = true">');

    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("javascript: のリンクを踏めないようにする", async () => {
    const container = await renderBody("[押すな](javascript:window.pwned=true)");

    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("見出しと箇条書きを要素として描画する", async () => {
    const container = await renderBody("# 見出し\n\n- ひとつ\n- ふたつ");

    expect(container.querySelector("h1")?.textContent).toBe("見出し");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("埋め込んだHTMLとstyleは通す", async () => {
    const container = await renderBody('<div style="color: red">色付き</div>');

    const div = container.querySelector("div[style]");
    expect(div?.textContent).toBe("色付き");
    expect(div?.getAttribute("style")).toContain("color");
  });

  it("Markdown記法の表を要素として描画する", async () => {
    const container = await renderBody("| 項目 | 値 |\n|---|---|\n| テスト | 479件 |");

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("タスクリストと取り消し線を描画する", async () => {
    const container = await renderBody("- [x] 済んだこと\n- [ ] これから\n\n~~取り消し~~");

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector("del")?.textContent).toBe("取り消し");
  });
});
