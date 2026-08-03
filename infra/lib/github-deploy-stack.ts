import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

const GITHUB_ORG = "Tanar-tech";
const GITHUB_REPO = "hanamask";
const GITHUB_OIDC_PROVIDER_URL = "https://token.actions.githubusercontent.com";

// GitHub Actions（release.yml）がAWSへデプロイするためのOIDC連携スタック（docs/CICD.md §5）。
// 静的なアクセスキーを発行せず、リポジトリを sub クレームで縛ったAssumeRoleのみを許可する。
// このスタック自体は管理者がローカルから一度だけデプロイする（鶏卵問題のため）。
export class GithubDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // NOTE: OIDCプロバイダはアカウントに1つしか作れない。既に
    // token.actions.githubusercontent.com のプロバイダが存在する場合はこのブロックを
    // iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn() での参照に置き換えること
    // （旧 release-bucket-stack.ts と同じ注意点。デプロイ前に
    //  `aws iam list-open-id-connect-providers` で確認済みであること）。
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: GITHUB_OIDC_PROVIDER_URL,
      clientIds: ["sts.amazonaws.com"],
    });

    const deployRole = new iam.Role(this, "GithubDeployRole", {
      roleName: "hanamask-github-deploy",
      // NOTE: IAMのdescriptionはLatin-1の範囲しか受け付けないため英語で書く（日本語だとCREATE_FAILED）
      description: "hanamask: CDK deploy role assumed by GitHub Actions (release.yml) via OIDC",
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_ORG}/${GITHUB_REPO}:*`,
        },
      }),
    });

    // CDKデプロイの実権限はbootstrap済みのcdk-*ロール側にある。
    // このロール自体にはAssumeRoleと、release.ymlが直接呼ぶ最小限のAPIのみ与える。
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadStackOutputs",
        actions: ["cloudformation:DescribeStacks"],
        resources: [
          // 本体・プレビュー（HanamaskPreviewStack-pr-*）の両方を許可
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/Hanamask*/*`,
          // DomainStackはACM証明書がus-east-1必須のためCloudFront用証明書をそこで発行する（docs/AWS.md）
          `arn:aws:cloudformation:us-east-1:${this.account}:stack/HanamaskDomainStack/*`,
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "InvokeDbLambdas",
        actions: ["lambda:InvokeFunction"],
        // 本体マイグレーション(hanamask-migrate)、PRごとのマイグレーション
        // (hanamask-migrate-pr-*)、スキーマ破棄(hanamask-drop-schema)
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:hanamask-*`],
      }),
    );

    // pr-preview.yml の `cdk deploy --hotswap-fallback`（プレビューのみ・本番では未使用）用。
    // hotswapはCloudFormationの変更セットを経由せず、呼び出し元(このロール)自身の権限で
    // 現在のテンプレートと差分を取り、対象リソースを直接更新するため、bootstrap実行ロール
    // (cdk-*-cfn-exec-role)とは別にこのロールへの権限付与が必要（2026-07-28 PR#12で
    // --hotswap-fallback導入時に付け忘れていた不備の修正）。
    // プレビュースタック(HanamaskPreviewStack-pr-*)のみに限定する。
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "HotswapReadPreviewStackTemplate",
        actions: ["cloudformation:GetTemplate", "cloudformation:DescribeStackResources"],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/HanamaskPreviewStack-pr-*/*`,
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "HotswapUpdatePreviewLambdas",
        actions: [
          "lambda:GetFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
        ],
        resources: [
          // ApiFunction（CDK自動命名、スタック名で始まる）
          `arn:aws:lambda:${this.region}:${this.account}:function:HanamaskPreviewStack-pr-*`,
          // MigrationFunction（明示的な関数名）
          `arn:aws:lambda:${this.region}:${this.account}:function:hanamask-migrate-pr-*`,
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "HotswapUpdatePreviewCloudFrontFunction",
        // urlRewriteFunction（CloudFront Function、CDK自動命名でスタック名から始まる）
        actions: [
          "cloudfront:GetFunction",
          "cloudfront:DescribeFunction",
          "cloudfront:UpdateFunction",
          "cloudfront:PublishFunction",
        ],
        resources: [
          `arn:aws:cloudfront::${this.account}:function/HanamaskPreviewStack-pr-*`,
        ],
      }),
    );

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: deployRole.roleArn,
      description: "GitHubリポジトリ変数 AWS_DEPLOY_ROLE_ARN に設定する値",
    });
  }
}
