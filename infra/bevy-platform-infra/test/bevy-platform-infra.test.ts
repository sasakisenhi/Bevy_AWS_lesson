import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BevyPlatformInfraStack } from '../lib/bevy-platform-infra-stack';
import { SecondaryBucketStack } from '../lib/secondary-bucket-stack';

// 正規表現を定義して、バケット名の命名規則を検証
const PRIMARY_BUCKET_NAME_REGEX = '^bevy-artifacts-(dev|test|stg|prod)-\\d{12}$';
const LOG_BUCKET_NAME_REGEX = '^bevy-artifacts-logs-(dev|test|stg|prod)-\\d{12}$';
const EXPLICIT_ACCOUNT_ERROR_REGEX = /env\.account must be explicitly set to a 12-digit AWS account ID/i;
// GitHub OIDCサブクレームの構造を検証するための正規表現
const GITHUB_AUD_CLAIM = 'token.actions.githubusercontent.com:aud';
const GITHUB_SUB_CLAIM = 'token.actions.githubusercontent.com:sub';
// GitHub OIDCサブクレームは、以下の形式である必要があります:
// repo:{owner}/{repo}:ref:refs/heads/{branch}
// 例: repo:octo-org/bevy-platform-infra:ref:refs/heads/main
const GITHUB_SUB_STRUCTURE_REGEX = /^repo:[^/]+\/[^:]+:ref:refs\/heads\/[A-Za-z0-9._/-]+$/;

// BevyPlatformInfraStackとSecondaryBucketStackの両方で、env.accountが明示的に設定されていない場合や無効な値が設定されている場合にエラーがスローされることを確認するためのユニットテストを追加
interface OidcCondition {
	StringEquals?: Record<string, string>;
	StringLike?: Record<string, string | string[]>;
}

// GitHub OIDCの信頼条件をテンプレートから抽出するユーティリティ関数
function getGithubOidcCondition(template: Template): OidcCondition {
	// テンプレートからIAMロールをすべて取得し、GitHub OIDCを信頼するロールの条件を探す
	const roles = template.findResources('AWS::IAM::Role') as Record<string, {
		// AssumeRolePolicyDocumentの構造は、Statementが配列であることが一般的ですが、念のため型を広く取る
		Properties?: {
			AssumeRolePolicyDocument?: {
				// Statementは配列であることが一般的ですが、AWS CDKの生成するテンプレートではオブジェクトになることもあるため、両方に対応できるようにする
				Statement?: Array<{ Action?: string | string[]; Condition?: OidcCondition }>;
			};
		};
	}>;
	// GitHub OIDCを信頼するロールの条件を見つけるために、すべてのロールをループして確認する
	for (const role of Object.values(roles)) {
		const statements = role.Properties?.AssumeRolePolicyDocument?.Statement;
		// Statementが配列でない場合はスキップする
		if (!Array.isArray(statements)) {
			continue;
		}
		// 各Statementを確認して、sts:AssumeRoleWithWebIdentityを許可するものを探す
		for (const statement of statements) {
			const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
			// sts:AssumeRoleWithWebIdentityを許可するStatementでない場合はスキップする
			if (!actions.includes('sts:AssumeRoleWithWebIdentity')) {
				continue;
			}
			// GitHub OIDCの信頼条件が見つかった場合は、それを返す
			if (statement.Condition) {
				return statement.Condition;
			}
		}
	}
	// GitHub OIDCの信頼条件が見つからなかった場合はエラーをスローする
	throw new Error('GitHub OIDC trust condition was not found in IAM role');
}
// GitHub OIDCのサブクレームを条件から抽出するユーティリティ関数
function getGithubSubs(condition: OidcCondition): string[] {
	const rawSubs = condition.StringLike?.[GITHUB_SUB_CLAIM];
	// サブクレームが配列であればそのまま返し、文字列であれば配列に変換して返す。どちらでもない場合は空配列を返す。
	if (Array.isArray(rawSubs)) {
		return rawSubs;
	}
	return typeof rawSubs === 'string' ? [rawSubs] : [];
}
// GitHub OIDCのサブクレームが構造化されていることを検証するユーティリティ関数
function assertStructuredGithubSubs(subs: string[]): void {
	// 各サブクレームが正しい構造を持っていることを確認する
	for (const sub of subs) {
		expect(sub).toMatch(GITHUB_SUB_STRUCTURE_REGEX);
		expect(sub).not.toMatch(/[?*]/);
	}
}

// BevyPlatformInfraStackのユニットテスト
describe('BevyPlatformInfraStack', () => {
	test('creates S3 bucket and GitHub Actions role with branch-scoped trust', () => {
		const app = new cdk.App({
			context: {
				env: 'test',
				githubOwner: 'octo-org',
				githubRepo: 'bevy-platform-infra',
				githubBranch: 'main',
			},
		});
		// スタックを作成して、テンプレートを取得
		const stack = new BevyPlatformInfraStack(app, 'MyTestStack', {
			env: { account: '123456789012', region: 'ap-northeast-1' },
			secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
		});
		// テンプレートからリソースの存在とプロパティを検証
		const template = Template.fromStack(stack);
		// S3バケットが2つ作成されていることを確認
		template.resourceCountIs('AWS::S3::Bucket', 2);
		// プライマリ成果物バケット名が命名規則に沿っていることを確認
		template.hasResourceProperties('AWS::S3::Bucket', {
			BucketName: Match.stringLikeRegexp(PRIMARY_BUCKET_NAME_REGEX),
			LoggingConfiguration: Match.objectLike({
				LogFilePrefix: 'access-logs/',
			}),
		});
		// アクセスログバケット名が命名規則に沿っていることを確認
		// アクセスログバケットにはログの循環参照を避けるため、LoggingConfigurationが設定されていないことを確認
		template.hasResourceProperties('AWS::S3::Bucket', {
			BucketName: Match.stringLikeRegexp(LOG_BUCKET_NAME_REGEX),
			LoggingConfiguration: Match.absent(),
		});
		// GitHub OIDCロールの信頼ポリシーが正しく設定されていることを確認
		const oidcCondition = getGithubOidcCondition(template);
		expect(oidcCondition.StringEquals).toEqual({
			[GITHUB_AUD_CLAIM]: 'sts.amazonaws.com',
		});
		const subs = getGithubSubs(oidcCondition);
		expect(subs).toEqual([
			'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
		]);
		assertStructuredGithubSubs(subs);
		// GitHub OIDCロールのARNがスタックの出力に含まれていることを確認
		template.hasOutput('GithubActionsRoleArn', {});
	});
	// githubBranchを指定しない場合、mainとmasterの両方が許可されることを確認
	test('allows both main/master by default when githubBranch is omitted', () => {
		const app = new cdk.App({
			context: {
				env: 'test',
				githubOwner: 'octo-org',
				githubRepo: 'bevy-platform-infra',
			},
		});
		// スタックを作成して、テンプレートを取得
		const stack = new BevyPlatformInfraStack(app, 'MyDefaultBranchStack', {
			env: { account: '123456789012', region: 'ap-northeast-1' },
			secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
		});
		// テンプレートからリソースの存在とプロパティを検証
		const template = Template.fromStack(stack);
		// GitHub OIDCロールの信頼ポリシーがmainとmasterの両方を許可していることを確認
		const oidcCondition = getGithubOidcCondition(template);
		expect(oidcCondition.StringEquals).toEqual({
			[GITHUB_AUD_CLAIM]: 'sts.amazonaws.com',
		});
		const subs = getGithubSubs(oidcCondition);
		const expectedSubs = [
			'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
			'repo:octo-org/bevy-platform-infra:ref:refs/heads/master',
		];
		expect(subs).toHaveLength(2);
		expect([...subs].sort()).toEqual([...expectedSubs].sort());
		assertStructuredGithubSubs(subs);
	});

	test('fails fast when account is missing or invalid', () => {
		const app = new cdk.App({
			context: {
				env: 'test',
				githubOwner: 'octo-org',
				githubRepo: 'bevy-platform-infra',
			},
		});

		expect(() => {
			new BevyPlatformInfraStack(app, 'MissingAccountStack', {
				env: { region: 'ap-northeast-1' },
				secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
			});
		}).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);

		expect(() => {
			new BevyPlatformInfraStack(app, 'InvalidAccountStack', {
				env: { account: 'abc', region: 'ap-northeast-1' },
				secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
			});
		}).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
	});
});

describe('SecondaryBucketStack', () => {
	test('fails fast when account is missing or invalid', () => {
		const app = new cdk.App({
			context: {
				env: 'test',
			},
		});

		expect(() => {
			new SecondaryBucketStack(app, 'MissingAccountSecondaryStack', {
				env: { region: 'us-east-1' },
				envName: 'test',
			});
		}).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);

		expect(() => {
			new SecondaryBucketStack(app, 'InvalidAccountSecondaryStack', {
				env: { account: '', region: 'us-east-1' },
				envName: 'test',
			});
		}).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
	});
});
