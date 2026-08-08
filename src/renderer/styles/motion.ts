/*
 * アニメーションのルール（後続PRもこれに従うこと）:
 * - コンポーネントでは `motion/react-m` の `m.div` 等を使う。
 * - `motion/react` の `motion.*` は使わない。初期ロードに約120kB（gzip約40kB）
 *   載ってしまうため、機能は下の loadMotionFeatures で遅延ロードする。
 * - App の <LazyMotion strict> により、`motion.*` を使うとランタイムエラーになる。
 *   ESLint（no-restricted-imports）でも禁止している。
 */
import type { FeatureBundle, Transition } from "motion/react";

const FAST_S = 0.12;
const BASE_S = 0.2;
const SLOW_S = 0.32;

export const DURATION_S = {
  fast: FAST_S,
  base: BASE_S,
  slow: SLOW_S,
} as const;

export const EASING = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
} as const;

export const TRANSITION = {
  fast: { duration: DURATION_S.fast, ease: EASING.standard },
  base: { duration: DURATION_S.base, ease: EASING.standard },
  slow: { duration: DURATION_S.slow, ease: EASING.standard },
  enter: { duration: DURATION_S.base, ease: EASING.enter },
  exit: { duration: DURATION_S.fast, ease: EASING.exit },
} as const satisfies Record<string, Transition>;

/*
 * 新しく現れた項目の入場。控えめにしているのは、T25の絶対条件が
 * 「利用者が直観的に操作できる分かりやすいUI」で、大きな動きがこれを損なうため。
 * 動かすのは不透明度と僅かな縦位置だけで、レイアウトには影響させない。
 */
export const ENTRY_MOTION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  transition: TRANSITION.enter,
} as const;

/** `<LazyMotion features>` に渡すローダー。別チャンクに切り出され初期ロードから外れる。 */
export const loadMotionFeatures = async (): Promise<FeatureBundle> =>
  (await import("./motion-features")).default;

/** `<MotionConfig reducedMotion>` に渡す方針。OSの設定を尊重する。 */
export const REDUCED_MOTION_POLICY = "user";

/** motion を使わない自前のCSSトランジションを同じ方針に揃えるための判定。 */
export const prefersReducedMotion = (view: Window | undefined): boolean =>
  view?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
