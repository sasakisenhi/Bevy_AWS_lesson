import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

// 定数オブジェクトを定義してマジックナンバーを排除
const STORAGE_CONFIG = {
  RETENTION_DAYS: 30,
  HISTORY_RETENTION_DAYS: 7,
  BUCKET_PREFIX: 'bevy-artifacts',
  LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
} as const;
const ACCOUNT_ID_REGEX = /^\d{12}$/;
const ENV_NAME_REGEX = /^(dev|test|stg|prod)$/;

// 定数オブジェクトを定義してマジックナンバーを排除
interface SecondaryBucketStackProps extends cdk.StackProps {
  envName: string;
}

// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
export class SecondaryBucketStack extends cdk.Stack {
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: SecondaryBucketStackProps) {
    // AWSアカウントIDが明示的に設定されているかを検証
    const hasExplicitAccount = Object.prototype.hasOwnProperty.call(props.env ?? {}, 'account');
    const explicitAccount = props.env?.account;
    if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
      throw new Error(
        'env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.',
      );
    }

    super(scope, id, props);

    // AwsSolutions-S1 対策:
    // セカンダリバケットのサーバーアクセスログ保存先として専用バケットを用意する。
    // ログバケット自体は「ログの受け皿」用途のため、ネストしたアクセスログは設定しない。
    const secondaryAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucketSecondary', {
      bucketName: `${STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // cdk-nagでセカンダリバケットのアクセスログバケットに対する警告を抑制（このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため）
    NagSuppressions.addResourceSuppressions(
      secondaryAccessLogBucket,
      [
        {
          //  このバケットはセカンダリバケットのアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
          id: 'AwsSolutions-S1',
          // なお、このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
          reason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
        },
      ],
      true,
    );

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
      // AwsSolutions-S1 対策:
      // セカンダリ本体バケットのアクセスログを専用ログバケットへ出力する。
      serverAccessLogsBucket: secondaryAccessLogBucket,
      serverAccessLogsPrefix: 'access-logs/',
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

    this.node.addValidation({
      // スタック全体のバリデーションルールを定義
      validate: (): string[] => {
        const errors: string[] = [];
        // 環境名のバリデーション
        if (!ENV_NAME_REGEX.test(props.envName)) {
          errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
        }

        return errors;
      },
    });
  }
}
