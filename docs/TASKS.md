# hanamask タスク一覧

`docs/REQUIREMENTS.md`（確定済み要求定義）を実装単位に分解したバックログ。各タスクは概ね1本の `SPEC.md`（skill「feature-spec」）に相当する粒度で、Parallel Subagent Framework（`CLAUDE.md`）のPhase 1〜5フローに1つずつ投入することを想定する。

本ファイルの整備・更新手順は skill「task-breakdown」に従う。要求定義（`docs/REQUIREMENTS.md`）が変更されたとき、または既存タスクの完了・スコープ変更があったときは、このskillを使って本ファイルを更新する。

## 読み方

各タスクは以下5項目を明文化する。

| 項目 | 内容 |
|---|---|
| 目的 | このタスクが無いと何ができないか。`docs/REQUIREMENTS.md`の該当節を根拠として引く。 |
| 変更範囲 | 触ってよい層・ディレクトリの見積もり（ファイル単位の確定はタスク着手時の`SPEC.md` Part 2で行う）。他タスクとの並列実行時に競合しないかの目安。 |
| 禁止事項 | このタスクではやらないこと。スコープ拡張・後続タスクの先取りを防ぐ。 |
| テスト | `docs/TESTING.md`（単体テスト方針）・`.claude/skills/e2e-runner/SKILL.md`（GUI/E2E検証）に基づき、このタスクで最低限満たすべきテスト。 |
| 停止条件 | 管理者に確認せず自律的に進めてよい範囲の境界。`docs/GOVERNANCE.md` §6（管理者承認が必要な操作）に該当する事態、`docs/REQUIREMENTS.md` §8の未決定事項に触れる場合、自己修正3回超過などはここで止める。 |

ステータス: `未着手` / `進行中` / `完了`。

各タスクには「依存」欄を設ける。**必須**は前提タスクが完了するまで着手できないもの（無いと実装・テストが成立しない技術的依存）、**推奨**は無くても着手できるが後回しにした方が手戻りが少ないもの（パターンの横展開・内容の正確性など）を区別する。必須が無いタスクは「必須: なし」と明記する。

## 依存関係と着手順

以下は必須依存のみを辺としたタスク依存グラフを、着手可能な順（ウェーブ）にまとめたもの。同じウェーブ内のタスクは並列着手できる（Parallel Subagent Framework 7.1の複数worktree、または7.2のフェーズ内並列いずれでも可）。次のウェーブは、直前のウェーブが**全て**完了してから着手する。

| ウェーブ | タスク | 必須依存 |
|---|---|---|
| 0（完了済み） | T00, T01, T02 | なし |
| 1 | T03, T05, T13, T14 | T00（T13, T14は技術的な必須依存は無いが、内容が主要機能に左右されるため実質このウェーブ以降が現実的） |
| 2 | T04, T06, T07, T08, T09, T10, T12 | T03 および/または T05（詳細は各タスクの「依存」欄） |
| 3 | T11 | T03, T05, T06 |

依存グラフの図は`docs/html/TASKS.html`側にのみ置く（`docs-html-sync` skillの運用に合わせ、Markdown側には図を重複させない。正は上の表と各タスクの「依存」欄）。

---

## 基盤・プロセス（要求定義そのものではなく開発基盤の整備）

### T00: 基盤(1) ノート機能の垂直スライス

- ステータス: 完了（PR #5, `SPEC.md`）
- 依存: 必須: なし
- 目的: MCP経由の操作がデスクトップUIにリアルタイム反映される、というhanamaskの中核メカニズム（§1, §4.6）が成立することの技術検証。
- 変更範囲: `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`, ビルド設定一式。
- 実績: `create_note`/`get_note`/`search_notes`、ノート一覧UI、IPCによる自動反映、SQLite永続化。

### T01: テストケース作成方針の整備

- ステータス: 完了（PR #7, `docs/TESTING.md`）
- 依存: 必須: なし
- 目的: 単体テストの書き方（ディレクトリ構成・I/O境界の扱い）を明文化し、以降のタスクで揺れなく踏襲できるようにする。
- 変更範囲: `docs/TESTING.md`, `docs/GOVERNANCE.md`, `docs/html/`。
- テスト: 該当なし（ドキュメントのみ）。

### T02: GUI/E2E検証ハーネスの整備

- ステータス: 完了（PR #8, `tests/e2e/`, `.claude/skills/e2e-runner/SKILL.md`）
- 依存: 必須: なし（推奨: T00の後。E2Eシナリオの検証対象がノート機能のため）
- 目的: MCP経由の操作がデスクトップUIに実際に反映されることを、Electronアプリを本当に起動して自動検証できるようにする。
- 変更範囲: `tests/e2e/`, `vitest.e2e.config.ts`, `.claude/skills/e2e-runner/SKILL.md`, `src/main/index.ts`（テスト用DBパス上書き）, `tsconfig.preload.json`。
- 実績: 副産物としてpreloadスクリプトのCommonJSコンパイル不備（画面が真っ白になる実害バグ）を発見・修正済み。

---

## 機能タスク（`docs/REQUIREMENTS.md` 由来）

### T03: ノートの更新・ソフトデリート・復元

- ステータス: 進行中（バックエンド・削除UI完了。ノート編集UI（タイトル・本文の書き換え）と復元UIは未着手として残す）
- 依存: 必須: T00
- 目的: `docs/REQUIREMENTS.md` §4.1, §4.7, §7.1。現状`create_note`/`get_note`/`search_notes`しか無く、ノートを直せない・消せない。`update_note`/`delete_note`/`restore_note`を追加し、破壊的操作へのガードレール（ソフトデリート・`confirm: true`必須）を実装する。
- 変更範囲: `src/main/db/notes-repo.ts`（update/soft-delete/restore関数）, `src/main/mcp/tools.ts`（3ツール追加）, `src/renderer/components/`（編集・削除UI）。DBスキーマに`deleted_at`カラム追加（マイグレーション相当の対応が必要、既存`schema.sql`を直接更新でよいか要確認）。
- 禁止事項: 編集履歴（NoteVersion、T04）・30日パージバッチ（T10）はこのタスクでは実装しない（`delete_note`が`deleted_at`を立てるところまでで、自動パージは別タスク）。物理削除は一切実装しない。
- テスト: `notes-repo`のupdate/soft-delete/restoreの単体テスト（`tests/main/db/`）、`confirm: true`省略時にエラーを返すことのMCPツールテスト（`tests/main/mcp/`）、ソフトデリート後は`search_notes`のデフォルト結果に出ないことのテスト。`tests/e2e/`に削除→復元のシナリオを追加。
- 停止条件: `deleted_at`カラム追加に伴うDBスキーマ変更方式（既存`schema.sql`直接改変か、マイグレーション機構を新設するか）は既存資産（3件のみ、開発中）への影響が小さいうちに管理者へ一度方針確認する。
- 実績（バックエンド分）: `notes-repo.ts`に`updateNote`/`softDeleteNote`/`restoreNote`、`tools.ts`に`update_note`/`delete_note`/`restore_note`（`confirm: true`必須）を追加。`schema.sql`に`deleted_at`カラムを直接追加（既存資産が開発中の3ファイルのみのため、マイグレーション機構は導入しない判断とした。停止条件に挙げていた点だが、影響が小さいと判断しこの場で決定し実装、レビュー時に確認してほしい）。`searchNotes`は`deleted_at IS NULL`を既定条件に変更。単体テスト16+17件、E2Eシナリオ1件を追加。
- 実績（削除UI分）: ノート一覧（`NoteList.tsx`）の各ノートに削除ボタンを追加。`window.confirm()`で確認後、`window.hanamask.deleteNote(id)`→新設の`notes:delete` IPCチャンネル→`softDeleteNote`→`emitNotesChanged()`（MCPツール経由の削除と同じ通知経路）でウィンドウから自動的に消える。`implementer`が実装、`reviewer`がレビュー（Minor指摘のみ、Critical/Majorなし）、`verifier`が`xvfb-run`での実機E2E・削除ボタンの実操作（confirmキャンセル/実行の両方）まで確認済み。編集UI（タイトル・本文の書き換え）と復元UIは未実装のため別途対応する。

### T04: ノート編集履歴（バージョニング）

- ステータス: 未着手
- 依存: 必須: T03（更新前スナップショットを撮るには`update_note`が存在する必要がある）
- 目的: `docs/REQUIREMENTS.md` §4.7, §6, §7.1。`update_note`実行直前の内容をスナップショットし、`list_note_versions`/`restore_note_version`で辿れるようにする。
- 変更範囲: `src/main/db/`（`NoteVersion`テーブル・リポジトリ関数）, `src/main/mcp/tools.ts`（2ツール追加）, `src/renderer/components/`（履歴表示UI）。
- 禁止事項: バージョン数の上限・自動間引きは`docs/REQUIREMENTS.md`に規定が無いため実装しない（無制限保存のまま。上限が必要になったら別タスクで管理者に提案する）。
- テスト: `update_note`呼び出しごとにスナップショットが1件増えることの単体テスト、`restore_note_version`で本文が過去バージョンに戻ることのテスト（戻す操作自体もスナップショットを積むか、`docs/REQUIREMENTS.md`に明記が無いため実装前に停止条件で確認）。
- 停止条件: 「過去バージョンへの復元」がさらに新しいバージョンとして積まれるか、単純上書きかは要求定義に記載が無いため、実装前に管理者へ確認する。

### T05: タスク管理（CRUD・ステータス・ソフトデリート）

- ステータス: 未着手
- 依存: 必須: T00（DB接続・MCPツール登録・IPC通知の共通基盤）／推奨: T03の後（ソフトデリート・確認フラグのパターンを踏襲するため、先に固めておくと手戻りが少ない。ブロッキングではない）
- 目的: `docs/REQUIREMENTS.md` §4.3, §7.1。`create_task`/`update_task`/`list_tasks`/`delete_task`/`restore_task`とタスク一覧・詳細/編集UI（リスト表示）を実装する。ノート機能で確立したMCPツール・ソフトデリート・リアルタイム反映のパターンを横展開する。
- 変更範囲: `src/main/db/tasks-repo.ts`（新規）, `src/main/mcp/tools.ts`（5ツール追加）, `src/renderer/components/`（タスク一覧・詳細/編集UI）, `src/main/index.ts`（`tasks:list`等のIPCチャンネル追加）。
- 禁止事項: カンバン表示（ドラッグ&ドロップ、T08）・リンク機能（T06）はこのタスクに含めない。リスト表示のみ。
- テスト: `tasks-repo`のCRUD・ステータス遷移・ソフトデリートの単体テスト、`confirm: true`必須のMCPツールテスト、タスク作成→UI自動反映のE2Eシナリオ（`tests/e2e/`に`task-flow.spec.ts`を追加）。
- 停止条件: 特になし（T00/T03で確立したパターンの横展開のため、想定外の設計判断が必要になった場合のみ確認）。

### T06: リンク機能（ノート-タスク、ノート-ノート、タスク-タスク）

- ステータス: 未着手
- 依存: 必須: T03, T05（リンク対象となるノート/タスクの更新・詳細画面が無いとリンク表示・作成UIを組み込む先が無い）
- 目的: `docs/REQUIREMENTS.md` §3-8（相互リンクの探索）, §4.2, §4.3, §7.1。`link_entities`/`unlink_entities`/`list_links`と、ノート/タスク詳細画面でのリンク表示・作成UIを実装する。
- 変更範囲: `src/main/db/links-repo.ts`（新規）, `src/main/mcp/tools.ts`（3ツール追加）, `src/renderer/components/`（リンク表示・作成UI、ノート/タスク詳細画面への組み込み）。
- 禁止事項: リンクの種類（参照/依存等の意味づけ）は`docs/REQUIREMENTS.md`に規定が無いため、単純な相互参照のみ実装する（意味づけの拡張は行わない）。
- テスト: `links-repo`の作成・解除・一覧取得の単体テスト、双方向に取得できること（`from`側・`to`側どちらからでも`list_links`で見えること）のテスト。
- 停止条件: 特になし。

### T07: Mermaid図のレンダリング表示

- ステータス: 未着手
- 依存: 必須: T03（ノート詳細/編集画面はT03で新設されるため。T00のノート一覧のみではMermaidを埋め込む本文編集・全文表示の場が無い）
- 目的: `docs/REQUIREMENTS.md` §4.4。ノート本文中の ```` ```mermaid ```` コードフェンスをデスクトップUIでレンダリング表示する（データモデル上は独立エンティティを持たず、既存の`body`フィールドのMarkdown内に既に保存可能）。
- 変更範囲: `src/renderer/components/`（ノート詳細/編集画面へのMermaidレンダラー組み込み）, `package.json`（レンダリングライブラリの追加要否を検討）。
- 禁止事項: フリーハンド図（Excalidraw等）は対象外（`docs/REQUIREMENTS.md` §9で明示的にスコープ外）。図の編集用GUI（ドラッグでノードを動かす等）は作らない。テキスト編集のみ。
- テスト: Mermaidコードフェンスを含むノート本文が正しくレンダリングされることのコンポーネントテスト（`tests/renderer/`）。構文エラーのあるMermaidコードでもUIがクラッシュしないことのテスト。
- 停止条件: レンダリングライブラリの新規追加（`docs/GOVERNANCE.md` §6「依存関係の大幅な追加」に該当しうる）は、選定理由（バンドルサイズ・オフライン動作可否）を添えて管理者に確認してから追加する。`docs/html/`のMermaid運用（CDN読み込み、`docs-html-sync` skill）はドキュメント閲覧専用でありElectronアプリ本体には流用しない方針である点に注意。

### T08: タスクのカンバン表示

- ステータス: 未着手
- 依存: 必須: T05
- 目的: `docs/REQUIREMENTS.md` §4.3（リスト表示とカンバン表示の両方が初期スコープ）。ステータス別の列にドラッグ&ドロップでタスクを移動できるUIを追加する。
- 変更範囲: `src/renderer/components/`（カンバンビュー新規コンポーネント）。既存のリスト表示・タスクMCPツール（T05）には手を入れない（表示切替のみ）。
- 禁止事項: カンバンの列構成（ステータス以外の軸での分類等）はスコープ外。`docs/REQUIREMENTS.md`が定める`todo`/`in_progress`/`done`の3列のみ。
- テスト: ドラッグ&ドロップでステータスが更新され、`update_task`が呼ばれることのコンポーネントテスト。
- 停止条件: 特になし。

### T09: 画像添付

- ステータス: 未着手
- 依存: 必須: T03（画像添付はノート編集画面への組み込みのため、その画面自体が無いと着手できない）
- 目的: `docs/REQUIREMENTS.md` §4.5, §5, §6, §7.1。ファイル選択/クリップボード貼り付けによる画像添付、`attach_image`ツール、プレビュー表示を実装する。画像はローカルファイルシステム（アプリのデータディレクトリ配下）に保存し、DBには`file_path`のみ持つ。
- 変更範囲: `src/main/db/images-repo.ts`（新規）, `src/main/mcp/tools.ts`（`attach_image`追加）, `src/main/index.ts`（画像ファイルの保存先ディレクトリ管理）, `src/renderer/components/`（添付UI・プレビュー表示）。
- 禁止事項: OCR等の画像内テキスト検索対象化は`docs/REQUIREMENTS.md` §9で明示的にスコープ外。
- テスト: 画像ファイルがデータディレクトリ配下に保存され、`file_path`がDBに記録されることの単体テスト。不正な形式のファイルを渡した場合のエラーハンドリングのテスト。
- 停止条件: 対応画像形式・サイズ上限は`docs/REQUIREMENTS.md`に規定が無いため、実装前に管理者へ確認する。

### T10: 30日パージバッチ

- ステータス: 未着手
- 依存: 必須: T03, T05（両エンティティの`deleted_at`ソフトデリートが実装済みでないとパージ対象が存在しない）
- 目的: `docs/REQUIREMENTS.md` §4.7。ソフトデリートから30日経過したノート・タスクを、アプリ起動時のバッチ処理で完全削除する。
- 変更範囲: `src/main/db/`（パージ関数）, `src/main/index.ts`（起動時フックへの組み込み）。
- 禁止事項: 手動トリガー（UIからの「今すぐ完全削除」ボタン等）は`docs/REQUIREMENTS.md`に規定が無いため実装しない。起動時の自動実行のみ。
- テスト: `deleted_at`が30日以上前のレコードのみパージされ、30日未満のレコードは残ることの単体テスト（日時はテスト側で固定値を注入し、暗黙の現在時刻に依存させない。`docs/TESTING.md`のDesigning for testability方針に従う）。
- 停止条件: 特になし。

### T11: UI連携ツール（open_app/open_note/open_task/open_search）

- ステータス: 未着手
- 依存: 必須: T03（`open_note`が開くノート詳細画面）, T05（`open_task`が開くタスク詳細画面）, T06（リンク経由の探索と組み合わせて使う想定のため、リンク機能を先に固める）
- 目的: `docs/REQUIREMENTS.md` §4.1, §7.2。AIエージェントがMCP経由でデスクトップUIの起動・画面遷移を行えるようにする。
- 変更範囲: `src/main/mcp/tools.ts`（4ツール追加）, `src/main/index.ts`（ウィンドウ制御・画面遷移のIPC）, `src/renderer/`（ルーティング機構が未整備の場合は導入を検討）。
- 禁止事項: このタスクで新しい画面は作らない（既存のノート/タスク詳細・検索結果画面への遷移のみ）。
- テスト: 各ツール呼び出しでウィンドウが起動/前面化し、指定した画面に遷移することのE2Eシナリオ（`tests/e2e/`）。
- 停止条件: レンダラー側にルーティング機構（React Router等）が無い場合、新規導入は`docs/GOVERNANCE.md` §6の依存関係追加に該当しうるため管理者に確認する。

### T12: AIチャットパネル（BYO Agent）

- ステータス: 未着手
- 依存: 必須: T03, T05（チャットから呼び出す実用的なMCPツールが最低限揃っている必要がある）／推奨: T04, T06〜T11の後（MCPツール一式が出揃っているほどチャットで呼び出せる操作の幅が広がる。ブロッキングではない）
- 目的: `docs/REQUIREMENTS.md` §4.6, §1。利用者が自身のAnthropic APIキーを設定し、hanamask内蔵の簡易エージェントループ経由でClaude API（Messages API, tool use）を呼び出し、§7のMCPツール群を使ってノート/タスクを操作できるチャットUIを実装する。
- 変更範囲: `src/main/`（APIキーの`safeStorage`暗号化保存, Claude APIクライアント, エージェントループ, tool呼び出しの仲介）, `src/renderer/components/`（チャットUI、設定画面でのAPIキー入力・モデル選択）, `package.json`（Anthropic SDK追加）。
- 禁止事項: hanamask独自のAIロジック・モデルは持たない（BYO Agent方針、`docs/REQUIREMENTS.md` §1, §9）。既存のClaude Codeセッションとの直接連携は行わない（§9で明示的にスコープ外）。使用量集計・上限設定等の課金管理機能は持たない。
- テスト: APIキーが平文でDB・設定ファイルに保存されないことのテスト（`safeStorage`経由の暗号化を確認）。Claude APIクライアントはモックし、実APIキー無しでテストが通ることを担保する（グローバル規約の「外部APIはモックする」に従う）。tool use経由でMCPツールが正しく呼び出されることの結合テスト。
- 停止条件: Anthropic SDK（`@anthropic-ai/sdk`）の追加は`docs/GOVERNANCE.md` §6の依存関係追加に該当するため管理者に確認する。APIキーの`safeStorage`実装は秘密情報の取り扱いに直結するため、実装方針（保存先ファイルパス・暗号化失敗時のフォールバック挙動）を管理者にレビューしてもらってから本実装に入る。

### T13: 配布パッケージング（Windowsインストーラー）

- ステータス: 未着手
- 依存: 必須: なし（`electron-builder`設定自体は他タスクと無関係に着手できる）／推奨: 主要機能タスク（T03〜T12）の完了後（インストーラーで配布する内容が固まってからの方が手戻りが無い）
- 目的: `docs/REQUIREMENTS.md` §5。`electron-builder`でWindows向けインストーラー（.exe）を作成できるようにする。
- 変更範囲: `package.json`（`electron-builder`設定）, ビルドスクリプト。
- 禁止事項: 自動更新機構は`docs/REQUIREMENTS.md`で初期スコープ外と明記されているため実装しない。macOS/Linux向けパッケージングも対応OS優先順位（Windows優先）に従い、このタスクでは行わない。
- テスト: `.claude/skills/e2e-runner/SKILL.md`に従い、実際にビルドしたインストーラーからのインストール・起動を手動確認する（自動テスト化は困難なため手動検証を基本とする）。
- 停止条件: リリース・タグ付け・公開リポジトリへのpushは`docs/GOVERNANCE.md` §6により管理者の承認が必要。ビルド設定の作成まではここで進めてよいが、実際のリリース物公開は別途確認する。

### T14: READMEの hanamask 向け更新

- ステータス: 未着手
- 依存: 必須: なし／推奨: 主要機能タスク（T03〜T12）の完了後（記載すべき内容が機能タスクの完了状況に左右されるため）
- 目的: `docs/REQUIREMENTS.md` §0。`README.md`に残る旧work-manager向けの記述をhanamask向けに書き換える。
- 変更範囲: `README.md`のみ。
- 禁止事項: `docs/`配下の内容変更はこのタスクに含めない（README単体の更新）。
- テスト: 該当なし（ドキュメントのみ）。記載したセットアップ手順（`npm install`/`npm run dev`等）が実際に通ることを確認する。
- 停止条件: 特になし。
