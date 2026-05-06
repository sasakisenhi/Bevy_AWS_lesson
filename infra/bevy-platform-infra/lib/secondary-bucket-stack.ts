import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

const STORAGE_CONFIG = {
  RETENTION_DAYS: 30,
  HISTORY_RETENTION_DAYS: 7,
  BUCKET_PREFIX: 'bevy-artifacts',
} as const;

interface SecondaryBucketStackProps extends cdk.StackProps {
  envName: string;
}

export class SecondaryBucketStack extends cdk.Stack {
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: SecondaryBucketStackProps) {
    super(scope, id, props);

    const secondaryBucket = new s3.Bucket(this, 'BevyArtifactBucketSecondary', {
      bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
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

    new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
      value: secondaryBucket.bucketName,
    });
  }
}
