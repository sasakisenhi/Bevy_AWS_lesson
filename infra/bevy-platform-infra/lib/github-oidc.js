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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlCQSwwREFrRkM7QUFsR0QsaURBQW1DO0FBQ25DLHlEQUEyQztBQUUzQyxxQ0FBMEM7QUFFMUMscUNBQThDO0FBVTlDLGtEQUFrRDtBQUNsRCxTQUFnQix1QkFBdUIsQ0FBQyxFQUN0QyxLQUFLLEVBQ0wsT0FBTyxFQUNQLGNBQWMsRUFDZCxVQUFVLEdBQ1U7SUFDcEIsTUFBTSxtQkFBbUIsR0FBRyxnQkFBZ0IsT0FBTyxvREFBb0QsQ0FBQztJQUV4RyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMscUJBQXFCLENBQUMsNEJBQTRCLENBQzNFLEtBQUssRUFDTCxnQkFBZ0IsRUFDaEIsbUJBQW1CLENBQ3BCLENBQUM7SUFFRixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1FBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FDckMsY0FBYyxDQUFDLHdCQUF3QixFQUN2QztZQUNFLFlBQVksRUFBRTtnQkFDWix5Q0FBeUMsRUFBRSwyQkFBa0IsQ0FBQyxTQUFTO2FBQ3hFO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLHlDQUF5QyxFQUFFLFVBQVU7YUFDdEQ7U0FDRixDQUNGO1FBQ0QsV0FBVyxFQUFFLDJEQUEyRDtLQUN6RSxDQUFDLENBQUM7SUFDTCx1R0FBdUc7SUFDckcsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGVBQWU7WUFDZixzQkFBc0I7U0FDdkI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO0tBQ3RDLENBQUMsQ0FDSCxDQUFDO0lBRUYsZ0dBQWdHO0lBQ2hHLFVBQVUsQ0FBQyxXQUFXLENBQ3BCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QixPQUFPLEVBQUU7WUFDUCxjQUFjO1lBQ2QsY0FBYztZQUNkLGlCQUFpQjtZQUNqQix5QkFBeUI7WUFDekIsNkJBQTZCO1NBQzlCO1FBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxjQUFjLENBQUMsU0FBUyxJQUFJLENBQUM7S0FDN0MsQ0FBQyxDQUNILENBQUM7SUFFRix5REFBeUQ7SUFDekQsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLCtCQUErQjtZQUMvQiw0QkFBNEI7U0FDN0I7UUFDRCxTQUFTLEVBQUU7WUFDVCxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxxQkFBcUIsT0FBTyxpQ0FBaUM7WUFDckYsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMscUJBQXFCLE9BQU8sZ0RBQWdEO1NBQ3JHO0tBQ0YsQ0FBQyxDQUNILENBQUM7SUFFRixnRkFBZ0Y7SUFDaEYseUJBQXlCO0lBQ3pCLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLFVBQVUsRUFDVjtRQUNFO1lBQ0UsRUFBRSxFQUFFLG1CQUFtQjtZQUN2QixNQUFNLEVBQUUsNEpBQTRKO1lBQ3BLLFNBQVMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLENBQUM7U0FDL0M7S0FDRixFQUNELElBQUksQ0FDTCxDQUFDO0lBRUYsT0FBTyxVQUFVLENBQUM7QUFDcEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuaW1wb3J0IHsgR0lUSFVCX09JRENfQ09ORklHIH0gZnJvbSAnLi9jb25maWcnO1xuXG4vLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruODl+ODreODkeODhuOCo+OCkuWumue+qeOBmeOCi+OCpOODs+OCv+ODvOODleOCp+ODvOOCuVxuZXhwb3J0IGludGVyZmFjZSBHaXRodWJPaWRjUm9sZVByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgYWNjb3VudDogc3RyaW5nO1xuICBhcnRpZmFjdEJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgZ2l0aHViU3Viczogc3RyaW5nW107XG59XG5cbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavjgqLjgq/jgrvjgrnjgZnjgovjgZ/jgoHjga5JQU3jg63jg7zjg6vjgpLkvZzmiJDjgZnjgovplqLmlbDjgpLlrprnvqlcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSh7XG4gIHNjb3BlLFxuICBhY2NvdW50LFxuICBhcnRpZmFjdEJ1Y2tldCxcbiAgZ2l0aHViU3Vicyxcbn06IEdpdGh1Yk9pZGNSb2xlUHJvcHMpOiBpYW0uUm9sZSB7XG4gIGNvbnN0IGV4aXN0aW5nUHJvdmlkZXJBcm4gPSBgYXJuOmF3czppYW06OiR7YWNjb3VudH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWA7XG5cbiAgY29uc3QgZ2l0aHViUHJvdmlkZXIgPSBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgc2NvcGUsXG4gICAgJ0dpdGh1YlByb3ZpZGVyJyxcbiAgICBleGlzdGluZ1Byb3ZpZGVyQXJuLFxuICApO1xuXG4gIGNvbnN0IGdpdGh1YlJvbGUgPSBuZXcgaWFtLlJvbGUoc2NvcGUsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICBnaXRodWJQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICB7XG4gICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiBHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lELFxuICAgICAgICB9LFxuICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IGdpdGh1YlN1YnMsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICksXG4gICAgZGVzY3JpcHRpb246ICdSb2xlIGFzc3VtZWQgYnkgR2l0SHViIEFjdGlvbnMgZm9yIGFydGlmYWN0IGJ1Y2tldCBhY2Nlc3MnLFxuICB9KTtcbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjg5DjgrHjg4Pjg4jjga7jg6rjgrnjg4jjgajloLTmiYDjga7lj5blvpfjgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jlhoXjga7jgqrjg5bjgrjjgqfjgq/jg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENsb3VkRm9ybWF0aW9uIG91dHB1dHPjgpLlj4LnhafjgZfjgablrp/ooYzmmYLoqK3lrprjgpLli5XnmoTop6PmsbrjgZnjgovjgZ/jgoHjga7oqq3jgb/lj5bjgormqKnpmZDjgpLku5jkuI7jgZnjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpHZXRUZW1wbGF0ZScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06Y2xvdWRmb3JtYXRpb246Kjoke2FjY291bnR9OnN0YWNrL0JldnlQbGF0Zm9ybUluZnJhU3RhY2svKmAsXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06Y2xvdWRmb3JtYXRpb246Kjoke2FjY291bnR9OnN0YWNrL0JldnlQbGF0Zm9ybUluZnJhU2Vjb25kYXJ5QnVja2V0U3RhY2svKmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBOYWfjga7orablkYrjgpLmipHliLbjgILnkIbnlLHjga/jgIFHaXRIdWIgQWN0aW9uc+OBjOWLleeahOOBquOCquODluOCuOOCp+OCr+ODiOOCreODvOOBqENsb3VkRm9ybWF0aW9u44K544K/44OD44KvSUTjgrXjg5XjgqPjg4Pjgq/jgrnjgpLmibHjgYbjgZ/jgoHjgIFcbiAgLy8g44Oq44K944O844K55pyr5bC+44Ov44Kk44Or44OJ44Kr44O844OJ44GM5b+F6KaB44Gr44Gq44KL44Gf44KB44CCXG4gIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICBnaXRodWJSb2xlLFxuICAgIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgIHJlYXNvbjogJ0dpdEh1YiBBY3Rpb25zIHVzZXMgZHluYW1pYyBvYmplY3Qga2V5cyBhbmQgQ2xvdWRGb3JtYXRpb24gc3RhY2staWQgc3VmZml4ZXMsIHJlcXVpcmluZyB3aWxkY2FyZCByZXNvdXJjZSBzdWZmaXhlcyB3aGlsZSBhY3Rpb25zIHJlbWFpbiBleHBsaWNpdGx5IHNjb3BlZC4nLFxuICAgICAgICBhcHBsaWVzVG86IFt7IHJlZ2V4OiAnL15SZXNvdXJjZTo6LipcXC9cXCokLycgfV0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICByZXR1cm4gZ2l0aHViUm9sZTtcbn1cbiJdfQ==