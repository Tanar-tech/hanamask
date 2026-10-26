# SPEC: v2.3.0「読んで、返す」（T66 前回から変わったところ／T67 レビューコメント／T68 部分編集）

> 要求定義 `docs/REQUIREMENTS.md` §4.11〜§4.13・§7.4（2026-10-25 管理者決定）。**停止①は 2026-10-25 に承認済み**（「管理者に確認したいこと」の5点もすべて承認: 依存2つの追加、画面側の上書き防止を含める、T62 の PR #231・#232 を閉じる、常設指示の文面変更、タスクは未読の印だけ）。

## Part 1: 利用者向け

### 何を・なぜ

hanamask は「エージェントが書き、人間が読む」アプリです。v2.3.0 では、**読む側**を強くします。

- **前回から変わったところ**: 前に読んだときから何が変わったかを示します。毎回全文を読み直さなくて済みます
- **レビューコメント**: 読んで気づいたことを記録の該当箇所に残すと、エージェントがそれを読んで直します。PRレビューと同じ非同期のやりとりで、Claude Code などの画面と役割を取り合いません（T62 のチャット欄はこれで置き換えます）
- **部分編集**: エージェントが本文を丸ごと送り直さずに、追記や節の置き換えをできるようにします。人の編集とエージェントの編集がぶつかったときに、黙って上書きしないようにします

### 画面イメージ・操作フロー

**前回から変わったところ**

- ナビのツリー・ノート内のページ一覧・ホーム・タスク一覧とカンバンで、**最後に見たあとで更新された記録に未読の印**（小さな点と「未読」の文字）が付く 📸
- ノートの行は、概要か中のページのどれかが未読なら印が付く
- ページ・ノートの詳細画面を開くと、上部に「**前回から変わったところ**」が出る。最後に見た時点の内容との差分で、足した行と消した行を色と記号（＋／−）で示す。閉じることもできる 📸
- 開いた時点で既読になる。画面で自分が保存したときも既読に戻る。ホームに「すべて既読にする」
- タスクは編集履歴を持たないため、未読の印だけ（差分は出さない）
- v2.3.0 を入れた時点の記録は、すべて既読から始まる

**レビューコメント**

- ページ・タスクの本文を表示中に範囲を選ぶと、選択の近くに「コメント」ボタンが出る。押すと入力欄が開き、選んだ文字列を引用した状態で書ける 📸
- 詳細画面の右側（狭い画面では本文の下）に「コメント」欄。未解決のスレッドを上に、解決済みを畳んで並べる。スレッドを押すと本文の該当箇所が光る 📸
- 範囲を選ばず「記録へのコメント」も付けられる
- エージェントは MCP で未解決のコメントを読み、返信し、直したら解決にする。エージェントの返信・解決は、画面を見ていなければ OS の通知で知らせる（タイトルだけ）
- 利用者は解決・再開・削除ができる。本文が書き換わって引用した文字列が見つからなくなったコメントには「元の箇所が変わりました」と出る
- 設定画面の常設指示に「作業の前に未解決のコメントを確かめる」を足す

**部分編集**

- エージェント向けのツールが増えるだけで、画面は変わらない
- 編集中にエージェントの更新が届いたあとで「保存」を押すと、「最新を読み込む」か「自分の内容で上書きする」かを選ぶ確認が出る（今は黙って上書きしている）

### 受け入れ条件

**前回から変わったところ**
- [ ] エージェントが更新したページ・ノート・タスクに、ツリー・ページ一覧・ホーム・タスク一覧・カンバンで未読の印が付く
- [ ] 詳細画面を開くと印が消え、アプリを再起動しても既読のまま
- [ ] 自分で画面から保存した記録には印が付かない
- [ ] ページを開くと、最後に見た時点からの差分が上部に出る。変わっていなければ出ない
- [ ] 「すべて既読にする」で全部の印が消える
- [ ] 入れた直後は、既存の記録に印が付いていない

**レビューコメント**
- [ ] 本文の範囲を選んでコメントを付けられる。範囲なしのコメントも付けられる
- [ ] エージェントが `list_comments` で未解決のコメント（引用・本文・返信）を取れ、`reply_comment` で返信、`resolve_comment` で解決にできる。画面に手動のリロードなしで反映される
- [ ] スレッドを押すと本文の該当箇所が光る。文字列が消えたら「元の箇所が変わりました」と出る
- [ ] 利用者が解決・再開・削除できる
- [ ] コメントに HTML や Markdown を書いても、そのまま文字として表示される
- [ ] 記録をゴミ箱に入れて戻すと、コメントも戻る

**部分編集**
- [ ] `append_to_page` でページ末尾、または見出しの節の末尾に追記できる
- [ ] `replace_page_section` で見出しの節だけを置き換えられる。コードブロックの中の `#` を見出しと取り違えない
- [ ] 見出しが見つからない・複数あるときは書き換えず、候補の見出しを返す
- [ ] 更新系のツールに最終更新日時を渡すと、食い違ったとき書き換えずに知らせる
- [ ] 部分編集でも編集履歴が残り、画面に反映され、通知と意味検索の索引が動く
- [ ] 編集中にエージェントの更新が届いたあとの保存で、確認が出る

### 管理者に確認したいこと

1. **依存の追加**（GOVERNANCE §6）: 差分の計算に `diff`（9.0.0、BSD-3-Clause、依存なし）、見出しの位置を正しく見つけるのに `mdast-util-from-markdown`（2.x、MIT。react-markdown の間接依存としてすでに入っている）を直接の依存に加えたい
2. **画面側の上書き防止**（部分編集の最後の項目）は、エージェントの編集を人が黙って上書きする逆向きの問題で、提案した D の範囲を少し広げている。含めてよいか
3. **T62（チャット欄）の PR #231・#232** は、レビューコメントで置き換えるので閉じてよいか
4. **常設指示の文面が変わる**ため、利用者が自分の CLAUDE.md 等に写した文面は古くなる（グローバルの `~/.claude/CLAUDE.md` の hanamask 節も追従が要る）。リリースノートで案内する
5. タスクは差分を出さず未読の印だけにする（タスクに編集履歴を足すのは別の話）。これでよいか

## Part 2: AI用（実装セット定義）

### 共有契約（Phase 3 開始前に開発管理者が先行コミットする）

- `package.json` / `package-lock.json`: `diff`、`mdast-util-from-markdown` を追加（承認後）
- `src/main/db/schema.sql` と `src/main/db/migrations.ts`: 表 `views(entity_type TEXT, entity_id TEXT, viewed_at TEXT, PRIMARY KEY(entity_type, entity_id))`、表 `comments(id TEXT PK, entity_type TEXT, entity_id TEXT, parent_id TEXT NULL, author TEXT CHECK in ('user','agent'), body TEXT, quote TEXT NULL, prefix TEXT NULL, suffix TEXT NULL, status TEXT DEFAULT 'open', created_at, updated_at, resolved_at NULL, deleted_at NULL)`。既読の基準時刻（導入時刻）は `app_meta` か設定ファイルに1回だけ記録する（どちらにするかは共有契約で決めて固定する）
- `src/shared/preload-api.ts`: `ViewState`・`Comment`・`CommentThread` の型、`HanamaskPreloadApi` に `markViewed` / `markAllViewed` / `listUnread` / `readChangesSinceView` / `listComments` / `createComment` / `replyComment` / `setCommentStatus` / `deleteComment` / `onCommentsChanged`
- `src/main/mcp/change-emitter.ts`: `comments` チャンネルと `views` チャンネル

### セット A: 既読と差分（main）

触るファイル: `src/main/db/views-repo.ts`（新規）、`src/main/views/changes-since-view.ts`（新規。最後に見た時点の内容を編集履歴から選ぶ純粋関数）、`tests/main/db/views-repo.test.ts`、`tests/main/views/*.test.ts`。
- 未読の判定: `updated_at > COALESCE(viewed_at, 導入時刻)`。ノートは概要か所属ページのどれかが未読なら未読
- 最後に見た時点の内容: `viewed_at` より後に作られた最初の版（その版は更新前の内容を持つ）。無ければ変化なし

### セット B: 既読と差分（画面）

触るファイル: `src/renderer/components/UnreadMark.tsx`（新規）、`src/renderer/components/ChangesSinceView.tsx`（新規。差分の表示）、`src/renderer/hooks/useUnread.ts`（新規）、対応する `tests/renderer/*.test.tsx`。既存の一覧・詳細コンポーネントへの組み込みは Phase 4。

### セット C: レビューコメント（main）

触るファイル: `src/main/db/comments-repo.ts`（新規）、`src/main/mcp/tools/comments.ts`（新規。`list_comments` / `reply_comment` / `resolve_comment`）、`tests/main/db/comments-repo.test.ts`、`tests/main/mcp/comment-tools.test.ts`。
- 返り値に本文は含めるが、通知の payload には含めない。対象の記録が無い・削除済みならエラー

### セット D: レビューコメント（画面）

触るファイル: `src/renderer/components/CommentPanel.tsx`、`src/renderer/components/SelectionCommentButton.tsx`、`src/renderer/hooks/useTextQuoteHighlight.ts`（新規。CSS Custom Highlight API で DOM を書き換えずに光らせる）、`src/renderer/text-quote.ts`（新規。選択から引用・前後の文字を作る／本文から探す純粋関数）、対応するテスト。コメント本文は装飾なしの文字として描画する（`dangerouslySetInnerHTML` 禁止、MarkdownBody を使わない）。

### セット E: 部分編集（main）

触るファイル: `src/main/markdown/sections.ts`（新規。mdast で見出しと節の範囲を求め、元の文字列を差し替える）、`src/main/mcp/tools/page-edits.ts`（新規。`append_to_page` / `replace_page_section`）、`tests/main/markdown/sections.test.ts`、`tests/main/mcp/page-edit-tools.test.ts`。書き換えは既存の `updateNote` を通す（履歴・更新日時・通知・索引を共有する）。

### 並列グループ宣言

A・C・E（main、ファイル重複なし）と B・D（画面、ファイル重複なし）の5セットを並列に実行する。

### Phase 4（開発管理者のみ）

`src/main/mcp/server.ts`・`src/main/chat/agent-loop.ts`（ツール登録）、`src/main/mcp/tools/notes.ts`・`tasks.ts`・`notebooks.ts`（`expected_updated_at`）、`src/main/db/purge.ts`（コメントの後始末）、`src/main/index.ts`（IPC・通知・バックアップ取り込み後の再読込）、`src/main/notify/change-notifier.ts`、`src/preload/index.ts`、`src/renderer/components/` の既存一覧・詳細（NotebookNav・NotebookSubPane・Home・TaskList・KanbanView・NoteDetail・NotebookDetail・TaskDetail）への組み込みと保存時の確認、`StandingInstruction.tsx`、`scripts/check-readme-tools.mjs` の対象、ツール名一覧のテスト、README・SECURITY・CHANGELOG・docs（HTML 同期）、`docs/MIGRATIONS.md` の記録。

### 完了条件（機械判定）

`npm run lint` / `npm run typecheck` / `npm run build` / `npm test` / `npm run check:readme` が緑。CI の E2E が緑。

### セーフティ

各セットの自己修正は3回まで。テストの削除・無効化・アサーションの緩和で緑にしない。リリース前に `docs/MIGRATIONS.md` §6 の実データ検証を行う。
