import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

// 設定値をオブジェクトにまとめる（マジックナンバーの排除）
const STORAGE_CONFIG = {
  RETENTION_DAYS: 30,
  HISTORY_RETENTION_DAYS: 7,
  BUCKET_PREFIX: 'bevy-artifacts',
  LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
} as const;
const ACCOUNT_ID_REGEX = /^\d{12}$/;
const ENV_NAME_REGEX = /^(dev|test|stg|prod)$/;
const GITHUB_OWNER_REGEX = /^[A-Za-z0-9-]+$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9._-]+$/;
const GITHUB_BRANCH_REGEX = /^(?!\/)(?!.*\/\/)(?!.*\/$)[A-Za-z0-9._/-]+$/;
const GITHUB_BRANCH_WILDCARD_REGEX = /[?*\[]/;
const S3_BUCKET_ARN_REGEX = /^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

interface BevyPlatformInfraStackProps extends cdk.StackProps {
  secondaryBucketArn: string;
}
//GitHub OIDCの設定も定数オブジェクトにまとめる
const GITHUB_OIDC_CONFIG = {
  PROVIDER_URL: 'https://token.actions.githubusercontent.com',
  CLIENT_ID: 'sts.amazonaws.com',
  THUMBPRINT: '6938fd4d98bab03faadb97b34396831e3780a188',
  DEFAULT_BRANCHES: ['main', 'master'],
  PLACEHOLDER_OWNER: '<github-owner>',
  PLACEHOLDER_REPO: '<github-repo>',
} as const;

// 入力値のバリデーション関数を定義
function validateSecondaryBucketArn(secondaryBucketArn: string): void {
  if (!S3_BUCKET_ARN_REGEX.test(secondaryBucketArn)) {
    throw new Error('secondaryBucketArn must be a valid S3 bucket ARN (e.g. arn:aws:s3:::my-bucket).');
  }
}
//

function toBucketNameFromArn(bucketArn: string): string {
  return bucketArn.replace('arn:aws:s3:::', '');
}
// GitHub OIDCのコンテキスト値のバリデーション関数を定義
function validateGitHubOidcContext(githubOwner?: string, githubRepo?: string, githubBranch?: string): void {
  if (githubOwner !== undefined && !GITHUB_OWNER_REGEX.test(githubOwner)) {
    throw new Error('githubOwner must contain only letters, numbers, and hyphens.');
  }

  // GitHubリポジトリ名は、英数字、ドット、アンダースコア、ハイフンを含むことができますが、スペースやその他の特殊文字は許可されません。
  if (githubRepo !== undefined && !GITHUB_REPO_REGEX.test(githubRepo)) {
    throw new Error('githubRepo must contain only letters, numbers, dots, underscores, and hyphens.');
  }
// GitHubブランチ名は、リファレンスセグメントとして有効である必要があります。ワイルドカード文字も許可されません。
  if (githubBranch !== undefined) {
    if (githubBranch.length === 0) {
      throw new Error('githubBranch must not be empty.');
    }
// ワイルドカード文字（*、?、[）が含まれている場合はエラー
    if (GITHUB_BRANCH_WILDCARD_REGEX.test(githubBranch)) {
      throw new Error('githubBranch must not contain wildcard characters (*, ?, [).');
    }
// ブランチ名がリファレンスセグメントとして有効であるかを正規表現で検証
    if (!GITHUB_BRANCH_REGEX.test(githubBranch)) {
      throw new Error('githubBranch must be a valid ref segment (e.g. main, release/v1.2.3).');
    }
  }
}

// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
export class BevyPlatformInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BevyPlatformInfraStackProps) {
    // AWSアカウントIDが明示的に指定されているか、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARNを検証
    const hasExplicitAccount = Object.prototype.hasOwnProperty.call(props.env ?? {}, 'account');
    const explicitAccount = props.env?.account;
    if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
      throw new Error(
        'env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.',
      );
    }
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

    const artifactAccessLogBucket = new s3.Bucket(this, 'BevyArtifactAccessLogBucket', {
      bucketName: `${STORAGE_CONFIG.LOG_BUCKET_PREFIX}-${envName}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // AwsSolutions-S10 対策:
      // アクセスログ専用バケットであっても、バケットポリシーで HTTPS(TLS) 以外の
      // リクエスト（aws:SecureTransport=false）を拒否することが求められる。
      // BevyArtifactBucket と同じ方針で enforceSSL を有効化する。
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // cdk-nagでS3アクセスログバケットに対する警告を抑制（このバケットはアクセスログ専用で、さらにアクセスログのネストを避けるためにサーバーアクセスログを無効にしているため）
    NagSuppressions.addResourceSuppressions(
      artifactAccessLogBucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'This bucket stores S3 access logs for BevyArtifactBucket and does not require nested server access logging.',
        },
      ],
      true,
    );

    const artifactBucket = new s3.Bucket(this, 'BevyArtifactBucket', {
      // 環境名とアカウントIDを組み合わせて一意性を担保
      bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-${this.account}`,
      
      // セキュリティ強化のための設定を追加
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // S3マネージド暗号化を有効にして、保存データを暗号化する
      encryption: s3.BucketEncryption.S3_MANAGED,
      // AwsSolutions-S10 対策:
      // この設定を有効化すると、CDK がバケットポリシーに
      // 「aws:SecureTransport が false（=HTTP通信）のリクエストを拒否」する
      // Deny ルールを自動生成する。
      // これにより、当該バケットへのアクセスを HTTPS(TLS) のみに制限できる。
      enforceSSL: true,
      // バージョニングを有効にして、誤って削除されたオブジェクトの復元を可能にする
      versioned: true,
      // スタック削除時にバケットも削除する設定（本番環境では注意が必要）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // バケット削除時にオブジェクトも削除する設定（本番環境では注意が必要）
      autoDeleteObjects: true,

      /* そのほか追加可能な設定
          ・アクセスログの設定
          ・特定のリージョンにレプリケーションする設定
          ・ライフサイクルルールで特定のプレフィックスやタグに基づいてオブジェクトを管理する設定
          ・アクセスコントロールリスト（ACL）やバケットポリシーで細かいアクセス制御を設定することも可能
          など
          詳しくは下記のURLを参照 
          https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketProps.html
       */

      // ライフサイクルルールを追加して古いオブジェクトを自動的に削除
      lifecycleRules: [
        {
          id: 'ExpireOldBuilds',
          enabled: true,
          // 定数を使用
          expiration: cdk.Duration.days(STORAGE_CONFIG.RETENTION_DAYS),
          noncurrentVersionExpiration: cdk.Duration.days(STORAGE_CONFIG.HISTORY_RETENTION_DAYS),
        }
      ],
      // アクセスログの設定これがないとs1の警告が出る。
      serverAccessLogsBucket: artifactAccessLogBucket,
      serverAccessLogsPrefix: 'access-logs/',
    });
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