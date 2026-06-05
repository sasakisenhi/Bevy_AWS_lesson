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
    // CDK bootstrap assets バケット（各リージョン）へのテンプレート/アセット公開権限を付与する。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:ListBucket',
            's3:GetBucketLocation',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:s3:::cdk-hnb659fds-assets-${account}-*`,
        ],
    }));
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:AbortMultipartUpload',
            's3:ListMultipartUploadParts',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:s3:::cdk-hnb659fds-assets-${account}-*/*`,
        ],
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
    // CDK bootstrapロール（デプロイ/アセット公開/ルックアップ）の引き受け権限を付与する。
    // bootstrapバケットのバケットポリシーは、通常これらのロール経由のアクセスを前提にしているため、
    // AssumeRoleできないとアセット公開時に403になる。
    githubRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            'sts:AssumeRole',
            'sts:TagSession',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:iam::${account}:role/cdk-hnb659fds-deploy-role-${account}-*`,
            `arn:${cdk.Aws.PARTITION}:iam::${account}:role/cdk-hnb659fds-file-publishing-role-${account}-*`,
            `arn:${cdk.Aws.PARTITION}:iam::${account}:role/cdk-hnb659fds-image-publishing-role-${account}-*`,
            `arn:${cdk.Aws.PARTITION}:iam::${account}:role/cdk-hnb659fds-lookup-role-${account}-*`,
        ],
    }));
    // CDK Nagの警告を抑制。理由は、GitHub Actionsが動的なオブジェクトキーとCloudFormationスタックIDサフィックスを扱うため、
    // リソース末尾ワイルドカードが必要になるため。
    cdk_nag_1.NagSuppressions.addResourceSuppressions(githubRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'GitHub Actions uses dynamic object keys and CloudFormation stack-id suffixes, requiring wildcard resource suffixes while actions remain explicitly scoped.',
            appliesTo: [
                { regex: '/^Resource::.*\/\*$/' },
                { regex: '/^Resource::arn:.*:iam::\d{12}:role\/cdk-hnb659fds-.*-\*$/' },
            ],
        },
    ], true);
    return githubRole;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlCQSwwREErSUM7QUEvSkQsaURBQW1DO0FBQ25DLHlEQUEyQztBQUUzQyxxQ0FBMEM7QUFFMUMscUNBQThDO0FBVTlDLGtEQUFrRDtBQUNsRCxTQUFnQix1QkFBdUIsQ0FBQyxFQUN0QyxLQUFLLEVBQ0wsT0FBTyxFQUNQLGNBQWMsRUFDZCxVQUFVLEdBQ1U7SUFDcEIsTUFBTSxtQkFBbUIsR0FBRyxnQkFBZ0IsT0FBTyxvREFBb0QsQ0FBQztJQUV4RyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMscUJBQXFCLENBQUMsNEJBQTRCLENBQzNFLEtBQUssRUFDTCxnQkFBZ0IsRUFDaEIsbUJBQW1CLENBQ3BCLENBQUM7SUFFRixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1FBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FDckMsY0FBYyxDQUFDLHdCQUF3QixFQUN2QztZQUNFLFlBQVksRUFBRTtnQkFDWix5Q0FBeUMsRUFBRSwyQkFBa0IsQ0FBQyxTQUFTO2FBQ3hFO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLHlDQUF5QyxFQUFFLFVBQVU7YUFDdEQ7U0FDRixDQUNGO1FBQ0QsV0FBVyxFQUFFLDJEQUEyRDtLQUN6RSxDQUFDLENBQUM7SUFDTCx1R0FBdUc7SUFDckcsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGVBQWU7WUFDZixzQkFBc0I7U0FDdkI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO0tBQ3RDLENBQUMsQ0FDSCxDQUFDO0lBRUYsZ0dBQWdHO0lBQ2hH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bnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuaW1wb3J0IHsgR0lUSFVCX09JRENfQ09ORklHIH0gZnJvbSAnLi9jb25maWcnO1xuXG4vLyBHaXRIdWIgT0lEQ+ODreODvOODq+OBruODl+ODreODkeODhuOCo+OCkuWumue+qeOBmeOCi+OCpOODs+OCv+ODvOODleOCp+ODvOOCuVxuZXhwb3J0IGludGVyZmFjZSBHaXRodWJPaWRjUm9sZVByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgYWNjb3VudDogc3RyaW5nO1xuICBhcnRpZmFjdEJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgZ2l0aHViU3Viczogc3RyaW5nW107XG59XG5cbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavjgqLjgq/jgrvjgrnjgZnjgovjgZ/jgoHjga5JQU3jg63jg7zjg6vjgpLkvZzmiJDjgZnjgovplqLmlbDjgpLlrprnvqlcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSh7XG4gIHNjb3BlLFxuICBhY2NvdW50LFxuICBhcnRpZmFjdEJ1Y2tldCxcbiAgZ2l0aHViU3Vicyxcbn06IEdpdGh1Yk9pZGNSb2xlUHJvcHMpOiBpYW0uUm9sZSB7XG4gIGNvbnN0IGV4aXN0aW5nUHJvdmlkZXJBcm4gPSBgYXJuOmF3czppYW06OiR7YWNjb3VudH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWA7XG5cbiAgY29uc3QgZ2l0aHViUHJvdmlkZXIgPSBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgc2NvcGUsXG4gICAgJ0dpdGh1YlByb3ZpZGVyJyxcbiAgICBleGlzdGluZ1Byb3ZpZGVyQXJuLFxuICApO1xuXG4gIGNvbnN0IGdpdGh1YlJvbGUgPSBuZXcgaWFtLlJvbGUoc2NvcGUsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICBnaXRodWJQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICB7XG4gICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiBHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lELFxuICAgICAgICB9LFxuICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IGdpdGh1YlN1YnMsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICksXG4gICAgZGVzY3JpcHRpb246ICdSb2xlIGFzc3VtZWQgYnkgR2l0SHViIEFjdGlvbnMgZm9yIGFydGlmYWN0IGJ1Y2tldCBhY2Nlc3MnLFxuICB9KTtcbi8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjg5DjgrHjg4Pjg4jjga7jg6rjgrnjg4jjgajloLTmiYDjga7lj5blvpfjgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIEdpdEh1YiBBY3Rpb25z44GMUzPjg5DjgrHjg4Pjg4jlhoXjga7jgqrjg5bjgrjjgqfjgq/jg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBib290c3RyYXAgYXNzZXRzIOODkOOCseODg+ODiO+8iOWQhOODquODvOOCuOODp+ODs++8ieOBuOOBruODhuODs+ODl+ODrOODvOODiC/jgqLjgrvjg4Pjg4jlhazplovmqKnpmZDjgpLku5jkuI7jgZnjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpzMzo6OmNkay1obmI2NTlmZHMtYXNzZXRzLSR7YWNjb3VudH0tKmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAnczM6QWJvcnRNdWx0aXBhcnRVcGxvYWQnLFxuICAgICAgICAnczM6TGlzdE11bHRpcGFydFVwbG9hZFBhcnRzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpzMzo6OmNkay1obmI2NTlmZHMtYXNzZXRzLSR7YWNjb3VudH0tKi8qYCxcbiAgICAgIF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ2xvdWRGb3JtYXRpb24gb3V0cHV0c+OCkuWPgueFp+OBl+OBpuWun+ihjOaZguioreWumuOCkuWLleeahOino+axuuOBmeOCi+OBn+OCgeOBruiqreOBv+WPluOCiuaoqemZkOOCkuS7mOS4juOBmeOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFRlbXBsYXRlJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpjbG91ZGZvcm1hdGlvbjoqOiR7YWNjb3VudH06c3RhY2svQmV2eVBsYXRmb3JtSW5mcmFTdGFjay8qYCxcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpjbG91ZGZvcm1hdGlvbjoqOiR7YWNjb3VudH06c3RhY2svQmV2eVBsYXRmb3JtSW5mcmFTZWNvbmRhcnlCdWNrZXRTdGFjay8qYCxcbiAgICAgIF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ0RLIGJvb3RzdHJhcCB2ZXJzaW9u56K66KqN44Gn5Y+C54Wn44GV44KM44KLU1NN44OR44Op44Oh44O844K/44Gu6Kqt44G/5Y+W44KK5qip6ZmQ44KS5LuY5LiO44GZ44KL44CCXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06c3NtOio6JHthY2NvdW50fTpwYXJhbWV0ZXIvY2RrLWJvb3RzdHJhcC9obmI2NTlmZHMvdmVyc2lvbmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBib290c3RyYXDjg63jg7zjg6vvvIjjg4fjg5fjg63jgqQv44Ki44K744OD44OI5YWs6ZaLL+ODq+ODg+OCr+OCouODg+ODl++8ieOBruW8leOBjeWPl+OBkeaoqemZkOOCkuS7mOS4juOBmeOCi+OAglxuICAvLyBib290c3RyYXDjg5DjgrHjg4Pjg4jjga7jg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjga/jgIHpgJrluLjjgZPjgozjgonjga7jg63jg7zjg6vntYznlLHjga7jgqLjgq/jgrvjgrnjgpLliY3mj5DjgavjgZfjgabjgYTjgovjgZ/jgoHjgIFcbiAgLy8gQXNzdW1lUm9sZeOBp+OBjeOBquOBhOOBqOOCouOCu+ODg+ODiOWFrOmWi+aZguOBqzQwM+OBq+OBquOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3N0czpBc3N1bWVSb2xlJyxcbiAgICAgICAgJ3N0czpUYWdTZXNzaW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTppYW06OiR7YWNjb3VudH06cm9sZS9jZGstaG5iNjU5ZmRzLWRlcGxveS1yb2xlLSR7YWNjb3VudH0tKmAsXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06aWFtOjoke2FjY291bnR9OnJvbGUvY2RrLWhuYjY1OWZkcy1maWxlLXB1Ymxpc2hpbmctcm9sZS0ke2FjY291bnR9LSpgLFxuICAgICAgICBgYXJuOiR7Y2RrLkF3cy5QQVJUSVRJT059OmlhbTo6JHthY2NvdW50fTpyb2xlL2Nkay1obmI2NTlmZHMtaW1hZ2UtcHVibGlzaGluZy1yb2xlLSR7YWNjb3VudH0tKmAsXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06aWFtOjoke2FjY291bnR9OnJvbGUvY2RrLWhuYjY1OWZkcy1sb29rdXAtcm9sZS0ke2FjY291bnR9LSpgLFxuICAgICAgXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBDREsgTmFn44Gu6K2m5ZGK44KS5oqR5Yi244CC55CG55Sx44Gv44CBR2l0SHViIEFjdGlvbnPjgYzli5XnmoTjgarjgqrjg5bjgrjjgqfjgq/jg4jjgq3jg7zjgahDbG91ZEZvcm1hdGlvbuOCueOCv+ODg+OCr0lE44K144OV44Kj44OD44Kv44K544KS5omx44GG44Gf44KB44CBXG4gIC8vIOODquOCveODvOOCueacq+WwvuODr+OCpOODq+ODieOCq+ODvOODieOBjOW/heimgeOBq+OBquOCi+OBn+OCgeOAglxuICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgZ2l0aHViUm9sZSxcbiAgICBbXG4gICAgICB7XG4gICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTUnLFxuICAgICAgICByZWFzb246ICdHaXRIdWIgQWN0aW9ucyB1c2VzIGR5bmFtaWMgb2JqZWN0IGtleXMgYW5kIENsb3VkRm9ybWF0aW9uIHN0YWNrLWlkIHN1ZmZpeGVzLCByZXF1aXJpbmcgd2lsZGNhcmQgcmVzb3VyY2Ugc3VmZml4ZXMgd2hpbGUgYWN0aW9ucyByZW1haW4gZXhwbGljaXRseSBzY29wZWQuJyxcbiAgICAgICAgYXBwbGllc1RvOiBbXG4gICAgICAgICAgeyByZWdleDogJy9eUmVzb3VyY2U6Oi4qXFwvXFwqJC8nIH0sXG4gICAgICAgICAgeyByZWdleDogJy9eUmVzb3VyY2U6OmFybjouKjppYW06OlxcZHsxMn06cm9sZVxcL2Nkay1obmI2NTlmZHMtLiotXFwqJC8nIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICByZXR1cm4gZ2l0aHViUm9sZTtcbn1cbiJdfQ==