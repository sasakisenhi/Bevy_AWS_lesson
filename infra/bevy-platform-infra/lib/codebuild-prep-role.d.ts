import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
export interface CodeBuildPreparationRoleProps {
    scope: Construct;
    artifactBucket: s3.IBucket;
}
export declare function createCodeBuildPreparationRole({ scope, artifactBucket, }: CodeBuildPreparationRoleProps): iam.Role;
