import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

import {
  ENV_NAME_REGEX,
  GITHUB_OIDC_CONFIG,
  STORAGE_CONFIG,
} from './config';
import {
  toBucketNameFromArn,
  validateExplicitStackAccount,
  validateGitHubOidcContext,
  validateSecondaryBucketArn,
} from './validators';
import { createPrimaryArtifactBuckets } from './s3-buckets';
import { createGithubActionsRole } from './github-oidc';
import { setupCrossRegionReplication } from './s3-replication';

interface BevyPlatformInfraStackProps extends cdk.StackProps {
  secondaryBucketArn: string;
}

// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
export class BevyPlatformInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BevyPlatformInfraStackProps) {
    // AWSアカウントIDが明示的に指定されているかを検証
    validateExplicitStackAccount(props.env);
    // セカンダリバケットのARNを検証
    validateSecondaryBucketArn(props.secondaryBucketArn);

    super(scope, id, props);

    // 実行時に -c env=prod と渡せる
    const envName = this.node.tryGetContext('env') || 'dev';

    // GitHub OIDCの設定をコンテキストから取得（プレースホルダーも用意）
    const githubOwnerContext = this.node.tryGetContext('githubOwner');
    const githubRepoContext = this.node.tryGetContext('githubRepo');
    const githubBranchContext = this.node.tryGetContext('githubBranch');

    const githubOwnerFromContext = githubOwnerContext !== undefined ? String(githubOwnerContext) : undefined;
    const githubRepoFromContext = githubRepoContext !== undefined ? String(githubRepoContext) : undefined;
    const githubBranch = githubBranchContext !== undefined ? String(githubBranchContext) : undefined;

    // GitHub OIDCのコンテキスト値をバリデーション
    validateGitHubOidcContext(githubOwnerFromContext, githubRepoFromContext, githubBranch);

    const githubOwner = githubOwnerFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER;
    const githubRepo = githubRepoFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO;
    const githubBranches = githubBranch
      ? [String(githubBranch)]
      : GITHUB_OIDC_CONFIG.DEFAULT_BRANCHES;

    const githubSubs = githubBranches.map(
      (branch) => `repo:${githubOwner}/${githubRepo}:ref:refs/heads/${branch}`,
    );

    // GitHub OIDCの設定がプレースホルダーのままの場合は警告を出す
    if (
      githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
      githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO
    ) {
      cdk.Annotations.of(this).addWarning(
        'GitHub OIDC trust is using placeholders. Pass -c githubOwner=<owner> -c githubRepo=<repo> and optionally -c githubBranch=<branch> before deployment.',
      );
    }

    // アーティファクト用のS3バケットを作成
    const { artifactBucket } = createPrimaryArtifactBuckets(this, envName, this.account);

    // GitHub OIDCロールを作成
    const githubRole = createGithubActionsRole({
      scope: this,
      account: this.account,
      artifactBucket,
      githubSubs,
    });

    // S3クロスリージョンレプリケーションを設定
    const { cfnBucket } = setupCrossRegionReplication({
      scope: this,
      artifactBucket,
      secondaryBucketArn: props.secondaryBucketArn,
    });

    // バケット名を出力
    new cdk.CfnOutput(this, 'BucketNameExport', {
      value: artifactBucket.bucketName,
    });

    // GitHub ActionsロールのARNを出力
    new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
      value: githubRole.roleArn,
    });

    // レプリケーション先バケットのARNを出力
    new cdk.CfnOutput(this, 'ReplicationDestinationBucketArn', {
      value: props.secondaryBucketArn,
    });

    this.node.addValidation({
      // スタック全体のバリデーションルールを定義
      validate: (): string[] => {
        const errors: string[] = [];

        // 環境名のバリデーション
        if (!ENV_NAME_REGEX.test(envName)) {
          errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
        }

        // GitHub OIDCのプレースホルダー値を使用している場合は、prod環境ではエラーとする
        if (
          envName === 'prod' &&
          (
            githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
            githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO
          )
        ) {
          errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
        }

        // セカンダリバケットARNのバリデーション
        const expectedSecondaryBucketName = `${STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${this.account}`;
        const secondaryBucketName = toBucketNameFromArn(props.secondaryBucketArn);
        if (secondaryBucketName !== expectedSecondaryBucketName) {
          errors.push(
            `secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`,
          );
        }

        // レプリケーション設定のバリデーション
        const replicationConfig = cfnBucket.replicationConfiguration as s3.CfnBucket.ReplicationConfigurationProperty | undefined;
        if (!replicationConfig?.role) {
          errors.push('S3 replication configuration must include a role ARN.');
        }
        const replicationRules = replicationConfig?.rules;
        if (!Array.isArray(replicationRules) || replicationRules.length === 0) {
          errors.push('S3 replication configuration must include at least one enabled rule.');
        }

        return errors;
      },
    });
  }
}
