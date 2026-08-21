import type { JSX } from "react";

const PIN_LABEL = "ピン留め";
const UNPIN_LABEL = "ピン留め解除";

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
