import * as cdk from 'aws-cdk-lib';
import {
  ACCOUNT_ID_REGEX,
  GITHUB_BRANCH_REGEX,
  GITHUB_BRANCH_WILDCARD_REGEX,
  GITHUB_OWNER_REGEX,
  GITHUB_REPO_REGEX,
  S3_BUCKET_ARN_REGEX,
} from './config';
// AWS CDKのスタックやリソースのプロパティに対するバリデーション関数を定義
// これらの関数は、スタックのコンストラクタ内や、CDKアプリのエントリーポイントで呼び出されることを想定している
export function validateExplicitStackAccount(env?: { account?: string }): string {
  const hasExplicitAccount = Object.prototype.hasOwnProperty.call(env ?? {}, 'account');
  const explicitAccount = env?.account;
  if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
    throw new Error(
      'env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.',
    );
  }

  return explicitAccount;
}
// CDK_DEFAULT_ACCOUNTが設定されていることを検証する関数
export function validateCdkDefaultAccount(account?: string): string {
  if (!account) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required. Configure AWS credentials before synth/deploy.');
  }

  if (!ACCOUNT_ID_REGEX.test(account)) {
    throw new Error('CDK_DEFAULT_ACCOUNT must be a 12-digit AWS account ID.');
  }

  return account;
}
// envNameがサポートされている値であることを検証する関数
export function validateSecondaryBucketArn(secondaryBucketArn: string): void {
  // synth時点では、別スタック由来の値が未解決トークンになる場合がある
  // （例: arn:aws:s3:::${Token[TOKEN.123]})。このケースは有効として扱う。
  if (cdk.Token.isUnresolved(secondaryBucketArn)) {
    return;
  }

  if (!S3_BUCKET_ARN_REGEX.test(secondaryBucketArn)) {
    throw new Error('secondaryBucketArn must be a valid S3 bucket ARN (e.g. arn:aws:s3:::my-bucket).');
  }
}
// S3バケットARNからバケット名を抽出する関数
export function toBucketNameFromArn(bucketArn: string): string {
  return bucketArn.replace('arn:aws:s3:::', '');
}
// GitHub OIDC関連のコンテキスト値を検証する関数
export function validateGitHubOidcContext(githubOwner?: string, githubRepo?: string, githubBranch?: string): void {
  if (githubOwner !== undefined && !GITHUB_OWNER_REGEX.test(githubOwner)) {
    throw new Error('githubOwner must contain only letters, numbers, and hyphens.');
  }
// githubRepoは、GitHubのリポジトリ名として有効な文字（英数字、ドット、アンダースコア、ハイフン）を含む必要がある
  if (githubRepo !== undefined && !GITHUB_REPO_REGEX.test(githubRepo)) {
    throw new Error('githubRepo must contain only letters, numbers, dots, underscores, and hyphens.');
  }
// githubBranchは、GitHubのブランチ名として有効な文字（英数字、ドット、アンダースコア、ハイフン、スラッシュ）を含む必要がある。また、ワイルドカード文字（*、?、[）を含んではいけない。
  if (githubBranch !== undefined) {
    if (githubBranch.length === 0) {
      throw new Error('githubBranch must not be empty.');
    }
// ワイルドカード文字を含むブランチ名はサポートしないため、エラーをスローする
    if (GITHUB_BRANCH_WILDCARD_REGEX.test(githubBranch)) {
      throw new Error('githubBranch must not contain wildcard characters (*, ?, [).');
    }
// githubBranchは、GitHubのブランチ名として有効な文字（英数字、ドット、アンダースコア、ハイフン、スラッシュ）を含む必要がある
    if (!GITHUB_BRANCH_REGEX.test(githubBranch)) {
      throw new Error('githubBranch must be a valid ref segment (e.g. main, release/v1.2.3).');
    }
  }
}
