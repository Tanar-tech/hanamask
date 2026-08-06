/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { useNewlyArrived } from "../../src/renderer/hooks/useNewlyArrived";

const Probe = ({ ids }: { ids: string[] }): JSX.Element => {
  const arrived = useNewlyArrived(ids);
  return <span data-testid="arrived">{[...arrived].sort().join(",")}</span>;
};

const arrivedText = (): string => screen.getByTestId("arrived").textContent ?? "";

afterEach(cleanup);

describe("useNewlyArrived", () => {
  /*
   * 変更のたびに一覧を丸ごと取り直すため、これが効いていないと全項目が
   * アニメーションする。本フックの存在理由そのもの。
   */
  it("初回の描画では何も「現れた」と扱わない", () => {
    render(<Probe ids={["a", "b", "c"]} />);

    expect(arrivedText()).toBe("");
  });

  it("増えたidだけを返し、元からあるものは含めない", () => {
    const { rerender } = render(<Probe ids={["a", "b"]} />);

    rerender(<Probe ids={["c", "a", "b"]} />);

    expect(arrivedText()).toBe("c");
  });

  it("並び順が変わっただけでは「現れた」と扱わない", () => {
    const { rerender } = render(<Probe ids={["a", "b", "c"]} />);

    rerender(<Probe ids={["c", "b", "a"]} />);

    expect(arrivedText()).toBe("");
  });

  it("減っただけでは何も返さない", () => {
    const { rerender } = render(<Probe ids={["a", "b", "c"]} />);

    rerender(<Probe ids={["a"]} />);

    expect(arrivedText()).toBe("");
  });

  /*
   * 「これまでに見た全id」を覚える実装だと、復元したノートが二度と
   * アニメーションしなくなる。前回並んでいたidだけを覚えることの担保。
   */
  it("消えたあとに戻ってきたidは「現れた」と扱う", () => {
    const { rerender } = render(<Probe ids={["a", "b"]} />);
    rerender(<Probe ids={["a"]} />);

    rerender(<Probe ids={["a", "b"]} />);

    expect(arrivedText()).toBe("b");
  });

  it("複数まとめて増えたときは全部返す", () => {
    const { rerender } = render(<Probe ids={["a"]} />);

    rerender(<Probe ids={["a", "b", "c"]} />);

    expect(arrivedText()).toBe("b,c");
  });

  it("次の変更では前回の分を引きずらない", () => {
    const { rerender } = render(<Probe ids={["a"]} />);
    rerender(<Probe ids={["a", "b"]} />);

    rerender(<Probe ids={["a", "b", "c"]} />);

    expect(arrivedText()).toBe("c");
  });

  it("空から始まっても初回は「現れた」と扱わない", () => {
    const { rerender } = render(<Probe ids={[]} />);

    rerender(<Probe ids={["a"]} />);

    expect(arrivedText()).toBe("a");
  });
});
