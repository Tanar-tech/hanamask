# Loop Safety — hanamask

Loop engineering の実践にあたり、自律ループ（`/loop` や自動起動されるスキル・サブエージェント）に許可する範囲を定義する。詳細な体制・承認ルールは [GOVERNANCE.md](GOVERNANCE.md) を参照。ここでは「ループ実行時」に限定した denylist/allowlist を定める。

## Denylist（ループが触れてはいけないパス）

- **利用者の実データ**（`app.getPath("userData")` 配下。Windowsでは `%APPDATA%\hanamask\`）。DB本体・画像・APIキーの保管先であり、**書き換えると復旧できない**。テスト・E2Eは `HANAMASK_DB_PATH` で必ず別のDBを指す（画像・バックアップ・設定もそのDBの隣に置かれる。2026-08-10以前はDBだけが別で、**画像は実データのディレクトリを指していた**）
- `src/main/db/migrations.ts` の **既存**エントリ。追記はしてよいが、既に配布された項目の書き換え・並べ替えは利用者のDBを壊す（[MIGRATIONS.md](MIGRATIONS.md) §2）
- `src/main/db/schema.sql` の**単独**変更。マイグレーションを伴わない列追加は、新規インストールでだけ正しく動き既存利用者を取り残す（同 §1）
- `.github/workflows/`（CI/CD定義）。**ただし管理者がCI・リリースの整備を明示的に指示した場合はその範囲で編集してよい**（2026-08-10 追記。リリースパイプラインの構築を指示された際、この行と実際の作業が食い違ったため明文化した）。指示の無い自発的な変更は引き続き禁止
- 秘匿情報を含みうるファイル全般（credentials, secrets, `*.pem`, `*.key`）、および `.env`, `.env.*`（`.env.example` を除く）

> 2026-08-10 改訂。旧版は `infra/` と `prisma/migrations/` を挙げていたが、**いずれもこのリポジトリに存在しない**（AWS構成の廃止・PrismaではなくSQLite直接利用のため）。存在しないパスを守っても意味がなく、実際に危険な上記が漏れていた。

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
