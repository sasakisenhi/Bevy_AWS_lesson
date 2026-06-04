import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
export interface ReplicationSetup {
    replicationRole: iam.Role;
    cfnBucket: s3.CfnBucket;
}
export interface ReplicationSetupProps {
    scope: Construct;
    artifactBucket: s3.Bucket;
    secondaryBucketArn: string;
}
export declare function setupCrossRegionReplication({ scope, artifactBucket, secondaryBucketArn, }: ReplicationSetupProps): ReplicationSetup;
