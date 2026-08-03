# hanamask

仕様検討中。work-manager（別リポジトリ）を土台に、Next.js(App Router/TypeScript) + PostgreSQL + Prisma + Stripe + Tailwind CSS の最小構成のみを引き継いでいる。機能要件・体制ルールは仕様確定後に `docs/` を書き換える。

## セットアップ（開発者向け）

前提: Node.js 20+、PostgreSQL（ローカルはDocker等で用意。`docker compose up -d db` が使える）。

```bash
npm ci
cp .env.example .env.local   # DATABASE_URL 等を編集する
npm run dev:api               # APIサーバー（:3001）
npm run dev                   # フロントエンド（:3000、別ターミナルで）
```

モデル定義後は `npx prisma migrate dev` でマイグレーションを作成する。

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

## デプロイ（AWS・未着手）

infra/ にwork-manager由来のAWSサーバーレス構成（CloudFront+S3 / API Gateway+Lambda / Aurora Serverless v2）のCDKコードが残っているが、スタック名・ドメイン名がwork-manager用のままのため、実デプロイ前にhanamask向けへの書き換えが必要（要対応、下記参照）。
