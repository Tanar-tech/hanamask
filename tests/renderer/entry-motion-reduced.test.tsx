/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { li as MotionLi } from "motion/react-m";
import {
  advanceToMidflight,
  hasEntryOffset,
  renderWithMotion,
  settleMotion,
} from "./motion-render";
import { ENTRY_MOTION } from "../../src/renderer/styles/motion";

/*
 * motion はOSの設定を最初の描画のときに一度だけ読み、以降そのファイル内で使い回す。
 * そのため「動きを止める設定」の検証は、有効にしない他のテストと同じファイルには置けない。
 * ここは prefers-reduced-motion が有効な環境の専用ファイル。
 *
 * motion が問い合わせるのは値を伴わない `(prefers-reduced-motion)` なので、
 * 値付きの綴りにだけ答えるスタブでは素通りしてしまう（実測で判明）。
 */
window.matchMedia = ((query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const renderArrivedItem = (): void => {
  renderWithMotion(
    <ul>
      <MotionLi {...ENTRY_MOTION} data-testid="arrived">
        いま増えた項目
      </MotionLi>
    </ul>,
  );
};

afterEach(cleanup);

describe("prefers-reduced-motion が有効なとき", () => {
  /*
   * MotionConfig の reducedMotion を渡し忘れると motion の既定は "never" で、
   * OSで動きを切っていても項目が動く。動きに弱い利用者にとっては実害なので、
   * 方針が実際に効いていることをここで固定する。
   */
  it("新しく現れた項目を動かさない", async () => {
    renderArrivedItem();

    await advanceToMidflight();

    expect(hasEntryOffset(screen.getByTestId("arrived"))).toBe(false);
  });

  it("動かさないだけで、項目自体は最終状態で見えている", async () => {
    renderArrivedItem();

    await settleMotion();

    const item = screen.getByTestId("arrived");
    expect(item.style.opacity).toBe("1");
    expect(item.textContent).toBe("いま増えた項目");
  });
});
