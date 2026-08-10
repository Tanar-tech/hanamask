import type { JSX } from "react";

const LABEL = "削除";

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON = `${FOCUS_RING} cursor-pointer self-start rounded-md border border-line bg-transparent px-3 py-1 font-body text-xs text-text-faint transition-colors duration-[var(--duration-fast)] ease-standard hover:border-crit hover:text-crit`;

interface DeleteButtonProps {
  /** 確認ダイアログでどれを消すのか示すための対象名。 */
  title: string;
  onConfirm: () => void;
}

export const DeleteButton = ({ title, onConfirm }: DeleteButtonProps): JSX.Element => (
  <button
    type="button"
    className={BUTTON}
    onClick={() => {
      if (!window.confirm(`「${title}」を削除しますか?`)) return;
      onConfirm();
    }}
  >
    {LABEL}
  </button>
);
