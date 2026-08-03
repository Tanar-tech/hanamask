# herdr によるサブエージェント並列運用

[herdr](https://herdr.dev) は、複数のAIコーディングエージェントCLIセッションをターミナル上のペイン/タブ/ワークスペースで並行管理するツール。各セッションの状態（idle / working / blocked）を追跡し、対応が必要なセッションをダッシュボードで可視化する。

本リポジトリでは、[docs/GOVERNANCE.md](GOVERNANCE.md) §7.1 で定義した開発要員の並列実行の主手段として採用する。開発管理者（Claude Code）が統括し、実装は主にCodex CLIセッション（[docs/CODEX.md](CODEX.md)）が担う。

## 前提

- Windows版は現時点で **beta/プレビュー版のみ**（安定版はLinux/macOS向け）。挙動が変わる可能性がある。
- 設定は user-level のみ（プロジェクトにコミットする設定ファイルは無い）。`%APPDATA%\herdr\config.toml`。
- herdrはVSCode拡張ではなく、ターミナル上で動作するTUIツール。VSCode上で使う場合は、VSCodeの統合ターミナル（Terminal）内で `herdr` を実行すればよい（マウス操作にも対応している）。

## インストール

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
```

インストール後は新しいPowerShellウィンドウで `herdr` コマンドが使用可能になる（PATHは今後のセッション向けに更新される）。

バージョン確認:

```powershell
herdr --version
```

## エージェント連携のセットアップ（各開発者が個別に実施）

herdrはスクリーン内容の推定でもエージェント状態を検出できるが、正確なセッション状態を報告させるには連携フックを入れる。

```powershell
herdr integration install codex   # 開発要員として使うCodex CLI（docs/CODEX.md）
herdr integration install claude  # Claude Code CLIセッションを直接使う場合
```

`codex` 連携は `~/.codex/config.toml`・`~/.codex/hooks.json` を、`claude` 連携は `~/.claude/settings.json`・`~/.claude/hooks/` を変更する。**特にClaude Code自身の権限・監督面に関わる変更のため、各自の判断で実行すること**（開発管理者が自動実行することはない。[docs/GOVERNANCE.md](GOVERNANCE.md) §7.1参照）。

不要になった場合はそれぞれ `herdr integration uninstall codex` / `herdr integration uninstall claude` で削除できる。

## 基本ワークフロー

1. タスクごとに独立した worktree を作成する。

   ```powershell
   git worktree add ../work-manager-<task-name> -b feature/<task-name>
   ```

2. herdrでそのworktreeに対応するCodex CLIセッションを起動する（実装は主にCodexが担当。[docs/CODEX.md](CODEX.md)）。

   ```powershell
   herdr agent start <task-name> --cwd ..\work-manager-<task-name> --split right -- codex
   ```

   Claude Code CLIセッションを使いたい場合は末尾を `-- claude` に変える。

3. herdrのダッシュボードで各セッションの状態を確認する。`working` 中は待ち、`blocked`（確認待ち等）や `idle`（完了）になったセッションから順に対応する。
4. セッションが完了したら、開発管理者が差分をレビューする（[docs/GOVERNANCE.md](GOVERNANCE.md) §5）。
5. レビュー後、PR経由で `main` にマージし、worktreeを削除する。

   ```powershell
   git worktree remove ../work-manager-<task-name>
   ```

## 注意事項

- 同時に走らせるセッション数は、担当領域が重複しない範囲に収める（[docs/GOVERNANCE.md](GOVERNANCE.md) §7）。
- 各セッションへの指示は、タスクの目的・背景・完了条件を明示する。委任範囲外の判断が必要になった場合はセッション側で作業を止めて報告させる。
- 機密情報をタスク指示に含めない。
