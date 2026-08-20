/*
 * Explorer型ナビに並べる行と、その絞り込み。表示から切り離した純関数として置き、
 * 「どれを出すか」を画面を起こさずに確かめられるようにする。
 */

export interface NavNotebook {
  id: string;
  title: string;
  updatedAt: string;
  /** 所属ページ数（削除済みは含まない）。行のバッジに出す。 */
  pageCount: number;
}

export interface NavPage {
  id: string;
  title: string;
  updatedAt: string;
  /** 所属ノート名。無所属なら null。絞り込みで出したときの文脈表示に使う。 */
  notebookTitle: string | null;
}

export type NavItem =
  | { kind: "notebook"; notebook: NavNotebook }
  | { kind: "page"; page: NavPage };

const titleOf = (item: NavItem): string =>
  item.kind === "notebook" ? item.notebook.title : item.page.title;

const updatedAtOf = (item: NavItem): string =>
  item.kind === "notebook" ? item.notebook.updatedAt : item.page.updatedAt;

const isUnfiledPage = (item: NavItem): boolean =>
  item.kind === "page" && item.page.notebookTitle === null;

const matches = (item: NavItem, needle: string): boolean =>
  titleOf(item).toLowerCase().includes(needle);

// ISO文字列は辞書順と時刻順が一致するので、比較のために日付へ起こす必要はない。
const byUpdatedDesc = (a: NavItem, b: NavItem): number =>
  updatedAtOf(b).localeCompare(updatedAtOf(a));

/*
 * 絞り込みがないときはノートと無所属ページだけを並べる（所属ページはサブペインの担当）。
 * 絞り込み中は、探しものが今どのノートに入っているか分からなくても届くよう、
 * 所属を問わずタイトルが一致したページを出す。
 */
export const filterNavItems = (query: string, items: readonly NavItem[]): NavItem[] => {
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? items.filter((item) => item.kind === "notebook" || isUnfiledPage(item))
      : items.filter((item) => matches(item, needle));
  return [...shown].sort(byUpdatedDesc);
};
