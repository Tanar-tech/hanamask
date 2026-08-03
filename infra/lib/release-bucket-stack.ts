import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

const GITHUB_ORG = "Tanar-tech";
const GITHUB_REPO = "work-manager";
const GITHUB_OIDC_PROVIDER_URL = "https://token.actions.githubusercontent.com";

/**
 * work-manager の CI/CD 専用スタック。
 * アプリケーション自体はローカル動作の Windows デスクトップアプリであり、
 * このスタックは「ビルド成果物(exe/zip)をS3に保存・配布する」用途に限定する
 * （アプリのバックエンドではない。docs/CICD.md 参照）。
 */
export class ReleaseBucketStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const releaseBucket = new s3.Bucket(this, "ReleaseBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // 誤操作でスタックごと削除してもリリース資産を失わないよう保持する。
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GitHub Actions の OIDC プロバイダ。
    // NOTE: 同一AWSアカウントで他プロジェクトが既に
    // token.actions.githubusercontent.com のOIDCプロバイダを作成済みの場合、
    // 重複作成でデプロイが失敗する。その場合はこのブロックを削除し、
    // iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn() で既存のものを参照すること。
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: GITHUB_OIDC_PROVIDER_URL,
      clientIds: ["sts.amazonaws.com"],
    });

    // release.yml から assume する最小権限ロール。
    // 対象リポジトリ以外からは assume できないよう sub クレームで縛る。
    const releaseRole = new iam.Role(this, "GitHubActionsReleaseRole", {
      roleName: "work-manager-github-actions-release",
      description: "release.yml がビルド成果物をS3にアップロードするための最小権限ロール",
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_ORG}/${GITHUB_REPO}:*`,
        },
      }),
    });

    releaseBucket.grantReadWrite(releaseRole);

    new cdk.CfnOutput(this, "ReleaseBucketName", {
      value: releaseBucket.bucketName,
      description: "release.yml の AWS_RELEASE_BUCKET リポジトリ変数に設定する値",
    });
    new cdk.CfnOutput(this, "ReleaseRoleArn", {
      value: releaseRole.roleArn,
      description: "release.yml の AWS_ROLE_ARN リポジトリ変数に設定する値",
    });
  }
}
