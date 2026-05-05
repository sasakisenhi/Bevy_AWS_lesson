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
        const stack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'MyTestStack', {
            env: { account: '123456789012', region: 'ap-northeast-1' },
        });
        const template = assertions_1.Template.fromStack(stack);
        template.resourceCountIs('AWS::S3::Bucket', 1);
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
                                'token.actions.githubusercontent.com:sub': 'repo:octo-org/bevy-platform-infra:ref:refs/heads/main',
                            },
                        },
                    }),
                ]),
            },
        });
        template.hasOutput('GithubActionsRoleArn', {});
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmV2eS1wbGF0Zm9ybS1pbmZyYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxnRkFBMEU7QUFFMUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtJQUN2QyxJQUFJLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO1FBQy9FLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUN2QixPQUFPLEVBQUU7Z0JBQ1IsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLFVBQVUsRUFBRSxxQkFBcUI7Z0JBQ2pDLFlBQVksRUFBRSxNQUFNO2FBQ3BCO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcsSUFBSSxrREFBc0IsQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFO1lBQzVELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFO1NBQzFELENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTNDLFFBQVEsQ0FBQyxlQUFlLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFL0MsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixFQUFFO1lBQ2hELHdCQUF3QixFQUFFO2dCQUN6QixTQUFTLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQzFCLGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNoQixNQUFNLEVBQUUsK0JBQStCO3dCQUN2QyxTQUFTLEVBQUU7NEJBQ1YsWUFBWSxFQUFFO2dDQUNiLHlDQUF5QyxFQUFFLG1CQUFtQjs2QkFDOUQ7NEJBQ0QsVUFBVSxFQUFFO2dDQUNYLHlDQUF5QyxFQUFFLHVEQUF1RDs2QkFDbEc7eUJBQ0Q7cUJBQ0QsQ0FBQztpQkFDRixDQUFDO2FBQ0Y7U0FDRCxDQUFDLENBQUM7UUFFSCxRQUFRLENBQUMsU0FBUyxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgTWF0Y2gsIFRlbXBsYXRlIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2JldnktcGxhdGZvcm0taW5mcmEtc3RhY2snO1xuXG5kZXNjcmliZSgnQmV2eVBsYXRmb3JtSW5mcmFTdGFjaycsICgpID0+IHtcblx0dGVzdCgnY3JlYXRlcyBTMyBidWNrZXQgYW5kIEdpdEh1YiBBY3Rpb25zIHJvbGUgd2l0aCBicmFuY2gtc2NvcGVkIHRydXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHtcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0ZW52OiAndGVzdCcsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnb2N0by1vcmcnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAnYmV2eS1wbGF0Zm9ybS1pbmZyYScsXG5cdFx0XHRcdGdpdGh1YkJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEJldnlQbGF0Zm9ybUluZnJhU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snLCB7XG5cdFx0XHRlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0xJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG5cdFx0dGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAxKTtcblxuXHRcdHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG5cdFx0XHRBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcblx0XHRcdFx0U3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuXHRcdFx0XHRcdE1hdGNoLm9iamVjdExpa2Uoe1xuXHRcdFx0XHRcdFx0QWN0aW9uOiAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknLFxuXHRcdFx0XHRcdFx0Q29uZGl0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFN0cmluZ0VxdWFsczoge1xuXHRcdFx0XHRcdFx0XHRcdCd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTdHJpbmdMaWtlOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6ICdyZXBvOm9jdG8tb3JnL2JldnktcGxhdGZvcm0taW5mcmE6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge30pO1xuXHR9KTtcbn0pO1xuIl19