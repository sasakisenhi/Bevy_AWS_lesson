import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

export interface CodeBuildPreparationRoleProps {
  scope: Construct;
  artifactBucket: s3.IBucket;
}

// 将来のCodeBuildオフロードに備えた最小サービスロールを作成する。
// Phase3では StartBuild を呼び出さず、実行基盤の権限土台のみを用意する。
export function createCodeBuildPreparationRole({
  scope,
  artifactBucket,
}: CodeBuildPreparationRoleProps): iam.Role {
  const codeBuildServiceRole = new iam.Role(scope, 'CodeBuildServiceRole', {
    assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    description: 'Preparation role for future CodeBuild offload of artifact build workflow',
  });

  // CodeBuildがS3バケットに対して必要なアクセス許可を付与する。これには、バケットのリストと場所の取得、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
  codeBuildServiceRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [artifactBucket.bucketArn],
    }),
  );

  // CodeBuildがS3バケット内のオブジェクトに対して必要なアクセス許可を付与する。これには、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
  codeBuildServiceRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:AbortMultipartUpload',
        's3:ListMultipartUploadParts',
      ],
      resources: [`${artifactBucket.bucketArn}/*`],
    }),
  );

  // CodeBuildがCloudWatch Logsに対して必要なアクセス許可を付与する。これには、ロググループとログストリームの作成、およびログイベントの配置が含まれる。
  codeBuildServiceRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*`,
        `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*:log-stream:*`,
      ],
    }),
  );

  // CodeBuildのサービスロールに対するCDK Nagの警告を抑制する。これには、CodeBuildが動的なオブジェクトキーやロググループ/ストリーム名を使用するため、ワイルドカードリソースサフィックスが必要であるが、アクションは明示的にスコープされているという理由が含まれる。
  NagSuppressions.addResourceSuppressions(
    codeBuildServiceRole,
    [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'CodeBuild writes dynamic artifact object keys and dynamic log group/stream names, requiring wildcard resource suffixes while actions remain explicitly scoped.',
        appliesTo: [{ regex: '/^Resource::.*\\*$/' }],
      },
    ],
    true,
  );

  return codeBuildServiceRole;
}