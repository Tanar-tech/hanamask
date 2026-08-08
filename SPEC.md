# SPEC: タスクに本文を持たせる（T36）

## Part 1: 利用者向け

### 何を・なぜ

**今のタスクはタイトルしか持てない。**「T36: タスクに本文を持たせる」のように、伝えたいことを全部タイトルに詰め込むしかなく、経緯・受け入れ条件・参考リンクを書く場所がない。

タスクにも**ノートと同じ本文**を持たせる。書き方もノートと揃える。

- **Markdown**（見出し・箇条書き・表・コードブロック・引用、GFMの表/タスクリスト/取り消し線）
- **HTMLの直接埋め込み**（`<div style="...">` 等。`<script>` / `<iframe>` / `onerror` 等は描画時に除去される）
- **Mermaid図**（```` ```mermaid ```` のコードフェンス）

エージェントがMCP経由でタスクを作るときに本文を書け、利用者はデスクトップUIで読んで編集できる。

### 操作フロー

| 場面 | 変わること |
|---|---|
| **タスク詳細を開く** | ステータス・期限・リンクの下に**本文**が表示される。ノート詳細と同じ見た目で描画される 📸 |
| **本文を書き換える** | 「編集」ボタン →本文を書き換え→「保存」。**現在タスクはステータスしか変更できないが、本文とタイトルも編集できるようになる** 📸 |
| **編集中に外から更新が来た** | 編集内容は消えない。「別の場所で更新されました」と出て、破棄して読み込み直すかを選べる（ノートと同じ挙動） |
| **タスク一覧** | カードのステータス行の下に**本文の抜粋が1〜2行**出る 📸 |
| **エージェントがタスクを作る/更新する** | `create_task` / `update_task` に本文を渡せるようになる |

**カンバンのカードには抜粋を出さない。**幅が狭くドラッグ対象でもあるため、情報を増やすと扱いづらくなる。

### 受け入れ条件

- [ ] `create_task` で本文つきのタスクを作ると、タスク詳細にその本文が描画される
- [ ] 本文のMarkdownが描画される（見出し・箇条書き・表・コードブロック）
- [ ] 本文に書いたHTMLが描画され、`style` 属性が効く
- [ ] 本文に `<script>` や `onerror` を書いても**実行されず、除去される**
- [ ] 本文の ```` ```mermaid ```` フェンスが図として描画される
- [ ] タスク詳細の「編集」から本文とタイトルを書き換えて保存でき、再度開いても保持されている
- [ ] 編集中に外からそのタスクが更新されても、**入力中の内容が消えない**
- [ ] タスク一覧のカードに本文の抜粋が出る。本文が空のタスクでは何も出ない
- [ ] **既にhanamaskを使っている状態でアプリを更新しても、既存のタスクが消えず開ける**（本文は空として扱われる）
- [ ] **本文を持たない古いバックアップzipを取り込んでも、アプリが壊れない**
- [ ] **管理者のWindows環境の実インストールを更新し、更新前から存在するノート15件・タスク7件・リンク2件が変わらず開けること**（2026-08-08時点の実データ。退避先はローカルの作業用ディレクトリdocs/GOVERNANCE.md` §6 のアーキテクチャ判断に該当）
2. `docs/REQUIREMENTS.md` §4.3（タスク管理）には本文の記載が無い。**要求定義に「タスクの本文」を追記する**形で進めてよいか

---

## Part 2: AI用（実装セット定義）

### 前提となる調査結果

- `tasks` テーブルは `id/title/status/due_date/deleted_at/created_at/updated_at`。**`body` 列は無い**（`src/main/db/schema.sql:22-30`）
- **マイグレーション機構は存在しない。**`openDb` が毎回 `schema.sql` を `db.exec` するだけで、全テーブルが `CREATE TABLE IF NOT EXISTS`（`src/main/db/db.ts:12-18`）。既存DBには新列が入らない
- import は**DBファイルごと差し替える**（`src/main/backup/import-backup.ts`）。検証はテーブル名の存在のみで列は見ない。**旧バージョンのzipを取り込むと `body` 無しのDBになるため、取り込み後の再オープン経路にもマイグレーションが乗る必要がある**
- export はDBファイルをバイト列ごとzipに入れるだけなので、列追加で壊れない（`src/main/backup/export-backup.ts:69`）
- MCPツールは手書きJSON Schema（`src/main/mcp/tools.ts`）。`create_task` 352-375 / `update_task` 377-405
- タスクの更新IPCは `tasks:update-status` のみで、**汎用の更新IPCが無い**（`src/main/index.ts:81`, `src/preload/index.ts:22-25`）
- `MarkdownBody`（`src/renderer/components/MarkdownBody.tsx`）は props が `{ content: string }` のみで再利用可能。ただし**Mermaidフェンス分割は `NoteDetail.tsx:77-98` のローカル関数**（`splitByMermaidFence` / `renderSegment`）で未エクスポート
- 「編集中に外部更新が来ても失わない」仕組みは `NoteDetail.tsx` にベタ書き（`liveStateRef` 216-220 / `reloadNote` 235-246 / `ExternalUpdateNotice` 113-123）

### 実装セット

#### セットA: DB層（本文列とマイグレーション）

- **目的**: 受け入れ条件の「既存タスクが消えない」「古いバックアップで壊れない」
- **触ってよいファイル**:
  - `src/main/db/schema.sql`（`tasks` に `body TEXT NOT NULL DEFAULT ''`）
  - `src/main/db/migrations.ts`（**新規**。`PRAGMA table_info(tasks)` で列の有無を判定し、無ければ `ALTER TABLE tasks ADD COLUMN body TEXT NOT NULL DEFAULT ''`）
  - `src/main/db/db.ts`（`schema.sql` 適用の直後にマイグレーションを呼ぶ。**取り込み後の再オープンでも必ず通る位置に置くこと**）
  - `src/main/db/tasks-repo.ts`（`TaskRow` / `isTaskRow` / `toTask` / `createTask` のINSERT / `TaskUpdateInput` / `updateTask` のUPDATE の6か所）
- **読み取りのみ**: `src/main/db/notes-repo.ts`（bodyの扱い方の参考）、`src/main/backup/import-backup.ts`
- **テスト**: `tests/main/db/migrations.test.ts`（新規）, `tests/main/db/tasks-repo.test.ts`
  - **列が無い状態のDBを実際に作ってから** `openDb` し、列が追加され既存行が保持されることを検証する（マイグレーションを外すと落ちるテストであること）
  - 冪等性: 2回開いても失敗しない

#### セットB: 共有型・MCP・IPC

- **目的**: `create_task`/`update_task` での本文の受け渡し、UIからの本文保存経路
- **触ってよいファイル**:
  - `src/shared/preload-api.ts`（`Task` に `body`、`updateTask` の公開API型を追加）
  - `src/main/mcp/tools.ts`（`create_task`/`update_task` の inputSchema に任意の `body`）
  - `src/main/index.ts`（`tasks:update` チャネル定数とハンドラ）
  - `src/preload/index.ts`（同チャネルの公開）
- **読み取りのみ**: `src/main/db/tasks-repo.ts`（セットAの成果に依存）
- **テスト**: `tests/main/mcp/tools.test.ts`, `tests/main/ipc/`（既存の配置に合わせる）
- **依存**: セットAの完了後に着手する

#### セットC: 描画の共通化

- **目的**: タスクとノートで同じ描画を使う（重複実装を作らない）
- **触ってよいファイル**:
  - `src/renderer/components/MarkdownDocument.tsx`（**新規**。`NoteDetail.tsx` の `splitByMermaidFence` / `renderSegment` をここへ移し、`{ content: string }` を受けてMermaidとMarkdownを描き分ける）
  - `src/renderer/components/NoteDetail.tsx`（ローカル関数を削除し `MarkdownDocument` を使う。**挙動は変えない**）
- **読み取りのみ**: `src/renderer/components/MarkdownBody.tsx`
- **テスト**: `tests/renderer/MarkdownDocument.test.tsx`（新規）。既存の `tests/renderer/NoteDetail.test.tsx` が**変更なしで緑のままであること**が移設成功の判定
- **セットA・Bと並列実行可**（ファイルが重ならない）

#### セットD: タスクUI

- **目的**: 本文の表示・編集・抜粋
- **触ってよいファイル**:
  - `src/renderer/components/TaskDetail.tsx`（本文表示、編集モード、外部更新ガード。`NoteDetail.tsx` の構成に倣う）
  - `src/renderer/components/TaskList.tsx`（抜粋1〜2行）
- **読み取りのみ**: `src/renderer/components/NoteDetail.tsx`, `MarkdownDocument.tsx`, `src/renderer/components/KanbanView.tsx`（**編集しない**＝抜粋を出さない）
- **テスト**: `tests/renderer/TaskDetail.test.tsx`, `tests/renderer/TaskList.test.tsx`
  - 本文の描画、**サニタイズが効くこと（`<script>` が実行されないこと）**、編集して保存、編集中の外部更新で入力が消えないこと、本文が空なら抜粋を出さないこと
- **依存**: セットB・Cの完了後に着手する

### 並列グループ宣言

| グループ | セット | 備考 |
|---|---|---|
| **1** | **A** / **C** | 同時実行可。ファイル重複なし |
| **2** | **B** | Aの後 |
| **3** | **D** | B・Cの後 |

**Phase 4（統合ゲート）でのみ触るファイル**: `README.md`, `docs/REQUIREMENTS.md`（§4.3にタスク本文を追記）, `docs/TASKS.md`（T36を追加）, `docs/html/` 配下（skill「docs-html-sync」で同期）。

### 完了条件

- `npm test` が全て緑
- `npm run lint` が通る
- 上記の受け入れ条件を検証するテストが存在し、**該当実装を壊すと落ちる**ことを確認済み
- `tests/renderer/NoteDetail.test.tsx` が無修正で緑（セットCの移設が挙動を変えていない証拠）
