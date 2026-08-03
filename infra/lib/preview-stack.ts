import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

// PRごとのプレビュー環境スタック（docs/AWS.md「PRプレビュー環境」、docs/GOVERNANCE.md §3）。
// 本番のWebAppStackと同型（CloudFront+S3 / API Gateway+Lambda）だが、VPC・Aurora・
// ワイルドカード証明書は共有リソースを再利用し、単一Auroraのスキーマ pr_<番号> に分離する。
//
// 共有リソースの識別子はすべてプレーン文字列としてpropsで受け取る（pr-preview.ymlが
// WebAppStack/DomainStackのdescribe-stacks出力をCDKコンテキストに渡す）。これによりCDKの
// クロススタックExport依存・トークン・synth時ルックアップを持ち込まず、PRごとの
// 生成/破棄を独立に行える。
export interface PreviewStackProps extends cdk.StackProps {
  /** PR番号（数字のみ） */
  prNumber: string;
  /** このプレビューのFQDN（例: pr-123.preview.dev.takudon3.com） */
  domainName: string;
  /** 既存ホストゾーン（takudon3.com） */
  hostedZoneId: string;
  hostedZoneName: string;
  /** ワイルドカード証明書ARN（*.preview.dev.takudon3.com、us-east-1。DomainStack出力） */
  previewCertArn: string;
  /** 共有VPC・サブネット・SG（WebAppStack出力） */
  vpcId: string;
  isolatedSubnetIds: string[];
  availabilityZones: string[];
  previewLambdaSgId: string;
  /** 共有Aurora接続情報（WebAppStack出力） */
  dbEndpoint: string;
  dbSecretArn: string;
}

export class PreviewStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PreviewStackProps) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, "..", "..");
    const staticSiteDir = path.join(repoRoot, "out");
    const lambdaBundleDir = path.join(repoRoot, "dist", "lambda");
    const migrateBundleDir = path.join(repoRoot, "dist", "migrate");
    for (const dir of [lambdaBundleDir, migrateBundleDir]) {
      if (!fs.existsSync(path.join(dir, "index.js"))) {
        throw new Error(
          `バンドルが見つかりません: ${dir}\n` +
            "リポジトリルートで npm run build / build:lambda / build:migrate を先に実行してください。",
        );
      }
    }

    const schema = `pr_${props.prNumber}`;

    // --- 共有リソースの参照（すべてプレーン文字列から復元） ---
    const vpc = ec2.Vpc.fromVpcAttributes(this, "SharedVpc", {
      vpcId: props.vpcId,
      availabilityZones: props.availabilityZones,
      isolatedSubnetIds: props.isolatedSubnetIds,
    });
    const previewSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SharedPreviewSg",
      props.previewLambdaSgId,
      { allowAllOutbound: true, mutable: false },
    );
    const vpcSubnets: ec2.SubnetSelection = { subnets: vpc.isolatedSubnets };

    // 単一Auroraの pr_<番号> スキーマへ接続する（?schema= でPrismaのsearch_pathを切替）。
    const dbPassword = cdk.SecretValue.secretsManager(props.dbSecretArn, {
      jsonField: "password",
    }).unsafeUnwrap();
    const databaseUrl =
      `postgresql://workmanager:${dbPassword}@${props.dbEndpoint}:5432/work_manager` +
      `?schema=${schema}&connection_limit=1&pool_timeout=20`;

    // プレビュー専用のセッション署名鍵（本番とは分離。スタック更新をまたいで安定させるため構築）。
    const authSecret = new secretsmanager.Secret(this, "AuthSecret", {
      description: `work-manager preview AUTH_SECRET (pr-${props.prNumber})`,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- バックエンド: API Lambda ---
    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(lambdaBundleDir),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      vpc,
      vpcSubnets,
      securityGroups: [previewSg],
      environment: {
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        AUTH_SECRET: authSecret.secretValue.unsafeUnwrap(),
      },
    });

    // --- マイグレーションLambda（pr_<番号>スキーマを作成しmigrate deploy。pr-preview.ymlがinvoke） ---
    const migrationFunction = new lambda.Function(this, "MigrationFunction", {
      functionName: `work-manager-migrate-pr-${props.prNumber}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(migrateBundleDir),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets,
      securityGroups: [previewSg],
      environment: {
        DATABASE_URL: databaseUrl,
      },
    });

    // --- API Gateway (HTTP API) ---
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `work-manager-preview-pr-${props.prNumber}`,
    });
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiFunction),
    });

    // --- フロントエンド: S3 + CloudFront（本番WebAppStackと同型） ---
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const urlRewriteFunction = new cloudfront.Function(this, "UrlRewriteFunction", {
      comment: "map extensionless URIs to Next.js static export .html files",
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) {\n" +
          "  var request = event.request;\n" +
          "  var uri = request.uri;\n" +
          '  if (uri.endsWith("/")) {\n' +
          '    request.uri = uri + "index.html";\n' +
          '  } else if (!uri.split("/").pop().includes(".")) {\n' +
          '    request.uri = uri + ".html";\n' +
          "  }\n" +
          "  return request;\n" +
          "}\n",
      ),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `work-manager preview pr-${props.prNumber}`,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      domainNames: [props.domainName],
      certificate: acm.Certificate.fromCertificateArn(this, "PreviewCert", props.previewCertArn),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(
            `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`,
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html" },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html" },
      ],
    });

    // 静的サイトのアップロード。高速化のため従来の `distribution`/`distributionPaths` 指定
    // （CloudFront `/*` 無効化）は付けない。無効化を付けるとアップロード用のcustom resourceが
    // Distributionの作成完了（約2.6分）を待って直列実行され、生成時間がまるごと後ろに積まれるため。
    // 無効化を外すとアップロードはDistribution作成と並列になる。代わりにHTMLへ no-cache を付与し、
    // synchronize（コミット追加）時も無効化なしでCloudFrontが最新HTMLを取得できるようにする
    // （CloudFrontのCACHING_OPTIMIZEDは min TTL≈1s でオリジンの Cache-Control を尊重する）。
    // プレビューは低トラフィックのため、ハッシュ付き資産にも一律 no-cache で問題ない。
    if (fs.existsSync(path.join(staticSiteDir, "index.html"))) {
      new s3deploy.BucketDeployment(this, "SiteDeployment", {
        sources: [s3deploy.Source.asset(staticSiteDir)],
        destinationBucket: siteBucket,
        cacheControl: [s3deploy.CacheControl.fromString("no-cache")],
      });
    }

    // --- Route53: pr-<番号>.preview.dev.takudon3.com → CloudFront ---
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    const aliasTarget = route53.RecordTarget.fromAlias(
      new route53Targets.CloudFrontTarget(distribution),
    );
    new route53.ARecord(this, "AliasRecordIPv4", {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });
    new route53.AaaaRecord(this, "AliasRecordIPv6", {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });

    new cdk.CfnOutput(this, "PreviewUrl", {
      value: `https://${props.domainName}`,
      description: "このPRのプレビューURL",
    });
    new cdk.CfnOutput(this, "MigrationFunctionName", { value: migrationFunction.functionName });
    new cdk.CfnOutput(this, "Schema", { value: schema });
  }
}
