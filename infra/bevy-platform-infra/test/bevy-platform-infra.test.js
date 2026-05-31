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
        // GitHub Actions用のIAMロールが作成されていることを確認
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: 'bevy-artifacts-test-123456789012',
            LoggingConfiguration: assertions_1.Match.objectLike({
                LogFilePrefix: 'access-logs/',
            }),
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFFMUUsaUNBQWlDO0FBQ2pDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7SUFDdkMsSUFBSSxDQUFDLG9FQUFvRSxFQUFFLEdBQUcsRUFBRTtRQUMvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFDdkIsT0FBTyxFQUFFO2dCQUNSLEdBQUcsRUFBRSxNQUFNO2dCQUNYLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixVQUFVLEVBQUUscUJBQXFCO2dCQUNqQyxZQUFZLEVBQUUsTUFBTTthQUNwQjtTQUNELENBQUMsQ0FBQztRQUNILHNCQUFzQjtRQUN0QixNQUFNLEtBQUssR0FBRyxJQUFJLGtEQUFzQixDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUU7WUFDNUQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUU7WUFDMUQsa0JBQWtCLEVBQUUseURBQXlEO1NBQzdFLENBQUMsQ0FBQztRQUNILDJCQUEyQjtRQUMzQixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyx3QkFBd0I7UUFDeEIsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvQyxzQ0FBc0M7UUFDdEMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1lBQ2pELFVBQVUsRUFBRSxrQ0FBa0M7WUFDOUMsb0JBQW9CLEVBQUUsa0JBQUssQ0FBQyxVQUFVLENBQUM7Z0JBQ3RDLGFBQWEsRUFBRSxjQUFjO2FBQzdCLENBQUM7U0FDRixDQUFDLENBQUM7UUFDSCx3Q0FBd0M7UUFDeEMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixFQUFFO1lBQ2hELHdCQUF3QixFQUFFO2dCQUN6QixTQUFTLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQzFCLGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNoQixNQUFNLEVBQUUsK0JBQStCO3dCQUN2QyxTQUFTLEVBQUU7NEJBQ1YsWUFBWSxFQUFFO2dDQUNiLHlDQUF5QyxFQUFFLG1CQUFtQjs2QkFDOUQ7NEJBQ0QsVUFBVSxFQUFFO2dDQUNYLHlDQUF5QyxFQUFFO29DQUMxQyx1REFBdUQ7aUNBQ3ZEOzZCQUNEO3lCQUNEO3FCQUNELENBQUM7aUJBQ0YsQ0FBQzthQUNGO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gseUNBQXlDO1FBQ3pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDaEQsQ0FBQyxDQUFDLENBQUM7SUFDSCxpREFBaUQ7SUFDakQsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEdBQUcsRUFBRTtRQUM1RSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFDdkIsT0FBTyxFQUFFO2dCQUNSLEdBQUcsRUFBRSxNQUFNO2dCQUNYLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixVQUFVLEVBQUUscUJBQXFCO2FBQ2pDO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsc0JBQXNCO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLElBQUksa0RBQXNCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixFQUFFO1lBQ3JFLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFO1lBQzFELGtCQUFrQixFQUFFLHlEQUF5RDtTQUM3RSxDQUFDLENBQUM7UUFDSCwyQkFBMkI7UUFDM0IsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsbURBQW1EO1FBQ25ELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsRUFBRTtZQUNoRCx3QkFBd0IsRUFBRTtnQkFDekIsU0FBUyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUMxQixrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDaEIsTUFBTSxFQUFFLCtCQUErQjt3QkFDdkMsU0FBUyxFQUFFOzRCQUNWLFVBQVUsRUFBRTtnQ0FDWCx5Q0FBeUMsRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQ0FDMUQsdURBQXVEO29DQUN2RCx5REFBeUQ7aUNBQ3pELENBQUM7NkJBQ0Y7eUJBQ0Q7cUJBQ0QsQ0FBQztpQkFDRixDQUFDO2FBQ0Y7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IE1hdGNoLCBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcblxuLy8gQmV2eVBsYXRmb3JtSW5mcmFTdGFja+OBruODpuODi+ODg+ODiOODhuOCueODiFxuZGVzY3JpYmUoJ0JldnlQbGF0Zm9ybUluZnJhU3RhY2snLCAoKSA9PiB7XG5cdHRlc3QoJ2NyZWF0ZXMgUzMgYnVja2V0IGFuZCBHaXRIdWIgQWN0aW9ucyByb2xlIHdpdGggYnJhbmNoLXNjb3BlZCB0cnVzdCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0XHRnaXRodWJCcmFuY2g6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8g44K544K/44OD44Kv44KS5L2c5oiQ44GX44Gm44CB44OG44Oz44OX44Os44O844OI44KS5Y+W5b6XXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdNeVRlc3RTdGFjaycsIHtcblx0XHRcdGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTEnIH0sXG5cdFx0XHRzZWNvbmRhcnlCdWNrZXRBcm46ICdhcm46YXdzOnMzOjo6YmV2eS1hcnRpZmFjdHMtdGVzdC1zZWNvbmRhcnktMTIzNDU2Nzg5MDEyJyxcblx0XHR9KTtcblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjgYvjgonjg6rjgr3jg7zjgrnjga7lrZjlnKjjgajjg5fjg63jg5Hjg4bjgqPjgpLmpJzoqLxcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cdFx0Ly8gUzPjg5DjgrHjg4Pjg4jjgYwy44Gk5L2c5oiQ44GV44KM44Gm44GE44KL44GT44Go44KS56K66KqNXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAyKTtcblx0XHQvLyBHaXRIdWIgQWN0aW9uc+eUqOOBrklBTeODreODvOODq+OBjOS9nOaIkOOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuXHRcdFx0QnVja2V0TmFtZTogJ2JldnktYXJ0aWZhY3RzLXRlc3QtMTIzNDU2Nzg5MDEyJyxcblx0XHRcdExvZ2dpbmdDb25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0TG9nRmlsZVByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruS/oemgvOODneODquOCt+ODvOOBjOato+OBl+OBj+ioreWumuOBleOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG5cdFx0XHRBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcblx0XHRcdFx0U3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuXHRcdFx0XHRcdE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRcdFx0QWN0aW9uOiAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknLFxuXHRcdFx0XHRcdFx0Q29uZGl0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFN0cmluZ0VxdWFsczoge1xuXHRcdFx0XHRcdFx0XHRcdCd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTdHJpbmdMaWtlOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBrkFSTuOBjOOCueOCv+ODg+OCr+OBruWHuuWKm+OBq+WQq+OBvuOCjOOBpuOBhOOCi+OBk+OBqOOCkueiuuiqjVxuXHRcdHRlbXBsYXRlLmhhc091dHB1dCgnR2l0aHViQWN0aW9uc1JvbGVBcm4nLCB7fSk7XG5cdH0pO1xuXHQvLyBnaXRodWJCcmFuY2jjgpLmjIflrprjgZfjgarjgYTloLTlkIjjgIFtYWlu44GobWFzdGVy44Gu5Lih5pa544GM6Kix5Y+v44GV44KM44KL44GT44Go44KS56K66KqNXG5cdHRlc3QoJ2FsbG93cyBib3RoIG1haW4vbWFzdGVyIGJ5IGRlZmF1bHQgd2hlbiBnaXRodWJCcmFuY2ggaXMgb21pdHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7XG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGVudjogJ3Rlc3QnLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ29jdG8tb3JnJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ2JldnktcGxhdGZvcm0taW5mcmEnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQvLyDjgrnjgr/jg4Pjgq/jgpLkvZzmiJDjgZfjgabjgIHjg4bjg7Pjg5fjg6zjg7zjg4jjgpLlj5blvpdcblx0XHRjb25zdCBzdGFjayA9IG5ldyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrKGFwcCwgJ015RGVmYXVsdEJyYW5jaFN0YWNrJywge1xuXHRcdFx0ZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICdhcC1ub3J0aGVhc3QtMScgfSxcblx0XHRcdHNlY29uZGFyeUJ1Y2tldEFybjogJ2Fybjphd3M6czM6OjpiZXZ5LWFydGlmYWN0cy10ZXN0LXNlY29uZGFyeS0xMjM0NTY3ODkwMTInLFxuXHRcdH0pO1xuXHRcdC8vIOODhuODs+ODl+ODrOODvOODiOOBi+OCieODquOCveODvOOCueOBruWtmOWcqOOBqOODl+ODreODkeODhuOCo+OCkuaknOiovFxuXHRcdGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblx0XHQvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruS/oemgvOODneODquOCt+ODvOOBjG1haW7jgahtYXN0ZXLjga7kuKHmlrnjgpLoqLHlj6/jgZfjgabjgYTjgovjgZPjgajjgpLnorroqo1cblx0XHR0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuXHRcdFx0QXNzdW1lUm9sZVBvbGljeURvY3VtZW50OiB7XG5cdFx0XHRcdFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcblx0XHRcdFx0XHRNYXRjaC5vYmplY3RMaWtlKHtcblx0XHRcdFx0XHRcdEFjdGlvbjogJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5Jyxcblx0XHRcdFx0XHRcdENvbmRpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRTdHJpbmdMaWtlOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IE1hdGNoLmFycmF5V2l0aChbXG5cdFx0XHRcdFx0XHRcdFx0XHQncmVwbzpvY3RvLW9yZy9iZXZ5LXBsYXRmb3JtLWluZnJhOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3JlcG86b2N0by1vcmcvYmV2eS1wbGF0Zm9ybS1pbmZyYTpyZWY6cmVmcy9oZWFkcy9tYXN0ZXInLFxuXHRcdFx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl19