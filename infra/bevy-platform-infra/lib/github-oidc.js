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
    const githubProvider = new iam.OidcProviderNative(scope, 'GithubProvider', {
        url: config_1.GITHUB_OIDC_CONFIG.PROVIDER_URL,
        clientIds: [config_1.GITHUB_OIDC_CONFIG.CLIENT_ID],
    });
    const githubRole = new iam.Role(scope, 'GithubActionsRole', {
        assumedBy: new iam.WebIdentityPrincipal(githubProvider.oidcProviderArn, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlCQSwwREE0SUM7QUE1SkQsaURBQW1DO0FBQ25DLHlEQUEyQztBQUUzQyxxQ0FBMEM7QUFFMUMscUNBQThDO0FBVTlDLGtEQUFrRDtBQUNsRCxTQUFnQix1QkFBdUIsQ0FBQyxFQUN0QyxLQUFLLEVBQ0wsT0FBTyxFQUNQLGNBQWMsRUFDZCxVQUFVLEdBQ1U7SUFDcEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1FBQ3pFLEdBQUcsRUFBRSwyQkFBa0IsQ0FBQyxZQUFZO1FBQ3BDLFNBQVMsRUFBRSxDQUFDLDJCQUFrQixDQUFDLFNBQVMsQ0FBQztLQUMxQyxDQUFDLENBQUM7SUFFSCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1FBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FDckMsY0FBYyxDQUFDLGVBQWUsRUFDOUI7WUFDRSxZQUFZLEVBQUU7Z0JBQ1oseUNBQXlDLEVBQUUsMkJBQWtCLENBQUMsU0FBUzthQUN4RTtZQUNELFVBQVUsRUFBRTtnQkFDVix5Q0FBeUMsRUFBRSxVQUFVO2FBQ3REO1NBQ0YsQ0FDRjtRQUNELFdBQVcsRUFBRSwyREFBMkQ7S0FDekUsQ0FBQyxDQUFDO0lBQ0wsdUdBQXVHO0lBQ3JHLFVBQVUsQ0FBQyxXQUFXLENBQ3BCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QixPQUFPLEVBQUU7WUFDUCxlQUFlO1lBQ2Ysc0JBQXNCO1NBQ3ZCO1FBQ0QsU0FBUyxFQUFFLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztLQUN0QyxDQUFDLENBQ0gsQ0FBQztJ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dCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSAnY2RrLW5hZyc7XG5cbmltcG9ydCB7IEdJVEhVQl9PSURDX0NPTkZJRyB9IGZyb20gJy4vY29uZmlnJztcblxuLy8gR2l0SHViIE9JREPjg63jg7zjg6vjga7jg5fjg63jg5Hjg4bjgqPjgpLlrprnvqnjgZnjgovjgqTjg7Pjgr/jg7zjg5Xjgqfjg7zjgrlcbmV4cG9ydCBpbnRlcmZhY2UgR2l0aHViT2lkY1JvbGVQcm9wcyB7XG4gIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIGFjY291bnQ6IHN0cmluZztcbiAgYXJ0aWZhY3RCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIGdpdGh1YlN1YnM6IHN0cmluZ1tdO1xufVxuXG4vLyBHaXRIdWIgQWN0aW9uc+OBjFMz44OQ44Kx44OD44OI44Gr44Ki44Kv44K744K544GZ44KL44Gf44KB44GuSUFN44Ot44O844Or44KS5L2c5oiQ44GZ44KL6Zai5pWw44KS5a6a576pXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlR2l0aHViQWN0aW9uc1JvbGUoe1xuICBzY29wZSxcbiAgYWNjb3VudCxcbiAgYXJ0aWZhY3RCdWNrZXQsXG4gIGdpdGh1YlN1YnMsXG59OiBHaXRodWJPaWRjUm9sZVByb3BzKTogaWFtLlJvbGUge1xuICBjb25zdCBnaXRodWJQcm92aWRlciA9IG5ldyBpYW0uT2lkY1Byb3ZpZGVyTmF0aXZlKHNjb3BlLCAnR2l0aHViUHJvdmlkZXInLCB7XG4gICAgdXJsOiBHSVRIVUJfT0lEQ19DT05GSUcuUFJPVklERVJfVVJMLFxuICAgIGNsaWVudElkczogW0dJVEhVQl9PSURDX0NPTkZJRy5DTElFTlRfSURdLFxuICB9KTtcblxuICBjb25zdCBnaXRodWJSb2xlID0gbmV3IGlhbS5Sb2xlKHNjb3BlLCAnR2l0aHViQWN0aW9uc1JvbGUnLCB7XG4gICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgZ2l0aHViUHJvdmlkZXIub2lkY1Byb3ZpZGVyQXJuLFxuICAgICAge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogR0lUSFVCX09JRENfQ09ORklHLkNMSUVOVF9JRCxcbiAgICAgICAgfSxcbiAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBnaXRodWJTdWJzLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApLFxuICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBhc3N1bWVkIGJ5IEdpdEh1YiBBY3Rpb25zIGZvciBhcnRpZmFjdCBidWNrZXQgYWNjZXNzJyxcbiAgfSk7XG4vLyBHaXRIdWIgQWN0aW9uc+OBjFMz44OQ44Kx44OD44OI44Gr5a++44GX44Gm5b+F6KaB44Gq44Ki44Kv44K744K56Kix5Y+v44KS5LuY5LiO44GZ44KL44CC44GT44KM44Gr44Gv44CB44OQ44Kx44OD44OI44Gu44Oq44K544OI44Go5aC05omA44Gu5Y+W5b6X44CB44Kq44OW44K444Kn44Kv44OI44Gu5Y+W5b6X44CB6YWN572u44CB5YmK6Zmk44CB44GK44KI44Gz44Oe44Or44OB44OR44O844OI44Ki44OD44OX44Ot44O844OJ44Gu566h55CG44GM5ZCr44G+44KM44KL44CCXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJuXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBHaXRIdWIgQWN0aW9uc+OBjFMz44OQ44Kx44OD44OI5YaF44Gu44Kq44OW44K444Kn44Kv44OI44Gr5a++44GX44Gm5b+F6KaB44Gq44Ki44Kv44K744K56Kix5Y+v44KS5LuY5LiO44GZ44KL44CC44GT44KM44Gr44Gv44CB44Kq44OW44K444Kn44Kv44OI44Gu5Y+W5b6X44CB6YWN572u44CB5YmK6Zmk44CB44GK44KI44Gz44Oe44Or44OB44OR44O844OI44Ki44OD44OX44Ot44O844OJ44Gu566h55CG44GM5ZCr44G+44KM44KL44CCXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAnczM6QWJvcnRNdWx0aXBhcnRVcGxvYWQnLFxuICAgICAgICAnczM6TGlzdE11bHRpcGFydFVwbG9hZFBhcnRzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgJHthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBDREsgYm9vdHN0cmFwIGFzc2V0cyDjg5DjgrHjg4Pjg4jvvIjlkITjg6rjg7zjgrjjg6fjg7PvvInjgbjjga7jg4bjg7Pjg5fjg6zjg7zjg4gv44Ki44K744OD44OI5YWs6ZaL5qip6ZmQ44KS5LuY5LiO44GZ44KL44CCXG4gIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06czM6OjpjZGstaG5iNjU5ZmRzLWFzc2V0cy0ke2FjY291bnR9LSpgLFxuICAgICAgXSxcbiAgICB9KSxcbiAgKTtcblxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgJ3MzOkFib3J0TXVsdGlwYXJ0VXBsb2FkJyxcbiAgICAgICAgJ3MzOkxpc3RNdWx0aXBhcnRVcGxvYWRQYXJ0cycsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06czM6OjpjZGstaG5iNjU5ZmRzLWFzc2V0cy0ke2FjY291bnR9LSovKmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENsb3VkRm9ybWF0aW9uIG91dHB1dHPjgpLlj4LnhafjgZfjgablrp/ooYzmmYLoqK3lrprjgpLli5XnmoTop6PmsbrjgZnjgovjgZ/jgoHjga7oqq3jgb/lj5bjgormqKnpmZDjgpLku5jkuI7jgZnjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpHZXRUZW1wbGF0ZScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06Y2xvdWRmb3JtYXRpb246Kjoke2FjY291bnR9OnN0YWNrL0JldnlQbGF0Zm9ybUluZnJhU3RhY2svKmAsXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06Y2xvdWRmb3JtYXRpb246Kjoke2FjY291bnR9OnN0YWNrL0JldnlQbGF0Zm9ybUluZnJhU2Vjb25kYXJ5QnVja2V0U3RhY2svKmAsXG4gICAgICBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIENESyBib290c3RyYXAgdmVyc2lvbueiuuiqjeOBp+WPgueFp+OBleOCjOOCi1NTTeODkeODqeODoeODvOOCv+OBruiqreOBv+WPluOCiuaoqemZkOOCkuS7mOS4juOBmeOCi+OAglxuICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOiR7Y2RrLkF3cy5QQVJUSVRJT059OnNzbToqOiR7YWNjb3VudH06cGFyYW1ldGVyL2Nkay1ib290c3RyYXAvaG5iNjU5ZmRzL3ZlcnNpb25gLFxuICAgICAgXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBDREsgYm9vdHN0cmFw44Ot44O844Or77yI44OH44OX44Ot44KkL+OCouOCu+ODg+ODiOWFrOmWiy/jg6vjg4Pjgq/jgqLjg4Pjg5fvvInjga7lvJXjgY3lj5fjgZHmqKnpmZDjgpLku5jkuI7jgZnjgovjgIJcbiAgLy8gYm9vdHN0cmFw44OQ44Kx44OD44OI44Gu44OQ44Kx44OD44OI44Od44Oq44K344O844Gv44CB6YCa5bi444GT44KM44KJ44Gu44Ot44O844Or57WM55Sx44Gu44Ki44Kv44K744K544KS5YmN5o+Q44Gr44GX44Gm44GE44KL44Gf44KB44CBXG4gIC8vIEFzc3VtZVJvbGXjgafjgY3jgarjgYTjgajjgqLjgrvjg4Pjg4jlhazplovmmYLjgas0MDPjgavjgarjgovjgIJcbiAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgICdzdHM6VGFnU2Vzc2lvbicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46JHtjZGsuQXdzLlBBUlRJVElPTn06aWFtOjoke2FjY291bnR9OnJvbGUvY2RrLWhuYjY1OWZkcy1kZXBsb3ktcm9sZS0ke2FjY291bnR9LSpgLFxuICAgICAgICBgYXJuOiR7Y2RrLkF3cy5QQVJUSVRJT059OmlhbTo6JHthY2NvdW50fTpyb2xlL2Nkay1obmI2NTlmZHMtZmlsZS1wdWJsaXNoaW5nLXJvbGUtJHthY2NvdW50fS0qYCxcbiAgICAgICAgYGFybjoke2Nkay5Bd3MuUEFSVElUSU9OfTppYW06OiR7YWNjb3VudH06cm9sZS9jZGstaG5iNjU5ZmRzLWltYWdlLXB1Ymxpc2hpbmctcm9sZS0ke2FjY291bnR9LSpgLFxuICAgICAgICBgYXJuOiR7Y2RrLkF3cy5QQVJUSVRJT059OmlhbTo6JHthY2NvdW50fTpyb2xlL2Nkay1obmI2NTlmZHMtbG9va3VwLXJvbGUtJHthY2NvdW50fS0qYCxcbiAgICAgIF0sXG4gICAgfSksXG4gICk7XG5cbiAgLy8gQ0RLIE5hZ+OBruitpuWRiuOCkuaKkeWItuOAgueQhueUseOBr+OAgUdpdEh1YiBBY3Rpb25z44GM5YuV55qE44Gq44Kq44OW44K444Kn44Kv44OI44Kt44O844GoQ2xvdWRGb3JtYXRpb27jgrnjgr/jg4Pjgq9JROOCteODleOCo+ODg+OCr+OCueOCkuaJseOBhuOBn+OCgeOAgVxuICAvLyDjg6rjgr3jg7zjgrnmnKvlsL7jg6/jgqTjg6vjg4njgqvjg7zjg4njgYzlv4XopoHjgavjgarjgovjgZ/jgoHjgIJcbiAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgIGdpdGh1YlJvbGUsXG4gICAgW1xuICAgICAge1xuICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgcmVhc29uOiAnR2l0SHViIEFjdGlvbnMgdXNlcyBkeW5hbWljIG9iamVjdCBrZXlzIGFuZCBDbG91ZEZvcm1hdGlvbiBzdGFjay1pZCBzdWZmaXhlcywgcmVxdWlyaW5nIHdpbGRjYXJkIHJlc291cmNlIHN1ZmZpeGVzIHdoaWxlIGFjdGlvbnMgcmVtYWluIGV4cGxpY2l0bHkgc2NvcGVkLicsXG4gICAgICAgIGFwcGxpZXNUbzogW1xuICAgICAgICAgIHsgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcL1xcKiQvJyB9LFxuICAgICAgICAgIHsgcmVnZXg6ICcvXlJlc291cmNlOjphcm46Lio6aWFtOjpcXGR7MTJ9OnJvbGVcXC9jZGstaG5iNjU5ZmRzLS4qLVxcKiQvJyB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICBdLFxuICAgIHRydWUsXG4gICk7XG5cbiAgcmV0dXJuIGdpdGh1YlJvbGU7XG59XG4iXX0=