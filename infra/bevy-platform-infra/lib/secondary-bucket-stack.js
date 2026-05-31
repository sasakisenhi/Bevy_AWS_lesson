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
exports.SecondaryBucketStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cdk_nag_1 = require("cdk-nag");
// 定数オブジェクトを定義してマジックナンバーを排除
const STORAGE_CONFIG = {
    RETENTION_DAYS: 30,
    HISTORY_RETENTION_DAYS: 7,
    BUCKET_PREFIX: 'bevy-artifacts',
    LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
};
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
class SecondaryBucketStack extends cdk.Stack {
    bucketName;
    constructor(scope, id, props) {
        super(scope, id, props);
        // AwsSolutions-S1 対策:
        // セカンダリバケットのサーバーアクセスログ保存先として専用バケットを用意する。
        // ログバケット自体は「ログの受け皿」用途のため、ネストしたアクセスログは設定しない。
        const secondaryAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        // cdk-nagでセカンダリバケットのアクセスログバケットに対する警告を抑制（このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため）
        cdk_nag_1.NagSuppressions.addResourceSuppressions(secondaryAccessLogBucket, [
            {
                //  このバケットはセカンダリバケットのアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
                id: 'AwsSolutions-S1',
                // なお、このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため、AwsSolutions-S1 の警告を抑制する。
                reason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
            },
        ], true);
        // 環境名とアカウントIDを組み合わせて一意性を担保
        const secondaryBucket = new s3.Bucket(this, 'BevyArtifactBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            // AwsSolutions-S10 対策:
            // セカンダリバケットにも HTTPS(TLS) のみを許可するポリシーを強制する。
            // CDK がバケットポリシーに「aws:SecureTransport=false を Deny」するルールを自動生成する。
            // プライマリバケット（BevyArtifactBucket）と同一方針を適用する。
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            // AwsSolutions-S1 対策:
            // セカンダリ本体バケットのアクセスログを専用ログバケットへ出力する。
            serverAccessLogsBucket: secondaryAccessLogBucket,
            serverAccessLogsPrefix: 'access-logs/',
            lifecycleRules: [
                {
                    id: 'ExpireOldBuilds',
                    enabled: true,
                    expiration: cdk.Duration.days(STORAGE_CONFIG.RETENTION_DAYS),
                    noncurrentVersionExpiration: cdk.Duration.days(STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
                },
            ],
        });
        this.bucketName = secondaryBucket.bucketName;
        // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
        new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
            value: secondaryBucket.bucketName,
        });
    }
}
exports.SecondaryBucketStack = SecondaryBucketStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6QyxxQ0FBMEM7QUFFMUMsMkJBQTJCO0FBQzNCLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLHNCQUFzQixFQUFFLENBQUM7SUFDekIsYUFBYSxFQUFFLGdCQUFnQjtJQUMvQixpQkFBaUIsRUFBRSxxQkFBcUI7Q0FDaEMsQ0FBQztBQU9YLHVDQUF1QztBQUN2QyxNQUFhLG9CQUFxQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2pDLFVBQVUsQ0FBUztJQUVuQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHNCQUFzQjtRQUN0Qix5Q0FBeUM7UUFDekMsNENBQTRDO1FBQzVDLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxzQ0FBc0MsRUFBRTtZQUMzRixVQUFVLEVBQUUsR0FBRyxjQUFjLENBQUMsaUJBQWlCLElBQUksS0FBSyxDQUFDLE9BQU8sY0FBYyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzVGLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxVQUFVLEVBQUUsSUFBSTtZQUNoQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBQ0gsbUdBQW1HO1FBQ25HLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLHdCQUF3QixFQUN4QjtZQUNFO2dCQUNFLGlHQUFpRztnQkFDakcsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIseUZBQXlGO2dCQUN6RixNQUFNLEVBQUUsc0hBQXNIO2FBQy9IO1NBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixNQUFNLGVBQWUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQ3pFLFVBQVUsRUFBRSxHQUFHLGNBQWMsQ0FBQyxhQUFhLElBQUksS0FBSyxDQUFDLE9BQU8sY0FBYyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ3hGLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyx1QkFBdUI7WUFDdkIsMkNBQTJDO1lBQzNDLGdFQUFnRTtZQUNoRSwyQ0FBMkM7WUFDM0MsVUFBVSxFQUFFLElBQUk7WUFDaEIsU0FBUyxFQUFFLElBQUk7WUFDZixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsc0JBQXNCO1lBQ3RCLG9DQUFvQztZQUNwQyxzQkFBc0IsRUFBRSx3QkFBd0I7WUFDaEQsc0JBQXNCLEVBQUUsY0FBYztZQUN0QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUM7b0JBQzVELDJCQUEyQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQztpQkFDdEY7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLEdBQUcsZUFBZSxDQUFDLFVBQVUsQ0FBQztRQUU3QywwREFBMEQ7UUFDMUQsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNuRCxLQUFLLEVBQUUsZUFBZSxDQUFDLFVBQVU7U0FDbEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakVELG9EQWlFQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuLy8g5a6a5pWw44Kq44OW44K444Kn44Kv44OI44KS5a6a576p44GX44Gm44Oe44K444OD44Kv44OK44Oz44OQ44O844KS5o6S6ZmkXG5jb25zdCBTVE9SQUdFX0NPTkZJRyA9IHtcbiAgUkVURU5USU9OX0RBWVM6IDMwLFxuICBISVNUT1JZX1JFVEVOVElPTl9EQVlTOiA3LFxuICBCVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMnLFxuICBMT0dfQlVDS0VUX1BSRUZJWDogJ2JldnktYXJ0aWZhY3RzLWxvZ3MnLFxufSBhcyBjb25zdDtcblxuLy8g5a6a5pWw44Kq44OW44K444Kn44Kv44OI44KS5a6a576p44GX44Gm44Oe44K444OD44Kv44OK44Oz44OQ44O844KS5o6S6ZmkXG5pbnRlcmZhY2UgU2Vjb25kYXJ5QnVja2V0U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52TmFtZTogc3RyaW5nO1xufVxuXG4vLyDjgrvjgqvjg7Pjg4Djg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkOOBmeOCi+OCueOCv+ODg+OCr1xuZXhwb3J0IGNsYXNzIFNlY29uZGFyeUJ1Y2tldFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldE5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2Vjb25kYXJ5QnVja2V0U3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLVMxIOWvvuetljpcbiAgICAvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjga7jgrXjg7zjg5Djg7zjgqLjgq/jgrvjgrnjg63jgrDkv53lrZjlhYjjgajjgZfjgablsILnlKjjg5DjgrHjg4Pjg4jjgpLnlKjmhI/jgZnjgovjgIJcbiAgICAvLyDjg63jgrDjg5DjgrHjg4Pjg4joh6rkvZPjga/jgIzjg63jgrDjga7lj5fjgZHnmr/jgI3nlKjpgJTjga7jgZ/jgoHjgIHjg43jgrnjg4jjgZfjgZ/jgqLjgq/jgrvjgrnjg63jgrDjga/oqK3lrprjgZfjgarjgYTjgIJcbiAgICBjb25zdCBzZWNvbmRhcnlBY2Nlc3NMb2dCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCZXZ5QXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXRTZWNvbmRhcnknLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5MT0dfQlVDS0VUX1BSRUZJWH0tJHtwcm9wcy5lbnZOYW1lfS1zZWNvbmRhcnktJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuICAgIC8vIGNkay1uYWfjgafjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjga7jgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavlr77jgZnjgovorablkYrjgpLmipHliLbvvIjjgZPjga7jg5DjgrHjg4Pjg4jjga/jgqLjgq/jgrvjgrnjg63jgrDlsILnlKjjgafjgIHjgZXjgonjgavjgqLjgq/jgrvjgrnjg63jgrDjga7jg43jgrnjg4jjgpLpgb/jgZHjgovjgZ/jgoHjgavjgrXjg7zjg5Djg7zjgqLjgq/jgrvjgrnjg63jgrDjgpLnhKHlirnjgavjgZfjgabjgYTjgovjgZ/jgoHvvIlcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICBzZWNvbmRhcnlBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICAvLyAg44GT44Gu44OQ44Kx44OD44OI44Gv44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB44CBQXdzU29sdXRpb25zLVMxIOOBruitpuWRiuOCkuaKkeWItuOBmeOCi+OAglxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLVMxJyxcbiAgICAgICAgICAvLyDjgarjgYrjgIHjgZPjga7jg5DjgrHjg4Pjg4jjga/jgqLjgq/jgrvjgrnjg63jgrDlsILnlKjjgafjgIHjgZXjgonjgavjgqLjgq/jgrvjgrnjg63jgrDjga7jg43jgrnjg4jjgpLpgb/jgZHjgovjgZ/jgoHjgavjgrXjg7zjg5Djg7zjgqLjgq/jgrvjgrnjg63jgrDjgpLnhKHlirnjgavjgZfjgabjgYTjgovjgZ/jgoHjgIFBd3NTb2x1dGlvbnMtUzEg44Gu6K2m5ZGK44KS5oqR5Yi244GZ44KL44CCXG4gICAgICAgICAgcmVhc29uOiAnVGhpcyBidWNrZXQgc3RvcmVzIFMzIGFjY2VzcyBsb2dzIGZvciBCZXZ5QXJ0aWZhY3RCdWNrZXRTZWNvbmRhcnkgYW5kIGRvZXMgbm90IHJlcXVpcmUgbmVzdGVkIHNlcnZlciBhY2Nlc3MgbG9nZ2luZy4nLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIC8vIOeSsOWig+WQjeOBqOOCouOCq+OCpuODs+ODiElE44KS57WE44G/5ZCI44KP44Gb44Gm5LiA5oSP5oCn44KS5ouF5L+dXG4gICAgY29uc3Qgc2Vjb25kYXJ5QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QnVja2V0U2Vjb25kYXJ5Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuQlVDS0VUX1BSRUZJWH0tJHtwcm9wcy5lbnZOYW1lfS1zZWNvbmRhcnktJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEwIOWvvuetljpcbiAgICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBq+OCgiBIVFRQUyhUTFMpIOOBruOBv+OCkuioseWPr+OBmeOCi+ODneODquOCt+ODvOOCkuW8t+WItuOBmeOCi+OAglxuICAgICAgLy8gQ0RLIOOBjOODkOOCseODg+ODiOODneODquOCt+ODvOOBq+OAjGF3czpTZWN1cmVUcmFuc3BvcnQ9ZmFsc2Ug44KSIERlbnnjgI3jgZnjgovjg6vjg7zjg6vjgpLoh6rli5XnlJ/miJDjgZnjgovjgIJcbiAgICAgIC8vIOODl+ODqeOCpOODnuODquODkOOCseODg+ODiO+8iEJldnlBcnRpZmFjdEJ1Y2tldO+8ieOBqOWQjOS4gOaWuemHneOCkumBqeeUqOOBmeOCi+OAglxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIC8vIEF3c1NvbHV0aW9ucy1TMSDlr77nrZY6XG4gICAgICAvLyDjgrvjgqvjg7Pjg4Djg6rmnKzkvZPjg5DjgrHjg4Pjg4jjga7jgqLjgq/jgrvjgrnjg63jgrDjgpLlsILnlKjjg63jgrDjg5DjgrHjg4Pjg4jjgbjlh7rlipvjgZnjgovjgIJcbiAgICAgIHNlcnZlckFjY2Vzc0xvZ3NCdWNrZXQ6IHNlY29uZGFyeUFjY2Vzc0xvZ0J1Y2tldCxcbiAgICAgIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLlJFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIHRoaXMuYnVja2V0TmFtZSA9IHNlY29uZGFyeUJ1Y2tldC5idWNrZXROYW1lO1xuXG4gICAgLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu5ZCN5YmN44KSQ2xvdWRGb3JtYXRpb27lh7rlipvjgavov73liqDjgZfjgabjgIHjg5fjg6njgqTjg57jg6rjgrnjgr/jg4Pjgq/jgaflj4LnhafjgafjgY3jgovjgojjgYbjgavjgZnjgotcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU2Vjb25kYXJ5QnVja2V0TmFtZUV4cG9ydCcsIHtcbiAgICAgIHZhbHVlOiBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZSxcbiAgICB9KTtcbiAgfVxufVxuIl19