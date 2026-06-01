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
const config_1 = require("./config");
const validators_1 = require("./validators");
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
class SecondaryBucketStack extends cdk.Stack {
    bucketName;
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に設定されているかを検証
        (0, validators_1.validateExplicitStackAccount)(props.env);
        super(scope, id, props);
        // AwsSolutions-S1 対策:
        // セカンダリバケットのサーバーアクセスログ保存先として専用バケットを用意する。
        // ログバケット自体は「ログの受け皿」用途のため、ネストしたアクセスログは設定しない。
        const secondaryAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucketSecondary', {
            bucketName: `${config_1.STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
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
            bucketName: `${config_1.STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
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
                    expiration: cdk.Duration.days(config_1.STORAGE_CONFIG.RETENTION_DAYS),
                    noncurrentVersionExpiration: cdk.Duration.days(config_1.STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
                },
            ],
        });
        this.bucketName = secondaryBucket.bucketName;
        // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
        new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
            value: secondaryBucket.bucketName,
        });
        this.node.addValidation({
            // スタック全体のバリデーションルールを定義
            validate: () => {
                const errors = [];
                // 環境名のバリデーション
                if (!config_1.ENV_NAME_REGEX.test(props.envName)) {
                    errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
                }
                return errors;
            },
        });
    }
}
exports.SecondaryBucketStack = SecondaryBucketStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6QyxxQ0FBMEM7QUFDMUMscUNBQTBEO0FBQzFELDZDQUE0RDtBQU81RCx1Q0FBdUM7QUFDdkMsTUFBYSxvQkFBcUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNqQyxVQUFVLENBQVM7SUFFbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSw2QkFBNkI7UUFDN0IsSUFBQSx5Q0FBNEIsRUFBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFeEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsc0JBQXNCO1FBQ3RCLHlDQUF5QztRQUN6Qyw0Q0FBNEM7UUFDNUMsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHNDQUFzQyxFQUFFO1lBQzNGLFVBQVUsRUFBRSxHQUFHLHVCQUFjLENBQUMsaUJBQWlCLElBQUksS0FBSyxDQUFDLE9BQU8sY0FBYyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzVGLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxVQUFVLEVBQUUsSUFBSTtZQUNoQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBQ0gsbUdBQW1HO1FBQ25HLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLHdCQUF3QixFQUN4QjtZQUNFO2dCQUNFLGlHQUFpRztnQkFDakcsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIseUZBQXlGO2dCQUN6RixNQUFNLEVBQUUsc0hBQXNIO2FBQy9IO1NBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixNQUFNLGVBQWUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQ3pFLFVBQVUsRUFBRSxHQUFHLHVCQUFjLENBQUMsYUFBYSxJQUFJLEtBQUssQ0FBQyxPQUFPLGNBQWMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUN4RixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsdUJBQXVCO1lBQ3ZCLDJDQUEyQztZQUMzQyxnRUFBZ0U7WUFDaEUsMkNBQTJDO1lBQzNDLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxJQUFJO1lBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLHNCQUFzQjtZQUN0QixvQ0FBb0M7WUFDcEMsc0JBQXNCLEVBQUUsd0JBQXdCO1lBQ2hELHNCQUFzQixFQUFFLGNBQWM7WUFDdEMsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxpQkFBaUI7b0JBQ3JCLE9BQU8sRUFBRSxJQUFJO29CQUNiLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyx1QkFBYyxDQUFDLGNBQWMsQ0FBQztvQkFDNUQsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsdUJBQWMsQ0FBQyxzQkFBc0IsQ0FBQztpQkFDdEY7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLEdBQUcsZUFBZSxDQUFDLFVBQVUsQ0FBQztRQUU3QywwREFBMEQ7UUFDMUQsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNuRCxLQUFLLEVBQUUsZUFBZSxDQUFDLFVBQVU7U0FDbEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDdEIsdUJBQXVCO1lBQ3ZCLFFBQVEsRUFBRSxHQUFhLEVBQUU7Z0JBQ3ZCLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztnQkFDNUIsY0FBYztnQkFDZCxJQUFJLENBQUMsdUJBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztnQkFDaEcsQ0FBQztnQkFFRCxPQUFPLE1BQU0sQ0FBQztZQUNoQixDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakZELG9EQWlGQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcbmltcG9ydCB7IEVOVl9OQU1FX1JFR0VYLCBTVE9SQUdFX0NPTkZJRyB9IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7IHZhbGlkYXRlRXhwbGljaXRTdGFja0FjY291bnQgfSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuXG4vLyDlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgpLlrprnvqnjgZfjgabjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjgpLmjpLpmaRcbmludGVyZmFjZSBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZOYW1lOiBzdHJpbmc7XG59XG5cbi8vIOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5leHBvcnQgY2xhc3MgU2Vjb25kYXJ5QnVja2V0U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzKSB7XG4gICAgLy8gQVdT44Ki44Kr44Km44Oz44OISUTjgYzmmI7npLrnmoTjgavoqK3lrprjgZXjgozjgabjgYTjgovjgYvjgpLmpJzoqLxcbiAgICB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50KHByb3BzLmVudik7XG5cbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1TMSDlr77nrZY6XG4gICAgLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw5L+d5a2Y5YWI44Go44GX44Gm5bCC55So44OQ44Kx44OD44OI44KS55So5oSP44GZ44KL44CCXG4gICAgLy8g44Ot44Kw44OQ44Kx44OD44OI6Ieq5L2T44Gv44CM44Ot44Kw44Gu5Y+X44GR55q/44CN55So6YCU44Gu44Gf44KB44CB44ON44K544OI44GX44Gf44Ki44Kv44K744K544Ot44Kw44Gv6Kit5a6a44GX44Gq44GE44CCXG4gICAgY29uc3Qgc2Vjb25kYXJ5QWNjZXNzTG9nQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QWNjZXNzTG9nQnVja2V0U2Vjb25kYXJ5Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuTE9HX0JVQ0tFVF9QUkVGSVh9LSR7cHJvcHMuZW52TmFtZX0tc2Vjb25kYXJ5LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcbiAgICAvLyBjZGstbmFn44Gn44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Gu44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr5a++44GZ44KL6K2m5ZGK44KS5oqR5Yi277yI44GT44Gu44OQ44Kx44OD44OI44Gv44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB77yJXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgc2Vjb25kYXJ5QWNjZXNzTG9nQnVja2V0LFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgLy8gIOOBk+OBruODkOOCseODg+ODiOOBr+OCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruOCouOCr+OCu+OCueODreOCsOWwgueUqOOBp+OAgeOBleOCieOBq+OCouOCr+OCu+OCueODreOCsOOBruODjeOCueODiOOCkumBv+OBkeOCi+OBn+OCgeOBq+OCteODvOODkOODvOOCouOCr+OCu+OCueODreOCsOOCkueEoeWKueOBq+OBl+OBpuOBhOOCi+OBn+OCgeOAgUF3c1NvbHV0aW9ucy1TMSDjga7orablkYrjgpLmipHliLbjgZnjgovjgIJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1TMScsXG4gICAgICAgICAgLy8g44Gq44GK44CB44GT44Gu44OQ44Kx44OD44OI44Gv44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB44CBQXdzU29sdXRpb25zLVMxIOOBruitpuWRiuOCkuaKkeWItuOBmeOCi+OAglxuICAgICAgICAgIHJlYXNvbjogJ1RoaXMgYnVja2V0IHN0b3JlcyBTMyBhY2Nlc3MgbG9ncyBmb3IgQmV2eUFydGlmYWN0QnVja2V0U2Vjb25kYXJ5IGFuZCBkb2VzIG5vdCByZXF1aXJlIG5lc3RlZCBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcuJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICAvLyDnkrDlooPlkI3jgajjgqLjgqvjgqbjg7Pjg4hJROOCkue1hOOBv+WQiOOCj+OBm+OBpuS4gOaEj+aAp+OCkuaLheS/nVxuICAgIGNvbnN0IHNlY29uZGFyeUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldFNlY29uZGFyeScsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7cHJvcHMuZW52TmFtZX0tc2Vjb25kYXJ5LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgLy8gQXdzU29sdXRpb25zLVMxMCDlr77nrZY6XG4gICAgICAvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjgavjgoIgSFRUUFMoVExTKSDjga7jgb/jgpLoqLHlj6/jgZnjgovjg53jg6rjgrfjg7zjgpLlvLfliLbjgZnjgovjgIJcbiAgICAgIC8vIENESyDjgYzjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgavjgIxhd3M6U2VjdXJlVHJhbnNwb3J0PWZhbHNlIOOCkiBEZW5544CN44GZ44KL44Or44O844Or44KS6Ieq5YuV55Sf5oiQ44GZ44KL44CCXG4gICAgICAvLyDjg5fjg6njgqTjg57jg6rjg5DjgrHjg4Pjg4jvvIhCZXZ5QXJ0aWZhY3RCdWNrZXTvvInjgajlkIzkuIDmlrnph53jgpLpgannlKjjgZnjgovjgIJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEg5a++562WOlxuICAgICAgLy8g44K744Kr44Oz44OA44Oq5pys5L2T44OQ44Kx44OD44OI44Gu44Ki44Kv44K744K544Ot44Kw44KS5bCC55So44Ot44Kw44OQ44Kx44OD44OI44G45Ye65Yqb44GZ44KL44CCXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiBzZWNvbmRhcnlBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0V4cGlyZU9sZEJ1aWxkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5ISVNUT1JZX1JFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmJ1Y2tldE5hbWUgPSBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZTtcblxuICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruWQjeWJjeOCkkNsb3VkRm9ybWF0aW9u5Ye65Yqb44Gr6L+95Yqg44GX44Gm44CB44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gn5Y+C54Wn44Gn44GN44KL44KI44GG44Gr44GZ44KLXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY29uZGFyeUJ1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogc2Vjb25kYXJ5QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG5cbiAgICB0aGlzLm5vZGUuYWRkVmFsaWRhdGlvbih7XG4gICAgICAvLyDjgrnjgr/jg4Pjgq/lhajkvZPjga7jg5Djg6rjg4fjg7zjgrfjg6fjg7Pjg6vjg7zjg6vjgpLlrprnvqlcbiAgICAgIHZhbGlkYXRlOiAoKTogc3RyaW5nW10gPT4ge1xuICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIC8vIOeSsOWig+WQjeOBruODkOODquODh+ODvOOCt+ODp+ODs1xuICAgICAgICBpZiAoIUVOVl9OQU1FX1JFR0VYLnRlc3QocHJvcHMuZW52TmFtZSkpIHtcbiAgICAgICAgICBlcnJvcnMucHVzaCgnZW52TmFtZSBtdXN0IGJlIG9uZSBvZiBkZXYsIHRlc3QsIHN0ZywgcHJvZCBmb3IgbmFtaW5nIGFuZCBwb2xpY3kgY29uc2lzdGVuY3kuJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JzO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufVxuIl19