#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { BevyPlatformInfraStack } from '../lib/bevy-platform-infra-stack';
import { SecondaryBucketStack } from '../lib/secondary-bucket-stack';

const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT is required. Configure AWS credentials before synth/deploy.');
}

const primaryRegion = 'ap-northeast-1';
const secondaryRegion = 'us-east-1';
const secondaryBucketName = `bevy-artifacts-${envName}-secondary-${account}`;
const secondaryBucketArn = `arn:aws:s3:::${secondaryBucketName}`;

new SecondaryBucketStack(app, 'BevyPlatformInfraSecondaryBucketStack', {
  env: {
    account,
    region: secondaryRegion,
  },
  description: 'Secondary region bucket stack for artifact cross-region replication',
  envName,
});

new BevyPlatformInfraStack(app, 'BevyPlatformInfraStack', {
  env: {
    account,
    region: primaryRegion,
  },
  description: 'Primary region stack for artifact storage and GitHub OIDC role',
  secondaryBucketArn,
});
