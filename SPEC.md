# SPEC: ノート/ページ(4) MCPツール群（T57）

## Part 1: 利用者向け

### 何を・なぜ

外部AIエージェントが**束ね方まで含めて**記録を管理できるようにします（§4.9・§7.3）。ページ用の `*_page` 群と `move_page`、ノート用の `*_notebook` 群を新設します。**既存の `*_note` ツールは名前・引数・戻り値を一切変えずに残る**ので、いま繋がっているエージェントの手順は壊れません（案A）。

新設ツール（16本）:
- ページ: `create_page` / `update_page` / `get_page` / `search_pages` / `delete_page` / `restore_page` / `list_page_versions` / `restore_page_version` — 対応する `*_note` と**同じ結果を返す別名**（内部で同じ処理を呼ぶ）。`create_page` は所属ノート指定可、`get_page` は所属ノートを返し、`search_pages` は所属ノートで絞れる
- `move_page` — ページを ノートへ入れる／別ノートへ移す／出して無所属にする
- ノート: `create_notebook` / `update_notebook` / `get_notebook`（概要＋所属ページ一覧） / `list_notebooks` / `delete_notebook`（`confirm: true` 必須） / `restore_notebook`

削除まわりは既存のガードレールどおり（ソフトデリート・30日復元・confirm 必須）。ノート削除時の所属ページは §4.9 の確定どおり（ゴミ箱中は所属保持のまま無所属扱い）。

### 受け入れ条件

- [ ] 新設16ツールの正常系・異常系（存在しないID／削除済み対象／`confirm` 無し削除の拒否）が動く
- [ ] `*_page` と対応する `*_note` が**同じ入力に同じ結果**を返す（案Aの成立確認）
- [ ] `move_page` の4経路（無所属→ノート／ノート→別ノート／ノート→無所属／存在しないノートへの移動は拒否）が動き、移動は変更イベントで画面に伝わる
- [ ] `create_notebook`/`update_notebook`/`delete_notebook`/`restore_notebook` が変更イベントを飛ばし、開いている画面・OS通知・意味検索の索引（T56）に乗る
- [ ] 既存 `*_note`・タスク・リンク・UIツールの挙動が変わらない（既存テスト緑）
- [ ] README のツール表と実装が一致（`check:readme` 緑）。§7.3 の未実装印を外す
- [ ] E2E: MCP で `create_notebook`→`create_page`(所属付き)→`move_page`→`semantic_search_notes` にノートが出る、までの一連が通る（T55/T56 で見送った E2E をここで回収）

### 未決定・要確認事項（2件、いずれも文面・構成の確認）

1. **既存 `*_note` ツールの説明文**: 「ページを操作する（`*_page` と同じ。互換のために残している名前）」という**中立の注記だけ**を足し、「非推奨（deprecated)」とは書かない提案です。deprecated と書くとエージェントが自発的に乗り換えて手順書と食い違い始めるため、v3 で廃止を決めるまで中立に保ちます。→ これで良いか
2. **`tools.ts` の分割**: ツールが約40本になるため `src/main/mcp/tools/`（notes.ts / pages.ts / notebooks.ts / tasks.ts / links.ts / ui.ts / shared.ts）へ分割し、`scripts/check-readme-tools.mjs` を**ディレクトリ走査**に変更する提案です（`name:` インデント4スペースの前提は維持。対象パスだけ複数化し、「ファイルを増やしても検出漏れしない」テストを足す）。→ 分割して良いか

---

## Part 2: AI用（実装セット定義）

### 設計の骨子

- **分割（未決2が承認されたら）**: `src/main/mcp/tools/shared.ts`（`McpTool` 型・`jsonResult`/`errorResult`/`toToolHandler`/`read*` ヘルパ・スキーマ定数）、`notes.ts`（既存 noteTools + 新 pageTools）、`notebooks.ts`、`tasks.ts`、`links.ts`、`ui.ts`。`src/main/mcp/tools.ts` は re-export の集約点として残す……のはグローバル規約「再エクスポート禁止」に反するため、**残さず**、参照元（server.ts / agent-loop.ts / index.ts / テスト）を新パスに更新する。`check-readme-tools.mjs` は `src/main/mcp/tools/` 配下の `*.ts` を全走査（下限チェック 10→35 に引き上げ）。
- **別名の実装**: `*_page` は `*_note` の handler を**共有関数に切り出して両方から呼ぶ**（definition だけ別）。挙動差分は `create_page` の `notebook_id?`、`get_page` の戻りに `notebookId`、`search_pages` の `notebook_id?` フィルタの3点のみ（`*_note` 側は従来の入出力を変えない。`Note` 型が `notebookId` を持つのは T54 済みなので、既存 `get_note` の戻りに自然に含まれるのは可＝「引数・戻り値を変えない」の趣旨は既存フィールドの維持）。
- **notes-repo**: `moveNoteToNotebook(noteId, notebookId | null)`（存在検証・`emitNotesChanged` は呼び出し側）、`searchNotes` の `notebookId?` フィルタ追加（省略時は従来どおり全件＝既存呼び出し不変）。
- **イベント**: notebook 系ツールは `emitNotebooksChanged({entity:"notebook", ...})`、`move_page` は `emitNotesChanged`（ページの変更）。
- README: ノート表を「ページ」「ノート（束）」の2節に再構成（既存 `*_note` は「ページ（互換名）」節）。`check:readme` の照合は名前ベースなので節構成は自由。
- §7.3 の未実装印を外す（docs/REQUIREMENTS.md + HTML 同期）。`delete_notebook` の行の「実装時に確定する」注記を §4.9 確定内容に更新。

### 実装セット

**セット A: 分割リファクタ（機能変更なし）**
- 目的: 受け入れ条件5の土台（挙動不変のまま器を整える）
- 触ってよいファイル: `src/main/mcp/tools.ts`（削除）、`src/main/mcp/tools/`（新設6ファイル）、`src/main/mcp/server.ts`・`src/main/chat/agent-loop.ts`・`src/main/index.ts` の import 更新、`scripts/check-readme-tools.mjs`、既存テストの import 更新（`tests/main/mcp/*.test.ts`、`tests/main/chat/agent-loop.test.ts`）
- テスト: 既存全緑のまま／`check:readme` がディレクトリ走査で23本を検出／**走査漏れ検出テスト**（tools/ に `name:` を持つ一時ファイルを置くと README 不一致で落ちる形を fixture で確認）
- **単独で先行し、完了後に B/C が乗る**（直列）

**セット B: ページ別名と move_page**（Aの後）
- 触ってよいファイル: `src/main/mcp/tools/notes.ts`、`src/main/db/notes-repo.ts`（`moveNoteToNotebook`・`searchNotes` フィルタ）、`README.md`、`tests/main/mcp/page-tools.test.ts`（新規）、`tests/main/db/notes-repo.test.ts`（追記)
- テスト: 8別名の同値性（同入力→同結果を機械的に往復）／`create_page` の所属付き作成／`search_pages` の絞り込み／`move_page` 4経路＋イベント発火／`confirm` 拒否

**セット C: notebook ツール群**（Aの後、Bと並列可）
- 触ってよいファイル: `src/main/mcp/tools/notebooks.ts`、`src/main/db/notebooks-repo.ts`（`get_notebook` 用の所属ページ一覧 `listNotesInNotebook` が無ければ追加）、`README.md` は B と分担（**notebook 節は C、page 節は B**。同一ファイルのため行が競合しない節単位で分ける）、`tests/main/mcp/notebook-tools.test.ts`（新規）
- テスト: 6ツールの正常・異常／`delete_notebook` の confirm 必須・ソフトデリート・所属ページが消えないこと／`restore_notebook` で束が戻る／イベント発火／`tool-descriptions.test.ts` に新群を追加

### Phase 4 統合ゲートでのみ編集するファイル
- `docs/REQUIREMENTS.md` §7.3（未実装印を外す）＋ HTML 同期、`docs/TASKS-notebooks.md` 進捗
- `tests/e2e/notebook-flow.spec.ts`（新規: create_notebook → create_page 所属付き → move_page → semantic_search_notes でノートが出る。T55/T56 の見送り分を回収）
- README の両節の整合確認（B/C の分担の縫い目）

### 並列グループ宣言

| グループ | セット | 同時実行 |
|---|---|---|
| 1 | A | 単独（大規模 import 更新のため他と混ぜない） |
| 2 | B, C | **可**（tools/ 内の別ファイル。README は節単位で分担） |

### 完了条件
- unit / lint / typecheck / build / `check:readme` / E2E（新規1本含む）緑
- 壊して確認: 別名の共有関数を片側だけ変えると同値性テストが落ちる／`move_page` の存在検証を外すと落ちる／走査漏れ fixture
- PR は `feature/notebooks` base に1本
