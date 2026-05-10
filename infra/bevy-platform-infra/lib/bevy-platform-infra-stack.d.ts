import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface BevyPlatformInfraStackProps extends cdk.StackProps {
    secondaryBucketArn: string;
}
export declare class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BevyPlatformInfraStackProps);
}
export {};
