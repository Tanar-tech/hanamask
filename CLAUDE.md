# work-manager プロジェクト指示

このリポジトリの体制・運用ルールは [docs/GOVERNANCE.md](docs/GOVERNANCE.md) に、アプリケーションの要求定義は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) に定義されている。作業前に必ず参照すること。

コーディングスタイル・コメント方針・Git操作の一般ルール等、プロジェクト非依存の内容は `~/.claude/CLAUDE.md`（グローバル規約）に従う。本ファイルとdocs/にはプロジェクト固有の内容のみを記載する（矛盾する場合は本リポジトリ側を優先し、docs/GOVERNANCE.md §11.1 に既知の相違点を記録する）。

## 要点

- 体制: 管理者（ユーザー） / 開発管理者（このセッション、通常Fableモデル） / 開発要員（主にOpenAI Codex CLI。小規模タスクは会話内Agent toolやCursorサブエージェントも可）。
- `main` への破壊的操作、リリース、依存関係の大幅変更、アーキテクチャの不可逆な決定は事前に管理者の承認を得る（詳細は docs/GOVERNANCE.md §6）。
- 開発要員へタスクを委任する際は独立した worktree で作業させ、成果物は必ずレビューしてから採用する（docs/GOVERNANCE.md §7）。
- 複数タスクの並列実行は herdr（worktree単位の独立Codex/Claude Code CLIセッション、VSCode統合ターミナル内で動作）を主手段とする。セットアップ・使い方は docs/HERDR.md・docs/CODEX.md（docs/GOVERNANCE.md §7.1）を参照。herdr/Codex/Claude Code自体の設定変更（~/.codex, ~/.claude/settings.json等）は自動実行せず、必ず管理者に確認する。
- 1機能内での並列化（調査・実装・検証をこのセッション内でサブエージェント並列実行する）は下記「Parallel Subagent Framework」に従う。herdrがタスク単位（複数の独立した機能・修正を並列に進める）の並列化であるのに対し、こちらは1つの機能実装をフェーズ単位で並列化するもの。両者は排他ではなく併用できる（docs/GOVERNANCE.md §7.2）。
- コミットメッセージ規約・PRマージ方式（squash merge）・Git操作の自律実行は、いずれもグローバル規約（2026-07-29改訂）と一致している（差分のみdocs/GOVERNANCE.md §4、経緯は §11.1参照）。
- アプリはWebアプリケーション（SaaS）として構築する（2026-07-23、/goal指示によりWindowsデスクトップアプリ方針から転換）。技術スタック: Next.js(App Router/TypeScript) + PostgreSQL + Prisma + Auth.js + Stripe + Tailwind CSS（docs/GOVERNANCE.md §8、docs/REQUIREMENTS.md §5）。
- アプリの機能要件・未決定事項は docs/REQUIREMENTS.md を参照。特に §7 の未決定事項（プラン価格、ホスティング最終選定等）は商用リリース前に管理者へ確認する。
- ホスティングはAWSサーバーレス構成（CloudFront+S3 / API Gateway+Lambda / Aurora Serverless v2。2026-07-24 /goal指示で決定、docs/AWS.md参照）。本番URLは https://work-manager.dev.takudon3.com 。IaCは infra/lib/web-app-stack.ts。デプロイはGitHub Actions（release.yml、OIDC）。実デプロイ・課金関連の外部サービス契約は docs/GOVERNANCE.md §6 に該当し管理者が実施する。旧infra/（S3リリースバケット、ローカルexe配布用）は要否を含め管理者判断待ち（docs/CICD.md §9参照）。
- PRを発行するとPRごとの検証環境が自動で立ち上がる（`pr-<番号>.preview.dev.takudon3.com`）。単一Auroraをスキーマ `pr_<番号>` で分離。仕組みは docs/AWS.md「PRプレビュー環境」・docs/GOVERNANCE.md §3.1（2026-07-27 /goal指示）。

## エージェントチーム

`.claude/agents/` 配下のサブエージェント定義（`implementer.md` / `reviewer.md` / `verifier.md`）は、このリポジトリにおける開発管理者（このセッション）の「チームメンバー」として扱う。それぞれの `description` がそのメンバーの担当領域と起用条件を表す。

- タスクをサブエージェントに委任する際は、汎用の Agent 呼び出しをする前にまず `.claude/agents/` に適した役割が定義されていないか確認し、あればそれを優先して起用する（Agent tool の `subagent_type` に該当ファイルの `name` を指定する）。
- Parallel Subagent Framework のPhase 3/5では上記メンバーを並列起動する（下記参照）。フロー外の単発タスクでも、実装は `implementer`、レビューは `reviewer`、成果物の動作検証は `verifier` を同様に起用してよい。
- 新しい役割が恒常的に必要になった場合は、都度その場限りのAgent呼び出しで済ませず `.claude/agents/` にメンバーとして定義を追加することを検討し、管理者に提案する。

# Parallel Subagent Framework

1機能を実装するとき、調査・実装・検証をこのセッション内でサブエージェント並列実行するための骨格。参考: [Claude Codeを使った並列ループエージェント実装ガイド](https://qiita.com/kumai_yu/items/54ded70a5a68a5ca15d5)。

## 実施時のカスタマイズ
- テストコマンド: `npm test`（Vitest）
- Lintコマンド: `npm run lint`（ESLint）
- UIディレクトリ: `src/app/`（画面配下にコンポーネントを同居、`src/components/`は無し）/ API: `src/server/`（Lambda/ローカル共通ハンドラ。Next.jsの`app/api/`ルートは未使用）/ 共通ロジック: `src/lib/` / DB: `prisma/schema.prisma`

## フロー（骨格）
Phase 1 調査(並列) → Phase 2 仕様書(並列グループ宣言) → [停止① 人間レビュー] → Phase 3 実装(TDD・並列) → Phase 4 統合ゲート → Phase 5 検証(並列) → [停止② 構造化レビュー]

- Phase 1（調査・並列・読取専用）: Explore を用いて UI / データ取得 / DB の各領域を同時調査する。出力は箇条書きのみに絞りコンテキストを圧迫しない。
- Phase 2（仕様書・停止①）: skill「feature-spec」を発火し、調査結果から SPEC.md を生成する。Part 1（利用者向け・機能説明/画面イメージ/受け入れ条件）と Part 2（AI用・実装セット一覧と並列グループ宣言＝どのセットがどのファイルのみを触るか）の2部構成とする。Part 1 を管理者に提示し、承認を得るまで Phase 3 に進まない。
- Phase 3（実装・並列・TDD）: SPEC.md Part 2 の並列グループごとに `.claude/agents/implementer.md` を同時起動する。各グループは宣言されたファイルのみを編集し、共有ファイルには手を入れない。RED→GREEN→REFACTORで進め、失敗時の自己修正は3回まで、超過したら実装を止めて報告する。
- Phase 4（統合ゲート・逐次・単一エージェント）: 各グループの成果を結線する。共有ファイルの編集はこのフェーズでのみ行う。テストコマンドとLintコマンドを実行し、全体が緑になることを確認する。競合・重複を検出したらここで解消する。
- Phase 5（検証・並列・読取専用）: `.claude/agents/reviewer.md` を観点別（正しさ/仕様カバレッジ/重複・抜け漏れ/型・null安全性）に並列起動する。各レビュアーは指摘のみを箇条書きで返す。

## どのフェーズでどのスキルを呼ぶか
- Phase 2（仕様書）→ skill「feature-spec」を使う
- E2E・スクショが必要なとき（随時・フロー外）→ skill「e2e-runner」を使う
- Phase 5（検証）のあと → ユーザーに /structured-review を促して停止する

## 成果物の検証ルール（2026-07-24追記）
- 管理者に渡す実行手順・スクリプトは、渡す前に管理者と同一の方法（新規プロセス・ファイルとして実行）で成功を確認する。ステップの個別実行による代替確認は不十分（詳細は skill「e2e-runner」）。
- PowerShellスクリプト（.ps1）は必ずUTF-8 BOM付きで保存する。BOMなしだとWindows PowerShell 5.1が日本語コメントを文字化けさせ構文エラーになる（2026-07-24 scripts/dev.ps1 で実障害）。

## セーフティ機構（サーキットブレーカー）
- このフローを起動する際は完了条件と上限ターン数を明示する（例:「◯◯が全テスト緑になるまで、ただし20ターンで打ち切り」）。無条件に自走し続けない。
- Phase 3 の自己修正ループは1グループにつき3回まで。超過したら止めて報告する。
- テストの削除・無効化、アサーションを緩めることで「グリーンにする」ことは禁止。失敗は無視せず報告する。

## 絶対ルール
- 確認を求めるのは「仕様レビュー（停止①）」と「構造化レビュー（停止②）」の2箇所のみ。
- それ以外は止まらず自律的に進める。
- 停止①：仕様書を提示したら、人間が承認するまで Phase 3（実装）へ進まないこと。
- 停止②：構造化レビューは `/structured-review` で人間が起動するまで勝手に実行しないこと。
