import { useMemo, useState, type JSX } from "react";

/*
 * エージェントが記録を増やし続けると、案件Aの話と案件Bの話が同じ一覧に混ざる。
 * タグを選んで絞れるようにする。
 *
 * 複数選んだときは OR（どれかに一致）にする。「AとBのどちらかを見たい」が主な
 * 使い方で、AND（すべてに一致）は絞り込みすぎて空になりやすい。
 *
 * タグの一覧は、いま表示している記録から集める。先に定義させる画面を作ると、
 * 書く前に決めることが増える。
 */

const UNTAGGED = "タグなし";

interface Taggable {
  tags: string[];
}

export interface TagFilterState {
  /** 絞り込みを通過した記録。 */
  visible: <T extends Taggable>(items: readonly T[]) => T[];
  /** 選ばれているタグ。カード側で強調するのに使う。 */
  selected: ReadonlySet<string>;
  /** 絞り込みの操作列。一覧の上に置く。 */
  control: JSX.Element | null;
}

const CHIP = "rounded-full border px-3 py-1 font-body text-xs cursor-pointer";
const CHIP_IDLE = `${CHIP} border-line bg-paper-raised text-text-soft`;
const CHIP_ON = `${CHIP} border-ink-aqua bg-paper-raised text-ink-aqua-text`;
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";

export const useTagFilter = (items: readonly Taggable[]): TagFilterState => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const available = useMemo(() => {
    const names = new Set<string>();
    items.forEach((item) => item.tags.forEach((tag) => names.add(tag)));
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [items]);

  const hasUntagged = items.some((item) => item.tags.length === 0);

  const toggle = (tag: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const visible = <T extends Taggable>(list: readonly T[]): T[] => {
    if (selected.size === 0) return [...list];
    return list.filter((item) =>
      selected.has(UNTAGGED) && item.tags.length === 0
        ? true
        : item.tags.some((tag) => selected.has(tag)),
    );
  };

  // 絞り込む相手がいないときは操作列そのものを出さない。
  const control =
    available.length === 0 ? null : (
      <div
        role="group"
        aria-label="タグで絞り込む"
        className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper px-3 py-2"
      >
        <span className="font-body text-xs text-text-faint">絞り込み</span>
        <button
          type="button"
          aria-pressed={selected.size === 0}
          onClick={() => {
            setSelected(new Set());
          }}
          className={`${selected.size === 0 ? CHIP_ON : CHIP_IDLE} ${FOCUS}`}
        >
          すべて
        </button>
        {available.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={selected.has(tag)}
            onClick={() => {
              toggle(tag);
            }}
            className={`${selected.has(tag) ? CHIP_ON : CHIP_IDLE} ${FOCUS}`}
          >
            {tag}
          </button>
        ))}
        {hasUntagged && (
          <button
            type="button"
            aria-pressed={selected.has(UNTAGGED)}
            onClick={() => {
              toggle(UNTAGGED);
            }}
            className={`${selected.has(UNTAGGED) ? CHIP_ON : CHIP_IDLE} ${FOCUS}`}
          >
            {UNTAGGED}
          </button>
        )}
      </div>
    );

  return { visible, selected, control };
};
