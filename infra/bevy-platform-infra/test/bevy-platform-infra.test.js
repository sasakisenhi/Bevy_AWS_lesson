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
function getGithubOidcCondition(template) {
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
    test('validate phase fails in prod when GitHub placeholders are used', () => {
        const app = new cdk.App({
            context: {
                env: 'prod',
            },
        });
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'ProdPlaceholderValidationStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-prod-secondary-123456789012',
        });
        expect(stack.node.validate()).toEqual(expect.arrayContaining([expect.stringMatching(PROD_PLACEHOLDER_VALIDATE_ERROR_REGEX)]));
    });
    test('validate phase fails when secondary bucket ARN env/account does not match', () => {
        const app = new cdk.App({
            context: {
                env: 'test',
                githubOwner: 'octo-org',
                githubRepo: 'bevy-platform-infra',
                githubBranch: 'main',
            },
        });
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'SecondaryArnMismatchValidationStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-dev-secondary-123456789012',
        });
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
    test('validate phase fails when envName is unsupported', () => {
        const app = new cdk.App({
            context: {
                env: 'sandbox',
            },
        });
        const stack = new secondary_bucket_stack_1.SecondaryBucketStack(app, 'SecondaryEnvValidationStack', {
            env: { account: '123456789012', region: 'us-east-1' },
            envName: 'sandbox',
        });
        expect(stack.node.validate()).toEqual(expect.arrayContaining([expect.stringMatching(ENV_NAME_VALIDATE_ERROR_REGEX)]));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSwyQkFBMkIsR0FBRyx3REFBd0QsQ0FBQztBQUM3RixNQUFNLCtCQUErQixHQUFHLDZEQUE2RCxDQUFDO0FBQ3RHLE1BQU0sNEJBQTRCLEdBQUcsbUVBQW1FLENBQUM7QUFDekcsTUFBTSxnQ0FBZ0MsR0FBRyxnRUFBZ0UsQ0FBQztBQUMxRyxNQUFNLCtCQUErQixHQUFHLGtGQUFrRixDQUFDO0FBQzNILE1BQU0sMENBQTBDLEdBQUcscUVBQXFFLENBQUM7QUFDekgsTUFBTSx3Q0FBd0MsR0FBRywyQ0FBMkMsQ0FBQztBQUM3RixNQUFNLHdDQUF3QyxHQUFHLG1EQUFtRCxDQUFDO0FBQ3JHLE1BQU0scUNBQXFDLEdBQUcsdUVBQXVFLENBQUM7QUFDdEgsTUFBTSxpREFBaUQsR0FBRyxpRUFBaUUsQ0FBQztBQUM1SCxNQUFNLDZCQUE2QixHQUFHLDhDQUE4QyxDQUFDO0FBQ3JGLG1DQUFtQztBQUNuQyxNQUFNLGdCQUFnQixHQUFHLHlDQUF5QyxDQUFDO0FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcseUNBQXlDLENBQUM7QUFDbkUsc0NBQXNDO0FBQ3RDLDhDQUE4QztBQUM5QywyREFBMkQ7QUFDM0QsTUFBTSwwQkFBMEIsR0FBRyx1REFBdUQsQ0FBQztBQVEzRix5Q0FBeUM7QUFDekMsU0FBUyxzQkFBc0IsQ0FBQyxRQUFrQjtJQUNqRCxrREFBa0Q7SUFD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LEdBQUcsRUFBRTtRQUM3RCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFDdkIsT0FBTyxFQUFFO2dCQUNSLEdBQUcsRUFBRSxTQUFTO2FBQ2Q7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBRyxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSw2QkFBNkIsRUFBRTtZQUMxRSxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUU7WUFDckQsT0FBTyxFQUFFLFNBQVM7U0FDbEIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQ3BDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQyxDQUM5RSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBNYXRjaCwgVGVtcGxhdGUgfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBTZWNvbmRhcnlCdWNrZXRTdGFjayB9IGZyb20gJy4uL2xpYi9zZWNvbmRhcnktYnVja2V0LXN0YWNrJztcblxuLy8g5q2j6KaP6KGo54++44KS5a6a576p44GX44Gm44CB44OQ44Kx44OD44OI5ZCN44Gu5ZG95ZCN6KaP5YmH44KS5qSc6Ki8XG5jb25zdCBQUklNQVJZX0JVQ0tFVF9OQU1FX1JFR0VYID0gJ15iZXZ5LWFydGlmYWN0cy0oZGV2fHRlc3R8c3RnfHByb2QpLVxcXFxkezEyfSQnO1xuY29uc3QgTE9HX0JVQ0tFVF9OQU1FX1JFR0VYID0gJ15iZXZ5LWFydGlmYWN0cy1sb2dzLShkZXZ8dGVzdHxzdGd8cHJvZCktXFxcXGR7MTJ9JCc7XG5jb25zdCBTRUNPTkRBUllfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLShkZXZ8dGVzdHxzdGd8cHJvZCktc2Vjb25kYXJ5LVxcXFxkezEyfSQnO1xuY29uc3QgU0VDT05EQVJZX0xPR19CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtbG9ncy0oZGV2fHRlc3R8c3RnfHByb2QpLXNlY29uZGFyeS1cXFxcZHsxMn0kJztcbmNvbnN0IEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVggPSAvZW52XFwuYWNjb3VudCBtdXN0IGJlIGV4cGxpY2l0bHkgc2V0IHRvIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSUQvaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX09XTkVSX0VSUk9SX1JFR0VYID0gL2dpdGh1Yk93bmVyIG11c3QgY29udGFpbiBvbmx5IGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zXFwuL2k7XG5jb25zdCBJTlZBTElEX0dJVEhVQl9SRVBPX0VSUk9SX1JFR0VYID0gL2dpdGh1YlJlcG8gbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgZG90cywgdW5kZXJzY29yZXMsIGFuZCBoeXBoZW5zXFwuL2k7XG5jb25zdCBJTlZBTElEX0dJVEhVQl9CUkFOQ0hfV0lMRENBUkRfRVJST1JfUkVHRVggPSAvZ2l0aHViQnJhbmNoIG11c3Qgbm90IGNvbnRhaW4gd2lsZGNhcmQgY2hhcmFjdGVycyBcXChcXCosIFxcPywgXFxbXFwpXFwuL2k7XG5jb25zdCBJTlZBTElEX0dJVEhVQl9CUkFOQ0hfRk9STUFUX0VSUk9SX1JFR0VYID0gL2dpdGh1YkJyYW5jaCBtdXN0IGJlIGEgdmFsaWQgcmVmIHNlZ21lbnQvaTtcbmNvbnN0IElOVkFMSURfU0VDT05EQVJZX0JVQ0tFVF9BUk5fRVJST1JfUkVHRVggPSAvc2Vjb25kYXJ5QnVja2V0QXJuIG11c3QgYmUgYSB2YWxpZCBTMyBidWNrZXQgQVJOL2k7XG5jb25zdCBQUk9EX1BMQUNFSE9MREVSX1ZBTElEQVRFX0VSUk9SX1JFR0VYID0gL2luIGVudj1wcm9kLCBnaXRodWJvd25lciBhbmQgZ2l0aHVicmVwbyBwbGFjZWhvbGRlcnMgYXJlIG5vdCBhbGxvd2VkL2k7XG5jb25zdCBTRUNPTkRBUllfQlVDS0VUX0NPTlNJU1RFTkNZX1ZBTElEQVRFX0VSUk9SX1JFR0VYID0gL3NlY29uZGFyeWJ1Y2tldGFybiBtdXN0IHRhcmdldCAuKiBmb3IgZW52XFwvYWNjb3VudCBjb25zaXN0ZW5jeS9pO1xuY29uc3QgRU5WX05BTUVfVkFMSURBVEVfRVJST1JfUkVHRVggPSAvZW52bmFtZSBtdXN0IGJlIG9uZSBvZiBkZXYsIHRlc3QsIHN0ZywgcHJvZC9pO1xuLy8gR2l0SHViIE9JREPjgrXjg5bjgq/jg6zjg7zjg6Djga7mp4vpgKDjgpLmpJzoqLzjgZnjgovjgZ/jgoHjga7mraPopo/ooajnj75cbmNvbnN0IEdJVEhVQl9BVURfQ0xBSU0gPSAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJztcbmNvbnN0IEdJVEhVQl9TVUJfQ0xBSU0gPSAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJztcbi8vIEdpdEh1YiBPSURD44K144OW44Kv44Os44O844Og44Gv44CB5Lul5LiL44Gu5b2i5byP44Gn44GC44KL5b+F6KaB44GM44GC44KK44G+44GZOlxuLy8gcmVwbzp7b3duZXJ9L3tyZXBvfTpyZWY6cmVmcy9oZWFkcy97YnJhbmNofVxuLy8g5L6LOiByZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpblxuY29uc3QgR0lUSFVCX1NVQl9TVFJVQ1RVUkVfUkVHRVggPSAvXnJlcG86W14vXStcXC9bXjpdKzpyZWY6cmVmc1xcL2hlYWRzXFwvW0EtWmEtejAtOS5fLy1dKyQvO1xuXG4vLyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNr44GoU2Vjb25kYXJ5QnVja2V0U3RhY2vjga7kuKHmlrnjgafjgIFlbnYuYWNjb3VudOOBjOaYjuekuueahOOBq+ioreWumuOBleOCjOOBpuOBhOOBquOBhOWgtOWQiOOChOeEoeWKueOBquWApOOBjOioreWumuOBleOCjOOBpuOBhOOCi+WgtOWQiOOBq+OCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+OBn+OCgeOBruODpuODi+ODg+ODiOODhuOCueODiOOCkui/veWKoFxuaW50ZXJmYWNlIE9pZGNDb25kaXRpb24ge1xuXHRTdHJpbmdFcXVhbHM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRTdHJpbmdMaWtlPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10+O1xufVxuXG4vLyBHaXRIdWIgT0lEQ+OBruS/oemgvOadoeS7tuOCkuODhuODs+ODl+ODrOODvOODiOOBi+OCieaKveWHuuOBmeOCi+ODpuODvOODhuOCo+ODquODhuOCo+mWouaVsFxuZnVuY3Rpb24gZ2V0R2l0aHViT2lkY0NvbmRpdGlvbih0ZW1wbGF0ZTogVGVtcGxhdGUpOiBPaWRjQ29uZGl0aW9uIHtcblx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJSUFN44Ot44O844Or44KS44GZ44G544Gm5Y+W5b6X44GX44CBR2l0SHViIE9JREPjgpLkv6HpoLzjgZnjgovjg63jg7zjg6vjga7mnaHku7bjgpLmjqLjgZlcblx0Y29uc3Qgcm9sZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6Um9sZScpIGFzIFJlY29yZDxzdHJpbmcsIHtcblx0XHQvLyBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnTjga7mp4vpgKDjga/jgIFTdGF0ZW1lbnTjgYzphY3liJfjgafjgYLjgovjgZPjgajjgYzkuIDoiKznmoTjgafjgZnjgYzjgIHlv7Xjga7jgZ/jgoHlnovjgpLluoPjgY/lj5bjgotcblx0XHRQcm9wZXJ0aWVzPzoge1xuXHRcdFx0QXNzdW1lUm9sZVBvbGljeURvY3VtZW50Pzoge1xuXHRcdFx0XHQvLyBTdGF0ZW1lbnTjga/phY3liJfjgafjgYLjgovjgZPjgajjgYzkuIDoiKznmoTjgafjgZnjgYzjgIFBV1MgQ0RL44Gu55Sf5oiQ44GZ44KL44OG44Oz44OX44Os44O844OI44Gn44Gv44Kq44OW44K444Kn44Kv44OI44Gr44Gq44KL44GT44Go44KC44GC44KL44Gf44KB44CB5Lih5pa544Gr5a++5b+c44Gn44GN44KL44KI44GG44Gr44GZ44KLXG5cdFx0XHRcdFN0YXRlbWVudD86IEFycmF5PHsgQWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107IENvbmRpdGlvbj86IE9pZGNDb25kaXRpb24gfT47XG5cdFx0XHR9O1xuXHRcdH07XG5cdH0+O1xuXHQvLyBHaXRIdWIgT0lEQ+OCkuS/oemgvOOBmeOCi+ODreODvOODq+OBruadoeS7tuOCkuimi+OBpOOBkeOCi+OBn+OCgeOBq+OAgeOBmeOBueOBpuOBruODreODvOODq+OCkuODq+ODvOODl+OBl+OBpueiuuiqjeOBmeOCi1xuXHRmb3IgKGNvbnN0IHJvbGUgb2YgT2JqZWN0LnZhbHVlcyhyb2xlcykpIHtcblx0XHRjb25zdCBzdGF0ZW1lbnRzID0gcm9sZS5Qcm9wZXJ0aWVzPy5Bc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ/LlN0YXRlbWVudDtcblx0XHQvLyBTdGF0ZW1lbnTjgYzphY3liJfjgafjgarjgYTloLTlkIjjga/jgrnjgq3jg4Pjg5fjgZnjgotcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGVtZW50cykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyDlkIRTdGF0ZW1lbnTjgpLnorroqo3jgZfjgabjgIFzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eeOCkuioseWPr+OBmeOCi+OCguOBruOCkuaOouOBmVxuXHRcdGZvciAoY29uc3Qgc3RhdGVtZW50IG9mIHN0YXRlbWVudHMpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBBcnJheS5pc0FycmF5KHN0YXRlbWVudC5BY3Rpb24pID8gc3RhdGVtZW50LkFjdGlvbiA6IFtzdGF0ZW1lbnQuQWN0aW9uXTtcblx0XHRcdC8vIHN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR544KS6Kix5Y+v44GZ44KLU3RhdGVtZW5044Gn44Gq44GE5aC05ZCI44Gv44K544Kt44OD44OX44GZ44KLXG5cdFx0XHRpZiAoIWFjdGlvbnMuaW5jbHVkZXMoJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5JykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBHaXRIdWIgT0lEQ+OBruS/oemgvOadoeS7tuOBjOimi+OBpOOBi+OBo+OBn+WgtOWQiOOBr+OAgeOBneOCjOOCkui/lOOBmVxuXHRcdFx0aWYgKHN0YXRlbWVudC5Db25kaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlbWVudC5Db25kaXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdC8vIEdpdEh1YiBPSURD44Gu5L+h6aC85p2h5Lu244GM6KaL44Gk44GL44KJ44Gq44GL44Gj44Gf5aC05ZCI44Gv44Ko44Op44O844KS44K544Ot44O844GZ44KLXG5cdHRocm93IG5ldyBFcnJvcignR2l0SHViIE9JREMgdHJ1c3QgY29uZGl0aW9uIHdhcyBub3QgZm91bmQgaW4gSUFNIHJvbGUnKTtcbn1cbi8vIEdpdEh1YiBPSURD44Gu44K144OW44Kv44Os44O844Og44KS5p2h5Lu244GL44KJ5oq95Ye644GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBnZXRHaXRodWJTdWJzKGNvbmRpdGlvbjogT2lkY0NvbmRpdGlvbik6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmF3U3VicyA9IGNvbmRpdGlvbi5TdHJpbmdMaWtlPy5bR0lUSFVCX1NVQl9DTEFJTV07XG5cdC8vIOOCteODluOCr+ODrOODvOODoOOBjOmFjeWIl+OBp+OBguOCjOOBsOOBneOBruOBvuOBvui/lOOBl+OAgeaWh+Wtl+WIl+OBp+OBguOCjOOBsOmFjeWIl+OBq+WkieaPm+OBl+OBpui/lOOBmeOAguOBqeOBoeOCieOBp+OCguOBquOBhOWgtOWQiOOBr+epuumFjeWIl+OCkui/lOOBmeOAglxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdTdWJzKSkge1xuXHRcdHJldHVybiByYXdTdWJzO1xuXHR9XG5cdHJldHVybiB0eXBlb2YgcmF3U3VicyA9PT0gJ3N0cmluZycgPyBbcmF3U3Vic10gOiBbXTtcbn1cbi8vIEdpdEh1YiBPSURD44Gu44K144OW44Kv44Os44O844Og44GM5qeL6YCg5YyW44GV44KM44Gm44GE44KL44GT44Go44KS5qSc6Ki844GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBhc3NlcnRTdHJ1Y3R1cmVkR2l0aHViU3VicyhzdWJzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHQvLyDlkITjgrXjg5bjgq/jg6zjg7zjg6DjgYzmraPjgZfjgYTmp4vpgKDjgpLmjIHjgaPjgabjgYTjgovjgZPjgajjgpLnorroqo3jgZnjgotcblx0Zm9yIChjb25zdCBzdWIgb2Ygc3Vicykge1xuXHRcdGV4cGVjdChzdWIpLnRvTWF0Y2goR0lUSFVCX1NVQl9TVFJVQ1RVUkVfUkVHRVgpO1xuXHRcdGV4cGVjdChzdWIpLm5vdC50b01hdGNoKC9bPypdLyk7XG5cdH1cbn1cblxuLy8gQmV2eVBsYXRmb3JtSW5mcmFTdGFja+OBruODpuODi+ODg+ODiOODhuOCueODiFxuZGVzY3JpYmUoJ0JldnlQbGF0Zm9ybUluZnJhU3RhY2snLCAoKSA9PiB7XG5cdHRlc3QoJ2NyZWF0ZXMgUzMgYnVja2V0IGFuZCBHaXRIdWIgQWN0aW9ucyByb2xlIHdpdGggYnJhbmNoLXNjb3BlZCB0cnVzdCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNeVRlc3RTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gUzPjg5DjgrHjg4Pjg4jjgYwy44Gk5L2c5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAyKTtcblx0XHQvLyDjg5fjg6njgqTjg57jg6rmiJDmnpznianjg5DjgrHjg4Pjg4jlkI3jgYzlkb3lkI3opo/liYfjgavmsr/jgaPjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoUFJJTUFSWV9CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdExvZ0ZpbGVQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI5ZCN44GM5ZG95ZCN6KaP5YmH44Gr5rK/44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr44Gv44Ot44Kw44Gu5b6q55Kw5Y+C54Wn44KS6YG/44GR44KL44Gf44KB44CBTG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzoqK3lrprjgZXjgozjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoTE9HX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5hYnNlbnQoKSxcblx0XHR9KTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruS/oemgvOODneODquOCt+ODvOOBjOato+OBl+OBj+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IG9pZGNDb25kaXRpb24gPSBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlKTtcblx0XHRleHBlY3Qob2lkY0NvbmRpdGlvbi5TdHJpbmdFcXVhbHMpLnRvRXF1YWwoe1xuXHRcdFx0W0dJVEhVQl9BVURfQ0xBSU1dOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1YnMgPSBnZXRHaXRodWJTdWJzKG9pZGNDb25kaXRpb24pO1xuXHRcdGV4cGVjdChzdWJzKS50b0VxdWFsKFtcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0U3RydWN0dXJlZEdpdGh1YlN1YnMoc3Vicyk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga5BUk7jgYzjgrnjgr/jg4Pjgq/jga7lh7rlipvjgavlkKvjgb7jgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge30pO1xuXHR9KTtcblx0Ly8gZ2l0aHViQnJhbmNo44KS5oyH5a6a44GX44Gq44GE5aC05ZCI44CBbWFpbuOBqG1hc3RlcuOBruS4oeaWueOBjOioseWPr+OBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHR0ZXN0KCdhbGxvd3MgYm90aCBtYWluL21hc3RlciBieSBkZWZhdWx0IHdoZW4gZ2l0aHViQnJhbmNoIGlzIG9taXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNeURlZmF1bHRCcmFuY2hTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga7kv6HpoLzjg53jg6rjgrfjg7zjgYxtYWlu44GobWFzdGVy44Gu5Lih5pa544KS6Kix5Y+v44GX44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0Y29uc3Qgb2lkY0NvbmRpdGlvbiA9IGdldEdpdGh1Yk9pZGNDb25kaXRpb24odGVtcGxhdGUpO1xuXHRcdGV4cGVjdChvaWRjQ29uZGl0aW9uLlN0cmluZ0VxdWFscykudG9FcXVhbCh7XG5cdFx0XHRbR0lUSFVCX0FVRF9DTEFJTV06ICdzdHMuYW1hem9uYXdzLmNvbScsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3VicyA9IGdldEdpdGh1YlN1YnMob2lkY0NvbmRpdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdWJzID0gW1xuXHRcdFx0J3JlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYWluJyxcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFzdGVyJyxcblx0XHRdO1xuXHRcdGV4cGVjdChzdWJzKS50b0hhdmVMZW5ndGgoMik7XG5cdFx0ZXhwZWN0KFsuLi5zdWJzXS5zb3J0KCkpLnRvRXF1YWwoWy4uLmV4cGVjdGVkU3Vic10uc29ydCgpKTtcblx0XHRhc3NlcnRTdHJ1Y3R1cmVkR2l0aHViU3VicyhzdWJzKTtcblx0fSk7XG5cblx0Ly8gZW52LmFjY291bnTjgYzmmI7npLrnmoTjgavoqK3lrprjgZXjgozjgabjgYTjgarjgYTloLTlkIjjgoTnhKHlirnjgarlgKTjgYzoqK3lrprjgZXjgozjgabjgYTjgovloLTlkIjjgavjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ01pc3NpbmdBY2NvdW50U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRBY2NvdW50U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnYWJjJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG5cdC8vIEdpdEh1YiBPSURD44Gu44Kz44Oz44OG44Kt44K544OI5YCk44GM54Sh5Yq544Gq5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBHaXRIdWIgT0lEQyBjb250ZXh0IGlzIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0byBvcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gZ2l0aHViT3duZXLjgavjgrnjg5rjg7zjgrnjgYzlkKvjgb7jgozjgabjgYTjgovjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRHaXRodWJPd25lclN0YWNrJywge1xuXHRcdFx0XHQvLyBlbnYuYWNjb3VudOOBruOCqOODqeODvOOCkuWbnumBv+OBmeOCi+OBn+OCgeOBq+OAgWFjY291bnTjga/mnInlirnjgarlgKTjgpLmjIflrppcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0Ly8gc2Vjb25kYXJ5QnVja2V0QXJu44Gv5pyJ5Yq544Gq5YCk44KS5oyH5a6a44GX44Gm44CBZ2l0aHViT3duZXLjga7jg5Djg6rjg4fjg7zjgrfjg6fjg7Pjgqjjg6njg7zjga7jgb/jgYznmbrnlJ/jgZnjgovjgojjgYbjgavjgZnjgotcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHRcdC8vIOOBk+OBk+OBp+OBr+OAgWdpdGh1Yk93bmVy44Gr44K544Oa44O844K544GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0fSkudG9UaHJvdyhJTlZBTElEX0dJVEhVQl9PV05FUl9FUlJPUl9SRUdFWCk7XG5cblx0XHQvLyBnaXRodWJSZXBv44Gr44K544Oa44O844K544GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtOmluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gZ2l0aHViUmVwb+OBq+OCueODmuODvOOCueOBjOWQq+OBvuOCjOOBpuOBhOOCi+OBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YlJlcG9TdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVgpO1xuXG5cdFx0Ly8gZ2l0aHViQnJhbmNo44Gr44Ov44Kk44Or44OJ44Kr44O844OJ5paH5a2X44GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluKicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdC8vIGdpdGh1YkJyYW5jaOOBq+ODr+OCpOODq+ODieOCq+ODvOODieaWh+Wtl+OBjOWQq+OBvuOCjOOBpuOBhOOCi+OBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YkJyYW5jaFdpbGRjYXJkU3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhJTlZBTElEX0dJVEhVQl9CUkFOQ0hfV0lMRENBUkRfRVJST1JfUkVHRVgpO1xuXHRcdC8vIGdpdGh1YkJyYW5jaOOBruW9ouW8j+OBjOeEoeWKueOBquOBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnL21haW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBnaXRodWJCcmFuY2jjga7lvaLlvI/jgYznhKHlirnjgarjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRcdG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ0ludmFsaWRHaXRodWJCcmFuY2hGb3JtYXRTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX0JSQU5DSF9GT1JNQVRfRVJST1JfUkVHRVgpO1xuXHR9KTtcblx0Ly8gc2Vjb25kYXJ5QnVja2V0QXJu44GM54Sh5Yq544Gq5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBzZWNvbmRhcnlCdWNrZXRBcm4gaXMgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZFNlY29uZGFyeUJ1Y2tldEFyblN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdpbnZhbGlkLWFybicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfU0VDT05EQVJZX0JVQ0tFVF9BUk5fRVJST1JfUkVHRVgpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZSBwaGFzZSBmYWlscyBpbiBwcm9kIHdoZW4gR2l0SHViIHBsYWNlaG9sZGVycyBhcmUgdXNlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Byb2QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnUHJvZFBsYWNlaG9sZGVyVmFsaWRhdGlvblN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy1wcm9kLXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KHN0YWNrLm5vZGUudmFsaWRhdGUoKSkudG9FcXVhbChcblx0XHRcdGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW2V4cGVjdC5zdHJpbmdNYXRjaGluZyhQUk9EX1BMQUNFSE9MREVSX1ZBTElEQVRFX0VSUk9SX1JFR0VYKV0pLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlIHBoYXNlIGZhaWxzIHdoZW4gc2Vjb25kYXJ5IGJ1Y2tldCBBUk4gZW52L2FjY291bnQgZG9lcyBub3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdTZWNvbmRhcnlBcm5NaXNtYXRjaFZhbGlkYXRpb25TdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtZGV2LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KHN0YWNrLm5vZGUudmFsaWRhdGUoKSkudG9FcXVhbChcblx0XHRcdGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW2V4cGVjdC5zdHJpbmdNYXRjaGluZyhTRUNPTkRBUllfQlVDS0VUX0NPTlNJU1RFTkNZX1ZBTElEQVRFX0VSUk9SX1JFR0VYKV0pLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbi8vIFNlY29uZGFyeUJ1Y2tldFN0YWNr44Gu44Om44OL44OD44OI44OG44K544OIXG5kZXNjcmliZSgnU2Vjb25kYXJ5QnVja2V0U3RhY2snLCAoKSA9PiB7XG5cdC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBjOOCu+OCreODpeOCouOBquODh+ODleOCqeODq+ODiOioreWumuOBp+S9nOaIkOOBleOCjOOAgeWRveWQjeimj+WJh+OBq+W+k+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCdjcmVhdGVzIHNlY29uZGFyeSBidWNrZXRzIHdpdGggc2VjdXJlIGRlZmF1bHRzIGFuZCBleHBlY3RlZCBuYW1pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnU2Vjb25kYXJ5QnVja2V0QXNzZXJ0aW9uc1N0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIFMz44OQ44Kx44OD44OI44GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMik7XG5cdFx0Ly8g44OQ44Kx44OD44OI44Od44Oq44K344O844GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqje+8iOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBqOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBruS4oeaWueOBq+W/heimgeOBquOBn+OCge+8iVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0UG9saWN5JywgMik7XG5cblx0XHQvLyDjgrvjgqvjg7Pjg4Djg6rmnKzkvZPjg5DjgrHjg4Pjg4jjga7kuLvopoHoqK3lrprjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoU0VDT05EQVJZX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOAgVB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbuOBjOOBmeOBueOBpnRydWXjgafoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuXHRcdFx0XHRJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI5pqX5Y+35YyW44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5YW35L2T55qE44Gq6Kit5a6a44GvTWF0Y2guYW55VmFsdWUoKeOBp+ioseWuue+8iVxuXHRcdFx0QnVja2V0RW5jcnlwdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYW55VmFsdWUoKSxcblx0XHRcdH0pLFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI44Gu44OQ44O844K444On44OL44Oz44Kw44GM5pyJ5Yq544Gr44Gq44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0XHRWZXJzaW9uaW5nQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRTdGF0dXM6ICdFbmFibGVkJyxcblx0XHRcdH0sXG5cdFx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjgYzjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgavkv53lrZjjgZXjgozjgovjgojjgYbjgavjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOato+OBl+OBj+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRMb2dGaWxlUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcblx0XHRcdH0pLFxuXHRcdFx0Ly8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5Y+k44GE44OT44Or44OJ44KSMzDml6XlvozjgavliYrpmaTjgZfjgIHpnZ7nj77ooYzjg5Djg7zjgrjjg6fjg7PjgpI35pel5b6M44Gr5YmK6Zmk44GZ44KL44Or44O844Or44GM44GC44KL44GT44Go44KS56K66KqN77yJXG5cdFx0XHRMaWZlY3ljbGVDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0UnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG5cdFx0XHRcdFx0TWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFx0XHRJZDogJ0V4cGlyZU9sZEJ1aWxkcycsXG5cdFx0XHRcdFx0XHRTdGF0dXM6ICdFbmFibGVkJyxcblx0XHRcdFx0XHRcdEV4cGlyYXRpb25JbkRheXM6IDMwLFxuXHRcdFx0XHRcdFx0Tm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0XHRcdFx0Tm9uY3VycmVudERheXM6IDcsXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KSxcblx0XHR9KTtcblxuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBr+WRveWQjeimj+WJh+OBq+WQiOiHtOOBl+OAgeODjeOCueODiOOBl+OBn+ODreOCsOioreWumuOCkuaMgeOBn+OBquOBhFxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChTRUNPTkRBUllfTE9HX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOAgVB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbuOBjOOBmeOBueOBpnRydWXjgafoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuXHRcdFx0XHRJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Ly8g44OQ44Kx44OD44OI5pqX5Y+35YyW44GM6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI5YW35L2T55qE44Gq6Kit5a6a44GvTWF0Y2guYW55VmFsdWUoKeOBp+ioseWuue+8iVxuXHRcdFx0QnVja2V0RW5jcnlwdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYW55VmFsdWUoKSxcblx0XHRcdH0pLFxuXHRcdFx0Ly8gbG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzoqK3lrprjgZXjgozjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo3vvIjjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavjga/jg63jgrDjga7lvqrnkrDlj4LnhafjgpLpgb/jgZHjgovjgZ/jgoHjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOioreWumuOBleOCjOOBpuOBhOOBquOBhOOBk+OBqOOCkueiuuiqje+8iVxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLmFic2VudCgpLFxuXHRcdH0pO1xuXHRcdC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOBjOOCueOCv+ODg+OCr+OBruWHuuWKm+OBq+WQq+OBvuOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc091dHB1dCgnU2Vjb25kYXJ5QnVja2V0TmFtZUV4cG9ydCcsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJycsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGUgcGhhc2UgZmFpbHMgd2hlbiBlbnZOYW1lIGlzIHVuc3VwcG9ydGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAnc2FuZGJveCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnU2Vjb25kYXJ5RW52VmFsaWRhdGlvblN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRlbnZOYW1lOiAnc2FuZGJveCcsXG5cdFx0fSk7XG5cblx0XHRleHBlY3Qoc3RhY2subm9kZS52YWxpZGF0ZSgpKS50b0VxdWFsKFxuXHRcdFx0ZXhwZWN0LmFycmF5Q29udGFpbmluZyhbZXhwZWN0LnN0cmluZ01hdGNoaW5nKEVOVl9OQU1FX1ZBTElEQVRFX0VSUk9SX1JFR0VYKV0pLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXX0=