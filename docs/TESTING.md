# テストケース作成方針

このドキュメントは hanamask における単体テストの書き方の方針を定める。一般的なテストパターン（網羅すべきケースの種類、テスト容易性の設計原則）は `~/.claude/CLAUDE.md`（グローバル規約）が参照する `docs/testing.md`（グローバル）に従う。本ファイルには、それを hanamask のスタック（Electron + better-sqlite3 + MCP SDK + React）に適用する上での具体的な方針のみを記す。

work-manager（本リポジトリのテンプレート元）の `tests/` 配下の慣習を土台としつつ、スタックの違いに起因する箇所は明示的に変更している（後述）。

## テストランナー・実行コマンド

- Vitest を使用する（`npm test` / `npm run test:watch`）。
- 設定は `vitest.config.ts`。`environment: "node"` がデフォルト。DOM が必要なテストのみファイル先頭に `/** @vitest-environment jsdom */` を付けて `jsdom` に切り替える（`tests/renderer/NoteList.test.tsx` 参照）。

## ディレクトリ構成・命名（work-managerからの変更点）

- `tests/` は `src/` のディレクトリ構造をそのままミラーする（例: `src/main/db/notes-repo.ts` → `tests/main/db/notes-repo.test.ts`）。
  - **work-managerとの違い**: work-manager は `tests/` 直下にフラットにテストファイルを置く。hanamask では Electron の `main`（Node.js）/`renderer`（React・DOM）/`preload` のプロセス境界がテスト方針（後述のI/O境界の扱い）に直結するため、フラット配置だとその境界が一見して分からなくなる。`src/` 構造をミラーすることでファイル所属が自明になる方を優先した。
- ファイル名は `<対象ファイル名>.test.ts` / `.test.tsx`（work-managerと同じ命名規則）。

## テストの書き方

- `describe`/`it` を使い、`it` の説明文は日本語で「何をしたら何が起きるか」を仕様として読める文にする（work-manager `tests/task-timer.test.ts` 等の慣習を踏襲）。
  - 良い例: `"実行中タスクがある場合、切替時刻で前タスクを終了し次タスクを開始する"`
  - 避ける例: `"switchTask works"` のような実装名の言い換え
- 純粋関数はI/Oから分離してそのままテストする（グローバル規約の「Designing for testability」節、および work-manager `src/lib/task-timer.ts` 系の設計を踏襲）。日付・IDなどはテスト側で固定値/生成値を渡し、暗黙の現在時刻に依存させない。

## I/O境界のテスト方針（work-managerからの変更点）

work-manager は Prisma + PostgreSQL 構成のため、DBアクセスは `vi.mock("@/lib/db", ...)` で `prisma.*` を丸ごとモックし、ハンドラ層のロジックのみを検証する（`tests/tasks-handlers.test.ts` 参照）。実DBへの接続はテストでは行わない。

hanamask は better-sqlite3（同期・ファイルベース・プロセス内蔵）を使うため、この制約が当てはまらない。方針を以下のように変更する。

- **DBを直接使うロジック（リポジトリ層・MCPツールハンドラ）は、原則としてモックせず実際のSQLiteファイル（一時ファイル）に対してテストする。**
  - `beforeEach` で `tmpdir()` 配下にランダムな一時ファイルパスを作り `openDb()` する、`afterEach` で `closeDb()` してから `rmSync(..., { force: true })` で削除する（`tests/main/db/notes-repo.test.ts`, `tests/main/mcp/tools.test.ts` 参照）。
  - 理由: better-sqlite3は同期APIかつネットワークI/Oを伴わないため、実ファイルに対するテストでも十分高速。モックで代替する必要が薄く、実際のSQL（`LIKE`のワイルドカードエスケープなど）が正しく機能することまで検証できる方が信頼性が高い。
- **モックを使うのは、実データでは再現しづらい異常系（ネイティブドライバ層の障害）に限定する。**
  - 例: `tests/main/db/db.test.ts` は `vi.mock("better-sqlite3", ...)` でドライバ自体をモックし、「スキーマ適用が例外を投げたら接続をclose・状態をクリアする」という異常系のみを検証する。正常系（`notes-repo.test.ts`）は実ファイルで検証するため、ここでのモックはドライバ層の境界に閉じている。
- MCPツールのテストは、HTTPトランスポートを経由せず `findNoteTool(name).handler(args)` を直接呼び出してツールの入出力を検証する（`tests/main/mcp/tools.test.ts` 参照）。トランスポート層自体の検証は別途スコープする。

## レンダラー（React）コンポーネントのテスト

- `@testing-library/react` を使用する。ファイル先頭に `/** @vitest-environment jsdom */` を付ける。
- レンダラーは `window.hanamask`（preload が公開するAPI）越しにのみ main プロセスと通信する。テストでは `window.hanamask` に `vi.fn()` を差し込んでモックし、実際の IPC/MCP には触れない（`tests/renderer/NoteList.test.tsx` の `mockHanamask` 参照）。
- `afterEach` で `cleanup()` と `vi.restoreAllMocks()` を必ず呼び、テスト間の状態漏れを防ぐ。
- 購読解除（`unsubscribe`）やコールバック経由の再取得など、ライフサイクルに関わる振る舞いも個別のテストケースとして明示する。

## 網羅すべきケースの観点

happy path / edge / corner / boundary / empty / null・undefined / invalid / error / negative / regression の観点はグローバル `docs/testing.md` のチェックリックに従う（本ファイルでは重複させない）。hanamask における具体例:

- empty: `searchNotes("")` は全件返す、ノート0件時のレンダラー空状態表示
- invalid: MCPツールへの型不一致な引数（`{ id: 42 }` など）は `isError: true` を返す
- error: DBクローズ後のツール呼び出しはクラッシュせず `isError: true` を返す
- negative: バリデーション失敗時は `onNotesChanged` リスナーに通知しない（副作用が起きないことの確認）

## Golden tests

現時点で CLI出力・固定フォーマット出力を持つ機能はないため未導入。該当する機能（例: エクスポート機能）が追加された時点で `docs/testing.md` の Golden tests 節に従い導入を検討する。

## 禁止事項

- テストの削除・無効化、アサーションを緩めることで「グリーンにする」ことは禁止する（`CLAUDE.md` の Parallel Subagent Framework セーフティ機構と同じ規約）。テストが失敗する場合は原因を修正するか、修正できない場合は失敗のまま報告する。

## タイムアウト（2026-08-10追加）

単体テストのタイムアウトは `vitest.config.ts` で **20秒**に明示している。既定の5秒だと、**GitHubのWindowsランナーで軽いテストが散発的に落ちる**（実際に2件、別々のファイルで発生した。いずれも「作成1回＋更新2回」程度で6秒前後かかっていた）。遅いのはコードではなく**ランナーのディスク**で、初回のSQLiteファイル生成が引っかかる。

**本当の停止は無限に待つので、余裕を持たせても検出力は落ちない。**この値を超えるようになったら「遅くなった」ではなく「止まっている」と考えてよい。

**タイムアウトを個別のテストで延ばす前に、まず何が遅いのかを確かめること。**手元で再現しないなら環境起因、再現するならコードの問題であって、後者をタイムアウトの延長で隠してはいけない。
