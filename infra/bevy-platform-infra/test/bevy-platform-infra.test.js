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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSwyQkFBMkIsR0FBRyx3REFBd0QsQ0FBQztBQUM3RixNQUFNLCtCQUErQixHQUFHLDZEQUE2RCxDQUFDO0FBQ3RHLE1BQU0sNEJBQTRCLEdBQUcsbUVBQW1FLENBQUM7QUFDekcsTUFBTSxnQ0FBZ0MsR0FBRyxnRUFBZ0UsQ0FBQztBQUMxRyxNQUFNLCtCQUErQixHQUFHLGtGQUFrRixDQUFDO0FBQzNILE1BQU0sMENBQTBDLEdBQUcscUVBQXFFLENBQUM7QUFDekgsTUFBTSx3Q0FBd0MsR0FBRywyQ0FBMkMsQ0FBQztBQUM3RixNQUFNLHdDQUF3QyxHQUFHLG1EQUFtRCxDQUFDO0FBQ3JHLE1BQU0scUNBQXFDLEdBQUcsdUVBQXVFLENBQUM7QUFDdEgsTUFBTSxpREFBaUQsR0FBRyxpRUFBaUUsQ0FBQztBQUM1SCxNQUFNLDZCQUE2QixHQUFHLDhDQUE4QyxDQUFDO0FBQ3JGLG1DQUFtQztBQUNuQyxNQUFNLGdCQUFnQixHQUFHLHlDQUF5QyxDQUFDO0FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcseUNBQXlDLENBQUM7QUFDbkUsc0NBQXNDO0FBQ3RDLDhDQUE4QztBQUM5QywyREFBMkQ7QUFDM0QsTUFBTSwwQkFBMEIsR0FBRyx1REFBdUQsQ0FBQztBQW9CM0YseUNBQXlDO0FBQ3pDLFNBQVMsc0JBQXNCLENBQUMsUUFBa0I7SUFDakQsa0RBQWtEO0lB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O2FBQ2YsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFFekMsTUFBTSxDQUFDLEdBQUcsRUFBRTtZQUNYLElBQUksNkNBQW9CLENBQUMsR0FBRyxFQUFFLDhCQUE4QixFQUFFO2dCQUM3RCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUU7Z0JBQ3pDLE9BQU8sRUFBRSxNQUFNO2FBQ2YsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLDRCQUE0QixDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFDSCwwREFBMEQ7SUFDMUQsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtRQUM3RCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFDdkIsT0FBTyxFQUFFO2dCQUNSLEdBQUcsRUFBRSxTQUFTO2FBQ2Q7U0FDRCxDQUFDLENBQUM7UUFDSCx3RUFBd0U7UUFDeEUsTUFBTSxLQUFLLEdBQUcsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsNkJBQTZCLEVBQUU7WUFDMUUsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1lBQ3JELE9BQU8sRUFBRSxTQUFTO1NBQ2xCLENBQUMsQ0FBQztRQUNILDBEQUEwRDtRQUMxRCxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FDcEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLENBQzlFLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IE1hdGNoLCBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuXG4vLyDmraPopo/ooajnj77jgpLlrprnvqnjgZfjgabjgIHjg5DjgrHjg4Pjg4jlkI3jga7lkb3lkI3opo/liYfjgpLmpJzoqLxcbmNvbnN0IFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLShkZXZ8dGVzdHxzdGd8cHJvZCktXFxcXGR7MTJ9JCc7XG5jb25zdCBMT0dfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLWxvZ3MtKGRldnx0ZXN0fHN0Z3xwcm9kKS1cXFxcZHsxMn0kJztcbmNvbnN0IFNFQ09OREFSWV9CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtKGRldnx0ZXN0fHN0Z3xwcm9kKS1zZWNvbmRhcnktXFxcXGR7MTJ9JCc7XG5jb25zdCBTRUNPTkRBUllfTE9HX0JVQ0tFVF9OQU1FX1JFR0VYID0gJ15iZXZ5LWFydGlmYWN0cy1sb2dzLShkZXZ8dGVzdHxzdGd8cHJvZCktc2Vjb25kYXJ5LVxcXFxkezEyfSQnO1xuY29uc3QgRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCA9IC9lbnZcXC5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC9pO1xuY29uc3QgSU5WQUxJRF9HSVRIVUJfT1dORVJfRVJST1JfUkVHRVggPSAvZ2l0aHViT3duZXIgbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX1JFUE9fRVJST1JfUkVHRVggPSAvZ2l0aHViUmVwbyBtdXN0IGNvbnRhaW4gb25seSBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCB1bmRlcnNjb3JlcywgYW5kIGh5cGhlbnNcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9XSUxEQ0FSRF9FUlJPUl9SRUdFWCA9IC9naXRodWJCcmFuY2ggbXVzdCBub3QgY29udGFpbiB3aWxkY2FyZCBjaGFyYWN0ZXJzIFxcKFxcKiwgXFw/LCBcXFtcXClcXC4vaTtcbmNvbnN0IElOVkFMSURfR0lUSFVCX0JSQU5DSF9GT1JNQVRfRVJST1JfUkVHRVggPSAvZ2l0aHViQnJhbmNoIG11c3QgYmUgYSB2YWxpZCByZWYgc2VnbWVudC9pO1xuY29uc3QgSU5WQUxJRF9TRUNPTkRBUllfQlVDS0VUX0FSTl9FUlJPUl9SRUdFWCA9IC9zZWNvbmRhcnlCdWNrZXRBcm4gbXVzdCBiZSBhIHZhbGlkIFMzIGJ1Y2tldCBBUk4vaTtcbmNvbnN0IFBST0RfUExBQ0VIT0xERVJfVkFMSURBVEVfRVJST1JfUkVHRVggPSAvaW4gZW52PXByb2QsIGdpdGh1Ym93bmVyIGFuZCBnaXRodWJyZXBvIHBsYWNlaG9sZGVycyBhcmUgbm90IGFsbG93ZWQvaTtcbmNvbnN0IFNFQ09OREFSWV9CVUNLRVRfQ09OU0lTVEVOQ1lfVkFMSURBVEVfRVJST1JfUkVHRVggPSAvc2Vjb25kYXJ5YnVja2V0YXJuIG11c3QgdGFyZ2V0IC4qIGZvciBlbnZcXC9hY2NvdW50IGNvbnNpc3RlbmN5L2k7XG5jb25zdCBFTlZfTkFNRV9WQUxJREFURV9FUlJPUl9SRUdFWCA9IC9lbnZuYW1lIG11c3QgYmUgb25lIG9mIGRldiwgdGVzdCwgc3RnLCBwcm9kL2k7XG4vLyBHaXRIdWIgT0lEQ+OCteODluOCr+ODrOODvOODoOOBruani+mAoOOCkuaknOiovOOBmeOCi+OBn+OCgeOBruato+imj+ihqOePvlxuY29uc3QgR0lUSFVCX0FVRF9DTEFJTSA9ICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnO1xuY29uc3QgR0lUSFVCX1NVQl9DTEFJTSA9ICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInO1xuLy8gR2l0SHViIE9JREPjgrXjg5bjgq/jg6zjg7zjg6Djga/jgIHku6XkuIvjga7lvaLlvI/jgafjgYLjgovlv4XopoHjgYzjgYLjgorjgb7jgZk6XG4vLyByZXBvOntvd25lcn0ve3JlcG99OnJlZjpyZWZzL2hlYWRzL3ticmFuY2h9XG4vLyDkvos6IHJlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYWluXG5jb25zdCBHSVRIVUJfU1VCX1NUUlVDVFVSRV9SRUdFWCA9IC9ecmVwbzpbXi9dK1xcL1teOl0rOnJlZjpyZWZzXFwvaGVhZHNcXC9bQS1aYS16MC05Ll8vLV0rJC87XG5cbi8vIEJldnlQbGF0Zm9ybUluZnJhU3RhY2vjgahTZWNvbmRhcnlCdWNrZXRTdGFja+OBruS4oeaWueOBp+OAgWVudi5hY2NvdW5044GM5piO56S655qE44Gr6Kit5a6a44GV44KM44Gm44GE44Gq44GE5aC05ZCI44KE54Sh5Yq544Gq5YCk44GM6Kit5a6a44GV44KM44Gm44GE44KL5aC05ZCI44Gr44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44Gf44KB44Gu44Om44OL44OD44OI44OG44K544OI44KS6L+95YqgXG5pbnRlcmZhY2UgT2lkY0NvbmRpdGlvbiB7XG5cdFN0cmluZ0VxdWFscz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFN0cmluZ0xpa2U/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT47XG59XG5cbmludGVyZmFjZSBJYW1Qb2xpY3lSZXNvdXJjZSB7XG5cdFByb3BlcnRpZXM/OiB7XG5cdFx0UG9saWN5TmFtZT86IHN0cmluZztcblx0XHRQb2xpY3lEb2N1bWVudD86IHtcblx0XHRcdFN0YXRlbWVudD86IEFycmF5PHtcblx0XHRcdFx0QWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdFx0XHRcdFJlc291cmNlPzogdW5rbm93bjtcblx0XHRcdH0+O1xuXHRcdH07XG5cdH07XG59XG5cbi8vIEdpdEh1YiBPSURD44Gu5L+h6aC85p2h5Lu244KS44OG44Oz44OX44Os44O844OI44GL44KJ5oq95Ye644GZ44KL44Om44O844OG44Kj44Oq44OG44Kj6Zai5pWwXG5mdW5jdGlvbiBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IE9pZGNDb25kaXRpb24ge1xuXHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgolJQU3jg63jg7zjg6vjgpLjgZnjgbnjgablj5blvpfjgZfjgIFHaXRIdWIgT0lEQ+OCkuS/oemgvOOBmeOCi+ODreODvOODq+OBruadoeS7tuOCkuaOouOBmVxuXHRjb25zdCByb2xlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6SUFNOjpSb2xlJykgYXMgUmVjb3JkPHN0cmluZywge1xuXHRcdC8vIEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudOOBruani+mAoOOBr+OAgVN0YXRlbWVudOOBjOmFjeWIl+OBp+OBguOCi+OBk+OBqOOBjOS4gOiIrOeahOOBp+OBmeOBjOOAgeW/teOBruOBn+OCgeWei+OCkuW6g+OBj+WPluOCi1xuXHRcdFByb3BlcnRpZXM/OiB7XG5cdFx0XHRBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ/OiB7XG5cdFx0XHRcdC8vIFN0YXRlbWVudOOBr+mFjeWIl+OBp+OBguOCi+OBk+OBqOOBjOS4gOiIrOeahOOBp+OBmeOBjOOAgUFXUyBDREvjga7nlJ/miJDjgZnjgovjg4bjg7Pjg5fjg6zjg7zjg4jjgafjga/jgqrjg5bjgrjjgqfjgq/jg4jjgavjgarjgovjgZPjgajjgoLjgYLjgovjgZ/jgoHjgIHkuKHmlrnjgavlr77lv5zjgafjgY3jgovjgojjgYbjgavjgZnjgotcblx0XHRcdFx0U3RhdGVtZW50PzogQXJyYXk8eyBBY3Rpb24/OiBzdHJpbmcgfCBzdHJpbmdbXTsgQ29uZGl0aW9uPzogT2lkY0NvbmRpdGlvbiB9Pjtcblx0XHRcdH07XG5cdFx0fTtcblx0fT47XG5cdC8vIEdpdEh1YiBPSURD44KS5L+h6aC844GZ44KL44Ot44O844Or44Gu5p2h5Lu244KS6KaL44Gk44GR44KL44Gf44KB44Gr44CB44GZ44G544Gm44Gu44Ot44O844Or44KS44Or44O844OX44GX44Gm56K66KqN44GZ44KLXG5cdGZvciAoY29uc3Qgcm9sZSBvZiBPYmplY3QudmFsdWVzKHJvbGVzKSkge1xuXHRcdGNvbnN0IHN0YXRlbWVudHMgPSByb2xlLlByb3BlcnRpZXM/LkFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudD8uU3RhdGVtZW50O1xuXHRcdC8vIFN0YXRlbWVudOOBjOmFjeWIl+OBp+OBquOBhOWgtOWQiOOBr+OCueOCreODg+ODl+OBmeOCi1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0ZW1lbnRzKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIOWQhFN0YXRlbWVudOOCkueiuuiqjeOBl+OBpuOAgXN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR544KS6Kix5Y+v44GZ44KL44KC44Gu44KS5o6i44GZXG5cdFx0Zm9yIChjb25zdCBzdGF0ZW1lbnQgb2Ygc3RhdGVtZW50cykge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IEFycmF5LmlzQXJyYXkoc3RhdGVtZW50LkFjdGlvbikgPyBzdGF0ZW1lbnQuQWN0aW9uIDogW3N0YXRlbWVudC5BY3Rpb25dO1xuXHRcdFx0Ly8gc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHnjgpLoqLHlj6/jgZnjgotTdGF0ZW1lbnTjgafjgarjgYTloLTlkIjjga/jgrnjgq3jg4Pjg5fjgZnjgotcblx0XHRcdGlmICghYWN0aW9ucy5pbmNsdWRlcygnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIEdpdEh1YiBPSURD44Gu5L+h6aC85p2h5Lu244GM6KaL44Gk44GL44Gj44Gf5aC05ZCI44Gv44CB44Gd44KM44KS6L+U44GZXG5cdFx0XHRpZiAoc3RhdGVtZW50LkNvbmRpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGVtZW50LkNvbmRpdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Ly8gR2l0SHViIE9JREPjga7kv6HpoLzmnaHku7bjgYzopovjgaTjgYvjgonjgarjgYvjgaPjgZ/loLTlkIjjga/jgqjjg6njg7zjgpLjgrnjg63jg7zjgZnjgotcblx0dGhyb3cgbmV3IEVycm9yKCdHaXRIdWIgT0lEQyB0cnVzdCBjb25kaXRpb24gd2FzIG5vdCBmb3VuZCBpbiBJQU0gcm9sZScpO1xufVxuLy8gR2l0SHViIE9JREPjga7jgrXjg5bjgq/jg6zjg7zjg6DjgpLmnaHku7bjgYvjgonmir3lh7rjgZnjgovjg6bjg7zjg4bjgqPjg6rjg4bjgqPplqLmlbBcbmZ1bmN0aW9uIGdldEdpdGh1YlN1YnMoY29uZGl0aW9uOiBPaWRjQ29uZGl0aW9uKTogc3RyaW5nW10ge1xuXHRjb25zdCByYXdTdWJzID0gY29uZGl0aW9uLlN0cmluZ0xpa2U/LltHSVRIVUJfU1VCX0NMQUlNXTtcblx0Ly8g44K144OW44Kv44Os44O844Og44GM6YWN5YiX44Gn44GC44KM44Gw44Gd44Gu44G+44G+6L+U44GX44CB5paH5a2X5YiX44Gn44GC44KM44Gw6YWN5YiX44Gr5aSJ5o+b44GX44Gm6L+U44GZ44CC44Gp44Gh44KJ44Gn44KC44Gq44GE5aC05ZCI44Gv56m66YWN5YiX44KS6L+U44GZ44CCXG5cdGlmIChBcnJheS5pc0FycmF5KHJhd1N1YnMpKSB7XG5cdFx0cmV0dXJuIHJhd1N1YnM7XG5cdH1cblx0cmV0dXJuIHR5cGVvZiByYXdTdWJzID09PSAnc3RyaW5nJyA/IFtyYXdTdWJzXSA6IFtdO1xufVxuLy8gR2l0SHViIE9JREPjga7jgrXjg5bjgq/jg6zjg7zjg6DjgYzmp4vpgKDljJbjgZXjgozjgabjgYTjgovjgZPjgajjgpLmpJzoqLzjgZnjgovjg6bjg7zjg4bjgqPjg6rjg4bjgqPplqLmlbBcbmZ1bmN0aW9uIGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdC8vIOWQhOOCteODluOCr+ODrOODvOODoOOBjOato+OBl+OBhOani+mAoOOCkuaMgeOBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi1xuXHRmb3IgKGNvbnN0IHN1YiBvZiBzdWJzKSB7XG5cdFx0ZXhwZWN0KHN1YikudG9NYXRjaChHSVRIVUJfU1VCX1NUUlVDVFVSRV9SRUdFWCk7XG5cdFx0ZXhwZWN0KHN1Yikubm90LnRvTWF0Y2goL1s/Kl0vKTtcblx0fVxufVxuXG4vLyBHaXRIdWIgQWN0aW9uc+ODreODvOODq+OBq+OCouOCv+ODg+ODgeOBleOCjOOBn+OCpOODs+ODqeOCpOODs+ODneODquOCt+ODvOOBrlN0YXRlbWVudOOCkuWPluW+l+OBmeOCi1xuZnVuY3Rpb24gZ2V0R2l0aHViQWN0aW9uc1BvbGljeVN0YXRlbWVudHModGVtcGxhdGU6IFRlbXBsYXRlKTogQXJyYXk8eyBBY3Rpb24/OiBzdHJpbmcgfCBzdHJpbmdbXTsgUmVzb3VyY2U/OiB1bmtub3duIH0+IHtcblx0Y29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6UG9saWN5JykgYXMgUmVjb3JkPHN0cmluZywgSWFtUG9saWN5UmVzb3VyY2U+O1xuXHRmb3IgKGNvbnN0IHBvbGljeSBvZiBPYmplY3QudmFsdWVzKHBvbGljaWVzKSkge1xuXHRcdGNvbnN0IHBvbGljeU5hbWUgPSBwb2xpY3kuUHJvcGVydGllcz8uUG9saWN5TmFtZTtcblx0XHRpZiAodHlwZW9mIHBvbGljeU5hbWUgPT09ICdzdHJpbmcnICYmIHBvbGljeU5hbWUuaW5jbHVkZXMoJ0dpdGh1YkFjdGlvbnNSb2xlRGVmYXVsdFBvbGljeScpKSB7XG5cdFx0XHRyZXR1cm4gcG9saWN5LlByb3BlcnRpZXM/LlBvbGljeURvY3VtZW50Py5TdGF0ZW1lbnQgPz8gW107XG5cdFx0fVxuXHR9XG5cdHRocm93IG5ldyBFcnJvcignR2l0SHViIEFjdGlvbnMgcm9sZSBpbmxpbmUgcG9saWN5IHdhcyBub3QgZm91bmQnKTtcbn1cblxuLy8gQmV2eVBsYXRmb3JtSW5mcmFTdGFja+OBruODpuODi+ODg+ODiOODhuOCueODiFxuZGVzY3JpYmUoJ0JldnlQbGF0Zm9ybUluZnJhU3RhY2snLCAoKSA9PiB7XG5cdHRlc3QoJ2NyZWF0ZXMgUzMgYnVja2V0IGFuZCBHaXRIdWIgQWN0aW9ucyByb2xlIHdpdGggYnJhbmNoLXNjb3BlZCB0cnVzdCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNeVRlc3RTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gUzPjg5DjgrHjg4Pjg4jjgYwy44Gk5L2c5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAyKTtcblx0XHQvLyDjg5fjg6njgqTjg57jg6rmiJDmnpznianjg5DjgrHjg4Pjg4jlkI3jgYzlkb3lkI3opo/liYfjgavmsr/jgaPjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoUFJJTUFSWV9CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdExvZ0ZpbGVQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI5ZCN44GM5ZG95ZCN6KaP5YmH44Gr5rK/44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr44Gv44Ot44Kw44Gu5b6q55Kw5Y+C54Wn44KS6YG/44GR44KL44Gf44KB44CBTG9nZ2luZ0NvbmZpZ3VyYXRpb27jgYzoqK3lrprjgZXjgozjgabjgYTjgarjgYTjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcblx0XHRcdEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoTE9HX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5hYnNlbnQoKSxcblx0XHR9KTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruS/oemgvOODneODquOCt+ODvOOBjOato+OBl+OBj+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IG9pZGNDb25kaXRpb24gPSBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlKTtcblx0XHRleHBlY3Qob2lkY0NvbmRpdGlvbi5TdHJpbmdFcXVhbHMpLnRvRXF1YWwoe1xuXHRcdFx0W0dJVEhVQl9BVURfQ0xBSU1dOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1YnMgPSBnZXRHaXRodWJTdWJzKG9pZGNDb25kaXRpb24pO1xuXHRcdGV4cGVjdChzdWJzKS50b0VxdWFsKFtcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0U3RydWN0dXJlZEdpdGh1YlN1YnMoc3Vicyk7XG5cdFx0Ly8gQ0RLIGJvb3RzdHJhcOODreODvOODq+OCkuW8leOBjeWPl+OBkeOCi+OBn+OCgeOBrlNUU+aoqemZkOOBjOWQq+OBvuOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IHBvbGljeVN0YXRlbWVudHMgPSBnZXRHaXRodWJBY3Rpb25zUG9saWN5U3RhdGVtZW50cyh0ZW1wbGF0ZSk7XG5cdFx0Y29uc3QgYXNzdW1lQm9vdHN0cmFwU3RhdGVtZW50ID0gcG9saWN5U3RhdGVtZW50cy5maW5kKChzdGF0ZW1lbnQpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBBcnJheS5pc0FycmF5KHN0YXRlbWVudC5BY3Rpb24pID8gc3RhdGVtZW50LkFjdGlvbiA6IFtzdGF0ZW1lbnQuQWN0aW9uXTtcblx0XHRcdHJldHVybiBhY3Rpb25zLmluY2x1ZGVzKCdzdHM6QXNzdW1lUm9sZScpICYmIGFjdGlvbnMuaW5jbHVkZXMoJ3N0czpUYWdTZXNzaW9uJyk7XG5cdFx0fSk7XG5cdFx0ZXhwZWN0KGFzc3VtZUJvb3RzdHJhcFN0YXRlbWVudCkudG9CZURlZmluZWQoKTtcblx0XHRjb25zdCByZXNvdXJjZUpzb24gPSBKU09OLnN0cmluZ2lmeShhc3N1bWVCb290c3RyYXBTdGF0ZW1lbnQ/LlJlc291cmNlKTtcblx0XHRleHBlY3QocmVzb3VyY2VKc29uKS50b0NvbnRhaW4oJ2Nkay1obmI2NTlmZHMtZGVwbG95LXJvbGUtMTIzNDU2Nzg5MDEyLScpO1xuXHRcdGV4cGVjdChyZXNvdXJjZUpzb24pLnRvQ29udGFpbignY2RrLWhuYjY1OWZkcy1maWxlLXB1Ymxpc2hpbmctcm9sZS0xMjM0NTY3ODkwMTItJyk7XG5cdFx0ZXhwZWN0KHJlc291cmNlSnNvbikudG9Db250YWluKCdjZGstaG5iNjU5ZmRzLWltYWdlLXB1Ymxpc2hpbmctcm9sZS0xMjM0NTY3ODkwMTItJyk7XG5cdFx0ZXhwZWN0KHJlc291cmNlSnNvbikudG9Db250YWluKCdjZGstaG5iNjU5ZmRzLWxvb2t1cC1yb2xlLTEyMzQ1Njc4OTAxMi0nKTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBrkFSTuOBjOOCueOCv+ODg+OCr+OBruWHuuWKm+OBq+WQq+OBvuOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc091dHB1dCgnR2l0aHViQWN0aW9uc1JvbGVBcm4nLCB7fSk7XG5cdH0pO1xuXHQvLyBnaXRodWJCcmFuY2jjgpLmjIflrprjgZfjgarjgYTloLTlkIjjgIFtYWlu44GobWFzdGVy44Gu5Lih5pa544GM6Kix5Y+v44GV44KM44KL44GT44Go44KS56K66KqNXG5cdHRlc3QoJ2FsbG93cyBib3RoIG1haW4vbWFzdGVyIGJ5IGRlZmF1bHQgd2hlbiBnaXRodWJCcmFuY2ggaXMgb21pdHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIHjg4bjg7Pjg5fjg6zjg7zjg4jjgpLlj5blvpdcblx0XHRjb25zdCBzdGFjayA9IG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ015RGVmYXVsdEJyYW5jaFN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXHRcdC8vIOODhuODs+ODl+ODrOODvOODiOOBi+OCieODquOCveODvOOCueOBruWtmOWcqOOBqOODl+ODreODkeODhuOCo+OCkuaknOiovFxuXHRcdGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruS/oemgvOODneODquOCt+ODvOOBjG1haW7jgahtYXN0ZXLjga7kuKHmlrnjgpLoqLHlj6/jgZfjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBvaWRjQ29uZGl0aW9uID0gZ2V0R2l0aHViT2lkY0NvbmRpdGlvbih0ZW1wbGF0ZSk7XG5cdFx0ZXhwZWN0KG9pZGNDb25kaXRpb24uU3RyaW5nRXF1YWxzKS50b0VxdWFsKHtcblx0XHRcdFtHSVRIVUJfQVVEX0NMQUlNXTogJ3N0cy5hbWF6b25hd3MuY29tJyxcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzID0gZ2V0R2l0aHViU3VicyhvaWRjQ29uZGl0aW9uKTtcblx0XHRjb25zdCBleHBlY3RlZFN1YnMgPSBbXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuXHRcdFx0J3JlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYXN0ZXInLFxuXHRcdF07XG5cdFx0ZXhwZWN0KHN1YnMpLnRvSGF2ZUxlbmd0aCgyKTtcblx0XHRleHBlY3QoWy4uLnN1YnNdLnNvcnQoKSkudG9FcXVhbChbLi4uZXhwZWN0ZWRTdWJzXS5zb3J0KCkpO1xuXHRcdGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnMpO1xuXHR9KTtcblxuXHQvLyBlbnYuYWNjb3VudOOBjOaYjuekuueahOOBq+ioreWumuOBleOCjOOBpuOBhOOBquOBhOWgtOWQiOOChOeEoeWKueOBquWApOOBjOioreWumuOBleOCjOOBpuOBhOOCi+WgtOWQiOOBq+OCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCdmYWlscyBmYXN0IHdoZW4gYWNjb3VudCBpcyBtaXNzaW5nIG9yIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTWlzc2luZ0FjY291bnRTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEFjY291bnRTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICdhYmMnLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXHR9KTtcblx0Ly8gR2l0SHViIE9JREPjga7jgrPjg7Pjg4bjgq3jgrnjg4jlgKTjgYznhKHlirnjgarloLTlkIjjgavjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIEdpdEh1YiBPSURDIGNvbnRleHQgaXMgaW52YWxpZCcsICgpID0+IHtcblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvIG9yZycsXG5cdFx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBnaXRodWJPd25lcuOBq+OCueODmuODvOOCueOBjOWQq+OBvuOCjOOBpuOBhOOCi+OBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1Yk93bmVyU3RhY2snLCB7XG5cdFx0XHRcdC8vIGVudi5hY2NvdW5044Gu44Ko44Op44O844KS5Zue6YG/44GZ44KL44Gf44KB44Gr44CBYWNjb3VudOOBr+acieWKueOBquWApOOCkuaMh+WumlxuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHQvLyBzZWNvbmRhcnlCdWNrZXRBcm7jga/mnInlirnjgarlgKTjgpLmjIflrprjgZfjgabjgIFnaXRodWJPd25lcuOBruODkOODquODh+ODvOOCt+ODp+ODs+OCqOODqeODvOOBruOBv+OBjOeZuueUn+OBmeOCi+OCiOOBhuOBq+OBmeOCi1xuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdFx0Ly8g44GT44GT44Gn44Gv44CBZ2l0aHViT3duZXLjgavjgrnjg5rjg7zjgrnjgYzlkKvjgb7jgozjgabjgYTjgovjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX09XTkVSX0VSUk9SX1JFR0VYKTtcblxuXHRcdC8vIGdpdGh1YlJlcG/jgavjgrnjg5rjg7zjgrnjgYzlkKvjgb7jgozjgabjgYTjgovjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm06aW5mcmEnLFxuXHRcdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBnaXRodWJSZXBv44Gr44K544Oa44O844K544GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkR2l0aHViUmVwb1N0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coSU5WQUxJRF9HSVRIVUJfUkVQT19FUlJPUl9SRUdFWCk7XG5cblx0XHQvLyBnaXRodWJCcmFuY2jjgavjg6/jgqTjg6vjg4njgqvjg7zjg4nmloflrZfjgYzlkKvjgb7jgozjgabjgYTjgovjgZ/jgoHjgIHjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4qJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gZ2l0aHViQnJhbmNo44Gr44Ov44Kk44Or44OJ44Kr44O844OJ5paH5a2X44GM5ZCr44G+44KM44Gm44GE44KL44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkR2l0aHViQnJhbmNoV2lsZGNhcmRTdGFjaycsIHtcblx0XHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KElOVkFMSURfR0lUSFVCX0JSQU5DSF9XSUxEQ0FSRF9FUlJPUl9SRUdFWCk7XG5cdFx0Ly8gZ2l0aHViQnJhbmNo44Gu5b2i5byP44GM54Sh5Yq544Gq44Gf44KB44CB44Ko44Op44O844GM44K544Ot44O844GV44KM44KL44GT44Go44KS56K66KqNXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0XHRnaXRodWJCcmFuY2g6ICcvbWFpbicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdC8vIGdpdGh1YkJyYW5jaOOBruW9ouW8j+OBjOeEoeWKueOBquOBn+OCgeOAgeOCqOODqeODvOOBjOOCueODreODvOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0bmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnSW52YWxpZEdpdGh1YkJyYW5jaEZvcm1hdFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coSU5WQUxJRF9HSVRIVUJfQlJBTkNIX0ZPUk1BVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xuXHQvLyBzZWNvbmRhcnlCdWNrZXRBcm7jgYznhKHlirnjgarloLTlkIjjgavjgqjjg6njg7zjgYzjgrnjg63jg7zjgZXjgozjgovjgZPjgajjgpLnorroqo3jgZnjgovjg4bjgrnjg4hcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIHNlY29uZGFyeUJ1Y2tldEFybiBpcyBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkU2Vjb25kYXJ5QnVja2V0QXJuU3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2ludmFsaWQtYXJuJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coSU5WQUxJRF9TRUNPTkRBUllfQlVDS0VUX0FSTl9FUlJPUl9SRUdFWCk7XG5cdH0pO1xuXG5cdC8vIHByb2TnkrDlooPjgadHaXRIdWLjga7jg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zlgKTjgYzkvb/nlKjjgZXjgozjgabjgYTjgovloLTlkIjjgavjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+ODhuOCueODiFxuXHR0ZXN0KCd2YWxpZGF0ZSBwaGFzZSBmYWlscyBpbiBwcm9kIHdoZW4gR2l0SHViIHBsYWNlaG9sZGVycyBhcmUgdXNlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Byb2QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+OBn+OCgeOBq+OAgUdpdEh1YuOBruODl+ODrOODvOOCueODm+ODq+ODgOODvOWApOOCkuS9v+eUqOOBl+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnUHJvZFBsYWNlaG9sZGVyVmFsaWRhdGlvblN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy1wcm9kLXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXHRcdC8vIHZhbGlkYXRl44OV44Kn44O844K644Gn44CBcHJvZOeSsOWig+OBp0dpdEh1YuOBruODl+ODrOODvOOCueODm+ODq+ODgOODvOWApOOBjOS9v+eUqOOBleOCjOOBpuOBhOOCi+OBk+OBqOOBq+WvvuOBmeOCi+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGV4cGVjdChzdGFjay5ub2RlLnZhbGlkYXRlKCkpLnRvRXF1YWwoXG5cdFx0XHRleHBlY3QuYXJyYXlDb250YWluaW5nKFtleHBlY3Quc3RyaW5nTWF0Y2hpbmcoUFJPRF9QTEFDRUhPTERFUl9WQUxJREFURV9FUlJPUl9SRUdFWCldKSxcblx0XHQpO1xuXHR9KTtcblx0Ly8gc2Vjb25kYXJ5QnVja2V0QXJu44Gu55Kw5aKDL+OCouOCq+OCpuODs+ODiOOBjOOCueOCv+ODg+OCr+OBrmVuduOBqOS4gOiHtOOBl+OBquOBhOWgtOWQiOOBq+OAgXZhbGlkYXRl44OV44Kn44O844K644Gn44Ko44Op44O844GM6L+U44GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ3ZhbGlkYXRlIHBoYXNlIGZhaWxzIHdoZW4gc2Vjb25kYXJ5IGJ1Y2tldCBBUk4gZW52L2FjY291bnQgZG9lcyBub3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgXZhbGlkYXRl44OV44Kn44O844K644Gn44Ko44Op44O844GM6L+U44GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44Gf44KB44Gr44CBc2Vjb25kYXJ5QnVja2V0QXJu44Gu55Kw5aKDL+OCouOCq+OCpuODs+ODiOOBjOOCueOCv+ODg+OCr+OBrmVuduOBqOS4gOiHtOOBl+OBquOBhOOBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnU2Vjb25kYXJ5QXJuTWlzbWF0Y2hWYWxpZGF0aW9uU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLWRldi1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyB2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OAgXNlY29uZGFyeUJ1Y2tldEFybuOBrueSsOWigy/jgqLjgqvjgqbjg7Pjg4jjgYzjgrnjgr/jg4Pjgq/jga5lbnbjgajkuIDoh7TjgZfjgarjgYTjgZPjgajjgavlr77jgZnjgovjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRleHBlY3Qoc3RhY2subm9kZS52YWxpZGF0ZSgpKS50b0VxdWFsKFxuXHRcdFx0ZXhwZWN0LmFycmF5Q29udGFpbmluZyhbZXhwZWN0LnN0cmluZ01hdGNoaW5nKFNFQ09OREFSWV9CVUNLRVRfQ09OU0lTVEVOQ1lfVkFMSURBVEVfRVJST1JfUkVHRVgpXSksXG5cdFx0KTtcblx0fSk7XG59KTtcblxuLy8gU2Vjb25kYXJ5QnVja2V0U3RhY2vjga7jg6bjg4vjg4Pjg4jjg4bjgrnjg4hcbmRlc2NyaWJlKCdTZWNvbmRhcnlCdWNrZXRTdGFjaycsICgpID0+IHtcblx0Ly8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GM44K744Kt44Ol44Ki44Gq44OH44OV44Kp44Or44OI6Kit5a6a44Gn5L2c5oiQ44GV44KM44CB5ZG95ZCN6KaP5YmH44Gr5b6T44Gj44Gm44GE44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ2NyZWF0ZXMgc2Vjb25kYXJ5IGJ1Y2tldHMgd2l0aCBzZWN1cmUgZGVmYXVsdHMgYW5kIGV4cGVjdGVkIG5hbWluZycsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIHjg4bjg7Pjg5fjg6zjg7zjg4jjgpLlj5blvpdcblx0XHRjb25zdCBzdGFjayA9IG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdTZWNvbmRhcnlCdWNrZXRBc3NlcnRpb25zU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdGVudk5hbWU6ICd0ZXN0Jyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gUzPjg5DjgrHjg4Pjg4jjgYwy44Gk5L2c5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAyKTtcblx0XHQvLyDjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgYwy44Gk5L2c5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqN77yI44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Go44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gu5Lih5pa544Gr5b+F6KaB44Gq44Gf44KB77yJXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXRQb2xpY3knLCAyKTtcblxuXHRcdC8vIOOCu+OCq+ODs+ODgOODquacrOS9k+ODkOOCseODg+ODiOOBruS4u+imgeioreWumuOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChTRUNPTkRBUllfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0Ly8g44K744Kt44Ol44Oq44OG44Kj5by35YyW44Gu44Gf44KB44CBUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9u44GM44GZ44G544GmdHJ1ZeOBp+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0UHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdEJsb2NrUHVibGljQWNsczogdHJ1ZSxcblx0XHRcdFx0QmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG5cdFx0XHRcdElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHQvLyDjg5DjgrHjg4Pjg4jmmpflj7fljJbjgYzoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo3vvIjlhbfkvZPnmoTjgaroqK3lrprjga9NYXRjaC5hbnlWYWx1ZSgp44Gn6Kix5a6577yJXG5cdFx0XHRCdWNrZXRFbmNyeXB0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0U2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hbnlWYWx1ZSgpLFxuXHRcdFx0fSksXG5cdFx0XHQvLyDjg5DjgrHjg4Pjg4jjga7jg5Djg7zjgrjjg6fjg4vjg7PjgrDjgYzmnInlirnjgavjgarjgaPjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRcdFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFN0YXR1czogJ0VuYWJsZWQnLFxuXHRcdFx0fSxcblx0XHRcdC8vIOOCouOCr+OCu+OCueODreOCsOOBjOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBq+S/neWtmOOBleOCjOOCi+OCiOOBhuOBq+OAgUxvZ2dpbmdDb25maWd1cmF0aW9u44GM5q2j44GX44GP6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdExvZ0ZpbGVQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxuXHRcdFx0fSksXG5cdFx0XHQvLyDjg6njgqTjg5XjgrXjgqTjgq/jg6vjg6vjg7zjg6vjgYzoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo3vvIjlj6TjgYTjg5Pjg6vjg4njgpIzMOaXpeW+jOOBq+WJiumZpOOBl+OAgemdnuePvuihjOODkOODvOOCuOODp+ODs+OCkjfml6XlvozjgavliYrpmaTjgZnjgovjg6vjg7zjg6vjgYzjgYLjgovjgZPjgajjgpLnorroqo3vvIlcblx0XHRcdExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcblx0XHRcdFx0XHRNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0XHRcdElkOiAnRXhwaXJlT2xkQnVpbGRzJyxcblx0XHRcdFx0XHRcdFN0YXR1czogJ0VuYWJsZWQnLFxuXHRcdFx0XHRcdFx0RXhwaXJhdGlvbkluRGF5czogMzAsXG5cdFx0XHRcdFx0XHROb25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRcdFx0XHROb25jdXJyZW50RGF5czogNyxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXG5cdFx0Ly8g44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gv5ZG95ZCN6KaP5YmH44Gr5ZCI6Ie044GX44CB44ON44K544OI44GX44Gf44Ot44Kw6Kit5a6a44KS5oyB44Gf44Gq44GEXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFNFQ09OREFSWV9MT0dfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0Ly8g44K744Kt44Ol44Oq44OG44Kj5by35YyW44Gu44Gf44KB44CBUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9u44GM44GZ44G544GmdHJ1ZeOBp+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdFx0UHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdEJsb2NrUHVibGljQWNsczogdHJ1ZSxcblx0XHRcdFx0QmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG5cdFx0XHRcdElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG5cdFx0XHRcdFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHQvLyDjg5DjgrHjg4Pjg4jmmpflj7fljJbjgYzoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo3vvIjlhbfkvZPnmoTjgaroqK3lrprjga9NYXRjaC5hbnlWYWx1ZSgp44Gn6Kix5a6577yJXG5cdFx0XHRCdWNrZXRFbmNyeXB0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0U2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hbnlWYWx1ZSgpLFxuXHRcdFx0fSksXG5cdFx0XHQvLyBsb2dnaW5nQ29uZmlndXJhdGlvbuOBjOioreWumuOBleOCjOOBpuOBhOOBquOBhOOBk+OBqOOCkueiuuiqje+8iOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBq+OBr+ODreOCsOOBruW+queSsOWPgueFp+OCkumBv+OBkeOCi+OBn+OCgeOAgUxvZ2dpbmdDb25maWd1cmF0aW9u44GM6Kit5a6a44GV44KM44Gm44GE44Gq44GE44GT44Go44KS56K66KqN77yJXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2guYWJzZW50KCksXG5cdFx0fSk7XG5cdFx0Ly8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44GM44K544K/44OD44Kv44Gu5Ye65Yqb44Gr5ZCr44G+44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzT3V0cHV0KCdTZWNvbmRhcnlCdWNrZXROYW1lRXhwb3J0Jywge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlscyBmYXN0IHdoZW4gYWNjb3VudCBpcyBtaXNzaW5nIG9yIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ01pc3NpbmdBY2NvdW50U2Vjb25kYXJ5U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyByZWdpb246ICd1cy1lYXN0LTEnIH0sXG5cdFx0XHRcdGVudk5hbWU6ICd0ZXN0Jyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cblx0XHRleHBlY3QoKCkgPT4ge1xuXHRcdFx0bmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ0ludmFsaWRBY2NvdW50U2Vjb25kYXJ5U3RhY2snLCB7XG5cdFx0XHRcdGVudjogeyBhY2NvdW50OiAnJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXHR9KTtcblx0Ly8gZW52TmFtZeOBjOOCteODneODvOODiOOBleOCjOOBpuOBhOOBquOBhOWApOOBruWgtOWQiOOBq+OAgXZhbGlkYXRl44OV44Kn44O844K644Gn44Ko44Op44O844GM6L+U44GV44KM44KL44GT44Go44KS56K66KqN44GZ44KL44OG44K544OIXG5cdHRlc3QoJ3ZhbGlkYXRlIHBoYXNlIGZhaWxzIHdoZW4gZW52TmFtZSBpcyB1bnN1cHBvcnRlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3NhbmRib3gnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIF2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OCqOODqeODvOOBjOi/lOOBleOCjOOCi+OBk+OBqOOCkueiuuiqjeOBmeOCi+OBn+OCgeOBq+OAgWVudk5hbWXjgYzjgrXjg53jg7zjg4jjgZXjgozjgabjgYTjgarjgYTlgKTjgafjgYLjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBzdGFjayA9IG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdTZWNvbmRhcnlFbnZWYWxpZGF0aW9uU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdGVudk5hbWU6ICdzYW5kYm94Jyxcblx0XHR9KTtcblx0XHQvLyB2YWxpZGF0ZeODleOCp+ODvOOCuuOBp+OAgWVudk5hbWXjgYzjgrXjg53jg7zjg4jjgZXjgozjgabjgYTjgarjgYTlgKTjgafjgYLjgovjgZPjgajjgavlr77jgZnjgovjgqjjg6njg7zjgYzov5TjgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0XHRleHBlY3Qoc3RhY2subm9kZS52YWxpZGF0ZSgpKS50b0VxdWFsKFxuXHRcdFx0ZXhwZWN0LmFycmF5Q29udGFpbmluZyhbZXhwZWN0LnN0cmluZ01hdGNoaW5nKEVOVl9OQU1FX1ZBTElEQVRFX0VSUk9SX1JFR0VYKV0pLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXX0=