# SPEC: ノート/ページ(2) リンク・変更通知・タグ・ゴミ箱をノートへ広げる（T55）

## Part 1: 利用者向け

### 何を・なぜ

T54 で用意した「ノート」の器を、既存の横断機能に対等に参加させます（`docs/REQUIREMENTS.md` §4.9「ノートとページは並列の存在」）。このタスクが終わると、ノートは次のことができるようになります。

1. **リンクの端点になれる**: ノート⇔ページ、ノート⇔タスク、ノート⇔ノートの相互リンクを作成・解除・一覧できる（この段階ではテストと既存のリンクツール経由。ノート専用の操作ツール・画面は後続タスク）
2. **タグで引ける**: ノートに付けたタグが、既存のタグ一覧（`list_tags` と画面のタグ絞り込み）の集計に乗る
3. **変更が伝わる**: ノートの作成・更新・削除が、開いている画面への自動反映と OS 通知に乗る（フォーカスが無いときだけ通知される既存の条件はそのまま）
4. **ゴミ箱に並ぶ**: 削除したノートがゴミ箱画面の第3のセクションに出て、復元でき、「あと N 日」表示と30日パージの対象になる（パージの仕組み自体は T54 で実装済み。ここで画面に出す）

既存のページ・タスクの挙動は変わりません。

### 画面イメージ・操作フロー

- **ゴミ箱画面**: 現在の「ノート」「タスク」2セクションに「**ノート（束）**」のセクションが加わり、削除済みノートのタイトル・残り日数・復元ボタンが並ぶ 📸
- **OS通知**: ノートの変更も「ノートを作成しました」のように通知される。**通知をクリックしたときはウィンドウを前面に出すだけ**（ノート詳細画面は T58 で作るため。ページ・タスクの通知クリックは従来どおり該当画面が開く）
- 文言について: 通知やゴミ箱では、当面ページも「ノート」と表示されたままです（アプリ全体の呼び替えは T58 でまとめて行うため、この期間はどちらも「ノート」と出る場面があります）

### 受け入れ条件

- [ ] ノート⇔ページ／ノート⇔タスク／ノート⇔ノートのリンクを作成・解除・一覧できる（既存の `link_entities` / `unlink_entities` / `list_links` で `"notebook"` が使える）
- [ ] 存在しないノートIDへのリンクは今までどおり弾かれる
- [ ] ノートのタグが `list_tags` の件数に乗る（ノート3・ページ2 に同じタグなら合算される）
- [ ] ノートを作成・更新・削除すると、開いている画面に手動リロードなしで変更が伝わる仕組み（変更イベント）が飛ぶ
- [ ] フォーカスが無いときだけ OS 通知される既存条件が、ノートでも保たれる
- [ ] ノートの通知をクリックするとウィンドウが前面に出る（何も起きない、が無い）
- [ ] ゴミ箱にノートのセクションが出て、復元できる。「あと N 日」表示がある
- [ ] 削除済みノートに属していたページの見え方が T54 の方針どおり（ページは読める・復元で束が戻る）
- [ ] 既存のページ・タスクのリンク・タグ・通知・ゴミ箱の挙動が変わらない（既存テストが全て緑）
- [ ] 意味検索の索引がノートの変更イベントに**反応しない**（索引のノート対応は T56。誤って混ざらないこと）

### 未決定・要確認事項

1. **タグの名前空間は共通とする（提案）**: ノートのタグとページ・タスクのタグを同じ一つの集合として扱う（`list_tags` は合算）。タグの役割は「案件で束ねる」ことで、既にノートとタスクを横断しているため。別名前空間にする理由が出てきたら将来分ける。→ この提案で良いか（T55 の停止条件）

---

## Part 2: AI用（実装セット定義）

### 設計の骨子

- **共有 `EntityType`**: `src/shared/preload-api.ts` の `EntityType`（links の端点型）に `"notebook"` を追加。直書きリテラル禁止（漏れは型エラーで出す）。
- **変更イベントは専用チャンネル `notebooks:changed`**: `notes:changed` に乗せると **embedding-indexer（`subscribeNotes`）がノートIDをページとして索引しようとして誤動作する**ため、`change-emitter.ts` に `emitNotebooksChanged`/`onNotebooksChanged` を新設する。`EntityChange.entity` に `"notebook"` を追加（`keepLatestPerEntity` のキーは entity+id なので既存ロジックはそのまま効く）。
- **OS通知**: `ENTITY_LABELS` に `notebook: "ノート"` を追加（note の表示も当面「ノート」のまま。呼び替えは T58）。クリック時の遷移は `NavigateTarget` に `"notebook"` が無いため、**単一変更が notebook のときは集約時と同じ「ウィンドウ前面」フォールバック**にする（`NavigateTarget` はこのタスクでは変えない。T58 で `{kind:"notebook"}` を足すときにこのフォールバックを外す）。
- **タグ**: `tags-repo.ts` の `readTagColumn` を `"notebooks"` も受けるよう拡張し、`listTagsInUse` で合算（未決1の提案どおり共通名前空間）。
- **ゴミ箱**: preload API に `listDeletedNotebooks()` / `restoreNotebook(id)` を追加（IPC 3点セット）。`TrashView` に第3セクション「ノート（束）」（`TrashItem` 構造は共通なので流用）。残り日数は既存の `TRASH_RETENTION_DAYS` 共通定数。
- links-repo: `ENTITY_TYPES` に `"notebook"`、`TABLE_OF` に `notebook: "notebooks"`。`assertEndpointExists` は既存のまま効く。
- `EntityLinks.tsx` の `TYPE_LABELS`/`ENTITY_TYPES` にも `"notebook"`（Record 型なので型エラーで露出）。表示ラベルは「ノート（束）」。

### 実装セット

**セット A: リンクとタグ**
- 目的: 受け入れ条件 1・2・タグ合算
- 触ってよいファイル: `src/shared/preload-api.ts`（`EntityType` への追加**のみ**）、`src/main/db/links-repo.ts`、`src/main/db/tags-repo.ts`、`src/renderer/components/EntityLinks.tsx`（ラベル追加のみ）、`tests/main/db/links-repo.test.ts`（追記）、`tests/main/db/tags-repo.test.ts`（追記）、`tests/main/mcp/link-tools.test.ts`（notebook 端点の追記）、`tests/renderer/EntityLinks.test.tsx`（追記）
- テスト: 3組み合わせのリンク往復／存在しない notebook id が弾かれる／削除済み notebook へのリンクの扱いが既存の note と同じ／タグ合算（ノートのみのタグ・合算・削除済み除外）

**セット B: 変更イベントと OS 通知**
- 目的: 受け入れ条件 3〜6・11
- 触ってよいファイル: `src/main/mcp/change-emitter.ts`、`src/main/notify/change-notifier.ts`、`tests/main/notify/change-notifier.test.ts`（追記）、`tests/main/mcp/change-emitter.test.ts`（あれば追記、無ければ新規）
- テスト: notebook 変更で通知が組み立てられる／単一 notebook 変更のクリックが navigate ではなく「前面に出す」経路に入る／note・task のクリック遷移は不変／`notebooks:changed` が `notes:changed` の購読者に届かない（＝indexer が反応しない。受け入れ条件11）

**セット C: ゴミ箱UI**
- 目的: 受け入れ条件 7・8
- 触ってよいファイル: `src/renderer/components/TrashView.tsx`、`tests/renderer/TrashView.test.tsx`（追記）、`tests/renderer/hanamask-stub.ts`（新API 2本のスタブ）
- 契約: `window.hanamask.listDeletedNotebooks(): Promise<DeletedNotebook[]>` / `restoreNotebook(id): Promise<boolean>`（preload/IPC の実体は Phase 4）
- テスト: 第3セクションの表示・復元ボタン・残り日数・空のとき出さない（既存セクションの流儀に合わせる）

### Phase 4 統合ゲートでのみ編集するファイル
- `src/shared/preload-api.ts`（API 2本の型追加）、`src/preload/index.ts`、`src/main/index.ts`（IPC 2本、`onNotebooksChanged` 購読→broadcast・notifier への配線）
- `tests/e2e/`: **追加を見送った（記録）**。notebook を作る MCP ツールが T57 まで存在せず、E2E から端点を用意する手段が DB 直接投入しかない。リンクの往復・拒否は unit（links-repo）と MCP ツールテスト（link-tools）で実挙動をカバー済みのため、E2E は T57 のツール追加後にまとめて足す。
- `docs/TASKS-notebooks.md` 進捗

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 1 | A, B, C | **可**（ファイル重複なし。`preload-api.ts` は A が `EntityType` 1行のみ、C は触らない） |

### 完了条件
- `npm test` / lint / typecheck / build / E2E 緑（既存挙動不変）
- 壊して確認: `TABLE_OF` の notebook を外すとリンクのテストが落ちる／専用チャンネルを `notes:changed` に戻すと受け入れ条件11のテストが落ちる
- PR は `feature/notebooks` base に1本
