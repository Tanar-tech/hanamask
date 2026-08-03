import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

// hanamask 本体（Webアプリ）のスモールスタート構成（docs/AWS.md）:
//   CloudFront ─┬─ S3（Next.js静的エクスポート out/）
//               └─ /api/* → API Gateway (HTTP API) → Lambda (dist/lambda/) → Aurora Serverless v2
// フロントとAPIを同一オリジン（CloudFrontドメイン）に載せることで、CORSなし・
// HttpOnly Cookieセッションのままで動作させる。
//
// デプロイ前提（docs/GOVERNANCE.md §6 により実デプロイは管理者が実施）:
//   1. リポジトリルートで `npm run build`（out/ 生成）と `npm run build:lambda`（dist/lambda/ 生成）
//   2. infra/ で `npx cdk deploy HanamaskWebAppStack`
//   3. 初回はDBマイグレーション適用が必要（docs/AWS.md「DBマイグレーション」参照）
export interface WebAppStackProps extends cdk.StackProps {
  /** カスタムドメイン（例: hanamask.dev.takudon3.com）。省略時はCloudFrontの既定ドメインのみ */
  domainName?: string;
  /** domainName指定時は必須。us-east-1で発行されたACM証明書（DomainStack参照） */
  certificate?: acm.ICertificate;
  /** domainName指定時は必須。エイリアスレコードを作成するホストゾーン（DomainStack参照） */
  hostedZone?: route53.IHostedZone;
}

export class WebAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebAppStackProps = {}) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, "..", "..");
    const staticSiteDir = path.join(repoRoot, "out");
    const lambdaBundleDir = path.join(repoRoot, "dist", "lambda");

    // --- ネットワーク ---
    // NATゲートウェイは月額コストが大きいため置かない。LambdaとAuroraは
    // PRIVATE_ISOLATEDサブネットに配置し、Lambdaは外部APIを呼ばない前提
    // （Stripe連携を実装する段になったらNAT追加を管理者に相談する）。
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // --- DB: Aurora Serverless v2 (PostgreSQL) ---
    // 最小0.5ACU・最大1ACUのスモールスタート。パスワードはURL埋め込みで使うため
    // 記号を除外して生成する（Prisma接続文字列のURLエンコード問題を避ける）。
    const cluster = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        // NOTE: 提供中のバージョンは変動する（16.4は2026-07時点で提供終了、CREATE_FAILEDの実績あり）。
        // `aws rds describe-db-engine-versions --engine aurora-postgresql` で確認して選ぶこと。
        // 16系の最新。17.x へのメジャーアップグレードはパラメータグループのファミリ変更・
        // allowMajorVersionUpgrade・ダウンタイムを伴う稼働中クラスタへの破壊的操作のため、
        // 稼働最優先の方針により本更新では据え置き、管理者が計画的に別途実施する（docs/AWS.md §6）。
        version: rds.AuroraPostgresEngineVersion.VER_16_13,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2("Writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 1,
      defaultDatabaseName: "hanamask",
      credentials: rds.Credentials.fromGeneratedSecret("hanamask", {
        excludeCharacters: " \"'@/\\%&:?#[]{}()*+,;<=>^`|~!$",
      }),
      storageEncrypted: true,
      // 誤削除時もデータを失わないようスナップショットを残す
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // --- コスト削減: 業務時間外（平日9:00-17:00 JST以外）はAuroraを停止する ---
    // Serverless v2は最小0.5ACUでも稼働中は常時課金されるため、業務時間外はクラスタ自体を
    // 停止しコストをゼロにする（2026-08-01 /goal指示）。RDS/AuroraのStopDBCluster/StartDBClusterは
    // 最大7日で自動再開する仕様だが、平日ごとに明示起動するため到達しない。
    // 影響: 本番アプリ・PRプレビュー環境（単一Auroraを共有）は業務時間外アクセス不可になる。
    // JST=UTC+9のため、9:00 JST→00:00 UTC・17:00 JST→08:00 UTC（日付またぎなし）。
    const auroraSchedulePolicy = new iam.PolicyStatement({
      actions: ["rds:StartDBCluster", "rds:StopDBCluster"],
      resources: [cluster.clusterArn],
    });

    new events.Rule(this, "AuroraStartSchedule", {
      description: "hanamask: Auroraを平日9:00 JSTに起動（業務時間開始）",
      schedule: events.Schedule.cron({ minute: "0", hour: "0", weekDay: "MON-FRI" }),
      targets: [
        new targets.AwsApi({
          service: "RDS",
          action: "startDBCluster",
          parameters: { DBClusterIdentifier: cluster.clusterIdentifier },
          policyStatement: auroraSchedulePolicy,
        }),
      ],
    });

    new events.Rule(this, "AuroraStopSchedule", {
      description: "hanamask: Auroraを平日17:00 JSTに停止（業務時間終了、週末は月曜まで停止継続）",
      schedule: events.Schedule.cron({ minute: "0", hour: "8", weekDay: "MON-FRI" }),
      targets: [
        new targets.AwsApi({
          service: "RDS",
          action: "stopDBCluster",
          parameters: { DBClusterIdentifier: cluster.clusterIdentifier },
          policyStatement: auroraSchedulePolicy,
        }),
      ],
    });

    // セッショントークン署名用シークレット（src/server/token.ts の AUTH_SECRET）
    const authSecret = new secretsmanager.Secret(this, "AuthSecret", {
      description: "hanamask session token signing secret (AUTH_SECRET)",
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    // --- バックエンド: Lambda ---
    if (!fs.existsSync(path.join(lambdaBundleDir, "index.js"))) {
      throw new Error(
        `Lambdaバンドルが見つかりません: ${lambdaBundleDir}\n` +
          "リポジトリルートで `npm run build:lambda` を先に実行してください。",
      );
    }
    const dbSecret = cluster.secret;
    if (!dbSecret) {
      throw new Error("unreachable: fromGeneratedSecret を使う限りクラスタシークレットは必ず存在する");
    }
    // NOTE: unsafeUnwrap()はCloudFormationの動的参照（{{resolve:secretsmanager:...}}）として
    // 展開されるためテンプレートに平文は残らないが、Lambdaの環境変数としては保存される
    // （コンソール閲覧可）。スモールスタットの割り切りであり、規模拡大時は
    // RDS Proxy + IAM認証 or 実行時Secrets Manager取得への移行を検討する（docs/AWS.md）。
    const databaseUrl =
      "postgresql://hanamask:" +
      dbSecret.secretValueFromJson("password").unsafeUnwrap() +
      "@" +
      cluster.clusterEndpoint.hostname +
      ":5432/hanamask?connection_limit=1&pool_timeout=20";

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(lambdaBundleDir),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        AUTH_SECRET: authSecret.secretValue.unsafeUnwrap(),
      },
    });
    cluster.connections.allowDefaultPortFrom(apiFunction, "API Lambda to Aurora");

    // --- DBマイグレーションLambda（docs/AWS.md §4、2026-07-24 /goal指示で方式決定） ---
    // prisma CLI+マイグレーションSQLを同梱し、`prisma migrate deploy` を実行する。
    // GitHub Actionsのデプロイジョブが cdk deploy 後に同期invokeする（release.yml）。
    // 関数名はデプロイロールのIAM絞り込みに使うため固定する。
    const migrateBundleDir = path.join(repoRoot, "dist", "migrate");
    if (!fs.existsSync(path.join(migrateBundleDir, "index.js"))) {
      throw new Error(
        `マイグレーションLambdaバンドルが見つかりません: ${migrateBundleDir}\n` +
          "リポジトリルートで `npm run build:migrate` を先に実行してください。",
      );
    }
    const migrationFunction = new lambda.Function(this, "MigrationFunction", {
      functionName: "hanamask-migrate",
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(migrateBundleDir),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        DATABASE_URL: databaseUrl,
      },
    });
    cluster.connections.allowDefaultPortFrom(migrationFunction, "Migration Lambda to Aurora");

    // --- PRプレビュー環境用の共有リソース（docs/AWS.md「PRプレビュー環境」、docs/GOVERNANCE.md §3） ---
    // PRごとのプレビュースタック（PreviewStack）が接続情報をこのスタックのCloudFormation出力から
    // 取得し（pr-preview.ymlがdescribe-stacksで読んでCDKコンテキストに渡す）、単一Auroraの
    // PR別スキーマ（pr_<番号>）にアクセスする。
    //
    // プレビューLambdaは全PR共通のこのSGを付与してAuroraへ接続する。Auroraのingressは
    // このSGに対して一度だけ許可し、PRごとにAuroraのSGを書き換えない（競合・削除ロック回避）。
    const previewLambdaSg = new ec2.SecurityGroup(this, "PreviewLambdaSg", {
      vpc,
      allowAllOutbound: true,
      description: "Shared SG for PR preview Lambdas to reach Aurora",
    });
    cluster.connections.allowDefaultPortFrom(previewLambdaSg, "Preview Lambdas to Aurora");

    // スキーマ破棄用の共有Lambda（PRクローズ時にpr_<番号>スキーマをDROPする。dist/migrateのdropschema.handler）。
    const dbUrlBase =
      "postgresql://hanamask:" +
      dbSecret.secretValueFromJson("password").unsafeUnwrap() +
      "@" +
      cluster.clusterEndpoint.hostname +
      ":5432/hanamask";
    const dropSchemaFunction = new lambda.Function(this, "DropSchemaFunction", {
      functionName: "hanamask-drop-schema",
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "dropschema.handler",
      code: lambda.Code.fromAsset(migrateBundleDir),
      memorySize: 512,
      timeout: cdk.Duration.minutes(2),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [previewLambdaSg],
      environment: {
        DATABASE_URL: dbUrlBase,
      },
    });

    // PreviewStackが参照する共有情報。pr-preview.ymlが `describe-stacks` で読み取り、
    // `cdk deploy` の -c コンテキストとしてPreviewStackへ渡す（トークン・Export依存を持ち込まない）。
    new cdk.CfnOutput(this, "SharedVpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "SharedIsolatedSubnetIds", {
      value: cdk.Fn.join(",", vpc.isolatedSubnets.map((s) => s.subnetId)),
    });
    new cdk.CfnOutput(this, "SharedAvailabilityZones", {
      value: cdk.Fn.join(",", vpc.availabilityZones),
    });
    new cdk.CfnOutput(this, "SharedPreviewLambdaSgId", { value: previewLambdaSg.securityGroupId });
    new cdk.CfnOutput(this, "SharedDbEndpoint", { value: cluster.clusterEndpoint.hostname });
    new cdk.CfnOutput(this, "SharedDbSecretArn", { value: dbSecret.secretArn });
    new cdk.CfnOutput(this, "DropSchemaFunctionName", {
      value: dropSchemaFunction.functionName,
      description: "PRクローズ時にpr_<番号>スキーマを破棄する共有Lambda（pr-preview.yml参照）",
    });

    // --- API Gateway (HTTP API) ---
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "hanamask-api",
    });
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiFunction),
    });

    // --- フロントエンド: S3 + CloudFront ---
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // ビルド成果物のみを置くため再生成可能。スタック削除時に一緒に消す。
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Next.js静的エクスポートは /dashboard → dashboard.html 形式のため、
    // 拡張子のないURIを .html に書き換える（ディレクトリは index.html へ）。
    const urlRewriteFunction = new cloudfront.Function(this, "UrlRewriteFunction", {
      comment: "map extensionless URIs to Next.js static export .html files",
      code: cloudfront.FunctionCode.fromInline(
        'function handler(event) {\n' +
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
      comment: "hanamask",
      defaultRootObject: "index.html",
      // 日本のユーザーが主対象のため、日本のエッジを含むPRICE_CLASS_200にする
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.certificate,
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
          // Cookie・クエリ・ヘッダーをAPIへ素通しする（Hostのみ書き換え）
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // S3(OAC)は存在しないキーに403を返すため、404ページへマッピングする
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
        },
      ],
    });

    // 静的アセットのアップロード（out/ がある場合のみ。`npm run build` で生成）
    if (fs.existsSync(path.join(staticSiteDir, "index.html"))) {
      new s3deploy.BucketDeployment(this, "SiteDeployment", {
        sources: [s3deploy.Source.asset(staticSiteDir)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ["/*"],
      });
    }

    // カスタムドメイン指定時はRoute53にCloudFrontへのエイリアスレコード（A/AAAA）を作成する
    if (props.domainName && props.hostedZone) {
      const target = route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      );
      new route53.ARecord(this, "AliasRecordIPv4", {
        zone: props.hostedZone,
        recordName: props.domainName,
        target,
      });
      new route53.AaaaRecord(this, "AliasRecordIPv6", {
        zone: props.hostedZone,
        recordName: props.domainName,
        target,
      });
    }

    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "アプリのURL（CloudFront既定ドメイン）",
    });
    new cdk.CfnOutput(this, "AppUrl", {
      value: `https://${props.domainName ?? distribution.distributionDomainName}`,
      description: "アプリのURL（カスタムドメイン優先）",
    });
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: httpApi.apiEndpoint,
      description: "API Gateway直接エンドポイント（動作確認用）",
    });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "DbSecretArn", {
      value: dbSecret.secretArn,
      description: "DB接続情報（Secrets Manager）",
    });
    new cdk.CfnOutput(this, "MigrationFunctionName", {
      value: migrationFunction.functionName,
      description: "DBマイグレーション用Lambda（デプロイ後にinvokeする。release.yml参照）",
    });
  }
}
