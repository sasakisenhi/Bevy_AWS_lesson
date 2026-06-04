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
exports.setupCrossRegionReplication = setupCrossRegionReplication;
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cdk_nag_1 = require("cdk-nag");
// クロスリージョンレプリケーションをセットアップする関数を定義。これには、S3がセカンダリリージョンのバケットにオブジェクトをレプリケートするためのIAMロールの作成と、プライマリバケットのCloudFormationリソースへのレプリケーション構成の追加が含まれる。
function setupCrossRegionReplication({ scope, artifactBucket, secondaryBucketArn, }) {
    const replicationRole = new iam.Role(scope, 'S3ReplicationRole', {
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
        description: 'Role used by S3 to replicate objects to the secondary region bucket',
    });
    // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetReplicationConfiguration',
            's3:ListBucket',
        ],
        resources: [artifactBucket.bucketArn],
    }));
    // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetObjectVersionForReplication',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionTagging',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
    }));
    // レプリケーションロールに必要なアクセス許可を付与する。これには、レプリケーション元バケットのレプリケーション構成の取得とリスト、およびオブジェクトのバージョン管理とACLの取得が含まれる。また、レプリケーション先バケットへのオブジェクトのレプリケート、削除、およびタグのレプリケートも許可する。
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:ReplicateObject',
            's3:ReplicateDelete',
            's3:ReplicateTags',
        ],
        resources: [`${secondaryBucketArn}/*`],
    }));
    // CDK Nagの警告を抑制。理由は、クロスリージョンレプリケーションはすべてのオブジェクトに対して構成されており、これにはソースと宛先バケットARNのオブジェクトレベルのワイルドカードリソースが必要になるため。
    cdk_nag_1.NagSuppressions.addResourceSuppressions(replicationRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'Cross-region replication is configured for all objects, which requires object-level wildcard resources in source and destination bucket ARNs.',
            appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
        },
    ], true);
    // プライマリバケットのCloudFormationリソースにレプリケーション構成を追加する。これには、レプリケーションルールの定義が含まれる。ルールは、すべてのオブジェクトをセカンダリバケットにレプリケートするように構成されており、削除マーカーのレプリケーションも有効になっている。
    const cfnBucket = artifactBucket.node.defaultChild;
    cfnBucket.replicationConfiguration = {
        role: replicationRole.roleArn,
        rules: [
            {
                id: 'CrossRegionReplicationRule',
                status: 'Enabled',
                priority: 1,
                filter: {
                    prefix: '',
                },
                deleteMarkerReplication: {
                    status: 'Enabled',
                },
                destination: {
                    bucket: secondaryBucketArn,
                },
            },
        ],
    };
    // レプリケーションロールがCloudFormationリソースに依存するようにして、CDKが正しい順序でリソースを作成するようにする。
    cfnBucket.addDependency(replicationRole.node.defaultChild);
    return {
        replicationRole,
        cfnBucket,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtcmVwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzMy1yZXBsaWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW9CQSxrRUFzRkM7QUF6R0QseURBQTJDO0FBRTNDLHFDQUEwQztBQWdCMUMsd0lBQXdJO0FBQ3hJLFNBQWdCLDJCQUEyQixDQUFDLEVBQzFDLEtBQUssRUFDTCxjQUFjLEVBQ2Qsa0JBQWtCLEdBQ0k7SUFDdEIsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRTtRQUMvRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUM7UUFDdkQsV0FBVyxFQUFFLHFFQUFxRTtLQUNuRixDQUFDLENBQUM7SUFFSCxzSkFBc0o7SUFDdEosZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGdDQUFnQztZQUNoQyxlQUFlO1NBQ2hCO1FBQ0QsU0FBUyxFQUFFLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztLQUN0QyxDQUFDLENBQ0gsQ0FBQztJQUVGLHNKQUFzSjtJQUN0SixlQUFlLENBQUMsV0FBVyxDQUN6QixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7UUFDdEIsT0FBTyxFQUFFO1lBQ1AsbUNBQW1DO1lBQ25DLHdCQUF3QjtZQUN4Qiw0QkFBNEI7U0FDN0I7UUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxTQUFTLElBQUksQ0FBQztLQUM3QyxDQUFDLENBQ0gsQ0FBQztJQUVGLHNKQUFzSjtJQUN0SixlQUFlLENBQUMsV0FBVyxDQUN6QixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7UUFDdEIsT0FBTyxFQUFFO1lBQ1Asb0JBQW9CO1lBQ3BCLG9CQUFvQjtZQUNwQixrQkFBa0I7U0FDbkI7UUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLGtCQUFrQixJQUFJLENBQUM7S0FDdkMsQ0FBQyxDQUNILENBQUM7SUFFRiw0R0FBNEc7SUFDNUcseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsZUFBZSxFQUNmO1FBQ0U7WUFDRSxFQUFFLEVBQUUsbUJBQW1CO1lBQ3ZCLE1BQU0sRUFBRSwrSUFBK0k7WUFDdkosU0FBUyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztTQUNqRDtLQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7SUFFRiwrSUFBK0k7SUFDL0ksTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxZQUE0QixDQUFDO0lBQ25FLFNBQVMsQ0FBQyx3QkFBd0IsR0FBRztRQUNuQyxJQUFJLEVBQUUsZUFBZSxDQUFDLE9BQU87UUFDN0IsS0FBSyxFQUFFO1lBQ0w7Z0JBQ0UsRUFBRSxFQUFFLDRCQUE0QjtnQkFDaEMsTUFBTSxFQUFFLFNBQVM7Z0JBQ2pCLFFBQVEsRUFBRSxDQUFDO2dCQUNYLE1BQU0sRUFBRTtvQkFDTixNQUFNLEVBQUUsRUFBRTtpQkFDWDtnQkFDRCx1QkFBdUIsRUFBRTtvQkFDdkIsTUFBTSxFQUFFLFNBQVM7aUJBQ2xCO2dCQUNELFdBQVcsRUFBRTtvQkFDWCxNQUFNLEVBQUUsa0JBQWtCO2lCQUMzQjthQUNGO1NBQ0Y7S0FDRixDQUFDO0lBQ0YscUVBQXFFO0lBQ3JFLFNBQVMsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxZQUEyQixDQUFDLENBQUM7SUFFMUUsT0FBTztRQUNMLGVBQWU7UUFDZixTQUFTO0tBQ1YsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuLy8g44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gu44K744OD44OI44Ki44OD44OX44Gr6Zai44GZ44KL6Zai5pWw44Go44Kk44Oz44K/44O844OV44Kn44O844K544KS5a6a576pXG5leHBvcnQgaW50ZXJmYWNlIFJlcGxpY2F0aW9uU2V0dXAge1xuICByZXBsaWNhdGlvblJvbGU6IGlhbS5Sb2xlO1xuICBjZm5CdWNrZXQ6IHMzLkNmbkJ1Y2tldDtcbn1cblxuXG4vLyDjgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PjgpLjgrvjg4Pjg4jjgqLjg4Pjg5fjgZnjgovplqLmlbDjgpLlrprnvqnjgILjgZPjgozjgavjga/jgIFTM+OBjOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OBruODkOOCseODg+ODiOOBq+OCquODluOCuOOCp+OCr+ODiOOCkuODrOODl+ODquOCseODvOODiOOBmeOCi+OBn+OCgeOBrklBTeODreODvOODq+OBruS9nOaIkOOBqOOAgeODl+ODqeOCpOODnuODquODkOOCseODg+ODiOOBrkNsb3VkRm9ybWF0aW9u44Oq44K944O844K544G444Gu44Os44OX44Oq44Kx44O844K344On44Oz5qeL5oiQ44Gu6L+95Yqg44GM5ZCr44G+44KM44KL44CCXG5leHBvcnQgaW50ZXJmYWNlIFJlcGxpY2F0aW9uU2V0dXBQcm9wcyB7XG4gIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5CdWNrZXQ7XG4gIHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nO1xufVxuXG4vLyDjgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PjgpLjgrvjg4Pjg4jjgqLjg4Pjg5fjgZnjgovplqLmlbDjgpLlrprnvqnjgILjgZPjgozjgavjga/jgIFTM+OBjOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OBruODkOOCseODg+ODiOOBq+OCquODluOCuOOCp+OCr+ODiOOCkuODrOODl+ODquOCseODvOODiOOBmeOCi+OBn+OCgeOBrklBTeODreODvOODq+OBruS9nOaIkOOBqOOAgeODl+ODqeOCpOODnuODquODkOOCseODg+ODiOOBrkNsb3VkRm9ybWF0aW9u44Oq44K944O844K544G444Gu44Os44OX44Oq44Kx44O844K344On44Oz5qeL5oiQ44Gu6L+95Yqg44GM5ZCr44G+44KM44KL44CCXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBDcm9zc1JlZ2lvblJlcGxpY2F0aW9uKHtcbiAgc2NvcGUsXG4gIGFydGlmYWN0QnVja2V0LFxuICBzZWNvbmRhcnlCdWNrZXRBcm4sXG59OiBSZXBsaWNhdGlvblNldHVwUHJvcHMpOiBSZXBsaWNhdGlvblNldHVwIHtcbiAgY29uc3QgcmVwbGljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHNjb3BlLCAnUzNSZXBsaWNhdGlvblJvbGUnLCB7XG4gICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3MzLmFtYXpvbmF3cy5jb20nKSxcbiAgICBkZXNjcmlwdGlvbjogJ1JvbGUgdXNlZCBieSBTMyB0byByZXBsaWNhdGUgb2JqZWN0cyB0byB0aGUgc2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQnLFxuICB9KTtcblxuICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjg63jg7zjg6vjgavlv4XopoHjgarjgqLjgq/jgrvjgrnoqLHlj6/jgpLku5jkuI7jgZnjgovjgILjgZPjgozjgavjga/jgIHjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PlhYPjg5DjgrHjg4Pjg4jjga7jg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pmp4vmiJDjga7lj5blvpfjgajjg6rjgrnjg4jjgIHjgYrjgojjgbPjgqrjg5bjgrjjgqfjgq/jg4jjga7jg5Djg7zjgrjjg6fjg7PnrqHnkIbjgahBQ0zjga7lj5blvpfjgYzlkKvjgb7jgozjgovjgILjgb7jgZ/jgIHjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PlhYjjg5DjgrHjg4Pjg4jjgbjjga7jgqrjg5bjgrjjgqfjgq/jg4jjga7jg6zjg5fjg6rjgrHjg7zjg4jjgIHliYrpmaTjgIHjgYrjgojjgbPjgr/jgrDjga7jg6zjg5fjg6rjgrHjg7zjg4jjgoLoqLHlj6/jgZnjgovjgIJcbiAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbicsXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+ODreODvOODq+OBq+W/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeODrOODl+ODquOCseODvOOCt+ODp+ODs+WFg+ODkOOCseODg+ODiOOBruODrOODl+ODquOCseODvOOCt+ODp+ODs+ani+aIkOOBruWPluW+l+OBqOODquOCueODiOOAgeOBiuOCiOOBs+OCquODluOCuOOCp+OCr+ODiOOBruODkOODvOOCuOODp+ODs+euoeeQhuOBqEFDTOOBruWPluW+l+OBjOWQq+OBvuOCjOOCi+OAguOBvuOBn+OAgeODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOODkOOCseODg+ODiOOBuOOBruOCquODluOCuOOCp+OCr+ODiOOBruODrOODl+ODquOCseODvOODiOOAgeWJiumZpOOAgeOBiuOCiOOBs+OCv+OCsOOBruODrOODl+ODquOCseODvOODiOOCguioseWPr+OBmeOCi+OAglxuICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkZvclJlcGxpY2F0aW9uJyxcbiAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25BY2wnLFxuICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvblRhZ2dpbmcnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pLFxuICApO1xuXG4gIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+ODreODvOODq+OBq+W/heimgeOBquOCouOCr+OCu+OCueioseWPr+OCkuS7mOS4juOBmeOCi+OAguOBk+OCjOOBq+OBr+OAgeODrOODl+ODquOCseODvOOCt+ODp+ODs+WFg+ODkOOCseODg+ODiOOBruODrOODl+ODquOCseODvOOCt+ODp+ODs+ani+aIkOOBruWPluW+l+OBqOODquOCueODiOOAgeOBiuOCiOOBs+OCquODluOCuOOCp+OCr+ODiOOBruODkOODvOOCuOODp+ODs+euoeeQhuOBqEFDTOOBruWPluW+l+OBjOWQq+OBvuOCjOOCi+OAguOBvuOBn+OAgeODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOODkOOCseODg+ODiOOBuOOBruOCquODluOCuOOCp+OCr+ODiOOBruODrOODl+ODquOCseODvOODiOOAgeWJiumZpOOAgeOBiuOCiOOBs+OCv+OCsOOBruODrOODl+ODquOCseODvOODiOOCguioseWPr+OBmeOCi+OAglxuICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6UmVwbGljYXRlT2JqZWN0JyxcbiAgICAgICAgJ3MzOlJlcGxpY2F0ZURlbGV0ZScsXG4gICAgICAgICdzMzpSZXBsaWNhdGVUYWdzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzZWNvbmRhcnlCdWNrZXRBcm59LypgXSxcbiAgICB9KSxcbiAgKTtcblxuICAvLyBDREsgTmFn44Gu6K2m5ZGK44KS5oqR5Yi244CC55CG55Sx44Gv44CB44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gv44GZ44G544Gm44Gu44Kq44OW44K444Kn44Kv44OI44Gr5a++44GX44Gm5qeL5oiQ44GV44KM44Gm44GK44KK44CB44GT44KM44Gr44Gv44K944O844K544Go5a6b5YWI44OQ44Kx44OD44OIQVJO44Gu44Kq44OW44K444Kn44Kv44OI44Os44OZ44Or44Gu44Ov44Kk44Or44OJ44Kr44O844OJ44Oq44K944O844K544GM5b+F6KaB44Gr44Gq44KL44Gf44KB44CCXG4gIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICByZXBsaWNhdGlvblJvbGUsXG4gICAgW1xuICAgICAge1xuICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgcmVhc29uOiAnQ3Jvc3MtcmVnaW9uIHJlcGxpY2F0aW9uIGlzIGNvbmZpZ3VyZWQgZm9yIGFsbCBvYmplY3RzLCB3aGljaCByZXF1aXJlcyBvYmplY3QtbGV2ZWwgd2lsZGNhcmQgcmVzb3VyY2VzIGluIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gYnVja2V0IEFSTnMuJyxcbiAgICAgICAgYXBwbGllc1RvOiBbeyByZWdleDogJy9eUmVzb3VyY2U6Oi4qXFxcXC9cXFxcKiQvJyB9XSxcbiAgICAgIH0sXG4gICAgXSxcbiAgICB0cnVlLFxuICApO1xuXG4gIC8vIOODl+ODqeOCpOODnuODquODkOOCseODg+ODiOOBrkNsb3VkRm9ybWF0aW9u44Oq44K944O844K544Gr44Os44OX44Oq44Kx44O844K344On44Oz5qeL5oiQ44KS6L+95Yqg44GZ44KL44CC44GT44KM44Gr44Gv44CB44Os44OX44Oq44Kx44O844K344On44Oz44Or44O844Or44Gu5a6a576p44GM5ZCr44G+44KM44KL44CC44Or44O844Or44Gv44CB44GZ44G544Gm44Gu44Kq44OW44K444Kn44Kv44OI44KS44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gr44Os44OX44Oq44Kx44O844OI44GZ44KL44KI44GG44Gr5qeL5oiQ44GV44KM44Gm44GK44KK44CB5YmK6Zmk44Oe44O844Kr44O844Gu44Os44OX44Oq44Kx44O844K344On44Oz44KC5pyJ5Yq544Gr44Gq44Gj44Gm44GE44KL44CCXG4gIGNvbnN0IGNmbkJ1Y2tldCA9IGFydGlmYWN0QnVja2V0Lm5vZGUuZGVmYXVsdENoaWxkIGFzIHMzLkNmbkJ1Y2tldDtcbiAgY2ZuQnVja2V0LnJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IHtcbiAgICByb2xlOiByZXBsaWNhdGlvblJvbGUucm9sZUFybixcbiAgICBydWxlczogW1xuICAgICAge1xuICAgICAgICBpZDogJ0Nyb3NzUmVnaW9uUmVwbGljYXRpb25SdWxlJyxcbiAgICAgICAgc3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICBmaWx0ZXI6IHtcbiAgICAgICAgICBwcmVmaXg6ICcnLFxuICAgICAgICB9LFxuICAgICAgICBkZWxldGVNYXJrZXJSZXBsaWNhdGlvbjoge1xuICAgICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICB9LFxuICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgIGJ1Y2tldDogc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICBdLFxuICB9O1xuICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjg63jg7zjg6vjgYxDbG91ZEZvcm1hdGlvbuODquOCveODvOOCueOBq+S+neWtmOOBmeOCi+OCiOOBhuOBq+OBl+OBpuOAgUNES+OBjOato+OBl+OBhOmghuW6j+OBp+ODquOCveODvOOCueOCkuS9nOaIkOOBmeOCi+OCiOOBhuOBq+OBmeOCi+OAglxuICBjZm5CdWNrZXQuYWRkRGVwZW5kZW5jeShyZXBsaWNhdGlvblJvbGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgaWFtLkNmblJvbGUpO1xuXG4gIHJldHVybiB7XG4gICAgcmVwbGljYXRpb25Sb2xlLFxuICAgIGNmbkJ1Y2tldCxcbiAgfTtcbn1cbiJdfQ==