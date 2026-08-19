# SPEC: ローカルLLM(1) 意味検索（T48）

## Part 1: 利用者向け

### 何を・なぜ

いまの検索（`search_notes` と画面の検索）は**言葉が一致したものしか見つかりません**。「WSLからMCPにつなぐときの詰まりどころ」と書いたノートは、「Windows側への接続でハマった話」では出てきません。エージェントが作業前に過去の経緯を引くとき、この取りこぼしがそのまま「同じ調査を二度やる」につながります。

そこで、hanamaskの中に**小さな日本語向けの埋め込みモデル**を組み込み、ノートとタスクの本文を「意味」で探せるようにします。これはローカルLLM組み込みの1本目で（`docs/REQUIREMENTS.md` §4.8）、あとに続くチャットのローカルモデル（T49）・提案系補助（T50）の土台（推論エンジンの同梱とモデルの配布経路）をここで固めます。

- **完全にローカルで動きます。**記録の内容はどこにも送られません。APIキーも要りません。インストールした瞬間から動きます（モデルはインストーラーに同梱）。
- **既存の検索はそのまま残ります。**意味検索は「加わる」だけです。モデルの準備ができていない・読み込みに失敗した、という場合も、いままでの検索と他の機能には一切影響しません。

### できるようになること

1. **エージェントから**: 新しいMCPツール `semantic_search_notes` に自然文で聞くと、意味の近いノート（とタスク）が近い順に返ってきます。言葉が一致していなくても出ます。
2. **画面の検索結果**: いままでの結果の下に「**意味が近い記録**」の欄が加わります。
3. **ノート詳細**: リンク一覧の下に「**関連するノート**」の欄が加わり、いま開いているノートに内容が近いノートが数件並びます。クリックすると開けます。

### 画面イメージ・操作フロー

**検索結果画面**（キーワード検索の結果はいままで通り上に）

> **意味が近い記録**
> - WSLからWindowsのMCPサーバーへ接続する（T31）　　ノート
> - ポート固定をやめる（T30）　　ノート
> - MCP接続手順を README に足す　　タスク

**ノート詳細画面**（リンク一覧の下）

> **関連するノート**
> - WSLからWindowsのMCPサーバーへ接続する（T31）
> - E2Eの固定ポートを並列実行に耐える形にする
> - （表示は最大5件。いま開いているノート自身と、ゴミ箱の中身は出ません）

- モデルが**まだ準備中**（初回起動直後、あるいは大量のノートを取り込んだ直後）のときは、欄に「準備中です」と出ます。数秒〜数十秒で埋まります。
- モデルが**使えない**（読み込み失敗など）ときは、欄そのものが出ません。他の画面・検索・MCPは通常通り動きます。`semantic_search_notes` は空の結果と理由を返します。
- 意味検索の索引（ベクトル）は、ノート・タスクを作成・更新したときに**裏で自動的に更新**されます。利用者が何かする必要はありません。書き込みが立て続けに来たときは少しまとめて処理します（数秒の遅れ）。
- アプリ起動時に、まだ索引が無い記録・内容が変わった記録だけを埋めます（毎回全部やり直しはしません）。

📸 検索結果画面（意味が近い記録の欄あり）
📸 ノート詳細画面（関連するノートの欄あり）
📸 準備中の表示

### 同梱するモデルとインストーラーの増分（要確認）

調査（2026-08-19）の結果、条件（**再配布可能なOSSライセンス・日本語主体・小さい・llama.cppで動く**）に合う候補は次の2つに絞られます。

| | 第一候補: **Ruri v3 70m**（cl-nagoya） | 次点: **multilingual-e5-small**（intfloat） |
|---|---|---|
| ライセンス | Apache-2.0（再配布可、LICENSE同梱で足りる） | MIT（同上） |
| 日本語ベンチマーク（JMTEB平均） | **73.95**（bge-m3 72.46 を上回る） | 67.38 |
| 一度に読める長さ | 8192トークン（長いノートも1本で読める） | 512トークン（長いノートは先頭だけ） |
| ファイルサイズ（Q8_0） | **約77MB**（30m版なら約41MB） | 約132MB |
| リスク | 公開されているGGUFは日本語のトークナイザに問題があり（濁点が落ちる恐れ）、**自前で変換して検証してから同梱**する必要がある。変換にはllama.cppの変換スクリプトへ1行の手直しが要る | 実績が多く、公開GGUFをそのまま使える。変換リスクなし |
| インストーラー増分 | 約 +77MB（現行 約118MB → 約195MB） | 約 +132MB（→ 約250MB） |

推論エンジン（node-llama-cpp、MIT）はCPU版のみ同梱で **約 +10MB**。GPU版は同梱しません（利用者側にCUDA等の導入が要る上、埋め込み用途の小型モデルはCPUで十分速いため）。

**提案**: 日本語品質・サイズの両方で優れる **Ruri v3 70m を第一候補**とし、実装の最初のステップで「変換→元モデルとの一致検証」を行います。検証で問題が出た場合は multilingual-e5-small に切り替えます（切り替えてもプログラム側は設定ファイル1つの差し替えで済むよう作ります）。

### 受け入れ条件

- [ ] `semantic_search_notes` に自然文で問い合わせると、意味の近いノート・タスクが近い順に返る（キーワードが一致しなくても出る）
- [ ] 返る結果にゴミ箱（削除済み）の記録が含まれない
- [ ] ノートを作成・更新した後、数秒以内に（手動操作なしで）そのノートが意味検索の対象になる
- [ ] 検索結果画面に「意味が近い記録」の欄が出て、クリックで開ける
- [ ] ノート詳細に「関連するノート」の欄が出て、自分自身とゴミ箱の中身は出ず、クリックで開ける
- [ ] モデルが準備中のとき、欄に「準備中」が出る。準備ができたら手動リロードなしで結果に変わる
- [ ] モデルが読み込めない状態でも、アプリ起動・既存の検索・他のMCPツールが通常通り動き、`semantic_search_notes` は空の結果と理由を返す
- [ ] 記録の内容がネットワークへ送られない（外部通信が発生しない）
- [ ] インストーラーだけで動く（モデルの追加ダウンロード・別ソフトの導入が不要）
- [ ] 同梱したモデルとエンジンのライセンス文がインストール先に同梱され、`NOTICE` に同梱モデルの表示（名前・作者・ライセンス・改変あり）が載る
- [ ] 既存のDB（この機能が無い版で作られたもの）を開いても、既存の記録が失われず、索引が自動で作られる

### 未決定・要確認事項

1. **同梱モデル**: 上の表のとおり Ruri v3 70m を第一候補、multilingual-e5-small を次点とすることで良いか。30m版（+41MB、JMTEB 72.95）でも十分なら更に小さくできる。
2. **インストーラー増分**: 約 +87MB（エンジン10MB＋モデル77MB）を許容できるか。
3. **タスクも対象にする**（本文を持つため。`docs/REQUIREMENTS.md` §4.8 の「ノート・タスク本文」に従う）。ツール名は `semantic_search_notes` のまま、返り値にノートとタスクを分けて入れる。これで良いか。
4. **モデルの置き場**: モデルファイル（数十MB）はGitリポジトリに入れず、ビルド時にHugging Faceから取得（ハッシュ検証つき）してインストーラーに同梱する。開発者は初回に1コマンド実行する。この運用で良いか。
5. **長いノート**: 1本の記録は先頭から一定量（Ruri なら約8000トークン、e5 なら512トークン）までを索引に使う。分割して複数ベクトルを持つのは今回やらない（個人規模ではまず不要で、複雑さが増えるため）。必要になったら後から足す。
6. **ベクトルの保存先**: SQLiteの新しいテーブルに持つ（DBファイル1つで完結し、バックアップ・書き出しに乗る）。ファイル分離はしない。

---

## Part 2: AI用（実装セット定義）

### 前提となる既存実装（読み取りのみ）

| 場所 | 現状・使い方 |
|---|---|
| `src/main/db/db.ts` | 単一接続 `openDb`/`getDb`/`closeDb`。schema.sql → migrations の順に適用 |
| `src/main/db/schema.sql`, `src/main/db/migrations.ts` | `MIGRATIONS` 配列は追記のみ、各項目が `isApplied` で自己判定。新規テーブル用ヘルパは無いので `sqlite_master` で存在判定する形を新設する。規約は `docs/MIGRATIONS.md`（両方に書く・冪等・テストで旧DBから開く） |
| `src/main/db/notes-repo.ts` | `searchNotes(query): Note[]`（LIKE）、`getNote(id)`、行→型ガード `isNoteRow` の書き方 |
| `src/main/db/tasks-repo.ts` | `listTasks()`, `getTask(id)` |
| `src/main/db/purge.ts` | `purgeSoftDeletedRecords(now)` が notes/tasks を物理削除する。孤児ベクトルはここで揃えて消す |
| `src/main/mcp/tools.ts` | `McpTool { definition, handler(args): CallToolResult }` — **handler は同期**。`jsonResult`/`errorResult`/`toToolHandler`/`readString`。`search_notes` は L157-172。ツール配列 `noteTools` 等 |
| `src/main/mcp/server.ts`, `src/main/chat/agent-loop.ts` | handler の呼び出し側（同期前提）。非同期化の影響範囲はこの2箇所 |
| `src/main/mcp/change-emitter.ts` | `onNotesChanged`/`onTasksChanged`（`EntityChange {entity, action, id, title}` / `undefined`=全件の合図） |
| `src/main/notify/change-notifier.ts` | 2秒窓のデバウンス集約と DI（`createChangeNotifier(deps)`）の手本 |
| `src/main/index.ts` | 起動順（openDb → purge → … → 購読 → startMcpServer）、IPC チャンネル定数（preload と二重定義）、`ipcMain.handle` 群、`resolveDataDirPath()` |
| `src/shared/preload-api.ts`, `src/preload/index.ts`, `src/renderer/types/preload.d.ts` | API を1つ足すときの3点セット |
| `src/renderer/components/NoteDetail.tsx` L433 `<EntityLinks …/>` | 関連ノート欄の挿入位置 |
| `src/renderer/components/SearchResults.tsx` | `window.hanamask.searchNotes(query)` を useEffect で呼ぶ。意味検索の併記先 |
| `src/renderer/components/EntityLinks.tsx` | 欄の作り方の手本（ただしID表示のみ。関連ノートはタイトルを出す） |
| `electron-builder.yml` | `files`/`asarUnpack`（better-sqlite3 の前例）。`extraResources` は未使用 |
| `scripts/copy-main-assets.mjs`, `tests/main/packaging-layout.test.ts` | dist の中身は固定で検査される → モデルは dist に置かず `extraResources` |
| `scripts/check-readme-tools.mjs`, `README.md` L168-178・L215 | ツール表の書式（`| \`name\` | 説明 |`）、未実装の行 |
| `scripts/check-licenses.mjs` | 依存ライセンス検査。node-llama-cpp（MIT）と optional の `@node-llama-cpp/*` が通ること |
| `tests/main/db/notes-repo.test.ts`, `tests/main/db/migrations.test.ts`, `tests/main/mcp/tools.test.ts`, `tests/renderer/hanamask-stub.ts` | テストの型（一時ファイルDB、旧DDLから開く、handler→JSON.parse、`window.hanamask` スタブ） |
| `.github/workflows/ci.yml` | ubuntu/windows、Node 24、`npm ci` 素のまま |

調査で確定した外部仕様（node-llama-cpp v3.20.0、2026-08-19）:
- ESM、mainプロセス専用、N-API（electron-rebuild 不要）。`getLlama({ gpu: false })` → `loadModel({ modelPath })` → `model.createEmbeddingContext({ contextSize })` → `ctx.getEmbeddingFor(text)` → `.vector: readonly number[]`。**直列実行**（並列にしても速くならない）、contextSize 超過は throw、ベクトルは L2 正規化されない、pooling は GGUF メタデータ `pooling_type` に従う（API で指定不可）。
- プリビルドは optional 依存 `@node-llama-cpp/win-x64`（CPU, 47MB unpacked）等。同一バージョン必須。asar 内から dlopen 不可 → `asarUnpack`。GGUF も asar 内不可 → `extraResources`。CI: `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` でプリビルド前提を固定。

### 設計の骨子（全セット共通の契約）

**モデルマニフェスト** `resources/models/embedding.json`（同梱物、Set F が作る。Set B はこの型で読む）:
```json
{
  "id": "ruri-v3-70m-q8_0",
  "file": "ruri-v3-70m-q8_0.gguf",
  "dimensions": 384,
  "contextSize": 8192,
  "queryPrefix": "検索クエリ: ",
  "documentPrefix": "検索文書: ",
  "license": { "name": "Apache-2.0", "file": "ruri-v3-70m.LICENSE" }
}
```
モデルの差し替えはこのファイルと GGUF の差し替えのみで済むこと（e5 なら `query: ` / `passage: `、512、384）。

**推論層のインターフェース**（`src/main/llm/embedding-provider.ts`、Set B）:
```ts
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<Float32Array>;     // 正規化済み
  embedDocument(text: string): Promise<Float32Array>;  // 正規化済み
}
export type EmbeddingAvailability =
  | { state: "ready"; provider: EmbeddingProvider }
  | { state: "loading" }
  | { state: "unavailable"; reason: string };
```
テストは固定ベクトルを返す `FakeEmbeddingProvider` を使い、node-llama-cpp を import しない（`agent-loop.ts` の `ChatModelClient` と同じ切り方）。

**保存**（`src/main/db/embeddings-repo.ts`、Set A）— 新テーブル:
```sql
CREATE TABLE IF NOT EXISTS embeddings (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task')),
  entity_id   TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,   -- title+body の sha256。変わったときだけ再計算
  vector      BLOB NOT NULL,    -- Float32Array のバイト列（little-endian）
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
```
- `upsertEmbedding(row)`, `deleteEmbedding(entity_type, entity_id)`, `listEmbeddings(model_id): StoredEmbedding[]`（削除済み・model_id 不一致は返さない: notes/tasks と JOIN して `deleted_at IS NULL`）, `listStaleEntities(model_id): {entity_type, entity_id, title, body}[]`（未索引または content_hash 不一致の有効レコード）。
- schema.sql に追記＋`migrations.ts` にテーブル作成マイグレーション（`sqlite_master` で存在判定）。`purge.ts` は物理削除した notes/tasks に対応する embeddings 行も消す。

**検索**（`src/main/llm/semantic-search.ts`、Set B）— `rankBySimilarity(query: Float32Array, candidates: StoredEmbedding[], limit): Ranked[]` は**純粋関数**（コサイン=正規化済みなので内積）。上位 `limit`（既定 10、詳細画面は 5）。自分自身の除外は呼び出し側。

**索引更新**（`src/main/llm/embedding-indexer.ts`、Set C）— `createEmbeddingIndexer(deps)` DI。`onNotesChanged`/`onTasksChanged` を購読、`change.action === "deleted"` は行削除（ソフトデリートでも消して良い: 復元時は updated で再計算される）、それ以外はキューに積んで 2 秒デバウンス後に直列で埋め込み。`change === undefined` と起動時は `listStaleEntities` で差分埋め。文書テキストは `${title}\n${body}` を contextSize に収まる長さ（**文字数で保守的に切る**: contextSize×1.5 文字を上限。トークン超過で throw したら半分に切って1回だけ再試行）。状態 `ready|loading|unavailable` と「未処理件数」を `getStatus()` で返し、変化時に `onStatusChanged` を発火する（UI の「準備中」表示用）。

**MCPツール**（Set D）— `McpTool.handler` の戻り値を `CallToolResult | Promise<CallToolResult>` に広げ、`server.ts` と `agent-loop.ts` の呼び出しを `await` にする（既存の同期ハンドラは無変更で通る）。`semantic_search_notes { query: string, limit?: number }` → `{ notes: [{...Note, score}], tasks: [{...Task, score}] }`。unavailable/loading のときは `{ notes: [], tasks: [], unavailable: reason }`（`isError` は立てない）。

**UI**（Set E）— preload API `semanticSearch(query, limit?)`, `relatedNotes(noteId, limit?)`, `readEmbeddingStatus()`, `onEmbeddingStatusChanged(cb)`。コンポーネント `RelatedNotes.tsx`（NoteDetail 用）と `SearchResults.tsx` への欄追加。ステータスが `loading` なら「準備中です」、`unavailable` なら欄を出さない。

**同梱**（Set F）— `node-llama-cpp@^3.20.0` を dependencies に追加。`scripts/fetch-embedding-model.mjs` が Hugging Face から GGUF＋LICENSE を `resources/models/` に取得（URL・sha256 は `resources/models/embedding.json` の隣の `sources.json` に固定。`resources/models/*.gguf` は .gitignore）。`electron-builder.yml`: `extraResources: [{from: resources/models, to: models}]`、`asarUnpack` に `**/node_modules/@node-llama-cpp/**` と `**/node_modules/node-llama-cpp/bins/**`、`files` に `!node_modules/@node-llama-cpp/win-x64-cuda*/**`・`!node_modules/@node-llama-cpp/win-x64-vulkan/**`・`!node_modules/node-llama-cpp/llama/gitRelease.bundle`。実行時のモデルディレクトリは `app.isPackaged ? join(process.resourcesPath, "models") : join(repoRoot, "resources/models")`（`HANAMASK_MODELS_DIR` で上書き可、E2E 用）。CI に `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true`。`docs/PACKAGING.md` にモデル取得手順とサイズ実績を追記。

### 実装セット

**セット 0: モデル検証スパイク（Phase 3 の前に単独で実施、成果はドキュメントのみ）**
- 目的: 未決定事項1の判断材料。Ruri v3 70m を SPM 語彙で GGUF に変換（`ModernBertModel.set_vocab` を `_set_vocab_sentencepiece()` に差し替える1行パッチ）し、node-llama-cpp 3.20 で読み込めること・`pooling_type` が mean で入っていること・sentence-transformers の出力とのコサイン類似 ≥ 0.999 を確認する。濁点を含む日本語文で劣化が無いこと。
- 触ってよいファイル: `docs/local-llm/embedding-model-verification.md`（新規、結果と手順）。リポジトリのコードは触らない。作業は scratchpad で行う。
- 失敗時: multilingual-e5-small（`cstr/multilingual-e5-small-GGUF` Q8_0）に切り替え、その GGUF に `pooling_type` が入っていることだけ確認して同じ文書に記録する。
- 判定を管理者に報告してから Set F のマニフェスト値を確定する。

**セット A: 埋め込みの保存**
- 目的: 受け入れ条件「既存DBを開いても失われず索引が作られる」「ゴミ箱を含めない」の土台
- 触ってよいファイル: `src/main/db/embeddings-repo.ts`（新規）、`src/main/db/schema.sql`、`src/main/db/migrations.ts`、`src/main/db/purge.ts`、`tests/main/db/embeddings-repo.test.ts`（新規）、`tests/main/db/migrations.test.ts`（追記）、`tests/main/db/purge.test.ts`（あれば追記）
- 依存（読み取りのみ）: `db.ts`, `notes-repo.ts`, `tasks-repo.ts`, `docs/MIGRATIONS.md`
- テスト: 旧DDLで作ったDBを開くと `embeddings` ができ既存行が残る／2回開いても落ちない／`apply` 直接呼び出し／マイグレーションを外すと落ちる／`listEmbeddings` が削除済み・model_id 違いを返さない／`listStaleEntities` が未索引とハッシュ不一致だけを返す／purge で孤児行が消える／BLOB↔Float32Array の往復

**セット B: 推論層と検索（純粋部分）**
- 目的: 受け入れ条件「近い順に返る」「読み込めなくても他が動く」
- 触ってよいファイル: `src/main/llm/embedding-provider.ts`（新規、型と `FakeEmbeddingProvider` は tests 側）、`src/main/llm/llama-embedding-provider.ts`（新規、node-llama-cpp を import する唯一のファイル。`loadEmbeddingProvider(modelsDir): Promise<EmbeddingAvailability>`。マニフェスト読み込み・存在しない/壊れている→`unavailable`・prefix 付与・L2 正規化・`gpu:false`・`contextSize` はマニフェスト値）、`src/main/llm/model-manifest.ts`（新規、JSON の型ガード）、`src/main/llm/semantic-search.ts`（新規、純粋関数）、`src/main/llm/text-for-embedding.ts`（新規、`${title}\n${body}` の組み立てと文字数上限の切り詰め、純粋関数）、`tests/main/llm/semantic-search.test.ts`、`tests/main/llm/model-manifest.test.ts`、`tests/main/llm/text-for-embedding.test.ts`、`tests/main/llm/fake-embedding-provider.ts`（新規）
- 依存（読み取りのみ）: なし（Set A の `StoredEmbedding` 型は `embeddings-repo.ts` からimportするが、型は本SPECの契約どおり `{ entityType, entityId, vector: Float32Array }` を持つ）
- `llama-embedding-provider.ts` は単体テストしない（実モデルが要る）。代わりに **モデルディレクトリが無いとき `unavailable` を返す**分岐だけをテストする（node-llama-cpp をモジュールモックして import 自体を差し替える）
- テスト: 内積順序・limit・同点・空配列・次元不一致は除外／マニフェスト欠落フィールドで型ガードが弾く／切り詰めが上限内・空タイトル・空本文

**セット C: 索引の自動更新**
- 目的: 受け入れ条件「数秒以内に対象になる」「準備中→結果へ手動リロードなし」「起動時に差分だけ埋める」
- 触ってよいファイル: `src/main/llm/embedding-indexer.ts`（新規、DI: `{ repo, getProvider, subscribeNotes, subscribeTasks, readEntity, debounceMs, now }`）、`tests/main/llm/embedding-indexer.test.ts`（新規、fake timers）
- 依存（読み取りのみ）: `change-emitter.ts`, `change-notifier.ts`（デバウンスの手本）、Set A/B の型
- テスト: created/updated で 1 回だけ埋め込みが呼ばれる（デバウンス）／deleted で行が消える／`undefined` で stale 全件／provider が loading の間は待ち、unavailable なら何もしないで status を返す／embed が throw しても他の項目は続く／status 変化のたびに `onStatusChanged`

**セット D: MCPツール**
- 目的: 受け入れ条件「`semantic_search_notes`」「空の結果と理由」
- 触ってよいファイル: `src/main/mcp/tools.ts`（`McpTool.handler` の型拡張と `semantic_search_notes` 追加のみ）、`src/main/mcp/server.ts`・`src/main/chat/agent-loop.ts`（`await` 化のみ）、`README.md`（ノート表に1行、L215 の未実装行を削除）、`tests/main/mcp/semantic-search-tool.test.ts`（新規）、`tests/main/chat/agent-loop.test.ts`（非同期ハンドラが通ることを1件追加）
- 依存（読み取りのみ）: Set A/B/C の公開関数（ツールは `getSemanticSearchService()` 的な取得口を `src/main/llm/index.ts` から受ける — この取得口は Set B が `export` する `setEmbeddingRuntime()/getEmbeddingRuntime()` のモジュールレベル setter とし、テストで差し替える）
- テスト: fake provider で notes/tasks が score 降順で返る／削除済みが出ない／limit／unavailable のとき `{notes:[],tasks:[],unavailable}`／`check:readme` が通る／`tool-descriptions.test.ts` が通る

**セット E: 画面**
- 目的: 受け入れ条件「検索結果に欄」「詳細に欄」「準備中表示」「クリックで開ける」
- 触ってよいファイル: `src/renderer/components/RelatedNotes.tsx`（新規）、`src/renderer/components/SemanticSearchResults.tsx`（新規、SearchResults に埋め込む欄）、`tests/renderer/RelatedNotes.test.tsx`、`tests/renderer/SemanticSearchResults.test.tsx`、`tests/renderer/hanamask-stub.ts`（新APIのスタブ追記）
- 依存（読み取りのみ）: `EntityLinks.tsx`, `SearchResults.tsx`, `NoteDetail.tsx`, `preload-api.ts`
- **NoteDetail.tsx / SearchResults.tsx への差し込みと preload/IPC 3点セットは Phase 4 で行う**（共有ファイルのため）。Set E はコンポーネント単体を `window.hanamask.semanticSearch` 等の**契約どおりの名前**でスタブして作る
- テスト: ready で一覧が出て click で `onSelectNote(id)`／loading で「準備中です」／unavailable で何も描画しない／自分自身の除外はmain側だがUIでも `noteId` と一致する行を出さない／status 変化イベントで再取得

**セット F: 同梱・配布**
- 目的: 受け入れ条件「インストーラーだけで動く」「ライセンス同梱」「外部通信なし」
- 触ってよいファイル: `package.json`（`node-llama-cpp` 追加は `npm install node-llama-cpp@^3.20.0` で。scripts に `fetch:model` 追加）、`package-lock.json`、`scripts/fetch-embedding-model.mjs`（新規）、`resources/models/embedding.json`・`resources/models/sources.json`（新規）、`.gitignore`（`resources/models/*.gguf`, `resources/models/*.LICENSE`）、`electron-builder.yml`、`.github/workflows/ci.yml`（`NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` の env と、`fetch:model` は**回さない**）、`.github/workflows/release.yml`（package 前に `fetch:model`）、`docs/PACKAGING.md`、`tests/main/packaging-layout.test.ts`（変更なしで通ることを確認。通らないなら理由を報告）
- **ライセンス対応（このセットの責務）**: hanamask 本体は Apache-2.0（`LICENSE`/`NOTICE`）。① 推論エンジン node-llama-cpp と `@node-llama-cpp/*`（MIT）は npm 依存として `check:licenses` の許可リスト（MIT/Apache-2.0）で検査され、`license-checker` の集計に載る。② モデル（Ruri v3: Apache-2.0 ／ e5: MIT）は npm 依存ではないので**自前で対応**する: モデルの LICENSE（Apache-2.0 なら NOTICE も、あれば）を `fetch-embedding-model.mjs` が GGUF と一緒に取得し `resources/models/` に置く → `extraResources` で `resources/models/` に同梱（受け入れ条件「ライセンス文が同梱される」）。リポジトリ直下 `NOTICE` に「同梱モデル: <名前>、<作者>、<ライセンス>、改変（GGUF量子化）あり」の1段落を追記（Apache-2.0 §4(b)/(d) の表示義務、MIT の著作権表示義務を満たす）。`sources.json` に出典URLと sha256 を残す。
- 依存（読み取りのみ）: 調査結果の electron-builder テンプレート、`scripts/check-licenses.mjs`
- テスト: `check:licenses` が通る／`fetch-embedding-model.mjs` が LICENSE を GGUF と同時に取得し、無ければ失敗する／`fetch-embedding-model.mjs` は sha256 不一致で失敗し部分ファイルを残さない（テストは fetch をモック）／`npm run build` が通る。**実インストーラーのサイズ実測は Windows 実機で行い PACKAGING.md §5 に追記**（管理者環境）

### Phase 4 統合ゲートでのみ編集するファイル

- `src/main/index.ts` — 起動時: `loadEmbeddingProvider(modelsDir)` を**非同期で開始**（await でアプリ起動を止めない）→ `setEmbeddingRuntime` → indexer 生成・購読・起動時差分埋め。IPC 4本の登録、チャンネル定数
- `src/preload/index.ts`, `src/shared/preload-api.ts`, `src/renderer/types/preload.d.ts` — API 4本
- `src/renderer/components/NoteDetail.tsx`（`<EntityLinks/>` 直後に `<RelatedNotes/>`）、`src/renderer/components/SearchResults.tsx`（下部に `<SemanticSearchResults/>`）
- `tests/e2e/` — モデルがある環境でのみ 1 本（`HANAMASK_MODELS_DIR` 未設定・モデル無しなら skip）: MCP で 2 件作成 → `semantic_search_notes` で近い方が先に返る
- `docs/TASKS-local-llm.md` / `docs/html/TASKS-local-llm.html` — 進捗（`docs/TASKS.md` は触らない）

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 0 | セット0（スパイク） | 単独。結果を管理者に報告してから下へ |
| 1 | A, B, E, F | **可**（触るファイルが重複しない。B は A の型契約に依存するが本SPECの定義どおりに書けば結線は Phase 4） |
| 2 | C, D | グループ1完了後（A/B の公開関数を実際に import するため） |

### 完了条件

- `npm test` / `npm run lint` / `npm run typecheck` / `npm run build` / `npm run check:readme` / `npm run check:licenses` が緑
- `npm run test:e2e` が緑（モデル無し環境では意味検索の1本が skip され、他は従来通り緑）
- **壊して確認する**: `listEmbeddings` の `deleted_at IS NULL` を外すと Set A のテストが落ちる／デバウンスを外すと Set C の「1回だけ」が落ちる／`unavailable` 分岐を消すと Set D/E のテストが落ちる
- 📸 スクリーンショット3種（検索結果・ノート詳細・準備中）を Windows 実機で取得
- PR は `feature/local-llm` を base に、セットごとに分けて出す（Set 0 は docs のみ、F は依存追加を含むため単独で管理者確認）
