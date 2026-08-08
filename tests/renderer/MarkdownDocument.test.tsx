/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { MarkdownDocument } from "../../src/renderer/components/MarkdownDocument";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const MERMAID_SVG = '<svg data-name="rendered"></svg>';
const MERMAID_CODE = "graph TD;\n  A-->B;";

const mockMermaidRender = (): void => {
  vi.mocked(mermaid.render).mockResolvedValue({ svg: MERMAID_SVG, diagramType: "flowchart" });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarkdownDocument", () => {
  it("mermaidフェンスを図として描画し、フェンスのテキストは出さない", async () => {
    mockMermaidRender();

    render(<MarkdownDocument content={`前書き\n\n\`\`\`mermaid\n${MERMAID_CODE}\n\`\`\``} />);

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    expect(vi.mocked(mermaid.render).mock.calls[0]?.[1]).toBe(MERMAID_CODE);
    expect(screen.queryByText(/```mermaid/)).toBeNull();
  });

  it("mermaidフェンスの前後のテキストはMarkdownとして描画する", async () => {
    mockMermaidRender();

    const { container } = render(
      <MarkdownDocument content={`# 前書き\n\n\`\`\`mermaid\n${MERMAID_CODE}\n\`\`\`\n\n- 後書き`} />,
    );

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    expect(container.querySelector("h1")?.textContent).toBe("前書き");
    expect(container.querySelector("li")?.textContent).toBe("後書き");
  });

  it("mermaid以外のコードフェンスは図にしない", async () => {
    mockMermaidRender();

    const { container } = render(<MarkdownDocument content={"```ts\nconst a = 1;\n```"} />);

    await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("mermaidフェンスが複数あればそれぞれ図として描画する", async () => {
    mockMermaidRender();

    render(
      <MarkdownDocument
        content={"```mermaid\ngraph TD;\n  A-->B;\n```\n中間\n```mermaid\ngraph LR;\n  C-->D;\n```"}
      />,
    );

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(screen.getByText("中間")).not.toBeNull();
  });

  it("Markdownの見出し・表を要素として描画する", () => {
    const { container } = render(
      <MarkdownDocument content={"## 見出し\n\n| 項目 | 値 |\n|---|---|\n| a | b |"} />,
    );

    expect(container.querySelector("h2")?.textContent).toBe("見出し");
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("scriptタグをDOMへ出さない", () => {
    const { container } = render(
      <MarkdownDocument content={"前<script>window.pwned = true;</script>後"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("window.pwned");
  });

  it("イベントハンドラ属性をDOMへ出さない", () => {
    const { container } = render(
      <MarkdownDocument content={'<img src="x" onerror="window.pwned = true">'} />,
    );

    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("空の本文では何も描画しない", () => {
    const { container } = render(<MarkdownDocument content="" />);

    expect(container.textContent).toBe("");
  });
});
