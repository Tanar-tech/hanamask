/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
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
