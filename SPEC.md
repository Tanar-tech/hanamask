# SPEC.md — 基盤(1): Electron + MCPサーバー + SQLite の最小垂直スライス（ノートのみ）

作成日: 2026-08-03
対象: docs/REQUIREMENTS.md §4.1（MCPサーバー）, §4.2（ノート、一部）, §4.6（リアルタイム反映）, §5（実行形態）, §6（Note部分）, §7.1（一部）

---

## Part 1: 利用者向け（このSPECのレビュー対象）

### 何を作るか

hanamaskの要求定義（docs/REQUIREMENTS.md）が確定したので、ゼロベースで実装を開始する。今回はアプリ全体を一度に作るのではなく、最も検証したいコアの仕組み——**「AIエージェントがMCP経由でノートを作ると、開いているデスクトップ画面に自動で反映される」**——を、ノート機能だけに絞って最初に通す。タスク・リンク・画像・図・AIチャット・削除/復元・編集履歴は次回以降のSPECで追加する。

### なぜこの範囲を最初にやるか

このアプリの一番の差別化点（§1）は「MCPネイティブ」と「デスクトップUIへのリアルタイム反映」であり、ここが技術的に一番不確実な部分でもある。他の機能（タスク管理、画像添付等）は一度この土台が動けば同じパターンの横展開で追加できるため、最初に最小構成で通して土台の妥当性を確認する。

### 技術的な決定事項（このSPECで新たに確定するもの）

要求定義（docs/REQUIREMENTS.md）で「実装時に確定/検証する」とされていた点のうち、この基盤実装に必要な範囲を以下のとおり決定する。矛盾・要確認事項ではなく、実装を進めるための具体化。

- **SQLiteアクセス**: `better-sqlite3`（同期API、Electronのmainプロセスとの相性、追加ネイティブ依存が少ない点を優先）。Prisma等のORMは導入しない。
- **MCP SDK**: `@modelcontextprotocol/sdk`（公式Node.js製）。Streamable HTTPトランスポートでlocalhostの固定ポートに待ち受ける。
- **レンダラーUI**: 旧work-manager由来のNext.js(App Router)資産は、SSR/静的エクスポート前提でElectronレンダラー（単純なSPA）に不向きと判断し流用しない（既にPR #2で削除済み）。代わりに **Vite + React + TypeScript** の素のSPA構成を新規採用する。Tailwind CSSはREQUIREMENTS.md §5の記載通り引き続き採用する。
- **パッケージマネージャ**: 既存の `package-lock.json`（npm）をそのまま使う（グローバル規約の「既存ロックファイルに従う」に該当）。

### 受け入れ条件

- [ ] `npm run dev` 相当のコマンドで、"hanamask" というタイトルのElectronウィンドウが起動し、ノート一覧画面（初期状態は空）が表示される 📸
- [ ] MCPクライアント（Claude Code等）がlocalhostのMCPエンドポイントに接続し、`create_note`（title, body, tags）を呼び出すと、SQLiteにノートが保存される
- [ ] `create_note` 呼び出し直後、起動済みのElectronウィンドウのノート一覧が**手動リロードなしに**新しいノートを表示する 📸
- [ ] `search_notes`（キーワード）で、title/bodyに一致するノートが返る
- [ ] `get_note`（id）で、1件のノート詳細が返る
- [ ] アプリを終了し再起動しても、作成済みのノートが表示される（SQLiteファイルへの永続化）

### 今回のスコープ外（次回以降のSPECで対応）

タスク/リンク/画像/NoteVersion（編集履歴）エンティティ、`delete_note`等のソフトデリート・確認フラグ・復元、Mermaidレンダリング、画像添付、AIチャットパネル（BYO Agent接続）、`open_note`等のUI連携ツール、カンバン表示、インストーラーパッケージング（electron-builder実配布）。

---

## Part 2: AI用（実装セット定義）

### 共有コントラクト（Phase 3開始前に確定する型・関数シグネチャ）

以降の全セットはこの契約に従って実装する。契約自体の変更が必要になった場合はPhase 4統合ゲートでのみ行う。

```ts
// Note エンティティ（SQLiteの notes テーブルに対応）
interface Note {
  id: string;        // uuid
  title: string;
  body: string;       // Markdown（Mermaidはコードフェンスとしてインライン）
  tags: string[];
  createdAt: string;  // ISO8601
  updatedAt: string;
}

// src/main/db/notes-repo.ts が公開する関数（Set A が実装）
function createNote(input: { title: string; body: string; tags: string[] }): Note;
function getNote(id: string): Note | null;
function searchNotes(query: string): Note[];

// src/main/mcp/change-emitter.ts が公開する型（Set B が実装）
// notes-repo経由でDBが変更された直後に発火する、Electron非依存のイベント発行者
interface ChangeEmitter {
  emitNotesChanged(): void;
  onNotesChanged(listener: () => void): () => void; // 戻り値は購読解除関数
}

// preloadがrendererに公開するAPI（Set C が実装、Set D はこの型に対して実装する）
interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  onNotesChanged(callback: () => void): () => void;
}
// window.hanamask: HanamaskPreloadApi としてグローバルに公開する
```

### 実装セット一覧

#### Set A: DBレイヤー（`src/main/db/`）
- 目的: ノートの永続化。受け入れ条件の「SQLite保存」「再起動後も残る」を満たす。
- 新規作成してよいファイル: `src/main/db/schema.sql`（`notes`テーブルのみ定義）, `src/main/db/db.ts`（`app.getPath('userData')` 配下にDBファイルを開き、`notes`テーブルが無ければ`schema.sql`を実行する接続シングルトン）, `src/main/db/notes-repo.ts`（共有コントラクトの3関数を実装）
- 読み取りのみ依存する既存ファイル: なし
- テスト置き場: `tests/main/db/notes-repo.test.ts`（一時ファイルDBを使い、`createNote`→`getNote`→`searchNotes`のラウンドトリップを検証）

#### Set D: レンダラーUI（`src/renderer/`）
- 目的: ノート一覧表示・リアルタイム反映のUI側。受け入れ条件の画面表示・自動更新を満たす。
- 新規作成してよいファイル: `index.html`, `vite.config.ts`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/components/NoteList.tsx`, `src/renderer/types/preload.d.ts`（`HanamaskPreloadApi`の型宣言。共有コントラクトのコピーでよい）
- 読み取りのみ依存する既存ファイル: なし（`window.hanamask`はこのセット内でモックして単体テストする。実物との結線はPhase 4）
- テスト置き場: `tests/renderer/NoteList.test.tsx`（`window.hanamask`をモックし、ノート一覧のレンダリングと`onNotesChanged`発火時の再取得を検証）

Set A・Set Dは互いに触るファイルが重複せず、共有コントラクトのみに依存するため**並列グループ1**として同時実装する。

#### Set B: MCPサーバー（`src/main/mcp/`）
- 目的: 外部AIエージェントからの`create_note`/`get_note`/`search_notes`呼び出しを受け付ける。受け入れ条件のMCP経由操作を満たす。
- 新規作成してよいファイル: `src/main/mcp/server.ts`（`@modelcontextprotocol/sdk`のStreamable HTTPサーバーをlocalhost固定ポートで起動）, `src/main/mcp/tools.ts`（3ツールのスキーマ定義とハンドラ。ハンドラは`notes-repo`の関数を呼び、成功時に`change-emitter`へ通知する）, `src/main/mcp/change-emitter.ts`（共有コントラクトの`ChangeEmitter`実装。Node標準の`EventEmitter`で十分）
- 読み取りのみ依存する既存ファイル: `src/main/db/notes-repo.ts`（Set Aの実装、実物を呼ぶ）
- テスト置き場: `tests/main/mcp/tools.test.ts`（ツールハンドラを直接呼び出し、`notes-repo`への反映と`change-emitter`発火を検証。実DBの代わりに一時ファイルDBを使ってよい）

#### Set C: Electronシェル（`src/main/index.ts`, `src/preload/index.ts`）
- 目的: アプリの起動、ウィンドウ生成、preload経由のIPC公開、MCPサーバー起動、DB変更のレンダラーへの通知配線。
- 新規作成してよいファイル: `src/main/index.ts`（`app.whenReady`でBrowserWindow生成、Set Bの`startMcpServer()`相当を呼ぶ、`change-emitter`の発火を`webContents.send('notes:changed')`へ橋渡し）, `src/preload/index.ts`（`contextBridge.exposeInMainWorld('hanamask', ...)` で共有コントラクトの`HanamaskPreloadApi`を実装。`listNotes`は`ipcMain.handle`経由で`notes-repo.searchNotes('')`相当を呼ぶ）
- 読み取りのみ依存する既存ファイル: `src/main/db/notes-repo.ts`（Set A）, `src/main/mcp/server.ts` / `change-emitter.ts`（Set B）
- テスト置き場: `tests/main/index.test.ts`（IPCハンドラ登録のユニットテスト。実ウィンドウ生成はテスト対象外とし、e2e相当の確認はPhase 4/5の手動起動で行う）

Set B・Set CはSet Aの実物に依存するため、Set A完了後に**並列グループ2**として同時実装する（Set B・C間はファイルが重複しない）。

### 並列グループ宣言

1. **並列グループ1**（先行・依存なし）: Set A, Set D
2. **並列グループ2**（Set A完了後）: Set B, Set C
3. **Phase 4 統合ゲート（共有ファイルはここでのみ編集）**: `package.json`（`dev`/`build`/`test`スクリプト追加、`electron`/`vite`/`better-sqlite3`/`@modelcontextprotocol/sdk`等の依存追加）, `tsconfig.json`分割（main/preload用・renderer用）, `.gitignore`（`dist/`, `*.sqlite3`追加）, `src/preload/index.ts`とSet Dのレンダラーの実結線, `src/main/index.ts`とSet B/Set Aの実結線。結線後、実際に`npm run dev`でアプリを起動し、Part 1の受け入れ条件を手動で一通り確認する（MCPクライアント役はcurl等でHTTPを直接叩いてもよい）。

### 完了条件

- `npm run lint` / `npm run typecheck` / `npm test` が全て緑
- Phase 4で`npm run dev`を実行し、Part 1の受け入れ条件6項目を全て手動確認できる
- 3回までの自己修正ループで解決しない失敗があれば、そこで止めて報告する（無条件の自走はしない）
