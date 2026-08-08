# hanamask

AI開発（AIエージェントとの協働）に最適化された、ローカル完結のノート・タスク管理デスクトップアプリ。

**MCPサーバーとして自身のツール群を公開し、利用者が普段使っているAIエージェント（Claude Code等のCLIエージェント）が直接ノート・タスクを読み書きする**ことを主要な操作経路とする。データはローカル（SQLite + ローカルファイル）に閉じ、クラウド同期を持たない。搭載予定のAIチャットも、hanamask自前のAIモデルではなく利用者自身が管理するAIエージェント（BYO Agent）を接続して使う設計とする。

詳細なコンセプト・機能要件は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) を参照。

## 技術スタック

- **アプリ本体**: Electron（ネイティブデスクトップアプリ、ローカル動作）
- **UI（レンダラープロセス）**: React + Vite / Tailwind CSS v4（スタイリング）/ `motion`（アニメーション、LazyMotionで遅延ロード）/ Mermaid（図のレンダリング）
- **MCPサーバー**: `@modelcontextprotocol/sdk`（Node.js製）をmainプロセスに内蔵、localhost向けHTTPトランスポート（Streamable HTTP）で待ち受け
- **データ保存**: SQLite（`better-sqlite3`、メタデータ）+ ローカルファイルシステム（画像）
- **テスト**: Vitest（単体・レンダラー）+ Playwrightの `_electron` API（E2E）

## セットアップ

Node.js 22以上が必要（`package.json` の `engines` 参照）。

```bash
npm install
```

`better-sqlite3` はネイティブモジュールのため、インストール時にビルドが走ることがある。Linuxではビルドツール（`build-essential`、`python3` 等）が必要になる場合がある。

## 開発コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | ビルドしてElectronアプリを起動する（`npm run build && electron .`） |
| `npm run build` | レンダラー（Vite）とmain/preload（tsc）を `dist/` にビルドする |
| `npm test` | Vitestで単体テストを実行する（`npm run test:watch` でウォッチ） |
| `npm run test:e2e` | ビルド後、Electronアプリを実際に起動してE2Eテストを実行する |
| `npm run lint` | ESLintを実行する |
| `npm run typecheck` | `tsc --noEmit` で型チェックする |

E2Eテストはウィンドウ描画にディスプレイを必要とする。ヘッドレス環境（WSL・CI）では `xvfb-run npm run test:e2e` のようにXvfb配下で実行する。テスト方針の詳細は [docs/TESTING.md](docs/TESTING.md)、GUI検証手順は `.claude/skills/e2e-runner/SKILL.md` を参照。

## MCPサーバーへの接続

MCPサーバーはElectronのmainプロセスに内蔵されており、アプリ起動と同時に待ち受けを開始する。

- エンドポイント: `http://127.0.0.1:39217/mcp`（Streamable HTTPトランスポート）
- ポートの上書き: 環境変数 `HANAMASK_MCP_PORT`
- DBファイルパスの上書き: 環境変数 `HANAMASK_DB_PATH`（既定はElectronの `userData` ディレクトリ配下の `hanamask.sqlite3`）

AIエージェントからは、MCPクライアント（例: SDKの `Client` + `StreamableHTTPClientTransport`）でこのURLに接続する。

## 画面構成

左側に常設のレール（ホーム／ノート／タスク／ゴミ箱）、右側に内容という2カラム構成。

| 画面 | 内容 |
|---|---|
| ホーム | 最近のノートと進行中のタスクを1画面で見渡す。起動時の既定画面 |
| ノート一覧 / ノート詳細 | 本文・タグの表示と編集、Mermaid図、画像添付、編集履歴、リンク |
| 設定 | AIチャットのAPIキーとモデル、データの書き出し・取り込み |
| タスク一覧 / カンバン / タスク詳細 | 本文・期限の表示と編集、リンク。3列（未着手・進行中・完了）のカンバンはドラッグ&ドロップで状態を変更できる |
| ゴミ箱 | 削除済みノートの一覧と復元。削除されるまでの残り日数を表示する |
| 検索結果 | タイトル・本文の部分一致検索 |

**MCP経由の操作は、開いている画面へ手動リロードなしで反映される。** エージェントが書き換えた直後のノートはピンクで示し、「たった今 · エージェントが更新」と文字でも表示する（色だけに意味を持たせない）。編集中に外から更新が来た場合は、編集内容を消さずに通知だけを出して利用者に選ばせる。新しく現れたノート・タスクは控えめな入場アニメーションで示す（OSの「視覚効果を減らす」設定を尊重する）。

**画面を見ていないときは、OSの通知で知らせる。** 通知するのはウィンドウにフォーカスが無いときだけ。UIで編集するにはフォーカスが要るので、自分の操作で鳴ることはない。短い間に続いた変更は1通にまとめ、クリックすると該当のノート・タスクを開く。

配色はライト／ダークの両テーマに対応し、OSの設定に追従する。

## ノート・タスク本文の書き方

ノートとタスクは**同じ本文**を持ち、同じ描画・同じサニタイズ方針で扱われる。本文は **Markdown** として描画される。見出し・箇条書き・コードブロック・引用に加え、GFMの記法（表・タスクリスト・取り消し線）も使える。

**HTMLを直接書くこともできる。** `<div style="...">` のように装飾を細かく指定したい場合はそのまま埋め込める。ただし本文はAIエージェントが書くため、`<script>` / `<iframe>` / `javascript:` リンク / `onerror` 等のイベントハンドラ属性は描画時に取り除かれる。**`style` 属性は使えるが、`<style>` タグは描画されない**（タグ内のCSSはアプリ全体に効いてしまうため）。詳しくは [SECURITY.md](SECURITY.md) を参照。

Mermaid図は ```` ```mermaid ```` のコードフェンスとして書く。

## データの書き出しと取り込み

設定画面から、ノート・タスク・リンク・編集履歴・画像を **zip1つ**に書き出せる。別のPCへ移す、OSを入れ直す、データが壊れたときの備え。

- **APIキーは書庫に含まれない**
- 取り込みは既存のデータを置き換える。**実行前の状態は自動でzipに退避され、その保存先が画面に表示される**（誤って実行しても戻せる）
- 画像はDBに絶対パスで記録されているため、取り込み時に新しい環境のパスへ貼り直される

## 実装済みのMCPツール

### ノート

| ツール | 内容 |
|---|---|
| `create_note` | ノートを作成する（`title`, `body`, 任意の `tags`） |
| `get_note` | idで1件取得する（存在しなければ `null`） |
| `search_notes` | タイトル・本文の部分一致検索（空文字で全件） |
| `update_note` | タイトル・本文・タグを更新する（省略した項目は据え置き） |
| `delete_note` | ソフトデリートする（`confirm: true` 必須） |
| `restore_note` | ソフトデリートしたノートを復元する |
| `list_note_versions` | 編集履歴を新しい順に取得する |
| `restore_note_version` | 過去バージョンに戻す（戻す操作自体も履歴に積まれる） |
| `attach_image` | Base64の画像をノートに添付する（png/jpeg/gif/webp、10MBまで） |

Mermaid図は専用ツールを持たず、ノート本文へのインライン記述として `update_note` で追加・更新する。

### タスク

| ツール | 内容 |
|---|---|
| `create_task` | タスクを作成する（`title`, 任意の `status`・`due_date`） |
| `update_task` | タイトル・ステータス・期限を更新する（`due_date: null` で期限クリア） |
| `list_tasks` | タスク一覧を取得する（ソフトデリート済みは除外） |
| `delete_task` | ソフトデリートする（`confirm: true` 必須） |
| `restore_task` | ソフトデリートしたタスクを復元する |

ステータスは `todo` / `in_progress` / `done`。

### リンク

| ツール | 内容 |
|---|---|
| `link_entities` | ノート/タスク同士をリンクする（`from_type`, `from_id`, `to_type`, `to_id`） |
| `unlink_entities` | リンクをidで削除する（リンク先の実体は消さない） |
| `list_links` | あるエンティティに紐づくリンクを取得する（from/to どちら側も） |

### UI連携

| ツール | 内容 |
|---|---|
| `open_app` | アプリのウィンドウを前面に出す（閉じられていれば作り直す） |
| `open_note` | 指定したノートの詳細画面を開く |
| `open_task` | 指定したタスクの詳細画面を開く |
| `open_search` | 指定したクエリで検索結果画面を開く |

### 未実装

- AIチャットパネル（BYO Agent）は未実装（[docs/TASKS.md](docs/TASKS.md) T12）。

## 破壊的操作のガードレール

- 削除はすべてソフトデリート（`deleted_at` を立てる）で、物理削除は行わない。`delete_note` / `delete_task` は `confirm: true` を必須とする。
- ソフトデリートから30日を過ぎたレコードはアプリ起動時のパージで物理削除される。猶予日数は `NOTE_RETENTION_DAYS`（`src/shared/preload-api.ts`）が唯一の定義元で、パージ処理とゴミ箱の残り日数表示が同じ値を見る。
- ノートの更新前スナップショットは自動で履歴に保存され、`restore_note_version` で戻せる。

## ドキュメント

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): 機能要件・非機能要件・データモデル・MCPツール一覧
- [docs/TASKS.md](docs/TASKS.md): 実装タスクの分解・依存関係・進捗
- [docs/TESTING.md](docs/TESTING.md): テストケース作成方針
- [docs/PACKAGING.md](docs/PACKAGING.md): Windowsインストーラーのビルド手順
- [docs/SIGNING.md](docs/SIGNING.md): インストーラーの署名に必要なものと手順
- [docs/WSL.md](docs/WSL.md): WSLのAIエージェントからWindowsアプリのMCPへ接続する設定
- [docs/GOVERNANCE.md](docs/GOVERNANCE.md): 体制・運用ルール
- [docs/HERDR.md](docs/HERDR.md) / [docs/CODEX.md](docs/CODEX.md): 並列開発（herdr・Codex CLI）のセットアップ
- [docs/HUNK.md](docs/HUNK.md): hunk による差分レビュー（導入・エージェント連携）
- [docs/safety.md](docs/safety.md): 自律ループに許可する範囲
- [CLAUDE.md](CLAUDE.md): 開発時のセッション指示
