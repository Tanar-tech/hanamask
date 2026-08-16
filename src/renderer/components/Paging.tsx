import { useEffect, useState, type JSX } from "react";

/*
 * エージェントが記録を足し続けると、一覧は下へ伸び続ける。古いものに辿り着くまで
 * 延々とスクロールすることになるので、区切って出す。
 *
 * 1ページ20件。実データはノート20件・タスク10件（2026-08-10）なので、当面はほぼ
 * 1ページに収まり、増えたときだけ区切りが効く。10件だと今すでに分割され、50件だと
 * 分ける意味がしばらく出ない。
 *
 * 読むのは今までどおり全件。DBの読み方は変えていない。件数が数千に達したら
 * 読み方から変える必要があるが、ローカル1台のノートアプリでは当面来ない。
 */

const PAGE_SIZE = 20;

export interface PagingState<T> {
  /** いま出すぶんだけ。 */
  items: T[];
  /** 一覧の下に置く操作列。1ページに収まるときは null。 */
  control: JSX.Element | null;
}

const BUTTON =
  "rounded-md border border-line bg-paper-raised px-3 py-1 font-body text-sm text-text-soft cursor-pointer disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";

export const usePaging = <T,>(items: readonly T[], resetKey: string): PagingState<T> => {
  const [page, setPage] = useState(0);

  /*
   * 絞り込みを変えたら1ページ目へ戻す。3ページ目を見ている状態で絞ると、
   * 絞った結果が2ページしか無いのに3ページ目のまま＝中身があるのに空に見える。
   */
  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // 記録が消えてページ数が減ることがあるので、範囲外に居たら最後のページへ寄せる。
  const current = Math.min(page, pageCount - 1);
  const from = current * PAGE_SIZE;
  const shown = items.slice(from, from + PAGE_SIZE);

  // 1ページに収まるなら操作列を出さない。押せないボタンだけ並ぶと壊れて見える。
  const control =
    items.length <= PAGE_SIZE ? null : (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="font-mono text-xs text-text-faint">
          {`${items.length}件中 ${from + 1}–${Math.min(from + PAGE_SIZE, items.length)}件`}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
            className={BUTTON}
          >
            前へ
          </button>
          <button
            type="button"
            disabled={current >= pageCount - 1}
            onClick={() => {
              setPage(current + 1);
            }}
            className={BUTTON}
          >
            次へ
          </button>
        </span>
      </div>
    );

  return { items: shown, control };
};
