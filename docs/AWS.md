# AWS デプロイ構成（スモールスタート）

> 2026-07-24: 管理者の /goal 指示により、ホスティングを AWS のサーバーレス最小構成
> （CloudFront+S3 / API Gateway+Lambda / Aurora Serverless）とすることが決定した。
> 本書はその構成・コードとの対応・デプロイ手順を定義する。
> 実デプロイ・課金を伴う操作は docs/GOVERNANCE.md §6 に該当し管理者が実施する。

## 1. アーキテクチャ

```
利用者ブラウザ
   │ https（https://work-manager.dev.takudon3.com）
   ▼
CloudFront（単一ドメイン・同一オリジン）
   ├─ デフォルトビヘイビア ──▶ S3（Next.js静的エクスポート out/、OAC経由・非公開バケット）
   │    ※CloudFront Functionで /dashboard → /dashboard.html にURI書き換え
   └─ /api/* ────────────────▶ API Gateway (HTTP API)
                                  │
                                  ▼
                               Lambda（dist/lambda/ = src/server/lambda.ts のesbuildバンドル）
                                  │ VPC内・PRIVATE_ISOLATED
                                  ▼
                               Aurora Serverless v2 (PostgreSQL 16, 0.5〜1 ACU)
```

- **同一オリジン方式**: フロントは相対パス `fetch("/api/...")` でAPIを呼ぶ。CloudFrontが
  `/api/*` をAPI Gatewayへルーティングするため、CORS設定が不要で、セッションは
  HttpOnly Cookie のまま運用できる。ローカル開発では next dev の rewrites が同じ役割を担う
  （next.config.mjs）。
- **認証**: NextAuthはサーバー常駐が前提で静的エクスポートと両立しないため、
  自前のセッショントークン（HS256 JWT、node:cryptoのみで実装 = 追加依存なし）+
  HttpOnly Cookie に置き換えた（src/server/token.ts, src/server/handlers/auth.ts）。
- **DB**: Aurora Serverless v2 はPostgreSQL互換のためPrismaはそのまま。Lambda用に
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]` を追加（prisma/schema.prisma）。
  接続数はLambda同時実行分だけ増えるため `connection_limit=1` を接続文字列に付与。
  規模拡大時はRDS Proxyの導入を検討する。

## 2. コード構成との対応

| レイヤ | コード | AWSリソース |
|---|---|---|
| フロントエンド | `src/app/`（全ページ静的化済み） | S3 + CloudFront。`npm run build` で `out/` に静的エクスポート |
| API | `src/server/`（フレームワーク非依存のハンドラ層） | Lambda + API Gateway。`npm run build:lambda` で `dist/lambda/` にバンドル |
| APIアダプタ | `src/server/lambda.ts`（本番） / `src/server/local.ts`（ローカル:3001） | ─ |
| DB | `prisma/schema.prisma` | Aurora Serverless v2 |
| IaC（本体） | `infra/lib/web-app-stack.ts`（WorkManagerWebAppStack、ap-northeast-1） | 上記すべて |
| IaC（ドメイン） | `infra/lib/domain-stack.ts`（WorkManagerDomainStack、us-east-1固定） | Route53ホストゾーン・ACM証明書 |

### カスタムドメイン（2026-07-24 /goal指示）

- アプリURL: `https://work-manager.dev.takudon3.com`
- CloudFront用ACM証明書は**us-east-1固定**という制約があるため、WebAppStack（ap-northeast-1）とは
  別スタック（WorkManagerDomainStack、us-east-1）に分離し、CDKの `crossRegionReferences` で
  証明書・ホストゾーンをWebAppStackへ橋渡ししている（`infra/bin/infra.ts`）。
- `takudon3.com` は既にこのAWSアカウント（284133227933）のRoute53ホストゾーン
  （`Z0270523VQ25VNEZA7RR`）が権威DNSとして稼働中（2026-07-27確認: ゾーンのNSレコードと
  公開DNS解決結果が一致）。そのため新規サブドメイン委任は不要で、DomainStackは既存ゾーンを
  `HostedZone.fromHostedZoneAttributes` で参照し、そこに直接ACM証明書のDNS検証レコードと
  `work-manager.dev.takudon3.com` のA/AAAAエイリアスレコードを追加する（レジストラ側の作業不要）。
- ゾーンID・ゾーン名は `infra/bin/infra.ts` の `EXISTING_HOSTED_ZONE_ID`/`EXISTING_HOSTED_ZONE_NAME`
  に定数として持つ。ドメイン移管等で変わった場合はここを更新する。

APIエンドポイント一覧は `src/server/app.ts` のルート定義を正とする。

## 3. デプロイ手順

### 通常デプロイ: GitHub Actions（2026-07-24 /goal指示でCI/CD化）

GitHub Actions の `Deploy` ワークフロー（release.yml）を `workflow_dispatch` で起動する。
テスト → ビルド（静的フロント/APIバンドル/マイグレーションバンドル）→ OIDCでAssumeRole →
`cdk deploy WorkManagerWebAppStack` → マイグレーションLambda invoke まで自動実行される。

初回セットアップ（管理者・ローカルから一度だけ。鶏卵問題のためOIDCロールは手動デプロイ）:

```powershell
npm ci; npm run build; npm run build:lambda; npm run build:migrate
cd infra
npm ci
npx cdk bootstrap aws://<account-id>/ap-northeast-1   # WebAppStack用
npx cdk bootstrap aws://<account-id>/us-east-1        # DomainStack用（CloudFront証明書がus-east-1必須なため別途必要）
npx cdk deploy WorkManagerGithubDeployStack           # OIDCプロバイダ+デプロイロール
gh variable set AWS_DEPLOY_ROLE_ARN --body "<出力されたDeployRoleArn>"
```

- production Environment の Required reviewers（承認ゲート）はGitHub側設定（docs/CICD.md §6）。
- カスタムドメインは既存のtakudon3.comホストゾーンを直接使うため、DNS委任等の追加の手動作業は不要
  （§2「カスタムドメイン」参照）。ACM証明書のDNS検証はスタック内で自動完了する。

### 手動デプロイ（フォールバック）

```powershell
cd infra
npx cdk deploy WorkManagerWebAppStack
aws lambda invoke --function-name work-manager-migrate out.json
```

- デプロイ完了時の出力 `CloudFrontUrl` がアプリのURL。
- 静的アセットは `out/` が存在する場合のみ自動アップロードされる（BucketDeployment）。

## 4. DBマイグレーション（2026-07-24 /goal指示で「マイグレーションLambda」方式に決定）

AuroraはPRIVATE_ISOLATEDサブネットにあり、外部から直接 `prisma migrate deploy` を
実行できないため、**マイグレーションLambda**（`work-manager-migrate`）で適用する。

- `npm run build:migrate`（scripts/build-migrate-lambda.mjs）が prisma CLI・スキーマ・
  `prisma/migrations/` 一式を `dist/migrate/` に同梱する（Lambda用スキーマエンジンは
  `PRISMA_CLI_BINARY_TARGETS=rhel-openssl-3.0.x` で取得）。
- WebAppStack がこれをVPC内Lambdaとしてデプロイし、GitHub Actionsのデプロイジョブが
  `cdk deploy` 後に同期invokeして `prisma migrate deploy` を実行する（release.yml）。
  失敗時はレスポンスの `FunctionError` を検知してジョブを失敗させる。
- 手動で適用したい場合: `aws lambda invoke --function-name work-manager-migrate out.json`

## 4.5 PRプレビュー環境（2026-07-27 /goal指示）

PRを発行するごとに、そのPRのコードが動作する独立した検証環境が自動で立ち上がる
（`.github/workflows/pr-preview.yml`、docs/GOVERNANCE.md §3.1）。URLは
`https://pr-<PR番号>.preview.dev.takudon3.com`。

### 構成

本番のWebAppStackと同型（CloudFront+S3 / API Gateway+Lambda）のスタック `PreviewStack`
（`infra/lib/preview-stack.ts`）をPRごとに `WorkManagerPreviewStack-pr-<番号>` として作成する。
ただし以下は**共有リソースを再利用**する:

| 共有するもの | 実体 | 受け渡し |
|---|---|---|
| VPC・サブネット | WebAppStackのVPC | WebAppStackのCfnOutput（`SharedVpcId` 等） |
| DB | 単一Auroraクラスタ | 同上（`SharedDbEndpoint`/`SharedDbSecretArn`） |
| Auroraへの接続許可 | 共有SG `PreviewLambdaSg`（Aurora ingressを1度だけ許可） | `SharedPreviewLambdaSgId` |
| TLS証明書 | ワイルドカード `*.preview.dev.takudon3.com`（us-east-1、DomainStack） | `PreviewCertificateArn` |
| DNS | 既存 takudon3.com ホストゾーン | infra/bin/infra.ts の定数 |

共有情報は `pr-preview.yml` が `aws cloudformation describe-stacks` で読み取り、
`cdk deploy -c prNumber=... -c vpcId=... -c dbSecretArn=...` のようにコンテキストで
PreviewStackへ渡す。これによりCDKのクロススタックExport依存・トークン・synth時ルックアップを
持ち込まず、PRごとのスタックを本体スタックから独立して生成/破棄できる。

### DB分離（単一Aurora内のスキーマ分離）

- PRごとにPostgreSQLスキーマ `pr_<PR番号>` を作成し、そのスキーマにのみPRのデータを置く。
- プレビューのAPI/マイグレーションLambdaの `DATABASE_URL` に `?schema=pr_<番号>` を付与し、
  Prismaの search_path をそのスキーマに切り替える（アプリコードは変更不要）。
- マイグレーションLambda（`work-manager-migrate-pr-<番号>`）は
  `CREATE SCHEMA IF NOT EXISTS "pr_<番号>"` → `prisma migrate deploy` をそのスキーマに適用する。
- PRクローズ時、共有Lambda `work-manager-drop-schema` を `{"schema":"pr_<番号>"}` でinvokeし
  `DROP SCHEMA ... CASCADE` する（スキーマ名は `pr_<数字>` のみ許可＝誤削除・インジェクション防止）。
- アイドル時コストはほぼゼロ（Aurora共有、Lambda/APIGW/CloudFrontは従量、S3は小容量）。

### 初回ロールアウト（管理者・一度だけ）

プレビュー機構を有効化するには、共有側の変更を本番へ反映しておく必要がある:

1. 本ブランチをベースに Deploy ワークフロー（release.yml）を実行し、WebAppStack（共有SG・
   drop-schema Lambda・共有Output追加）と DomainStack（ワイルドカード証明書追加）を更新する。
2. `npx cdk deploy WorkManagerGithubDeployStack`（OIDCロールにプレビュー用の
   `lambda:InvokeFunction`（`work-manager-*`）と `DescribeStacks`（`WorkManager*`）を付与）。

以後、PRを開くたびにプレビューが自動で立ち上がる。

### 制約・留意点

- スピンアップ時間: PR新規作成時はCloudFront作成に数分かかる。同一PRへの追加pushは
  S3/Lambda更新のみで高速。破棄はPRクローズ時に非同期実行される。
- 全プレビューが1つのAurora（0.5〜1 ACU）を共有するため、多数同時稼働時はDB容量に注意。
- `pull_request` はTanar-tech組織内ブランチからの発行を前提（OIDCの sub 条件
  `repo:Tanar-tech/work-manager:*`）。外部フォークからのプレビューは想定しない。

## 4.6 コスト最適化: Aurora業務時間外停止（2026-08-01 /goal指示）

Aurora Serverless v2は稼働中である限り最小0.5ACU分が常時課金されるため、業務時間（平日9:00-17:00 JST）
以外はクラスタ自体を停止し、コストが発生しないようにしている（`infra/lib/web-app-stack.ts` の
`AuroraStartSchedule`/`AuroraStopSchedule`、EventBridge Rule + `RDS:StartDBCluster`/`StopDBCluster`）。

- **起動**: 平日 9:00 JST（`cron(0 0 ? * MON-FRI *)`、UTC換算で日付またぎなし）
- **停止**: 平日 17:00 JST（`cron(0 8 ? * MON-FRI *)`）
- **週末**: 金曜17:00の停止のまま月曜9:00まで継続（RDSの自動再開上限7日以内に収まるため追加対応不要）
- **影響範囲**: 本番アプリ・PRプレビュー環境は単一Auroraを共有しているため、両方とも業務時間外は
  アクセス不可（Lambda→Auroraの接続がタイムアウトする）になる。業務時間外にPRを検証したい場合や、
  マイグレーションLambdaを手動invokeしたい場合は、事前に管理者が
  `aws rds start-db-cluster --db-cluster-identifier <cluster-id>` で手動起動する必要がある。
- **ストレージ課金**: 停止中もストレージ課金は継続する（コンピュート＝ACU課金のみ停止）。

## 5. 割り切り・今後の課題（管理者と要相談）

### Aurora PostgreSQL 17 へのメジャーアップグレード（要計画・管理者実施）

2026-07-28のパッケージ更新では、Aurora は16系最新（16.13）に据え置いた。CDKがサポートする最新は17.7。
17へのメジャーアップグレードは稼働中クラスタへの破壊的操作（ダウンタイムあり）のため、
ルーチンのデプロイに混ぜず、メンテナンスウィンドウを設けて計画的に実施する（稼働最優先）。手順の要点:

1. 事前に手動スナップショットを取得する（`aws rds create-db-cluster-snapshot`）。
2. `infra/lib/web-app-stack.ts` の `AuroraPostgresEngineVersion.VER_16_13` を `VER_17_7` に変更し、
   `DatabaseCluster` に `allowMajorVersionUpgrade` 相当の設定を加える（L2で未対応なら
   `node.defaultChild` への `addPropertyOverride("AllowMajorVersionUpgrade", true)` エスケープハッチ）。
   クラスタパラメータグループのファミリ（`aurora-postgresql16`→`17`）変更が必要になる場合がある。
3. まずPRプレビュー環境や別リージョンで試すか、`cdk diff` で影響範囲を確認してから本番Deployを実行する。
4. アップグレード中は数分のダウンタイムが発生しうる。Prismaは PostgreSQL 17 対応済み（アプリ側変更不要）。



- **シークレットの受け渡し**: DATABASE_URL / AUTH_SECRET はCloudFormation動的参照で
  Lambda環境変数に展開している（テンプレートに平文は残らないがコンソールでは閲覧可）。
  規模拡大時は実行時のSecrets Manager取得 or RDS Proxy + IAM認証へ移行する。
- **NATゲートウェイなし**: LambdaはVPC内から外部APIを呼べない。Stripe連携（docs/REQUIREMENTS.md
  §4.8）を実装する際はNATゲートウェイ追加（月額コスト増）が必要になるため管理者に確認する。
- **WAF**: 未設定。商用リリース前に管理者が判断する（カスタムドメイン・ACM証明書は設定済み §2）。
- **release.yml の具体化**: ビルド〜cdk deployのCI/CD化はCI/CD設定変更（docs/GOVERNANCE.md §6）
  のため管理者承認のうえ実施する。
- **旧 WorkManagerReleaseBucketStack**: 旧デスクトップアプリ配布用。要否は管理者判断待ち
  （docs/CICD.md §9）。
