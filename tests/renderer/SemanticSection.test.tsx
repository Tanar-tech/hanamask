/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SemanticSection } from "../../src/renderer/components/SemanticSection";
import type { EmbeddingStatus } from "../../src/shared/preload-api";

const HEADING = "意味が近い記録";
const READY: EmbeddingStatus = { state: "ready", pending: 0 };
const LOADING: EmbeddingStatus = { state: "loading", pending: 2 };
const UNAVAILABLE: EmbeddingStatus = { state: "unavailable", pending: 0, reason: "モデルなし" };

const child = <p>中身</p>;

afterEach(() => {
  cleanup();
});

describe("SemanticSection", () => {
  it("準備できていれば見出しと中身を出す", () => {
    render(
      <SemanticSection heading={HEADING} status={READY} unavailable={false}>
        {child}
      </SemanticSection>,
    );

    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
    expect(screen.getByText("中身")).toBeTruthy();
  });

  it("準備中は中身の代わりに「準備中です」を出す", () => {
    render(
      <SemanticSection heading={HEADING} status={LOADING} unavailable={false}>
        {child}
      </SemanticSection>,
    );

    expect(screen.getByText("準備中です")).toBeTruthy();
    expect(screen.queryByText("中身")).toBeNull();
  });

  it("状態がまだ分からないときは何も出さない", () => {
    const { container } = render(
      <SemanticSection heading={HEADING} status={null} unavailable={false}>
        {child}
      </SemanticSection>,
    );

    expect(container.textContent).toBe("");
  });

  it("使えないときは欄そのものを出さない", () => {
    const { container } = render(
      <SemanticSection heading={HEADING} status={UNAVAILABLE} unavailable={false}>
        {child}
      </SemanticSection>,
    );

    expect(container.textContent).toBe("");
  });

  it("結果側が使えないと言ってきたときも欄を出さない", () => {
    const { container } = render(
      <SemanticSection heading={HEADING} status={READY} unavailable>
        {child}
      </SemanticSection>,
    );

    expect(container.textContent).toBe("");
  });
});
