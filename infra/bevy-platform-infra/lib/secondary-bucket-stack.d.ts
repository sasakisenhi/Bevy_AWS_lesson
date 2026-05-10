import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface SecondaryBucketStackProps extends cdk.StackProps {
    envName: string;
}
export declare class SecondaryBucketStack extends cdk.Stack {
    readonly bucketName: string;
    constructor(scope: Construct, id: string, props: SecondaryBucketStackProps);
}
export {};
