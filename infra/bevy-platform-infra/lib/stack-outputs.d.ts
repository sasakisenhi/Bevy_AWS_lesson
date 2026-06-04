import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
export interface PrimaryStackOutputProps {
    scope: Construct;
    artifactBucket: s3.IBucket;
    githubRole: iam.IRole;
    secondaryBucketArn: string;
}
export interface SecondaryStackOutputProps {
    scope: Construct;
    secondaryBucket: s3.IBucket;
}
export declare function addPrimaryStackOutputs({ scope, artifactBucket, githubRole, secondaryBucketArn, }: PrimaryStackOutputProps): void;
export declare function addSecondaryStackOutputs({ scope, secondaryBucket, }: SecondaryStackOutputProps): void;
