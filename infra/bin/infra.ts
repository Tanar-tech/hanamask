#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ReleaseBucketStack } from "../lib/release-bucket-stack";
import { WebAppStack } from "../lib/web-app-stack";
import { GithubDeployStack } from "../lib/github-deploy-stack";
import { DomainStack } from "../lib/domain-stack";
import { PreviewStack } from "../lib/preview-stack";

const app = new cdk.App();

// AWSアカウントID。DomainStack(us-east-1)とWebAppStack(ap-northeast-1)間のクロスリージョン
// 参照（crossRegionReferences）には両スタックで同一アカウントの明示的なenvが必要なため固定する。
const AWS_ACCOUNT_ID = "284133227933";
const APP_REGION = "ap-northeast-1";
const APP_DOMAIN_NAME = "hanamask.dev.takudon3.com";
const PREVIEW_WILDCARD_DOMAIN = "*.preview.dev.takudon3.com";
// takudon3.com は既にこのAWSアカウントのRoute53ホストゾーンが権威DNSとして稼働中
// （2026-07-27確認。`aws route53 list-hosted-zones-by-name --dns-name takudon3.com` で取得）。
const EXISTING_HOSTED_ZONE_ID = "Z0270523VQ25VNEZA7RR";
const EXISTING_HOSTED_ZONE_NAME = "takudon3.com";

// PRプレビュー環境（docs/AWS.md「PRプレビュー環境」）。
// `cdk deploy -c prNumber=123 -c vpcId=... -c ...` のようにコンテキストが渡されたときのみ
// PreviewStackをインスタンス化する。値はpr-preview.ymlがWebAppStack/DomainStackの
// describe-stacks出力から取得して渡す（本体スタックのデプロイ時にはprNumber未指定で影響しない）。
const prNumber = app.node.tryGetContext("prNumber") as string | undefined;
if (prNumber) {
  if (!/^[0-9]+$/.test(prNumber)) {
    throw new Error(`prNumber は数字のみ指定できます: ${prNumber}`);
  }
  const ctx = (key: string): string => {
    const value = app.node.tryGetContext(key) as string | undefined;
    if (!value) {
      throw new Error(`PreviewStackに必要なコンテキスト -c ${key}=... が指定されていません。`);
    }
    return value;
  };
  new PreviewStack(app, `HanamaskPreviewStack-pr-${prNumber}`, {
    env: { account: AWS_ACCOUNT_ID, region: APP_REGION },
    description: `hanamask: PR #${prNumber} プレビュー環境`,
    prNumber,
    domainName: `pr-${prNumber}.preview.dev.takudon3.com`,
    hostedZoneId: EXISTING_HOSTED_ZONE_ID,
    hostedZoneName: EXISTING_HOSTED_ZONE_NAME,
    previewCertArn: ctx("previewCertArn"),
    vpcId: ctx("vpcId"),
    isolatedSubnetIds: ctx("isolatedSubnetIds").split(","),
    availabilityZones: ctx("availabilityZones").split(","),
    previewLambdaSgId: ctx("previewLambdaSgId"),
    dbEndpoint: ctx("dbEndpoint"),
    dbSecretArn: ctx("dbSecretArn"),
  });
  // プレビューデプロイ時は本体スタックを合成対象にしない（describe-stacks値のみで完結させる）。
} else {
  // 旧: Windowsデスクトップアプリ時代のビルド成果物配布用（docs/CICD.md §9）。
  new ReleaseBucketStack(app, "HanamaskReleaseBucketStack", {
    description:
      "hanamask: CI/CDのビルド成果物配布用S3バケットと、GitHub Actionsから使うOIDCロール",
  });

  // カスタムドメイン（2026-07-24 /goal指示）。CloudFront用ACM証明書はus-east-1必須のため
  // WebAppStackとは別リージョン。詳細は docs/AWS.md、infra/lib/domain-stack.ts 参照。
  const domainStack = new DomainStack(app, "HanamaskDomainStack", {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    crossRegionReferences: true,
    description:
      "hanamask: カスタムドメイン用ACM証明書（us-east-1固定。ホストゾーンは既存takudon3.comを参照）",
    hostedZoneId: EXISTING_HOSTED_ZONE_ID,
    hostedZoneName: EXISTING_HOSTED_ZONE_NAME,
    appDomainName: APP_DOMAIN_NAME,
    previewWildcardDomainName: PREVIEW_WILDCARD_DOMAIN,
  });

  // Webアプリ本体（CloudFront+S3 / API Gateway+Lambda / Aurora Serverless v2。docs/AWS.md）
  new WebAppStack(app, "HanamaskWebAppStack", {
    env: { account: AWS_ACCOUNT_ID, region: APP_REGION },
    crossRegionReferences: true,
    description:
      "hanamask: Webアプリ本体（CloudFront+S3静的フロント、API Gateway+LambdaバックエンドAPI、Aurora Serverless v2）",
    domainName: APP_DOMAIN_NAME,
    certificate: domainStack.certificate,
    hostedZone: domainStack.hostedZone,
  });

  // GitHub ActionsからのCDKデプロイ用OIDCロール（管理者がローカルから一度だけデプロイする）
  new GithubDeployStack(app, "HanamaskGithubDeployStack", {
    description: "hanamask: GitHub Actions(release.yml/pr-preview.yml)用のOIDCプロバイダとデプロイロール",
  });
}
