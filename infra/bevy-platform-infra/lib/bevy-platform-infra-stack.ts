import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {
  GITHUB_OIDC_CONFIG,
} from './config';
import {
  validateExplicitStackAccount,
  validateGitHubOidcContext,
  validateSecondaryBucketArn,
} from './validators';
import { createPrimaryArtifactBuckets } from './s3-buckets';
import { createGithubActionsRole } from './github-oidc';
import { setupCrossRegionReplication } from './s3-replication';
import { registerPrimaryStackValidation } from './stack-validators';
import { addPrimaryStackOutputs } from './stack-outputs';

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

// スタックの出力を追加
    addPrimaryStackOutputs({
      scope: this,
      artifactBucket,
      githubRole,
      secondaryBucketArn: props.secondaryBucketArn,
    });

// スタックのバリデーションを登録
    registerPrimaryStackValidation({
      scope: this,
      envName,
      account: this.account,
      githubOwner,
      githubRepo,
      secondaryBucketArn: props.secondaryBucketArn,
      cfnBucket,
    });
  }
}
