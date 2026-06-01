import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
// 定数オブジェクトを定義してマジックナンバーを排除
import {
  ENV_NAME_REGEX,
  GITHUB_OIDC_CONFIG,
  STORAGE_CONFIG,
} from './config';
import {
  toBucketNameFromArn,
  validateExplicitStackAccount,
  validateGitHubOidcContext,
  validateSecondaryBucketArn,
} from './validators';
import { createPrimaryArtifactBuckets } from './s3-buckets';

interface BevyPlatformInfraStackProps extends cdk.StackProps {
  secondaryBucketArn: string;
}

// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
export class BevyPlatformInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BevyPlatformInfraStackProps) {
    // AWSアカウントIDが明示的に指定されているか、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARNを検証
    validateExplicitStackAccount(props.env);
    // セカンダリバケットのARNを検証
    validateSecondaryBucketArn(props.secondaryBucketArn);

    super(scope, id, props);

    // 実行時に -c env=prod と渡せる
    const envName = this.node.tryGetContext('env') || 'dev';
    // GitHub OIDCの設定をコンテキストから取得（プレースホルダーも用意）
    const githubOwnerContext = this.node.tryGetContext('githubOwner');
    const githubRepoContext = this.node.tryGetContext('githubRepo');
    const githubBranchContext = this.node.tryGetContext('githubBranch');

    const githubOwnerFromContext = githubOwnerContext !== undefined ? String(githubOwnerContext) : undefined;
    const githubRepoFromContext = githubRepoContext !== undefined ? String(githubRepoContext) : undefined;
    const githubBranch = githubBranchContext !== undefined ? String(githubBranchContext) : undefined;

    // GitHub OIDCのコンテキスト値をバリデーション
    validateGitHubOidcContext(githubOwnerFromContext, githubRepoFromContext, githubBranch);

    const githubOwner = githubOwnerFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER;
    const githubRepo = githubRepoFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO;
    const githubBranches = githubBranch
      ? [String(githubBranch)]
      : GITHUB_OIDC_CONFIG.DEFAULT_BRANCHES;
    
    // 既存のARNが明示的に指定されている場合、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARN
    const existingProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    
    const githubSubs = githubBranches.map(
      (branch) => `repo:${githubOwner}/${githubRepo}:ref:refs/heads/${branch}`,
    );

    // GitHub OIDCの設定がプレースホルダーのままの場合は警告を出す
    if (
      githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
      githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO
    ) {
      cdk.Annotations.of(this).addWarning(
        'GitHub OIDC trust is using placeholders. Pass -c githubOwner=<owner> -c githubRepo=<repo> and optionally -c githubBranch=<branch> before deployment.',
      );
    }
    // アーティファクト用のS3バケットを作成
    const {
      accessLogBucket: artifactAccessLogBucket,
      artifactBucket,
    } = createPrimaryArtifactBuckets(this, envName, this.account);
    // ★ 修正箇所：常に新しいプロバイダーを作るのではなく、既存のARNを参照する
    // 初回作成時（プロバイダーがない状態）は、`fromOpenIdConnectProviderArn` ではなく新規作成するか、または例外を考慮する必要がありますが、
    // 既存のエラー（EntityAlreadyExistsException）を回避するため、すでに存在する場合は既存のARNで参照します。
    // CDKの組み込みメソッド `OpenIdConnectProvider.fromOpenIdConnectProviderArn` を使用します。

    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubProvider',
      existingProviderArn,
    );
    // GitHub Actionsが特定のリポジトリとブランチからのみロールを引き受けられるようにする
    const githubRole = new iam.Role(this, 'GithubActionsRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': GITHUB_OIDC_CONFIG.CLIENT_ID,
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': githubSubs,
          },
        },
      ),
      description: 'Role assumed by GitHub Actions for artifact bucket access',
    });

    // AwsSolutions-IAM5 対策（GitHub Actions 用ロールの最小権限化）:
    // `grantReadWrite` は `s3:GetObject*` / `s3:List*` などのワイルドカード Action を含むため、
    // Workflow で実際に使う S3 操作だけを明示する。
    // 参照ワークフロー: `.github/workflows/artifact.yml`
    // - aws s3 ls
    // - aws s3 sync dist/ s3://.../artifacts/${GITHUB_SHA}/
    // - aws s3 cp - s3://.../artifacts/${GITHUB_SHA}/_COMPLETE
    // - aws s3 cp - s3://.../tags/staging_latest.txt
    //なぜ最小といえるか　- ListBucket はバケットの存在確認とオブジェクトキーの列挙に必要ですが、特定のプレフィックスでの列挙を許可することはできないため、バケット全体に対して ListBucket を許可します。
    // - GetBucketLocation はリージョン確認のために必要
    // - GetObject / PutObject / DeleteObject / AbortMultipartUpload / ListMultipartUploadParts はオブジェクトのアップロードと管理に必要で、これらはオブジェクトレベルのリソース指定が必要なため、ARN末尾に `/*` を付けてバケット内の全オブジェクトを対象とします。
    // これらのアクションは、GitHub Actionsがビルド成果物をバケットにアップロードし、必要に応じて管理するために必要な最小限の権限セットです。
    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [artifactBucket.bucketArn],
      }),
    );

    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:AbortMultipartUpload',
          's3:ListMultipartUploadParts',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
      }),
    );

    // AwsSolutions-IAM5（Resource wildcard）限定 suppress:
    // Object レベルの S3 操作は ARN 末尾 `/*` が必要（オブジェクトキーを列挙できないため）。
    // Action は明示列挙済みで wildcard を使っていないため、Resource のみを限定 suppress する。
    NagSuppressions.addResourceSuppressions(
      githubRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'GitHub Actions uploads build outputs under dynamic object keys (commit SHA paths), which requires object-level resource wildcard while actions are explicitly scoped.',
          appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
        },
      ],
      true,
    );

    // S3クロスリージョンレプリケーションの設定
    const replicationRole = new iam.Role(this, 'S3ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      description: 'Role used by S3 to replicate objects to the secondary region bucket',
    });
    // レプリケーションに必要な権限をロールに付与
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetReplicationConfiguration',
          's3:ListBucket',
        ],
        resources: [artifactBucket.bucketArn],
      }),
    );
    // オブジェクトのレプリケーションに必要な権限をロールに付与
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObjectVersionForReplication',
          's3:GetObjectVersionAcl',
          's3:GetObjectVersionTagging',
        ],
        resources: [`${artifactBucket.bucketArn}/*`],
      }),
    );
    // レプリケーション先のバケットに対する権限をロールに付与
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:ReplicateObject',
          's3:ReplicateDelete',
          's3:ReplicateTags',
        ],
        resources: [`${props.secondaryBucketArn}/*`],
      }),
    );

    // AwsSolutions-IAM5（Replication Role の Resource wildcard）限定 suppress:
    // 全量クロスリージョンレプリケーション要件では object-level の `/*` が必要。
    // レプリケーション対象をプレフィックス限定しない現行仕様のため、Resource のみを限定 suppress する。
    NagSuppressions.addResourceSuppressions(
      replicationRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Cross-region replication is configured for all objects, which requires object-level wildcard resources in source and destination bucket ARNs.',
          appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
        },
      ],
      true,
    );
    // S3クロスリージョンレプリケーションの設定をバケットに追加
    const cfnBucket = artifactBucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      // 定数を使用してレプリケーションルールを定義
      rules: [
        {
          // ルールIDは任意の文字列で、複数ルールがある場合は一意である必要があります
          id: 'CrossRegionReplicationRule',
          // ルールを有効にする
          status: 'Enabled',
          // レプリケーションの優先順位（複数ルールがある場合に適用される順序を定義）
          priority: 1,
          // レプリケーションの対象を指定（この例では全てのオブジェクトをレプリケーション）
          filter: {
            prefix: '',
          },
          // バージョニングが有効なバケットの場合、削除マーカーもレプリケーションする設定
          deleteMarkerReplication: {
            status: 'Enabled',
          },
          // レプリケーションの宛先を指定（セカンダリバケットのARNを使用）
          destination: {
            bucket: props.secondaryBucketArn,
          },
        },
      ],
    };
    // レプリケーション設定の依存関係を明示的に追加（CDKが自動的に処理することもありますが、明示的にすることで確実に順序が保証されます）
    cfnBucket.addDependency(replicationRole.node.defaultChild as iam.CfnRole);
    // バケット名を出力
    new cdk.CfnOutput(this, 'BucketNameExport', {
      value: artifactBucket.bucketName,
    });
    // GitHub ActionsロールのARNを出力

    new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
      value: githubRole.roleArn,
    });
    // レプリケーション先バケットのARNを出力
    new cdk.CfnOutput(this, 'ReplicationDestinationBucketArn', {
      value: props.secondaryBucketArn,
    });

    this.node.addValidation({
      // スタック全体のバリデーションルールを定義
      validate: (): string[] => {
        const errors: string[] = [];
        // 環境名のバリデーション
        if (!ENV_NAME_REGEX.test(envName)) {
          errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
        }
        // GitHub OIDCのプレースホルダー値を使用している場合は、prod環境ではエラーとする（prod環境でプレースホルダーは許可しない）
        if (
          envName === 'prod' &&
          (
            githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
            githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO
          )
        ) {
          errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
        }
        // セカンダリバケットARNのバリデーション
        const expectedSecondaryBucketName = `${STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${this.account}`;
        const secondaryBucketName = toBucketNameFromArn(props.secondaryBucketArn);
        if (secondaryBucketName !== expectedSecondaryBucketName) {
          errors.push(
            `secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`,
          );
        }
        // レプリケーション設定のバリデーション
        const replicationConfig = cfnBucket.replicationConfiguration as s3.CfnBucket.ReplicationConfigurationProperty | undefined;
        if (!replicationConfig?.role) {
          errors.push('S3 replication configuration must include a role ARN.');
        }
        const replicationRules = replicationConfig?.rules;
        if (!Array.isArray(replicationRules) || replicationRules.length === 0) {
          errors.push('S3 replication configuration must include at least one enabled rule.');
        }

        return errors;
      },
    });
  }
}