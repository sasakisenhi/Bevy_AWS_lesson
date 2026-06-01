"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BevyPlatformInfraStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cdk_nag_1 = require("cdk-nag");
// 設定値をオブジェクトにまとめる（マジックナンバーの排除）
const STORAGE_CONFIG = {
    RETENTION_DAYS: 30,
    HISTORY_RETENTION_DAYS: 7,
    BUCKET_PREFIX: 'bevy-artifacts',
    LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
};
const ACCOUNT_ID_REGEX = /^\d{12}$/;
const GITHUB_OWNER_REGEX = /^[A-Za-z0-9-]+$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9._-]+$/;
const GITHUB_BRANCH_REGEX = /^(?!\/)(?!.*\/\/)(?!.*\/$)[A-Za-z0-9._/-]+$/;
const GITHUB_BRANCH_WILDCARD_REGEX = /[?*\[]/;
const S3_BUCKET_ARN_REGEX = /^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
//GitHub OIDCの設定も定数オブジェクトにまとめる
const GITHUB_OIDC_CONFIG = {
    PROVIDER_URL: 'https://token.actions.githubusercontent.com',
    CLIENT_ID: 'sts.amazonaws.com',
    THUMBPRINT: '6938fd4d98bab03faadb97b34396831e3780a188',
    DEFAULT_BRANCHES: ['main', 'master'],
    PLACEHOLDER_OWNER: '<github-owner>',
    PLACEHOLDER_REPO: '<github-repo>',
};
function validateSecondaryBucketArn(secondaryBucketArn) {
    if (!S3_BUCKET_ARN_REGEX.test(secondaryBucketArn)) {
        throw new Error('secondaryBucketArn must be a valid S3 bucket ARN (e.g. arn:aws:s3:::my-bucket).');
    }
}
function validateGitHubOidcContext(githubOwner, githubRepo, githubBranch) {
    if (githubOwner !== undefined && !GITHUB_OWNER_REGEX.test(githubOwner)) {
        throw new Error('githubOwner must contain only letters, numbers, and hyphens.');
    }
    if (githubRepo !== undefined && !GITHUB_REPO_REGEX.test(githubRepo)) {
        throw new Error('githubRepo must contain only letters, numbers, dots, underscores, and hyphens.');
    }
    if (githubBranch !== undefined) {
        if (githubBranch.length === 0) {
            throw new Error('githubBranch must not be empty.');
        }
        if (GITHUB_BRANCH_WILDCARD_REGEX.test(githubBranch)) {
            throw new Error('githubBranch must not contain wildcard characters (*, ?, [).');
        }
        if (!GITHUB_BRANCH_REGEX.test(githubBranch)) {
            throw new Error('githubBranch must be a valid ref segment (e.g. main, release/v1.2.3).');
        }
    }
}
// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に指定されているか、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARNを検証
        const hasExplicitAccount = Object.prototype.hasOwnProperty.call(props.env ?? {}, 'account');
        const explicitAccount = props.env?.account;
        if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
            throw new Error('env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.');
        }
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
        validateGitHubOidcContext(githubOwnerFromContext, githubRepoFromContext, githubBranch);
        const githubOwner = githubOwnerFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER;
        const githubRepo = githubRepoFromContext || GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO;
        const githubBranches = githubBranch
            ? [String(githubBranch)]
            : GITHUB_OIDC_CONFIG.DEFAULT_BRANCHES;
        // 既存のARNが明示的に指定されている場合、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARN
        const existingProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
        const githubSubs = githubBranches.map((branch) => `repo:${githubOwner}/${githubRepo}:ref:refs/heads/${branch}`);
        // GitHub OIDCの設定がプレースホルダーのままの場合は警告を出す
        if (githubOwner === GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
            githubRepo === GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO) {
            cdk.Annotations.of(this).addWarning('GitHub OIDC trust is using placeholders. Pass -c githubOwner=<owner> -c githubRepo=<repo> and optionally -c githubBranch=<branch> before deployment.');
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
        cdk_nag_1.NagSuppressions.addResourceSuppressions(artifactAccessLogBucket, [
            {
                id: 'AwsSolutions-S1',
                reason: 'This bucket stores S3 access logs for BevyArtifactBucket and does not require nested server access logging.',
            },
        ], true);
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
        const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubProvider', existingProviderArn);
        // GitHub Actionsが特定のリポジトリとブランチからのみロールを引き受けられるようにする
        const githubRole = new iam.Role(this, 'GithubActionsRole', {
            assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
                StringEquals: {
                    'token.actions.githubusercontent.com:aud': GITHUB_OIDC_CONFIG.CLIENT_ID,
                },
                StringLike: {
                    'token.actions.githubusercontent.com:sub': githubSubs,
                },
            }),
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
        githubRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:ListBucket',
                's3:GetBucketLocation',
            ],
            resources: [artifactBucket.bucketArn],
        }));
        githubRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:AbortMultipartUpload',
                's3:ListMultipartUploadParts',
            ],
            resources: [`${artifactBucket.bucketArn}/*`],
        }));
        // AwsSolutions-IAM5（Resource wildcard）限定 suppress:
        // Object レベルの S3 操作は ARN 末尾 `/*` が必要（オブジェクトキーを列挙できないため）。
        // Action は明示列挙済みで wildcard を使っていないため、Resource のみを限定 suppress する。
        cdk_nag_1.NagSuppressions.addResourceSuppressions(githubRole, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'GitHub Actions uploads build outputs under dynamic object keys (commit SHA paths), which requires object-level resource wildcard while actions are explicitly scoped.',
                appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
            },
        ], true);
        // S3クロスリージョンレプリケーションの設定
        const replicationRole = new iam.Role(this, 'S3ReplicationRole', {
            assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
            description: 'Role used by S3 to replicate objects to the secondary region bucket',
        });
        // レプリケーションに必要な権限をロールに付与
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetReplicationConfiguration',
                's3:ListBucket',
            ],
            resources: [artifactBucket.bucketArn],
        }));
        // オブジェクトのレプリケーションに必要な権限をロールに付与
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetObjectVersionForReplication',
                's3:GetObjectVersionAcl',
                's3:GetObjectVersionTagging',
            ],
            resources: [`${artifactBucket.bucketArn}/*`],
        }));
        // レプリケーション先のバケットに対する権限をロールに付与
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:ReplicateObject',
                's3:ReplicateDelete',
                's3:ReplicateTags',
            ],
            resources: [`${props.secondaryBucketArn}/*`],
        }));
        // AwsSolutions-IAM5（Replication Role の Resource wildcard）限定 suppress:
        // 全量クロスリージョンレプリケーション要件では object-level の `/*` が必要。
        // レプリケーション対象をプレフィックス限定しない現行仕様のため、Resource のみを限定 suppress する。
        cdk_nag_1.NagSuppressions.addResourceSuppressions(replicationRole, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'Cross-region replication is configured for all objects, which requires object-level wildcard resources in source and destination bucket ARNs.',
                appliesTo: [{ regex: '/^Resource::.*\\/\\*$/' }],
            },
        ], true);
        // S3クロスリージョンレプリケーションの設定をバケットに追加
        const cfnBucket = artifactBucket.node.defaultChild;
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
        cfnBucket.addDependency(replicationRole.node.defaultChild);
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
    }
}
exports.BevyPlatformInfraStack = BevyPlatformInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MscUNBQTBDO0FBRTFDLCtCQUErQjtBQUMvQixNQUFNLGNBQWMsR0FBRztJQUNyQixjQUFjLEVBQUUsRUFBRTtJQUNsQixzQkFBc0IsRUFBRSxDQUFDO0lBQ3pCLGFBQWEsRUFBRSxnQkFBZ0I7SUFDL0IsaUJBQWlCLEVBQUUscUJBQXFCO0NBQ2hDLENBQUM7QUFDWCxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztBQUNwQyxNQUFNLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDO0FBQzdDLE1BQU0saUJBQWlCLEdBQUcsbUJBQW1CLENBQUM7QUFDOUMsTUFBTSxtQkFBbUIsR0FBRyw2Q0FBNkMsQ0FBQztBQUMxRSxNQUFNLDRCQUE0QixHQUFHLFFBQVEsQ0FBQztBQUM5QyxNQUFNLG1CQUFtQixHQUFHLGlEQUFpRCxDQUFDO0FBSzlFLDhCQUE4QjtBQUM5QixNQUFNLGtCQUFrQixHQUFHO0lBQ3pCLFlBQVksRUFBRSw2Q0FBNkM7SUFDM0QsU0FBUyxFQUFFLG1CQUFtQjtJQUM5QixVQUFVLEVBQUUsMENBQTBDO0lBQ3RELGdCQUFnQixFQUFFLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQztJQUNwQyxpQkFBaUIsRUFBRSxnQkFBZ0I7SUFDbkMsZ0JBQWdCLEVBQUUsZUFBZTtDQUN6QixDQUFDO0FBRVgsU0FBUywwQkFBMEIsQ0FBQyxrQkFBMEI7SUFDNUQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7UUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpRkFBaUYsQ0FBQyxDQUFDO0lBQ3JHLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FBQyxXQUFvQixFQUFFLFVBQW1CLEVBQUUsWUFBcUI7SUFDakcsSUFBSSxXQUFXLEtBQUssU0FBUyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDdkUsTUFBTSxJQUFJLEtBQUssQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxJQUFJLFVBQVUsS0FBSyxTQUFTLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUNwRSxNQUFNLElBQUksS0FBSyxDQUFDLGdGQUFnRixDQUFDLENBQUM7SUFDcEcsQ0FBQztJQUVELElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQy9CLElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELElBQUksNEJBQTRCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFDcEQsTUFBTSxJQUFJLEtBQUssQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO1FBQ2xGLENBQUM7UUFFRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO1FBQzNGLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQUVELHNEQUFzRDtBQUN0RCxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25ELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0M7UUFDMUUsbUVBQW1FO1FBQ25FLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDO1FBQzNDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3ZGLE1BQU0sSUFBSSxLQUFLLENBQ2IsK0dBQStHLENBQ2hILENBQUM7UUFDSixDQUFDO1FBRUQsMEJBQTBCLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFckQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsd0JBQXdCO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUN4RCx5Q0FBeUM7UUFDekMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRSxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFcEUsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDekcsTUFBTSxxQkFBcUIsR0FBRyxpQkFBaUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdEcsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRWpHLHlCQUF5QixDQUFDLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRXZGLE1BQU0sV0FBVyxHQUFHLHNCQUFzQixJQUFJLGtCQUFrQixDQUFDLGlCQUFpQixDQUFDO1FBQ25GLE1BQU0sVUFBVSxHQUFHLHFCQUFxQixJQUFJLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDO1FBQ2hGLE1BQU0sY0FBYyxHQUFHLFlBQVk7WUFDakMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3hCLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQztRQUV4Qyw2REFBNkQ7UUFDN0QsTUFBTSxtQkFBbUIsR0FBRyxnQkFBZ0IsSUFBSSxDQUFDLE9BQU8sb0RBQW9ELENBQUM7UUFFN0csTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FDbkMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFFBQVEsV0FBVyxJQUFJLFVBQVUsbUJBQW1CLE1BQU0sRUFBRSxDQUN6RSxDQUFDO1FBRUYsc0NBQXNDO1FBQ3RDLElBQ0UsV0FBVyxLQUFLLGtCQUFrQixDQUFDLGlCQUFpQjtZQUNwRCxVQUFVLEtBQUssa0JBQWtCLENBQUMsZ0JBQWdCLEVBQ2xELENBQUM7WUFDRCxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQ2pDLHNKQUFzSixDQUN2SixDQUFDO1FBQ0osQ0FBQztRQUNELHNCQUFzQjtRQUV0QixNQUFNLHVCQUF1QixHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDakYsVUFBVSxFQUFFLEdBQUcsY0FBYyxDQUFDLGlCQUFpQixJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzVFLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyx1QkFBdUI7WUFDdkIsNkNBQTZDO1lBQzdDLGlEQUFpRDtZQUNqRCwrQ0FBK0M7WUFDL0MsVUFBVSxFQUFFLElBQUk7WUFDaEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQztRQUNILDJGQUEyRjtRQUMzRix5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyx1QkFBdUIsRUFDdkI7WUFDRTtnQkFDRSxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixNQUFNLEVBQUUsNkdBQTZHO2FBQ3RIO1NBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUVGLE1BQU0sY0FBYyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDL0QsMkJBQTJCO1lBQzNCLFVBQVUsRUFBRSxHQUFHLGNBQWMsQ0FBQyxhQUFhLElBQUksT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFFeEUsb0JBQW9CO1lBQ3BCLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELCtCQUErQjtZQUMvQixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsdUJBQXVCO1lBQ3ZCLDZCQUE2QjtZQUM3QixvREFBb0Q7WUFDcEQsbUJBQW1CO1lBQ25CLDJDQUEyQztZQUMzQyxVQUFVLEVBQUUsSUFBSTtZQUNoQix3Q0FBd0M7WUFDeEMsU0FBUyxFQUFFLElBQUk7WUFDZixtQ0FBbUM7WUFDbkMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxxQ0FBcUM7WUFDckMsaUJBQWlCLEVBQUUsSUFBSTtZQUV2Qjs7Ozs7Ozs7ZUFRRztZQUVILGlDQUFpQztZQUNqQyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsUUFBUTtvQkFDUixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQztvQkFDNUQsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDO2lCQUN0RjthQUNGO1lBQ0QsMkJBQTJCO1lBQzNCLHNCQUFzQixFQUFFLHVCQUF1QjtZQUMvQyxzQkFBc0IsRUFBRSxjQUFjO1NBQ3ZDLENBQUMsQ0FBQztRQUNILHlDQUF5QztRQUN6QyxxRkFBcUY7UUFDckYsc0VBQXNFO1FBQ3RFLDRFQUE0RTtRQUU1RSxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMscUJBQXFCLENBQUMsNEJBQTRCLENBQzNFLElBQUksRUFDSixnQkFBZ0IsRUFDaEIsbUJBQW1CLENBQ3BCLENBQUM7UUFDRixtREFBbUQ7UUFDbkQsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN6RCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsb0JBQW9CLENBQ3JDLGNBQWMsQ0FBQyx3QkFBd0IsRUFDdkM7Z0JBQ0UsWUFBWSxFQUFFO29CQUNaLHlDQUF5QyxFQUFFLGtCQUFrQixDQUFDLFNBQVM7aUJBQ3hFO2dCQUNELFVBQVUsRUFBRTtvQkFDVix5Q0FBeUMsRUFBRSxVQUFVO2lCQUN0RDthQUNGLENBQ0Y7WUFDRCxXQUFXLEVBQUUsMkRBQTJEO1NBQ3pFLENBQUMsQ0FBQztRQUVILG1EQUFtRDtRQUNuRCwyRUFBMkU7UUFDM0UsZ0NBQWdDO1FBQ2hDLDZDQUE2QztRQUM3QyxjQUFjO1FBQ2Qsd0RBQXdEO1FBQ3hELDJEQUEyRDtRQUMzRCxpREFBaUQ7UUFDakQsZ0hBQWdIO1FBQ2hILHFDQUFxQztRQUNyQyxrTEFBa0w7UUFDbEwsNkVBQTZFO1FBQzdFLFVBQVUsQ0FBQyxXQUFXLENBQ3BCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixPQUFPLEVBQUU7Z0JBQ1AsZUFBZTtnQkFDZixzQkFBc0I7YUFDdkI7WUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO1NBQ3RDLENBQUMsQ0FDSCxDQUFDO1FBRUYsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE9BQU8sRUFBRTtnQkFDUCxjQUFjO2dCQUNkLGNBQWM7Z0JBQ2QsaUJBQWlCO2dCQUNqQix5QkFBeUI7Z0JBQ3pCLDZCQUE2QjthQUM5QjtZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsY0FBYyxDQUFDLFNBQVMsSUFBSSxDQUFDO1NBQzdDLENBQUMsQ0FDSCxDQUFDO1FBRUYsbURBQW1EO1FBQ25ELHlEQUF5RDtRQUN6RCxpRUFBaUU7UUFDakUseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsVUFBVSxFQUNWO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHVLQUF1SztnQkFDL0ssU0FBUyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQzthQUNqRDtTQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7UUFFRix3QkFBd0I7UUFDeEIsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM5RCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUM7WUFDdkQsV0FBVyxFQUFFLHFFQUFxRTtTQUNuRixDQUFDLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE9BQU8sRUFBRTtnQkFDUCxnQ0FBZ0M7Z0JBQ2hDLGVBQWU7YUFDaEI7WUFDRCxTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO1NBQ3RDLENBQUMsQ0FDSCxDQUFDO1FBQ0YsK0JBQStCO1FBQy9CLGVBQWUsQ0FBQyxXQUFXLENBQ3pCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixPQUFPLEVBQUU7Z0JBQ1AsbUNBQW1DO2dCQUNuQyx3QkFBd0I7Z0JBQ3hCLDRCQUE0QjthQUM3QjtZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsY0FBYyxDQUFDLFNBQVMsSUFBSSxDQUFDO1NBQzdDLENBQUMsQ0FDSCxDQUFDO1FBQ0YsOEJBQThCO1FBQzlCLGVBQWUsQ0FBQyxXQUFXLENBQ3pCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixPQUFPLEVBQUU7Z0JBQ1Asb0JBQW9CO2dCQUNwQixvQkFBb0I7Z0JBQ3BCLGtCQUFrQjthQUNuQjtZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLGtCQUFrQixJQUFJLENBQUM7U0FDN0MsQ0FBQyxDQUNILENBQUM7UUFFRixzRUFBc0U7UUFDdEUsa0RBQWtEO1FBQ2xELDZEQUE2RDtRQUM3RCx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxlQUFlLEVBQ2Y7WUFDRTtnQkFDRSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsK0lBQStJO2dCQUN2SixTQUFTLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO2FBQ2pEO1NBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUNGLGdDQUFnQztRQUNoQyxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQTRCLENBQUM7UUFDbkUsU0FBUyxDQUFDLHdCQUF3QixHQUFHO1lBQ25DLElBQUksRUFBRSxlQUFlLENBQUMsT0FBTztZQUM3Qix3QkFBd0I7WUFDeEIsS0FBSyxFQUFFO2dCQUNMO29CQUNFLHdDQUF3QztvQkFDeEMsRUFBRSxFQUFFLDRCQUE0QjtvQkFDaEMsWUFBWTtvQkFDWixNQUFNLEVBQUUsU0FBUztvQkFDakIsdUNBQXVDO29CQUN2QyxRQUFRLEVBQUUsQ0FBQztvQkFDWCwwQ0FBMEM7b0JBQzFDLE1BQU0sRUFBRTt3QkFDTixNQUFNLEVBQUUsRUFBRTtxQkFDWDtvQkFDRCx5Q0FBeUM7b0JBQ3pDLHVCQUF1QixFQUFFO3dCQUN2QixNQUFNLEVBQUUsU0FBUztxQkFDbEI7b0JBQ0QsbUNBQW1DO29CQUNuQyxXQUFXLEVBQUU7d0JBQ1gsTUFBTSxFQUFFLEtBQUssQ0FBQyxrQkFBa0I7cUJBQ2pDO2lCQUNGO2FBQ0Y7U0FDRixDQUFDO1FBQ0YscUVBQXFFO1FBQ3JFLFNBQVMsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxZQUEyQixDQUFDLENBQUM7UUFDMUUsV0FBVztRQUNYLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVO1NBQ2pDLENBQUMsQ0FBQztRQUNILDJCQUEyQjtRQUUzQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxVQUFVLENBQUMsT0FBTztTQUMxQixDQUFDLENBQUM7UUFDSCx1QkFBdUI7UUFDdkIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUN6RCxLQUFLLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtTQUNoQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyU0Qsd0RBcVNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gJ2Nkay1uYWcnO1xuXG4vLyDoqK3lrprlgKTjgpLjgqrjg5bjgrjjgqfjgq/jg4jjgavjgb7jgajjgoHjgovvvIjjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjga7mjpLpmaTvvIlcbmNvbnN0IFNUT1JBR0VfQ09ORklHID0ge1xuICBSRVRFTlRJT05fREFZUzogMzAsXG4gIEhJU1RPUllfUkVURU5USU9OX0RBWVM6IDcsXG4gIEJVQ0tFVF9QUkVGSVg6ICdiZXZ5LWFydGlmYWN0cycsXG4gIExPR19CVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMtbG9ncycsXG59IGFzIGNvbnN0O1xuY29uc3QgQUNDT1VOVF9JRF9SRUdFWCA9IC9eXFxkezEyfSQvO1xuY29uc3QgR0lUSFVCX09XTkVSX1JFR0VYID0gL15bQS1aYS16MC05LV0rJC87XG5jb25zdCBHSVRIVUJfUkVQT19SRUdFWCA9IC9eW0EtWmEtejAtOS5fLV0rJC87XG5jb25zdCBHSVRIVUJfQlJBTkNIX1JFR0VYID0gL14oPyFcXC8pKD8hLipcXC9cXC8pKD8hLipcXC8kKVtBLVphLXowLTkuXy8tXSskLztcbmNvbnN0IEdJVEhVQl9CUkFOQ0hfV0lMRENBUkRfUkVHRVggPSAvWz8qXFxbXS87XG5jb25zdCBTM19CVUNLRVRfQVJOX1JFR0VYID0gL15hcm46YXdzOnMzOjo6W2EtejAtOV1bYS16MC05Li1dezEsNjF9W2EtejAtOV0kLztcblxuaW50ZXJmYWNlIEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc2Vjb25kYXJ5QnVja2V0QXJuOiBzdHJpbmc7XG59XG4vL0dpdEh1YiBPSURD44Gu6Kit5a6a44KC5a6a5pWw44Kq44OW44K444Kn44Kv44OI44Gr44G+44Go44KB44KLXG5jb25zdCBHSVRIVUJfT0lEQ19DT05GSUcgPSB7XG4gIFBST1ZJREVSX1VSTDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICBDTElFTlRfSUQ6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gIFRIVU1CUFJJTlQ6ICc2OTM4ZmQ0ZDk4YmFiMDNmYWFkYjk3YjM0Mzk2ODMxZTM3ODBhMTg4JyxcbiAgREVGQVVMVF9CUkFOQ0hFUzogWydtYWluJywgJ21hc3RlciddLFxuICBQTEFDRUhPTERFUl9PV05FUjogJzxnaXRodWItb3duZXI+JyxcbiAgUExBQ0VIT0xERVJfUkVQTzogJzxnaXRodWItcmVwbz4nLFxufSBhcyBjb25zdDtcblxuZnVuY3Rpb24gdmFsaWRhdGVTZWNvbmRhcnlCdWNrZXRBcm4oc2Vjb25kYXJ5QnVja2V0QXJuOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKCFTM19CVUNLRVRfQVJOX1JFR0VYLnRlc3Qoc2Vjb25kYXJ5QnVja2V0QXJuKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2Vjb25kYXJ5QnVja2V0QXJuIG11c3QgYmUgYSB2YWxpZCBTMyBidWNrZXQgQVJOIChlLmcuIGFybjphd3M6czM6OjpteS1idWNrZXQpLicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlR2l0SHViT2lkY0NvbnRleHQoZ2l0aHViT3duZXI/OiBzdHJpbmcsIGdpdGh1YlJlcG8/OiBzdHJpbmcsIGdpdGh1YkJyYW5jaD86IHN0cmluZyk6IHZvaWQge1xuICBpZiAoZ2l0aHViT3duZXIgIT09IHVuZGVmaW5lZCAmJiAhR0lUSFVCX09XTkVSX1JFR0VYLnRlc3QoZ2l0aHViT3duZXIpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdnaXRodWJPd25lciBtdXN0IGNvbnRhaW4gb25seSBsZXR0ZXJzLCBudW1iZXJzLCBhbmQgaHlwaGVucy4nKTtcbiAgfVxuXG4gIGlmIChnaXRodWJSZXBvICE9PSB1bmRlZmluZWQgJiYgIUdJVEhVQl9SRVBPX1JFR0VYLnRlc3QoZ2l0aHViUmVwbykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dpdGh1YlJlcG8gbXVzdCBjb250YWluIG9ubHkgbGV0dGVycywgbnVtYmVycywgZG90cywgdW5kZXJzY29yZXMsIGFuZCBoeXBoZW5zLicpO1xuICB9XG5cbiAgaWYgKGdpdGh1YkJyYW5jaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKGdpdGh1YkJyYW5jaC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2l0aHViQnJhbmNoIG11c3Qgbm90IGJlIGVtcHR5LicpO1xuICAgIH1cblxuICAgIGlmIChHSVRIVUJfQlJBTkNIX1dJTERDQVJEX1JFR0VYLnRlc3QoZ2l0aHViQnJhbmNoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnaXRodWJCcmFuY2ggbXVzdCBub3QgY29udGFpbiB3aWxkY2FyZCBjaGFyYWN0ZXJzICgqLCA/LCBbKS4nKTtcbiAgICB9XG5cbiAgICBpZiAoIUdJVEhVQl9CUkFOQ0hfUkVHRVgudGVzdChnaXRodWJCcmFuY2gpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dpdGh1YkJyYW5jaCBtdXN0IGJlIGEgdmFsaWQgcmVmIHNlZ21lbnQgKGUuZy4gbWFpbiwgcmVsZWFzZS92MS4yLjMpLicpO1xuICAgIH1cbiAgfVxufVxuXG4vLyDjg5fjg6njgqTjg57jg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOBqEdpdEh1YiBPSURD44Ot44O844Or44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5leHBvcnQgY2xhc3MgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrUHJvcHMpIHtcbiAgICAvLyBBV1PjgqLjgqvjgqbjg7Pjg4hJROOBjOaYjuekuueahOOBq+aMh+WumuOBleOCjOOBpuOBhOOCi+OBi+OAgeOBvuOBn+OBr0FXU+OCouOCq+OCpuODs+ODiOOBq+aXouOBq+ODl+ODreODkOOCpOODgOODvOOBjOWtmOWcqOOBmeOCi+OBqOaDs+WumuOBleOCjOOCi+WgtOWQiOOBrkFSTuOCkuaknOiovFxuICAgIGNvbnN0IGhhc0V4cGxpY2l0QWNjb3VudCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwcm9wcy5lbnYgPz8ge30sICdhY2NvdW50Jyk7XG4gICAgY29uc3QgZXhwbGljaXRBY2NvdW50ID0gcHJvcHMuZW52Py5hY2NvdW50O1xuICAgIGlmICghaGFzRXhwbGljaXRBY2NvdW50IHx8ICFleHBsaWNpdEFjY291bnQgfHwgIUFDQ09VTlRfSURfUkVHRVgudGVzdChleHBsaWNpdEFjY291bnQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdlbnYuYWNjb3VudCBtdXN0IGJlIGV4cGxpY2l0bHkgc2V0IHRvIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSUQuIFNldCBDREtfREVGQVVMVF9BQ0NPVU5UIGJlZm9yZSBzeW50aC9kZXBsb3kuJyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVTZWNvbmRhcnlCdWNrZXRBcm4ocHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuKTtcblxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8g5a6f6KGM5pmC44GrIC1jIGVudj1wcm9kIOOBqOa4oeOBm+OCi1xuICAgIGNvbnN0IGVudk5hbWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgpLjgrPjg7Pjg4bjgq3jgrnjg4jjgYvjgonlj5blvpfvvIjjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjgoLnlKjmhI/vvIlcbiAgICBjb25zdCBnaXRodWJPd25lckNvbnRleHQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViT3duZXInKTtcbiAgICBjb25zdCBnaXRodWJSZXBvQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJSZXBvJyk7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJCcmFuY2gnKTtcblxuICAgIGNvbnN0IGdpdGh1Yk93bmVyRnJvbUNvbnRleHQgPSBnaXRodWJPd25lckNvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJPd25lckNvbnRleHQpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGdpdGh1YlJlcG9Gcm9tQ29udGV4dCA9IGdpdGh1YlJlcG9Db250ZXh0ICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoZ2l0aHViUmVwb0NvbnRleHQpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IGdpdGh1YkJyYW5jaENvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJCcmFuY2hDb250ZXh0KSA6IHVuZGVmaW5lZDtcblxuICAgIHZhbGlkYXRlR2l0SHViT2lkY0NvbnRleHQoZ2l0aHViT3duZXJGcm9tQ29udGV4dCwgZ2l0aHViUmVwb0Zyb21Db250ZXh0LCBnaXRodWJCcmFuY2gpO1xuXG4gICAgY29uc3QgZ2l0aHViT3duZXIgPSBnaXRodWJPd25lckZyb21Db250ZXh0IHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUjtcbiAgICBjb25zdCBnaXRodWJSZXBvID0gZ2l0aHViUmVwb0Zyb21Db250ZXh0IHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaGVzID0gZ2l0aHViQnJhbmNoXG4gICAgICA/IFtTdHJpbmcoZ2l0aHViQnJhbmNoKV1cbiAgICAgIDogR0lUSFVCX09JRENfQ09ORklHLkRFRkFVTFRfQlJBTkNIRVM7XG4gICAgXG4gICAgLy8g5pei5a2Y44GuQVJO44GM5piO56S655qE44Gr5oyH5a6a44GV44KM44Gm44GE44KL5aC05ZCI44CB44G+44Gf44GvQVdT44Ki44Kr44Km44Oz44OI44Gr5pei44Gr44OX44Ot44OQ44Kk44OA44O844GM5a2Y5Zyo44GZ44KL44Go5oOz5a6a44GV44KM44KL5aC05ZCI44GuQVJOXG4gICAgY29uc3QgZXhpc3RpbmdQcm92aWRlckFybiA9IGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9Om9pZGMtcHJvdmlkZXIvdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb21gO1xuICAgIFxuICAgIGNvbnN0IGdpdGh1YlN1YnMgPSBnaXRodWJCcmFuY2hlcy5tYXAoXG4gICAgICAoYnJhbmNoKSA9PiBgcmVwbzoke2dpdGh1Yk93bmVyfS8ke2dpdGh1YlJlcG99OnJlZjpyZWZzL2hlYWRzLyR7YnJhbmNofWAsXG4gICAgKTtcblxuICAgIC8vIEdpdEh1YiBPSURD44Gu6Kit5a6a44GM44OX44Os44O844K544Ob44Or44OA44O844Gu44G+44G+44Gu5aC05ZCI44Gv6K2m5ZGK44KS5Ye644GZXG4gICAgaWYgKFxuICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICApIHtcbiAgICAgIGNkay5Bbm5vdGF0aW9ucy5vZih0aGlzKS5hZGRXYXJuaW5nKFxuICAgICAgICAnR2l0SHViIE9JREMgdHJ1c3QgaXMgdXNpbmcgcGxhY2Vob2xkZXJzLiBQYXNzIC1jIGdpdGh1Yk93bmVyPTxvd25lcj4gLWMgZ2l0aHViUmVwbz08cmVwbz4gYW5kIG9wdGlvbmFsbHkgLWMgZ2l0aHViQnJhbmNoPTxicmFuY2g+IGJlZm9yZSBkZXBsb3ltZW50LicsXG4gICAgICApO1xuICAgIH1cbiAgICAvLyDjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkFxuXG4gICAgY29uc3QgYXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCZXZ5QXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5MT0dfQlVDS0VUX1BSRUZJWH0tJHtlbnZOYW1lfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIC8vIEF3c1NvbHV0aW9ucy1TMTAg5a++562WOlxuICAgICAgLy8g44Ki44Kv44K744K544Ot44Kw5bCC55So44OQ44Kx44OD44OI44Gn44GC44Gj44Gm44KC44CB44OQ44Kx44OD44OI44Od44Oq44K344O844GnIEhUVFBTKFRMUykg5Lul5aSW44GuXG4gICAgICAvLyDjg6rjgq/jgqjjgrnjg4jvvIhhd3M6U2VjdXJlVHJhbnNwb3J0PWZhbHNl77yJ44KS5ouS5ZCm44GZ44KL44GT44Go44GM5rGC44KB44KJ44KM44KL44CCXG4gICAgICAvLyBCZXZ5QXJ0aWZhY3RCdWNrZXQg44Go5ZCM44GY5pa56Yed44GnIGVuZm9yY2VTU0wg44KS5pyJ5Yq55YyW44GZ44KL44CCXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuICAgIC8vIGNkay1uYWfjgadTM+OCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBq+WvvuOBmeOCi+itpuWRiuOCkuaKkeWItu+8iOOBk+OBruODkOOCseODg+ODiOOBr+OCouOCr+OCu+OCueODreOCsOWwgueUqOOBp+OAgeOBleOCieOBq+OCouOCr+OCu+OCueODreOCsOOBruODjeOCueODiOOCkumBv+OBkeOCi+OBn+OCgeOBq+OCteODvOODkOODvOOCouOCr+OCu+OCueODreOCsOOCkueEoeWKueOBq+OBl+OBpuOBhOOCi+OBn+OCge+8iVxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGFydGlmYWN0QWNjZXNzTG9nQnVja2V0LFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtUzEnLFxuICAgICAgICAgIHJlYXNvbjogJ1RoaXMgYnVja2V0IHN0b3JlcyBTMyBhY2Nlc3MgbG9ncyBmb3IgQmV2eUFydGlmYWN0QnVja2V0IGFuZCBkb2VzIG5vdCByZXF1aXJlIG5lc3RlZCBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcuJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldCcsIHtcbiAgICAgIC8vIOeSsOWig+WQjeOBqOOCouOCq+OCpuODs+ODiElE44KS57WE44G/5ZCI44KP44Gb44Gm5LiA5oSP5oCn44KS5ouF5L+dXG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYfS0ke2Vudk5hbWV9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBcbiAgICAgIC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOBruioreWumuOCkui/veWKoFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIC8vIFMz44Oe44ON44O844K444OJ5pqX5Y+35YyW44KS5pyJ5Yq544Gr44GX44Gm44CB5L+d5a2Y44OH44O844K/44KS5pqX5Y+35YyW44GZ44KLXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEwIOWvvuetljpcbiAgICAgIC8vIOOBk+OBruioreWumuOCkuacieWKueWMluOBmeOCi+OBqOOAgUNESyDjgYzjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgatcbiAgICAgIC8vIOOAjGF3czpTZWN1cmVUcmFuc3BvcnQg44GMIGZhbHNl77yIPUhUVFDpgJrkv6HvvInjga7jg6rjgq/jgqjjgrnjg4jjgpLmi5LlkKbjgI3jgZnjgotcbiAgICAgIC8vIERlbnkg44Or44O844Or44KS6Ieq5YuV55Sf5oiQ44GZ44KL44CCXG4gICAgICAvLyDjgZPjgozjgavjgojjgorjgIHlvZPoqbLjg5DjgrHjg4Pjg4jjgbjjga7jgqLjgq/jgrvjgrnjgpIgSFRUUFMoVExTKSDjga7jgb/jgavliLbpmZDjgafjgY3jgovjgIJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICAvLyDjg5Djg7zjgrjjg6fjg4vjg7PjgrDjgpLmnInlirnjgavjgZfjgabjgIHoqqTjgaPjgabliYrpmaTjgZXjgozjgZ/jgqrjg5bjgrjjgqfjgq/jg4jjga7lvqnlhYPjgpLlj6/og73jgavjgZnjgotcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIC8vIOOCueOCv+ODg+OCr+WJiumZpOaZguOBq+ODkOOCseODg+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIC8vIOODkOOCseODg+ODiOWJiumZpOaZguOBq+OCquODluOCuOOCp+OCr+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG5cbiAgICAgIC8qIOOBneOBruOBu+OBi+i/veWKoOWPr+iDveOBquioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueODreOCsOOBruioreWumlxuICAgICAgICAgIOODu+eJueWumuOBruODquODvOOCuOODp+ODs+OBq+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBmeOCi+ioreWumlxuICAgICAgICAgIOODu+ODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OBp+eJueWumuOBruODl+ODrOODleOCo+ODg+OCr+OCueOChOOCv+OCsOOBq+WfuuOBpeOBhOOBpuOCquODluOCuOOCp+OCr+ODiOOCkueuoeeQhuOBmeOCi+ioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueOCs+ODs+ODiOODreODvOODq+ODquOCueODiO+8iEFDTO+8ieOChOODkOOCseODg+ODiOODneODquOCt+ODvOOBp+e0sOOBi+OBhOOCouOCr+OCu+OCueWItuW+oeOCkuioreWumuOBmeOCi+OBk+OBqOOCguWPr+iDvVxuICAgICAgICAgIOOBquOBqVxuICAgICAgICAgIOips+OBl+OBj+OBr+S4i+iomOOBrlVSTOOCkuWPgueFpyBcbiAgICAgICAgICBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19zMy5CdWNrZXRQcm9wcy5odG1sXG4gICAgICAgKi9cblxuICAgICAgLy8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44KS6L+95Yqg44GX44Gm5Y+k44GE44Kq44OW44K444Kn44Kv44OI44KS6Ieq5YuV55qE44Gr5YmK6ZmkXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdFeHBpcmVPbGRCdWlsZHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgLy8g5a6a5pWw44KS5L2/55SoXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuUkVURU5USU9OX0RBWVMpLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuSElTVE9SWV9SRVRFTlRJT05fREFZUyksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICAvLyDjgqLjgq/jgrvjgrnjg63jgrDjga7oqK3lrprjgZPjgozjgYzjgarjgYTjgahzMeOBruitpuWRiuOBjOWHuuOCi+OAglxuICAgICAgc2VydmVyQWNjZXNzTG9nc0J1Y2tldDogYXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcbiAgICB9KTtcbiAgICAvLyDimIUg5L+u5q2j566H5omA77ya5bi444Gr5paw44GX44GE44OX44Ot44OQ44Kk44OA44O844KS5L2c44KL44Gu44Gn44Gv44Gq44GP44CB5pei5a2Y44GuQVJO44KS5Y+C54Wn44GZ44KLXG4gICAgLy8g5Yid5Zue5L2c5oiQ5pmC77yI44OX44Ot44OQ44Kk44OA44O844GM44Gq44GE54q25oWL77yJ44Gv44CBYGZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm5gIOOBp+OBr+OBquOBj+aWsOimj+S9nOaIkOOBmeOCi+OBi+OAgeOBvuOBn+OBr+S+i+WkluOCkuiAg+aFruOBmeOCi+W/heimgeOBjOOBguOCiuOBvuOBmeOBjOOAgVxuICAgIC8vIOaXouWtmOOBruOCqOODqeODvO+8iEVudGl0eUFscmVhZHlFeGlzdHNFeGNlcHRpb27vvInjgpLlm57pgb/jgZnjgovjgZ/jgoHjgIHjgZnjgafjgavlrZjlnKjjgZnjgovloLTlkIjjga/ml6LlrZjjga5BUk7jgaflj4LnhafjgZfjgb7jgZnjgIJcbiAgICAvLyBDREvjga7ntYTjgb/ovrzjgb/jg6Hjgr3jg4Pjg4kgYE9wZW5JZENvbm5lY3RQcm92aWRlci5mcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuYCDjgpLkvb/nlKjjgZfjgb7jgZnjgIJcblxuICAgIGNvbnN0IGdpdGh1YlByb3ZpZGVyID0gaWFtLk9wZW5JZENvbm5lY3RQcm92aWRlci5mcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuKFxuICAgICAgdGhpcyxcbiAgICAgICdHaXRodWJQcm92aWRlcicsXG4gICAgICBleGlzdGluZ1Byb3ZpZGVyQXJuLFxuICAgICk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjgYznibnlrprjga7jg6rjg53jgrjjg4jjg6rjgajjg5bjg6njg7Pjg4HjgYvjgonjga7jgb/jg63jg7zjg6vjgpLlvJXjgY3lj5fjgZHjgonjgozjgovjgojjgYbjgavjgZnjgotcbiAgICBjb25zdCBnaXRodWJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgZ2l0aHViUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogR0lUSFVCX09JRENfQ09ORklHLkNMSUVOVF9JRCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBnaXRodWJTdWJzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIGFzc3VtZWQgYnkgR2l0SHViIEFjdGlvbnMgZm9yIGFydGlmYWN0IGJ1Y2tldCBhY2Nlc3MnLFxuICAgIH0pO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLUlBTTUg5a++562W77yIR2l0SHViIEFjdGlvbnMg55So44Ot44O844Or44Gu5pyA5bCP5qip6ZmQ5YyW77yJOlxuICAgIC8vIGBncmFudFJlYWRXcml0ZWAg44GvIGBzMzpHZXRPYmplY3QqYCAvIGBzMzpMaXN0KmAg44Gq44Gp44Gu44Ov44Kk44Or44OJ44Kr44O844OJIEFjdGlvbiDjgpLlkKvjgoDjgZ/jgoHjgIFcbiAgICAvLyBXb3JrZmxvdyDjgaflrp/pmpvjgavkvb/jgYYgUzMg5pON5L2c44Gg44GR44KS5piO56S644GZ44KL44CCXG4gICAgLy8g5Y+C54Wn44Ov44O844Kv44OV44Ot44O8OiBgLmdpdGh1Yi93b3JrZmxvd3MvYXJ0aWZhY3QueW1sYFxuICAgIC8vIC0gYXdzIHMzIGxzXG4gICAgLy8gLSBhd3MgczMgc3luYyBkaXN0LyBzMzovLy4uLi9hcnRpZmFjdHMvJHtHSVRIVUJfU0hBfS9cbiAgICAvLyAtIGF3cyBzMyBjcCAtIHMzOi8vLi4uL2FydGlmYWN0cy8ke0dJVEhVQl9TSEF9L19DT01QTEVURVxuICAgIC8vIC0gYXdzIHMzIGNwIC0gczM6Ly8uLi4vdGFncy9zdGFnaW5nX2xhdGVzdC50eHRcbiAgICAvL+OBquOBnOacgOWwj+OBqOOBhOOBiOOCi+OBi+OAgC0gTGlzdEJ1Y2tldCDjga/jg5DjgrHjg4Pjg4jjga7lrZjlnKjnorroqo3jgajjgqrjg5bjgrjjgqfjgq/jg4jjgq3jg7zjga7liJfmjJnjgavlv4XopoHjgafjgZnjgYzjgIHnibnlrprjga7jg5fjg6zjg5XjgqPjg4Pjgq/jgrnjgafjga7liJfmjJnjgpLoqLHlj6/jgZnjgovjgZPjgajjga/jgafjgY3jgarjgYTjgZ/jgoHjgIHjg5DjgrHjg4Pjg4jlhajkvZPjgavlr77jgZfjgaYgTGlzdEJ1Y2tldCDjgpLoqLHlj6/jgZfjgb7jgZnjgIJcbiAgICAvLyAtIEdldEJ1Y2tldExvY2F0aW9uIOOBr+ODquODvOOCuOODp+ODs+eiuuiqjeOBruOBn+OCgeOBq+W/heimgVxuICAgIC8vIC0gR2V0T2JqZWN0IC8gUHV0T2JqZWN0IC8gRGVsZXRlT2JqZWN0IC8gQWJvcnRNdWx0aXBhcnRVcGxvYWQgLyBMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMg44Gv44Kq44OW44K444Kn44Kv44OI44Gu44Ki44OD44OX44Ot44O844OJ44Go566h55CG44Gr5b+F6KaB44Gn44CB44GT44KM44KJ44Gv44Kq44OW44K444Kn44Kv44OI44Os44OZ44Or44Gu44Oq44K944O844K55oyH5a6a44GM5b+F6KaB44Gq44Gf44KB44CBQVJO5pyr5bC+44GrIGAvKmAg44KS5LuY44GR44Gm44OQ44Kx44OD44OI5YaF44Gu5YWo44Kq44OW44K444Kn44Kv44OI44KS5a++6LGh44Go44GX44G+44GZ44CCXG4gICAgLy8g44GT44KM44KJ44Gu44Ki44Kv44K344On44Oz44Gv44CBR2l0SHViIEFjdGlvbnPjgYzjg5Pjg6vjg4nmiJDmnpznianjgpLjg5DjgrHjg4Pjg4jjgavjgqLjg4Pjg5fjg63jg7zjg4njgZfjgIHlv4XopoHjgavlv5zjgZjjgabnrqHnkIbjgZnjgovjgZ/jgoHjgavlv4XopoHjgarmnIDlsI/pmZDjga7mqKnpmZDjgrvjg4Pjg4jjgafjgZnjgIJcbiAgICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICAgJ3MzOkxpc3RNdWx0aXBhcnRVcGxvYWRQYXJ0cycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1JQU0177yIUmVzb3VyY2Ugd2lsZGNhcmTvvInpmZDlrpogc3VwcHJlc3M6XG4gICAgLy8gT2JqZWN0IOODrOODmeODq+OBriBTMyDmk43kvZzjga8gQVJOIOacq+WwviBgLypgIOOBjOW/heimge+8iOOCquODluOCuOOCp+OCr+ODiOOCreODvOOCkuWIl+aMmeOBp+OBjeOBquOBhOOBn+OCge+8ieOAglxuICAgIC8vIEFjdGlvbiDjga/mmI7npLrliJfmjJnmuIjjgb/jgacgd2lsZGNhcmQg44KS5L2/44Gj44Gm44GE44Gq44GE44Gf44KB44CBUmVzb3VyY2Ug44Gu44G/44KS6ZmQ5a6aIHN1cHByZXNzIOOBmeOCi+OAglxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGdpdGh1YlJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgICByZWFzb246ICdHaXRIdWIgQWN0aW9ucyB1cGxvYWRzIGJ1aWxkIG91dHB1dHMgdW5kZXIgZHluYW1pYyBvYmplY3Qga2V5cyAoY29tbWl0IFNIQSBwYXRocyksIHdoaWNoIHJlcXVpcmVzIG9iamVjdC1sZXZlbCByZXNvdXJjZSB3aWxkY2FyZCB3aGlsZSBhY3Rpb25zIGFyZSBleHBsaWNpdGx5IHNjb3BlZC4nLFxuICAgICAgICAgIGFwcGxpZXNUbzogW3sgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcXFwvXFxcXCokLycgfV0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgLy8gUzPjgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7oqK3lrppcbiAgICBjb25zdCByZXBsaWNhdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1MzUmVwbGljYXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3MzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSB1c2VkIGJ5IFMzIHRvIHJlcGxpY2F0ZSBvYmplY3RzIHRvIHRoZSBzZWNvbmRhcnkgcmVnaW9uIGJ1Y2tldCcsXG4gICAgfSk7XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gr5b+F6KaB44Gq5qip6ZmQ44KS44Ot44O844Or44Gr5LuY5LiOXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbicsXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgfSksXG4gICAgKTtcbiAgICAvLyDjgqrjg5bjgrjjgqfjgq/jg4jjga7jg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjgavlv4XopoHjgarmqKnpmZDjgpLjg63jg7zjg6vjgavku5jkuI5cbiAgICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkZvclJlcGxpY2F0aW9uJyxcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkFjbCcsXG4gICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25UYWdnaW5nJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOOBruODkOOCseODg+ODiOOBq+WvvuOBmeOCi+aoqemZkOOCkuODreODvOODq+OBq+S7mOS4jlxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpSZXBsaWNhdGVPYmplY3QnLFxuICAgICAgICAgICdzMzpSZXBsaWNhdGVEZWxldGUnLFxuICAgICAgICAgICdzMzpSZXBsaWNhdGVUYWdzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLUlBTTXvvIhSZXBsaWNhdGlvbiBSb2xlIOOBriBSZXNvdXJjZSB3aWxkY2FyZO+8iemZkOWumiBzdXBwcmVzczpcbiAgICAvLyDlhajph4/jgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PopoHku7bjgafjga8gb2JqZWN0LWxldmVsIOOBriBgLypgIOOBjOW/heimgeOAglxuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WvvuixoeOCkuODl+ODrOODleOCo+ODg+OCr+OCuemZkOWumuOBl+OBquOBhOePvuihjOS7leanmOOBruOBn+OCgeOAgVJlc291cmNlIOOBruOBv+OCkumZkOWumiBzdXBwcmVzcyDjgZnjgovjgIJcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICByZXBsaWNhdGlvblJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgICByZWFzb246ICdDcm9zcy1yZWdpb24gcmVwbGljYXRpb24gaXMgY29uZmlndXJlZCBmb3IgYWxsIG9iamVjdHMsIHdoaWNoIHJlcXVpcmVzIG9iamVjdC1sZXZlbCB3aWxkY2FyZCByZXNvdXJjZXMgaW4gc291cmNlIGFuZCBkZXN0aW5hdGlvbiBidWNrZXQgQVJOcy4nLFxuICAgICAgICAgIGFwcGxpZXNUbzogW3sgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcXFwvXFxcXCokLycgfV0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuICAgIC8vIFMz44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gu6Kit5a6a44KS44OQ44Kx44OD44OI44Gr6L+95YqgXG4gICAgY29uc3QgY2ZuQnVja2V0ID0gYXJ0aWZhY3RCdWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgczMuQ2ZuQnVja2V0O1xuICAgIGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICByb2xlOiByZXBsaWNhdGlvblJvbGUucm9sZUFybixcbiAgICAgIC8vIOWumuaVsOOCkuS9v+eUqOOBl+OBpuODrOODl+ODquOCseODvOOCt+ODp+ODs+ODq+ODvOODq+OCkuWumue+qVxuICAgICAgcnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIC8vIOODq+ODvOODq0lE44Gv5Lu75oSP44Gu5paH5a2X5YiX44Gn44CB6KSH5pWw44Or44O844Or44GM44GC44KL5aC05ZCI44Gv5LiA5oSP44Gn44GC44KL5b+F6KaB44GM44GC44KK44G+44GZXG4gICAgICAgICAgaWQ6ICdDcm9zc1JlZ2lvblJlcGxpY2F0aW9uUnVsZScsXG4gICAgICAgICAgLy8g44Or44O844Or44KS5pyJ5Yq544Gr44GZ44KLXG4gICAgICAgICAgc3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5YSq5YWI6aCG5L2N77yI6KSH5pWw44Or44O844Or44GM44GC44KL5aC05ZCI44Gr6YGp55So44GV44KM44KL6aCG5bqP44KS5a6a576p77yJXG4gICAgICAgICAgcHJpb3JpdHk6IDEsXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5a++6LGh44KS5oyH5a6a77yI44GT44Gu5L6L44Gn44Gv5YWo44Gm44Gu44Kq44OW44K444Kn44Kv44OI44KS44Os44OX44Oq44Kx44O844K344On44Oz77yJXG4gICAgICAgICAgZmlsdGVyOiB7XG4gICAgICAgICAgICBwcmVmaXg6ICcnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8g44OQ44O844K444On44OL44Oz44Kw44GM5pyJ5Yq544Gq44OQ44Kx44OD44OI44Gu5aC05ZCI44CB5YmK6Zmk44Oe44O844Kr44O844KC44Os44OX44Oq44Kx44O844K344On44Oz44GZ44KL6Kit5a6aXG4gICAgICAgICAgZGVsZXRlTWFya2VyUmVwbGljYXRpb246IHtcbiAgICAgICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5a6b5YWI44KS5oyH5a6a77yI44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS5L2/55So77yJXG4gICAgICAgICAgZGVzdGluYXRpb246IHtcbiAgICAgICAgICAgIGJ1Y2tldDogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH07XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz6Kit5a6a44Gu5L6d5a2Y6Zai5L+C44KS5piO56S655qE44Gr6L+95Yqg77yIQ0RL44GM6Ieq5YuV55qE44Gr5Yem55CG44GZ44KL44GT44Go44KC44GC44KK44G+44GZ44GM44CB5piO56S655qE44Gr44GZ44KL44GT44Go44Gn56K65a6f44Gr6aCG5bqP44GM5L+d6Ki844GV44KM44G+44GZ77yJXG4gICAgY2ZuQnVja2V0LmFkZERlcGVuZGVuY3kocmVwbGljYXRpb25Sb2xlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGlhbS5DZm5Sb2xlKTtcbiAgICAvLyDjg5DjgrHjg4Pjg4jlkI3jgpLlh7rliptcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQnVja2V0TmFtZUV4cG9ydCcsIHtcbiAgICAgIHZhbHVlOiBhcnRpZmFjdEJ1Y2tldC5idWNrZXROYW1lLFxuICAgIH0pO1xuICAgIC8vIEdpdEh1YiBBY3Rpb25z44Ot44O844Or44GuQVJO44KS5Ye65YqbXG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR2l0aHViQWN0aW9uc1JvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogZ2l0aHViUm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOODkOOCseODg+ODiOOBrkFSTuOCkuWHuuWKm1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZXBsaWNhdGlvbkRlc3RpbmF0aW9uQnVja2V0QXJuJywge1xuICAgICAgdmFsdWU6IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICB9KTtcbiAgfVxufSJdfQ==