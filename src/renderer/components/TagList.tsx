import type { JSX } from "react";

/*
 * タグはノート詳細にしか出ていなかったので、一覧を見てもどの記録がどの案件のものか
 * 分からなかった。同じ見た目を詳細と一覧の両方で使うために切り出す。
 *
 * 絞り込み中は、選ばれているタグだけをはっきり見せる。選ばれていないタグを消すと
 * 「このノートには他のタグも付いている」ことが分からなくなるので、薄くして残す。
 */

interface TagListProps {
  tags: readonly string[];
  /** 絞り込み中のタグ。空なら絞り込んでいない。 */
  selected?: ReadonlySet<string>;
  /** タグを押せるようにする場合の処理。渡さないと表示だけになる。 */
  onSelect?: (tag: string) => void;
}

const BASE = "rounded-full border px-2 py-0.5 font-body text-xs";
const PLAIN = `${BASE} border-line text-text-soft`;
const ACTIVE = `${BASE} border-ink-aqua text-ink-aqua-text`;
const DIMMED = `${BASE} border-line text-text-faint opacity-60`;

const classFor = (tag: string, selected: ReadonlySet<string> | undefined): string => {
  if (selected === undefined || selected.size === 0) return PLAIN;
  return selected.has(tag) ? ACTIVE : DIMMED;
};

export const TagList = ({ tags, selected, onSelect }: TagListProps): JSX.Element | null => {
  if (tags.length === 0) return null;

  return (
    <ul aria-label="タグ" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {tags.map((tag) => (
        <li key={tag}>
          {onSelect === undefined ? (
            <span className={classFor(tag, selected)}>{tag}</span>
          ) : (
            <button
              type="button"
              aria-pressed={selected?.has(tag) ?? false}
              onClick={() => {
                onSelect(tag);
              }}
              className={`${classFor(tag, selected)} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow`}
            >
              {tag}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};
