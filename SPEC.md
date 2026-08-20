# SPEC: ノート/ページ(3) 意味検索の索引をノートへ広げる（T56）

## Part 1: 利用者向け

### 何を・なぜ

ノートの**概要**も意味検索の索引に乗せ、`semantic_search_notes` と画面の「意味が近い記録」「関連するノート」がノート・ページ・タスクの**3種**を返せるようにします（§4.9 の並列性。ここが欠けるとノートは検索から見えない入れ物のままです）。

- ノートの作成・概要更新の数秒後に、そのノートが意味検索で引けるようになります（ページと同じ裏側の自動索引）
- 検索結果・関連欄でノートは「ノート（束）」のラベルで区別され、更新日も併記されます
- 既存のページ・タスクの索引と検索結果は変わりません

### ⚠️ 承認が必要な操作を含みます（停止条件）

索引テーブル `embeddings` は種別の列に**チェック制約**（'note'/'task' のみ許可）を持ち、SQLite はこれを後から変更できません。**表を作り直すマイグレーション**（新表作成→データ移送→旧表削除→改名）が必要で、`docs/MIGRATIONS.md` §4 の管理者承認対象です。計画は次のとおり:

| 項目 | 内容 |
|---|---|
| 移送するデータ | `embeddings` 全行（実DBで現在41件・1行約1.6KB＝計約66KB。ベクトルは再計算しない） |
| 方式 | 1トランザクション内で `CREATE TABLE embeddings_new`（CHECK に 'notebook' を追加）→ `INSERT INTO ... SELECT` → `DROP TABLE embeddings` → `RENAME TO embeddings` |
| 失敗時 | トランザクションごとロールバックされ、旧表がそのまま残る（中途半端な状態にならない） |
| 最悪の場合 | 仮に索引が失われても**ベクトルは本文から再計算できる派生データ**であり、起動時の差分埋めが自動復旧する（記録本体には一切触れない） |
| バックアップ | 上記により追加のバックアップは不要と判断。ただしリリース前の §6 実データ検証（複製に通す）は T54 同様に実施する |
| 再インデックス | 不要（既存ベクトルをそのまま移送。全件再計算は発生しない） |

### 受け入れ条件

- [ ] ノートを作成・概要更新すると、数秒以内に `semantic_search_notes` で引けるようになる
- [ ] 検索結果にノートが「ノート（束）」ラベル＋更新日つきで、ページ・タスクとスコア順に混ざって出る（MCP と画面の両方）
- [ ] ノート詳細の「関連するノート」欄は従来どおりページのみ（ノートを関連に出すかは T58 の画面設計で決める。現状の挙動を変えない）
- [ ] 削除済みノートが結果に出ない。ノートのパージで索引の孤児行も消える
- [ ] マイグレーションで既存のベクトルが1件も失われない（件数・内容の突き合わせ）
- [ ] 何度開き直しても壊れない。新規インストールとアップグレードでDBの形が一致する
- [ ] モデル未準備時の挙動（空＋理由）は従来どおり
- [ ] 既存のページ・タスクの索引・検索結果が変わらない（既存テスト緑）

### 未決定・要確認事項

なし（上記の承認1点のみ。**この SPEC の承認＝作り直しマイグレーションの承認**として扱います）

---

## Part 2: AI用（実装セット定義）

### 設計の骨子

- **マイグレーション**: `migrations.ts` に新種別 `rebuildEmbeddingsForNotebooks`。`isApplied` は「`embeddings` の DDL（`sqlite_master.sql`）に `'notebook'` が含まれるか」で判定。`apply` は上表の4手順を `db.transaction()` で。`schema.sql` と `migrations.ts` の `EMBEDDINGS_TABLE` は**両方**とも CHECK を `IN ('note','task','notebook')` に更新（二重記載の食い違い禁止）。
- **embeddings-repo**: `EmbeddedEntityType` に `"notebook"`（T55 で `EntityType` は拡張済みだが embeddings 側は独自 union）。UNION SQL 3箇所（`LIST_EMBEDDINGS_SQL` / `LIST_INDEXED_STATE_SQL` / `deleteOrphanEmbeddings`）に notebooks の枝（`summary` を body 相当に）。**3箇所同時に**（片方だけ直すと検索と索引の見え方がズレる）。
- **indexer**: `createEmbeddingIndexer` の deps に `subscribeNotebooks` を追加し、`toQueueItem` の notebook 除外（T55 の暫定防御）を撤去して enqueue する。`readEntity` は notebook のとき `{title, body: summary}`。文書プレフィックスは既存の `documentPrefix` を共用（マニフェスト変更なし）。
- **検索結果の3種化**: `SemanticSearchResult` に `notebooks: ScoredNotebook[]` を**追加**（既存2フィールド不変＝後方互換。`ScoredNotebook = Notebook & {score}`）。`semantic-search-service.attachEntities` に notebook 分岐（`getNotebook`）。`semantic_search_notes` の戻りに `notebooks` が加わる（説明文更新、README 表現も）。
- **UI**: `SemanticSearchResults` の `toRows` に notebooks を混ぜる（`typeLabel: "ノート（束）"`、クリックは `onSelectNotebook?` が無ければ非ボタン＝T58 で配線）。`RelatedNotes` は**変更しない**（受け入れ条件3）。
- 起動時差分埋め（`listStaleEntities`）は UNION 拡張で自動的にノートを拾う（既存ノートの初回索引はこれで入る）。

### 実装セット

**セット A: マイグレーションと embeddings-repo**
- 目的: 受け入れ条件 4〜6・8
- 触ってよいファイル: `src/main/db/schema.sql`、`src/main/db/migrations.ts`、`src/main/db/embeddings-repo.ts`、`tests/main/db/migrations.test.ts`（追記）、`tests/main/db/embeddings-repo.test.ts`（追記）
- テスト: **実データ入り旧 embeddings（note/task 行）を持つDBで作り直し後に全行が bit 単位で一致**／'notebook' 行が入る／2回開いても安全／apply 単体冪等／新規=アップグレード一致／UNION 3箇所の notebook 対応（削除済み除外・stale 検出・孤児掃除）／**壊して確認**: 移送 INSERT を消すと「1件も失われない」が落ちる

**セット B: indexer と検索サービス・ツール・UI**
- 目的: 受け入れ条件 1〜3・7
- 触ってよいファイル: `src/main/llm/embedding-indexer.ts`、`src/main/llm/semantic-search-service.ts`、`src/shared/preload-api.ts`（`ScoredNotebook`・`SemanticSearchResult.notebooks` 追加のみ）、`src/main/mcp/tools.ts`（`semantic_search_notes` の説明文のみ）、`src/renderer/components/SemanticSearchResults.tsx`、`README.md`（該当ツールの説明）、テスト（embedding-indexer / semantic-search-tool / SemanticSearchResults / hanamask-stub に追記）
- 契約: セットA の repo 拡張（`EmbeddedEntityType` に notebook、`listStaleEntities` が notebook を返す）を前提に、テストは Fake repo で先行可
- テスト: notebook の変更で埋め込みが計算される／summary が文書テキストになる／3種混在のスコア順・ラベル・更新日／`RelatedNotes` の結果にノートが混ざらない／unavailable 時の形が `{notes:[],tasks:[],notebooks:[],unavailable}`

### Phase 4 統合ゲートでのみ編集するファイル
- `src/main/index.ts`（indexer deps に `subscribeNotebooks: onNotebooksChanged`、`readEntity` の notebook 分岐）
- E2E: `semantic-search.spec.ts` に notebook 1 ケース…は **notebook 作成ツールが無いため T57 で**（T55 と同じ理由。記録済みとする）
- `docs/TASKS-notebooks.md` 進捗、§6 実データ検証（複製で embeddings 件数一致）

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 1 | A, B | **可**（ファイル重複なし。B は A の契約を Fake で先行） |

### 完了条件
- unit / lint / typecheck / build / E2E 緑。壊して確認3点（移送 INSERT・UNION の一部だけ修正・notebook 除外の撤去漏れ）
- §6 実データ検証で embeddings 41件が作り直し後も一致
- PR は `feature/notebooks` base に1本
