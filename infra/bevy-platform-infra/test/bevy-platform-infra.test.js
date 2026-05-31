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
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
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
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'MyDefaultBranchStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
            secondaryBucketArn: 'arn:aws:s3:::bevy-artifacts-test-secondary-123456789012',
        });
        // テンプレートからリソースの存在とプロパティを検証
        const template = assertions_1.Template.fromStack(stack);
        // GitHub OIDCロールの信頼ポリシーがmainとmasterの両方を許可していることを確認
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Action: 'sts:AssumeRoleWithWebIdentity',
                        Condition: {
                            StringLike: {
                                'token.actions.githubusercontent.com:sub': assertions_1.Match.arrayWith([
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFDMUUsMEVBQXFFO0FBRXJFLDBCQUEwQjtBQUMxQixNQUFNLHlCQUF5QixHQUFHLDhDQUE4QyxDQUFDO0FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsbURBQW1ELENBQUM7QUFDbEYsTUFBTSw0QkFBNEIsR0FBRyxtRUFBbUUsQ0FBQztBQUV6RyxpQ0FBaUM7QUFDakMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtJQUN2QyxJQUFJLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO1FBQy9FLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUN2QixPQUFPLEVBQUU7Z0JBQ1IsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLFVBQVUsRUFBRSxxQkFBcUI7Z0JBQ2pDLFlBQVksRUFBRSxNQUFNO2FBQ3BCO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsc0JBQXNCO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLElBQUksa0RBQXNCLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtZQUM1RCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRTtZQUMxRCxrQkFBa0IsRUFBRSx5REFBeUQ7U0FDN0UsQ0FBQyxDQUFDO1FBQ0gsMkJBQTJCO1FBQzNCLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLHdCQUF3QjtRQUN4QixRQUFRLENBQUMsZUFBZSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxD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QUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO2dCQUN6QyxPQUFPLEVBQUUsTUFBTTthQUNmLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgTWF0Y2gsIFRlbXBsYXRlIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2JldnktcGxhdGZvcm0taW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgU2Vjb25kYXJ5QnVja2V0U3RhY2sgfSBmcm9tICcuLi9saWIvc2Vjb25kYXJ5LWJ1Y2tldC1zdGFjayc7XG5cbi8vIOato+imj+ihqOePvuOCkuWumue+qeOBl+OBpuOAgeODkOOCseODg+ODiOWQjeOBruWRveWQjeimj+WJh+OCkuaknOiovFxuY29uc3QgUFJJTUFSWV9CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtKGRldnx0ZXN0fHN0Z3xwcm9kKS1cXFxcZHsxMn0kJztcbmNvbnN0IExPR19CVUNLRVRfTkFNRV9SRUdFWCA9ICdeYmV2eS1hcnRpZmFjdHMtbG9ncy0oZGV2fHRlc3R8c3RnfHByb2QpLVxcXFxkezEyfSQnO1xuY29uc3QgRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCA9IC9lbnZcXC5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC9pO1xuXG4vLyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNr44Gu44Om44OL44OD44OI44OG44K544OIXG5kZXNjcmliZSgnQmV2eVBsYXRmb3JtSW5mcmFTdGFjaycsICgpID0+IHtcblx0dGVzdCgnY3JlYXRlcyBTMyBidWNrZXQgYW5kIEdpdEh1YiBBY3Rpb25zIHJvbGUgd2l0aCBicmFuY2gtc2NvcGVkIHRydXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIHjg4bjg7Pjg5fjg6zjg7zjg4jjgpLlj5blvpdcblx0XHRjb25zdCBzdGFjayA9IG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ015VGVzdFN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXHRcdC8vIOODhuODs+ODl+ODrOODvOODiOOBi+OCieODquOCveODvOOCueOBruWtmOWcqOOBqOODl+ODreODkeODhuOCo+OCkuaknOiovFxuXHRcdGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblx0XHQvLyBTM+ODkOOCseODg+ODiOOBjDLjgaTkvZzmiJDjgZXjgozjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDIpO1xuXHRcdC8vIOODl+ODqeOCpOODnuODquaIkOaenOeJqeODkOOCseODg+ODiOWQjeOBjOWRveWQjeimj+WJh+OBq+ayv+OBo+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChQUklNQVJZX0JVQ0tFVF9OQU1FX1JFR0VYKSxcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0TG9nRmlsZVByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jlkI3jgYzlkb3lkI3opo/liYfjgavmsr/jgaPjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHQvLyDjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavjga/jg63jgrDjga7lvqrnkrDlj4LnhafjgpLpgb/jgZHjgovjgZ/jgoHjgIFMb2dnaW5nQ29uZmlndXJhdGlvbuOBjOioreWumuOBleOCjOOBpuOBhOOBquOBhOOBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChMT0dfQlVDS0VUX05BTUVfUkVHRVgpLFxuXHRcdFx0TG9nZ2luZ0NvbmZpZ3VyYXRpb246IE1hdGNoLmFic2VudCgpLFxuXHRcdH0pO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44Gu5L+h6aC844Od44Oq44K344O844GM5q2j44GX44GP6Kit5a6a44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcblx0XHRcdEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudDoge1xuXHRcdFx0XHRTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG5cdFx0XHRcdFx0TWF0Y2gub2JqZWN0TGlrZSh7XG5cdFx0XHRcdFx0XHRBY3Rpb246ICdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eScsXG5cdFx0XHRcdFx0XHRDb25kaXRpb246IHtcblx0XHRcdFx0XHRcdFx0U3RyaW5nRXF1YWxzOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6ICdzdHMuYW1hem9uYXdzLmNvbScsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFN0cmluZ0xpa2U6IHtcblx0XHRcdFx0XHRcdFx0XHQndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogW1xuXHRcdFx0XHRcdFx0XHRcdFx0J3JlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYWluJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44GuQVJO44GM44K544K/44OD44Kv44Gu5Ye65Yqb44Gr5ZCr44G+44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUuaGFzT3V0cHV0KCdHaXRodWJBY3Rpb25zUm9sZUFybicsIHt9KTtcblx0fSk7XG5cdC8vIGdpdGh1YkJyYW5jaOOCkuaMh+WumuOBl+OBquOBhOWgtOWQiOOAgW1haW7jgahtYXN0ZXLjga7kuKHmlrnjgYzoqLHlj6/jgZXjgozjgovjgZPjgajjgpLnorroqo1cblx0dGVzdCgnYWxsb3dzIGJvdGggbWFpbi9tYXN0ZXIgYnkgZGVmYXVsdCB3aGVuIGdpdGh1YkJyYW5jaCBpcyBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdC8vIOOCueOCv+ODg+OCr+OCkuS9nOaIkOOBl+OBpuOAgeODhuODs+ODl+ODrOODvOODiOOCkuWPluW+l1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlEZWZhdWx0QnJhbmNoU3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0c2Vjb25kYXJ5QnVja2V0QXJuOiAnYXJuOmF3czpzMzo6OmJldnktYXJ0aWZhY3RzLXRlc3Qtc2Vjb25kYXJ5LTEyMzQ1Njc4OTAxMicsXG5cdFx0fSk7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44GL44KJ44Oq44K944O844K544Gu5a2Y5Zyo44Go44OX44Ot44OR44OG44Kj44KS5qSc6Ki8XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXHRcdC8vIEdpdEh1YiBPSURD44Ot44O844Or44Gu5L+h6aC844Od44Oq44K344O844GMbWFpbuOBqG1hc3RlcuOBruS4oeaWueOCkuioseWPr+OBl+OBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG5cdFx0XHRBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcblx0XHRcdFx0U3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuXHRcdFx0XHRcdE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRcdFx0QWN0aW9uOiAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknLFxuXHRcdFx0XHRcdFx0Q29uZGl0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFN0cmluZ0xpa2U6IHtcblx0XHRcdFx0XHRcdFx0XHQndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogTWF0Y2guYXJyYXlXaXRoKFtcblx0XHRcdFx0XHRcdFx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XHRcdFx0XHRcdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21hc3RlcicsXG5cdFx0XHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGZhc3Qgd2hlbiBhY2NvdW50IGlzIG1pc3Npbmcgb3IgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblxuXHRcdGV4cGVjdCgoKSA9PiB7XG5cdFx0XHRuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJ2FiYycsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHRcdH0pO1xuXHRcdH0pLnRvVGhyb3coRVhQTElDSVRfQUNDT1VOVF9FUlJPUl9SRUdFWCk7XG5cdH0pO1xufSk7XG5cbmRlc2NyaWJlKCdTZWNvbmRhcnlCdWNrZXRTdGFjaycsICgpID0+IHtcblx0dGVzdCgnZmFpbHMgZmFzdCB3aGVuIGFjY291bnQgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdNaXNzaW5nQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuXHRcdFx0XHRlbnZOYW1lOiAndGVzdCcsXG5cdFx0XHR9KTtcblx0XHR9KS50b1Rocm93KEVYUExJQ0lUX0FDQ09VTlRfRVJST1JfUkVHRVgpO1xuXG5cdFx0ZXhwZWN0KCgpID0+IHtcblx0XHRcdG5ldyBTZWNvbmRhcnlCdWNrZXRTdGFjayhhcHAsICdJbnZhbGlkQWNjb3VudFNlY29uZGFyeVN0YWNrJywge1xuXHRcdFx0XHRlbnY6IHsgYWNjb3VudDogJycsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblx0XHRcdFx0ZW52TmFtZTogJ3Rlc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSkudG9UaHJvdyhFWFBMSUNJVF9BQ0NPVU5UX0VSUk9SX1JFR0VYKTtcblx0fSk7XG59KTtcbiJdfQ==