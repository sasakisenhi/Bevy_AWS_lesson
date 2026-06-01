import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// 定数オブジェクトを定義してマジックナンバーを排除
import { ENV_NAME_REGEX } from './config';
import { validateExplicitStackAccount } from './validators';
import { createSecondaryArtifactBuckets } from './s3-buckets';

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

    // セカンダリバケットの名前をCloudFormation出力に追加して、プライマリスタックで参照できるようにする
    new cdk.CfnOutput(this, 'SecondaryBucketNameExport', {
      value: secondaryBucket.bucketName,
    });

    this.node.addValidation({
      // スタック全体のバリデーションルールを定義
      validate: (): string[] => {
        const errors: string[] = [];
        // 環境名のバリデーション
        if (!ENV_NAME_REGEX.test(props.envName)) {
          errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
        }

        return errors;
      },
    });
  }
}
