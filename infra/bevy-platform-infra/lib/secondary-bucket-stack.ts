import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { validateExplicitStackAccount } from './validators';
import { createSecondaryArtifactBuckets } from './s3-buckets';
import { registerSecondaryStackValidation } from './stack-validators';
import { addSecondaryStackOutputs } from './stack-outputs';

// 定数オブジェクトを定義してマジックナンバーを排除
interface SecondaryBucketStackProps extends cdk.StackProps {
  envName: string;
}

// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタック
export class SecondaryBucketStack extends cdk.Stack {
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: SecondaryBucketStackProps) {
    // AWSアカウントIDが明示的に設定されているかを検証
    validateExplicitStackAccount(props.env);

    super(scope, id, props);

    const { artifactBucket: secondaryBucket } = createSecondaryArtifactBuckets(this, props.envName, this.account);

    this.bucketName = secondaryBucket.bucketName;

    addSecondaryStackOutputs({
      scope: this,
      secondaryBucket,
    });

    registerSecondaryStackValidation({
      scope: this,
      envName: props.envName,
    });
  }
}
