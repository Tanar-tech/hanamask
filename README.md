# work-manager

タスク管理と工数管理を一体化したWebアプリケーション（SaaS）。詳細な機能要件は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)、体制・運用ルールは [docs/GOVERNANCE.md](docs/GOVERNANCE.md) を参照。

> 2026-07-23: Windowsデスクトップアプリ（.NET/WPF・WinUI3）方針からWebアプリケーション（SaaS）へ転換した。旧方針の資産（`scripts/*.ps1`、`infra/lib/release-bucket-stack.ts`）は当面参考資料として残置している（docs/CICD.md §9）。

## クイックスタート（動作確認用・ワンコマンド）

前提: Node.js 20+ のみ（PostgreSQLはスクリプトが自動で用意する）。

PowerShell（Windowsターミナル）で:

```powershell
./scripts/dev.ps1
```

これだけで以下がすべて自動実行され、ブラウザで http://localhost:3000 を開けば動作確認できる。

1. PostgreSQLの用意（優先順: 稼働中のローカルDB → Docker → ポータブル版PostgreSQLを `%LOCALAPPDATA%\work-manager\` に自動セットアップ。システムには変更を加えない）
2. `.env.local` の自動生成（AUTH_SECRETも自動生成）
3. 依存関係インストール・DBマイグレーション・サンプルデータ投入
4. 開発サーバー起動（フロント :3000 と APIサーバー :3001 の2プロセス。フロントの `/api/*` はAPIサーバーへプロキシされる）

**動作確認用ログイン**: `admin@example.com` / `password123`（サンプルの組織・プロジェクト・前日分のタスク履歴が投入済み）

終了は `Ctrl+C`。DBも停止する場合は `./scripts/dev.ps1 -StopDb`。

## セットアップ（開発者向け・手動）

前提: Node.js 20+、PostgreSQL（ローカルはDocker等で用意。`docker compose up -d db` が使える）。

```bash
npm ci
cp .env.example .env.local   # DATABASE_URL 等を編集する
npx prisma migrate dev
npm run db:seed              # サンプルデータ投入（任意）
npm run dev:api              # APIサーバー（:3001）
npm run dev                  # フロントエンド（:3000、別ターミナルで）
```

## よく使うコマンド

```bash
npm run dev          # フロントエンド開発サーバー（:3000）
npm run dev:api      # APIサーバー（:3001。フロントの /api/* がここへプロキシされる）
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest（単体テスト）
npm run build        # 本番ビルド（S3配信用の静的エクスポート → out/）
npm run build:lambda # バックエンドのLambdaバンドル（→ dist/lambda/）
```

## デプロイ（AWS）

CloudFront+S3（フロント）/ API Gateway+Lambda（API）/ Aurora Serverless v2（DB）の
サーバーレス構成。アーキテクチャとデプロイ手順は [docs/AWS.md](docs/AWS.md) を参照
（実デプロイは管理者が実施）。CI/CD構成は [docs/CICD.md](docs/CICD.md) を参照。
