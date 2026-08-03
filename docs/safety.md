# Loop Safety — hanamask

Loop engineering の実践にあたり、自律ループ（`/loop` や自動起動されるスキル・サブエージェント）に許可する範囲を定義する。詳細な体制・承認ルールは [GOVERNANCE.md](GOVERNANCE.md) を参照。ここでは「ループ実行時」に限定した denylist/allowlist を定める。

## Denylist（ループが触れてはいけないパス）

- `.env`, `.env.*`（`.env.example` を除く）
- `infra/`（IaC・デプロイ設定。変更は管理者承認が必要 — GOVERNANCE.md §6）
- `.github/workflows/`（CI/CD定義）
- `prisma/migrations/`（適用済みDBマイグレーション）
- 秘匿情報を含みうるファイル全般（credentials, secrets, *.pem, *.key）

## Allowlist（L1 report-only ループが自律的に行ってよいこと）

- `STATE.md` / `loop-run-log.md` の更新
- 読み取り専用の調査（`git log`, `git diff`, `git status`, lint/test の実行）
- Issue起票の**提案**（実際の作成はloop-constraints.mdで別途ゲート）

## Auto-merge policy

- 自動マージは行わない。PRは必ずdraftで作成し、管理者のレビューを経てから `git commit`, `git push` は自律実行可（グローバルCLAUDE.md Git Operations節）だが、`git merge`・`git rebase`・PRのマージ自体は管理者が実施する。
- 詳細は [loop-constraints.md](../loop-constraints.md) の binding ルールに従う。

## MCP / connector scope

- 現時点でこのリポジトリのループはMCPコネクタを使用しない（L1 report-onlyのため不要）。将来L2以降でGitHub MCP等を導入する場合は、read + comment のみのスコープに限定し、このファイルに追記する。

## Escalation path

- ループが3回連続で同じ修正を試みて失敗した場合、または `loop-constraints.md` の制約に抵触しそうな場合は、実行を停止し `STATE.md` の High Priority セクションに記録して人間に引き継ぐ（stall / no-progress検知）。
- 予算超過時は `loop-budget.md` の kill switch 手順に従う。
