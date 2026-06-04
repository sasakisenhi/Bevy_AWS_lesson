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
exports.createAccessLogBucket = createAccessLogBucket;
exports.createArtifactBucket = createArtifactBucket;
exports.createPrimaryArtifactBuckets = createPrimaryArtifactBuckets;
exports.createSecondaryArtifactBuckets = createSecondaryArtifactBuckets;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cdk_nag_1 = require("cdk-nag");
const config_1 = require("./config");
// バケット名を構築する関数を定義。セカンダリバケットの場合は、名前に "secondary" を含める。
function buildBucketName(prefix, envName, account, isSecondary = false) {
    return isSecondary
        ? `${prefix}-${envName}-secondary-${account}`
        : `${prefix}-${envName}-${account}`;
}
// S3バケットのライフサイクルルールを構築する関数を定義。古いバージョンのオブジェクトを自動的に削除するルールを含む。
function buildLifecycleRules() {
    return [
        {
            id: 'ExpireOldBuilds',
            enabled: true,
            expiration: cdk.Duration.days(config_1.STORAGE_CONFIG.RETENTION_DAYS),
            noncurrentVersionExpiration: cdk.Duration.days(config_1.STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
        },
    ];
}
// アクセスログ用のS3バケットを作成する関数を定義。セキュリティ要件に基づいて、パブリックアクセスをブロックし、暗号化を有効にする。
function createAccessLogBucket({ scope, account, envName, bucketId, suppressionReason, isSecondary = false, }) {
    const accessLogBucket = new s3.Bucket(scope, bucketId, {
        bucketName: buildBucketName(config_1.STORAGE_CONFIG.LOG_BUCKET_PREFIX, envName, account, isSecondary),
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
    });
    // cdk-nagの警告を抑制（アクセスログバケットは、アーティファクトバケットのサーバーアクセスログ用であり、ネストされたサーバーアクセスログは必要ないため）
    cdk_nag_1.NagSuppressions.addResourceSuppressions(accessLogBucket, [
        {
            id: 'AwsSolutions-S1',
            reason: suppressionReason,
        },
    ], true);
    return accessLogBucket;
}
// アーティファクト用のS3バケットを作成する関数を定義。アクセスログバケットをサーバーアクセスログの宛先として設定し、ライフサイクルルールを適用する。
function createArtifactBucket({ scope, account, envName, accessLogBucket, bucketId, isSecondary = false, }) {
    return new s3.Bucket(scope, bucketId, {
        bucketName: buildBucketName(config_1.STORAGE_CONFIG.BUCKET_PREFIX, envName, account, isSecondary),
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        serverAccessLogsBucket: accessLogBucket,
        serverAccessLogsPrefix: 'access-logs/',
        lifecycleRules: buildLifecycleRules(),
    });
}
// プライマリリージョンにアーティファクト用のS3バケットとアクセスログ用のS3バケットを作成する関数を定義
function createPrimaryArtifactBuckets(scope, envName, account) {
    const accessLogBucket = createAccessLogBucket({
        scope,
        account,
        envName,
        bucketId: 'BevyArtifactAccessLogBucket',
        suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucket and does not require nested server access logging.',
    });
    // プライマリバケットの名前には "secondary" を含めないことで、セカンダリバケットと区別する
    const artifactBucket = createArtifactBucket({
        scope,
        account,
        envName,
        accessLogBucket,
        bucketId: 'BevyArtifactBucket',
    });
    return {
        accessLogBucket,
        artifactBucket,
    };
}
// セカンダリリージョンにアーティファクト用のS3バケットとアクセスログ用のS3バケットを作成する関数を定義
function createSecondaryArtifactBuckets(scope, envName, account) {
    const accessLogBucket = createAccessLogBucket({
        scope,
        account,
        envName,
        bucketId: 'BevyArtifactAccessLogBucketSecondary',
        suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
        isSecondary: true,
    });
    // セカンダリバケットの名前には "secondary" を含めることで、プライマリバケットと区別する
    const artifactBucket = createArtifactBucket({
        scope,
        account,
        envName,
        accessLogBucket,
        bucketId: 'BevyArtifactBucketSecondary',
        isSecondary: true,
    });
    return {
        accessLogBucket,
        artifactBucket,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtYnVja2V0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInMzLWJ1Y2tldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFzREEsc0RBNkJDO0FBRUQsb0RBb0JDO0FBR0Qsb0VBcUJDO0FBR0Qsd0VBdUJDO0FBM0pELGlEQUFtQztBQUNuQyx1REFBeUM7QUFFekMscUNBQTBDO0FBRTFDLHFDQUEwQztBQTZCMUMsc0RBQXNEO0FBQ3RELFNBQVMsZUFBZSxDQUFDLE1BQWMsRUFBRSxPQUFlLEVBQUUsT0FBZSxFQUFFLFdBQVcsR0FBRyxLQUFLO0lBQzVGLE9BQU8sV0FBVztRQUNoQixDQUFDLENBQUMsR0FBRyxNQUFNLElBQUksT0FBTyxjQUFjLE9BQU8sRUFBRTtRQUM3QyxDQUFDLENBQUMsR0FBRyxNQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBQ3hDLENBQUM7QUFFRCw2REFBNkQ7QUFDN0QsU0FBUyxtQkFBbUI7SUFDMUIsT0FBTztRQUNMO1lBQ0UsRUFBRSxFQUFFLGlCQUFpQjtZQUNyQixPQUFPLEVBQUUsSUFBSTtZQUNiLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyx1QkFBYyxDQUFDLGNBQWMsQ0FBQztZQUM1RCwyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyx1QkFBYyxDQUFDLHNCQUFzQixDQUFDO1NBQ3RGO0tBQ0YsQ0FBQztBQUNKLENBQUM7QUFFRCxvRUFBb0U7QUFDcEUsU0FBZ0IscUJBQXFCLENBQUMsRUFDcEMsS0FBSyxFQUNMLE9BQU8sRUFDUCxPQUFPLEVBQ1AsUUFBUSxFQUNSLGlCQUFpQixFQUNqQixXQUFXLEdBQUcsS0FBSyxHQUNFO0lBQ3JCLE1BQU0sZUFBZSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFO1FBQ3JELFVBQVUsRUFBRSxlQUFlLENBQUMsdUJBQWMsQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQztRQUM1RixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztRQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7UUFDMUMsVUFBVSxFQUFFLElBQUk7UUFDaEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztRQUN4QyxpQkFBaUIsRUFBRSxJQUFJO0tBQ3hCLENBQUMsQ0FBQztJQUNILGlGQUFpRjtJQUNqRix5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxlQUFlLEVBQ2Y7UUFDRTtZQUNFLEVBQUUsRUFBRSxpQkFBaUI7WUFDckIsTUFBTSxFQUFFLGlCQUFpQjtTQUMxQjtLQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7SUFFRixPQUFPLGVBQWUsQ0FBQztBQUN6QixDQUFDO0FBQ0QsNkVBQTZFO0FBQzdFLFNBQWdCLG9CQUFvQixDQUFDLEVBQ25DLEtBQUssRUFDTCxPQUFPLEVBQ1AsT0FBTyxFQUNQLGVBQWUsRUFDZixRQUFRLEVBQ1IsV0FBVyxHQUFHLEtBQUssR0FDQztJQUNwQixPQUFPLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFO1FBQ3BDLFVBQVUsRUFBRSxlQUFlLENBQUMsdUJBQWMsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUM7UUFDeEYsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7UUFDakQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1FBQzFDLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLFNBQVMsRUFBRSxJQUFJO1FBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztRQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1FBQ3ZCLHNCQUFzQixFQUFFLGVBQWU7UUFDdkMsc0JBQXNCLEVBQUUsY0FBYztRQUN0QyxjQUFjLEVBQUUsbUJBQW1CLEVBQUU7S0FDdEMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELHVEQUF1RDtBQUN2RCxTQUFnQiw0QkFBNEIsQ0FBQyxLQUFnQixFQUFFLE9BQWUsRUFBRSxPQUFlO0lBQzdGLE1BQU0sZUFBZSxHQUFHLHFCQUFxQixDQUFDO1FBQzVDLEtBQUs7UUFDTCxPQUFPO1FBQ1AsT0FBTztRQUNQLFFBQVEsRUFBRSw2QkFBNkI7UUFDdkMsaUJBQWlCLEVBQUUsNkdBQTZHO0tBQ2pJLENBQUMsQ0FBQztJQUNMLHFEQUFxRDtJQUNuRCxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQztRQUMxQyxLQUFLO1FBQ0wsT0FBTztRQUNQLE9BQU87UUFDUCxlQUFlO1FBQ2YsUUFBUSxFQUFFLG9CQUFvQjtLQUMvQixDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsZUFBZTtRQUNmLGNBQWM7S0FDZixDQUFDO0FBQ0osQ0FBQztBQUVELHVEQUF1RDtBQUN2RCxTQUFnQiw4QkFBOEIsQ0FBQyxLQUFnQixFQUFFLE9BQWUsRUFBRSxPQUFlO0lBQy9GLE1BQU0sZUFBZSxHQUFHLHFCQUFxQixDQUFDO1FBQzVDLEtBQUs7UUFDTCxPQUFPO1FBQ1AsT0FBTztRQUNQLFFBQVEsRUFBRSxzQ0FBc0M7UUFDaEQsaUJBQWlCLEVBQUUsc0hBQXNIO1FBQ3pJLFdBQVcsRUFBRSxJQUFJO0tBQ2xCLENBQUMsQ0FBQztJQUNMLG9EQUFvRDtJQUNsRCxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQztRQUMxQyxLQUFLO1FBQ0wsT0FBTztRQUNQLE9BQU87UUFDUCxlQUFlO1FBQ2YsUUFBUSxFQUFFLDZCQUE2QjtRQUN2QyxXQUFXLEVBQUUsSUFBSTtLQUNsQixDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsZUFBZTtRQUNmLGNBQWM7S0FDZixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuaW1wb3J0IHsgU1RPUkFHRV9DT05GSUcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbi8vIFMz44OQ44Kx44OD44OI44Gu5L2c5oiQ44Gr6Zai44GZ44KL6Zai5pWw44KS5a6a576pXG5pbnRlcmZhY2UgQmFzZUJ1Y2tldFByb3BzIHtcbiAgc2NvcGU6IENvbnN0cnVjdDtcbiAgYWNjb3VudDogc3RyaW5nO1xuICBlbnZOYW1lOiBzdHJpbmc7XG59XG5cbi8vIOOCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQ44GZ44KL44Gf44KB44Gu44OX44Ot44OR44OG44Kj44KS5a6a576pXG5pbnRlcmZhY2UgQXJ0aWZhY3RCdWNrZXRQcm9wcyBleHRlbmRzIEJhc2VCdWNrZXRQcm9wcyB7XG4gIGFjY2Vzc0xvZ0J1Y2tldDogczMuSUJ1Y2tldDtcbiAgYnVja2V0SWQ6IHN0cmluZztcbiAgaXNTZWNvbmRhcnk/OiBib29sZWFuO1xufVxuXG4vLyDjgqLjgq/jgrvjgrnjg63jgrDnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkOOBmeOCi+OBn+OCgeOBruODl+ODreODkeODhuOCo+OCkuWumue+qVxuaW50ZXJmYWNlIEFjY2Vzc0xvZ0J1Y2tldFByb3BzIGV4dGVuZHMgQmFzZUJ1Y2tldFByb3BzIHtcbiAgYnVja2V0SWQ6IHN0cmluZztcbiAgc3VwcHJlc3Npb25SZWFzb246IHN0cmluZztcbiAgaXNTZWNvbmRhcnk/OiBib29sZWFuO1xufVxuXG4vLyDjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOBqOOCouOCr+OCu+OCueODreOCsOeUqOOBrlMz44OQ44Kx44OD44OI44Gu44K744OD44OI44KS6KGo44GZ44Kk44Oz44K/44O844OV44Kn44O844K544KS5a6a576pXG5leHBvcnQgaW50ZXJmYWNlIEFydGlmYWN0QnVja2V0U2V0IHtcbiAgYWNjZXNzTG9nQnVja2V0OiBzMy5CdWNrZXQ7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5CdWNrZXQ7XG59XG5cbi8vIOODkOOCseODg+ODiOWQjeOCkuani+evieOBmeOCi+mWouaVsOOCkuWumue+qeOAguOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruWgtOWQiOOBr+OAgeWQjeWJjeOBqyBcInNlY29uZGFyeVwiIOOCkuWQq+OCgeOCi+OAglxuZnVuY3Rpb24gYnVpbGRCdWNrZXROYW1lKHByZWZpeDogc3RyaW5nLCBlbnZOYW1lOiBzdHJpbmcsIGFjY291bnQ6IHN0cmluZywgaXNTZWNvbmRhcnkgPSBmYWxzZSk6IHN0cmluZyB7XG4gIHJldHVybiBpc1NlY29uZGFyeVxuICAgID8gYCR7cHJlZml4fS0ke2Vudk5hbWV9LXNlY29uZGFyeS0ke2FjY291bnR9YFxuICAgIDogYCR7cHJlZml4fS0ke2Vudk5hbWV9LSR7YWNjb3VudH1gO1xufVxuXG4vLyBTM+ODkOOCseODg+ODiOOBruODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OCkuani+evieOBmeOCi+mWouaVsOOCkuWumue+qeOAguWPpOOBhOODkOODvOOCuOODp+ODs+OBruOCquODluOCuOOCp+OCr+ODiOOCkuiHquWLleeahOOBq+WJiumZpOOBmeOCi+ODq+ODvOODq+OCkuWQq+OCgOOAglxuZnVuY3Rpb24gYnVpbGRMaWZlY3ljbGVSdWxlcygpOiBzMy5MaWZlY3ljbGVSdWxlW10ge1xuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXG4gICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgIH0sXG4gIF07XG59XG5cbi8vIOOCouOCr+OCu+OCueODreOCsOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQ44GZ44KL6Zai5pWw44KS5a6a576p44CC44K744Kt44Ol44Oq44OG44Kj6KaB5Lu244Gr5Z+644Gl44GE44Gm44CB44OR44OW44Oq44OD44Kv44Ki44Kv44K744K544KS44OW44Ot44OD44Kv44GX44CB5pqX5Y+35YyW44KS5pyJ5Yq544Gr44GZ44KL44CCXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQWNjZXNzTG9nQnVja2V0KHtcbiAgc2NvcGUsXG4gIGFjY291bnQsXG4gIGVudk5hbWUsXG4gIGJ1Y2tldElkLFxuICBzdXBwcmVzc2lvblJlYXNvbixcbiAgaXNTZWNvbmRhcnkgPSBmYWxzZSxcbn06IEFjY2Vzc0xvZ0J1Y2tldFByb3BzKTogczMuQnVja2V0IHtcbiAgY29uc3QgYWNjZXNzTG9nQnVja2V0ID0gbmV3IHMzLkJ1Y2tldChzY29wZSwgYnVja2V0SWQsIHtcbiAgICBidWNrZXROYW1lOiBidWlsZEJ1Y2tldE5hbWUoU1RPUkFHRV9DT05GSUcuTE9HX0JVQ0tFVF9QUkVGSVgsIGVudk5hbWUsIGFjY291bnQsIGlzU2Vjb25kYXJ5KSxcbiAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gIH0pO1xuICAvLyBjZGstbmFn44Gu6K2m5ZGK44KS5oqR5Yi277yI44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gv44CB44Ki44O844OG44Kj44OV44Kh44Kv44OI44OQ44Kx44OD44OI44Gu44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw55So44Gn44GC44KK44CB44ON44K544OI44GV44KM44Gf44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44Gv5b+F6KaB44Gq44GE44Gf44KB77yJXG4gIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgW1xuICAgICAge1xuICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1TMScsXG4gICAgICAgIHJlYXNvbjogc3VwcHJlc3Npb25SZWFzb24sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICByZXR1cm4gYWNjZXNzTG9nQnVja2V0O1xufVxuLy8g44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovplqLmlbDjgpLlrprnvqnjgILjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgpLjgrXjg7zjg5Djg7zjgqLjgq/jgrvjgrnjg63jgrDjga7lrpvlhYjjgajjgZfjgaboqK3lrprjgZfjgIHjg6njgqTjg5XjgrXjgqTjgq/jg6vjg6vjg7zjg6vjgpLpgannlKjjgZnjgovjgIJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcnRpZmFjdEJ1Y2tldCh7XG4gIHNjb3BlLFxuICBhY2NvdW50LFxuICBlbnZOYW1lLFxuICBhY2Nlc3NMb2dCdWNrZXQsXG4gIGJ1Y2tldElkLFxuICBpc1NlY29uZGFyeSA9IGZhbHNlLFxufTogQXJ0aWZhY3RCdWNrZXRQcm9wcyk6IHMzLkJ1Y2tldCB7XG4gIHJldHVybiBuZXcgczMuQnVja2V0KHNjb3BlLCBidWNrZXRJZCwge1xuICAgIGJ1Y2tldE5hbWU6IGJ1aWxkQnVja2V0TmFtZShTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYLCBlbnZOYW1lLCBhY2NvdW50LCBpc1NlY29uZGFyeSksXG4gICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG4gICAgbGlmZWN5Y2xlUnVsZXM6IGJ1aWxkTGlmZWN5Y2xlUnVsZXMoKSxcbiAgfSk7XG59XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44Go44Ki44Kv44K744K544Ot44Kw55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovplqLmlbDjgpLlrprnvqlcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQcmltYXJ5QXJ0aWZhY3RCdWNrZXRzKHNjb3BlOiBDb25zdHJ1Y3QsIGVudk5hbWU6IHN0cmluZywgYWNjb3VudDogc3RyaW5nKTogQXJ0aWZhY3RCdWNrZXRTZXQge1xuICBjb25zdCBhY2Nlc3NMb2dCdWNrZXQgPSBjcmVhdGVBY2Nlc3NMb2dCdWNrZXQoe1xuICAgIHNjb3BlLFxuICAgIGFjY291bnQsXG4gICAgZW52TmFtZSxcbiAgICBidWNrZXRJZDogJ0JldnlBcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCcsXG4gICAgc3VwcHJlc3Npb25SZWFzb246ICdUaGlzIGJ1Y2tldCBzdG9yZXMgUzMgYWNjZXNzIGxvZ3MgZm9yIEJldnlBcnRpZmFjdEJ1Y2tldCBhbmQgZG9lcyBub3QgcmVxdWlyZSBuZXN0ZWQgc2VydmVyIGFjY2VzcyBsb2dnaW5nLicsXG4gIH0pO1xuLy8g44OX44Op44Kk44Oe44Oq44OQ44Kx44OD44OI44Gu5ZCN5YmN44Gr44GvIFwic2Vjb25kYXJ5XCIg44KS5ZCr44KB44Gq44GE44GT44Go44Gn44CB44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44Go5Yy65Yil44GZ44KLXG4gIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gY3JlYXRlQXJ0aWZhY3RCdWNrZXQoe1xuICAgIHNjb3BlLFxuICAgIGFjY291bnQsXG4gICAgZW52TmFtZSxcbiAgICBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgYnVja2V0SWQ6ICdCZXZ5QXJ0aWZhY3RCdWNrZXQnLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGFjY2Vzc0xvZ0J1Y2tldCxcbiAgICBhcnRpZmFjdEJ1Y2tldCxcbiAgfTtcbn1cblxuLy8g44K744Kr44Oz44OA44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgajjgqLjgq/jgrvjgrnjg63jgrDnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkOOBmeOCi+mWouaVsOOCkuWumue+qVxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlY29uZGFyeUFydGlmYWN0QnVja2V0cyhzY29wZTogQ29uc3RydWN0LCBlbnZOYW1lOiBzdHJpbmcsIGFjY291bnQ6IHN0cmluZyk6IEFydGlmYWN0QnVja2V0U2V0IHtcbiAgY29uc3QgYWNjZXNzTG9nQnVja2V0ID0gY3JlYXRlQWNjZXNzTG9nQnVja2V0KHtcbiAgICBzY29wZSxcbiAgICBhY2NvdW50LFxuICAgIGVudk5hbWUsXG4gICAgYnVja2V0SWQ6ICdCZXZ5QXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXRTZWNvbmRhcnknLFxuICAgIHN1cHByZXNzaW9uUmVhc29uOiAnVGhpcyBidWNrZXQgc3RvcmVzIFMzIGFjY2VzcyBsb2dzIGZvciBCZXZ5QXJ0aWZhY3RCdWNrZXRTZWNvbmRhcnkgYW5kIGRvZXMgbm90IHJlcXVpcmUgbmVzdGVkIHNlcnZlciBhY2Nlc3MgbG9nZ2luZy4nLFxuICAgIGlzU2Vjb25kYXJ5OiB0cnVlLFxuICB9KTtcbi8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBruWQjeWJjeOBq+OBryBcInNlY29uZGFyeVwiIOOCkuWQq+OCgeOCi+OBk+OBqOOBp+OAgeODl+ODqeOCpOODnuODquODkOOCseODg+ODiOOBqOWMuuWIpeOBmeOCi1xuICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IGNyZWF0ZUFydGlmYWN0QnVja2V0KHtcbiAgICBzY29wZSxcbiAgICBhY2NvdW50LFxuICAgIGVudk5hbWUsXG4gICAgYWNjZXNzTG9nQnVja2V0LFxuICAgIGJ1Y2tldElkOiAnQmV2eUFydGlmYWN0QnVja2V0U2Vjb25kYXJ5JyxcbiAgICBpc1NlY29uZGFyeTogdHJ1ZSxcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgYXJ0aWZhY3RCdWNrZXQsXG4gIH07XG59XG4iXX0=