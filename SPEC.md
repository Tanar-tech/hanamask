# SPEC: ノート/ページ(1) DB基盤と既存データの移行（T54）

## Part 1: 利用者向け

### 何を・なぜ

v2.1.0 の「ノート／ページ再編」（`docs/REQUIREMENTS.md` §4.9）の1本目です。ページを束ねる**ノート**という新しい入れ物を、まずデータベースの中に用意します。

このタスクでは**見た目も操作も何も変わりません**。画面・MCPツール・意味検索は従来どおり動きます。変わるのはデータの器だけで、後続のタスク（ツール追加・Explorerナビ）がこの器の上に乗ります。

- 既存の記録は**1件も変わりません**。ID・本文・タグ・編集履歴・ゴミ箱の中身・意味検索の索引はそのまま。全件が「どのノートにも属さないページ（無所属ページ）」として引き継がれます
- 「未分類」のような包みノートは**作りません**
- v2.0.x で作ったバックアップ（zip）も従来どおり取り込めます

### 受け入れ条件

- [ ] v2.0.x のDBをこの版で開くと、既存のページ（旧ノート）・タスク・リンク・編集履歴・画像・索引がすべて残っている
- [ ] 既存のページはすべて無所属のまま（勝手にノートへ入れられていない。包みノートも作られていない）
- [ ] 何度開き直しても壊れない（マイグレーションが繰り返し実行されても安全）
- [ ] 新規インストール（まっさらなDB）とアップグレード（旧DB＋マイグレーション）で、最終的なDBの形が一致する
- [ ] ノートを作成・更新・削除・復元できる（この段階ではテスト経由。画面・ツールは後続タスク）
- [ ] ノートの概要を更新すると編集履歴が残り、過去の版に戻せる
- [ ] ノートをゴミ箱に入れても所属ページは消えず読める。ノートを復元すると束が戻る。30日パージでノートが完全削除された時点でページは正式に無所属になる
- [ ] `notebooks` を含まない古い形式のバックアップzipが取り込め、取り込み後の再オープンで器が追いつく
- [ ] 画面・MCPツール・意味検索の挙動が一切変わっていない（既存テストが全部そのまま緑）

### 未決定・要確認事項

なし（要求定義の未決はすべて 2026-08-20 に確定済み。版管理の持ち方は Part 2 で「`note_versions` に `entity_type` を足す」方式に決めた——別表方式との比較は Part 2 冒頭に記載。表の作り直しを伴うマイグレーションは**本タスクでは発生しない**）。

---

## Part 2: AI用（実装セット定義）

### 設計判断: ノート概要の版管理は `note_versions` の拡張で行う

| | 案a: `note_versions` に `entity_type` 列を追加（採用） | 案b: `notebook_versions` 別表 |
|---|---|---|
| マイグレーション | `addColumnMigration("note_versions","entity_type","TEXT NOT NULL DEFAULT 'note'")` — 既存ヘルパで書け、既存行は DEFAULT で埋まる | `createTableMigration` で書ける |
| 実装 | `snapshotNote` 系を entity_type 付きに一般化。読み出しは `WHERE note_id = ? AND entity_type = ?` | 版管理ロジック（snapshot/list/restore）を二重に持つ |
| 将来 | T55 以降「どちらにも付きうる」対称性の方針に沿う。UI（`NoteVersionHistory`）の流用が容易 | 表が増え、restore の分岐が増える |

案a を採用する。`note_id` 列は名前を変えない（列名変更は表の作り直しになるため。「対象エンティティのID」の意味で使い、コメントで明記）。

### 前提となる既存実装（読み取りのみ）

| 場所 | 使い方 |
|---|---|
| `src/main/db/schema.sql` | notes(1-10)・note_versions(12-20)・tasks・images・links・embeddings。`CREATE TABLE IF NOT EXISTS` |
| `src/main/db/migrations.ts` | `MIGRATIONS` 追記のみ。`addColumnMigration`(29-38)・`createTableMigration`(47-56)・`tableExists`(41)。embeddings の DDL 二重記載には触れない |
| `src/main/db/notes-repo.ts` | `isNoteRow` 型ガード、`snapshotNote`(146)、`softDeleteNote`/`restoreNote`、`parseTags` |
| `src/main/db/purge.ts` | `purgeTable("notes"\|"tasks")`＋`deleteOrphanEmbeddings`。パージ時の孤児掃除の前例 |
| `src/main/db/tasks-repo.ts` | ソフトデリート対称の書き方 |
| `src/main/backup/import-backup.ts` | `REQUIRED_TABLE_NAMES`（**変更禁止**）。`export-backup.ts` は DB ファイルごと zip |
| `src/shared/preload-api.ts` | `Note`/`Task`/`NoteVersion` 型の並び |
| `tests/main/db/migrations.test.ts` | 旧DDLでDBを作ってから openDb する型。`docs/MIGRATIONS.md` §5 の4点（旧DBから開く・2回開く・apply単体・外すと落ちる） |
| `docs/MIGRATIONS.md` | §2 絶対規則（schema.sql と migrations の両方・冪等）・§5 テスト・§6 実績追記 |

### スキーマ（このSPECが正）

```sql
-- ページを束ねるノート（v2.1.0 §4.9）。summary が「概要」。
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- notes への追加列（NULL = 無所属ページ）
--   notebook_id は notebooks.id を指すが FK は張らない（links 等の既存方針に合わせる）
ALTER TABLE notes ADD COLUMN notebook_id TEXT;          -- addColumnMigration
ALTER TABLE note_versions ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'note';  -- addColumnMigration
```

- `note_versions.entity_type` は `'note'`（＝ページ。既存行）と `'notebook'` の2値。ノート概要の版は `note_id` 列にノートIDを入れ、`body` に summary を保存する（`title`/`tags` も同様にスナップショット）。
- **削除の意味論（§4.9 確定）**: `softDeleteNotebook` は notebooks の `deleted_at` を立てるだけで、**所属ページの `notebook_id` は触らない**。読み出し側（T55以降のUI/ツール）が「所属ノートが削除済みなら無所属として表示」を担う。本タスクでは repo 関数 `listNotes` 等の挙動は変えない。**パージ**: `purgeSoftDeletedRecords` が notebooks を物理削除するとき、`UPDATE notes SET notebook_id = NULL WHERE notebook_id IN (消したID)` で正式に無所属化する。
- `PurgeResult` に `notebooksPurged` を追加（既存2フィールドは不変）。

### 実装セット

**セット A: スキーマとマイグレーション**
- 目的: 受け入れ条件「既存データが残る」「繰り返し安全」「新規=アップグレード一致」
- 触ってよいファイル: `src/main/db/schema.sql`、`src/main/db/migrations.ts`、`tests/main/db/migrations.test.ts`（追記）
- テスト（`docs/MIGRATIONS.md` §5 の4点をこの順で）: v2.0.x 相当の旧DDL＋実データ入りDBを開くと `notebooks`・`notes.notebook_id`・`note_versions.entity_type`（既存行は 'note'）が揃い既存行が全て残る／2回開いても落ちない／`apply` 単体を適用済みDBに実行しても落ちない／各マイグレーションを外すと該当テストが落ちることを実測。新規 `schema.sql` DB とアップグレード DB の `PRAGMA table_info` 一致

**セット B: notebooks リポジトリと版管理の一般化**
- 目的: 受け入れ条件「ノートのCRUD・ソフトデリート」「概要の版と復元」
- 触ってよいファイル: `src/main/db/notebooks-repo.ts`（新規: `createNotebook`/`getNotebook`/`listNotebooks`/`updateNotebook`/`softDeleteNotebook`/`restoreNotebook`/`listDeletedNotebooks`。`updateNotebook` は実行前スナップショット）、`src/main/db/notes-repo.ts`（`snapshotNote` の entity_type 対応と、版の読み出しに `entity_type='note'` 条件を足す**だけ**。公開シグネチャ不変）、`src/shared/preload-api.ts`（`Notebook` 型と `NoteVersion.entityType` の追加のみ。API 追加はしない）、`tests/main/db/notebooks-repo.test.ts`（新規）、`tests/main/db/note-versions.test.ts`（entity_type の既定が効くことを追記）
- 依存（読み取りのみ）: セットA のスキーマ（契約は本SPECのDDL）
- テスト: CRUD往復・ソフトデリートと復元・削除済みが一覧に出ない・概要更新で版が積まれ復元できる・**ページの版一覧にノートの版が混ざらない（entity_type で分離）**

**セット C: パージと後方互換**
- 目的: 受け入れ条件「ゴミ箱・パージの意味論」「古いzipの取り込み」
- 触ってよいファイル: `src/main/db/purge.ts`（notebooks のパージ＋所属解除）、`tests/main/db/purge.test.ts`（追記）、`tests/main/backup/`（既存の import テストの隣に「notebooks を含まない旧形式 zip が取り込め、再オープンでマイグレーションが追いつく」を追加）
- 依存（読み取りのみ）: セットA/B
- テスト: 30日超の notebooks が消え、所属ページの `notebook_id` が NULL になり**ページ本体は残る**／30日以内は消えない／`REQUIRED_TABLE_NAMES` が不変であることの明示的アサーション

### Phase 4 統合ゲートでのみ編集するファイル
- `docs/MIGRATIONS.md` §6（実績追記）、`docs/TASKS-notebooks.md`（進捗）
- 全体テスト・lint・typecheck・E2E（挙動不変の確認）

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 1 | A, B（Bは本SPECのDDLを契約として先行可）| **可**（`notes-repo.ts`/`schema.sql` はAとBで重複しない: Aはスキーマ・マイグレーションのみ、Bはリポジトリのみ） |
| 2 | C | A/B 完了後 |

### 完了条件
- `npm test` / `npm run lint` / `npm run typecheck` / `npm run build` 緑。`npm run test:e2e` 緑（挙動不変）
- **壊して確認**: 各マイグレーションを外すと落ちる／パージの所属解除を消すと落ちる／entity_type 分離を外すと「混ざらない」テストが落ちる
- PR は `feature/notebooks` を base に1本
