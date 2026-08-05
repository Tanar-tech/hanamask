import type { Transition } from "motion/react";

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

/** `<MotionConfig reducedMotion>` に渡す方針。OSの設定を尊重する。 */
export const REDUCED_MOTION_POLICY = "user";

/** motion を使わない自前のCSSトランジションを同じ方針に揃えるための判定。 */
export const prefersReducedMotion = (view: Window | undefined): boolean =>
  view?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
