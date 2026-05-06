import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// 定数オブジェクトを定義してマジックナンバーを排除
interface BevyPlatformInfraStackProps extends cdk.StackProps {
    secondaryBucketArn: string;
}

//GitHub OIDCの設定も定数オブジェクトにまとめる --- IGNORE ---
export declare class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BevyPlatformInfraStackProps);
}
export {};
