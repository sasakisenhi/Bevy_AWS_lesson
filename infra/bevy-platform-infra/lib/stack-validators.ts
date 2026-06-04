import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';

import { ENV_NAME_REGEX, GITHUB_OIDC_CONFIG, STORAGE_CONFIG } from './config';
import { toBucketNameFromArn } from './validators';

// スタックのバリデーションを登録する関数と関連するインターフェースを定義
export interface PrimaryStackValidationProps {
  scope: Construct;
  envName: string;
  account: string;
  githubOwner: string;
  githubRepo: string;
  secondaryBucketArn: string;
  cfnBucket: s3.CfnBucket;
}

// スタックのバリデーションを登録する関数と関連するインターフェースを定義
export interface SecondaryStackValidationProps {
  scope: Construct;
  envName: string;
}

// プライマリスタックのバリデーションを登録する関数を定義。これには、環境名、GitHub OIDCのコンテキスト値、およびセカンダリバケットのARNに関する検証が含まれる。
export function registerPrimaryStackValidation({
  scope,
  envName,
  account,
  githubOwner,
  githubRepo,
  secondaryBucketArn,
  cfnBucket,
}: PrimaryStackValidationProps): void {
  scope.node.addValidation({
    validate: (): string[] => {
      const errors: string[] = [];
// 環境名が dev, test, stg, prod のいずれかであることを検証
      if (!ENV_NAME_REGEX.test(envName)) {
        errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
      }
// GitHub OIDCのコンテキスト値がプレースホルダーのままになっていないことを検証
      if (
        envName === 'prod' &&
        (
          githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
          githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO
        )
      ) {
        errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
      }
      const expectedSecondaryBucketName = `${STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${account}`;
      const secondaryBucketName = toBucketNameFromArn(secondaryBucketArn);
      // セカンダリバケットARNが、envNameとaccountに基づいて予想されるバケット名を指していることを検証
      const isUnresolvedSecondaryArn =
        cdk.Token.isUnresolved(secondaryBucketArn) || secondaryBucketName.includes('${Token[');

      if (!isUnresolvedSecondaryArn && secondaryBucketName !== expectedSecondaryBucketName) {
        errors.push(
          `secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`,
        );
      }
// S3レプリケーションの設定が正しく構成されていることを検証
      const replicationConfig = cfnBucket.replicationConfiguration as s3.CfnBucket.ReplicationConfigurationProperty | undefined;
      if (!replicationConfig?.role) {
        errors.push('S3 replication configuration must include a role ARN.');
      }
      // レプリケーションルールが少なくとも1つ有効であることを検証
      const replicationRules = replicationConfig?.rules;
      if (!Array.isArray(replicationRules) || replicationRules.length === 0) {
        errors.push('S3 replication configuration must include at least one enabled rule.');
      }

      return errors;
    },
  });
}

// セカンダリスタックのバリデーションを登録する関数を定義。これには、環境名に関する検証が含まれる。
export function registerSecondaryStackValidation({
  scope,
  envName,
}: SecondaryStackValidationProps): void {
  scope.node.addValidation({
    validate: (): string[] => {
      const errors: string[] = [];
      // 環境名が dev, test, stg, prod のいずれかであることを検証
      if (!ENV_NAME_REGEX.test(envName)) {
        errors.push('envName must be one of dev, test, stg, prod for naming and policy consistency.');
      }
      return errors;
    },
  });
}
