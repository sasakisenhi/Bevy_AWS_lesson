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
    // CDK Nagの警告を抑制。理由は、GitHub Actionsが動的なオブジェクトキー（コミットSHAパス）でビルド出力をアップロードするため、アクションは明示的にスコープされているものの、オブジェクトレベルのリソースワイルドカードが必要になるため。
    cdk_nag_1.NagSuppressions.addResourceSuppressions(githubRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'GitHub Actions uploads build outputs under dynamic object keys (commit SHA paths), which requires object-level resource wildcard while actions are explicitly scoped.',
            appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
        },
    ], true);
    return githubRole;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdCQSwwREFtRUM7QUFsRkQseURBQTJDO0FBRTNDLHFDQUEwQztBQUUxQyxxQ0FBOEM7QUFVOUMsa0RBQWtEO0FBQ2xELFNBQWdCLHVCQUF1QixDQUFDLEVBQ3RDLEtBQUssRUFDTCxPQUFPLEVBQ1AsY0FBYyxFQUNkLFVBQVUsR0FDVTtJQUNwQixNQUFNLG1CQUFtQixHQUFHLGdCQUFnQixPQUFPLG9EQUFvRCxDQUFDO0lBRXhHLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyw0QkFBNEIsQ0FDM0UsS0FBSyxFQUNMLGdCQUFnQixFQUNoQixtQkFBbUIsQ0FDcEIsQ0FBQztJQUVGLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLEVBQUU7UUFDMUQsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLG9CQUFvQixDQUNyQyxjQUFjLENBQUMsd0JBQXdCLEVBQ3ZDO1lBQ0UsWUFBWSxFQUFFO2dCQUNaLHlDQUF5QyxFQUFFLDJCQUFrQixDQUFDLFNBQVM7YUFDeEU7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YseUNBQXlDLEVBQUUsVUFBVTthQUN0RDtTQUNGLENBQ0Y7UUFDRCxXQUFXLEVBQUUsMkRBQTJEO0tBQ3pFLENBQUMsQ0FBQztJQUNMLHVHQUF1RztJQUNyRyxVQUFVLENBQUMsV0FBVyxDQUNwQixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7UUFDdEIsT0FBTyxFQUFFO1lBQ1AsZUFBZTtZQUNmLHNCQUFzQjtTQUN2QjtRQUNELFNBQVMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7S0FDdEMsQ0FBQyxDQUNILENBQUM7SUFFRixnR0FBZ0c7SUFDaEcsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGNBQWM7WUFDZCxjQUFjO1lBQ2QsaUJBQWlCO1lBQ2pCLHlCQUF5QjtZQUN6Qiw2QkFBNkI7U0FDOUI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxTQUFTLElBQUksQ0FBQztLQUM3QyxDQUFDLENBQ0gsQ0FBQztJQUVGLGlJQUFpSTtJQUNqSSx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxVQUFVLEVBQ1Y7UUFDRTtZQUNFLEVBQUUsRUFBRSxtQkFBbUI7WUFDdkIsTUFBTSxFQUFFLHVLQUF1SztZQUMvSyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO1NBQ2pEO0tBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztJQUVGLE9BQU8sVUFBVSxDQUFDO0FBQ3BCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuaW1wb3J0IHsgR0lUSFVCX09JRENfQ09ORklHIH0gZnJvbSAnLi9jb25maWcnO1xuXG4vLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruODl+ODreODkeODhuOCo+OCkuWumue+qeOBmeOCi+OCpOODs+OCv+ODvOODleOCp+ODvOOCuVxuZXhwb3J0IGludGVyZmFjZSBHaXRodWJPaWRjUm9sZVByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgYWNjb3VudDogc3RyaW5nO1xuICBhcnRpZmFjdEJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgZ2l0aHViU3Viczogc3RyaW5nW107XG59XG5cbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavjgqLjgq/jgrvjgrnjgZnjgovjgZ/jgoHjga5JQU3jg63jg7zjg6vjgpLkvZzmiJDjgZnjgovplqLmlbDjgpLlrprnvqlcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSh7XG4gIHNjb3BlLFxuICBhY2NvdW50LFxuICBhcnRpZmFjdEJ1Y2tldCxcbiAgZ2l0aHViU3Vicyxcbn06IEdpdGh1Yk9pZGNSb2xlUHJvcHMpOiBpYW0uUm9sZSB7XG4gIGNvbnN0IGV4aXN0aW5nUHJvdmlkZXJBcm4gPSBgYXJuOmF3czppYW06OiR7YWNjb3VudH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWA7XG5cbiAgY29uc3QgZ2l0aHViUHJvdmlkZXIgPSBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgc2NvcGUsXG4gICAgJ0dpdGh1YlByb3ZpZGVyJyxcbiAgICBleGlzdGluZ1Byb3ZpZGVyQXJuLFxuICApO1xuXG4gIGNvbnN0IGdpdGh1YlJvbGUgPSBuZXcgaWFtLlJvbGUoc2NvcGUsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICBnaXRodWJQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICB7XG4gICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiBHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lELFxuICAgICAgICB9LFxuICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IGdpdGh1YlN1YnMsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICksXG4gICAgZGVzY3JpcHRpb246ICdSb2xlIGFzc3VtZWQgYnkgR2l0SHViIEFjdGlvbnMgZm9yIGFydGlmYWN0IGJ1Y2tldCBhY2Nlc3MnLFxuICB9KTtcbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjg5DjgrHjg4Pjg4jjga7jg6rjgrnjg4jjgajloLTmiYDjga7lj5blvpfjgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jlhoXjga7jgqrjg5bjgrjjgqfjgq/jg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBOYWfjga7orablkYrjgpLmipHliLbjgILnkIbnlLHjga/jgIFHaXRIdWIgQWN0aW9uc+OBjOWLleeahOOBquOCquODluOCuOOCp+OCr+ODiOOCreODvO+8iOOCs+ODn+ODg+ODiFNIQeODkeOCue+8ieOBp+ODk+ODq+ODieWHuuWKm+OCkuOCouODg+ODl+ODreODvOODieOBmeOCi+OBn+OCgeOAgeOCouOCr+OCt+ODp+ODs+OBr+aYjuekuueahOOBq+OCueOCs+ODvOODl+OBleOCjOOBpuOBhOOCi+OCguOBruOBruOAgeOCquODluOCuOOCp+OCr+ODiOODrOODmeODq+OBruODquOCveODvOOCueODr+OCpOODq+ODieOCq+ODvOODieOBjOW/heimgeOBq+OBquOCi+OBn+OCgeOAglxuICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgZ2l0aHViUm9sZSxcbiAgICBbXG4gICAgICB7XG4gICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTUnLFxuICAgICAgICByZWFzb246ICdHaXRIdWIgQWN0aW9ucyB1cGxvYWRzIGJ1aWxkIG91dHB1dHMgdW5kZXIgZHluYW1pYyBvYmplY3Qga2V5cyAoY29tbWl0IFNIQSBwYXRocyksIHdoaWNoIHJlcXVpcmVzIG9iamVjdC1sZXZlbCByZXNvdXJjZSB3aWxkY2FyZCB3aGlsZSBhY3Rpb25zIGFyZSBleHBsaWNpdGx5IHNjb3BlZC4nLFxuICAgICAgICBhcHBsaWVzVG86IFt7IHJlZ2V4OiAnL15SZXNvdXJjZTo6LipcXFxcL1xcXFwqJC8nIH1dLFxuICAgICAgfSxcbiAgICBdLFxuICAgIHRydWUsXG4gICk7XG5cbiAgcmV0dXJuIGdpdGh1YlJvbGU7XG59XG4iXX0=