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
exports.createCodeBuildPreparationRole = createCodeBuildPreparationRole;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cdk_nag_1 = require("cdk-nag");
// 将来のCodeBuildオフロードに備えた最小サービスロールを作成する。
// Phase3では StartBuild を呼び出さず、実行基盤の権限土台のみを用意する。
function createCodeBuildPreparationRole({ scope, artifactBucket, }) {
    const codeBuildServiceRole = new iam.Role(scope, 'CodeBuildServiceRole', {
        assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
        description: 'Preparation role for future CodeBuild offload of artifact build workflow',
    });
    // CodeBuildがS3バケットに対して必要なアクセス許可を付与する。これには、バケットのリストと場所の取得、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
    codeBuildServiceRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:ListBucket',
            's3:GetBucketLocation',
        ],
        resources: [artifactBucket.bucketArn],
    }));
    // CodeBuildがS3バケット内のオブジェクトに対して必要なアクセス許可を付与する。これには、オブジェクトの取得、配置、削除、およびマルチパートアップロードの管理が含まれる。
    codeBuildServiceRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:AbortMultipartUpload',
            's3:ListMultipartUploadParts',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
    }));
    // CodeBuildがCloudWatch Logsに対して必要なアクセス許可を付与する。これには、ロググループとログストリームの作成、およびログイベントの配置が含まれる。
    codeBuildServiceRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
        ],
        resources: [
            `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*`,
            `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*:log-stream:*`,
        ],
    }));
    // CodeBuildのサービスロールに対するCDK Nagの警告を抑制する。これには、CodeBuildが動的なオブジェクトキーやロググループ/ストリーム名を使用するため、ワイルドカードリソースサフィックスが必要であるが、アクションは明示的にスコープされているという理由が含まれる。
    cdk_nag_1.NagSuppressions.addResourceSuppressions(codeBuildServiceRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'CodeBuild writes dynamic artifact object keys and dynamic log group/stream names, requiring wildcard resource suffixes while actions remain explicitly scoped.',
            appliesTo: [{ regex: '/^Resource::.*\\*$/' }],
        },
    ], true);
    return codeBuildServiceRole;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWJ1aWxkLXByZXAtcm9sZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZGVidWlsZC1wcmVwLXJvbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFhQSx3RUErREM7QUEzRUQsaURBQW1DO0FBQ25DLHlEQUEyQztBQUUzQyxxQ0FBMEM7QUFPMUMsdUNBQXVDO0FBQ3ZDLCtDQUErQztBQUMvQyxTQUFnQiw4QkFBOEIsQ0FBQyxFQUM3QyxLQUFLLEVBQ0wsY0FBYyxHQUNnQjtJQUM5QixNQUFNLG9CQUFvQixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUU7UUFDdkUsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO1FBQzlELFdBQVcsRUFBRSwwRUFBMEU7S0FDeEYsQ0FBQyxDQUFDO0lBRUgsa0dBQWtHO0lBQ2xHLG9CQUFvQixDQUFDLFdBQVcsQ0FDOUIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGVBQWU7WUFDZixzQkFBc0I7U0FDdkI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO0tBQ3RDLENBQUMsQ0FDSCxDQUFDO0lBRUYsMkZBQTJGO0lBQzNGLG9CQUFvQixDQUFDLFdBQVcsQ0FDOUIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGNBQWM7WUFDZCxjQUFjO1lBQ2QsaUJBQWlCO1lBQ2pCLHlCQUF5QjtZQUN6Qiw2QkFBNkI7U0FDOUI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxTQUFTLElBQUksQ0FBQztLQUM3QyxDQUFDLENBQ0gsQ0FBQztJQUVGLHdGQUF3RjtJQUN4RixvQkFBb0IsQ0FBQyxXQUFXLENBQzlCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QixPQUFPLEVBQUU7WUFDUCxxQkFBcUI7WUFDckIsc0JBQXNCO1lBQ3RCLG1CQUFtQjtTQUNwQjtRQUNELFNBQVMsRUFBRTtZQUNULE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLDZCQUE2QjtZQUNsRyxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSwwQ0FBMEM7U0FDaEg7S0FDRixDQUFDLENBQ0gsQ0FBQztJQUVGLCtJQUErSTtJQUMvSSx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxvQkFBb0IsRUFDcEI7UUFDRTtZQUNFLEVBQUUsRUFBRSxtQkFBbUI7WUFDdkIsTUFBTSxFQUFFLGdLQUFnSztZQUN4SyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxDQUFDO1NBQzlDO0tBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztJQUVGLE9BQU8sb0JBQW9CLENBQUM7QUFDOUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuZXhwb3J0IGludGVyZmFjZSBDb2RlQnVpbGRQcmVwYXJhdGlvblJvbGVQcm9wcyB7XG4gIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5JQnVja2V0O1xufVxuXG4vLyDlsIbmnaXjga5Db2RlQnVpbGTjgqrjg5Xjg63jg7zjg4njgavlgpnjgYjjgZ/mnIDlsI/jgrXjg7zjg5Pjgrnjg63jg7zjg6vjgpLkvZzmiJDjgZnjgovjgIJcbi8vIFBoYXNlM+OBp+OBryBTdGFydEJ1aWxkIOOCkuWRvOOBs+WHuuOBleOBmuOAgeWun+ihjOWfuuebpOOBruaoqemZkOWcn+WPsOOBruOBv+OCkueUqOaEj+OBmeOCi+OAglxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNvZGVCdWlsZFByZXBhcmF0aW9uUm9sZSh7XG4gIHNjb3BlLFxuICBhcnRpZmFjdEJ1Y2tldCxcbn06IENvZGVCdWlsZFByZXBhcmF0aW9uUm9sZVByb3BzKTogaWFtLlJvbGUge1xuICBjb25zdCBjb2RlQnVpbGRTZXJ2aWNlUm9sZSA9IG5ldyBpYW0uUm9sZShzY29wZSwgJ0NvZGVCdWlsZFNlcnZpY2VSb2xlJywge1xuICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlYnVpbGQuYW1hem9uYXdzLmNvbScpLFxuICAgIGRlc2NyaXB0aW9uOiAnUHJlcGFyYXRpb24gcm9sZSBmb3IgZnV0dXJlIENvZGVCdWlsZCBvZmZsb2FkIG9mIGFydGlmYWN0IGJ1aWxkIHdvcmtmbG93JyxcbiAgfSk7XG5cbiAgLy8gQ29kZUJ1aWxk44GMUzPjg5DjgrHjg4Pjg4jjgavlr77jgZfjgablv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjg5DjgrHjg4Pjg4jjga7jg6rjgrnjg4jjgajloLTmiYDjga7lj5blvpfjgIHjgqrjg5bjgrjjgqfjgq/jg4jjga7lj5blvpfjgIHphY3nva7jgIHliYrpmaTjgIHjgYrjgojjgbPjg57jg6vjg4Hjg5Hjg7zjg4jjgqLjg4Pjg5fjg63jg7zjg4njga7nrqHnkIbjgYzlkKvjgb7jgozjgovjgIJcbiAgY29kZUJ1aWxkU2VydmljZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJuXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBDb2RlQnVpbGTjgYxTM+ODkOOCseODg+ODiOWGheOBruOCquODluOCuOOCp+OCr+ODiOOBq+WvvuOBl+OBpuW/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeOCquODluOCuOOCp+OCr+ODiOOBruWPluW+l+OAgemFjee9ruOAgeWJiumZpOOAgeOBiuOCiOOBs+ODnuODq+ODgeODkeODvOODiOOCouODg+ODl+ODreODvOODieOBrueuoeeQhuOBjOWQq+OBvuOCjOOCi+OAglxuICBjb2RlQnVpbGRTZXJ2aWNlUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENvZGVCdWlsZOOBjENsb3VkV2F0Y2ggTG9nc+OBq+WvvuOBl+OBpuW/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeODreOCsOOCsOODq+ODvOODl+OBqOODreOCsOOCueODiOODquODvOODoOOBruS9nOaIkOOAgeOBiuOCiOOBs+ODreOCsOOCpOODmeODs+ODiOOBrumFjee9ruOBjOWQq+OBvuOCjOOCi+OAglxuICBjb2RlQnVpbGRTZXJ2aWNlUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTpsb2dzOiR7Y2RrLkF3cy5SRUdJT059OiR7Y2RrLkF3cy5BQ0NPVU5UX0lEfTpsb2ctZ3JvdXA6L2F3cy9jb2RlYnVpbGQvKmAsXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06bG9nczoke2Nkay5Bd3MuUkVHSU9OfToke2Nkay5Bd3MuQUNDT1VOVF9JRH06bG9nLWdyb3VwOi9hd3MvY29kZWJ1aWxkLyo6bG9nLXN0cmVhbToqYCxcbiAgICAgIF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ29kZUJ1aWxk44Gu44K144O844OT44K544Ot44O844Or44Gr5a++44GZ44KLQ0RLIE5hZ+OBruitpuWRiuOCkuaKkeWItuOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgUNvZGVCdWlsZOOBjOWLleeahOOBquOCquODluOCuOOCp+OCr+ODiOOCreODvOOChOODreOCsOOCsOODq+ODvOODly/jgrnjg4jjg6rjg7zjg6DlkI3jgpLkvb/nlKjjgZnjgovjgZ/jgoHjgIHjg6/jgqTjg6vjg4njgqvjg7zjg4njg6rjgr3jg7zjgrnjgrXjg5XjgqPjg4Pjgq/jgrnjgYzlv4XopoHjgafjgYLjgovjgYzjgIHjgqLjgq/jgrfjg6fjg7Pjga/mmI7npLrnmoTjgavjgrnjgrPjg7zjg5fjgZXjgozjgabjgYTjgovjgajjgYTjgYbnkIbnlLHjgYzlkKvjgb7jgozjgovjgIJcbiAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgIGNvZGVCdWlsZFNlcnZpY2VSb2xlLFxuICAgIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgIHJlYXNvbjogJ0NvZGVCdWlsZCB3cml0ZXMgZHluYW1pYyBhcnRpZmFjdCBvYmplY3Qga2V5cyBhbmQgZHluYW1pYyBsb2cgZ3JvdXAvc3RyZWFtIG5hbWVzLCByZXF1aXJpbmcgd2lsZGNhcmQgcmVzb3VyY2Ugc3VmZml4ZXMgd2hpbGUgYWN0aW9ucyByZW1haW4gZXhwbGljaXRseSBzY29wZWQuJyxcbiAgICAgICAgYXBwbGllc1RvOiBbeyByZWdleDogJy9eUmVzb3VyY2U6Oi4qXFxcXCokLycgfV0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICByZXR1cm4gY29kZUJ1aWxkU2VydmljZVJvbGU7XG59Il19