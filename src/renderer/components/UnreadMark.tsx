import type { JSX } from "react";

const UNREAD_LABEL = "未読";

/* 点は色だけの飾り。色の区別に頼らないよう文字を添え、読み上げは文字だけにする。 */
export const UnreadMark = (): JSX.Element => (
  <span className="inline-flex shrink-0 items-center gap-1 font-body text-xs text-ink-pink">
    <span
      aria-hidden="true"
      className="inline-block size-1.5 rounded-full bg-ink-pink"
    />
    <span>{UNREAD_LABEL}</span>
  </span>
);
