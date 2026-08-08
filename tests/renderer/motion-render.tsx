import { act, render as testingLibraryRender, type RenderResult } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactElement } from "react";
import { DURATION_S, REDUCED_MOTION_POLICY } from "../../src/renderer/styles/motion";

/*
 * `m.*` は LazyMotion のprovider配下でしか動かず、provider外では素の要素として
 * 描画されてアニメーションが付かない。アプリ本体は App.tsx でラップしているので、
 * テストでも同じ条件を作るためのヘルパー。reducedMotion も App と同じ方針を張る——
 * ここが本番とずれていると「動きを止めたい利用者の設定が効かない」ことを見逃す。
 *
 * 本番と違い features を同期で渡す（本番は初期ロードを軽くするため遅延ロードするが、
 * テストで待ち合わせを増やしても得るものが無い）。strict は本番と揃えてあるので、
 * 誤って重い motion.* を使うとテストでも落ちる。
 */
export const renderWithMotion = (ui: ReactElement): RenderResult =>
  testingLibraryRender(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={REDUCED_MOTION_POLICY}>{ui}</MotionConfig>
    </LazyMotion>,
  );

const BASE_MS = DURATION_S.base * 1000;
// 入場が終わると縦位置は 0 に戻り、動いた痕跡が消える。差が見えるのは再生中だけ。
const MIDFLIGHT_MS = BASE_MS / 5;
const SETTLE_MS = BASE_MS * 2;

const waitReal = async (delay_ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, delay_ms));
  });
};

/** 入場アニメーションの再生中まで進める。完了させると動いた項目と動かない項目を区別できない。 */
export const advanceToMidflight = (): Promise<void> => waitReal(MIDFLIGHT_MS);

/** 再生中の入場を終わらせる。前の動きが残っていると、次に動いた項目と見分けが付かない。 */
export const settleMotion = (): Promise<void> => waitReal(SETTLE_MS);

/** ENTRY_MOTION の縦位置が当たっているか。付いていない項目は transform を持たない。 */
export const hasEntryOffset = (element: HTMLElement): boolean =>
  element.style.transform.includes("translateY");
