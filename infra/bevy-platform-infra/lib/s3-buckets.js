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
function buildBucketName(prefix, envName, account, isSecondary = false) {
    return isSecondary
        ? `${prefix}-${envName}-secondary-${account}`
        : `${prefix}-${envName}-${account}`;
}
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
function createAccessLogBucket({ scope, account, envName, bucketId, suppressionReason, isSecondary = false, }) {
    const accessLogBucket = new s3.Bucket(scope, bucketId, {
        bucketName: buildBucketName(config_1.STORAGE_CONFIG.LOG_BUCKET_PREFIX, envName, account, isSecondary),
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
    });
    cdk_nag_1.NagSuppressions.addResourceSuppressions(accessLogBucket, [
        {
            id: 'AwsSolutions-S1',
            reason: suppressionReason,
        },
    ], true);
    return accessLogBucket;
}
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
function createPrimaryArtifactBuckets(scope, envName, account) {
    const accessLogBucket = createAccessLogBucket({
        scope,
        account,
        envName,
        bucketId: 'BevyArtifactAccessLogBucket',
        suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucket and does not require nested server access logging.',
    });
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
function createSecondaryArtifactBuckets(scope, envName, account) {
    const accessLogBucket = createAccessLogBucket({
        scope,
        account,
        envName,
        bucketId: 'BevyArtifactAccessLogBucketSecondary',
        suppressionReason: 'This bucket stores S3 access logs for BevyArtifactBucketSecondary and does not require nested server access logging.',
        isSecondary: true,
    });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtYnVja2V0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInMzLWJ1Y2tldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUErQ0Esc0RBNkJDO0FBRUQsb0RBb0JDO0FBRUQsb0VBcUJDO0FBRUQsd0VBdUJDO0FBbEpELGlEQUFtQztBQUNuQyx1REFBeUM7QUFFekMscUNBQTBDO0FBRTFDLHFDQUEwQztBQXlCMUMsU0FBUyxlQUFlLENBQUMsTUFBYyxFQUFFLE9BQWUsRUFBRSxPQUFlLEVBQUUsV0FBVyxHQUFHLEtBQUs7SUFDNUYsT0FBTyxXQUFXO1FBQ2hCLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSSxPQUFPLGNBQWMsT0FBTyxFQUFFO1FBQzdDLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSSxPQUFPLElBQUksT0FBTyxFQUFFLENBQUM7QUFDeEMsQ0FBQztBQUVELFNBQVMsbUJBQW1CO0lBQzFCLE9BQU87UUFDTDtZQUNFLEVBQUUsRUFBRSxpQkFBaUI7WUFDckIsT0FBTyxFQUFFLElBQUk7WUFDYixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsdUJBQWMsQ0FBQyxjQUFjLENBQUM7WUFDNUQsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsdUJBQWMsQ0FBQyxzQkFBc0IsQ0FBQztTQUN0RjtLQUNGLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBZ0IscUJBQXFCLENBQUMsRUFDcEMsS0FBSyxFQUNMLE9BQU8sRUFDUCxPQUFPLEVBQ1AsUUFBUSxFQUNSLGlCQUFpQixFQUNqQixXQUFXLEdBQUcsS0FBSyxHQUNFO0lBQ3JCLE1BQU0sZUFBZSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFO1FBQ3JELFVBQVUsRUFBRSxlQUFlLENBQUMsdUJBQWMsQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQztRQUM1RixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztRQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7UUFDMUMsVUFBVSxFQUFFLElBQUk7UUFDaEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztRQUN4QyxpQkFBaUIsRUFBRSxJQUFJO0tBQ3hCLENBQUMsQ0FBQztJQUVILHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLGVBQWUsRUFDZjtRQUNFO1lBQ0UsRUFBRSxFQUFFLGlCQUFpQjtZQUNyQixNQUFNLEVBQUUsaUJBQWlCO1NBQzFCO0tBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztJQUVGLE9BQU8sZUFBZSxDQUFDO0FBQ3pCLENBQUM7QUFFRCxTQUFnQixvQkFBb0IsQ0FBQyxFQUNuQyxLQUFLLEVBQ0wsT0FBTyxFQUNQLE9BQU8sRUFDUCxlQUFlLEVBQ2YsUUFBUSxFQUNSLFdBQVcsR0FBRyxLQUFLLEdBQ0M7SUFDcEIsT0FBTyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRTtRQUNwQyxVQUFVLEVBQUUsZUFBZSxDQUFDLHVCQUFjLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDO1FBQ3hGLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1FBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtRQUMxQyxVQUFVLEVBQUUsSUFBSTtRQUNoQixTQUFTLEVBQUUsSUFBSTtRQUNmLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87UUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtRQUN2QixzQkFBc0IsRUFBRSxlQUFlO1FBQ3ZDLHNCQUFzQixFQUFFLGNBQWM7UUFDdEMsY0FBYyxFQUFFLG1CQUFtQixFQUFFO0tBQ3RDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFnQiw0QkFBNEIsQ0FBQyxLQUFnQixFQUFFLE9BQWUsRUFBRSxPQUFlO0lBQzdGLE1BQU0sZUFBZSxHQUFHLHFCQUFxQixDQUFDO1FBQzVDLEtBQUs7UUFDTCxPQUFPO1FBQ1AsT0FBTztRQUNQLFFBQVEsRUFBRSw2QkFBNkI7UUFDdkMsaUJBQWlCLEVBQUUsNkdBQTZHO0tBQ2pJLENBQUMsQ0FBQztJQUVILE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDO1FBQzFDLEtBQUs7UUFDTCxPQUFPO1FBQ1AsT0FBTztRQUNQLGVBQWU7UUFDZixRQUFRLEVBQUUsb0JBQW9CO0tBQy9CLENBQUMsQ0FBQztJQUVILE9BQU87UUFDTCxlQUFlO1FBQ2YsY0FBYztLQUNmLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBZ0IsOEJBQThCLENBQUMsS0FBZ0IsRUFBRSxPQUFlLEVBQUUsT0FBZTtJQUMvRixNQUFNLGVBQWUsR0FBRyxxQkFBcUIsQ0FBQztRQUM1QyxLQUFLO1FBQ0wsT0FBTztRQUNQLE9BQU87UUFDUCxRQUFRLEVBQUUsc0NBQXNDO1FBQ2hELGlCQUFpQixFQUFFLHNIQUFzSDtRQUN6SSxXQUFXLEVBQUUsSUFBSTtLQUNsQixDQUFDLENBQUM7SUFFSCxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQztRQUMxQyxLQUFLO1FBQ0wsT0FBTztRQUNQLE9BQU87UUFDUCxlQUFlO1FBQ2YsUUFBUSxFQUFFLDZCQUE2QjtRQUN2QyxXQUFXLEVBQUUsSUFBSTtLQUNsQixDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsZUFBZTtRQUNmLGNBQWM7S0FDZixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuaW1wb3J0IHsgU1RPUkFHRV9DT05GSUcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbmludGVyZmFjZSBCYXNlQnVja2V0UHJvcHMge1xuICBzY29wZTogQ29uc3RydWN0O1xuICBhY2NvdW50OiBzdHJpbmc7XG4gIGVudk5hbWU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFydGlmYWN0QnVja2V0UHJvcHMgZXh0ZW5kcyBCYXNlQnVja2V0UHJvcHMge1xuICBhY2Nlc3NMb2dCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIGJ1Y2tldElkOiBzdHJpbmc7XG4gIGlzU2Vjb25kYXJ5PzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIEFjY2Vzc0xvZ0J1Y2tldFByb3BzIGV4dGVuZHMgQmFzZUJ1Y2tldFByb3BzIHtcbiAgYnVja2V0SWQ6IHN0cmluZztcbiAgc3VwcHJlc3Npb25SZWFzb246IHN0cmluZztcbiAgaXNTZWNvbmRhcnk/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFydGlmYWN0QnVja2V0U2V0IHtcbiAgYWNjZXNzTG9nQnVja2V0OiBzMy5CdWNrZXQ7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5CdWNrZXQ7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQnVja2V0TmFtZShwcmVmaXg6IHN0cmluZywgZW52TmFtZTogc3RyaW5nLCBhY2NvdW50OiBzdHJpbmcsIGlzU2Vjb25kYXJ5ID0gZmFsc2UpOiBzdHJpbmcge1xuICByZXR1cm4gaXNTZWNvbmRhcnlcbiAgICA/IGAke3ByZWZpeH0tJHtlbnZOYW1lfS1zZWNvbmRhcnktJHthY2NvdW50fWBcbiAgICA6IGAke3ByZWZpeH0tJHtlbnZOYW1lfS0ke2FjY291bnR9YDtcbn1cblxuZnVuY3Rpb24gYnVpbGRMaWZlY3ljbGVSdWxlcygpOiBzMy5MaWZlY3ljbGVSdWxlW10ge1xuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXG4gICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgIH0sXG4gIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBY2Nlc3NMb2dCdWNrZXQoe1xuICBzY29wZSxcbiAgYWNjb3VudCxcbiAgZW52TmFtZSxcbiAgYnVja2V0SWQsXG4gIHN1cHByZXNzaW9uUmVhc29uLFxuICBpc1NlY29uZGFyeSA9IGZhbHNlLFxufTogQWNjZXNzTG9nQnVja2V0UHJvcHMpOiBzMy5CdWNrZXQge1xuICBjb25zdCBhY2Nlc3NMb2dCdWNrZXQgPSBuZXcgczMuQnVja2V0KHNjb3BlLCBidWNrZXRJZCwge1xuICAgIGJ1Y2tldE5hbWU6IGJ1aWxkQnVja2V0TmFtZShTVE9SQUdFX0NPTkZJRy5MT0dfQlVDS0VUX1BSRUZJWCwgZW52TmFtZSwgYWNjb3VudCwgaXNTZWNvbmRhcnkpLFxuICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgfSk7XG5cbiAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgIGFjY2Vzc0xvZ0J1Y2tldCxcbiAgICBbXG4gICAgICB7XG4gICAgICAgIGlkOiAnQXdzU29sdXRpb25zLVMxJyxcbiAgICAgICAgcmVhc29uOiBzdXBwcmVzc2lvblJlYXNvbixcbiAgICAgIH0sXG4gICAgXSxcbiAgICB0cnVlLFxuICApO1xuXG4gIHJldHVybiBhY2Nlc3NMb2dCdWNrZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcnRpZmFjdEJ1Y2tldCh7XG4gIHNjb3BlLFxuICBhY2NvdW50LFxuICBlbnZOYW1lLFxuICBhY2Nlc3NMb2dCdWNrZXQsXG4gIGJ1Y2tldElkLFxuICBpc1NlY29uZGFyeSA9IGZhbHNlLFxufTogQXJ0aWZhY3RCdWNrZXRQcm9wcyk6IHMzLkJ1Y2tldCB7XG4gIHJldHVybiBuZXcgczMuQnVja2V0KHNjb3BlLCBidWNrZXRJZCwge1xuICAgIGJ1Y2tldE5hbWU6IGJ1aWxkQnVja2V0TmFtZShTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYLCBlbnZOYW1lLCBhY2NvdW50LCBpc1NlY29uZGFyeSksXG4gICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG4gICAgbGlmZWN5Y2xlUnVsZXM6IGJ1aWxkTGlmZWN5Y2xlUnVsZXMoKSxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQcmltYXJ5QXJ0aWZhY3RCdWNrZXRzKHNjb3BlOiBDb25zdHJ1Y3QsIGVudk5hbWU6IHN0cmluZywgYWNjb3VudDogc3RyaW5nKTogQXJ0aWZhY3RCdWNrZXRTZXQge1xuICBjb25zdCBhY2Nlc3NMb2dCdWNrZXQgPSBjcmVhdGVBY2Nlc3NMb2dCdWNrZXQoe1xuICAgIHNjb3BlLFxuICAgIGFjY291bnQsXG4gICAgZW52TmFtZSxcbiAgICBidWNrZXRJZDogJ0JldnlBcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCcsXG4gICAgc3VwcHJlc3Npb25SZWFzb246ICdUaGlzIGJ1Y2tldCBzdG9yZXMgUzMgYWNjZXNzIGxvZ3MgZm9yIEJldnlBcnRpZmFjdEJ1Y2tldCBhbmQgZG9lcyBub3QgcmVxdWlyZSBuZXN0ZWQgc2VydmVyIGFjY2VzcyBsb2dnaW5nLicsXG4gIH0pO1xuXG4gIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gY3JlYXRlQXJ0aWZhY3RCdWNrZXQoe1xuICAgIHNjb3BlLFxuICAgIGFjY291bnQsXG4gICAgZW52TmFtZSxcbiAgICBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgYnVja2V0SWQ6ICdCZXZ5QXJ0aWZhY3RCdWNrZXQnLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGFjY2Vzc0xvZ0J1Y2tldCxcbiAgICBhcnRpZmFjdEJ1Y2tldCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlY29uZGFyeUFydGlmYWN0QnVja2V0cyhzY29wZTogQ29uc3RydWN0LCBlbnZOYW1lOiBzdHJpbmcsIGFjY291bnQ6IHN0cmluZyk6IEFydGlmYWN0QnVja2V0U2V0IHtcbiAgY29uc3QgYWNjZXNzTG9nQnVja2V0ID0gY3JlYXRlQWNjZXNzTG9nQnVja2V0KHtcbiAgICBzY29wZSxcbiAgICBhY2NvdW50LFxuICAgIGVudk5hbWUsXG4gICAgYnVja2V0SWQ6ICdCZXZ5QXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXRTZWNvbmRhcnknLFxuICAgIHN1cHByZXNzaW9uUmVhc29uOiAnVGhpcyBidWNrZXQgc3RvcmVzIFMzIGFjY2VzcyBsb2dzIGZvciBCZXZ5QXJ0aWZhY3RCdWNrZXRTZWNvbmRhcnkgYW5kIGRvZXMgbm90IHJlcXVpcmUgbmVzdGVkIHNlcnZlciBhY2Nlc3MgbG9nZ2luZy4nLFxuICAgIGlzU2Vjb25kYXJ5OiB0cnVlLFxuICB9KTtcblxuICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IGNyZWF0ZUFydGlmYWN0QnVja2V0KHtcbiAgICBzY29wZSxcbiAgICBhY2NvdW50LFxuICAgIGVudk5hbWUsXG4gICAgYWNjZXNzTG9nQnVja2V0LFxuICAgIGJ1Y2tldElkOiAnQmV2eUFydGlmYWN0QnVja2V0U2Vjb25kYXJ5JyxcbiAgICBpc1NlY29uZGFyeTogdHJ1ZSxcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBhY2Nlc3NMb2dCdWNrZXQsXG4gICAgYXJ0aWZhY3RCdWNrZXQsXG4gIH07XG59XG4iXX0=