#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BevyPlatformInfraStack } from '../lib/bevy-platform-infra-stack';
import { SecondaryBucketStack } from '../lib/secondary-bucket-stack';
import { validateCdkDefaultAccount } from '../lib/validators';

// CDKアプリケーションのエントリーポイント
const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
// CDK_DEFAULT_ACCOUNTが設定されていることを検証し、AWSアカウントIDを取得
const account = validateCdkDefaultAccount(process.env.CDK_DEFAULT_ACCOUNT);

// プライマリリージョンとセカンダリリージョンを定義
const primaryRegion = 'ap-northeast-1';
const secondaryRegion = 'us-east-1';

// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタックを先にデプロイして、ARNを取得
const secondaryStack = new SecondaryBucketStack(app, 'BevyPlatformInfraSecondaryBucketStack', {
  env: {
    account,
    region: secondaryRegion,
  },
  description: 'Secondary region bucket stack for artifact cross-region replication',
  envName,
});

// セカンダリバケットのARNをプライマリスタックに渡して、クロスリージョンレプリケーションを設定
const secondaryBucketArn = `arn:aws:s3:::${secondaryStack.bucketName}`;

// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
const primaryStack = new BevyPlatformInfraStack(app, 'BevyPlatformInfraStack', {
  env: {
    account,
    region: primaryRegion,
  },
  description: 'Primary region stack for artifact storage and GitHub OIDC role',
  secondaryBucketArn,
});

// デプロイ順序を保証（セカンダリ作成完了後にプライマリを更新）
primaryStack.addDependency(secondaryStack);

// cdk-nag: AWS Solutions チェックをアプリ全体に適用
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
