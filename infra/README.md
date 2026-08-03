# work-manager infra (AWS CDK)

work-manager 本体は AWS を使わない、ローカル動作の Windows デスクトップアプリ。ここは
**CI/CDのビルド成果物（exe/zip）をS3に保存・配布する**用途に限定したAWSリソースのみを扱う
（詳細は [docs/CICD.md](../docs/CICD.md) §10）。

## 構成

- `ReleaseBucket`: バージョニング有効・非公開のS3バケット。ビルド成果物を格納する。
- `GitHubOidcProvider` / `GitHubActionsReleaseRole`: GitHub Actions がAWSの長期クレデンシャルを持たずに
  OIDCでこのロールを assume し、`ReleaseBucket` にのみ read/write できるようにする最小権限ロール。

## 前提

- Node.js 18+ と AWS CLI がローカルにインストールされていること。
- デプロイを行う管理者の環境で `aws configure`（または SSO）により、対象AWSアカウントの認証情報が設定されていること。
- 本スタックのデプロイ・OIDCロール作成は `docs/GOVERNANCE.md` §6「外部サービス・APIキー・シークレットに関わる設定」に該当するため、**管理者が実行する**（開発管理者が自動実行することはない）。

## セットアップ手順（管理者が実施）

```powershell
cd infra
npm install

# 初回のみ：対象アカウント/リージョンにCDK実行用リソースを準備する
npx cdk bootstrap

# 差分確認
npx cdk diff

# デプロイ
npx cdk deploy
```

デプロイ完了後、出力される以下の値を GitHub リポジトリの Settings → Secrets and variables → Actions に
**Repository variables** として登録する。

| CDK Output | GitHub Actions 変数名 |
|---|---|
| `ReleaseBucketName` | `AWS_RELEASE_BUCKET` |
| `ReleaseRoleArn` | `AWS_ROLE_ARN` |

加えて `AWS_REGION`（デプロイしたリージョン、例: `ap-northeast-1`）も変数として登録する。

これらの変数が設定されるまで、`release.yml` のS3アップロードステップは自動的にスキップされる
（`docs/CICD.md` §10 参照）。

## 既存のOIDCプロバイダとの衝突について

同一AWSアカウントで既に別プロジェクトが `token.actions.githubusercontent.com` のOIDCプロバイダを
作成している場合、本スタックのデプロイは `EntityAlreadyExists` エラーで失敗する。その場合は
`lib/release-bucket-stack.ts` の `GitHubOidcProvider` 生成部分を削除し、
`iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn()` で既存プロバイダのARNを参照する形に変更すること。

## 削除する場合

```powershell
npx cdk destroy
```

`ReleaseBucket` は `RemovalPolicy.RETAIN` を設定しているため、スタックを削除してもバケットとリリース資産は残る。
完全に削除したい場合は、スタック削除後に手動でバケットを空にしてから削除する。
