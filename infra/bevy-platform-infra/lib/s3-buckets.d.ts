import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
interface BaseBucketProps {
    scope: Construct;
    account: string;
    envName: string;
}
interface ArtifactBucketProps extends BaseBucketProps {
    accessLogBucket: s3.IBucket;
    bucketId: string;
    isSecondary?: boolean;
}
interface AccessLogBucketProps extends BaseBucketProps {
    bucketId: string;
    suppressionReason: string;
    isSecondary?: boolean;
}
export interface ArtifactBucketSet {
    accessLogBucket: s3.Bucket;
    artifactBucket: s3.Bucket;
}
export declare function createAccessLogBucket({ scope, account, envName, bucketId, suppressionReason, isSecondary, }: AccessLogBucketProps): s3.Bucket;
export declare function createArtifactBucket({ scope, account, envName, accessLogBucket, bucketId, isSecondary, }: ArtifactBucketProps): s3.Bucket;
export declare function createPrimaryArtifactBuckets(scope: Construct, envName: string, account: string): ArtifactBucketSet;
export declare function createSecondaryArtifactBuckets(scope: Construct, envName: string, account: string): ArtifactBucketSet;
export {};
