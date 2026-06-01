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
const EXPLICIT_ACCOUNT_ERROR_REGEX = /env\.account must be explicitly set to a 12-digit AWS account ID/i;
const GITHUB_AUD_CLAIM = 'token.actions.githubusercontent.com:aud';
const GITHUB_SUB_CLAIM = 'token.actions.githubusercontent.com:sub';
const GITHUB_SUB_STRUCTURE_REGEX = /^repo:[^/]+\/[^:]+:ref:refs\/heads\/[A-Za-z0-9._/-]+$/;
function getGithubOidcCondition(template) {
    const roles = template.findResources('AWS::IAM::Role');
    for (const role of Object.values(roles)) {
        const statements = role.Properties?.AssumeRolePolicyDocument?.Statement;
        if (!Array.isArray(statements)) {
            continue;
        }
        for (const statement of statements) {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            if (!actions.includes('sts:AssumeRoleWithWebIdentity')) {
                continue;
            }
            if (statement.Condition) {
                return statement.Condition;
            }
        }
    }
    throw new Error('GitHub OIDC trust condition was not found in IAM role');
}
function getGithubSubs(condition) {
    const rawSubs = condition.StringLike?.[GITHUB_SUB_CLAIM];
    if (Array.isArray(rawSubs)) {
        return rawSubs;
    }
    return typeof rawSubs === 'string' ? [rawSubs] : [];
}
function assertStructuredGithubSubs(subs) {
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
});
describe('SecondaryBucketStack', () => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSw0QkFBNEIsR0FBRyxtRUFBbUUsQ0FBQztBQUN6RyxNQUFNLGdCQUFnQixHQUFHLHlDQUF5QyxDQUFDO0FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcseUNBQXlDLENBQUM7QUFDbkUsTUFBTSwwQkFBMEIsR0FBRyx1REFBdUQsQ0FBQztBQU8zRixTQUFTLHNCQUFzQixDQUFDLFFBQWtCO0lBQ2pELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBTW5ELENBQUM7SUFFSCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN6QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLHdCQUF3QixFQUFFLFNBQVMsQ0FBQztRQUN4RSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ2hDLFNBQVM7UUFDVixDQUFDO1FBRUQsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNwQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxD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QUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUNyQyxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1FBQzFELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUN2QixPQUFPLEVBQUU7Z0JBQ1IsR0FBRyxFQUFFLE1BQU07YUFDWDtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxHQUFHLEVBQUU7WUFDWCxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSw4QkFBOEIsRUFBRTtnQkFDN0QsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtnQkFDNUIsT0FBTyxFQUFFLE1BQU07YUFDZixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV6QyxNQUFNLENBQUMsR0FBRyxFQUFFO1lBQ1gsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsOEJBQThCLEVBQUU7Z0JBQzdELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtnQkFDekMsT0FBTyxFQUFFLE1BQU07YUFDZixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IE1hdGNoLCBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuXG4vLyDmraPopo/ooajnj77jgpLlrprnvqnjgZfjgabjgIHjg5DjgrHjg4Pjg4jlkI3jga7lkb3lkI3opo/liYfjgpLmpJzoqLxcbmNvbnN0IFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLShkZXZ8dGVzdHxzdGd8cHJvZCktXFxcXGR7MTJ9JCc7XG5jb25zdCBMT0dfQlVDS0VUX05BTUVfUkVHRVggPSAnXmJldnktYXJ0aWZhY3RzLWxvZ3MtKGRldnx0ZXN0fHN0Z3xwcm9kKS1cXFxcZHsxMn0kJztcbmNvbnN0IEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVggPSAvZW52XFwuYWNjb3VudCBtdXN0IGJlIGV4cGxpY2l0bHkgc2V0IHRvIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSUQvaTtcbmNvbnN0IEdJVEhVQl9BVURfQ0xBSU0gPSAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJztcbmNvbnN0IEdJVEhVQl9TVUJfQ0xBSU0gPSAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJztcbmNvbnN0IEdJVEhVQl9TVUJfU1RSVUNUVVJFX1JFR0VYID0gL15yZXBvOlteL10rXFwvW146XSs6cmVmOnJlZnNcXC9oZWFkc1xcL1tBLVphLXowLTkuXy8tXSskLztcblxuaW50ZXJmYWNlIE9pZGNDb25kaXRpb24ge1xuXHRTdHJpbmdFcXVhbHM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRTdHJpbmdMaWtlPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10+O1xufVxuXG5mdW5jdGlvbiBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IE9pZGNDb25kaXRpb24ge1xuXHRjb25zdCByb2xlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6SUFNOjpSb2xlJykgYXMgUmVjb3JkPHN0cmluZywge1xuXHRcdFByb3BlcnRpZXM/OiB7XG5cdFx0XHRBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ/OiB7XG5cdFx0XHRcdFN0YXRlbWVudD86IEFycmF5PHsgQWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107IENvbmRpdGlvbj86IE9pZGNDb25kaXRpb24gfT47XG5cdFx0XHR9O1xuXHRcdH07XG5cdH0+O1xuXG5cdGZvciAoY29uc3Qgcm9sZSBvZiBPYmplY3QudmFsdWVzKHJvbGVzKSkge1xuXHRcdGNvbnN0IHN0YXRlbWVudHMgPSByb2xlLlByb3BlcnRpZXM/LkFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudD8uU3RhdGVtZW50O1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0ZW1lbnRzKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzdGF0ZW1lbnQgb2Ygc3RhdGVtZW50cykge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IEFycmF5LmlzQXJyYXkoc3RhdGVtZW50LkFjdGlvbikgPyBzdGF0ZW1lbnQuQWN0aW9uIDogW3N0YXRlbWVudC5BY3Rpb25dO1xuXHRcdFx0aWYgKCFhY3Rpb25zLmluY2x1ZGVzKCdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eScpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGVtZW50LkNvbmRpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGVtZW50LkNvbmRpdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBPSURDIHRydXN0IGNvbmRpdGlvbiB3YXMgbm90IGZvdW5kIGluIElBTSByb2xlJyk7XG59XG5cbmZ1bmN0aW9uIGdldEdpdGh1YlN1YnMoY29uZGl0aW9uOiBPaWRjQ29uZGl0aW9uKTogc3RyaW5nW10ge1xuXHRjb25zdCByYXdTdWJzID0gY29uZGl0aW9uLlN0cmluZ0xpa2U/LltHSVRIVUJfU1VCX0NMQUlNXTtcblx0aWYgKEFycmF5LmlzQXJyYXkocmF3U3VicykpIHtcblx0XHRyZXR1cm4gcmF3U3Vicztcblx0fVxuXHRyZXR1cm4gdHlwZW9mIHJhd1N1YnMgPT09ICdzdHJpbmcnID8gW3Jhd1N1YnNdIDogW107XG59XG5cbmZ1bmN0aW9uIGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdGZvciAoY29uc3Qgc3ViIG9mIHN1YnMpIHtcblx0XHRleHBlY3Qoc3ViKS50b01hdGNoKEdJVEhVQl9TVUJfU1RSVUNUVVJFX1JFR0VYKTtcblx0XHRleHBlY3Qoc3ViKS5ub3QudG9NYXRjaCgvWz8qXS8pO1xuXHR9XG59XG5cbi8vIEJldnlQbGF0Zm9ybUluZnJhU3RhY2vjga7jg6bjg4vjg4Pjg4jjg4bjgrnjg4hcbmRlc2NyaWJlKCdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywgKCkgPT4ge1xuXHR0ZXN0KCdjcmVhdGVzIFMzIGJ1Y2tldCBhbmQgR2l0SHViIEFjdGlvbnMgcm9sZSB3aXRoIGJyYW5jaC1zY29wZWQgdHJ1c3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwID0gbmV3IGNkay5BcHAoe1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRlbnY6ICd0ZXN0Jyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdvY3RvLW9yZycsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICdiZXZ5LXBsYXRmb3JtLWluZnJhJyxcblx0XHRcdFx0Z2l0aHViQnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIFMz44OQ44Kx44OD44OI44GMMuOBpOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMik7XG5cdFx0Ly8g44OX44Op44Kk44Oe44Oq5oiQ5p6c54mp44OQ44Kx44OD44OI5ZCN44GM5ZG95ZCN6KaP5YmH44Gr5rK/44Gj44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFBSSU1BUllfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRMb2dGaWxlUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOWQjeOBjOWRveWQjeimj+WJh+OBq+ayv+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdC8vIOOCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBq+OBr+ODreOCsOOBruW+queSsOWPgueFp+OCkumBv+OBkeOCi+OBn+OCgeOAgUxvZ2dpbmdDb25maWd1cmF0aW9u44GM6Kit5a6a44GV44KM44Gm44GE44Gq44GE44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG5cdFx0XHRCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKExPR19CVUNLRVRfTkFNRV9SRUdFWCksXG5cdFx0XHRMb2dnaW5nQ29uZmlndXJhdGlvbjogTWF0Y2guYWJzZW50KCksXG5cdFx0fSk7XG5cdFx0Ly8gR2l0SHViIE9JREPjg63jg7zjg6vjga7kv6HpoLzjg53jg6rjgrfjg7zjgYzmraPjgZfjgY/oqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHRjb25zdCBvaWRjQ29uZGl0aW9uID0gZ2V0R2l0aHViT2lkY0NvbmRpdGlvbih0ZW1wbGF0ZSk7XG5cdFx0ZXhwZWN0KG9pZGNDb25kaXRpb24uU3RyaW5nRXF1YWxzKS50b0VxdWFsKHtcblx0XHRcdFtHSVRIVUJfQVVEX0NMQUlNXTogJ3N0cy5hbWF6b25hd3MuY29tJyxcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzID0gZ2V0R2l0aHViU3VicyhvaWRjQ29uZGl0aW9uKTtcblx0XHRleHBlY3Qoc3VicykudG9FcXVhbChbXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuXHRcdF0pO1xuXHRcdGFzc2VydFN0cnVjdHVyZWRHaXRodWJTdWJzKHN1YnMpO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44GuQVJO44GM44K544K/44OD44Kv44Gu5Ye65Yqb44Gr5ZCr44G+44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzT3V0cHV0KCdHaXRodWJBY3Rpb25zUm9sZUFybicsIHt9KTtcblx0fSk7XG5cdC8vIGdpdGh1YkJyYW5jaOOCkuaMh+WumuOBl+OBquOBhOWgtOWQiOOAgW1haW7jgahtYXN0ZXLjga7kuKHmlrnjgYzoqLHlj6/jgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0dGVzdCgnYWxsb3dzIGJvdGggbWFpbi9tYXN0ZXIgYnkgZGVmYXVsdCB3aGVuIGdpdGh1YkJyYW5jaCBpcyBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlEZWZhdWx0QnJhbmNoU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44Gu5L+h6aC844Od44Oq44K344O844GMbWFpbuOBqG1hc3RlcuOBruS4oeaWueOCkuioseWPr+OBl+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdGNvbnN0IG9pZGNDb25kaXRpb24gPSBnZXRHaXRodWJPaWRjQ29uZGl0aW9uKHRlbXBsYXRlKTtcblx0XHRleHBlY3Qob2lkY0NvbmRpdGlvbi5TdHJpbmdFcXVhbHMpLnRvRXF1YWwoe1xuXHRcdFx0W0dJVEhVQl9BVURfQ0xBSU1dOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1YnMgPSBnZXRHaXRodWJTdWJzKG9pZGNDb25kaXRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkU3VicyA9IFtcblx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21hc3RlcicsXG5cdFx0XTtcblx0XHRleHBlY3Qoc3VicykudG9IYXZlTGVuZ3RoKDIpO1xuXHRcdGV4cGVjdChbLi4uc3Vic10uc29ydCgpKS50b0VxdWFsKFsuLi5leHBlY3RlZFN1YnNdLnNvcnQoKSk7XG5cdFx0YXNzZXJ0U3RydWN0dXJlZEdpdGh1YlN1YnMoc3Vicyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBhY2NvdW50IGlzIG1pc3Npbmcgb3IgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJ2FiYycsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xufSk7XG5cbmRlc2NyaWJlKCdTZWNvbmRhcnlCdWNrZXRTdGFjaycsICgpID0+IHtcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJycsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG59KTtcbiJdfQ==