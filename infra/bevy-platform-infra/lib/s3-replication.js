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
function setupCrossRegionReplication({ scope, artifactBucket, secondaryBucketArn, }) {
    const replicationRole = new iam.Role(scope, 'S3ReplicationRole', {
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
        description: 'Role used by S3 to replicate objects to the secondary region bucket',
    });
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetReplicationConfiguration',
            's3:ListBucket',
        ],
        resources: [artifactBucket.bucketArn],
    }));
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:GetObjectVersionForReplication',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionTagging',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
    }));
    replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
            's3:ReplicateObject',
            's3:ReplicateDelete',
            's3:ReplicateTags',
        ],
        resources: [`${secondaryBucketArn}/*`],
    }));
    cdk_nag_1.NagSuppressions.addResourceSuppressions(replicationRole, [
        {
            id: 'AwsSolutions-IAM5',
            reason: 'Cross-region replication is configured for all objects, which requires object-level wildcard resources in source and destination bucket ARNs.',
            appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
        },
    ], true);
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
    cfnBucket.addDependency(replicationRole.node.defaultChild);
    return {
        replicationRole,
        cfnBucket,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtcmVwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzMy1yZXBsaWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdCQSxrRUFnRkM7QUEvRkQseURBQTJDO0FBRTNDLHFDQUEwQztBQWExQyxTQUFnQiwyQkFBMkIsQ0FBQyxFQUMxQyxLQUFLLEVBQ0wsY0FBYyxFQUNkLGtCQUFrQixHQUNJO0lBQ3RCLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLEVBQUU7UUFDL0QsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDO1FBQ3ZELFdBQVcsRUFBRSxxRUFBcUU7S0FDbkYsQ0FBQyxDQUFDO0lBRUgsZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLGdDQUFnQztZQUNoQyxlQUFlO1NBQ2hCO1FBQ0QsU0FBUyxFQUFFLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztLQUN0QyxDQUFDLENBQ0gsQ0FBQztJQUVGLGVBQWUsQ0FBQyxXQUFXLENBQ3pCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QixPQUFPLEVBQUU7WUFDUCxtQ0FBbUM7WUFDbkMsd0JBQXdCO1lBQ3hCLDRCQUE0QjtTQUM3QjtRQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsY0FBYyxDQUFDLFNBQVMsSUFBSSxDQUFDO0tBQzdDLENBQUMsQ0FDSCxDQUFDO0lBRUYsZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLG9CQUFvQjtZQUNwQixvQkFBb0I7WUFDcEIsa0JBQWtCO1NBQ25CO1FBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxrQkFBa0IsSUFBSSxDQUFDO0tBQ3ZDLENBQUMsQ0FDSCxDQUFDO0lBRUYseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsZUFBZSxFQUNmO1FBQ0U7WUFDRSxFQUFFLEVBQUUsbUJBQW1CO1lBQ3ZCLE1BQU0sRUFBRSwrSUFBK0k7WUFDdkosU0FBUyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztTQUNqRDtLQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7SUFFRixNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQTRCLENBQUM7SUFDbkUsU0FBUyxDQUFDLHdCQUF3QixHQUFHO1FBQ25DLElBQUksRUFBRSxlQUFlLENBQUMsT0FBTztRQUM3QixLQUFLLEVBQUU7WUFDTDtnQkFDRSxFQUFFLEVBQUUsNEJBQTRCO2dCQUNoQyxNQUFNLEVBQUUsU0FBUztnQkFDakIsUUFBUSxFQUFFLENBQUM7Z0JBQ1gsTUFBTSxFQUFFO29CQUNOLE1BQU0sRUFBRSxFQUFFO2lCQUNYO2dCQUNELHVCQUF1QixFQUFFO29CQUN2QixNQUFNLEVBQUUsU0FBUztpQkFDbEI7Z0JBQ0QsV0FBVyxFQUFFO29CQUNYLE1BQU0sRUFBRSxrQkFBa0I7aUJBQzNCO2FBQ0Y7U0FDRjtLQUNGLENBQUM7SUFDRixTQUFTLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsWUFBMkIsQ0FBQyxDQUFDO0lBRTFFLE9BQU87UUFDTCxlQUFlO1FBQ2YsU0FBUztLQUNWLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSAnY2RrLW5hZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVwbGljYXRpb25TZXR1cCB7XG4gIHJlcGxpY2F0aW9uUm9sZTogaWFtLlJvbGU7XG4gIGNmbkJ1Y2tldDogczMuQ2ZuQnVja2V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlcGxpY2F0aW9uU2V0dXBQcm9wcyB7XG4gIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIGFydGlmYWN0QnVja2V0OiBzMy5CdWNrZXQ7XG4gIHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBDcm9zc1JlZ2lvblJlcGxpY2F0aW9uKHtcbiAgc2NvcGUsXG4gIGFydGlmYWN0QnVja2V0LFxuICBzZWNvbmRhcnlCdWNrZXRBcm4sXG59OiBSZXBsaWNhdGlvblNldHVwUHJvcHMpOiBSZXBsaWNhdGlvblNldHVwIHtcbiAgY29uc3QgcmVwbGljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHNjb3BlLCAnUzNSZXBsaWNhdGlvblJvbGUnLCB7XG4gICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3MzLmFtYXpvbmF3cy5jb20nKSxcbiAgICBkZXNjcmlwdGlvbjogJ1JvbGUgdXNlZCBieSBTMyB0byByZXBsaWNhdGUgb2JqZWN0cyB0byB0aGUgc2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQnLFxuICB9KTtcblxuICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0UmVwbGljYXRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybl0sXG4gICAgfSksXG4gICk7XG5cbiAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvbicsXG4gICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uQWNsJyxcbiAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25UYWdnaW5nJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgJHthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KSxcbiAgKTtcblxuICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6UmVwbGljYXRlT2JqZWN0JyxcbiAgICAgICAgJ3MzOlJlcGxpY2F0ZURlbGV0ZScsXG4gICAgICAgICdzMzpSZXBsaWNhdGVUYWdzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzZWNvbmRhcnlCdWNrZXRBcm59LypgXSxcbiAgICB9KSxcbiAgKTtcblxuICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgcmVwbGljYXRpb25Sb2xlLFxuICAgIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgIHJlYXNvbjogJ0Nyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbiBpcyBjb25maWd1cmVkIGZvciBhbGwgb2JqZWN0cywgd2hpY2ggcmVxdWlyZXMgb2JqZWN0LWxldmVsIHdpbGRjYXJkIHJlc291cmNlcyBpbiBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGJ1Y2tldCBBUk5zLicsXG4gICAgICAgIGFwcGxpZXNUbzogW3sgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcXFwvXFxcXCokLycgfV0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgdHJ1ZSxcbiAgKTtcblxuICBjb25zdCBjZm5CdWNrZXQgPSBhcnRpZmFjdEJ1Y2tldC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBzMy5DZm5CdWNrZXQ7XG4gIGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgcm9sZTogcmVwbGljYXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgcnVsZXM6IFtcbiAgICAgIHtcbiAgICAgICAgaWQ6ICdDcm9zc1JlZ2lvblJlcGxpY2F0aW9uUnVsZScsXG4gICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgZmlsdGVyOiB7XG4gICAgICAgICAgcHJlZml4OiAnJyxcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRlTWFya2VyUmVwbGljYXRpb246IHtcbiAgICAgICAgICBzdGF0dXM6ICdFbmFibGVkJyxcbiAgICAgICAgfSxcbiAgICAgICAgZGVzdGluYXRpb246IHtcbiAgICAgICAgICBidWNrZXQ6IHNlY29uZGFyeUJ1Y2tldEFybixcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfTtcbiAgY2ZuQnVja2V0LmFkZERlcGVuZGVuY3kocmVwbGljYXRpb25Sb2xlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGlhbS5DZm5Sb2xlKTtcblxuICByZXR1cm4ge1xuICAgIHJlcGxpY2F0aW9uUm9sZSxcbiAgICBjZm5CdWNrZXQsXG4gIH07XG59XG4iXX0=