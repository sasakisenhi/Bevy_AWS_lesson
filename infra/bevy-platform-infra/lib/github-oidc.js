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
exports.createGithubActionsRole = createGithubActionsRole;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cdk_nag_1 = require("cdk-nag");
const config_1 = require("./config");
// GitHub ActionsがS3バケットにアクセスするためのIAMロールを作成する関数を定義
function createGithubActionsRole({ scope, account, artifactBucket, githubSubs, }) {
    const existingProviderArn = `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;
    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(scope, 'GithubProvider', existingProviderArn);
    const githubRole = new iam.Role(scope, 'GithubActionsRole', {
        assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
            StringEquals: {
                'token.actions.githubusercontent.com:aud': config_1.GITHUB_OIDC_CONFIG.CLIENT_ID,
            },
            StringLike: {
                'token.actions.githubusercontent.com:sub': githubSubs,
            },
        }),
        description: 'Role assumed by GitHub Actions for artifact bucket access',
    });
    // GitHub ActionsがS3バケットに対して必要なアクセス許可を付与する。これには、バケットのリストと場所の取得、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:ListBucket',
            's3:GetBucketLocation',
        ],
        resources: [artifactBucket.bucketArn],
    }));
    // GitHub ActionsがS3バケット内のオブジェクトに対して必要なアクセス許可を付与する。これには、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:AbortMultipartUpload',
            's3:ListMultipartUploadParts',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
    }));
    // CloudFormation outputsを参照して実行時設定を動的解決するための読み取り権限を付与する。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            'cloudformation:DescribeStacks',
            'cloudformation:GetTemplate',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:cloudformation:*:${account}:stack/BevyPlatformInfraStack/*`,
            `arn:${cdk.Aws.PARTITION}:cloudformation:*:${account}:stack/BevyPlatformInfraSecondaryBucketStack/*`,
        ],
    }));
    // CDK bootstrap version確認で参照されるSSMパラメータの読み取り権限を付与する。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            'ssm:GetParameter',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:ssm:*:${account}:parameter/cdk-bootstrap/hnb659fds/version`,
        ],
    }));
    // CDK Nagの警告を抑制。理由は、GitHub Actionsが動的なオブジェクトキーとCloudFormationスタックIDサフィックスを扱うため、
    // リソース末尾ワイルドカードが必要になるため。
    cdk_nag_1.NagSuppressions.addResourceSuppressions(githubRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'GitHub Actions uses dynamic object keys and CloudFormation stack-id suffixes, requiring wildcard resource suffixes while actions remain explicitly scoped.',
            appliesTo: [{ regex: '/^Resource::.*\/\*$/' }],
        },
    ], true);
    return githubRole;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlCQSwwREE4RkM7QUE5R0QsaURBQW1DO0FBQ25DLHlEQUEyQztBQUUzQyxxQ0FBMEM7QUFFMUMscUNBQThDO0FBVTlDLGtEQUFrRDtBQUNsRCxTQUFnQix1QkFBdUIsQ0FBQyxFQUN0QyxLQUFLLEVBQ0wsT0FBTyxFQUNQLGNBQWMsRUFDZCxVQUFVLEdBQ1U7SUFDcEIsTUFBTSxtQkFBbUIsR0FBRyxnQkFBZ0IsT0FBTyxvREFBb0QsQ0FBQztJQUV4RyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMscUJBQXFCLENBQUMsNEJBQTRCLENBQzNFLEtBQUssRUFDTCxnQkFBZ0IsRUFDaEIsbUJBQW1CLENBQ3BCLENBQUM7SUFFRixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1FBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FDckMsY0FBYyxDQUFDLHdCQUF3QixFQUN2QztZQUNFLFlBQVksRUFBRTtnQkFDWix5Q0FBeUMsRUFBRSwyQkFBa0IsQ0FBQyxTQUFTO2FBQ3hFO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLHlDQUF5QyxFQUFFLFVBQVU7YUFDdEQ7U0FDRixDQUNGO1FBQ0QsV0FBVyxFQUFFLDJEQUEyRDtLQUN6RSxDQUFDLENBQUM7SUFDTCx1R0FBdUc7SUFDckcsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGVBQWU7WUFDZixzQkFBc0I7U0FDdkI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO0tBQ3RDLENBQUMsQ0FDSCxDQUFDO0lBRUYsZ0dBQWdHO0lBQ2hHLFVBQVUsQ0FBQyxXQUFXLENBQ3BCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QixPQUFPLEVBQUU7WUFDUCxjQUFjO1lBQ2QsY0FBYztZQUNkLGlCQUFpQjtZQUNqQix5QkFBeUI7WUFDekIsNkJBQTZCO1NBQzlCO1FBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxjQUFjLENBQUMsU0FBUyxJQUFJLENBQUM7S0FDN0MsQ0FBQyxDQUNILENBQUM7SUFFRix5REFBeUQ7SUFDekQsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLCtCQUErQjtZQUMvQiw0QkFBNEI7U0FDN0I7UUFDRCxTQUFTLEVBQUU7WUFDVCxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxxQkFBcUIsT0FBTyxpQ0FBaUM7WUFDckYsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMscUJBQXFCLE9BQU8sZ0RBQWdEO1NBQ3JHO0tBQ0YsQ0FBQyxDQUNILENBQUM7SUFFRixxREFBcUQ7SUFDckQsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGtCQUFrQjtTQUNuQjtRQUNELFNBQVMsRUFBRTtZQUNULE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLFVBQVUsT0FBTyw0Q0FBNEM7U0FDdEY7S0FDRixDQUFDLENBQ0gsQ0FBQztJQUVGLGdGQUFnRjtJQUNoRix5QkFBeUI7SUFDekIseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsVUFBVSxFQUNWO1FBQ0U7WUFDRSxFQUFFLEVBQUUsbUJBQW1CO1lBQ3ZCLE1BQU0sRUFBRSw0SkFBNEo7WUFDcEssU0FBUyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztTQUMvQztLQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7SUFFRixPQUFPLFVBQVUsQ0FBQztBQUNwQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gJ2Nkay1uYWcnO1xuXG5pbXBvcnQgeyBHSVRIVUJfT0lEQ19DT05GSUcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbi8vIEdpdEh1YiBPSURD44Ot44O844Or44Gu44OX44Ot44OR44OG44Kj44KS5a6a576p44GZ44KL44Kk44Oz44K/44O844OV44Kn44O844K5XG5leHBvcnQgaW50ZXJmYWNlIEdpdGh1Yk9pZGNSb2xlUHJvcHMge1xuICBzY29wZTogQ29uc3RydWN0O1xuICBhY2NvdW50OiBzdHJpbmc7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5JQnVja2V0O1xuICBnaXRodWJTdWJzOiBzdHJpbmdbXTtcbn1cblxuLy8gR2l0SHViIEFjdGlvbnPjgYxTM+ODkOOCseODg+ODiOOBq+OCouOCr+OCu+OCueOBmeOCi+OBn+OCgeOBrklBTeODreODvOODq+OCkuS9nOaIkOOBmeOCi+mWouaVsOOCkuWumue+qVxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUdpdGh1YkFjdGlvbnNSb2xlKHtcbiAgc2NvcGUsXG4gIGFjY291bnQsXG4gIGFydGlmYWN0QnVja2V0LFxuICBnaXRodWJTdWJzLFxufTogR2l0aHViT2lkY1JvbGVQcm9wcyk6IGlhbS5Sb2xlIHtcbiAgY29uc3QgZXhpc3RpbmdQcm92aWRlckFybiA9IGBhcm46YXdzOmlhbTo6JHthY2NvdW50fTpvaWRjLXByb3ZpZGVyL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tYDtcblxuICBjb25zdCBnaXRodWJQcm92aWRlciA9IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybihcbiAgICBzY29wZSxcbiAgICAnR2l0aHViUHJvdmlkZXInLFxuICAgIGV4aXN0aW5nUHJvdmlkZXJBcm4sXG4gICk7XG5cbiAgY29uc3QgZ2l0aHViUm9sZSA9IG5ldyBpYW0uUm9sZShzY29wZSwgJ0dpdGh1YkFjdGlvbnNSb2xlJywge1xuICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgIGdpdGh1YlByb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgIHtcbiAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6IEdJVEhVQl9PSURDX0NPTkZJRy5DTElFTlRfSUQsXG4gICAgICAgIH0sXG4gICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogZ2l0aHViU3VicyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKSxcbiAgICBkZXNjcmlwdGlvbjogJ1JvbGUgYXNzdW1lZCBieSBHaXRIdWIgQWN0aW9ucyBmb3IgYXJ0aWZhY3QgYnVja2V0IGFjY2VzcycsXG4gIH0pO1xuLy8gR2l0SHViIEFjdGlvbnPjgYxTM+ODkOOCseODg+ODiOOBq+WvvuOBl+OBpuW/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeODkOOCseODg+ODiOOBruODquOCueODiOOBqOWgtOaJgOOBruWPluW+l+OAgeOCquODluOCuOOCp+OCr+ODiOOBruWPluW+l+OAgemFjee9ruOAgeWJiumZpOOAgeOBiuOCiOOBs+ODnuODq+ODgeODkeODvOODiOOCouODg+ODl+ODreODvOODieOBrueuoeeQhuOBjOWQq+OBvuOCjOOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybl0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gR2l0SHViIEFjdGlvbnPjgYxTM+ODkOOCseODg+ODiOWGheOBruOCquODluOCuOOCp+OCr+ODiOOBq+WvvuOBl+OBpuW/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeOCquODluOCuOOCp+OCr+ODiOOBruWPluW+l+OAgemFjee9ruOAgeWJiumZpOOAgeOBiuOCiOOBs+ODnuODq+ODgeODkeODvOODiOOCouODg+ODl+ODreODvOODieOBrueuoeeQhuOBjOWQq+OBvuOCjOOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgJ3MzOkFib3J0TXVsdGlwYXJ0VXBsb2FkJyxcbiAgICAgICAgJ3MzOkxpc3RNdWx0aXBhcnRVcGxvYWRQYXJ0cycsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYCR7YXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ2xvdWRGb3JtYXRpb24gb3V0cHV0c+OCkuWPgueFp+OBl+OBpuWun+ihjOaZguioreWumuOCkuWLleeahOino+axuuOBmeOCi+OBn+OCgeOBruiqreOBv+WPluOCiuaoqemZkOOCkuS7mOS4juOBmeOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFRlbXBsYXRlJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpjbG91ZGZvcm1hdGlvbjoqOiR7YWNjb3VudH06c3RhY2svQmV2eVBsYXRmb3JtSW5mcmFTdGFjay8qYCxcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpjbG91ZGZvcm1hdGlvbjoqOiR7YWNjb3VudH06c3RhY2svQmV2eVBsYXRmb3JtSW5mcmFTZWNvbmRhcnlCdWNrZXRTdGFjay8qYCxcbiAgICAgIF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ0RLIGJvb3RzdHJhcCB2ZXJzaW9u56K66KqN44Gn5Y+C54Wn44GV44KM44KLU1NN44OR44Op44Oh44O844K/44Gu6Kqt44G/5Y+W44KK5qip6ZmQ44KS5LuY5LiO44GZ44KL44CCXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06c3NtOio6JHthY2NvdW50fTpwYXJhbWV0ZXIvY2RrLWJvb3RzdHJhcC9obmI2NTlmZHMvdmVyc2lvbmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBOYWfjga7orablkYrjgpLmipHliLbjgILnkIbnlLHjga/jgIFHaXRIdWIgQWN0aW9uc+OBjOWLleeahOOBquOCquODluOCuOOCp+OCr+ODiOOCreODvOOBqENsb3VkRm9ybWF0aW9u44K544K/44OD44KvSUTjgrXjg5XjgqPjg4Pjgq/jgrnjgpLmibHjgYbjgZ/jgoHjgIFcbiAgLy8g44Oq44K944O844K55pyr5bC+44Ov44Kk44Or44OJ44Kr44O844OJ44GM5b+F6KaB44Gr44Gq44KL44Gf44KB44CCXG4gIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICBnaXRodWJSb2xlLFxuICAgIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgIHJlYXNvbjogJ0dpdEh1YiBBY3Rpb25zIHVzZXMgZHluYW1pYyBvYmplY3Qga2V5cyBhbmQgQ2xvdWRGb3JtYXRpb24gc3RhY2staWQgc3VmZml4ZXMsIHJlcXVpcmluZyB3aWxkY2FyZCByZXNvdXJjZSBzdWZmaXhlcyB3aGlsZSBhY3Rpb25zIHJlbWFpbiBleHBsaWNpdGx5IHNjb3BlZC4nLFxuICAgICAgICBhcHBsaWVzVG86IFt7IHJlZ2V4OiAnL15SZXNvdXJjZTo6LipcXC9cXCokLycgfV0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICByZXR1cm4gZ2l0aHViUm9sZTtcbn1cbiJdfQ==