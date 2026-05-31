import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BevyPlatformInfraStack } from '../lib/bevy-platform-infra-stack';

// 正規表現を定義して、バケット名の命名規則を検証
const PRIMARY_BUCKET_NAME_REGEX = '^bevy-artifacts-(dev|test|stg|prod)-\\d{12}$';
const LOG_BUCKET_NAME_REGEX = '^bevy-artifacts-logs-(dev|test|stg|prod)-\\d{12}$';

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
		template.hasResourceProperties('AWS::IAM::Role', {
			AssumeRolePolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: 'sts:AssumeRoleWithWebIdentity',
						Condition: {
							StringEquals: {
								'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
							},
							StringLike: {
								'token.actions.githubusercontent.com:sub': [
									'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
								],
							},
						},
					}),
				]),
			},
		});
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
		template.hasResourceProperties('AWS::IAM::Role', {
			AssumeRolePolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: 'sts:AssumeRoleWithWebIdentity',
						Condition: {
							StringLike: {
								'token.actions.githubusercontent.com:sub': Match.arrayWith([
									'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
									'repo:octo-org/bevy-platform-infra:ref:refs/heads/master',
								]),
							},
						},
					}),
				]),
			},
		});
	});
});
