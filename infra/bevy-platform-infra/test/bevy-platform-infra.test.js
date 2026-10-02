"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const bevy_platform_infra_stack_1 = require("../lib/bevy-platform-infra-stack");
const secondary_bucket_stack_1 = require("../lib/secondary-bucket-stack");
// 正規表現を定義して、バケット名の命名規則を検証
const PRIMARY_BUCKET_NAME_REGEX = '^bevy-artifacts-(dev|test|stg|prod)-\\d{12}$';
const LOG_BUCKET_NAME_REGEX = '^bevy-artifacts-logs-(dev|test|stg|prod)-\\d{12}$';
const SECONDARY_BUCKET_NAME_REGEX = '^bevy-artifacts-(dev|test|stg|prod)-secondary-\\d{12}$';
const SECONDARY_LOG_BUCKET_NAME_REGEX = '^bevy-artifacts-logs-(dev|test|stg|prod)-secondary-\\d{12}$';
const EXPLICIT_ACCOUNT_ERROR_REGEX = /env\.account must be explicitly set to a 12-digit AWS account ID/i;
const INVALID_GITHUB_OWNER_ERROR_REGEX = /githubOwner must contain only letters, numbers, and hyphens\./i;
const INVALID_GITHUB_REPO_ERROR_REGEX = /githubRepo must contain only letters, numbers, dots, underscores, and hyphens\./i;
const INVALID_GITHUB_BRANCH_WILDCARD_ERROR_REGEX = /githubBranch must not contain wildcard characters \(\*, \?, \[\)\./i;
const INVALID_GITHUB_BRANCH_FORMAT_ERROR_REGEX = /githubBranch must be a valid ref segment/i;
const INVALID_SECONDARY_BUCKET_ARN_ERROR_REGEX = /secondaryBucketArn must be a valid S3 bucket ARN/i;
const PROD_PLACEHOLDER_VALIDATE_ERROR_REGEX = /in env=prod, githubowner and githubrepo placeholders are not allowed/i;
const SECONDARY_BUCKET_CONSISTENCY_VALIDATE_ERROR_REGEX = /secondarybucketarn must target .* for env\/account consistency/i;
const ENV_NAME_VALIDATE_ERROR_REGEX = /envname must be one of dev, test, stg, prod/i;
// GitHub OIDCサブクレームの構造を検証するための正規表現
const GITHUB_AUD_CLAIM = 'token.actions.githubusercontent.com:aud';
const GITHUB_SUB_CLAIM = 'token.actions.githubusercontent.com:sub';
// GitHub OIDCサブクレームは、以下の形式である必要があります:
// repo:{owner}/{repo}:ref:refs/heads/{branch}
// 例: repo:octo-org/bevy-platform-infra:ref:refs/heads/main
const GITHUB_SUB_STRUCTURE_REGEX = /^repo:[^/]+\/[^:]+:ref:refs\/heads\/[A-Za-z0-9._/-]+$/;
// GitHub OIDCの信頼条件をテンプレートから抽出するユーティリティ関数
function getGithubOidcTrustStatement(template) {
    // テンプレートからIAMロールをすべて取得し、GitHub OIDCを信頼するロールの条件を探す
    const roles = template.findResources('AWS::IAM::Role');
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
            return statement;
        }
    }
    // GitHub OIDCの信頼条件が見つからなかった場合はエラーをスローする
    throw new Error('GitHub OIDC trust statement was not found in IAM role');
}
// GitHub OIDCの信頼条件をテンプレートから抽出するユーティリティ関数
function getGithubOidcCondition(template) {
    const condition = getGithubOidcTrustStatement(template).Condition;
    if (!condition) {
        throw new Error('GitHub OIDC trust condition was not found in IAM role');
    }
    return condition;
}
// GitHub OIDCのサブクレームを条件から抽出するユーティリティ関数
function getGithubSubs(condition) {
    const rawSubs = condition.StringLike?.[GITHUB_SUB_CLAIM];
    // サブクレームが配列であればそのまま返し、文字列であれば配列に変換して返す。どちらでもない場合は空配列を返す。
    if (Array.isArray(rawSubs)) {
        return rawSubs;
    }
    return typeof rawSubs === 'string' ? [rawSubs] : [];
}
// GitHub OIDCのサブクレームが構造化されていることを検証するユーティリティ関数
function assertStructuredGithubSubs(subs) {
    // 各サブクレームが正しい構造を持っていることを確認する
    for (const sub of subs) {
        expect(sub).toMatch(GITHUB_SUB_STRUCTURE_REGEX);
        expect(sub).not.toMatch(/[?*]/);
    }
}
// GitHub ActionsロールにアタッチされたインラインポリシーのStatementを取得する
function getGithubActionsPolicyStatements(template) {
    const policies = template.findResources('AWS::IAM::Policy');
    for (const policy of Object.values(policies)) {
        const policyName = policy.Properties?.PolicyName;
        if (typeof policyName === 'string' && policyName.includes('GithubActionsRoleDefaultPolicy')) {
            return policy.Properties?.PolicyDocument?.Statement ?? [];
        }
    }
    throw new Error('GitHub Actions role inline policy was not found');
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
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'MyTestStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
        });
        // テンプレートからリソースの存在とプロパティを検証
        const template = assertions_1.Template.fromStack(stack);
        // GitHub OIDC ProviderがCloudFormation管理で作成され、固定thumbprintに依存しないことを確認
        template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
        template.hasResourceProperties('AWS::IAM::OIDCProvider', {
            Url: 'https://token.actions.githubusercontent.com',
            ClientIdList: ['sts.amazonaws.com'],
            ThumbprintList: assertions_1.Match.absent(),
        });
        // S3バケットが2つ作成されていることを確認
        template.resourceCountIs('AWS::S3::Bucket', 2);
        // プライマリ成果物バケット名が命名規則に沿っていることを確認
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: assertions_1.Match.stringLikeRegexp(PRIMARY_BUCKET_NAME_REGEX),
            LoggingConfiguration: assertions_1.Match.objectLike({
                LogFilePrefix: 'access-logs/',
            }),
        });
        // アクセスログバケット名が命名規則に沿っていることを確認
        // アクセスログバケットにはログの循環参照を避けるため、LoggingConfigurationが設定されていないことを確認
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: assertions_1.Match.stringLikeRegexp(LOG_BUCKET_NAME_REGEX),
            LoggingConfiguration: assertions_1.Match.absent(),
        });
        // GitHub OIDCロールが作成したProviderを参照し、信頼条件が正しく設定されていることを確認
        const oidcProviderLogicalId = Object.keys(template.findResources('AWS::IAM::OIDCProvider'))[0];
        const oidcTrustStatement = getGithubOidcTrustStatement(template);
        expect(oidcTrustStatement.Principal?.Federated).toEqual({
            Ref: oidcProviderLogicalId,
        });
        const oidcCondition = getGithubOidcCondition(template);
        expect(oidcCondition.StringEquals).toEqual({
            [GITHUB_AUD_CLAIM]: 'sts.amazonaws.com',
        });
        const subs = getGithubSubs(oidcCondition);
        expect(subs).toEqual([
            'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
        ]);
        assertStructuredGithubSubs(subs);
        // CDK bootstrapロールを引き受けるためのSTS権限が含まれていることを確認
        const policyStatements = getGithubActionsPolicyStatements(template);
        const assumeBootstrapStatement = policyStatements.find((statement) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.includes('sts:AssumeRole') && actions.includes('sts:TagSession');
        });
        expect(assumeBootstrapStatement).toBeDefined();
        const resourceJson = JSON.stringify(assumeBootstrapStatement?.Resource);
        expect(resourceJson).toContain('cdk-hnb659fds-deploy-role-123456789012-');
        expect(resourceJson).toContain('cdk-hnb659fds-file-publishing-role-123456789012-');
        expect(resourceJson).toContain('cdk-hnb659fds-image-publishing-role-123456789012-');
        expect(resourceJson).toContain('cdk-hnb659fds-lookup-role-123456789012-');
        // bootstrap診断に必要なDescribeStacksだけがCDKToolkitに許可されることを確認
        const describeBootstrapStatement = policyStatements.find((statement) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.length === 1 && actions[0] === 'cloudformation:DescribeStacks' &&
                JSON.stringify(statement.Resource).includes('stack/CDKToolkit/');
        });
        expect(describeBootstrapStatement).toBeDefined();
        expect(describeBootstrapStatement?.Action).toEqual('cloudformation:DescribeStacks');
        expect(JSON.stringify(describeBootstrapStatement?.Resource)).toContain(':cloudformation:*:123456789012:stack/CDKToolkit/*');
        // OIDC Providerの管理変更によって既存の権限セットが変わっていないことを確認
        const actionSets = policyStatements.map((statement) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.filter((action) => typeof action === 'string').sort();
        });
        expect(actionSets).toEqual([
            ['s3:GetBucketLocation', 's3:ListBucket'],
            ['s3:AbortMultipartUpload', 's3:DeleteObject', 's3:GetObject', 's3:ListMultipartUploadParts', 's3:PutObject'],
            ['s3:GetBucketLocation', 's3:ListBucket'],
            ['s3:AbortMultipartUpload', 's3:DeleteObject', 's3:GetObject', 's3:ListMultipartUploadParts', 's3:PutObject'],
            ['cloudformation:DescribeStacks', 'cloudformation:GetTemplate'],
            ['cloudformation:DescribeStacks'],
            ['ssm:GetParameter'],
            ['sts:AssumeRole', 'sts:TagSession'],
        ]);
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
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'MyDefaultBranchStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
        });
        // テンプレートからリソースの存在とプロパティを検証
        const template = assertions_1.Template.fromStack(stack);
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
    // env.accountが明示的に設定されていない場合や無効な値が設定されている場合にエラーがスローされることを確認するテスト
    test('fails fast when account is missing or invalid', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
                githubOwner: 'octo-org',
                githubRepo: 'bevy-platform-infra',
            },
        });
        expect(() => {
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'MissingAccountStack', {
                env: { region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
        expect(() => {
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidAccountStack', {
                env: { account: 'abc', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
    });
    // GitHub OIDCのコンテキスト値が無効な場合にエラーがスローされることを確認するテスト
    test('fails fast when GitHub OIDC context is invalid', () => {
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo org',
                    githubRepo: 'bevy-platform-infra',
                    githubBranch: 'main',
                },
            });
            // githubOwnerにスペースが含まれているため、エラーがスローされることを確認
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubOwnerStack', {
                // env.accountのエラーを回避するために、accountは有効な値を指定
                env: { account: '123456789012', region: 'ap-northeast-1' },
                // secondaryBucketArnは有効な値を指定して、githubOwnerのバリデーションエラーのみが発生するようにする
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
            // ここでは、githubOwnerにスペースが含まれているため、エラーがスローされることを確認
        }).toThrow(INVALID_GITHUB_OWNER_ERROR_REGEX);
        // githubRepoにスペースが含まれているため、エラーがスローされることを確認
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform:infra',
                    githubBranch: 'main',
                },
            });
            // githubRepoにスペースが含まれているため、エラーがスローされることを確認
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubRepoStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_REPO_ERROR_REGEX);
        // githubBranchにワイルドカード文字が含まれているため、エラーがスローされることを確認
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform-infra',
                    githubBranch: 'main*',
                },
            });
            // githubBranchにワイルドカード文字が含まれているため、エラーがスローされることを確認
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubBranchWildcardStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_BRANCH_WILDCARD_ERROR_REGEX);
        // githubBranchの形式が無効なため、エラーがスローされることを確認
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform-infra',
                    githubBranch: '/main',
                },
            });
            // githubBranchの形式が無効なため、エラーがスローされることを確認
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubBranchFormatStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_BRANCH_FORMAT_ERROR_REGEX);
    });
    // secondaryBucketArnが無効な場合にエラーがスローされることを確認するテスト
    test('fails fast when secondaryBucketArn is invalid', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
                githubOwner: 'octo-org',
                githubRepo: 'bevy-platform-infra',
                githubBranch: 'main',
            },
        });
        expect(() => {
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidSecondaryBucketArnStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'invalid-arn',
            });
        }).toThrow(INVALID_SECONDARY_BUCKET_ARN_ERROR_REGEX);
    });
    // prod環境でGitHubのプレースホルダー値が使用されている場合に、validateフェーズでエラーが返されることを確認するテスト
    test('validate phase fails in prod when GitHub placeholders are used', () => {
        const app = new cdk.App({
            context: {
                env: 'prod',
            },
        });
        // スタックを作成して、validateフェーズでエラーが返されることを確認するために、GitHubのプレースホルダー値を使用していることを確認
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'ProdPlaceholderValidationStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-prod-secondary-123456789012',
        });
        // validateフェーズで、prod環境でGitHubのプレースホルダー値が使用されていることに対するエラーが返されることを確認
        expect(stack.node.validate()).toEqual(expect.arrayContaining([expect.stringMatching(PROD_PLACEHOLDER_VALIDATE_ERROR_REGEX)]));
    });
    // secondaryBucketArnの環境/アカウントがスタックのenvと一致しない場合に、validateフェーズでエラーが返されることを確認するテスト
    test('validate phase fails when secondary bucket ARN env/account does not match', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
                githubOwner: 'octo-org',
                githubRepo: 'bevy-platform-infra',
                githubBranch: 'main',
            },
        });
        // スタックを作成して、validateフェーズでエラーが返されることを確認するために、secondaryBucketArnの環境/アカウントがスタックのenvと一致しないことを確認
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'SecondaryArnMismatchValidationStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-dev-secondary-123456789012',
        });
        // validateフェーズで、secondaryBucketArnの環境/アカウントがスタックのenvと一致しないことに対するエラーが返されることを確認
        expect(stack.node.validate()).toEqual(expect.arrayContaining([expect.stringMatching(SECONDARY_BUCKET_CONSISTENCY_VALIDATE_ERROR_REGEX)]));
    });
});
// SecondaryBucketStackのユニットテスト
describe('SecondaryBucketStack', () => {
    // セカンダリバケットがセキュアなデフォルト設定で作成され、命名規則に従っていることを確認するテスト
    test('creates secondary buckets with secure defaults and expected naming', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
            },
        });
        // スタックを作成して、テンプレートを取得
        const stack = new secondary_bucket_stack_1.SecondaryBucketStack(app, 'SecondaryBucketAssertionsStack', {
            env: { account: '123456789012', region: 'us-east-1' },
            envName: 'test',
        });
        // テンプレートからリソースの存在とプロパティを検証
        const template = assertions_1.Template.fromStack(stack);
        // S3バケットが2つ作成されていることを確認
        template.resourceCountIs('AWS::S3::Bucket', 2);
        // バケットポリシーが2つ作成されていることを確認（セカンダリバケットとアクセスログバケットの両方に必要なため）
        template.resourceCountIs('AWS::S3::BucketPolicy', 2);
        // セカンダリ本体バケットの主要設定を確認
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: assertions_1.Match.stringLikeRegexp(SECONDARY_BUCKET_NAME_REGEX),
            // セキュリティ強化のため、PublicAccessBlockConfigurationがすべてtrueで設定されていることを確認
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
            // バケット暗号化が設定されていることを確認（具体的な設定はMatch.anyValue()で許容）
            BucketEncryption: assertions_1.Match.objectLike({
                ServerSideEncryptionConfiguration: assertions_1.Match.anyValue(),
            }),
            // バケットのバージョニングが有効になっていることを確認
            VersioningConfiguration: {
                Status: 'Enabled',
            },
            // アクセスログがセカンダリバケットに保存されるように、LoggingConfigurationが正しく設定されていることを確認
            LoggingConfiguration: assertions_1.Match.objectLike({
                LogFilePrefix: 'access-logs/',
            }),
            // ライフサイクルルールが設定されていることを確認（古いビルドを30日後に削除し、非現行バージョンを7日後に削除するルールがあることを確認）
            LifecycleConfiguration: assertions_1.Match.objectLike({
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Id: 'ExpireOldBuilds',
                        Status: 'Enabled',
                        ExpirationInDays: 30,
                        NoncurrentVersionExpiration: assertions_1.Match.objectLike({
                            NoncurrentDays: 7,
                        }),
                    }),
                ]),
            }),
        });
        // アクセスログバケットは命名規則に合致し、ネストしたログ設定を持たない
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: assertions_1.Match.stringLikeRegexp(SECONDARY_LOG_BUCKET_NAME_REGEX),
            // セキュリティ強化のため、PublicAccessBlockConfigurationがすべてtrueで設定されていることを確認
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
            // バケット暗号化が設定されていることを確認（具体的な設定はMatch.anyValue()で許容）
            BucketEncryption: assertions_1.Match.objectLike({
                ServerSideEncryptionConfiguration: assertions_1.Match.anyValue(),
            }),
            // loggingConfigurationが設定されていないことを確認（アクセスログバケットにはログの循環参照を避けるため、LoggingConfigurationが設定されていないことを確認）
            LoggingConfiguration: assertions_1.Match.absent(),
        });
        // セカンダリバケットのARNがスタックの出力に含まれていることを確認
        template.hasOutput('SecondaryBucketNameExport', {});
    });
    test('fails fast when account is missing or invalid', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
            },
        });
        expect(() => {
            new secondary_bucket_stack_1.SecondaryBucketStack(app, 'MissingAccountSecondaryStack', {
                env: { region: 'us-east-1' },
                envName: 'test',
            });
        }).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
        expect(() => {
            new secondary_bucket_stack_1.SecondaryBucketStack(app, 'InvalidAccountSecondaryStack', {
                env: { account: '', region: 'us-east-1' },
                envName: 'test',
            });
        }).toThrow(EXPLICIT_ACCOUNT_ERROR_REGEX);
    });
    // envNameがサポートされていない値の場合に、validateフェーズでエラーが返されることを確認するテスト
    test('validate phase fails when envName is unsupported', () => {
        const app = new cdk.App({
            context: {
                env: 'sandbox',
            },
        });
        // スタックを作成して、validateフェーズでエラーが返されることを確認するために、envNameがサポートされていない値であることを確認
        const stack = new secondary_bucket_stack_1.SecondaryBucketStack(app, 'SecondaryEnvValidationStack', {
            env: { account: '123456789012', region: 'us-east-1' },
            envName: 'sandbox',
        });
        // validateフェーズで、envNameがサポートされていない値であることに対するエラーが返されることを確認
        expect(stack.node.validate()).toEqual(expect.arrayContaining([expect.stringMatching(ENV_NAME_VALIDATE_ERROR_REGEX)]));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSwyQkFBMkIsR0FBRyx3REFBd0QsQ0FBQztBQUM3RixNQUFNLCtCQUErQixHQUFHLDZEQUE2RCxDQUFDO0FBQ3RHLE1BQU0sNEJBQTRCLEdBQUcsbUVBQW1FLENBQUM7QUFDekcsTUFBTSxnQ0FBZ0MsR0FBRyxnRUFBZ0UsQ0FBQztBQUMxRyxNQUFNLCtCQUErQixHQUFHLGtGQUFrRixDQUFDO0FBQzNILE1BQU0sMENBQTBDLEdBQUcscUVBQXFFLENBQUM7QUFDekgsTUFBTSx3Q0FBd0MsR0FBRywyQ0FBMkMsQ0FBQztBQUM3RixNQUFNLHdDQUF3QyxHQUFHLG1EQUFtRCxDQUFDO0FBQ3JHLE1BQU0scUNBQXFDLEdBQUcsdUVBQXVFLENBQUM7QUFDdEgsTUFBTSxpREFBaUQsR0FBRyxpRUFBaUUsQ0FBQztBQUM1SCxNQUFNLDZCQUE2QixHQUFHLDhDQUE4QyxDQUFDO0FBQ3JGLG1DQUFtQztBQUNuQyxNQUFNLGdCQUFnQixHQUFHLHlDQUF5QyxDQUFDO0FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcseUNBQXlDLENBQUM7QUFDbkUsc0NBQXNDO0FBQ3RDLDhDQUE4QztBQUM5QywyREFBMkQ7QUFDM0QsTUFBTSwwQkFBMEIsR0FBRyx1REFBdUQsQ0FBQztBQTZCM0YseUNBQXlDO0FBQ3pDLFNBQVMsMkJBQTJCLENBQUMsUUFBa0I7SUFDdEQsa0RBQWtEO0lB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SCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IE1hdGNoLCBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuXG4vLyDmraPopo/ooajnj77jgpLlrprnvqnjgZfjgabjgIHjg5DjgrHjg4Pjg4jlkI3jga7lkb3lkI3opo/liYfjgpLmpJzoqLxcbmNvbnN0IFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLShkZXZ8dGVzdHxzdGd8cHJvZCktXFxcXGR7MTJ9JCc7XG5jb25zdCBMT0dfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLWxvZ3MtKGRldnx0ZXN0fHN0Z3xwcm9kKS1cXFxcZHsxMn0kJztcbmNvbnN0IFNFQ09OREFSWV9CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtKGRldnx0ZXN0fHN0Z3xwcm9kKS1zZWNvbmRhcnktXFxcXGR7MTJ9JCc7XG5jb25zdCBTRUNPTkRBUllfTE9HX0JVQ0tFVF9OQU1FX1JFR0VYID0gJ15iZXZ5LWFydGlmYWN0cy1sb2dzLShkZXZ8dGVzdHxzdGd8cHJvZCktc2Vjb25kYXJ5LVxcXFxkezEyfSQnO1xuY29uc3QgRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCA9IC9lbnZcXC5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC9pO1xuY29uc3QgSU5WQUxJRF9HSVRIVUJfT1dORVJfRVJST1JfUkVHRVggPSAvZ2l0aHViT3duZXIgbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVggPSAvZ2l0aHViUmVwbyBtdXN0IGNvbnRhaW4gb25seSBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCB1bmRlcnNjb3JlcywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9XSUxEQ0FSRF9FUlJPUl9SRUdFWCA9IC9naXRodWJCcmFuY2ggbXVzdCBub3QgY29udGFpbiB3aWxkY2FyZCBjaGFyYWN0ZXJzIFxcKFxcKiwgXFw/LCBcXFtcXClcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9GT1JNQVRfRVJST1JfUkVHRVggPSAvZ2l0aHViQnJhbmNoIG11c3QgYmUgYSB2YWxpZCByZWYgc2VnbWVudC9pO1xuY29uc3QgSU5WQUxJRF9TRUNPTkRBUllfQlVDS0VUX0FSTl9FUlJPUl9SRUdFWCA9IC9zZWNvbmRhcnlCdWNrZXRBcm4gbXVzdCBiZSBhIHZhbGlkIFMzIGJ1Y2tldCBBUk4vaTtcbmNvbnN0IFBST0RfUExBQ0VIT0xERVJfVkFMSURBVEVfRVJST1JfUkVHRVggPSAvaW4gZW52PXByb2QsIGdpdGh1Ym93bmVyIGFuZCBnaXRodWJyZXBvIHBsYWNlaG9sZGVycyBhcmUgbm90IGFsbG93ZWQvaTtcbmNvbnN0IFNFQ09OREFSWV9CVUNLRVRfQ09OU0lTVEVOQ1lfVkFMSURBVEVfRVJST1JfUkVHRVggPSAvc2Vjb25kYXJ5YnVja2V0YXJuIG11c3QgdGFyZ2V0IC4qIGZvciBlbnZcXC9hY2NvdW50IGNvbnNpc3RlbmN5L2k7XG5jb25zdCBFTlZfTkFNRV9WQUxJREFURV9FUlJPUl9SRUdFWCA9IC9lbnZuYW1lIG11c3QgYmUgb25lIG9mIGRldiwgdGVzdCwgc3RnLCBwcm9kL2k7XG4vLyBHaXRIdWIgT0lEQ+OCteODluOCr+ODrOODvOODoOOBruani+mAoOOCkuaknOiovOOBmeOCi+OBn+OCgeOBruato+imj+ihqOePvlxuY29uc3QgR0lUSFVCX0FVRF9DTEFJTSA9ICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnO1xuY29uc3QgR0lUSFVCX1NVQl9DTEFJTSA9ICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInO1xuLy8gR2l0SHViIE9JREPjgrXjg5bjgq/jg6zjg7zjg6Djga/jgIHku6XkuIvjga7lvaLlvI/jgafjgYLjgovlv4XopoHjgYzjgYLjgorjgb7jgZk6XG4vLyByZXBvOntvd25lcn0ve3JlcG99OnJlZjpyZWZzL2hlYWRzL3ticmFuY2h9XG4vLyDkvos6IHJlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYWluXG5jb25zdCBHSVRIVUJfU1VCX1NUUlVDVFVSRV9SRUdFWCA9IC9ecmVwbzpbXi9dK1xcL1teOl0rOnJlZjpyZWZzXFwvaGVhZHNcXC9bQS1aYS16MC05Ll8vLV0rJC87XG5cbi8vIEJldnlQbGF0Zm9ybUluZnJhU3RhY2vjgahTZWNvbmRhcnlCdWNrZXRTdGFja+OBruS4oeaWueOBp+OAgWVudi5hY2NvdW5044GM5piO56S655qE44Gr6Kit5a6a44GV44KM44Gm44GE44Gq44GE5aC05ZCI44KE54Sh5Yq544Gq5YCk44GM6Kit5a6a44GV44KM44Gm44GE44KL5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44Gf44KB44Gu44Om44OL44OD44OI44OG44K544OI44KS6L+95YqgXG5pbnRlcmZhY2UgT2lkY0NvbmRpdGlvbiB7XG5cdFN0cmluZ0VxdWFscz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFN0cmluZ0xpa2U/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT47XG59XG5cbmludGVyZmFjZSBJYW1UcnVzdFN0YXRlbWVudCB7XG5cdEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRDb25kaXRpb24/OiBPaWRjQ29uZGl0aW9uO1xuXHRQcmluY2lwYWw/OiB7XG5cdFx0RmVkZXJhdGVkPzogdW5rbm93bjtcblx0fTtcbn1cblxuLy8gSUFN44Od44Oq44K344O844Gu44Oq44K944O844K55qeL6YCg44KS5a6a576p44GZ44KL44Kk44Oz44K/44O844OV44Kn44O844K5XG5pbnRlcmZhY2UgSWFtUG9saWN5UmVzb3VyY2Uge1xuXHRQcm9wZXJ0aWVzPzoge1xuXHRcdFBvbGljeU5hbWU/OiBzdHJpbmc7XG5cdFx0UG9saWN5RG9jdW1lbnQ/OiB7XG5cdFx0XHRTdGF0ZW1lbnQ/OiBBcnJheTx7XG5cdFx0XHRcdEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRcdFx0XHRSZXNvdXJjZT86IHVua25vd247XG5cdFx0XHR9Pjtcblx0XHR9O1xuXHR9O1xufVxuXG4vLyBHaXRIdWIgT0lEQ+OBruS/oemgvOadoeS7tuOCkuODhuODs+ODl+ODrOODvOODiOOBi+OCieaKveWHuuOBmeOCi+ODpuODvOODhuOCo+ODquODhuOCo+mWouaVsFxuZnVuY3Rpb24gZ2V0R2l0aHViT2lkY1RydXN0U3RhdGVtZW50KHRlbXBsYXRlOiBUZW1wbGF0ZSk6IElhbVRydXN0U3RhdGVtZW50IHtcblx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJSUFN44Ot44O844Or44KS44GZ44G544Gm5Y+W5b6X44GX44CBR2l0SHViIE9JREPjgpLkv6HpoLzjgZnjgovjg63jg7zjg6vjga7mnaHku7bjgpLmjqLjgZlcblx0Y29uc3Qgcm9sZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6Um9sZScpIGFzIFJlY29yZDxzdHJpbmcsIHtcblx0XHQvLyBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnTjga7mp4vpgKDjga/jgIFTdGF0ZW1lbnTjgYzphY3liJfjgafjgYLjgovjgZPjgajjgYzkuIDoiKznmoTjgafjgZnjgYzjgIHlv7Xjga7jgZ/jgoHlnovjgpLluoPjgY/lj5bjgotcblx0XHRQcm9wZXJ0aWVzPzoge1xuXHRcdFx0QXNzdW1lUm9sZVBvbGljeURvY3VtZW50Pzoge1xuXHRcdFx0XHQvLyBTdGF0ZW1lbnTjga/phY3liJfjgafjgYLjgovjgZPjgajjgYzkuIDoiKznmoTjgafjgZnjgYzjgIFBV1MgQ0RL44Gu55Sf5oiQ44GZ44KL44OG44Oz44OX44Os44O844OI44Gn44Gv44Kq44OW44K444Kn44Kv44OI44Gr44Gq44KL44GT44Go44KC44GC44KL44Gf44KB44CB5Lih5pa544Gr5a++5b+c44Gn44GN44KL44KI44GG44Gr44GZ44KLXG5cdFx0XHRcdFN0YXRlbWVudD86IElhbVRydXN0U3RhdGVtZW50W107XG5cdFx0XHR9O1xuXHRcdH07XG5cdH0+O1xuXHQvLyBHaXRIdWIgT0lEQ+OCkuS/oemgvOOBmeOCi+ODreODvOODq+OBruadoeS7tuOCkuimi+OBpOOBkeOCi+OBn+OCgeOBq+OAgeOBmeOBueOBpuOBruODreODvOODq+OCkuODq+ODvOODl+OBl+OBpueiuuiqjeOBmeOCi1xuXHRmb3IgKGNvbnN0IHJvbGUgb2YgT2JqZWN0LnZhbHVlcyhyb2xlcykpIHtcblx0XHRjb25zdCBzdGF0ZW1lbnRzID0gcm9sZS5Qcm9wZXJ0aWVzPy5Bc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ/LlN0YXRlbWVudDtcblx0XHQvLyBTdGF0ZW1lbnTjgYzphY3liJfjgafjgarjgYTloLTlkIjjga/jgrnjgq3jg4Pjg5fjgZnjgotcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGVtZW50cykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyDlkIRTdGF0ZW1lbnTjgpLnorroqo3jgZfjgabjgIFzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eeOCkuioseWPr+OBmeOCi+OCguOBruOCkuaOouOBmVxuXHRcdGZvciAoY29uc3Qgc3RhdGVtZW50IG9mIHN0YXRlbWVudHMpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBBcnJheS5pc0FycmF5KHN0YXRlbWVudC5BY3Rpb24pID8gc3RhdGVtZW50LkFjdGlvbiA6IFtzdGF0ZW1lbnQuQWN0aW9uXTtcblx0XHRcdC8vIHN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR544KS6Kix5Y+v44GZ44KLU3RhdGVtZW5044Gn44Gq44GE5aC05ZCI44Gv44K544Kt44OD44OX44GZ44KLXG5cdFx0XHRpZiAoIWFjdGlvbnMuaW5jbHVkZXMoJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5JykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3RhdGVtZW50O1xuXHRcdH1cblx0fVxuXHQvLyBHaXRIdWIgT0lEQ+OBruS/oemgvOadoeS7tuOBjOimi+OBpOOBi+OCieOBquOBi+OBo+OBn+WgtOWQiOOBr+OCqOODqeODvOOCkuOCueODreODvOOBmeOCi1xuXHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBPSURDIHRydXN0IHN0YXRlbWVudCB3YXMgbm90IGZvdW5kIGluIElBTSByb2xlJyk7XG59XG5cbi8vIEdpdEh1YiBPSURD44Gu5L+h6aC85p2h5Lu244KS44OG44Oz44OX44Os44O844OI44GL44KJ5oq95Ye644GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IE9pZGNDb25kaXRpb24ge1xuXHRjb25zdCBjb25kaXRpb24gPSBnZXRHaXRodWJPaWRjVHJ1c3RTdGF0ZW1lbnQodGVtcGxhdGUpLkNvbmRpdGlvbjtcblx0aWYgKCFjb25kaXRpb24pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBPSURDIHRydXN0IGNvbmRpdGlvbiB3YXMgbm90IGZvdW5kIGluIElBTSByb2xlJyk7XG5cdH1cblx0cmV0dXJuIGNvbmRpdGlvbjtcbn1cbi8vIEdpdEh1YiBPSURD44Gu44K144OW44Kv44Os44O844Og44KS5p2h5Lu244GL44KJ5oq95Ye644GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBnZXRHaXRodWJTdWJzKGNvbmRpdGlvbjogT2lkY0NvbmRpdGlvbik6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmF3U3VicyA9IGNvbmRpdGlvbi5TdHJpbmdMaWtlPy5bR0lUSFVCX1NVQl9DTEFJTV07XG5cdC8vIOOCteODluOCr+ODrOODvOODoOOBjOmFjeWIl+OBp+OBguOCjOOBsOOBneOBruOBvuOBvui/lOOBl+OAgeaWh+Wtl+WIl+OBp+OBguOCjOOBsOmFjeWIl+OBq+WkieaPm+OBl+OBpui/lOOBmeOAguOBqeOBoeOCieOBp+OCguOBquOBhOWgtOWQiOOBr+epuumFjeWIl+OCkui/lOOBmeOAglxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdTdWJzKSkge1xuXHRcdHJldHVybiByYXdTdWJzO1xuXHR9XG5cdHJldHVybiB0eXBlb2YgcmF3U3VicyA9PT0gJ3N0cmluZycgPyBbcmF3U3Vic10gOiBbXTtcbn1cbi8vIEdpdEh1YiBPSURD44Gu44K144OW44Kv44Os44O844Og44GM5qeL6YCg5YyW44GV44KM44Gm44GE44KL44GT44Go44KS5qSc6Ki844GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBhc3NlcnRTdHJ1Y3R1cmVkR2l0aHViU3VicyhzdWJzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHQvLyDlkITjgrXjg5bjgq/jg6zjg7zjg6DjgYzmraPjgZfjgYTmp4vpgKDjgpLmjIHjgaPjgabjgYTjgovjgZPjgajjgpLnorroqo3jgZnjgotcblx0Zm9yIChjb25zdCBzdWIgb2Ygc3Vicykge1xuXHRcdGV4cGVjdChzdWIpLnRvTWF0Y2goR0lUSFVCX1NVQl9TVFJVQ1RVUkVfUkVHRVgpO1xuXHRcdGV4cGVjdChzdWIpLm5vdC50b01hdGNoKC9bPypdLyk7XG5cdH1cbn1cblxuLy8gR2l0SHViIEFjdGlvbnPjg63jg7zjg6vjgavjgqLjgr/jg4Pjg4HjgZXjgozjgZ/jgqTjg7Pjg6njgqTjg7Pjg53jg6rjgrfjg7zjga5TdGF0ZW1lbnTjgpLlj5blvpfjgZnjgotcbmZ1bmN0aW9uIGdldEdpdGh1YkFjdGlvbnNQb2xpY3lTdGF0ZW1lbnRzKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IEFycmF5PHsgQWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107IFJlc291cmNlPzogdW5rbm93biB9PiB7XG5cdGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpJQU06OlBvbGljeScpIGFzIFJlY29yZDxzdHJpbmcsIElhbVBvbGljeVJlc291cmNlPjtcblx0Zm9yIChjb25zdCBwb2xpY3kgb2YgT2JqZWN0LnZhbHVlcyhwb2xpY2llcykpIHtcblx0XHRjb25zdCBwb2xpY3lOYW1lID0gcG9saWN5LlByb3BlcnRpZXM/LlBvbGljeU5hbWU7XG5cdFx0aWYgKHR5cGVvZiBwb2xpY3lOYW1lID09PSAnc3RyaW5nJyAmJiBwb2xpY3lOYW1lLmluY2x1ZGVzKCdHaXRodWJBY3Rpb25zUm9sZURlZmF1bHRQb2xpY3knKSkge1xuXHRcdFx0cmV0dXJuIHBvbGljeS5Qcm9wZXJ0aWVzPy5Qb2xpY3lEb2N1bWVudD8uU3RhdGVtZW50ID8/IFtdO1xuXHRcdH1cblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBBY3Rpb25zIHJvbGUgaW5saW5lIHBvbGljeSB3YXMgbm90IGZvdW5kJyk7XG59XG5cbi8vIEJldnlQbGF0Zm9ybUluZnJhU3RhY2vjga7jg6bjg4vjg4Pjg4jjg4bjgrnjg4hcbmRlc2NyaWJlKCdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywgKCkgPT4ge1xuXHR0ZXN0KCdjcmVhdGVzIFMzIGJ1Y2tldCBhbmQgR2l0SHViIEFjdGlvbnMgcm9sZSB3aXRoIGJyYW5jaC1zY29wZWQgdHJ1c3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIEdpdEh1YiBPSURDIFByb3ZpZGVy44GMQ2xvdWRGb3JtYXRpb27nrqHnkIbjgafkvZzmiJDjgZXjgozjgIHlm7rlrpp0aHVtYnByaW5044Gr5L6d5a2Y44GX44Gq44GE44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OklBTTo6T0lEQ1Byb3ZpZGVyJywgMSk7XG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6T0lEQ1Byb3ZpZGVyJywge1xuXHRcdFx0VXJsOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG5cdFx0XHRDbGllbnRJZExpc3Q6IFsnc3RzLmFtYXpvbmF3cy5jb20nXSxcblx0XHRcdFRodW1icHJpbnRMaXN0OiBNYXRjaC5hYnNlbnQoKSxcblx0XHR9KTtcblx0XHQvLyBTM+ODkOOCseODg+ODiOOBjDLjgaTkvZzmiJDjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDIpO1xuXHRcdC8vIOODl+ODqeOCpOODnuODquaIkOaenOeJqeODkOOCseODg+ODiOWQjeOBjOWRveWQjeimj+WJh+OBq+ayv+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChQUklNQVJZX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0TG9nRmlsZVByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jlkI3jgYzlkb3lkI3opo/liYfjgavmsr/jgaPjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavjga/jg63jgrDjga7lvqrnkrDlj4LnhafjgpLpgb/jgZHjgovjgZ/jgoHjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOioreWumuOBleOCjOOBpuOBhOOBquOBhOOBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChMT0dfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLmFic2VudCgpLFxuXHRcdH0pO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44GM5L2c5oiQ44GX44GfUHJvdmlkZXLjgpLlj4LnhafjgZfjgIHkv6HpoLzmnaHku7bjgYzmraPjgZfjgY/oqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBvaWRjUHJvdmlkZXJMb2dpY2FsSWQgPSBPYmplY3Qua2V5cyhcblx0XHRcdHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6SUFNOjpPSURDUHJvdmlkZXInKSxcblx0XHQpWzBdO1xuXHRcdGNvbnN0IG9pZGNUcnVzdFN0YXRlbWVudCA9IGdldEdpdGh1Yk9pZGNUcnVzdFN0YXRlbWVudCh0ZW1wbGF0ZSk7XG5cdFx0ZXhwZWN0KG9pZGNUcnVzdFN0YXRlbWVudC5QcmluY2lwYWw/LkZlZGVyYXRlZCkudG9FcXVhbCh7XG5cdFx0XHRSZWY6IG9pZGNQcm92aWRlckxvZ2ljYWxJZCxcblx0XHR9KTtcblx0XHRjb25zdCBvaWRjQ29uZGl0aW9uID0gZ2V0R2l0aHViT2lkY0NvbmRpdGlvbih0ZW1wbGF0ZSk7XG5cdFx0ZXhwZWN0KG9pZGNDb25kaXRpb24uU3RyaW5nRXF1YWxzKS50b0VxdWFsKHtcblx0XHRcdFtHSVRIVUJfQVVEX0NMQUlNXTogJ3N0cy5hbWF6b25hd3MuY29tJyxcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzID0gZ2V0R2l0aHViU3VicyhvaWRjQ29uZGl0aW9uKTtcblx0XHRleHBlY3Qoc3VicykudG9FcXVhbChbXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuXHRcdF0pO1xuXHRcdGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnMpO1xuXHRcdC8vIENESyBib290c3RyYXDjg63jg7zjg6vjgpLlvJXjgY3lj5fjgZHjgovjgZ/jgoHjga5TVFPmqKnpmZDjgYzlkKvjgb7jgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBwb2xpY3lTdGF0ZW1lbnRzID0gZ2V0R2l0aHViQWN0aW9uc1BvbGljeVN0YXRlbWVudHModGVtcGxhdGUpO1xuXHRcdGNvbnN0IGFzc3VtZUJvb3RzdHJhcFN0YXRlbWVudCA9IHBvbGljeVN0YXRlbWVudHMuZmluZCgoc3RhdGVtZW50KSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gQXJyYXkuaXNBcnJheShzdGF0ZW1lbnQuQWN0aW9uKSA/IHN0YXRlbWVudC5BY3Rpb24gOiBbc3RhdGVtZW50LkFjdGlvbl07XG5cdFx0XHRyZXR1cm4gYWN0aW9ucy5pbmNsdWRlcygnc3RzOkFzc3VtZVJvbGUnKSAmJiBhY3Rpb25zLmluY2x1ZGVzKCdzdHM6VGFnU2Vzc2lvbicpO1xuXHRcdH0pO1xuXHRcdGV4cGVjdChhc3N1bWVCb290c3RyYXBTdGF0ZW1lbnQpLnRvQmVEZWZpbmVkKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VKc29uID0gSlNPTi5zdHJpbmdpZnkoYXNzdW1lQm9vdHN0cmFwU3RhdGVtZW50Py5SZXNvdXJjZSk7XG5cdFx0ZXhwZWN0KHJlc291cmNlSnNvbikudG9Db250YWluKCdjZGstaG5iNjU5ZmRzLWRlcGxveS1yb2xlLTEyMzQ1Njc4OTAxMi0nKTtcblx0XHRleHBlY3QocmVzb3VyY2VKc29uKS50b0NvbnRhaW4oJ2Nkay1obmI2NTlmZHMtZmlsZS1wdWJsaXNoaW5nLXJvbGUtMTIzNDU2Nzg5MDEyLScpO1xuXHRcdGV4cGVjdChyZXNvdXJjZUpzb24pLnRvQ29udGFpbignY2RrLWhuYjY1OWZkcy1pbWFnZS1wdWJsaXNoaW5nLXJvbGUtMTIzNDU2Nzg5MDEyLScpO1xuXHRcdGV4cGVjdChyZXNvdXJjZUpzb24pLnRvQ29udGFpbignY2RrLWhuYjY1OWZkcy1sb29rdXAtcm9sZS0xMjM0NTY3ODkwMTItJyk7XG5cdFx0Ly8gYm9vdHN0cmFw6Ki65pat44Gr5b+F6KaB44GqRGVzY3JpYmVTdGFja3PjgaDjgZHjgYxDREtUb29sa2l044Gr6Kix5Y+v44GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0Y29uc3QgZGVzY3JpYmVCb290c3RyYXBTdGF0ZW1lbnQgPSBwb2xpY3lTdGF0ZW1lbnRzLmZpbmQoKHN0YXRlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IEFycmF5LmlzQXJyYXkoc3RhdGVtZW50LkFjdGlvbikgPyBzdGF0ZW1lbnQuQWN0aW9uIDogW3N0YXRlbWVudC5BY3Rpb25dO1xuXHRcdFx0cmV0dXJuIGFjdGlvbnMubGVuZ3RoID09PSAxICYmIGFjdGlvbnNbMF0gPT09ICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycgJiZcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoc3RhdGVtZW50LlJlc291cmNlKS5pbmNsdWRlcygnc3RhY2svQ0RLVG9vbGtpdC8nKTtcblx0XHR9KTtcblx0XHRleHBlY3QoZGVzY3JpYmVCb290c3RyYXBTdGF0ZW1lbnQpLnRvQmVEZWZpbmVkKCk7XG5cdFx0ZXhwZWN0KGRlc2NyaWJlQm9vdHN0cmFwU3RhdGVtZW50Py5BY3Rpb24pLnRvRXF1YWwoJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyk7XG5cdFx0ZXhwZWN0KEpTT04uc3RyaW5naWZ5KGRlc2NyaWJlQm9vdHN0cmFwU3RhdGVtZW50Py5SZXNvdXJjZSkpLnRvQ29udGFpbihcblx0XHRcdCc6Y2xvdWRmb3JtYXRpb246KjoxMjM0NTY3ODkwMTI6c3RhY2svQ0RLVG9vbGtpdC8qJyxcblx0XHQpO1xuXHRcdC8vIE9JREMgUHJvdmlkZXLjga7nrqHnkIblpInmm7TjgavjgojjgaPjgabml6LlrZjjga7mqKnpmZDjgrvjg4Pjg4jjgYzlpInjgo/jgaPjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBhY3Rpb25TZXRzID0gcG9saWN5U3RhdGVtZW50cy5tYXAoKHN0YXRlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IEFycmF5LmlzQXJyYXkoc3RhdGVtZW50LkFjdGlvbikgPyBzdGF0ZW1lbnQuQWN0aW9uIDogW3N0YXRlbWVudC5BY3Rpb25dO1xuXHRcdFx0cmV0dXJuIGFjdGlvbnMuZmlsdGVyKChhY3Rpb24pOiBhY3Rpb24gaXMgc3RyaW5nID0+IHR5cGVvZiBhY3Rpb24gPT09ICdzdHJpbmcnKS5zb3J0KCk7XG5cdFx0fSk7XG5cdFx0ZXhwZWN0KGFjdGlvblNldHMpLnRvRXF1YWwoW1xuXHRcdFx0WydzMzpHZXRCdWNrZXRMb2NhdGlvbicsICdzMzpMaXN0QnVja2V0J10sXG5cdFx0XHRbJ3MzOkFib3J0TXVsdGlwYXJ0VXBsb2FkJywgJ3MzOkRlbGV0ZU9iamVjdCcsICdzMzpHZXRPYmplY3QnLCAnczM6TGlzdE11bHRpcGFydFVwbG9hZFBhcnRzJywgJ3MzOlB1dE9iamVjdCddLFxuXHRcdFx0WydzMzpHZXRCdWNrZXRMb2NhdGlvbicsICdzMzpMaXN0QnVja2V0J10sXG5cdFx0XHRbJ3MzOkFib3J0TXVsdGlwYXJ0VXBsb2FkJywgJ3MzOkRlbGV0ZU9iamVjdCcsICdzMzpHZXRPYmplY3QnLCAnczM6TGlzdE11bHRpcGFydFVwbG9hZFBhcnRzJywgJ3MzOlB1dE9iamVjdCddLFxuXHRcdFx0WydjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsICdjbG91ZGZvcm1hdGlvbjpHZXRUZW1wbGF0ZSddLFxuXHRcdFx0WydjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcyddLFxuXHRcdFx0Wydzc206R2V0UGFyYW1ldGVyJ10sXG5cdFx0XHRbJ3N0czpBc3N1bWVSb2xlJywgJ3N0czpUYWdTZXNzaW9uJ10sXG5cdFx0XSk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga5BUk7jgYzjgrnjgr/jg4Pjgq/jga7lh7rlipvjgavlkKvjgb7jgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge30pO1xuXHR9KTtcblx0Ly8gZ2l0aHViQnJhbmNo44KS5oyH5a6a44GX44Gq44GE5aC05ZCI44CBbWFpbuOBqG1hc3RlcuOBruS4oeaWueOBjOioseWPr+OBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHR0ZXN0KCdhbGxvd3MgYm90aCBtYWluL21hc3RlciBieSBkZWZhdWx0IHdoZW4gZ2l0aHViQnJhbmNoIGlzIG9taXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNeURlZmF1bHRCcmFuY2hTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga7kv6HpoLzjg53jg6rjgrfjg7zjgYxtYWlu44GobWFzdGVy44Gu5Lih5pa544KS6Kix5Y+v44GX44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0Y29uc3Qgb2lkY0NvbmRpdGlvbiA9IGdldEdpdGh1Yk9pZGNDb25kaXRpb24odGVtcGxhdGUpO1xuXHRcdGV4cGVjdChvaWRjQ29uZGl0aW9uLlN0cmluZ0VxdWFscykudG9FcXVhbCh7XG5cdFx0XHRbR0lUSFVCX0FVRF9DTEFJTV06ICdzdHMuYW1hem9uYXdzLmNvbScsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3VicyA9IGdldEdpdGh1YlN1YnMob2lkY0NvbmRpdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdWJzID0gW1xuXHRcdFx0J3JlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYWluJyxcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFzdGVyJyxcblx0XHRdO1xuXHRcdGV4cGVjdChzdWJzKS50b0hhdmVMZW5ndGgoMik7XG5cdFx0ZXhwZWN0KFsuLi5zdWJzXS5zb3J0KCkpLnRvRXF1YWwoWy4uLmV4cGVjdGVkU3Vic10uc29ydCgpKTtcblx0XHRhc3NlcnRTdHJ1Y3R1cmVkR2l0aHViU3VicyhzdWJzKTtcblx0fSk7XG5cblx0Ly8gZW52LmFjY291bnTjgYzmmI7npLrnmoTjgavoqK3lrprjgZXjgozjgabjgYTjgarjgYTloLTlkIjjgoTnhKHlirnjgarlgKTjgYzoqK3lrprjgZXjgozjgabjgYTjgovloLTlkIjjgavjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ01pc3NpbmdBY2NvdW50U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRBY2NvdW50U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnYWJjJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG5cdC8vIEdpdEh1YiBPSURD44Gu44Kz44Oz44OG44Kt44K544OI5YCk44GM54Sh5Yq544Gq5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBHaXRIdWIgT0lEQyBjb250ZXh0IGlzIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0byBvcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gZ2l0aHViT3duZXLjgavjgrnjg5rjg7zjgrnjgYzlkKvjgb7jgozjgabjgYTjgovjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRHaXRodWJPd25lclN0YWNrJywge1xuXHRcdFx0XHQvLyBlbnYuYWNjb3VudOOBruOCqOODqeODvOOCkuWbnumBv+OBmeOCi+OBn+OCgeOBq+OAgWFjY291bnTjga/mnInlirnjgarlgKTjgpLmjIflrppcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0Ly8gc2Vjb25kYXJ5QnVja2V0QXJu44Gv5pyJ5Yq544Gq5YCk44KS5oyH5a6a44GX44Gm44CBZ2l0aHViT3duZXLjga7jg5Djg6rjg4fjg7zjgrfjg6fjg7Pjgqjjg6njg7zjga7jgb/jgYznmbrnlJ/jgZnjgovjgojjgYbjgavjgZnjgotcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHRcdC8vIOOBk+OBk+OBp+OBr+OAgWdpdGh1Yk93bmVy44Gr44K544Oa44O844K544GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0fSkudG9UaHJvdyhJTlZBTElEX0dJVEhVQl9PV05FUl9FUlJPUl9SRUdFWCk7XG5cblx0XHQvLyBnaXRodWJSZXBv44Gr44K544Oa44O844K544GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtOmluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gZ2l0aHViUmVwb+OBq+OCueODmuODvOOCueOBjOWQq+OBvuOCjOOBpuOBhOOCi+OBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YlJlcG9TdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVgpO1xuXG5cdFx0Ly8gZ2l0aHViQnJhbmNo44Gr44Ov44Kk44Or44OJ44Kr44O844OJ5paH5a2X44GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluKicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdC8vIGdpdGh1YkJyYW5jaOOBq+ODr+OCpOODq+ODieOCq+ODvOODieaWh+Wtl+OBjOWQq+OBvuOCjOOBpuOBhOOCi+OBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YkJyYW5jaFdpbGRjYXJkU3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhJTlZBTElEX0dJVEhVQl9CUkFOQ0hfV0lMRENBUkRfRVJST1JfUkVHRVgpO1xuXHRcdC8vIGdpdGh1YkJyYW5jaOOBruW9ouW8j+OBjOeEoeWKueOBquOBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnL21haW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBnaXRodWJCcmFuY2jjga7lvaLlvI/jgYznhKHlirnjgarjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRHaXRodWJCcmFuY2hGb3JtYXRTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX0JSQU5DSF9GT1JNQVRfRVJST1JfUkVHRVgpO1xuXHR9KTtcblx0Ly8gc2Vjb25kYXJ5QnVja2V0QXJu44GM54Sh5Yq544Gq5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBzZWNvbmRhcnlCdWNrZXRBcm4gaXMgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZFNlY29uZGFyeUJ1Y2tldEFyblN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdpbnZhbGlkLWFybicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfU0VDT05EQVJZX0JVQ0tFVF9BUk5fRVJST1JfUkVHRVgpO1xuXHR9KTtcblxuXHQvLyBwcm9k55Kw5aKD44GnR2l0SHVi44Gu44OX44Os44O844K544Ob44Or44OA44O85YCk44GM5L2/55So44GV44KM44Gm44GE44KL5aC05ZCI44Gr44CBdmFsaWRhdGXjg5Xjgqfjg7zjgrrjgafjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgndmFsaWRhdGUgcGhhc2UgZmFpbHMgaW4gcHJvZCB3aGVuIEdpdEh1YiBwbGFjZWhvbGRlcnMgYXJlIHVzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICdwcm9kJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CBdmFsaWRhdGXjg5Xjgqfjg7zjgrrjgafjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjgZ/jgoHjgavjgIFHaXRIdWLjga7jg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zlgKTjgpLkvb/nlKjjgZfjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBzdGFjayA9IG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ1Byb2RQbGFjZWhvbGRlclZhbGlkYXRpb25TdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtcHJvZC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyB2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OAgXByb2TnkrDlooPjgadHaXRIdWLjga7jg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zlgKTjgYzkvb/nlKjjgZXjgozjgabjgYTjgovjgZPjgajjgavlr77jgZnjgovjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRleHBlY3Qoc3RhY2subm9kZS52YWxpZGF0ZSgpKS50b0VxdWFsKFxuXHRcdFx0ZXhwZWN0LmFycmF5Q29udGFpbmluZyhbZXhwZWN0LnN0cmluZ01hdGNoaW5nKFBST0RfUExBQ0VIT0xERVJfVkFMSURBVEVfRVJST1JfUkVHRVgpXSksXG5cdFx0KTtcblx0fSk7XG5cdC8vIHNlY29uZGFyeUJ1Y2tldEFybuOBrueSsOWigy/jgqLjgqvjgqbjg7Pjg4jjgYzjgrnjgr/jg4Pjgq/jga5lbnbjgajkuIDoh7TjgZfjgarjgYTloLTlkIjjgavjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCd2YWxpZGF0ZSBwaGFzZSBmYWlscyB3aGVuIHNlY29uZGFyeSBidWNrZXQgQVJOIGVudi9hY2NvdW50IGRvZXMgbm90IG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+OBn+OCgeOBq+OAgXNlY29uZGFyeUJ1Y2tldEFybuOBrueSsOWigy/jgqLjgqvjgqbjg7Pjg4jjgYzjgrnjgr/jg4Pjgq/jga5lbnbjgajkuIDoh7TjgZfjgarjgYTjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBzdGFjayA9IG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ1NlY29uZGFyeUFybk1pc21hdGNoVmFsaWRhdGlvblN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy1kZXYtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8gdmFsaWRhdGXjg5Xjgqfjg7zjgrrjgafjgIFzZWNvbmRhcnlCdWNrZXRBcm7jga7nkrDlooMv44Ki44Kr44Km44Oz44OI44GM44K544K/44OD44Kv44GuZW5244Go5LiA6Ie044GX44Gq44GE44GT44Go44Gr5a++44GZ44KL44Ko44Op44O844GM6L+U44GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KHN0YWNrLm5vZGUudmFsaWRhdGUoKSkudG9FcXVhbChcblx0XHRcdGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW2V4cGVjdC5zdHJpbmdNYXRjaGluZyhTRUNPTkRBUllfQlVDS0VUX0NPTlNJU1RFTkNZX1ZBTElEQVRFX0VSUk9SX1JFR0VYKV0pLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbi8vIFNlY29uZGFyeUJ1Y2tldFN0YWNr44Gu44Om44OL44OD44OI44OG44K544OIXG5kZXNjcmliZSgnU2Vjb25kYXJ5QnVja2V0U3RhY2snLCAoKSA9PiB7XG5cdC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBjOOCu+OCreODpeOCouOBquODh+ODleOCqeODq+ODiOioreWumuOBp+S9nOaIkOOBleOCjOOAgeWRveWQjeimj+WJh+OBq+W+k+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCdjcmVhdGVzIHNlY29uZGFyeSBidWNrZXRzIHdpdGggc2VjdXJlIGRlZmF1bHRzIGFuZCBleHBlY3RlZCBuYW1pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnU2Vjb25kYXJ5QnVja2V0QXNzZXJ0aW9uc1N0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIFMz44OQ44Kx44OD44OI44GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMik7XG5cdFx0Ly8g44OQ44Kx44OD44OI44Od44Oq44K344O844GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqje+8iOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBqOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBruS4oeaWueOBq+W/heimgeOBquOBn+OCge+8iVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0UG9saWN5JywgMik7XG5cblx0XHQvLyDjgrvjgqvjg7Pjg4Djg6rmnKzkvZPjg5DjgrHjg4Pjg4jjga7kuLvopoHoqK3lrprjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoU0VDT05EQVJZX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOAgVB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbuOBjOOBmeOBueOBpnRydWXjgafoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuXHRcdFx0XHRJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI5pqX5Y+35YyW44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5YW35L2T55qE44Gq6Kit5a6a44GvTWF0Y2guYW55VmFsdWUoKeOBp+ioseWuue+8iVxuXHRcdFx0QnVja2V0RW5jcnlwdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYW55VmFsdWUoKSxcblx0XHRcdH0pLFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI44Gu44OQ44O844K444On44OL44Oz44Kw44GM5pyJ5Yq544Gr44Gq44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0XHRWZXJzaW9uaW5nQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRTdGF0dXM6ICdFbmFibGVkJyxcblx0XHRcdH0sXG5cdFx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjgYzjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgavkv53lrZjjgZXjgozjgovjgojjgYbjgavjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOato+OBl+OBj+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRMb2dGaWxlUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcblx0XHRcdH0pLFxuXHRcdFx0Ly8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5Y+k44GE44OT44Or44OJ44KSMzDml6XlvozjgavliYrpmaTjgZfjgIHpnZ7nj77ooYzjg5Djg7zjgrjjg6fjg7PjgpI35pel5b6M44Gr5YmK6Zmk44GZ44KL44Or44O844Or44GM44GC44KL44GT44Go44KS56K66KqN77yJXG5cdFx0XHRMaWZlY3ljbGVDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0UnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG5cdFx0XHRcdFx0TWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFx0XHRJZDogJ0V4cGlyZU9sZEJ1aWxkcycsXG5cdFx0XHRcdFx0XHRTdGF0dXM6ICdFbmFibGVkJyxcblx0XHRcdFx0XHRcdEV4cGlyYXRpb25JbkRheXM6IDMwLFxuXHRcdFx0XHRcdFx0Tm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0XHRcdFx0Tm9uY3VycmVudERheXM6IDcsXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KSxcblx0XHR9KTtcblxuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBr+WRveWQjeimj+WJh+OBq+WQiOiHtOOBl+OAgeODjeOCueODiOOBl+OBn+ODreOCsOioreWumuOCkuaMgeOBn+OBquOBhFxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChTRUNPTkRBUllfTE9HX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOAgVB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbuOBjOOBmeOBueOBpnRydWXjgafoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuXHRcdFx0XHRJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI5pqX5Y+35YyW44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5YW35L2T55qE44Gq6Kit5a6a44GvTWF0Y2guYW55VmFsdWUoKeOBp+ioseWuue+8iVxuXHRcdFx0QnVja2V0RW5jcnlwdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYW55VmFsdWUoKSxcblx0XHRcdH0pLFxuXHRcdFx0Ly8gbG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzoqK3lrprjgZXjgozjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo3vvIjjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavjga/jg63jgrDjga7lvqrnkrDlj4LnhafjgpLpgb/jgZHjgovjgZ/jgoHjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOioreWumuOBleOCjOOBpuOBhOOBquOBhOOBk+OBqOOCkueiuuiqje+8iVxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLmFic2VudCgpLFxuXHRcdH0pO1xuXHRcdC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOBjOOCueOCv+ODg+OCr+OBruWHuuWKm+OBq+WQq+OBvuOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc091dHB1dCgnU2Vjb25kYXJ5QnVja2V0TmFtZUV4cG9ydCcsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJycsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG5cdC8vIGVudk5hbWXjgYzjgrXjg53jg7zjg4jjgZXjgozjgabjgYTjgarjgYTlgKTjga7loLTlkIjjgavjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCd2YWxpZGF0ZSBwaGFzZSBmYWlscyB3aGVuIGVudk5hbWUgaXMgdW5zdXBwb3J0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICdzYW5kYm94Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CBdmFsaWRhdGXjg5Xjgqfjg7zjgrrjgafjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjgZ/jgoHjgavjgIFlbnZOYW1l44GM44K144Od44O844OI44GV44KM44Gm44GE44Gq44GE5YCk44Gn44GC44KL44GT44Go44KS56K66KqNXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnU2Vjb25kYXJ5RW52VmFsaWRhdGlvblN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRlbnZOYW1lOiAnc2FuZGJveCcsXG5cdFx0fSk7XG5cdFx0Ly8gdmFsaWRhdGXjg5Xjgqfjg7zjgrrjgafjgIFlbnZOYW1l44GM44K144Od44O844OI44GV44KM44Gm44GE44Gq44GE5YCk44Gn44GC44KL44GT44Go44Gr5a++44GZ44KL44Ko44Op44O844GM6L+U44GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KHN0YWNrLm5vZGUudmFsaWRhdGUoKSkudG9FcXVhbChcblx0XHRcdGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW2V4cGVjdC5zdHJpbmdNYXRjaGluZyhFTlZfTkFNRV9WQUxJREFURV9FUlJPUl9SRUdFWCldKSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl19