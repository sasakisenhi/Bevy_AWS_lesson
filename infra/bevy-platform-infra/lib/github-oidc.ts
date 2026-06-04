import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

import { GITHUB_OIDC_CONFIG } from './config';

// GitHub OIDCロールのプロパティを定義するインターフェース
export interface GithubOidcRoleProps {
  scope: Construct;
  account: string;
  artifactBucket: s3.IBucket;
  githubSubs: string[];
}

// GitHub ActionsがS3バケットにアクセスするためのIAMロールを作成する関数を定義
export function createGithubActionsRole({
  scope,
  account,
  artifactBucket,
  githubSubs,
}: GithubOidcRoleProps): iam.Role {
  const existingProviderArn = `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;

  const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
    scope,
    'GithubProvider',
    existingProviderArn,
  );

  const githubRole = new iam.Role(scope, 'GithubActionsRole', {
    assumedBy: new iam.WebIdentityPrincipal(
      githubProvider.openIdConnectProviderArn,
      {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': GITHUB_OIDC_CONFIG.CLIENT_ID,
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': githubSubs,
        },
      },
    ),
    description: 'Role assumed by GitHub Actions for artifact bucket access',
  });
// GitHub ActionsがS3バケットに対して必要なアクセス許可を付与する。これには、バケットのリストと場所の取得、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
  githubRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [artifactBucket.bucketArn],
    }),
  );

  // GitHub ActionsがS3バケット内のオブジェクトに対して必要なアクセス許可を付与する。これには、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
  githubRole.addToPolicy(
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

  // CloudFormation outputsを参照して実行時設定を動的解決するための読み取り権限を付与する。
  githubRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'cloudformation:DescribeStacks',
      ],
      resources: [
        `arn:${cdk.Aws.PARTITION}:cloudformation:${cdk.Aws.REGION}:${account}:stack/BevyPlatformInfraStack/*`,
      ],
    }),
  );

  // CDK Nagの警告を抑制。理由は、GitHub Actionsが動的なオブジェクトキーとCloudFormationスタックIDサフィックスを扱うため、
  // リソース末尾ワイルドカードが必要になるため。
  NagSuppressions.addResourceSuppressions(
    githubRole,
    [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'GitHub Actions uses dynamic object keys and CloudFormation stack-id suffixes, requiring wildcard resource suffixes while actions remain explicitly scoped.',
        appliesTo: [{ regex: '/^Resource::.*\/\*$/' }],
      },
    ],
    true,
  );

  return githubRole;
}
