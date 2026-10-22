import { useState, type JSX } from "react";

const HEADING = "エージェントに書く習慣を持たせる";
const INTRO =
  "エージェントは頼まれない限りツールを使いません。下の文面を常設指示に貼っておくと、頼まなくても作業の記録を hanamask に書き、始める前に過去の経緯を読むようになります。";
const WHERE_LABEL = "どこに貼るか";
const WHERE_DESCRIPTION =
  "Claude Code なら ~/.claude/CLAUDE.md（全プロジェクトに効く常設指示）。他のエージェントでも、毎回読み込まれる常設指示の置き場に貼ります。そのまま貼れる完成形なので、書き足しは要りません。";
const COPY_LABEL = "文面をコピー";
const COPY_DONE_LABEL = "コピーしました";

export const STANDING_INSTRUCTION = `## 作業の記録は hanamask に書く

hanamask（ローカルのノート・タスク管理アプリ。MCPサーバーを内蔵）が接続されているとき、作業の記録・決定事項は hanamask に書く。頼まれるのを待たない。**記録の基本単位は「ページ」、ページを案件ごとに束ねたものが「ノート」。**

- **書く**: 作業の区切り、方針や仕様の決定、調べて分かったこと、次に持ち越すこと。\`create_page\` / \`create_task\` を使い、決定はその理由ごと本文にMarkdownで残す。タグを付けて案件を判別できるようにする（\`list_tags\` で既存のタグを再利用する）
- **育てる（新規作成より更新を優先する）**: 同じ話題のページ・タスクが既にあれば、新しく作らず \`update_page\` / \`update_task\` で追記・修正する。続きの作業は既存ページに経過を書き足し、タスクは着手時に \`in_progress\`、終わったら \`done\` へステータスを進める。1つの話題が複数ページに散ると、次に検索したとき全部を読まないと経緯が分からなくなる
- **束ねる（ページが増えたらノートにまとめ、概要を保つ）**: 1つの案件のページが増えてきたら \`create_notebook\` でノート（束）を作り、\`move_page\` で関係するページをそこへ入れる。**作業の区切りでは \`update_notebook\` を使い、束の概要（何の案件か・どこまで進んだか）を今の状態に合わせて書き直す。**概要は開かずに案件の現在地を知るための入口なので、古いまま置かない。利用者が手で書いた概要も、古くなっていれば書き直してよい（編集履歴に残り、復元できる）
- **読む**: 作業を始める前に \`search_notes\` か \`semantic_search_notes\`（意味検索）で過去の経緯を引く。同じ調査を二度やる・決定済みの方針を蒸し返すのを防ぐ。引いたページの内容が古くなっていたら、その場で更新する
- **対話する**: 作業の区切りでは \`wait_for_chat_message\` を呼び、利用者がアプリのチャット欄から送った指示を待つ。届いたメッセージには、対象のページ・タスク・ノートを読んだうえで \`reply_chat_message\` で返信し、必要な操作は従来のツールで行う。タイムアウト（空の結果）は異常ではないので、手を止めるべき理由がなければもう一度待つ
- **ツールが見えないときは書かない**。アプリが起動していなければMCPサーバーも動いていない。無理に接続を試みず、その旨を伝える
- リポジトリ内の作業ログ（\`docs/TASKS.md\` 等）がある場合はそちらが正。hanamaskはそれを置き換えるものではなく、そこに残らない経緯・判断を拾う場所として使う`;

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON = `${FOCUS_RING} m-0 w-fit cursor-pointer appearance-none rounded-md border border-solid border-ink-aqua bg-transparent px-3 py-1.5 font-body text-sm text-ink-aqua-text transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-ink-aqua/10`;
const SNIPPET =
  "m-0 max-w-xl overflow-x-auto rounded-md border border-solid border-line bg-paper-raised px-3 py-2 font-mono text-xs whitespace-pre text-text-soft";

export const StandingInstruction = (): JSX.Element => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(STANDING_INSTRUCTION);
      setError(null);
      setCopied(true);
    } catch (cause) {
      setError(`コピーに失敗しました: ${String(cause)}`);
      setCopied(false);
    }
  };

  return (
    <section className="flex flex-col gap-5 p-6 font-body text-text">
      <h2 className="m-0 font-display text-xl leading-tight font-bold tracking-tight">{HEADING}</h2>
      <p className="m-0 max-w-xl text-sm text-text-soft">{INTRO}</p>

      {error !== null && (
        <p
          role="alert"
          className="m-0 max-w-xl rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}

      <div className="flex max-w-xl flex-col gap-2">
        <h3 className="m-0 font-display text-sm leading-tight font-bold">{WHERE_LABEL}</h3>
        <p className="m-0 text-xs text-text-faint">{WHERE_DESCRIPTION}</p>
        <pre className={SNIPPET}>{STANDING_INSTRUCTION}</pre>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            void copy();
          }}
        >
          {copied ? COPY_DONE_LABEL : COPY_LABEL}
        </button>
      </div>
    </section>
  );
};
