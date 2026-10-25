import type { JSX } from "react";

const HEADING = "編集中に、エージェントがこの記録を更新しました";
const MESSAGE =
  "このまま保存すると、エージェントの変更が消えます。上書きする前の内容は編集履歴に残ります。";

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm`;

interface OverwriteConfirmProps {
  onKeepEditing: () => void;
  onLoadLatest: () => void;
  onOverwrite: () => void;
}

// 黙って上書きしないため、保存を押したあとで3つから選ばせる（§4.13）。
export const OverwriteConfirm = ({
  onKeepEditing,
  onLoadLatest,
  onOverwrite,
}: OverwriteConfirmProps): JSX.Element => (
  <div
    role="alertdialog"
    aria-labelledby="overwrite-confirm-heading"
    className="flex flex-col gap-3 rounded-md border border-solid border-warn bg-paper-raised px-4 py-3"
  >
    <p id="overwrite-confirm-heading" className="m-0 font-display text-sm font-bold text-text">
      {HEADING}
    </p>
    <p className="m-0 font-body text-sm text-text-soft">{MESSAGE}</p>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onKeepEditing} className={`${BUTTON} border-line text-text`}>
        編集を続ける
      </button>
      <button
        type="button"
        onClick={onLoadLatest}
        className={`${BUTTON} border-ink-aqua text-ink-aqua-text`}
      >
        最新を読み込む（自分の編集は破棄）
      </button>
      <button type="button" onClick={onOverwrite} className={`${BUTTON} border-crit text-crit`}>
        自分の内容で上書きする
      </button>
    </div>
  </div>
);
