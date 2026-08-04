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

| ウェーブ | タスク | 状態 | 必須依存 |
|---|---|---|---|
| 0 | T00, T01, T02 | 完了 | なし |
| 1 | T03, T05 | 完了 | T00 |
| 1.5 | T15（ノート/タスク詳細画面） | 完了 | T00／推奨: T03, T05 |
| 2 | T04, T07, T08, T09, T10 | 完了 | T03 および/または T05（詳細は各タスクの「依存」欄）。UI部分の組み込み先はT15完了により確保された |
| 2 | T06（リンク機能） | 完了 | T03, T05 |
| 2 | T12（AIチャットパネル） | **未着手** | T03, T05 |
| 3 | T11 | 完了 | T03, T05, T06（バックエンド分） |
| 独立 | T13, T14 | 完了 | なし |

### 残作業（2026-08-04時点）

要求定義由来の機能タスクはT12を除きすべてマージ済み。実装済み機能の穴（T16〜T21）もT21を除き解消した。残っているのは以下のみで、いずれも相互に独立して並列着手できる。

| タスク | 残っている内容 | 必須依存 |
|---|---|---|
| T12 | AIチャットパネル（BYO Agent）。未着手・最大の残スコープ（管理者判断で継続見送り中） | T03, T05 |
| T21 | ノート切替時の復元レース（`App.tsx`の`<NoteDetail>`に`key`が無い） | T15 |
| T22 | T16/T17で見送ったE2Eシナリオの追加 | T16, T17 |

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

- ステータス: 完了（PR #8, `tests/e2e/`, `.claude/skills/e2e-runner/SKILL.md`。PR #26でノート編集・Mermaid表示・画像添付のE2Eシナリオ`tests/e2e/note-detail-flow.spec.ts`を追加）
- 依存: 必須: なし（推奨: T00の後。E2Eシナリオの検証対象がノート機能のため）
- 目的: MCP経由の操作がデスクトップUIに実際に反映されることを、Electronアプリを本当に起動して自動検証できるようにする。
- 変更範囲: `tests/e2e/`, `vitest.e2e.config.ts`, `.claude/skills/e2e-runner/SKILL.md`, `src/main/index.ts`（テスト用DBパス上書き）, `tsconfig.preload.json`。
- 実績: 副産物としてpreloadスクリプトのCommonJSコンパイル不備（画面が真っ白になる実害バグ）を発見・修正済み。

---

## 機能タスク（`docs/REQUIREMENTS.md` 由来）

### T03: ノートの更新・ソフトデリート・復元

- ステータス: 完了（PR #11 バックエンド, PR #23 編集UI。ソフトデリート済みノートの復元UIはスコープを分離しT16として独立タスク化した）
- 依存: 必須: T00
- 目的: `docs/REQUIREMENTS.md` §4.1, §4.7, §7.1。現状`create_note`/`get_note`/`search_notes`しか無く、ノートを直せない・消せない。`update_note`/`delete_note`/`restore_note`を追加し、破壊的操作へのガードレール（ソフトデリート・`confirm: true`必須）を実装する。
- 変更範囲: `src/main/db/notes-repo.ts`（update/soft-delete/restore関数）, `src/main/mcp/tools.ts`（3ツール追加）, `src/renderer/components/`（編集・削除UI）。DBスキーマに`deleted_at`カラム追加（マイグレーション相当の対応が必要、既存`schema.sql`を直接更新でよいか要確認）。
- 禁止事項: 編集履歴（NoteVersion、T04）・30日パージバッチ（T10）はこのタスクでは実装しない（`delete_note`が`deleted_at`を立てるところまでで、自動パージは別タスク）。物理削除は一切実装しない。
- テスト: `notes-repo`のupdate/soft-delete/restoreの単体テスト（`tests/main/db/`）、`confirm: true`省略時にエラーを返すことのMCPツールテスト（`tests/main/mcp/`）、ソフトデリート後は`search_notes`のデフォルト結果に出ないことのテスト。`tests/e2e/`に削除→復元のシナリオを追加。
- 停止条件: `deleted_at`カラム追加に伴うDBスキーマ変更方式（既存`schema.sql`直接改変か、マイグレーション機構を新設するか）は既存資産（3件のみ、開発中）への影響が小さいうちに管理者へ一度方針確認する。
- 実績（バックエンド分）: `notes-repo.ts`に`updateNote`/`softDeleteNote`/`restoreNote`、`tools.ts`に`update_note`/`delete_note`/`restore_note`（`confirm: true`必須）を追加。`schema.sql`に`deleted_at`カラムを直接追加（既存資産が開発中の3ファイルのみのため、マイグレーション機構は導入しない判断とした。停止条件に挙げていた点だが、影響が小さいと判断しこの場で決定し実装、レビュー時に確認してほしい）。`searchNotes`は`deleted_at IS NULL`を既定条件に変更。単体テスト16+17件、E2Eシナリオ1件を追加。
- 実績（削除UI分）: ノート一覧（`NoteList.tsx`）の各ノートに削除ボタンを追加。`window.confirm()`で確認後、`window.hanamask.deleteNote(id)`→新設の`notes:delete` IPCチャンネル→`softDeleteNote`→`emitNotesChanged()`（MCPツール経由の削除と同じ通知経路）でウィンドウから自動的に消える。`implementer`が実装、`reviewer`がレビュー（Minor指摘のみ、Critical/Majorなし）、`verifier`が`xvfb-run`での実機E2E・削除ボタンの実操作（confirmキャンセル/実行の両方）まで確認済み。
- 実績（編集UI分, PR #23）: `NoteDetail.tsx`に「編集」ボタンと編集フォーム（タイトル・本文・タグ）を追加。`draft`ステートに編集内容を保持し、保存時に`window.hanamask.updateNote()`→`notes:update` IPC→`updateNote`（MCPツール経由の更新と同じリポジトリ関数）を呼ぶ。ノートIDが切り替わったら`draft`を破棄する。保存失敗・対象消失時はエラーメッセージを表示する。PR #26で編集操作のE2Eシナリオも追加済み。
- 残作業: ソフトデリート済みノートを一覧・復元するUIは本タスクでは実装しなかった（`restore_note` MCPツールのみ存在する状態）。T16として独立タスク化した。

### T04: ノート編集履歴（バージョニング）

- ステータス: 完了（PR #18 バックエンド, PR #25 履歴表示・復元UI。管理者判断: 復元操作自体も新バージョンとして積む方式で実装した。レビューで指摘された復元中の編集レースはT18として独立タスク化）
- 依存: 必須: T03（更新前スナップショットを撮るには`update_note`が存在する必要がある）
- 目的: `docs/REQUIREMENTS.md` §4.7, §6, §7.1。`update_note`実行直前の内容をスナップショットし、`list_note_versions`/`restore_note_version`で辿れるようにする。
- 変更範囲: `src/main/db/`（`NoteVersion`テーブル・リポジトリ関数）, `src/main/mcp/tools.ts`（2ツール追加）, `src/renderer/components/`（履歴表示UI）。
- 禁止事項: バージョン数の上限・自動間引きは`docs/REQUIREMENTS.md`に規定が無いため実装しない（無制限保存のまま。上限が必要になったら別タスクで管理者に提案する）。
- テスト: `update_note`呼び出しごとにスナップショットが1件増えることの単体テスト、`restore_note_version`で本文が過去バージョンに戻ることのテスト（戻す操作自体もスナップショットを積むか、`docs/REQUIREMENTS.md`に明記が無いため実装前に停止条件で確認）。
- 停止条件: 「過去バージョンへの復元」がさらに新しいバージョンとして積まれるか、単純上書きかは要求定義に記載が無いため、実装前に管理者へ確認する。→ 管理者確認済み（新バージョンとして積む方式）。
- 実績: `notes-repo.ts`に`snapshotNote`（`updateNote`冒頭で自動実行）・`listNoteVersions`・`restoreNoteVersion`（内部で`updateNote`を呼ぶことで復元自体も履歴に積む）を追加。`tools.ts`に`list_note_versions`/`restore_note_version`を追加。単体テスト10件+MCPツール5件を追加。`implementer`が実装、`reviewer`・`verifier`とも指摘なし（`restoreNoteVersion`経由の一連の流れを実データで確認済み）。
- 実績（UI分, PR #25）: `NoteVersionHistory.tsx`（新規）をノート詳細画面（`NoteDetail.tsx`）に組み込み、バージョン一覧（更新日時・本文プレビュー80文字）と「このバージョンに戻す」ボタンを表示する。復元は`window.confirm()`で確認したうえで`restoreNoteVersion`を呼び、`onRestored`で親の`note`ステートを更新し、復元自体も履歴に積まれるため一覧を取り直す。ノート切替時に古い取得結果が後から上書きしないようガードを入れている。単体テストを追加。
- 残作業: `reviewer`が復元のIPC応答待ち中に編集モードへ入れてしまうレース条件をMajor指摘。T18として独立タスク化した。

### T05: タスク管理（CRUD・ステータス・ソフトデリート）

- ステータス: 完了（PR #12。リスト表示までのスコープを実装済み。編集/削除UIはT05のスコープ外＝リスト表示のみのため未着手のままでよい）
- 依存: 必須: T00（DB接続・MCPツール登録・IPC通知の共通基盤）／推奨: T03の後（ソフトデリート・確認フラグのパターンを踏襲するため、先に固めておくと手戻りが少ない。ブロッキングではない。実際には本タスクの時点でT03はまだこのブランチにマージされておらず、T03のパターンは横展開ではなく本タスクで独立に実装した）
- 目的: `docs/REQUIREMENTS.md` §4.3, §7.1。`create_task`/`update_task`/`list_tasks`/`delete_task`/`restore_task`とタスク一覧・詳細/編集UI（リスト表示）を実装する。ノート機能で確立したMCPツール・ソフトデリート・リアルタイム反映のパターンを横展開する。
- 変更範囲: `src/main/db/tasks-repo.ts`（新規）, `src/main/mcp/tools.ts`（5ツール追加）, `src/renderer/components/`（タスク一覧・詳細/編集UI）, `src/main/index.ts`（`tasks:list`等のIPCチャンネル追加）。
- 禁止事項: カンバン表示（ドラッグ&ドロップ、T08）・リンク機能（T06）はこのタスクに含めない。リスト表示のみ。
- テスト: `tasks-repo`のCRUD・ステータス遷移・ソフトデリートの単体テスト、`confirm: true`必須のMCPツールテスト、タスク作成→UI自動反映のE2Eシナリオ（`tests/e2e/`に`task-flow.spec.ts`を追加）。
- 停止条件: 特になし（T00/T03で確立したパターンの横展開のため、想定外の設計判断が必要になった場合のみ確認）。
- 実績: `tasks-repo.ts`（CRUD・ソフトデリート・復元）、`tools.ts`に`create_task`/`update_task`/`list_tasks`/`delete_task`(`confirm: true`必須)/`restore_task`を追加。`tasks:changed`を`notes:changed`とは独立したIPCチャンネルとして新設（無関係な再取得を避けるため）。`TaskList.tsx`で一覧表示のみ実装（編集・削除UIは対象外のため無し）。単体テスト（`tasks-repo`19件・MCPツール14件・`TaskList`5件）とE2Eシナリオ（`tests/e2e/task-flow.spec.ts`: 作成→UI反映→削除→復元）を追加。`implementer`が実装、`reviewer`がレビュー（Major指摘1件=E2E未実装を追加対応、Minor指摘は設計判断として現状維持）、`verifier`が`xvfb-run`実機E2E・`update_task`のUI反映・`confirm`無し削除の拒否まで確認済み。ソフトデリート済みタスクへの`update_task`は許容する仕様とした（ノート側T03の`update_note`と同じ判断。要求定義に規定が無いため制限しない方をシンプルとして選択）。

### T06: リンク機能（ノート-タスク、ノート-ノート、タスク-タスク）

- ステータス: 完了（バックエンド＝PR #13、リンク表示・作成UI＝PR #29）
- 依存: 必須: T03, T05（リンク対象となるノート/タスクの更新・詳細画面が無いとリンク表示・作成UIを組み込む先が無い）
- 目的: `docs/REQUIREMENTS.md` §3-8（相互リンクの探索）, §4.2, §4.3, §7.1。`link_entities`/`unlink_entities`/`list_links`と、ノート/タスク詳細画面でのリンク表示・作成UIを実装する。
- 変更範囲: `src/main/db/links-repo.ts`（新規）, `src/main/mcp/tools.ts`（3ツール追加）, `src/renderer/components/`（リンク表示・作成UI、ノート/タスク詳細画面への組み込み）。
- 禁止事項: リンクの種類（参照/依存等の意味づけ）は`docs/REQUIREMENTS.md`に規定が無いため、単純な相互参照のみ実装する（意味づけの拡張は行わない）。
- テスト: `links-repo`の作成・解除・一覧取得の単体テスト、双方向に取得できること（`from`側・`to`側どちらからでも`list_links`で見えること）のテスト。
- 停止条件: 特になし。
- 実績: `links-repo.ts`（`createLink`/`deleteLink`（物理削除）/`listLinks`）、`tools.ts`に`link_entities`/`unlink_entities`/`list_links`を追加し`server.ts`で配線。外部キー制約は張っていない（`from`/`to`がnote/taskいずれも取りうるため単一FKで表現できず、参照整合性は要求定義にも規定が無いため今回は許容する判断とした。理由は`schema.sql`のコメントに明記）。単体テスト（`links-repo`9件・MCPツール12件）を追加。`implementer`が実装、`reviewer`がレビュー（Major指摘2件=本ドキュメント更新漏れとFK根拠コメント不足、いずれも本コミットで対応済み）、`verifier`がツールハンドラ直接呼び出しでlink_entities→list_links（from/to双方向）→unlink_entitiesの一連の流れを実データで確認済み。
- 実績（UI分・PR #29）: T15でノート/タスク詳細画面が完成したため組み込み先が確保され、`EntityLinks.tsx`（新規）を`NoteDetail.tsx`（表示モードのみ）と`TaskDetail.tsx`に組み込んだ。`links:list`/`links:create`/`links:delete` IPCチャンネルを新設。リンク一覧は「自分ではない方の端点」を表示、作成フォーム（種別select + ID入力）と解除ボタン（confirm確認付き）を実装。単体テスト16件を追加。`reviewer`がバグ指摘なしと判定（端点表示ロジックがfrom側/to側・自己参照・同IDで種別違いのケースで正しいこと、stale responseガードがテストで再現検証されていることを確認）。ただし`link_entities`/`unlink_entities` MCPツールが変更通知を出さないため、AIエージェント経由のリンク操作が開いている画面に反映されない問題が判明した（既存バックエンド由来の欠落）→ T20として分離。

### T07: Mermaid図のレンダリング表示

- ステータス: 完了（PR #19）
- 依存: 必須: T03（ノート詳細/編集画面はT03で新設されるため。T00のノート一覧のみではMermaidを埋め込む本文編集・全文表示の場が無い）→ 実際にはT15（ノート/タスク詳細画面）に依存
- 目的: `docs/REQUIREMENTS.md` §4.4。ノート本文中の ```` ```mermaid ```` コードフェンスをデスクトップUIでレンダリング表示する（データモデル上は独立エンティティを持たず、既存の`body`フィールドのMarkdown内に既に保存可能）。
- 変更範囲: `src/renderer/components/`（ノート詳細/編集画面へのMermaidレンダラー組み込み）, `package.json`（レンダリングライブラリの追加要否を検討）。
- 禁止事項: フリーハンド図（Excalidraw等）は対象外（`docs/REQUIREMENTS.md` §9で明示的にスコープ外）。図の編集用GUI（ドラッグでノードを動かす等）は作らない。テキスト編集のみ。
- テスト: Mermaidコードフェンスを含むノート本文が正しくレンダリングされることのコンポーネントテスト（`tests/renderer/`）。構文エラーのあるMermaidコードでもUIがクラッシュしないことのテスト。
- 停止条件: レンダリングライブラリの新規追加（`docs/GOVERNANCE.md` §6「依存関係の大幅な追加」に該当しうる）は、選定理由（バンドルサイズ・オフライン動作可否）を添えて管理者に確認してから追加する。→ 管理者確認済み（`mermaid`パッケージ追加を承認）。`docs/html/`のMermaid運用（CDN読み込み、`docs-html-sync` skill）はドキュメント閲覧専用でありElectronアプリ本体には流用しない方針である点に注意。
- 実績: `mermaid`パッケージを追加。`MermaidDiagram.tsx`（新規）で`mermaid.render()`をラップし、構文エラー時は`role="alert"`表示（クラッシュしない）。`NoteDetail.tsx`で本文をMermaidコードフェンス部分とプレーンテキスト部分に分割して表示。単体テスト（`MermaidDiagram`6件・`NoteDetail`追加4件）を追加。`implementer`が実装、`reviewer`がレビュー（Minor指摘2件=バンドルサイズと多層防御の余地、いずれも許容範囲として対応不要）、`verifier`が`xvfb-run`実機E2Eで正常なMermaid図のSVGレンダリング・構文エラー時のクラッシュ耐性を確認済み（mermaidライブラリ自体がエラー時にSVGを直接DOM挿入する既知の挙動により、エラー表示が視覚的に二重になる軽微な見た目の問題があるが機能上の問題ではない）。この残留はT19として独立タスク化した。

### T08: タスクのカンバン表示

- ステータス: 完了（PR #15）
- 依存: 必須: T05
- 目的: `docs/REQUIREMENTS.md` §4.3（リスト表示とカンバン表示の両方が初期スコープ）。ステータス別の列にドラッグ&ドロップでタスクを移動できるUIを追加する。
- 変更範囲: `src/renderer/components/`（カンバンビュー新規コンポーネント）。既存のリスト表示・タスクMCPツール（T05）には手を入れない（表示切替のみ）。実際には、D&Dでのステータス更新をレンダラーから永続化する経路がT05時点に存在しなかったため、`src/main/index.ts`/`src/preload/index.ts`/`src/shared/preload-api.ts`に`tasks:update-status` IPCチャンネルの新設が必要になった（開発管理者が実装指示時に許可した範囲拡張。reviewerがMajor指摘したが機能上必須と判断し許容）。
- 禁止事項: カンバンの列構成（ステータス以外の軸での分類等）はスコープ外。`docs/REQUIREMENTS.md`が定める`todo`/`in_progress`/`done`の3列のみ。
- テスト: ドラッグ&ドロップでステータスが更新され、`update_task`が呼ばれることのコンポーネントテスト。
- 停止条件: 特になし。
- 実績: `KanbanView.tsx`をHTML5ネイティブDrag and Drop APIで実装（新規npmパッケージ追加なし）。`tasks:update-status` IPCチャンネルを新設し、既存の`updateTask`（`tasks-repo.ts`）を再利用。単体テスト（`KanbanView`9件・IPCハンドラ3件）を追加。`implementer`が実装、`reviewer`がレビュー（Major指摘=宣言範囲超過は開発管理者の事前許可事項として対応不要と判断、Minor指摘=本ドキュメント更新で対応済み）、`verifier`が`xvfb-run`実機E2Eで`create_task`→カンバン反映→ステータス更新の永続化・両ビューへの反映まで確認済み（実際のマウスドラッグ操作はChromiumの信頼済みイベント制約によりE2E自動化不可のため、ドロップハンドラの呼び出しパイプライン全体をJS経由で検証）。

### T09: 画像添付

- ステータス: 完了（PR #20）
- 依存: 必須: T03（画像添付はノート編集画面への組み込みのため、その画面自体が無いと着手できない）→ 実際にはT15（ノート/タスク詳細画面）に依存
- 目的: `docs/REQUIREMENTS.md` §4.5, §5, §6, §7.1。ファイル選択/クリップボード貼り付けによる画像添付、`attach_image`ツール、プレビュー表示を実装する。画像はローカルファイルシステム（アプリのデータディレクトリ配下）に保存し、DBには`file_path`のみ持つ。
- 変更範囲: `src/main/db/images-repo.ts`（新規）, `src/main/mcp/tools.ts`（`attach_image`追加）, `src/main/index.ts`（画像ファイルの保存先ディレクトリ管理）, `src/renderer/components/`（添付UI・プレビュー表示）。
- 禁止事項: OCR等の画像内テキスト検索対象化は`docs/REQUIREMENTS.md` §9で明示的にスコープ外。
- テスト: 画像ファイルがデータディレクトリ配下に保存され、`file_path`がDBに記録されることの単体テスト。不正な形式のファイルを渡した場合のエラーハンドリングのテスト。
- 停止条件: 対応画像形式・サイズ上限は`docs/REQUIREMENTS.md`に規定が無いため、実装前に管理者へ確認する。→ 管理者確認済み（PNG/JPEG/GIF/WebP、上限10MB）。
- 実績: `images`テーブル、`images-repo.ts`（`createImage`/`listImages`、`pathToFileURL()`でクロスプラットフォーム対応のfile:// URL生成）を追加。画像保存ロジックは`src/main/images/attach-image.ts`に共通化し、`images:attach` IPCハンドラと`attach_image` MCPツールの両方から呼び出す構成。`NoteDetail.tsx`にファイル選択・クリップボード貼り付け（`document`への`paste`イベントリスナー）両方の添付UIとプレビュー表示を追加。単体テスト多数追加。`implementer`が実装、`reviewer`がMajor指摘3件（`attach_image` MCPツール未実装、クリップボード貼り付け未実装、Windows file:// URL不具合）→いずれも修正済み、Minor指摘2件（MIMEマジックバイト未検証、画像一覧取得ロジックの軽微な重複）は対応不要と判断。`verifier`がMCPツールハンドラの直接呼び出しで実際にファイル書き込み・DB登録まで確認済み。GUI実機でのファイル選択・貼り付け操作は実ユーザーデータディレクトリへの書き込みを避けるため未実施（コード・単体テストレベルでは確認済み）。MCP経由で添付した画像を開いている詳細画面に自動反映する仕組み（変更通知）は本タスクでは未実装で、画像一覧の再取得は別途対応中。ノート本体（タイトル・本文・タグ）の反映はT17として独立タスク化した。

### T10: 30日パージバッチ

- ステータス: 完了（PR #14）
- 依存: 必須: T03, T05（両エンティティの`deleted_at`ソフトデリートが実装済みでないとパージ対象が存在しない）
- 目的: `docs/REQUIREMENTS.md` §4.7。ソフトデリートから30日経過したノート・タスクを、アプリ起動時のバッチ処理で完全削除する。
- 変更範囲: `src/main/db/`（パージ関数）, `src/main/index.ts`（起動時フックへの組み込み）。
- 禁止事項: 手動トリガー（UIからの「今すぐ完全削除」ボタン等）は`docs/REQUIREMENTS.md`に規定が無いため実装しない。起動時の自動実行のみ。
- テスト: `deleted_at`が30日以上前のレコードのみパージされ、30日未満のレコードは残ることの単体テスト（日時はテスト側で固定値を注入し、暗黙の現在時刻に依存させない。`docs/TESTING.md`のDesigning for testability方針に従う）。
- 停止条件: 特になし。
- 実績: `purge.ts`の`purgeSoftDeletedRecords(now: Date)`を追加。`now`を引数として受け取り内部で`new Date()`を呼ばないテスト容易な設計。30日ちょうどは復元猶予期間内として削除しない（`deleted_at < now - 30日`の厳密比較）。アプリ起動時（`openDb`直後・`createMainWindow`より前）に自動実行。単体テスト（境界値29日/ちょうど30日/31日を含む）を追加。`implementer`が実装、`reviewer`・`verifier`とも指摘なし（境界値の解釈も要求定義と整合していることを確認済み）。

### T11: UI連携ツール（open_app/open_note/open_task/open_search）

- ステータス: 完了（PR #24）
- 依存: 必須: T03（`open_note`が開くノート詳細画面）, T05（`open_task`が開くタスク詳細画面）, T06（リンク経由の探索と組み合わせて使う想定のため、リンク機能を先に固める）
- 目的: `docs/REQUIREMENTS.md` §4.1, §7.2。AIエージェントがMCP経由でデスクトップUIの起動・画面遷移を行えるようにする。
- 変更範囲: `src/main/mcp/tools.ts`（4ツール追加）, `src/main/index.ts`（ウィンドウ制御・画面遷移のIPC）, `src/renderer/`（ルーティング機構が未整備の場合は導入を検討）。
- 禁止事項: このタスクで新しい画面は作らない（既存のノート/タスク詳細・検索結果画面への遷移のみ）。
- テスト: 各ツール呼び出しでウィンドウが起動/前面化し、指定した画面に遷移することのE2Eシナリオ（`tests/e2e/`）。
- 停止条件: レンダラー側にルーティング機構（React Router等）が無い場合、新規導入は`docs/GOVERNANCE.md` §6の依存関係追加に該当しうるため管理者に確認する。→ T15で導入済みの`useState`ベースのナビゲーションをそのまま使い、ルーティングライブラリの新規追加は行わなかったため確認不要となった。
- 実績: `tools.ts`に`open_app`/`open_note`/`open_task`/`open_search`の4ツールを追加し、`src/main/ui/navigate.ts`（新規）の`showUiWindow`/`navigateUi`経由でmainプロセスのウィンドウ制御に委譲する構成にした（`tools.ts`が`index.ts`に直接依存しないよう`setUiNavigator`で注入する）。ウィンドウが閉じられている場合は作り直したうえで前面化する。画面遷移は`ui:navigate` IPCチャンネルでレンダラーへ送り、`App.tsx`のナビゲーション状態を更新する。`open_search`の遷移先として`SearchResults.tsx`（新規）を追加した（既存画面が無かったため。空クエリは全ノート一覧）。`implementer`が共有ファイルを担当外として保留したため、`server.ts`への4ツールの結線はPhase 4統合ゲートとして開発管理者が実施した（これが無いとMCPクライアントからツールが見えない）。

### T12: AIチャットパネル（BYO Agent）

- ステータス: 未着手
- 依存: 必須: T03, T05（チャットから呼び出す実用的なMCPツールが最低限揃っている必要がある）／推奨: T04, T06〜T11の後（MCPツール一式が出揃っているほどチャットで呼び出せる操作の幅が広がる。ブロッキングではない）
- 目的: `docs/REQUIREMENTS.md` §4.6, §1。利用者が自身のAnthropic APIキーを設定し、hanamask内蔵の簡易エージェントループ経由でClaude API（Messages API, tool use）を呼び出し、§7のMCPツール群を使ってノート/タスクを操作できるチャットUIを実装する。
- 変更範囲: `src/main/`（APIキーの`safeStorage`暗号化保存, Claude APIクライアント, エージェントループ, tool呼び出しの仲介）, `src/renderer/components/`（チャットUI、設定画面でのAPIキー入力・モデル選択）, `package.json`（Anthropic SDK追加）。
- 禁止事項: hanamask独自のAIロジック・モデルは持たない（BYO Agent方針、`docs/REQUIREMENTS.md` §1, §9）。既存のClaude Codeセッションとの直接連携は行わない（§9で明示的にスコープ外）。使用量集計・上限設定等の課金管理機能は持たない。
- テスト: APIキーが平文でDB・設定ファイルに保存されないことのテスト（`safeStorage`経由の暗号化を確認）。Claude APIクライアントはモックし、実APIキー無しでテストが通ることを担保する（グローバル規約の「外部APIはモックする」に従う）。tool use経由でMCPツールが正しく呼び出されることの結合テスト。
- 停止条件: Anthropic SDK（`@anthropic-ai/sdk`）の追加は`docs/GOVERNANCE.md` §6の依存関係追加に該当するため管理者に確認する。APIキーの`safeStorage`実装は秘密情報の取り扱いに直結するため、実装方針（保存先ファイルパス・暗号化失敗時のフォールバック挙動）を管理者にレビューしてもらってから本実装に入る。

### T13: 配布パッケージング（Windowsインストーラー）

- ステータス: 完了（PR #22 ビルド設定, PR #27 `docs/PACKAGING.md`。Windows実機で`.exe`生成まで検証済み）
- 依存: 必須: なし（`electron-builder`設定自体は他タスクと無関係に着手できる）／推奨: 主要機能タスク（T03〜T12）の完了後（インストーラーで配布する内容が固まってからの方が手戻りが無い）
- 目的: `docs/REQUIREMENTS.md` §5。`electron-builder`でWindows向けインストーラー（.exe）を作成できるようにする。
- 変更範囲: `package.json`（`electron-builder`設定）, ビルドスクリプト。
- 禁止事項: 自動更新機構は`docs/REQUIREMENTS.md`で初期スコープ外と明記されているため実装しない。macOS/Linux向けパッケージングも対応OS優先順位（Windows優先）に従い、このタスクでは行わない。
- テスト: `.claude/skills/e2e-runner/SKILL.md`に従い、実際にビルドしたインストーラーからのインストール・起動を手動確認する（自動テスト化は困難なため手動検証を基本とする）。
- 停止条件: リリース・タグ付け・公開リポジトリへのpushは`docs/GOVERNANCE.md` §6により管理者の承認が必要。ビルド設定の作成まではここで進めてよいが、実際のリリース物公開は別途確認する（未実施のまま）。
- 実績（ビルド設定, PR #22）: `electron-builder.yml`（`appId`=`dev.tanar.hanamask`, `win.target`=`nsis`, 出力先`release/`）と`package:win`スクリプトを追加。ネイティブアドオンの`.node`がasarアーカイブから`dlopen`できないため`better-sqlite3`を`asarUnpack`で展開する。レンダラーのバンドルに取り込み済みの`react`/`react-dom`/`mermaid`は`files`から除外しインストーラーサイズを抑えている。NSISはユーザー単位インストール（`perMachine: false`）でインストール先変更可。自動更新機構・コード署名・macOS/Linuxターゲットは要求定義どおり非対応。
- 実績（検証と手順書, PR #27）: 2026-08-04、WSLからWindows側のツールチェーン（Node.js v24.15.0 + Visual Studio Build Tools 2022 C++ワークロード）を使い`npm ci && npm run package:win`が完走し、`release/hanamask Setup 0.1.0.exe`（約118MB）の生成に成功することを実測で確認した。Linux側からの`--win`クロスコンパイルは`node-gyp`が非対応で不可能であることも実測して切り分け済み。手順・設定意図・制約を`docs/PACKAGING.md`にまとめた。
- 未検証（残課題として`docs/PACKAGING.md` §5に記載）: 生成した`.exe`を実際にインストールして起動する検証、パッケージ後の`better-sqlite3`読み込み（`asarUnpack`の実効性）、パッケージ後のMCPサーバー接続、SmartScreen警告の挙動。初回配布前に手動で確認する。

### T14: READMEの hanamask 向け更新

- ステータス: 完了（PR #21）
- 依存: 必須: なし／推奨: 主要機能タスク（T03〜T12）の完了後（記載すべき内容が機能タスクの完了状況に左右されるため）
- 目的: `docs/REQUIREMENTS.md` §0。`README.md`に残る旧work-manager向けの記述をhanamask向けに書き換える。
- 変更範囲: `README.md`のみ。
- 禁止事項: `docs/`配下の内容変更はこのタスクに含めない（README単体の更新）。
- テスト: 該当なし（ドキュメントのみ）。記載したセットアップ手順（`npm install`/`npm run dev`等）が実際に通ることを確認する。
- 停止条件: 特になし。
- 実績: 旧work-manager向けの記述を全面的に書き換え、コンセプト（ローカル完結・MCPサーバーとしての公開・BYO Agent）、技術スタック、セットアップ、開発コマンド一覧、MCPサーバーへの接続方法（エンドポイント`http://127.0.0.1:39217/mcp`、`HANAMASK_MCP_PORT`/`HANAMASK_DB_PATH`での上書き）、実装済みMCPツール一覧を記載した。`docs/`配下は変更していない（README単体の更新）。

### T15: ノート/タスク詳細画面（土台）

- ステータス: 完了（PR #17）
- 依存: 必須: T00（一覧UI）／推奨: T03, T05（詳細取得APIの元になるリポジトリ関数）
- 目的: `docs/TASKS.md`には元々存在しなかった新規タスク。T03（編集・復元UI）・T04（履歴表示UI）・T06（リンク表示UI）・T07（Mermaid表示）・T09（画像添付UI）・T11（open_note/open_task）が共通して必要とする「ノート/タスク詳細画面」が存在しなかったため、これらの前提となる土台として先に追加した（管理者承認済み）。
- 変更範囲: `src/renderer/components/NoteDetail.tsx`（新規）, `src/renderer/components/TaskDetail.tsx`（新規）, `src/renderer/App.tsx`（`useState`ベースのナビゲーション、ルーティングライブラリ不使用）, `src/renderer/components/NoteList.tsx`/`TaskList.tsx`（タイトルをクリック可能にする）, `src/main/index.ts`（`notes:get`/`tasks:get` IPCチャンネル新設）, `src/preload/index.ts`, `src/shared/preload-api.ts`。
- 禁止事項: 編集履歴・リンク表示・Mermaid・画像添付・本文編集UIはこのタスクでは実装しない（別タスクでこの詳細画面に追加される）。
- テスト: `NoteDetail`/`TaskDetail`の取得・表示・エラー表示・戻るボタンの単体テスト、`App.tsx`のナビゲーション遷移テスト、`notes:get`/`tasks:get` IPCハンドラのテスト。
- 停止条件: 特になし（新規npmパッケージ・ルーティングライブラリを追加しないことを条件に管理者が承認済み）。
- 実績: `implementer`が実装（154テスト全パス）、`reviewer`が指摘なしと判定、`verifier`が`xvfb-run`実機E2Eでノート/タスクそれぞれ作成→クリック→詳細表示→（タスクは）ステータス変更→戻る、の一連の流れと既存E2E（`note-flow.spec.ts`/`task-flow.spec.ts`）への非破壊を確認済み。異常系（存在しないIDでの詳細画面エラー表示）の実機確認は未実施（単体テストでは確認済み）。

---

## 実装済み機能の穴（先行タスクの残作業を独立タスク化したもの）

### T16: ソフトデリート済みノートの一覧・復元UI

- ステータス: 完了（PR #33。E2Eシナリオのみ未実施でT22へ分離）
- 依存: 必須: T03（`restore_note` MCPツールとソフトデリートのDB実装）／推奨: なし
- 目的: `docs/REQUIREMENTS.md` §4.7（削除は30日間の復元猶予付きソフトデリート）。T03で`delete_note`/`restore_note`とノート一覧の削除ボタンまでは実装したが、削除済みノートをデスクトップUIから見る手段が無く、復元は`restore_note` MCPツール経由でしか行えない。UIだけを使う利用者は誤削除を自力で取り消せず、30日後にパージ（T10）されて失われる。
- 変更範囲: `src/renderer/components/`（削除済みノート一覧・復元操作のUI）, `src/renderer/App.tsx`（一覧への導線・ナビゲーション追加）, `src/main/db/notes-repo.ts`（削除済みノートを列挙する取得関数。`searchNotes`は`deleted_at IS NULL`が既定のため、別関数または明示オプションが要る）, `src/main/index.ts`/`src/preload/index.ts`/`src/shared/preload-api.ts`（一覧取得・復元のIPCチャンネル）。
- 禁止事項: タスク（`restore_task`）側の復元UIはこのタスクに含めない（ノートで確立してから横展開する）。UIからの物理削除（「完全に削除」ボタン等）は`docs/REQUIREMENTS.md`に規定が無いため実装しない。パージ猶予期間の変更・T10のバッチへの変更も行わない。
- テスト: 削除済みノートのみを列挙する取得関数の単体テスト（未削除ノートが混ざらないこと、削除済みが0件のとき空配列になること）。復元後に通常のノート一覧へ戻ることのコンポーネントテスト。`tests/e2e/`に、UI操作での削除→削除済み一覧に出る→復元→通常一覧に戻る、のシナリオを追加する。
- 停止条件: 削除済み一覧をどこに置くか（独立した画面か、ノート一覧内のトグルか）は`docs/REQUIREMENTS.md`に規定が無いため、実装前に管理者へ方針を確認する。新規npmパッケージの追加が必要になった場合は`docs/GOVERNANCE.md` §6により管理者確認。

- 実績（PR #33）: 停止条件どおり管理者に確認し「独立画面」で確定（一度実装者への指示内で開発管理者が独断で決めてしまい、`reviewer`にMajor指摘されたため管理者へ差し戻して確認した）。`listDeletedNotes`/`restoreNote` IPCと`TrashView.tsx`を追加。`reviewer`指摘の「復元の応答待ち中に他ノートの復元ボタンが押せる」多重クリック経路に対し、全ボタンを`disabled={restoring}`にしたうえで、無効化を外すとREDになる回帰テストを追加済み。E2Eシナリオ（削除→ゴミ箱に出る→復元→通常一覧に戻る）はT22へ分離。

### T17: MCP経由のノート本体更新を開いている詳細画面へ反映する

- ステータス: 完了（PR #36。E2Eシナリオのみ未実施でT22へ分離）
- 依存: 必須: T15（ノート詳細画面）／推奨: T03（編集UI・`draft`ステートの実装。競合設計の対象になるため）
- 目的: `docs/REQUIREMENTS.md` §4.6, §1。「MCP経由の操作がデスクトップUIにリアルタイム反映される」ことがhanamaskの中核メカニズムであるにもかかわらず、ノート詳細画面（`NoteDetail.tsx`）はマウント時と`noteId`変更時にしか`getNote`を呼ばない。AIエージェントが`update_note`/`restore_note_version`でタイトル・本文・タグを書き換えても、画面を開いたままの利用者には古い内容が表示され続ける（画像一覧の再反映は別途対応中）。仕様との乖離であるため独立タスクとして解消する。
- 変更範囲: `src/renderer/components/NoteDetail.tsx`（`notes:changed`購読とノート本体の再取得、編集中`draft`との競合時の挙動）, 必要であれば`src/main/mcp/change-emitter.ts`/`src/main/index.ts`（通知に対象ノートIDを含める等の拡張）。
- 禁止事項: タスク詳細画面（`TaskDetail.tsx`）への同種の対応はこのタスクに含めない（ノートで方式を固めてから横展開する）。ポーリングによる定期再取得は実装しない（既存の`notes:changed`通知経路に乗せる）。競合解消のための自動マージ・差分表示など、要求定義に無い高機能な仕組みは作らない。
- テスト: `notes:changed`受信でノート本体（タイトル・本文・タグ）が再取得され表示が更新されることのコンポーネントテスト。編集中（`draft`が非nullのとき）に通知が来た場合に、決定した競合方針どおりに振る舞うこと（編集内容が黙って消えないこと）のテスト。`tests/e2e/`に、詳細画面を開いたままMCPツールで`update_note`を実行し表示が更新されるシナリオを追加する。
- 停止条件: **編集中の`draft`と外部更新が競合した場合の扱い（編集中は反映を保留する／通知バナーを出して利用者に選ばせる／編集していない項目だけ更新する等）は`docs/REQUIREMENTS.md`に規定が無いため、実装前に必ず管理者へ確認する。** 利用者の編集内容を失いうる判断であるため自律的に決めない。

- 実績（PR #36）: 停止条件どおり管理者に確認し「編集中は反映せず通知だけ出す」で確定。表示モードでは`notes:changed`受信で即再取得し、編集モードでは`draft`に触れず`role="status"`の通知＋「破棄して最新を読み込む」を出す（保存すれば利用者の編集が勝ち、履歴に残るため復元可能）。復元の応答待ち中（T18の`restoring`）は再取得をスキップし、復元前の内容が後から届いて復元結果を打ち消すのを防ぐ。`reviewer`のMajor指摘（ノート切替時に`reloadError`がリセットされず、無関係な画面にエラーが残る）を回帰テスト付きで修正済み。E2Eシナリオはこのタスクの変更禁止範囲外のためT22へ分離。

### T18: T04履歴UIの復元レース修正

- ステータス: 完了（PR #30）
- 依存: 必須: T04（履歴表示・復元UI）／推奨: なし
- 目的: `docs/REQUIREMENTS.md` §4.7。T04のPR #25レビューで`reviewer`がMajor指摘した不具合の修正。`NoteVersionHistory`の復元は`restoreNoteVersion`のIPC応答を待つ非同期処理だが、その待機中に利用者が「編集」ボタンを押すと復元前の`note`から`draft`が作られる。`onRestored`は親の`note`だけを更新するため`draft`は古いままとなり、その状態で保存すると復元結果を上書きしてしまう（利用者から見ると復元がなかったことになる）。
- 変更範囲: `src/renderer/components/NoteVersionHistory.tsx`（復元処理中であることを親へ伝える）, `src/renderer/components/NoteDetail.tsx`（復元処理中は編集ボタンを無効化する、または復元完了時に`draft`を破棄する）。
- 禁止事項: 復元の仕様そのもの（復元自体も新バージョンとして積む方式、T04で管理者確認済み）は変更しない。楽観ロック・バージョン番号による競合検出などDB層の仕組みは持ち込まない（UI層で防ぐ）。T17（外部更新との競合）はこのタスクに含めない（本タスクは同一画面内の操作順序の問題に限定する）。
- テスト: 復元のIPC応答を解決前に保留させた状態で編集ボタンが押せない（無効化されている）ことのコンポーネントテスト。復元完了後は編集ボタンが再び押せ、そこから作られる`draft`が復元後の内容になっていることのテスト。復元が失敗した場合も編集ボタンが押せる状態に戻ること（無効化が固まらないこと）の回帰テスト。
- 停止条件: 特になし（レビュー指摘の修正であり、要求定義に触れる仕様判断は生じない見込み。編集ボタン無効化以外の方式が必要と判明した場合のみ確認する）。

- 実績（PR #30）: 主防御として`restore()`が`window.confirm`直後・`await`前に同期的に`onRestoringChange(true)`を呼び、親（`NoteDetail`）が「編集」ボタンを`disabled`にする方式を採用（React 19のdiscrete event内state更新はハンドラ完了までに同期フラッシュされるため、IPC応答より確実に先行することを`reviewer`が確認）。副防御として`mounted` refでアンマウント後は`onRestored`を呼ばない。さらに`reviewer`のMajor指摘（一覧内の復元ボタンにdisabled制御が無く、多重クリックで先に完了した方の`finally`がフラグを倒す）を受け、復元中は全ての復元ボタンを`disabled`にした。いずれもREDフェーズで問題を実際に再現してから修正している。

### T19: Mermaid描画失敗時のエラーSVGのDOM残留

- ステータス: 完了（PR #34。実機で再現を確認したうえで修正）
- 依存: 必須: T07（Mermaidレンダリング）／推奨: なし
- 目的: `docs/REQUIREMENTS.md` §4.4。T07の`verifier`検証で判明した既知の見た目の問題。mermaidライブラリは描画に失敗すると自前のエラーSVGを`document.body`へ直接挿入するため、React管理外の要素として残る。`MermaidDiagram`側の`role="alert"`表示と二重になるうえ、Reactが管理していないためノートを切り替えても消えない可能性がある。機能上の破綻ではないが、詳細画面を使い続けると無関係なノートにエラー図が残って見える。
- 変更範囲: `src/renderer/components/MermaidDiagram.tsx`（描画失敗時・アンマウント時に、mermaidが挿入した要素を除去するクリーンアップ）。
- 禁止事項: mermaidライブラリのバージョン変更・別ライブラリへの差し替えは行わない（`docs/GOVERNANCE.md` §6の依存関係変更に該当する）。エラー時の表示内容（`role="alert"`のメッセージ）の仕様変更は行わない。ライブラリ内部の書き換え（monkey patch）は行わない。
- テスト: まず実機（`.claude/skills/e2e-runner/SKILL.md`に従い`xvfb-run`でElectronを起動）で、構文エラーを含むMermaidノート→別ノートへ切替、の操作でエラーSVGが残留することを再現・確認する（再現しない場合は本タスクを「対応不要」として閉じてよい）。再現したら、描画失敗後およびアンマウント後に`document.body`直下へmermaid由来の要素が残らないことのコンポーネントテストを追加する。正常なMermaid図のレンダリングが壊れていないことの回帰テストも維持する。
- 停止条件: クリーンアップのために対象要素を特定する手段がmermaidの内部実装（生成されるid・クラス名）に依存するため、実装が壊れやすいと判断した場合は方針を管理者に確認する。実機で再現しなかった場合は自己判断で実装せず、その結果を報告して止める。

- 実績（PR #34）: 停止条件どおりまず実機（`xvfb-run`）で再現を確認（`document.body`直下に`div#dmermaid-_r_0_`が`#root`の外に残り、ノートを切り替えても消えないことを実測）。根本原因はmermaid本体が`parseEncounteredException`を投げる経路で`removeTempElements()`に到達しないこと。`removeMermaidBodyLeftovers(diagramId)`で`diagramId`/`d{id}`/`i{id}`を、親が`document.body`のときに限って除去する（他要素を巻き込まないためのガード）。`catch`冒頭と`useEffect`のクリーンアップの両方から呼び、修正後に実機で再検証済み。

### T20: リンク操作の変更通知（MCP経由のリンク作成・解除をUIへ反映）

- ステータス: 完了（PR #35）
- 依存: 必須: T06（リンク機能）
- 目的: `docs/REQUIREMENTS.md` §4.6。T06の`reviewer`検証で判明した仕様との乖離。`link_entities`/`unlink_entities` MCPツールが変更通知を出していないため、AIエージェントがMCP経由でリンクを張っても、開いているノート/タスク詳細画面に反映されない。§4.6は「MCPツールがDB書き込みを行った直後、mainプロセスがレンダラーに変更通知イベントを送る」ことをこのアプリの中核メカニズムと位置づけており、リンクだけが例外になっている状態。
- 変更範囲: `src/main/mcp/change-emitter.ts`（`links:changed`相当の通知を追加するか、既存の`notes:changed`/`tasks:changed`を流用するかを判断）, `src/main/mcp/tools.ts`（`link_entities`/`unlink_entities`の成功時に通知）, `src/main/index.ts`（ブロードキャスト配線）, `src/preload/index.ts`, `src/shared/preload-api.ts`, `src/renderer/components/EntityLinks.tsx`（購読して再取得）。
- 禁止事項: リンクの種類（参照/依存等の意味づけ）の追加はしない。`links:create`/`links:delete` IPCハンドラ（UI操作由来）は既にUI側で再取得しているため、そこに二重の通知を足して不要な再取得を増やさないこと。
- テスト: `link_entities`/`unlink_entities`の成功時に通知リスナーが呼ばれ、失敗時は呼ばれないことのMCPツールテスト。`EntityLinks`が通知を受けてリンク一覧を再取得することのコンポーネントテスト。
- 停止条件: 通知チャンネルを新設するか既存を流用するかは、エンティティ横断（1つのリンクがノートとタスクの両方に関わる）という性質上、既存の`notes:changed`/`tasks:changed`のどちらに載せても不自然になる。新設が妥当と考えられるが、共有コントラクト（`src/shared/preload-api.ts`）への追加を伴うため、方針を管理者に確認してから着手する。

- 実績（PR #35）: 停止条件どおり管理者に確認し`links:changed`の新設で確定。`change-emitter.ts`に既存の`emitTasksChanged`と同型で`emitLinksChanged`/`onLinksChanged`を追加し、`link_entities`/`unlink_entities`の成功時のみ発火（失敗時は発火しないことをテストで固定）。`EntityLinks`が購読して再取得する。UI操作由来の`links:create`/`links:delete`との二重再取得は発生しない。

### T21: ノート切替時の復元レース（`NoteDetail`が再マウントされない）

- ステータス: 未着手
- 依存: 必須: T15（ノート/タスク詳細画面）
- 目的: `reviewer`がT18のレビュー中に発見した既存の欠落。`src/renderer/App.tsx`の`<NoteDetail noteId={view.id} ... />`に`key`指定が無いため、別のノートへ切り替えても`NoteDetail`/`NoteVersionHistory`は同一インスタンスとして再利用される。あるバージョンの復元がIPC応答待ちの間に別ノートへ遷移すると`NoteVersionHistory`はアンマウントされず`mounted.current`が`true`のままになり、復元完了時に`onRestored`（=`setNote`）が表示中の別ノートを旧ノートの復元結果で上書きしうる。T18の修正で導入した`mounted` refによる防御が、この経路では効かない。
- 変更範囲: `src/renderer/App.tsx`（`<NoteDetail>`/`<TaskDetail>`に`key={view.id}`を付与してノートIDごとに再マウントさせる）。副作用として詳細画面のローカルstate（編集中の`draft`等）がノート切替時に確実にリセットされるため、既存の`useEffect`によるリセット処理が冗長になる可能性がある。
- 禁止事項: `NoteVersionHistory`/`NoteDetail`側のガードロジック（T18で追加した`mounted` ref・`restoring`フラグ）を削除しないこと。`key`追加はこれらを代替するものではなく、アンマウント経路を確実にするための補強である。
- テスト: 復元のIPC応答待ち中に別ノートへ遷移し、応答が解決しても表示中のノートが上書きされないことのテスト（`App.test.tsx`または`NoteDetail.test.tsx`）。まずこのレースを再現する失敗テストを書いてから修正すること。`key`追加で既存のノート切替・タスク切替のテストが壊れないことも確認する。
- 停止条件: `key`追加により詳細画面のstate管理（既存の`noteId`変更時リセット処理）と重複・競合が生じる場合、どちらを正とするかの方針を管理者に確認する。

### T22: T16/T17で見送ったE2Eシナリオの追加

- ステータス: 未着手
- 依存: 必須: T02（E2Eハーネス）, T16（ゴミ箱UI）, T17（詳細画面のリアルタイム反映）／推奨: なし
- 目的: T16・T17はいずれもタスク定義の「テスト」欄でE2Eシナリオの追加を求めていたが、実装時に変更範囲の宣言外だったため見送った（コンポーネントテストのみで、MCP→IPC→UIの結線は未検証）。`docs/REQUIREMENTS.md` §4.6のリアルタイム反映はこのアプリの中核メカニズムであり、結線が壊れても単体テストでは検出できないため、実機E2Eで固定する。
- 変更範囲: `tests/e2e/`（既存の`note-detail-flow.spec.ts`への追記、または新規specファイル）のみ。アプリ本体（`src/`）には手を入れない。
- 禁止事項: 実装側の挙動変更は行わない。E2Eを通すためにプロダクトコードへテスト専用の分岐・属性を足さない（既存のロケータで届かない場合は、その旨を報告して止める）。他タスクのE2Eシナリオ（タスク・カンバン等）の拡充はスコープ外。
- テスト: (1) UI操作でノートを削除→ゴミ箱画面に出る→復元→通常一覧に戻る。(2) ノート詳細画面を開いたままMCPツールで`update_note`を実行し、タイトル・本文・タグの表示が更新される。(3) 編集モード中に同じ更新を行うと、編集内容が保持されたまま変更通知が表示される。既存E2E 6件が壊れないことも確認する。
- 停止条件: E2E内からMCPツールを直接叩く手段（既存specはIPC経由のUI操作が中心）が既存ハーネスに無く、新しい仕組み（テスト用MCPクライアントの追加等）が必要になった場合は、`docs/GOVERNANCE.md` §6の判断を仰ぐため管理者に確認する。
