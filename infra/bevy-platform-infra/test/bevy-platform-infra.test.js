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
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubOwnerStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_OWNER_ERROR_REGEX);
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform:infra',
                    githubBranch: 'main',
                },
            });
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubRepoStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_REPO_ERROR_REGEX);
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform-infra',
                    githubBranch: 'main*',
                },
            });
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubBranchWildcardStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_BRANCH_WILDCARD_ERROR_REGEX);
        expect(() => {
            const app = new cdk.App({
                context: {
                    env: 'test',
                    githubOwner: 'octo-org',
                    githubRepo: 'bevy-platform-infra',
                    githubBranch: '/main',
                },
            });
            new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'InvalidGithubBranchFormatStack', {
                env: { account: '123456789012', region: 'ap-northeast-1' },
                secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
            });
        }).toThrow(INVALID_GITHUB_BRANCH_FORMAT_ERROR_REGEX);
    });
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSwyQkFBMkIsR0FBRyx3REFBd0QsQ0FBQztBQUM3RixNQUFNLCtCQUErQixHQUFHLDZEQUE2RCxDQUFDO0FBQ3RHLE1BQU0sNEJBQTRCLEdBQUcsbUVBQW1FLENBQUM7QUFDekcsTUFBTSxnQ0FBZ0MsR0FBRyxnRUFBZ0UsQ0FBQztBQUMxRyxNQUFNLCtCQUErQixHQUFHLGtGQUFrRixDQUFDO0FBQzNILE1BQU0sMENBQTBDLEdBQUcscUVBQXFFLENBQUM7QUFDekgsTUFBTSx3Q0FBd0MsR0FBRywyQ0FBMkMsQ0FBQztBQUM3RixNQUFNLHdDQUF3QyxHQUFHLG1EQUFtRCxDQUFDO0FBQ3JHLG1DQUFtQztBQUNuQyxNQUFNLGdCQUFnQixHQUFHLHlDQUF5QyxDQUFDO0FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcseUNBQXlDLENBQUM7QUFDbkUsc0NBQXNDO0FBQ3RDLDhDQUE4QztBQUM5QywyREFBMkQ7QUFDM0QsTUFBTSwwQkFBMEIsR0FBRyx1REFBdUQsQ0FBQztBQVEzRix5Q0FBeUM7QUFDekMsU0FBUyxzQkFBc0IsQ0FBQyxRQUFrQjtJQUNqRCxrREFBa0Q7SUFDbEQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FRbkQsQ0FBQztJQUNILG1EQUFtRDtJQUNuRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sQ0FBQyxN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R0FBRyxDQUFDLEdBQUcsQ0FBQztZQUN2QixPQUFPLEVBQUU7Z0JBQ1IsR0FBRyxFQUFFLE1BQU07YUFDWDtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxHQUFHLEVBQUU7WUFDWCxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSw4QkFBOEIsRUFBRTtnQkFDN0QsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtnQkFDNUIsT0FBTyxFQUFFLE1BQU07YUFDZixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV6QyxNQUFNLENBQUMsR0FBRyxFQUFFO1lBQ1gsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsOEJBQThCLEVBQUU7Z0JBQzdELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtnQkFDekMsT0FBTyxFQUFFLE1BQU07YUFDZixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IE1hdGNoLCBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuXG4vLyDmraPopo/ooajnj77jgpLlrprnvqnjgZfjgabjgIHjg5DjgrHjg4Pjg4jlkI3jga7lkb3lkI3opo/liYfjgpLmpJzoqLxcbmNvbnN0IFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLShkZXZ8dGVzdHxzdGd8cHJvZCktXFxcXGR7MTJ9JCc7XG5jb25zdCBMT0dfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLWxvZ3MtKGRldnx0ZXN0fHN0Z3xwcm9kKS1cXFxcZHsxMn0kJztcbmNvbnN0IFNFQ09OREFSWV9CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtKGRldnx0ZXN0fHN0Z3xwcm9kKS1zZWNvbmRhcnktXFxcXGR7MTJ9JCc7XG5jb25zdCBTRUNPTkRBUllfTE9HX0JVQ0tFVF9OQU1FX1JFR0VYID0gJ15iZXZ5LWFydGlmYWN0cy1sb2dzLShkZXZ8dGVzdHxzdGd8cHJvZCktc2Vjb25kYXJ5LVxcXFxkezEyfSQnO1xuY29uc3QgRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCA9IC9lbnZcXC5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC9pO1xuY29uc3QgSU5WQUxJRF9HSVRIVUJfT1dORVJfRVJST1JfUkVHRVggPSAvZ2l0aHViT3duZXIgbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVggPSAvZ2l0aHViUmVwbyBtdXN0IGNvbnRhaW4gb25seSBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCB1bmRlcnNjb3JlcywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9XSUxEQ0FSRF9FUlJPUl9SRUdFWCA9IC9naXRodWJCcmFuY2ggbXVzdCBub3QgY29udGFpbiB3aWxkY2FyZCBjaGFyYWN0ZXJzIFxcKFxcKiwgXFw/LCBcXFtcXClcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9GT1JNQVRfRVJST1JfUkVHRVggPSAvZ2l0aHViQnJhbmNoIG11c3QgYmUgYSB2YWxpZCByZWYgc2VnbWVudC9pO1xuY29uc3QgSU5WQUxJRF9TRUNPTkRBUllfQlVDS0VUX0FSTl9FUlJPUl9SRUdFWCA9IC9zZWNvbmRhcnlCdWNrZXRBcm4gbXVzdCBiZSBhIHZhbGlkIFMzIGJ1Y2tldCBBUk4vaTtcbi8vIEdpdEh1YiBPSURD44K144OW44Kv44Os44O844Og44Gu5qeL6YCg44KS5qSc6Ki844GZ44KL44Gf44KB44Gu5q2j6KaP6KGo54++XG5jb25zdCBHSVRIVUJfQVVEX0NMQUlNID0gJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc7XG5jb25zdCBHSVRIVUJfU1VCX0NMQUlNID0gJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic7XG4vLyBHaXRIdWIgT0lEQ+OCteODluOCr+ODrOODvOODoOOBr+OAgeS7peS4i+OBruW9ouW8j+OBp+OBguOCi+W/heimgeOBjOOBguOCiuOBvuOBmTpcbi8vIHJlcG86e293bmVyfS97cmVwb306cmVmOnJlZnMvaGVhZHMve2JyYW5jaH1cbi8vIOS+izogcmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW5cbmNvbnN0IEdJVEhVQl9TVUJfU1RSVUNUVVJFX1JFR0VYID0gL15yZXBvOlteL10rXFwvW146XSs6cmVmOnJlZnNcXC9oZWFkc1xcL1tBLVphLXowLTkuXy8tXSskLztcblxuLy8gQmV2eVBsYXRmb3JtSW5mcmFTdGFja+OBqFNlY29uZGFyeUJ1Y2tldFN0YWNr44Gu5Lih5pa544Gn44CBZW52LmFjY291bnTjgYzmmI7npLrnmoTjgavoqK3lrprjgZXjgozjgabjgYTjgarjgYTloLTlkIjjgoTnhKHlirnjgarlgKTjgYzoqK3lrprjgZXjgozjgabjgYTjgovloLTlkIjjgavjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjgZ/jgoHjga7jg6bjg4vjg4Pjg4jjg4bjgrnjg4jjgpLov73liqBcbmludGVyZmFjZSBPaWRjQ29uZGl0aW9uIHtcblx0U3RyaW5nRXF1YWxzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0U3RyaW5nTGlrZT86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHN0cmluZ1tdPjtcbn1cblxuLy8gR2l0SHViIE9JREPjga7kv6HpoLzmnaHku7bjgpLjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonmir3lh7rjgZnjgovjg6bjg7zjg4bjgqPjg6rjg4bjgqPplqLmlbBcbmZ1bmN0aW9uIGdldEdpdGh1Yk9pZGNDb25kaXRpb24odGVtcGxhdGU6IFRlbXBsYXRlKTogT2lkY0NvbmRpdGlvbiB7XG5cdC8vIOODhuODs+ODl+ODrOODvOODiOOBi+OCiUlBTeODreODvOODq+OCkuOBmeOBueOBpuWPluW+l+OBl+OAgUdpdEh1YiBPSURD44KS5L+h6aC844GZ44KL44Ot44O844Or44Gu5p2h5Lu244KS5o6i44GZXG5cdGNvbnN0IHJvbGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpJQU06OlJvbGUnKSBhcyBSZWNvcmQ8c3RyaW5nLCB7XG5cdFx0Ly8gQXNzdW1lUm9sZVBvbGljeURvY3VtZW5044Gu5qeL6YCg44Gv44CBU3RhdGVtZW5044GM6YWN5YiX44Gn44GC44KL44GT44Go44GM5LiA6Iis55qE44Gn44GZ44GM44CB5b+144Gu44Gf44KB5Z6L44KS5bqD44GP5Y+W44KLXG5cdFx0UHJvcGVydGllcz86IHtcblx0XHRcdEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudD86IHtcblx0XHRcdFx0Ly8gU3RhdGVtZW5044Gv6YWN5YiX44Gn44GC44KL44GT44Go44GM5LiA6Iis55qE44Gn44GZ44GM44CBQVdTIENES+OBrueUn+aIkOOBmeOCi+ODhuODs+ODl+ODrOODvOODiOOBp+OBr+OCquODluOCuOOCp+OCr+ODiOOBq+OBquOCi+OBk+OBqOOCguOBguOCi+OBn+OCgeOAgeS4oeaWueOBq+WvvuW/nOOBp+OBjeOCi+OCiOOBhuOBq+OBmeOCi1xuXHRcdFx0XHRTdGF0ZW1lbnQ/OiBBcnJheTx7IEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdOyBDb25kaXRpb24/OiBPaWRjQ29uZGl0aW9uIH0+O1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9Pjtcblx0Ly8gR2l0SHViIE9JREPjgpLkv6HpoLzjgZnjgovjg63jg7zjg6vjga7mnaHku7bjgpLopovjgaTjgZHjgovjgZ/jgoHjgavjgIHjgZnjgbnjgabjga7jg63jg7zjg6vjgpLjg6vjg7zjg5fjgZfjgabnorroqo3jgZnjgotcblx0Zm9yIChjb25zdCByb2xlIG9mIE9iamVjdC52YWx1ZXMocm9sZXMpKSB7XG5cdFx0Y29uc3Qgc3RhdGVtZW50cyA9IHJvbGUuUHJvcGVydGllcz8uQXNzdW1lUm9sZVBvbGljeURvY3VtZW50Py5TdGF0ZW1lbnQ7XG5cdFx0Ly8gU3RhdGVtZW5044GM6YWN5YiX44Gn44Gq44GE5aC05ZCI44Gv44K544Kt44OD44OX44GZ44KLXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXRlbWVudHMpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8g5ZCEU3RhdGVtZW5044KS56K66KqN44GX44Gm44CBc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHnjgpLoqLHlj6/jgZnjgovjgoLjga7jgpLmjqLjgZlcblx0XHRmb3IgKGNvbnN0IHN0YXRlbWVudCBvZiBzdGF0ZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gQXJyYXkuaXNBcnJheShzdGF0ZW1lbnQuQWN0aW9uKSA/IHN0YXRlbWVudC5BY3Rpb24gOiBbc3RhdGVtZW50LkFjdGlvbl07XG5cdFx0XHQvLyBzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eeOCkuioseWPr+OBmeOCi1N0YXRlbWVudOOBp+OBquOBhOWgtOWQiOOBr+OCueOCreODg+ODl+OBmeOCi1xuXHRcdFx0aWYgKCFhY3Rpb25zLmluY2x1ZGVzKCdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eScpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gR2l0SHViIE9JREPjga7kv6HpoLzmnaHku7bjgYzopovjgaTjgYvjgaPjgZ/loLTlkIjjga/jgIHjgZ3jgozjgpLov5TjgZlcblx0XHRcdGlmIChzdGF0ZW1lbnQuQ29uZGl0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZW1lbnQuQ29uZGl0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHQvLyBHaXRIdWIgT0lEQ+OBruS/oemgvOadoeS7tuOBjOimi+OBpOOBi+OCieOBquOBi+OBo+OBn+WgtOWQiOOBr+OCqOODqeODvOOCkuOCueODreODvOOBmeOCi1xuXHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBPSURDIHRydXN0IGNvbmRpdGlvbiB3YXMgbm90IGZvdW5kIGluIElBTSByb2xlJyk7XG59XG4vLyBHaXRIdWIgT0lEQ+OBruOCteODluOCr+ODrOODvOODoOOCkuadoeS7tuOBi+OCieaKveWHuuOBmeOCi+ODpuODvOODhuOCo+ODquODhuOCo+mWouaVsFxuZnVuY3Rpb24gZ2V0R2l0aHViU3Vicyhjb25kaXRpb246IE9pZGNDb25kaXRpb24pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHJhd1N1YnMgPSBjb25kaXRpb24uU3RyaW5nTGlrZT8uW0dJVEhVQl9TVUJfQ0xBSU1dO1xuXHQvLyDjgrXjg5bjgq/jg6zjg7zjg6DjgYzphY3liJfjgafjgYLjgozjgbDjgZ3jga7jgb7jgb7ov5TjgZfjgIHmloflrZfliJfjgafjgYLjgozjgbDphY3liJfjgavlpInmj5vjgZfjgabov5TjgZnjgILjganjgaHjgonjgafjgoLjgarjgYTloLTlkIjjga/nqbrphY3liJfjgpLov5TjgZnjgIJcblx0aWYgKEFycmF5LmlzQXJyYXkocmF3U3VicykpIHtcblx0XHRyZXR1cm4gcmF3U3Vicztcblx0fVxuXHRyZXR1cm4gdHlwZW9mIHJhd1N1YnMgPT09ICdzdHJpbmcnID8gW3Jhd1N1YnNdIDogW107XG59XG4vLyBHaXRIdWIgT0lEQ+OBruOCteODluOCr+ODrOODvOODoOOBjOani+mAoOWMluOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkuaknOiovOOBmeOCi+ODpuODvOODhuOCo+ODquODhuOCo+mWouaVsFxuZnVuY3Rpb24gYXNzZXJ0U3RydWN0dXJlZEdpdGh1YlN1YnMoc3Viczogc3RyaW5nW10pOiB2b2lkIHtcblx0Ly8g5ZCE44K144OW44Kv44Os44O844Og44GM5q2j44GX44GE5qeL6YCg44KS5oyB44Gj44Gm44GE44KL44GT44Go44KS56K66KqN44GZ44KLXG5cdGZvciAoY29uc3Qgc3ViIG9mIHN1YnMpIHtcblx0XHRleHBlY3Qoc3ViKS50b01hdGNoKEdJVEhVQl9TVUJfU1RSVUNUVVJFX1JFR0VYKTtcblx0XHRleHBlY3Qoc3ViKS5ub3QudG9NYXRjaCgvWz8qXS8pO1xuXHR9XG59XG5cbi8vIEJldnlQbGF0Zm9ybUluZnJhU3RhY2vjga7jg6bjg4vjg4Pjg4jjg4bjgrnjg4hcbmRlc2NyaWJlKCdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywgKCkgPT4ge1xuXHR0ZXN0KCdjcmVhdGVzIFMzIGJ1Y2tldCBhbmQgR2l0SHViIEFjdGlvbnMgcm9sZSB3aXRoIGJyYW5jaC1zY29wZWQgdHJ1c3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIFMz44OQ44Kx44OD44OI44GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMik7XG5cdFx0Ly8g44OX44Op44Kk44Oe44Oq5oiQ5p6c54mp44OQ44Kx44OD44OI5ZCN44GM5ZG95ZCN6KaP5YmH44Gr5rK/44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRMb2dGaWxlUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOWQjeOBjOWRveWQjeimj+WJh+OBq+ayv+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBq+OBr+ODreOCsOOBruW+queSsOWPgueFp+OCkumBv+OBkeOCi+OBn+OCgeOAgUxvZ2dpbmdDb25maWd1cmF0aW9u44GM6Kit5a6a44GV44KM44Gm44GE44Gq44GE44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKExPR19CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2guYWJzZW50KCksXG5cdFx0fSk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga7kv6HpoLzjg53jg6rjgrfjg7zjgYzmraPjgZfjgY/oqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBvaWRjQ29uZGl0aW9uID0gZ2V0R2l0aHViT2lkY0NvbmRpdGlvbih0ZW1wbGF0ZSk7XG5cdFx0ZXhwZWN0KG9pZGNDb25kaXRpb24uU3RyaW5nRXF1YWxzKS50b0VxdWFsKHtcblx0XHRcdFtHSVRIVUJfQVVEX0NMQUlNXTogJ3N0cy5hbWF6b25hd3MuY29tJyxcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzID0gZ2V0R2l0aHViU3VicyhvaWRjQ29uZGl0aW9uKTtcblx0XHRleHBlY3Qoc3VicykudG9FcXVhbChbXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuXHRcdF0pO1xuXHRcdGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnMpO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44GuQVJO44GM44K544K/44OD44Kv44Gu5Ye65Yqb44Gr5ZCr44G+44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzT3V0cHV0KCdHaXRodWJBY3Rpb25zUm9sZUFybicsIHt9KTtcblx0fSk7XG5cdC8vIGdpdGh1YkJyYW5jaOOCkuaMh+WumuOBl+OBquOBhOWgtOWQiOOAgW1haW7jgahtYXN0ZXLjga7kuKHmlrnjgYzoqLHlj6/jgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0dGVzdCgnYWxsb3dzIGJvdGggbWFpbi9tYXN0ZXIgYnkgZGVmYXVsdCB3aGVuIGdpdGh1YkJyYW5jaCBpcyBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlEZWZhdWx0QnJhbmNoU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44Gu5L+h6aC844Od44Oq44K344O844GMbWFpbuOBqG1hc3RlcuOBruS4oeaWueOCkuioseWPr+OBl+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IG9pZGNDb25kaXRpb24gPSBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlKTtcblx0XHRleHBlY3Qob2lkY0NvbmRpdGlvbi5TdHJpbmdFcXVhbHMpLnRvRXF1YWwoe1xuXHRcdFx0W0dJVEhVQl9BVURfQ0xBSU1dOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1YnMgPSBnZXRHaXRodWJTdWJzKG9pZGNDb25kaXRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkU3VicyA9IFtcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21hc3RlcicsXG5cdFx0XTtcblx0XHRleHBlY3Qoc3VicykudG9IYXZlTGVuZ3RoKDIpO1xuXHRcdGV4cGVjdChbLi4uc3Vic10uc29ydCgpKS50b0VxdWFsKFsuLi5leHBlY3RlZFN1YnNdLnNvcnQoKSk7XG5cdFx0YXNzZXJ0U3RydWN0dXJlZEdpdGh1YlN1YnMoc3Vicyk7XG5cdH0pO1xuXG5cdC8vIGVudi5hY2NvdW5044GM5piO56S655qE44Gr6Kit5a6a44GV44KM44Gm44GE44Gq44GE5aC05ZCI44KE54Sh5Yq544Gq5YCk44GM6Kit5a6a44GV44KM44Gm44GE44KL5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBhY2NvdW50IGlzIG1pc3Npbmcgb3IgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJ2FiYycsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBHaXRIdWIgT0lEQyBjb250ZXh0IGlzIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0byBvcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkR2l0aHViT3duZXJTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX09XTkVSX0VSUk9SX1JFR0VYKTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybTppbmZyYScsXG5cdFx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YlJlcG9TdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluKicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YkJyYW5jaFdpbGRjYXJkU3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhJTlZBTElEX0dJVEhVQl9CUkFOQ0hfV0lMRENBUkRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICcvbWFpbicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YkJyYW5jaEZvcm1hdFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coSU5WQUxJRF9HSVRIVUJfQlJBTkNIX0ZPUk1BVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBzZWNvbmRhcnlCdWNrZXRBcm4gaXMgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZFNlY29uZGFyeUJ1Y2tldEFyblN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdpbnZhbGlkLWFybicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfU0VDT05EQVJZX0JVQ0tFVF9BUk5fRVJST1JfUkVHRVgpO1xuXHR9KTtcbn0pO1xuXG4vLyBTZWNvbmRhcnlCdWNrZXRTdGFja+OBruODpuODi+ODg+ODiOODhuOCueODiFxuZGVzY3JpYmUoJ1NlY29uZGFyeUJ1Y2tldFN0YWNrJywgKCkgPT4ge1xuXHQvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgYzjgrvjgq3jg6XjgqLjgarjg4fjg5Xjgqnjg6vjg4joqK3lrprjgafkvZzmiJDjgZXjgozjgIHlkb3lkI3opo/liYfjgavlvpPjgaPjgabjgYTjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgnY3JlYXRlcyBzZWNvbmRhcnkgYnVja2V0cyB3aXRoIHNlY3VyZSBkZWZhdWx0cyBhbmQgZXhwZWN0ZWQgbmFtaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ1NlY29uZGFyeUJ1Y2tldEFzc2VydGlvbnNTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdH0pO1xuXHRcdC8vIOODhuODs+ODl+ODrOODvOODiOOBi+OCieODquOCveODvOOCueOBruWtmOWcqOOBqOODl+ODreODkeODhuOCo+OCkuaknOiovFxuXHRcdGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblx0XHQvLyBTM+ODkOOCseODg+ODiOOBjDLjgaTkvZzmiJDjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDIpO1xuXHRcdC8vIOODkOOCseODg+ODiOODneODquOCt+ODvOOBjDLjgaTkvZzmiJDjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo3vvIjjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgajjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjga7kuKHmlrnjgavlv4XopoHjgarjgZ/jgoHvvIlcblx0XHR0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldFBvbGljeScsIDIpO1xuXG5cdFx0Ly8g44K744Kr44Oz44OA44Oq5pys5L2T44OQ44Kx44OD44OI44Gu5Li76KaB6Kit5a6a44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFNFQ09OREFSWV9CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHQvLyDjgrvjgq3jg6Xjg6rjg4bjgqPlvLfljJbjga7jgZ/jgoHjgIFQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb27jgYzjgZnjgbnjgaZ0cnVl44Gn6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0XHRQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0QmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcblx0XHRcdFx0SWdub3JlUHVibGljQWNsczogdHJ1ZSxcblx0XHRcdFx0UmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdC8vIOODkOOCseODg+ODiOaal+WPt+WMluOBjOioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqje+8iOWFt+S9k+eahOOBquioreWumuOBr01hdGNoLmFueVZhbHVlKCnjgafoqLHlrrnvvIlcblx0XHRcdEJ1Y2tldEVuY3J5cHRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFueVZhbHVlKCksXG5cdFx0XHR9KSxcblx0XHRcdC8vIOODkOOCseODg+ODiOOBruODkOODvOOCuOODp+ODi+ODs+OCsOOBjOacieWKueOBq+OBquOBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0VmVyc2lvbmluZ0NvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0U3RhdHVzOiAnRW5hYmxlZCcsXG5cdFx0XHR9LFxuXHRcdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44GM44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gr5L+d5a2Y44GV44KM44KL44KI44GG44Gr44CBTG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzmraPjgZfjgY/oqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0TG9nRmlsZVByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG5cdFx0XHR9KSxcblx0XHRcdC8vIOODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OBjOioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqje+8iOWPpOOBhOODk+ODq+ODieOCkjMw5pel5b6M44Gr5YmK6Zmk44GX44CB6Z2e54++6KGM44OQ44O844K444On44Oz44KSN+aXpeW+jOOBq+WJiumZpOOBmeOCi+ODq+ODvOODq+OBjOOBguOCi+OBk+OBqOOCkueiuuiqje+8iVxuXHRcdFx0TGlmZWN5Y2xlQ29uZmlndXJhdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuXHRcdFx0XHRcdE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRcdFx0SWQ6ICdFeHBpcmVPbGRCdWlsZHMnLFxuXHRcdFx0XHRcdFx0U3RhdHVzOiAnRW5hYmxlZCcsXG5cdFx0XHRcdFx0XHRFeHBpcmF0aW9uSW5EYXlzOiAzMCxcblx0XHRcdFx0XHRcdE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFx0XHRcdE5vbmN1cnJlbnREYXlzOiA3LFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cblx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjga/lkb3lkI3opo/liYfjgavlkIjoh7TjgZfjgIHjg43jgrnjg4jjgZfjgZ/jg63jgrDoqK3lrprjgpLmjIHjgZ/jgarjgYRcblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoU0VDT05EQVJZX0xPR19CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHQvLyDjgrvjgq3jg6Xjg6rjg4bjgqPlvLfljJbjga7jgZ/jgoHjgIFQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb27jgYzjgZnjgbnjgaZ0cnVl44Gn6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0XHRQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0QmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuXHRcdFx0XHRCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcblx0XHRcdFx0SWdub3JlUHVibGljQWNsczogdHJ1ZSxcblx0XHRcdFx0UmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdC8vIOODkOOCseODg+ODiOaal+WPt+WMluOBjOioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqje+8iOWFt+S9k+eahOOBquioreWumuOBr01hdGNoLmFueVZhbHVlKCnjgafoqLHlrrnvvIlcblx0XHRcdEJ1Y2tldEVuY3J5cHRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFueVZhbHVlKCksXG5cdFx0XHR9KSxcblx0XHRcdC8vIGxvZ2dpbmdDb25maWd1cmF0aW9u44GM6Kit5a6a44GV44KM44Gm44GE44Gq44GE44GT44Go44KS56K66KqN77yI44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr44Gv44Ot44Kw44Gu5b6q55Kw5Y+C54Wn44KS6YG/44GR44KL44Gf44KB44CBTG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzoqK3lrprjgZXjgozjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo3vvIlcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5hYnNlbnQoKSxcblx0XHR9KTtcblx0XHQvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjga5BUk7jgYzjgrnjgr/jg4Pjgq/jga7lh7rlipvjgavlkKvjgb7jgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1NlY29uZGFyeUJ1Y2tldE5hbWVFeHBvcnQnLCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBhY2NvdW50IGlzIG1pc3Npbmcgb3IgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnTWlzc2luZ0FjY291bnRTZWNvbmRhcnlTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnSW52YWxpZEFjY291bnRTZWNvbmRhcnlTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcnLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRcdGVudk5hbWU6ICd0ZXN0Jyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xufSk7XG4iXX0=