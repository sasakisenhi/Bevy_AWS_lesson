import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// 定数オブジェクトを定義してマジックナンバーを排除
interface SecondaryBucketStackProps extends cdk.StackProps {
    envName: string;
}
// CDKスタックの定義
export declare class SecondaryBucketStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SecondaryBucketStackProps);
}
export {};
