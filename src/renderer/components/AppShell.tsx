import type { JSX, ReactNode } from "react";

/** セクションタブの項目。`trash` だけは一覧ではなくゴミ箱画面に対応する。 */
export type ShellSection = "home" | "notes" | "tasks" | "trash" | "settings";

interface TabItem {
  id: ShellSection;
  label: string;
}

const TAB_ITEMS: readonly TabItem[] = [
  { id: "home", label: "ホーム" },
  { id: "notes", label: "ノート" },
  { id: "tasks", label: "タスク" },
  { id: "trash", label: "ゴミ箱" },
  { id: "settings", label: "設定" },
];

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const TAB_BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 font-body text-xs transition-colors duration-[var(--duration-fast)] ease-standard`;
const TAB_BUTTON_CURRENT = "font-semibold text-ink-aqua-text";
const TAB_BUTTON_IDLE = "text-text-faint hover:text-text";

interface AppShellProps {
  current: ShellSection;
  onSelect: (section: ShellSection) => void;
  children: ReactNode;
  /** 左列のタブの下に常設するノート・ページのツリー。 */
  nav?: ReactNode;
  /** ノートを選んでいる間だけ左列の隣に増えるページ一覧の列。 */
  subPane?: ReactNode;
  /** 右側に常設するチャット。ノートを見ながら話せる配置にするため本体と並べる。 */
  aside?: ReactNode;
}

export const AppShell = ({
  current,
  onSelect,
  children,
  nav,
  subPane,
  aside,
}: AppShellProps): JSX.Element => (
  // preflight を入れていないため body の既定マージンが残る。inset-0 に固定して回り込みを断つ。
  <div className="fixed inset-0 flex bg-paper font-body text-text">
    <nav
      aria-label="メインナビゲーション"
      className="flex w-64 shrink-0 flex-col border-0 border-r border-solid border-line bg-paper-raised px-3 py-4"
    >
      <h1 className="m-0 px-3 font-display text-lg font-bold tracking-wide text-ink-aqua-text">
        hanamask
      </h1>
      <ul className="m-0 mt-4 mb-4 flex list-none flex-wrap gap-3 p-0 px-3">
        {TAB_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={current === id ? "page" : undefined}
              onClick={() => {
                onSelect(id);
              }}
              className={`${TAB_BUTTON} ${current === id ? TAB_BUTTON_CURRENT : TAB_BUTTON_IDLE}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      {/* ツリーだけを伸ばして畳ませないと、ページが増えたときロゴごと押し出される。 */}
      <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
    </nav>
    {subPane}
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    {aside}
  </div>
);
