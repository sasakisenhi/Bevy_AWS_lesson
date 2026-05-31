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
//GitHub OIDCの設定も定数オブジェクトにまとめる
const GITHUB_OIDC_CONFIG = {
    PROVIDER_URL: 'https://token.actions.githubusercontent.com',
    CLIENT_ID: 'sts.amazonaws.com',
    THUMBPRINT: '6938fd4d98bab03faadb97b34396831e3780a188',
    DEFAULT_BRANCHES: ['main', 'master'],
    PLACEHOLDER_OWNER: '<github-owner>',
    PLACEHOLDER_REPO: '<github-repo>',
};
class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // 実行時に -c env=prod と渡せる
        const envName = this.node.tryGetContext('env') || 'dev';
        // GitHub OIDCの設定をコンテキストから取得（プレースホルダーも用意）
        const githubOwner = this.node.tryGetContext('githubOwner') || GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER;
        const githubRepo = this.node.tryGetContext('githubRepo') || GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO;
        const githubBranch = this.node.tryGetContext('githubBranch');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MscUNBQTBDO0FBRTFDLCtCQUErQjtBQUMvQixNQUFNLGNBQWMsR0FBRztJQUNyQixjQUFjLEVBQUUsRUFBRTtJQUNsQixzQkFBc0IsRUFBRSxDQUFDO0lBQ3pCLGFBQWEsRUFBRSxnQkFBZ0I7SUFDL0IsaUJBQWlCLEVBQUUscUJBQXFCO0NBQ2hDLENBQUM7QUFLWCw4QkFBOEI7QUFDOUIsTUFBTSxrQkFBa0IsR0FBRztJQUN6QixZQUFZLEVBQUUsNkNBQTZDO0lBQzNELFNBQVMsRUFBRSxtQkFBbUI7SUFDOUIsVUFBVSxFQUFFLDBDQUEwQztJQUN0RCxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7SUFDcEMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLGdCQUFnQixFQUFFLGVBQWU7Q0FDekIsQ0FBQztBQUVYLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix3QkFBd0I7UUFDeEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1FBQ3hELHlDQUF5QztRQUN6QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQztRQUNuRyxNQUFNLFVBQVUsR0FB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bkMsV0FBVyxFQUFFO3dCQUNYLE1BQU0sRUFBRSxLQUFLLENBQUMsa0JBQWtCO3FCQUNqQztpQkFDRjthQUNGO1NBQ0YsQ0FBQztRQUNGLHFFQUFxRTtRQUNyRSxTQUFTLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsWUFBMkIsQ0FBQyxDQUFDO1FBQzFFLFdBQVc7UUFDWCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsVUFBVTtTQUNqQyxDQUFDLENBQUM7UUFDSCwyQkFBMkI7UUFFM0IsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsVUFBVSxDQUFDLE9BQU87U0FDMUIsQ0FBQyxDQUFDO1FBQ0gsdUJBQXVCO1FBQ3ZCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUNBQWlDLEVBQUU7WUFDekQsS0FBSyxFQUFFLEtBQUssQ0FBQyxrQkFBa0I7U0FDaEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBalJELHdEQWlSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcblxuLy8g6Kit5a6a5YCk44KS44Kq44OW44K444Kn44Kv44OI44Gr44G+44Go44KB44KL77yI44Oe44K444OD44Kv44OK44Oz44OQ44O844Gu5o6S6Zmk77yJXG5jb25zdCBTVE9SQUdFX0NPTkZJRyA9IHtcbiAgUkVURU5USU9OX0RBWVM6IDMwLFxuICBISVNUT1JZX1JFVEVOVElPTl9EQVlTOiA3LFxuICBCVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMnLFxuICBMT0dfQlVDS0VUX1BSRUZJWDogJ2JldnktYXJ0aWZhY3RzLWxvZ3MnLFxufSBhcyBjb25zdDtcblxuaW50ZXJmYWNlIEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc2Vjb25kYXJ5QnVja2V0QXJuOiBzdHJpbmc7XG59XG4vL0dpdEh1YiBPSURD44Gu6Kit5a6a44KC5a6a5pWw44Kq44OW44K444Kn44Kv44OI44Gr44G+44Go44KB44KLXG5jb25zdCBHSVRIVUJfT0lEQ19DT05GSUcgPSB7XG4gIFBST1ZJREVSX1VSTDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICBDTElFTlRfSUQ6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gIFRIVU1CUFJJTlQ6ICc2OTM4ZmQ0ZDk4YmFiMDNmYWFkYjk3YjM0Mzk2ODMxZTM3ODBhMTg4JyxcbiAgREVGQVVMVF9CUkFOQ0hFUzogWydtYWluJywgJ21hc3RlciddLFxuICBQTEFDRUhPTERFUl9PV05FUjogJzxnaXRodWItb3duZXI+JyxcbiAgUExBQ0VIT0xERVJfUkVQTzogJzxnaXRodWItcmVwbz4nLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNsYXNzIEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyDlrp/ooYzmmYLjgasgLWMgZW52PXByb2Qg44Go5rih44Gb44KLXG4gICAgY29uc3QgZW52TmFtZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOCkuOCs+ODs+ODhuOCreOCueODiOOBi+OCieWPluW+l++8iOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCgueUqOaEj++8iVxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1Yk93bmVyJykgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSO1xuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViUmVwbycpIHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJCcmFuY2gnKTtcbiAgICBjb25zdCBnaXRodWJCcmFuY2hlcyA9IGdpdGh1YkJyYW5jaFxuICAgICAgPyBbU3RyaW5nKGdpdGh1YkJyYW5jaCldXG4gICAgICA6IEdJVEhVQl9PSURDX0NPTkZJRy5ERUZBVUxUX0JSQU5DSEVTO1xuICAgIFxuICAgIC8vIOaXouWtmOOBrkFSTuOBjOaYjuekuueahOOBq+aMh+WumuOBleOCjOOBpuOBhOOCi+WgtOWQiOOAgeOBvuOBn+OBr0FXU+OCouOCq+OCpuODs+ODiOOBq+aXouOBq+ODl+ODreODkOOCpOODgOODvOOBjOWtmOWcqOOBmeOCi+OBqOaDs+WumuOBleOCjOOCi+WgtOWQiOOBrkFSTlxuICAgIGNvbnN0IGV4aXN0aW5nUHJvdmlkZXJBcm4gPSBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpvaWRjLXByb3ZpZGVyL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tYDtcbiAgICBcbiAgICBjb25zdCBnaXRodWJTdWJzID0gZ2l0aHViQnJhbmNoZXMubWFwKFxuICAgICAgKGJyYW5jaCkgPT4gYHJlcG86JHtnaXRodWJPd25lcn0vJHtnaXRodWJSZXBvfTpyZWY6cmVmcy9oZWFkcy8ke2JyYW5jaH1gLFxuICAgICk7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOBjOODl+ODrOODvOOCueODm+ODq+ODgOODvOOBruOBvuOBvuOBruWgtOWQiOOBr+itpuWRiuOCkuWHuuOBmVxuICAgIGlmIChcbiAgICAgIGdpdGh1Yk93bmVyID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfT1dORVIgfHxcbiAgICAgIGdpdGh1YlJlcG8gPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPXG4gICAgKSB7XG4gICAgICBjZGsuQW5ub3RhdGlvbnMub2YodGhpcykuYWRkV2FybmluZyhcbiAgICAgICAgJ0dpdEh1YiBPSURDIHRydXN0IGlzIHVzaW5nIHBsYWNlaG9sZGVycy4gUGFzcyAtYyBnaXRodWJPd25lcj08b3duZXI+IC1jIGdpdGh1YlJlcG89PHJlcG8+IGFuZCBvcHRpb25hbGx5IC1jIGdpdGh1YkJyYW5jaD08YnJhbmNoPiBiZWZvcmUgZGVwbG95bWVudC4nLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8g44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJBcblxuICAgIGNvbnN0IGFydGlmYWN0QWNjZXNzTG9nQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QWNjZXNzTG9nQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuTE9HX0JVQ0tFVF9QUkVGSVh9LSR7ZW52TmFtZX0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEwIOWvvuetljpcbiAgICAgIC8vIOOCouOCr+OCu+OCueODreOCsOWwgueUqOODkOOCseODg+ODiOOBp+OBguOBo+OBpuOCguOAgeODkOOCseODg+ODiOODneODquOCt+ODvOOBpyBIVFRQUyhUTFMpIOS7peWkluOBrlxuICAgICAgLy8g44Oq44Kv44Ko44K544OI77yIYXdzOlNlY3VyZVRyYW5zcG9ydD1mYWxzZe+8ieOCkuaLkuWQpuOBmeOCi+OBk+OBqOOBjOaxguOCgeOCieOCjOOCi+OAglxuICAgICAgLy8gQmV2eUFydGlmYWN0QnVja2V0IOOBqOWQjOOBmOaWuemHneOBpyBlbmZvcmNlU1NMIOOCkuacieWKueWMluOBmeOCi+OAglxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcbiAgICAvLyBjZGstbmFn44GnUzPjgqLjgq/jgrvjgrnjg63jgrDjg5DjgrHjg4Pjg4jjgavlr77jgZnjgovorablkYrjgpLmipHliLbvvIjjgZPjga7jg5DjgrHjg4Pjg4jjga/jgqLjgq/jgrvjgrnjg63jgrDlsILnlKjjgafjgIHjgZXjgonjgavjgqLjgq/jgrvjgrnjg63jgrDjga7jg43jgrnjg4jjgpLpgb/jgZHjgovjgZ/jgoHjgavjgrXjg7zjg5Djg7zjgqLjgq/jgrvjgrnjg63jgrDjgpLnhKHlirnjgavjgZfjgabjgYTjgovjgZ/jgoHvvIlcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICBhcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLVMxJyxcbiAgICAgICAgICByZWFzb246ICdUaGlzIGJ1Y2tldCBzdG9yZXMgUzMgYWNjZXNzIGxvZ3MgZm9yIEJldnlBcnRpZmFjdEJ1Y2tldCBhbmQgZG9lcyBub3QgcmVxdWlyZSBuZXN0ZWQgc2VydmVyIGFjY2VzcyBsb2dnaW5nLicsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgY29uc3QgYXJ0aWZhY3RCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCZXZ5QXJ0aWZhY3RCdWNrZXQnLCB7XG4gICAgICAvLyDnkrDlooPlkI3jgajjgqLjgqvjgqbjg7Pjg4hJROOCkue1hOOBv+WQiOOCj+OBm+OBpuS4gOaEj+aAp+OCkuaLheS/nVxuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuQlVDS0VUX1BSRUZJWH0tJHtlbnZOYW1lfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgXG4gICAgICAvLyDjgrvjgq3jg6Xjg6rjg4bjgqPlvLfljJbjga7jgZ/jgoHjga7oqK3lrprjgpLov73liqBcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAvLyBTM+ODnuODjeODvOOCuOODieaal+WPt+WMluOCkuacieWKueOBq+OBl+OBpuOAgeS/neWtmOODh+ODvOOCv+OCkuaal+WPt+WMluOBmeOCi1xuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgLy8gQXdzU29sdXRpb25zLVMxMCDlr77nrZY6XG4gICAgICAvLyDjgZPjga7oqK3lrprjgpLmnInlirnljJbjgZnjgovjgajjgIFDREsg44GM44OQ44Kx44OD44OI44Od44Oq44K344O844GrXG4gICAgICAvLyDjgIxhd3M6U2VjdXJlVHJhbnNwb3J0IOOBjCBmYWxzZe+8iD1IVFRQ6YCa5L+h77yJ44Gu44Oq44Kv44Ko44K544OI44KS5ouS5ZCm44CN44GZ44KLXG4gICAgICAvLyBEZW55IOODq+ODvOODq+OCkuiHquWLleeUn+aIkOOBmeOCi+OAglxuICAgICAgLy8g44GT44KM44Gr44KI44KK44CB5b2T6Kmy44OQ44Kx44OD44OI44G444Gu44Ki44Kv44K744K544KSIEhUVFBTKFRMUykg44Gu44G/44Gr5Yi26ZmQ44Gn44GN44KL44CCXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgLy8g44OQ44O844K444On44OL44Oz44Kw44KS5pyJ5Yq544Gr44GX44Gm44CB6Kqk44Gj44Gm5YmK6Zmk44GV44KM44Gf44Kq44OW44K444Kn44Kv44OI44Gu5b6p5YWD44KS5Y+v6IO944Gr44GZ44KLXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICAvLyDjgrnjgr/jg4Pjgq/liYrpmaTmmYLjgavjg5DjgrHjg4Pjg4jjgoLliYrpmaTjgZnjgovoqK3lrprvvIjmnKznlarnkrDlooPjgafjga/ms6jmhI/jgYzlv4XopoHvvIlcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAvLyDjg5DjgrHjg4Pjg4jliYrpmaTmmYLjgavjgqrjg5bjgrjjgqfjgq/jg4jjgoLliYrpmaTjgZnjgovoqK3lrprvvIjmnKznlarnkrDlooPjgafjga/ms6jmhI/jgYzlv4XopoHvvIlcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuXG4gICAgICAvKiDjgZ3jga7jgbvjgYvov73liqDlj6/og73jgaroqK3lrppcbiAgICAgICAgICDjg7vjgqLjgq/jgrvjgrnjg63jgrDjga7oqK3lrppcbiAgICAgICAgICDjg7vnibnlrprjga7jg6rjg7zjgrjjg6fjg7Pjgavjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PjgZnjgovoqK3lrppcbiAgICAgICAgICDjg7vjg6njgqTjg5XjgrXjgqTjgq/jg6vjg6vjg7zjg6vjgafnibnlrprjga7jg5fjg6zjg5XjgqPjg4Pjgq/jgrnjgoTjgr/jgrDjgavln7rjgaXjgYTjgabjgqrjg5bjgrjjgqfjgq/jg4jjgpLnrqHnkIbjgZnjgovoqK3lrppcbiAgICAgICAgICDjg7vjgqLjgq/jgrvjgrnjgrPjg7Pjg4jjg63jg7zjg6vjg6rjgrnjg4jvvIhBQ0zvvInjgoTjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgafntLDjgYvjgYTjgqLjgq/jgrvjgrnliLblvqHjgpLoqK3lrprjgZnjgovjgZPjgajjgoLlj6/og71cbiAgICAgICAgICDjgarjgalcbiAgICAgICAgICDoqbPjgZfjgY/jga/kuIvoqJjjga5VUkzjgpLlj4LnhacgXG4gICAgICAgICAgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfczMuQnVja2V0UHJvcHMuaHRtbFxuICAgICAgICovXG5cbiAgICAgIC8vIOODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OCkui/veWKoOOBl+OBpuWPpOOBhOOCquODluOCuOOCp+OCr+ODiOOCkuiHquWLleeahOOBq+WJiumZpFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIC8vIOWumuaVsOOCkuS9v+eUqFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLlJFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgLy8g44Ki44Kv44K744K544Ot44Kw44Gu6Kit5a6a44GT44KM44GM44Gq44GE44GoczHjga7orablkYrjgYzlh7rjgovjgIJcbiAgICAgIHNlcnZlckFjY2Vzc0xvZ3NCdWNrZXQ6IGFydGlmYWN0QWNjZXNzTG9nQnVja2V0LFxuICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogJ2FjY2Vzcy1sb2dzLycsXG4gICAgfSk7XG4gICAgLy8g4piFIOS/ruato+euh+aJgO+8muW4uOOBq+aWsOOBl+OBhOODl+ODreODkOOCpOODgOODvOOCkuS9nOOCi+OBruOBp+OBr+OBquOBj+OAgeaXouWtmOOBrkFSTuOCkuWPgueFp+OBmeOCi1xuICAgIC8vIOWIneWbnuS9nOaIkOaZgu+8iOODl+ODreODkOOCpOODgOODvOOBjOOBquOBhOeKtuaFi++8ieOBr+OAgWBmcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuYCDjgafjga/jgarjgY/mlrDopo/kvZzmiJDjgZnjgovjgYvjgIHjgb7jgZ/jga/kvovlpJbjgpLogIPmha7jgZnjgovlv4XopoHjgYzjgYLjgorjgb7jgZnjgYzjgIFcbiAgICAvLyDml6LlrZjjga7jgqjjg6njg7zvvIhFbnRpdHlBbHJlYWR5RXhpc3RzRXhjZXB0aW9u77yJ44KS5Zue6YG/44GZ44KL44Gf44KB44CB44GZ44Gn44Gr5a2Y5Zyo44GZ44KL5aC05ZCI44Gv5pei5a2Y44GuQVJO44Gn5Y+C54Wn44GX44G+44GZ44CCXG4gICAgLy8gQ0RL44Gu57WE44G/6L6844G/44Oh44K944OD44OJIGBPcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybmAg44KS5L2/55So44GX44G+44GZ44CCXG5cbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybihcbiAgICAgIHRoaXMsXG4gICAgICAnR2l0aHViUHJvdmlkZXInLFxuICAgICAgZXhpc3RpbmdQcm92aWRlckFybixcbiAgICApO1xuICAgIC8vIEdpdEh1YiBBY3Rpb25z44GM54m55a6a44Gu44Oq44Od44K444OI44Oq44Go44OW44Op44Oz44OB44GL44KJ44Gu44G/44Ot44O844Or44KS5byV44GN5Y+X44GR44KJ44KM44KL44KI44GG44Gr44GZ44KLXG4gICAgY29uc3QgZ2l0aHViUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnR2l0aHViQWN0aW9uc1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICAgIGdpdGh1YlByb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6IEdJVEhVQl9PSURDX0NPTkZJRy5DTElFTlRfSUQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogZ2l0aHViU3VicyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBhc3N1bWVkIGJ5IEdpdEh1YiBBY3Rpb25zIGZvciBhcnRpZmFjdCBidWNrZXQgYWNjZXNzJyxcbiAgICB9KTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1JQU01IOWvvuetlu+8iEdpdEh1YiBBY3Rpb25zIOeUqOODreODvOODq+OBruacgOWwj+aoqemZkOWMlu+8iTpcbiAgICAvLyBgZ3JhbnRSZWFkV3JpdGVgIOOBryBgczM6R2V0T2JqZWN0KmAgLyBgczM6TGlzdCpgIOOBquOBqeOBruODr+OCpOODq+ODieOCq+ODvOODiSBBY3Rpb24g44KS5ZCr44KA44Gf44KB44CBXG4gICAgLy8gV29ya2Zsb3cg44Gn5a6f6Zqb44Gr5L2/44GGIFMzIOaTjeS9nOOBoOOBkeOCkuaYjuekuuOBmeOCi+OAglxuICAgIC8vIOWPgueFp+ODr+ODvOOCr+ODleODreODvDogYC5naXRodWIvd29ya2Zsb3dzL2FydGlmYWN0LnltbGBcbiAgICAvLyAtIGF3cyBzMyBsc1xuICAgIC8vIC0gYXdzIHMzIHN5bmMgZGlzdC8gczM6Ly8uLi4vYXJ0aWZhY3RzLyR7R0lUSFVCX1NIQX0vXG4gICAgLy8gLSBhd3MgczMgY3AgLSBzMzovLy4uLi9hcnRpZmFjdHMvJHtHSVRIVUJfU0hBfS9fQ09NUExFVEVcbiAgICAvLyAtIGF3cyBzMyBjcCAtIHMzOi8vLi4uL3RhZ3Mvc3RhZ2luZ19sYXRlc3QudHh0XG4gICAgLy/jgarjgZzmnIDlsI/jgajjgYTjgYjjgovjgYvjgIAtIExpc3RCdWNrZXQg44Gv44OQ44Kx44OD44OI44Gu5a2Y5Zyo56K66KqN44Go44Kq44OW44K444Kn44Kv44OI44Kt44O844Gu5YiX5oyZ44Gr5b+F6KaB44Gn44GZ44GM44CB54m55a6a44Gu44OX44Os44OV44Kj44OD44Kv44K544Gn44Gu5YiX5oyZ44KS6Kix5Y+v44GZ44KL44GT44Go44Gv44Gn44GN44Gq44GE44Gf44KB44CB44OQ44Kx44OD44OI5YWo5L2T44Gr5a++44GX44GmIExpc3RCdWNrZXQg44KS6Kix5Y+v44GX44G+44GZ44CCXG4gICAgLy8gLSBHZXRCdWNrZXRMb2NhdGlvbiDjga/jg6rjg7zjgrjjg6fjg7Pnorroqo3jga7jgZ/jgoHjgavlv4XopoFcbiAgICAvLyAtIEdldE9iamVjdCAvIFB1dE9iamVjdCAvIERlbGV0ZU9iamVjdCAvIEFib3J0TXVsdGlwYXJ0VXBsb2FkIC8gTGlzdE11bHRpcGFydFVwbG9hZFBhcnRzIOOBr+OCquODluOCuOOCp+OCr+ODiOOBruOCouODg+ODl+ODreODvOODieOBqOeuoeeQhuOBq+W/heimgeOBp+OAgeOBk+OCjOOCieOBr+OCquODluOCuOOCp+OCr+ODiOODrOODmeODq+OBruODquOCveODvOOCueaMh+WumuOBjOW/heimgeOBquOBn+OCgeOAgUFSTuacq+WwvuOBqyBgLypgIOOCkuS7mOOBkeOBpuODkOOCseODg+ODiOWGheOBruWFqOOCquODluOCuOOCp+OCr+ODiOOCkuWvvuixoeOBqOOBl+OBvuOBmeOAglxuICAgIC8vIOOBk+OCjOOCieOBruOCouOCr+OCt+ODp+ODs+OBr+OAgUdpdEh1YiBBY3Rpb25z44GM44OT44Or44OJ5oiQ5p6c54mp44KS44OQ44Kx44OD44OI44Gr44Ki44OD44OX44Ot44O844OJ44GX44CB5b+F6KaB44Gr5b+c44GY44Gm566h55CG44GZ44KL44Gf44KB44Gr5b+F6KaB44Gq5pyA5bCP6ZmQ44Gu5qip6ZmQ44K744OD44OI44Gn44GZ44CCXG4gICAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAnczM6QWJvcnRNdWx0aXBhcnRVcGxvYWQnLFxuICAgICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtgJHthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBBd3NTb2x1dGlvbnMtSUFNNe+8iFJlc291cmNlIHdpbGRjYXJk77yJ6ZmQ5a6aIHN1cHByZXNzOlxuICAgIC8vIE9iamVjdCDjg6zjg5njg6vjga4gUzMg5pON5L2c44GvIEFSTiDmnKvlsL4gYC8qYCDjgYzlv4XopoHvvIjjgqrjg5bjgrjjgqfjgq/jg4jjgq3jg7zjgpLliJfmjJnjgafjgY3jgarjgYTjgZ/jgoHvvInjgIJcbiAgICAvLyBBY3Rpb24g44Gv5piO56S65YiX5oyZ5riI44G/44GnIHdpbGRjYXJkIOOCkuS9v+OBo+OBpuOBhOOBquOBhOOBn+OCgeOAgVJlc291cmNlIOOBruOBv+OCkumZkOWumiBzdXBwcmVzcyDjgZnjgovjgIJcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICBnaXRodWJSb2xlLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgICAgcmVhc29uOiAnR2l0SHViIEFjdGlvbnMgdXBsb2FkcyBidWlsZCBvdXRwdXRzIHVuZGVyIGR5bmFtaWMgb2JqZWN0IGtleXMgKGNvbW1pdCBTSEEgcGF0aHMpLCB3aGljaCByZXF1aXJlcyBvYmplY3QtbGV2ZWwgcmVzb3VyY2Ugd2lsZGNhcmQgd2hpbGUgYWN0aW9ucyBhcmUgZXhwbGljaXRseSBzY29wZWQuJyxcbiAgICAgICAgICBhcHBsaWVzVG86IFt7IHJlZ2V4OiAnL15SZXNvdXJjZTo6LipcXFxcL1xcXFwqJC8nIH1dLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIC8vIFMz44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gu6Kit5a6aXG4gICAgY29uc3QgcmVwbGljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdTM1JlcGxpY2F0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdzMy5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgdXNlZCBieSBTMyB0byByZXBsaWNhdGUgb2JqZWN0cyB0byB0aGUgc2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQnLFxuICAgIH0pO1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+OBq+W/heimgeOBquaoqemZkOOCkuODreODvOODq+OBq+S7mOS4jlxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24nLFxuICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgLy8g44Kq44OW44K444Kn44Kv44OI44Gu44Os44OX44Oq44Kx44O844K344On44Oz44Gr5b+F6KaB44Gq5qip6ZmQ44KS44Ot44O844Or44Gr5LuY5LiOXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvbicsXG4gICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25BY2wnLFxuICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uVGFnZ2luZycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSksXG4gICAgKTtcbiAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PlhYjjga7jg5DjgrHjg4Pjg4jjgavlr77jgZnjgovmqKnpmZDjgpLjg63jg7zjg6vjgavku5jkuI5cbiAgICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6UmVwbGljYXRlT2JqZWN0JyxcbiAgICAgICAgICAnczM6UmVwbGljYXRlRGVsZXRlJyxcbiAgICAgICAgICAnczM6UmVwbGljYXRlVGFncycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLnNlY29uZGFyeUJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1JQU0177yIUmVwbGljYXRpb24gUm9sZSDjga4gUmVzb3VyY2Ugd2lsZGNhcmTvvInpmZDlrpogc3VwcHJlc3M6XG4gICAgLy8g5YWo6YeP44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz6KaB5Lu244Gn44GvIG9iamVjdC1sZXZlbCDjga4gYC8qYCDjgYzlv4XopoHjgIJcbiAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Plr77osaHjgpLjg5fjg6zjg5XjgqPjg4Pjgq/jgrnpmZDlrprjgZfjgarjgYTnj77ooYzku5Xmp5jjga7jgZ/jgoHjgIFSZXNvdXJjZSDjga7jgb/jgpLpmZDlrpogc3VwcHJlc3Mg44GZ44KL44CCXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgcmVwbGljYXRpb25Sb2xlLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXG4gICAgICAgICAgcmVhc29uOiAnQ3Jvc3MtcmVnaW9uIHJlcGxpY2F0aW9uIGlzIGNvbmZpZ3VyZWQgZm9yIGFsbCBvYmplY3RzLCB3aGljaCByZXF1aXJlcyBvYmplY3QtbGV2ZWwgd2lsZGNhcmQgcmVzb3VyY2VzIGluIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gYnVja2V0IEFSTnMuJyxcbiAgICAgICAgICBhcHBsaWVzVG86IFt7IHJlZ2V4OiAnL15SZXNvdXJjZTo6LipcXFxcL1xcXFwqJC8nIH1dLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcbiAgICAvLyBTM+OCr+ODreOCueODquODvOOCuOODp+ODs+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBruioreWumuOCkuODkOOCseODg+ODiOOBq+i/veWKoFxuICAgIGNvbnN0IGNmbkJ1Y2tldCA9IGFydGlmYWN0QnVja2V0Lm5vZGUuZGVmYXVsdENoaWxkIGFzIHMzLkNmbkJ1Y2tldDtcbiAgICBjZm5CdWNrZXQucmVwbGljYXRpb25Db25maWd1cmF0aW9uID0ge1xuICAgICAgcm9sZTogcmVwbGljYXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICAvLyDlrprmlbDjgpLkvb/nlKjjgZfjgabjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjg6vjg7zjg6vjgpLlrprnvqlcbiAgICAgIHJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICAvLyDjg6vjg7zjg6tJROOBr+S7u+aEj+OBruaWh+Wtl+WIl+OBp+OAgeikh+aVsOODq+ODvOODq+OBjOOBguOCi+WgtOWQiOOBr+S4gOaEj+OBp+OBguOCi+W/heimgeOBjOOBguOCiuOBvuOBmVxuICAgICAgICAgIGlkOiAnQ3Jvc3NSZWdpb25SZXBsaWNhdGlvblJ1bGUnLFxuICAgICAgICAgIC8vIOODq+ODvOODq+OCkuacieWKueOBq+OBmeOCi1xuICAgICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+OBruWEquWFiOmghuS9je+8iOikh+aVsOODq+ODvOODq+OBjOOBguOCi+WgtOWQiOOBq+mBqeeUqOOBleOCjOOCi+mghuW6j+OCkuWumue+qe+8iVxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+OBruWvvuixoeOCkuaMh+Wumu+8iOOBk+OBruS+i+OBp+OBr+WFqOOBpuOBruOCquODluOCuOOCp+OCr+ODiOOCkuODrOODl+ODquOCseODvOOCt+ODp+ODs++8iVxuICAgICAgICAgIGZpbHRlcjoge1xuICAgICAgICAgICAgcHJlZml4OiAnJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIOODkOODvOOCuOODp+ODi+ODs+OCsOOBjOacieWKueOBquODkOOCseODg+ODiOOBruWgtOWQiOOAgeWJiumZpOODnuODvOOCq+ODvOOCguODrOODl+ODquOCseODvOOCt+ODp+ODs+OBmeOCi+ioreWumlxuICAgICAgICAgIGRlbGV0ZU1hcmtlclJlcGxpY2F0aW9uOiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdFbmFibGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+OBruWum+WFiOOCkuaMh+Wumu+8iOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOCkuS9v+eUqO+8iVxuICAgICAgICAgIGRlc3RpbmF0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9O1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+ioreWumuOBruS+neWtmOmWouS/guOCkuaYjuekuueahOOBq+i/veWKoO+8iENES+OBjOiHquWLleeahOOBq+WHpueQhuOBmeOCi+OBk+OBqOOCguOBguOCiuOBvuOBmeOBjOOAgeaYjuekuueahOOBq+OBmeOCi+OBk+OBqOOBp+eiuuWun+OBq+mghuW6j+OBjOS/neiovOOBleOCjOOBvuOBme+8iVxuICAgIGNmbkJ1Y2tldC5hZGREZXBlbmRlbmN5KHJlcGxpY2F0aW9uUm9sZS5ub2RlLmRlZmF1bHRDaGlsZCBhcyBpYW0uQ2ZuUm9sZSk7XG4gICAgLy8g44OQ44Kx44OD44OI5ZCN44KS5Ye65YqbXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogYXJ0aWZhY3RCdWNrZXQuYnVja2V0TmFtZSxcbiAgICB9KTtcbiAgICAvLyBHaXRIdWIgQWN0aW9uc+ODreODvOODq+OBrkFSTuOCkuWHuuWKm1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IGdpdGh1YlJvbGUucm9sZUFybixcbiAgICB9KTtcbiAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PlhYjjg5DjgrHjg4Pjg4jjga5BUk7jgpLlh7rliptcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVwbGljYXRpb25EZXN0aW5hdGlvbkJ1Y2tldEFybicsIHtcbiAgICAgIHZhbHVlOiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgfSk7XG4gIH1cbn0iXX0=