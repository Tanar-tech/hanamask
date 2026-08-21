# SPEC: ピン留め（T60）

## Part 1: 利用者向け

### 何を・なぜ

よく見るノート・ページを、利用者が自分で固定（ピン留め）できるようにします。ピン留めした記録はナビゲーションの最上部にまとまって出るので、案件が増えても「いつも見るもの」へ最短で届きます。**利用者主体の機能**であり、AIエージェントにピン留めの操作ツールは与えません（エージェントは「利用者が重視している記録」として参照できるだけ）。要求定義 §4.10（2026-08-21 承認済み）の実装です。

### 画面イメージ・操作フロー

**ピン留めする・外す（2か所）**

1. **ナビゲーションの行**: ノート・ページの行にマウスを載せると右端にピンのトグルが現れる。クリックでピン留め／解除。ピン留め中の行には常にピン印が付く 📸
2. **詳細画面のヘッダー**: ページ詳細・ノート詳細の「編集」ボタンの隣に「ピン留め」（ピン中は「ピン留め解除」）ボタン 📸

**ピン留めの表示**

- **ナビ最上部に「ピン留め」セクション**: 1件以上ピンがあるときだけ見出しつきで出る。ノートとページが混在し、並びは**ピン留めした順**で固定（並び替えUIは持たない）。ピン留めした記録は、下の通常ツリーにも今までどおり出る（居場所は変わらない） 📸
- **ノートを開いたとき（Main View）**: そのノートの中にピン留めページがあるときは、「最近更新されたページ」欄が「**ピン留めしたページ**」欄に置き換わる（ピン順・全件）。無いときは従来どおり最近更新3件。サブペイン＝全量・時系列、Main View＝利用者が選んだ精鋭、という役割の違いを作る 📸
- **サブペイン（ノート内ページ一覧）**: 並びは更新日降順のまま変えない。ピン留め中のページにはピン印だけ付ける

**挙動の細部（提案を含む）**

- ピン留め・解除は**編集履歴に残らず、更新日時も動かさない**（本文の変更ではないため。一覧の並びが勝手に変わらない）
- OS通知・意味検索の再索引も走らない
- **ゴミ箱との関係（提案）**: ピン留めした記録を削除するとピン留めセクションからは消える（ゴミ箱行きの記録はナビに出ないため）。復元するとピン留めも戻る。パージすれば記録ごと消える
- **ピン数の上限（提案）**: 設けない。個人利用で、増えすぎたら利用者が自分で外す運用とする（セクションはスクロールに追従するだけ）
- ナビの絞り込み中は「ピン留め」セクションを出さない（絞り込み結果は検索結果として一本のリストで見せる。ピン留め中の記録が一致すれば結果には出る）
- エージェント向けには、既存の取得・一覧・検索系ツールの返り値に `pinnedAt`（ピン留めした日時、未ピンは null）が載るだけ。ピン操作のMCPツールは作らない

### バージョンについて

要求定義 §4.10 は「v2.1.1」と書いていましたが、その番号は常設指示の文言パッチ（2026-08-21 リリース済み）が使ったため、本機能は**v2.2.0**（機能追加＝minor）として出します。§4.10 の表記もこのタスク内で改めます。

### 受け入れ条件

- [ ] ナビの行のホバーでピンのトグルが現れ、クリックでピン留め／解除できる（ノート・ページ両方）
- [ ] ページ詳細・ノート詳細のヘッダーからもピン留め／解除できる
- [ ] ピンが1件以上あるとき、ナビ最上部に「ピン留め」セクションが出て、ピン留めした順に並ぶ。0件なら出ない
- [ ] ノートの Main View: ノート内にピン留めページがあれば「ピン留めしたページ」欄（ピン順）、無ければ従来の「最近更新されたページ」欄
- [ ] ピン留め・解除で編集履歴が増えず、更新日時が変わらない
- [ ] 削除でピンセクションから消え、復元で戻る
- [ ] MCPの取得・一覧・検索系の返り値に `pinnedAt` が載る（ピン操作ツールは存在しない）
- [ ] 既存DBを開くと `pinned_at` 列が追加され、既存データは全て未ピンのまま残る（旧DBテスト＋リリース前の実データ検証）
- [ ] ナビの絞り込み中はピンセクションが出ない

### 未決定・要確認事項

1. 「ゴミ箱との関係」「上限なし」「絞り込み中は非表示」は上記の提案どおりで良いか
2. バージョンを v2.2.0 に読み替えることの確認

---

## Part 2: AI用（実装セット定義）

前提: 調査済みの実装事実（2026-08-21、main = v2.1.1）に基づく。ブランチは main ベースの1本（`feat/t60-pins`）、PR は draft 1本。

### 共有契約（Phase 3 開始前に開発管理者が先行コミットする）

セット間の型不整合を防ぐため、以下の**契約ファイルの変更は Phase 3 の前に開発管理者が単独コミット**し、各セットはそれを前提に作業する（Phase 4 でのみ再調整可）:

- `src/shared/preload-api.ts`: `Note`（2-11行）・`Notebook`（93-100行）に `pinnedAt: string | null` を追加。`HanamaskPreloadApi` に `setNotePinned(id: string, pinned: boolean): Promise<Note | null>` / `setNotebookPinned(id: string, pinned: boolean): Promise<Notebook | null>` を追加
- `src/preload/index.ts`: チャンネル定数 `notes:set-pinned` / `notebooks:set-pinned` と api 実装（invoke 1行ずつ）
- `tests/renderer/hanamask-stub.ts`: 新APIのスタブと `pinnedAt: null` の既定値

### セット A: DB とmainプロセス

- 目的: 受け入れ条件のうち「pinned_at 列の追加・旧DB互換」「編集履歴・更新日時を動かさない」「pinnedAt がMCP返り値に載る」
- 触ってよいファイル:
  - `src/main/db/schema.sql`（notes / notebooks に `pinned_at TEXT` を追加）
  - `src/main/db/migrations.ts`（`MIGRATIONS` 配列**末尾**に `addColumnMigration("notes","pinned_at","TEXT")` と `addColumnMigration("notebooks","pinned_at","TEXT")` を追記。146行の `notebook_id` 追加が同型の先例。既存項目は書き換えない）
  - `src/main/db/notes-repo.ts`（`NoteRow`・`isNoteRow`・`toNote` に pinned_at を追加。`setNotePinned(id, pinned)` を新設 — `moveNoteToNotebook`（150-159行）と同型: 単一列UPDATE、`WHERE id = ? AND deleted_at IS NULL`、スナップショット無し・updated_at 不変、成功時 `getNote(id)` 返し。`createNote` の INSERT は列を足さない（NULL既定））
  - `src/main/db/notebooks-repo.ts`（同様に `NotebookRow`・`isNotebookRow`・`toNotebook`・`setNotebookPinned`）
  - `src/main/index.ts`（IPCハンドラ `notes:set-pinned` / `notebooks:set-pinned`。入力型ガードは `readNotebookUpdateInput`（364-382行）に倣う。**`emitNotesChanged()` / `emitNotebooksChanged()` を引数なしで呼ぶ** — EntityChange を渡すと embedding-indexer（`handleChange` 173-188行）が無条件で再埋め込みし、change-notifier がOS通知を出すため。チャンネル定数の追記も忘れない）
  - `tests/main/db/migrations.test.ts`（v2.1.x 相当＝pinned_at 無しの旧DB定数を追加し、既存パターン（321/331/352/310/365行）どおり: 旧DBを開くと列が揃う・既存行が残る・二度開き・apply直呼び・新規DBと形一致）
  - `tests/main/db/notes-repo.test.ts` / `tests/main/db/notebooks-repo.test.ts`（setNotePinned の設定・解除・削除済みには効かない・updated_at 不変・スナップショット無し）
  - `tests/main/` 配下の該当IPC/MCPテスト
- 依存（読み取りのみ）: `docs/MIGRATIONS.md`、`src/main/mcp/tools/`（返り値は repo の戻りをそのまま JSON 化するためツールファイルの変更は不要）、`src/main/llm/embedding-indexer.ts`
- 禁止: MCPツールの新設・説明文変更、`updateNote`/`updateNotebook` 経由でのピン更新、EntityChange 付き emit

### セット B: ナビゲーション（ピンセクションと行トグル）

- 目的: 受け入れ条件のうち「ナビ行のトグル」「ピンセクション」「絞り込み中は非表示」
- 触ってよいファイル:
  - `src/renderer/text/navFilter.ts`（`NavNotebook`/`NavPage` に `pinnedAt` を追加。ピン項目の抽出関数（ピン順ソート）を純関数として追加。絞り込み中はピンセクション無しの現行結果を返す）
  - `src/renderer/components/NotebookNav.tsx`（`<li>` を flex 化し、行ボタンとピントグルボタンを並列に置く（ボタンのネスト不可のため）。トグルはホバー/フォーカスで表示（`group`/`group-hover`）、ピン中は常時ピン印。最上部に「ピン留め」見出しセクション — 見出しのスタイルは NotebookSubPane 67行のパターンに合わせる）
  - `tests/renderer/navFilter.test.ts` / `tests/renderer/NotebookNav.test.tsx`
- 依存（読み取りのみ）: `src/shared/preload-api.ts`（先行コミット済みの契約）、`tests/renderer/hanamask-stub.ts`
- 注意: 既存テストの `getByRole("button", { name })` が行構造の変更で二重ヒットしないよう、トグルの `aria-label` は「〜をピン留め」「〜のピン留めを解除」と行名と衝突しない形にする

### セット C: 詳細画面とサブペイン

- 目的: 受け入れ条件のうち「詳細ヘッダーのボタン」「Main View のピン留めページ欄」「サブペインのピン印」
- 触ってよいファイル:
  - `src/renderer/components/PinToggleButton.tsx`（新規・共有小コンポーネント。`DeleteButton.tsx` が先例）
  - `src/renderer/components/NotebookDetail.tsx`（ヘッダー 230-242行に BUTTON_SECONDARY でトグル追加。`RecentPages`（192-214行）: `notes` にピンありなら見出し「ピン留めしたページ」・ピン順・全件、無ければ従来3件。`aria-label`・空欄文言も分岐）
  - `src/renderer/components/NoteDetail.tsx`（ヘッダー 383-398行にトグル追加）
  - `src/renderer/components/NotebookSubPane.tsx`（ピン印の表示のみ。並びは変えない）
  - `tests/renderer/NotebookDetail.test.tsx` / `tests/renderer/NoteDetail.test.tsx` / `tests/renderer/NotebookSubPane.test.tsx`
- 依存（読み取りのみ）: `src/shared/preload-api.ts`（契約）、`tests/renderer/hanamask-stub.ts`
- 禁止: NotebookNav / navFilter への変更（セットBの領分）

### 並列グループ宣言

- 契約コミット（開発管理者）→ **A・B・C の3セットを並列実行可**（触るファイルは互いに素）
- 共有ファイル `src/shared/preload-api.ts` / `src/preload/index.ts` / `src/main/index.ts` / `tests/renderer/hanamask-stub.ts` のうち、`src/main/index.ts` はセットAのみが触る。それ以外は契約コミット後、Phase 4 統合ゲートでのみ再編集可
- E2E（`tests/e2e/` に pin-flow の追加、`notebook-flow.spec.ts` への影響確認）は Phase 4 で開発管理者が行う

### Phase 4 / 検証

- 統合後: `npm test`・`npm run lint`・`npm run typecheck`・`npm run check:readme` 全緑
- E2E: ピン留め→ナビ最上部に出る→解除で消える、Main View の欄の置き換わり、をシナリオ追加
- ドキュメント: `docs/REQUIREMENTS.md` §4.10 の見出しを v2.2.0 に改め確定事項を反映、`docs/TASKS.md` T60 進捗、README（画面構成の節にピン留めの一文、MCP返り値の `pinnedAt`）、CHANGELOG（Unreleased → 2.2.0）
- リリース前: `docs/MIGRATIONS.md` §6 の実データ検証（実DB複製 → openDb → 件数不変・integrity ok・全行 pinned_at IS NULL）を実施し §6 実績表に追記

### 完了条件（機械判定）

- 上記4コマンド全緑、追加したマイグレーションテスト・repoテスト・rendererテスト・E2Eが緑
- PR は main base の draft 1本（マージは管理者）

### セーフティ

- 各セットの自己修正は3回まで。テストの削除・緩和でのグリーン化は禁止
- 停止②（/structured-review）まで自律で進め、それ以外で確認を求めるのは本 Part 1 の停止①のみ
