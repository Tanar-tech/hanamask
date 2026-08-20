import type { JSX, ReactNode } from "react";

/** 左レールの項目。`trash` だけは一覧ではなくゴミ箱画面に対応する。 */
export type ShellSection = "home" | "notes" | "tasks" | "trash" | "settings";

interface RailItem {
  id: ShellSection;
  label: string;
}

// ワークスペースの中身と、アプリ自体の設定は別のまとまりとして見せる。
const RAIL_ITEMS: readonly RailItem[] = [
  { id: "home", label: "ホーム" },
  { id: "notes", label: "ノート" },
  { id: "tasks", label: "タスク" },
  { id: "trash", label: "ゴミ箱" },
];
const RAIL_FOOTER_ITEMS: readonly RailItem[] = [{ id: "settings", label: "設定" }];

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const RAIL_BUTTON = `${FOCUS_RING} m-0 block w-full cursor-pointer appearance-none rounded-md border-0 border-l-2 bg-transparent px-3 py-2 text-left font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const RAIL_BUTTON_CURRENT = "border-l-ink-aqua bg-ink-aqua/10 font-semibold text-ink-aqua-text";
const RAIL_BUTTON_IDLE = "border-l-transparent text-text-soft hover:text-text";

interface AppShellProps {
  current: ShellSection;
  onSelect: (section: ShellSection) => void;
  children: ReactNode;
  /** レールの隣に置くノート・ページのナビ列。区画によって出し分けるので呼び出し側が持つ。 */
  nav?: ReactNode;
  /** 右側に常設するチャット。ノートを見ながら話せる配置にするため本体と並べる。 */
  aside?: ReactNode;
}

export const AppShell = ({
  current,
  onSelect,
  children,
  nav,
  aside,
}: AppShellProps): JSX.Element => (
  // preflight を入れていないため body の既定マージンが残る。inset-0 に固定して回り込みを断つ。
  <div className="fixed inset-0 flex bg-paper font-body text-text">
    <nav
      aria-label="メインナビゲーション"
      className="w-52 shrink-0 overflow-y-auto border-0 border-r border-solid border-line bg-paper-raised px-3 py-4"
    >
      <h1 className="m-0 px-3 font-display text-lg font-bold tracking-wide text-ink-aqua-text">
        hanamask
      </h1>
      <p className="mt-6 mb-1 px-3 font-body text-xs tracking-wide text-text-faint">
        ワークスペース
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {RAIL_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={current === id ? "page" : undefined}
              onClick={() => {
                onSelect(id);
              }}
              className={`${RAIL_BUTTON} ${current === id ? RAIL_BUTTON_CURRENT : RAIL_BUTTON_IDLE}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 mb-1 px-3 font-body text-xs tracking-wide text-text-faint">その他</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {RAIL_FOOTER_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={current === id ? "page" : undefined}
              onClick={() => {
                onSelect(id);
              }}
              className={`${RAIL_BUTTON} ${current === id ? RAIL_BUTTON_CURRENT : RAIL_BUTTON_IDLE}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
    {nav}
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    {aside}
  </div>
);
