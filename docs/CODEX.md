# Codex CLI（開発要員）のセットアップと運用

[OpenAI Codex CLI](https://github.com/openai/codex) をターミナル上で動作する開発要員（実装担当）として使う。[docs/GOVERNANCE.md](GOVERNANCE.md) §2 の体制における「開発管理者（Claude Code） が統括し、Codexが実装する」役割分担の実体。

## 前提

- ChatGPT Plus / Pro / Business / Edu / Enterprise のいずれかのプランが必要（Codex CLI自体は追加課金なしで含まれる）。
- Windows対応は現時点で実験的（experimental）扱い。
- herdr（[docs/HERDR.md](HERDR.md)）と組み合わせて、worktreeごとに独立したCodexセッションを並列起動する運用を基本とする。

## インストール

npm経由でインストールする（Node.js 22+ が必要）。

```powershell
npm install -g @openai/codex
codex --version
```

## ログイン（管理者が個別に実施）

Codexの認証は対話型のため、各自の環境で実行する。

```powershell
codex login
```

ChatGPTアカウントでのブラウザ認証フローが起動する。

## herdr連携のセットアップ

```powershell
herdr integration install codex
```

これは以下を行う（`~/.codex` 配下、Claude Codeの設定には触れない）:
- `~/.codex/herdr-agent-state.ps1` の書き込み
- `~/.codex/hooks.json` の更新
- `~/.codex/config.toml` の `[features] hooks = true` 設定

不要になった場合は `herdr integration uninstall codex` で削除できる。

## 開発管理者（Claude Code）とCodexの役割分担

- **開発管理者（Claude Code、通常Fableモデル）**: タスクの分解、Codexセッションへの指示、成果物のレビュー、`main` へのマージ判断、管理者への確認・報告。
- **開発要員（Codex）**: 割り当てられたタスクの実装・テスト。委任範囲を超える判断が必要な場合は作業を止めて報告する（[docs/GOVERNANCE.md](GOVERNANCE.md) §7）。

Codexへの指示は、[.cursor/agents/implementer.md](../.cursor/agents/implementer.md) と同等の方針（タスクの範囲厳守、YAGN、コメント最小限、`main`への破壊的操作をしない等）を踏まえて行う。ツールが異なるだけで、開発要員として遵守すべきルールはGOVERNANCE.md §7に準ずる。

## herdr経由での起動

```powershell
git worktree add ../work-manager-<task-name> -b feature/<task-name>
herdr agent start <task-name> --cwd ..\work-manager-<task-name> --split right -- codex
```

herdrのダッシュボードでCodexセッションの状態（idle/working/blocked）を確認し、完了したセッションから開発管理者がレビューする（[docs/HERDR.md](HERDR.md) の基本ワークフローに準ずる）。

## レビュー

Codexが「完了した」と報告した内容は、[docs/GOVERNANCE.md](GOVERNANCE.md) §5 のレビュー運用に従い、開発管理者が実際の差分・動作を確認してから採用する。申告を鵜呑みにしない。

## 注意事項

- 機密情報をタスク指示に含めない。
- 同時に走らせるCodexセッション数は、担当領域が重複しない範囲に収める（[docs/GOVERNANCE.md](GOVERNANCE.md) §7）。
- `~/.codex` の設定変更は開発管理者が自動で行わない。変更が必要な場合は管理者に確認する（[docs/GOVERNANCE.md](GOVERNANCE.md) §7.1）。
