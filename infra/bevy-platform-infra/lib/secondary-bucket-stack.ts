import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

// 定数オブジェクトを定義してマジックナンバーを排除
const STORAGE_CONFIG = {
  RETENTION_DAYS: 30,
  HISTORY_RETENTION_DAYS: 7,
  BUCKET_PREFIX: 'bevy-artifacts',
} as const;

// 定数オブジェクトを定義してマジックナンバーを排除
interface SecondaryBucketStackProps extends cdk.StackProps {
  envName: string;
}

// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
export class SecondaryBucketStack extends cdk.Stack {
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: SecondaryBucketStackProps) {
    super(scope, id, props);

    // 環境名とアカウントIDを組み合わせて一意性を担保
    const secondaryBucket = new s3.Bucket(this, 'BevyArtifactBucketSecondary', {
      bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // AwsSolutions-S10 対策:
      // セカンダリバケットにも HTTPS(TLS) のみを許可するポリシーを強制する。
      // CDK がバケットポリシーに「aws:SecureTransport=false を Deny」するルールを自動生成する。
      // プライマリバケット（BevyArtifactBucket）と同一方針を適用する。
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'ExpireOldBuilds',
          enabled: true,
          expiration: cdk.Duration.days(STORAGE_CONFIG.RETENTION_DAYS),
          noncurrentVersionExpiration: cdk.Duration.days(STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
        },
      ],
    });

    this.bucketName = secondaryBucket.bucketName;

    // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
    new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
      value: secondaryBucket.bucketName,
    });
  }
}
