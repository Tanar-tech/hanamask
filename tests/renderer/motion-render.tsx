import { render as testingLibraryRender, type RenderResult } from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import type { ReactElement } from "react";

/*
 * `m.*` は LazyMotion のprovider配下でしか動かず、provider外では素の要素として
 * 描画されてアニメーションが付かない。アプリ本体は App.tsx でラップしているので、
 * テストでも同じ条件を作るためのヘルパー。
 *
 * 本番と違い features を同期で渡す（本番は初期ロードを軽くするため遅延ロードするが、
 * テストで待ち合わせを増やしても得るものが無い）。strict は本番と揃えてあるので、
 * 誤って重い motion.* を使うとテストでも落ちる。
 */
export const renderWithMotion = (ui: ReactElement): RenderResult =>
  testingLibraryRender(
    <LazyMotion features={domAnimation} strict>
      {ui}
    </LazyMotion>,
  );
