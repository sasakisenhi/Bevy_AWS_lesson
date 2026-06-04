import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// スタックの出力を追加する関数と関連するインターフェースを定義
export interface PrimaryStackOutputProps {
  scope: Construct;
  artifactBucket: s3.IBucket;
  githubRole: iam.IRole;
  secondaryBucketArn: string;
}

// スタックの出力を追加する関数と関連するインターフェースを定義
export interface SecondaryStackOutputProps {
  scope: Construct;
  secondaryBucket: s3.IBucket;
}

// プライマリスタックの出力を追加する関数を定義。これには、アーティファクトバケットの名前、GitHub ActionsロールのARN、およびセカンダリバケットのARNが含まれる。
export function addPrimaryStackOutputs({
  scope,
  artifactBucket,
  githubRole,
  secondaryBucketArn,
}: PrimaryStackOutputProps): void {
  new cdk.CfnOutput(scope, 'BucketNameExport', {
    value: artifactBucket.bucketName,
  });
// GitHub ActionsロールのARNを出力する。これにより、GitHub ActionsがプライマリバケットにアクセスするためのIAMロールのARNが提供される。
  new cdk.CfnOutput(scope, 'GithubActionsRoleArn', {
    value: githubRole.roleArn,
  });
// セカンダリバケットのARNを出力する。これにより、クロスリージョンレプリケーションの宛先バケットのARNが提供される。
  new cdk.CfnOutput(scope, 'ReplicationDestinationBucketArn', {
    value: secondaryBucketArn,
  });
}

// セカンダリスタックの出力を追加する関数を定義。これには、セカンダリバケットの名前が含まれる。
export function addSecondaryStackOutputs({
  scope,
  secondaryBucket,
}: SecondaryStackOutputProps): void {
  new cdk.CfnOutput(scope, 'SecondaryBucketNameExport', {
    value: secondaryBucket.bucketName,
  });
}
