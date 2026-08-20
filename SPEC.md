# SPEC: ノート/ページ(5) Explorer型ナビゲーションと呼び替え（T58）

## Part 1: 利用者向け

### 何を・なぜ

v2.1.0 の画面を完成させます。決定済みの設計（§4.9、モックアップ案B）どおり:

1. **Explorer型ナビ（サブペイン方式）**: 左列にノート（ページ数バッジつき）と無所属ページが混在して並び、ノートをクリックすると隣に**そのノートのページ一覧のペイン**が開く。ナビ上部に**絞り込みボックス**（タイトルの逐次絞り込み。全文・意味検索は従来どおりホームの検索）
2. **ノートの Main View（案1の役割分担）**: ページ一覧はナビ側だけが持ち、Main View は**概要（AIが追従更新する本文）・タグ・「最近更新されたページ」プレビュー2〜3件**（本文抜粋、クリックで開く）。概要とタグは画面から手動編集もできる
3. **呼び替えの一括実施**: 画面・通知・ゴミ箱の文言で、旧「ノート」を**ページ**に、束を**ノート**に統一する（例: 左レール「ノート」区画→Explorer ナビ、OS通知「ページを作成しました」、ゴミ箱のセクション名）。**MCPツール名・README のツール説明は変えない**（互換の約束どおり）
4. **通知クリックでノートが開く**: T55 で「前面に出すだけ」にしていたノートの通知クリックが、ノートの Main View を開くようになる。`open_notebook` の UI 連携ツールも追加（`open_note` 等と同列）
5. 検索結果の「意味が近い記録」のノート行もクリックで開けるようになる（T56 で非ボタンだった箇所の配線）

### 画面・挙動の要点（モックアップ準拠: https://claude.ai/code/artifact/de1e857c-b3d9-42c2-85cd-5be94fc2e7c1 案B）

- 移行直後（ノート0件・全て無所属ページ）でも従来のノート一覧と同じ感覚で使える（無所属ページがそのまま並ぶ。疑似ノートは作らない）📸
- ページが1件も無いノートはサブペインに「ページはありません」📸
- MCP 経由の作成・移動・削除がナビとサブペインに手動リロードなしで反映される
- **提案（要求定義に無いため確認）**: ナビに**タスクは並べない**（タスクは従来の左レールのまま）／並び順は**更新日の新しい順で固定**／**ドラッグでの移動は入れない**（移動は `move_page` と詳細画面から）

### 受け入れ条件

- [ ] ナビにノート（ページ数バッジ）と無所属ページが混在して並び、絞り込みボックスでタイトル逐次絞り込みできる
- [ ] ノートをクリックするとサブペインにページ一覧が出て、ページクリックでページ詳細が開く
- [ ] ノートの Main View に概要・タグ・最近のページプレビューが出て、概要・タグを手動編集できる（編集履歴に積まれる）
- [ ] ページ一覧が Main View に重複して出ない（案1）
- [ ] 移行直後（全て無所属）・空DB・ページ0件のノート、それぞれで壊れず適切に表示される
- [ ] MCP 経由の変更（create_page/move_page/update_notebook 等）がナビ・サブペイン・Main View に手動リロードなしで反映される
- [ ] ノートの OS 通知クリックでノートが開く。`open_notebook` ツールで外部からも開ける
- [ ] 画面・通知・ゴミ箱の文言が「ページ／ノート」に統一される（MCPツール名・引数は不変）
- [ ] 既存の動線（ホーム・検索・タスク・ゴミ箱・設定）が壊れない（既存テスト緑。文言変更に伴う期待値更新はある）

### 未決定・要確認事項

1. 上記「提案」3点（タスクは並べない／更新日降順固定／D&Dなし）で良いか

---

## Part 2: AI用（実装セット定義）

### 設計の骨子

- **NavigateTarget に `{kind:"notebook", id}` を追加**（消費4箇所: preload `onNavigate`・main `navigateUi`・通知クリック・App.tsx）。T55 の通知フォールバック（notebook→前面のみ）を撤去。
- **preload API 追加（3点セット）**: `listNotebooks()`, `getNotebook(id)`（`{notebook, notes}`）, `updateNotebook(id, input)`, `listNotesInNotebook` は getNotebook に同梱。`onNotebooksChanged` は T55 で結線済み。
- **UI ツール**: `open_notebook`（`src/main/mcp/tools/ui.ts`、`navigateUi({kind:"notebook", id})`。README 追記）。
- **文言**: `ENTITY_LABELS` を `{note:"ページ", task:"タスク", notebook:"ノート"}` に。`EntityLinks` の `TYPE_LABELS` も `{note:"ページ", notebook:"ノート"}`。TrashView のセクション名・空文言、左レール、各画面の見出し・aria-label。**`StandingInstruction` と README の本文言い換えは v2.1.0 リリース整備（別タスク）に回す**（ツール互換の説明と絡むため。ここでやるのはアプリ内 UI の文言のみ）。E2E の日本語アサーションも追従。
- **AppShell 再構成**: 左レール（ホーム/タスク/ゴミ箱/設定）は維持し、「ノート」区画を Explorer ナビ（`NotebookNav`）に置き換える。サブペインは `NotebookNav` の隣に条件表示（選択中ノートがあるとき）。既存 `NoteList` はページ一覧画面として残す（ナビからの遷移先はページ詳細直行なので露出は減るが、`open_search` 等の動線は不変）。
- 並び順: ノート・ページとも `updatedAt` 降順（提案どおり固定）。バッジは所属ページ数（削除済み除外）。
- 絞り込み: レンダラー内の純関数（`filterNavItems(query, items)`）。ノート名がヒットしたらノートを出す。ページ名ヒットは無所属・所属を問わず出す（所属ページは「ノート名 > ページ名」の文脈が分かる表示）。

### 実装セット

**セット A: ナビ部品（純粋レンダラー）**
- 触ってよいファイル: `src/renderer/components/NotebookNav.tsx`（新規: ノート＋無所属ページの一覧・バッジ・絞り込み・選択状態）、`src/renderer/components/NotebookSubPane.tsx`（新規: ページ一覧・空表示）、`src/renderer/text/navFilter.ts`（新規: 純関数）、対応テスト3ファイル＋`hanamask-stub.ts` 追記
- 契約: `window.hanamask.listNotebooks()` / `getNotebook(id)`（実体は Phase 4）。`searchNotes()` の既存 API で無所属ページを取る（`notebookId` フィルタは T57 で追加済み……無所属の絞り込みが必要なら `listNotes` を使いフィルタはレンダラー側）
- テスト: 混在表示・バッジ・絞り込み（ノート名/ページ名/ヒットなし）・空DB・選択でサブペイン用コールバック発火・変更イベントで再取得

**セット B: ノート詳細 Main View**
- 触ってよいファイル: `src/renderer/components/NotebookDetail.tsx`（新規: 概要 Markdown 表示・編集（`MarkdownBody` 流用）・タグ・最近のページプレビュー3件・`EntityLinks`・`RelatedNotes` は置かない）、対応テスト＋`hanamask-stub.ts` 追記
- 契約: `getNotebook(id)` / `updateNotebook(id, input)`
- テスト: 表示・編集保存（updateNotebook 呼び出し）・プレビューが最大3件で本文抜粋・クリックでページ遷移・外部更新の反映（onNotebooksChanged）

**セット C: 文言の呼び替えと通知遷移**
- 触ってよいファイル: `src/main/notify/change-notifier.ts`（ラベル・notebook クリック遷移＝フォールバック撤去）、`src/renderer/components/EntityLinks.tsx`・`TrashView.tsx`・`Home.tsx`・`NoteList.tsx`・`SearchResults.tsx`・`SemanticSearchResults.tsx`・`RelatedNotes.tsx` 等の**文言のみ**（構造は変えない）、`src/main/mcp/tools/ui.ts`（`open_notebook`）、`src/main/ui/navigate.ts`、`README.md`（UIツール表に1行）、対応テストの文言期待値更新、`tests/e2e/` の日本語アサーション追従
- テスト: 通知ラベル3種・notebook クリックで navigate・`open_notebook` の正常/異常・各画面の文言

### Phase 4 統合ゲートでのみ編集するファイル
- `src/shared/preload-api.ts`（API 3本・`NavigateTarget`）・`src/preload/index.ts`・`src/main/index.ts`（IPC、`NOTEBOOKS_GET/LIST/UPDATE` チャンネル）
- `src/renderer/App.tsx`・`AppShell.tsx`（ナビ組み込み・ルーティング `{kind:"notebook"}`）
- `tests/e2e/notebook-flow.spec.ts` に画面確認を追記（ナビに出る・クリックで開く・📸3枚）
- `docs/TASKS-notebooks.md` 進捗

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 1 | A, B, C | **可**（A/B は新規ファイル中心、C は既存ファイルの文言のみで A/B と重複しない） |

### 完了条件
- unit / lint / typecheck / build / E2E 緑（文言追従含む）
- 壊して確認: 絞り込みの純関数・通知遷移・重複一覧が出ないこと（NotebookDetail にページ一覧を足すと落ちるテスト）
- 📸 3枚（ナビ＋サブペイン／ノート Main View／移行直後の無所属のみ）
- PR は `feature/notebooks` base に1本
