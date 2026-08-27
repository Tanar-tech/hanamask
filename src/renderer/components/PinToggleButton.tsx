import type { JSX } from "react";

const PIN_LABEL = "ピン留め";
const UNPIN_LABEL = "ピン留め解除";

/* preflight を入れていないため、ブラウザ既定のボタン外観を打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const PIN_TOGGLE = `${FOCUS_RING} m-0 shrink-0 cursor-pointer appearance-none rounded-md border-0 bg-transparent px-1 py-1 font-body text-xs leading-none transition-opacity duration-[var(--duration-fast)] ease-standard`;
const PIN_TOGGLE_PINNED = "opacity-100";
const PIN_TOGGLE_IDLE = "opacity-0 group-hover:opacity-100 focus-visible:opacity-100";

/** 一覧の行に置く共通レイアウト。行側は group を頼りにトグルをホバー表示する。 */
export const PIN_ROW = "group flex items-center";

export const PIN_MARK = "📌";

/** ピン留めの有無だけを見る。日時そのものは表示に使わない。 */
export const isPinned = (entity: { pinnedAt?: string | null }): boolean =>
  entity.pinnedAt !== null && entity.pinnedAt !== undefined;

interface PinToggleButtonProps {
  pinned: boolean;
  onToggle: () => Promise<void> | void;
  /** 置き場所ごとにボタンの見た目が違うため、呼び出し側のスタイルを受け取る。 */
  className: string;
  disabled?: boolean;
}

/* 解除は押し直すだけで済むため、削除と違い確認ダイアログを挟まない。 */
export const PinToggleButton = ({
  pinned,
  onToggle,
  className,
  disabled = false,
}: PinToggleButtonProps): JSX.Element => (
  <button
    type="button"
    className={className}
    disabled={disabled}
    onClick={() => {
      void onToggle();
    }}
  >
    {pinned ? UNPIN_LABEL : PIN_LABEL}
  </button>
);

/* 一覧の行用。ピン留め中は常に見える。未ピンは行にマウス／フォーカスが来たときだけ現れる。 */
export const PinRowToggle = ({
  title,
  pinned,
  onToggle,
}: {
  title: string;
  pinned: boolean;
  onToggle: () => void;
}): JSX.Element => (
  <button
    type="button"
    // 行ボタンの名前（タイトル）と衝突しないよう、動作を含めた名前にする。
    aria-label={pinned ? `${title}のピン留めを解除` : `${title}をピン留め`}
    aria-pressed={pinned}
    onClick={onToggle}
    className={`${PIN_TOGGLE} ${pinned ? PIN_TOGGLE_PINNED : PIN_TOGGLE_IDLE}`}
  >
    <span aria-hidden="true">{PIN_MARK}</span>
  </button>
);
