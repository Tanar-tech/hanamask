import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

// カスタムドメイン用スタック（2026-07-24 /goal指示: hanamask.dev.takudon3.com）。
// CloudFrontで使うACM証明書は必ずus-east-1リージョンで発行する必要があるため、
// このスタックはWebAppStack（ap-northeast-1）とは別リージョンにデプロイし、
// crossRegionReferences で証明書・ホストゾーンをWebAppStackへ渡す（infra/bin/infra.ts参照）。
//
// takudon3.com は既にこのAWSアカウントのRoute53ホストゾーンが権威DNSとして稼働中
// （2026-07-27確認: `aws route53 get-hosted-zone` のNS と公開DNS解決結果が一致）。
// そのため新規サブドメイン委任は不要で、既存ゾーンに直接レコードを追加する。
export interface DomainStackProps extends cdk.StackProps {
  /** 既存のホストゾーンID（takudon3.com） */
  hostedZoneId: string;
  /** 既存のホストゾーン名（takudon3.com） */
  hostedZoneName: string;
  /** ACM証明書を発行する完全修飾ドメイン名（例: hanamask.dev.takudon3.com） */
  appDomainName: string;
  /** PRプレビュー用ワイルドカードドメイン（例: *.preview.dev.takudon3.com） */
  previewWildcardDomainName: string;
}

export class DomainStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.ICertificate;
  public readonly previewCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.appDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // PRプレビュー環境用のワイルドカード証明書（pr-<番号>.preview.dev.takudon3.com）。
    // PRごとの証明書発行を避けるため1枚で全プレビューをカバーする（docs/AWS.md「PRプレビュー環境」）。
    // ARNはPreviewStackがpr-preview.yml経由のコンテキストで受け取り、CloudFrontに設定する。
    this.previewCertificate = new acm.Certificate(this, "PreviewCertificate", {
      domainName: props.previewWildcardDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    new cdk.CfnOutput(this, "CertificateArn", { value: this.certificate.certificateArn });
    new cdk.CfnOutput(this, "PreviewCertificateArn", {
      value: this.previewCertificate.certificateArn,
      description: "PRプレビュー用ワイルドカード証明書ARN（pr-preview.yml参照）",
    });
  }
}
