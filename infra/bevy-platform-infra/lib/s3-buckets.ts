import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

import { STORAGE_CONFIG } from './config';

// S3バケットの作成に関する関数を定義
interface BaseBucketProps {
  scope: Construct;
  account: string;
  envName: string;
}

// アーティファクト用のS3バケットを作成するためのプロパティを定義
interface ArtifactBucketProps extends BaseBucketProps {
  accessLogBucket: s3.IBucket;
  bucketId: string;
  isSecondary?: boolean;
}

// アクセスログ用のS3バケットを作成するためのプロパティを定義
interface AccessLogBucketProps extends BaseBucketProps {
  bucketId: string;
  suppressionReason: string;
  isSecondary?: boolean;
}

// アーティファクト用のS3バケットとアクセスログ用のS3バケットのセットを表すインターフェースを定義
export interface ArtifactBucketSet {
  accessLogBucket: s3.Bucket;
  artifactBucket: s3.Bucket;
}

// バケット名を構築する関数を定義。セカンダリバケットの場合は、名前に "secondary" を含める。
function buildBucketName(prefix: string, envName: string, account: string, isSecondary = false): string {
  return isSecondary
    ? `${prefix}-${envName}-secondary-${account}`
    : `${prefix}-${envName}-${account}`;
}

// S3バケットのライフサイクルルールを構築する関数を定義。古いバージョンのオブジェクトを自動的に削除するルールを含む。
function buildLifecycleRules(): s3.LifecycleRule[] {
  return [
    {
      id: 'ExpireOldBuilds',
      enabled: true,
      expiration: cdk.Duration.days(STORAGE_CONFIG.RETENTION_DAYS),
      noncurrentVersionExpiration: cdk.Duration.days(STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
    },
  ];
}

// アクセスログ用のS3バケットを作成する関数を定義。セキュリティ要件に基づいて、パブリックアクセスをブロックし、暗号化を有効にする。
export function createAccessLogBucket({
  scope,
  account,
  envName,
  bucketId,
  suppressionReason,
  isSecondary = false,
}: AccessLogBucketProps): s3.Bucket {
  const accessLogBucket = new s3.Bucket(scope, bucketId, {
    bucketName: buildBucketName(STORAGE_CONFIG.LOG_BUCKET_PREFIX, envName, account, isSecondary),
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  });
  // cdk-nagの警告を抑制（アクセスログバケットは、アーティファクトバケットのサーバーアクセスログ用であり、ネストされたサーバーアクセスログは必要ないため）
  NagSuppressions.addResourceSuppressions(
    accessLogBucket,
    [
      {
        id: 'AwsSolutions-S1',
        reason: suppressionReason,
      },
    ],
    true,
  );

  return accessLogBucket;
}
// アーティファクト用のS3バケットを作成する関数を定義。アクセスログバケットをサーバーアクセスログの宛先として設定し、ライフサイクルルールを適用する。
export function createArtifactBucket({
  scope,
  account,
  envName,
  accessLogBucket,
  bucketId,
  isSecondary = false,
}: ArtifactBucketProps): s3.Bucket {
  return new s3.Bucket(scope, bucketId, {
    bucketName: buildBucketName(STORAGE_CONFIG.BUCKET_PREFIX, envName, account, isSecondary),
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    versioned: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    serverAccessLogsBucket: accessLogBucket,
    serverAccessLogsPrefix: 'access-logs/',
    lifecycleRules: buildLifecycleRules(),
  });
}

// プライマリリージョンにアーティファクト用のS3バケットとアクセスログ用のS3バケットを作成する関数を定義
export function createPrimaryArtifactBuckets(scope: Construct, envName: string, account: string): ArtifactBucketSet {
  const accessLogBucket = createAccessLogBucket({
    scope,
    account,
    envName,
    bucketId: 'BevyArtifactAccessLogBucket',
    suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucket and does not require nested server access logging.',
  });
// プライマリバケットの名前には "secondary" を含めないことで、セカンダリバケットと区別する
  const artifactBucket = createArtifactBucket({
    scope,
    account,
    envName,
    accessLogBucket,
    bucketId: 'BevyArtifactBucket',
  });

  return {
    accessLogBucket,
    artifactBucket,
  };
}

// セカンダリリージョンにアーティファクト用のS3バケットとアクセスログ用のS3バケットを作成する関数を定義
export function createSecondaryArtifactBuckets(scope: Construct, envName: string, account: string): ArtifactBucketSet {
  const accessLogBucket = createAccessLogBucket({
    scope,
    account,
    envName,
    bucketId: 'BevyArtifactAccessLogBucketSecondary',
    suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
    isSecondary: true,
  });
// セカンダリバケットの名前には "secondary" を含めることで、プライマリバケットと区別する
  const artifactBucket = createArtifactBucket({
    scope,
    account,
    envName,
    accessLogBucket,
    bucketId: 'BevyArtifactBucketSecondary',
    isSecondary: true,
  });

  return {
    accessLogBucket,
    artifactBucket,
  };
}
