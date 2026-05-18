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
        const secondaryAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        cdk_nag_1.NagSuppressions.addResourceSuppressions(secondaryAccessLogBucket, [
            {
                id: 'AwsSolutions-S1',
                reason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
            },
        ], true);
        // 環境名とアカウントIDを組み合わせて一意性を担保
        const secondaryBucket = new s3.Bucket(this, 'BevyArtifactBucketSecondary', {
            bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${props.envName}-secondary-${this.account}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vjb25kYXJ5LWJ1Y2tldC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY29uZGFyeS1idWNrZXQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUV6QywyQkFBMkI7QUFDM0IsTUFBTSxjQUFjLEdBQUc7SUFDckIsY0FBYyxFQUFFLEVBQUU7SUFDbEIsc0JBQXNCLEVBQUUsQ0FBQztJQUN6QixhQUFhLEVBQUUsZ0JBQWdCO0NBQ3ZCLENBQUM7QUFPWCx1Q0FBdUM7QUFDdkMsTUFBYSxvQkFBcUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNqQyxVQUFVLENBQVM7SUFFbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QiwyQkFBMkI7UUFDM0IsTUFBTSxlQUFlLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtZQUN6RSxVQUFVLEVBQUUsR0FBRyxjQUFjLENBQUMsYUFBYSxJQUFJLEtBQUssQ0FBQyxPQUFPLGNBQWMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUN4RixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsU0FBUyxFQUFFLElBQUk7WUFDZixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxpQkFBaUI7b0JBQ3JCLE9BQU8sRUFBRSxJQUFJO29CQUNiLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDO29CQUM1RCwyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUM7aUJBQ3RGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUM7UUFFN0MsMERBQTBEO1FBQzFELElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDbkQsS0FBSyxFQUFFLGVBQWUsQ0FBQyxVQUFVO1NBQ2xDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9CRCxvREErQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuXHJcbi8vIOWumuaVsOOCquODluOCuOOCp+OCr+ODiOOCkuWumue+qeOBl+OBpuODnuOCuOODg+OCr+ODiuODs+ODkOODvOOCkuaOkumZpFxyXG5jb25zdCBTVE9SQUdFX0NPTkZJRyA9IHtcclxuICBSRVRFTlRJT05fREFZUzogMzAsXHJcbiAgSElTVE9SWV9SRVRFTlRJT05fREFZUzogNyxcclxuICBCVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMnLFxyXG59IGFzIGNvbnN0O1xyXG5cclxuLy8g5a6a5pWw44Kq44OW44K444Kn44Kv44OI44KS5a6a576p44GX44Gm44Oe44K444OD44Kv44OK44Oz44OQ44O844KS5o6S6ZmkXHJcbmludGVyZmFjZSBTZWNvbmRhcnlCdWNrZXRTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGVudk5hbWU6IHN0cmluZztcclxufVxyXG5cclxuLy8g44K744Kr44Oz44OA44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq9cclxuZXhwb3J0IGNsYXNzIFNlY29uZGFyeUJ1Y2tldFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2Vjb25kYXJ5QnVja2V0U3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8g55Kw5aKD5ZCN44Go44Ki44Kr44Km44Oz44OISUTjgpLntYTjgb/lkIjjgo/jgZvjgabkuIDmhI/mgKfjgpLmi4Xkv51cclxuICAgIGNvbnN0IHNlY29uZGFyeUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldFNlY29uZGFyeScsIHtcclxuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuQlVDS0VUX1BSRUZJWH0tJHtwcm9wcy5lbnZOYW1lfS1zZWNvbmRhcnktJHt0aGlzLmFjY291bnR9YCxcclxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxyXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxyXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcclxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXHJcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmJ1Y2tldE5hbWUgPSBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZTtcclxuXHJcbiAgICAvLyDjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjga7lkI3liY3jgpJDbG91ZEZvcm1hdGlvbuWHuuWKm+OBq+i/veWKoOOBl+OBpuOAgeODl+ODqeOCpOODnuODquOCueOCv+ODg+OCr+OBp+WPgueFp+OBp+OBjeOCi+OCiOOBhuOBq+OBmeOCi1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY29uZGFyeUJ1Y2tldE5hbWVFeHBvcnQnLCB7XHJcbiAgICAgIHZhbHVlOiBzZWNvbmRhcnlCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=