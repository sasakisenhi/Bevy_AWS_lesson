import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
export interface PrimaryStackValidationProps {
    scope: Construct;
    envName: string;
    account: string;
    githubOwner: string;
    githubRepo: string;
    secondaryBucketArn: string;
    cfnBucket: s3.CfnBucket;
}
export interface SecondaryStackValidationProps {
    scope: Construct;
    envName: string;
}
export declare function registerPrimaryStackValidation({ scope, envName, account, githubOwner, githubRepo, secondaryBucketArn, cfnBucket, }: PrimaryStackValidationProps): void;
export declare function registerSecondaryStackValidation({ scope, envName, }: SecondaryStackValidationProps): void;
