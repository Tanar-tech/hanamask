/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { MermaidDiagram } from "../../src/renderer/components/MermaidDiagram";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const VALID_CODE = "graph TD;\n  A-->B;";
const RENDERED_SVG = '<svg data-name="rendered"><g></g></svg>';

const mockRenderSuccess = (svg = RENDERED_SVG) => {
  vi.mocked(mermaid.render).mockResolvedValue({ svg, diagramType: "flowchart" });
};

// 本物のmermaidは描画開始時に <div id="d{id}"><svg id="{id}">…</svg></div> をdocument.body直下へ挿入し、
// 成功時のみ自分で撤去する（失敗時は残したまま例外を投げる）。その挙動を再現する。
const insertedTempElementIds: string[] = [];

const appendMermaidTempElements = (diagramId: string): void => {
  insertedTempElementIds.push(`d${diagramId}`);
  const container = document.createElement("div");
  container.id = `d${diagramId}`;
  const svg = document.createElement("svg");
  svg.id = diagramId;
  svg.setAttribute("data-name", "mermaid-internal");
  container.appendChild(svg);
  document.body.appendChild(container);
};

const mockRenderFailure = (message = "Parse error on line 1") => {
  vi.mocked(mermaid.render).mockImplementation((diagramId: string) => {
    appendMermaidTempElements(diagramId);
    return Promise.reject(new Error(message));
  });
};

const mockRenderNeverSettles = () => {
  vi.mocked(mermaid.render).mockImplementation((diagramId: string) => {
    appendMermaidTempElements(diagramId);
    return new Promise(() => {
      // 描画中のままアンマウントされる状況を再現するため、決して解決しない。
    });
  });
};

const queryRenderedSvg = (): SVGElement | null => document.querySelector("svg[data-name='rendered']");

const queryMermaidLeftovers = (): Element[] =>
  insertedTempElementIds
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => element !== null);

afterEach(() => {
  cleanup();
  queryMermaidLeftovers().forEach((element) => {
    element.remove();
  });
  insertedTempElementIds.length = 0;
  // vi.mockのファクトリで作ったvi.fnはrestoreAllMocksでは呼び出し履歴が消えないため明示的にクリアする。
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("MermaidDiagram", () => {
  it("正常なMermaidコードを渡すとレンダリング結果のSVGを表示する", async () => {
    mockRenderSuccess();

    render(<MermaidDiagram code={VALID_CODE} />);

    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Mermaidのソースをそのままmermaid.renderに渡す", async () => {
    mockRenderSuccess();

    render(<MermaidDiagram code={VALID_CODE} />);

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    expect(vi.mocked(mermaid.render).mock.calls[0]?.[1]).toBe(VALID_CODE);
  });

  it("構文エラーでmermaid.renderが例外を投げてもクラッシュせずエラーメッセージを表示する", async () => {
    mockRenderFailure();

    render(<MermaidDiagram code="graph TD; A-->" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Parse error on line 1");
    expect(queryRenderedSvg()).toBeNull();
  });

  it("codeが変わったら描画し直す", async () => {
    mockRenderSuccess();

    const { rerender } = render(<MermaidDiagram code={VALID_CODE} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));

    rerender(<MermaidDiagram code="graph LR;\n  C-->D;" />);

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
  });

  it("描画失敗のあとに正しいcodeへ変わればエラー表示からSVG表示に回復する", async () => {
    mockRenderFailure();

    const { rerender } = render(<MermaidDiagram code="graph TD; A-->" />);
    await screen.findByRole("alert");

    mockRenderSuccess();
    rerender(<MermaidDiagram code={VALID_CODE} />);

    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("描画に失敗したらmermaidがdocument.body直下に残した要素を除去する", async () => {
    mockRenderFailure();

    render(<MermaidDiagram code="graph TD; A-->" />);

    await screen.findByRole("alert");
    expect(queryMermaidLeftovers()).toEqual([]);
  });

  it("描画中にアンマウントされてもdocument.body直下にmermaid由来の要素を残さない", async () => {
    mockRenderNeverSettles();

    const { unmount } = render(<MermaidDiagram code={VALID_CODE} />);
    await waitFor(() => expect(queryMermaidLeftovers()).toHaveLength(1));

    unmount();

    expect(queryMermaidLeftovers()).toEqual([]);
  });

  it("空のコードではmermaid.renderを呼ばず何も表示しない", async () => {
    mockRenderSuccess();

    render(<MermaidDiagram code="   " />);

    await waitFor(() => expect(mermaid.render).not.toHaveBeenCalled());
    expect(queryRenderedSvg()).toBeNull();
  });
});
