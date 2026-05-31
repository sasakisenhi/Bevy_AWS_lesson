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
        const hasExplicitAccount = Object.prototype.hasOwnProperty.call(props.env ?? {}, 'account');
        const explicitAccount = props.env?.account;
        if (!hasExplicitAccount || !explicitAccount || !ACCOUNT_ID_REGEX.test(explicitAccount)) {
            throw new Error('env.account must be explicitly set to a 12-digit AWS account ID. Set CDK_DEFAULT_ACCOUNT before synth/deploy.');
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MscUNBQTBDO0FBRTFDLCtCQUErQjtBQUMvQixNQUFNLGNBQWMsR0FBRztJQUNyQixjQUFjLEVBQUUsRUFBRTtJQUNsQixzQkFBc0IsRUFBRSxDQUFDO0lBQ3pCLGFBQWEsRUFBRSxnQkFBZ0I7SUFDL0IsaUJBQWlCLEVBQUUscUJBQXFCO0NBQ2hDLENBQUM7QUFDWCxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztBQUtwQyw4QkFBOEI7QUFDOUIsTUFBTSxrQkFBa0IsR0FBRztJQUN6QixZQUFZLEVBQUUsNkNBQTZDO0lBQzNELFNBQVMsRUFBRSxtQkFBbUI7SUFDOUIsVUFBVSxFQUFFLDBDQUEwQztJQUN0RCxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7SUFDcEMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLGdCQUFnQixFQUFFLGVBQWU7Q0FDekIsQ0FBQztBQUVYLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1RixNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQztRQUMzQyxJQUFJLENBQUMsa0JBQWtCLElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMs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JztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gJ2Nkay1uYWcnO1xuXG4vLyDoqK3lrprlgKTjgpLjgqrjg5bjgrjjgqfjgq/jg4jjgavjgb7jgajjgoHjgovvvIjjg57jgrjjg4Pjgq/jg4rjg7Pjg5Djg7zjga7mjpLpmaTvvIlcbmNvbnN0IFNUT1JBR0VfQ09ORklHID0ge1xuICBSRVRFTlRJT05fREFZUzogMzAsXG4gIEhJU1RPUllfUkVURU5USU9OX0RBWVM6IDcsXG4gIEJVQ0tFVF9QUkVGSVg6ICdiZXZ5LWFydGlmYWN0cycsXG4gIExPR19CVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMtbG9ncycsXG59IGFzIGNvbnN0O1xuY29uc3QgQUNDT1VOVF9JRF9SRUdFWCA9IC9eXFxkezEyfSQvO1xuXG5pbnRlcmZhY2UgQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzZWNvbmRhcnlCdWNrZXRBcm46IHN0cmluZztcbn1cbi8vR2l0SHViIE9JREPjga7oqK3lrprjgoLlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgavjgb7jgajjgoHjgotcbmNvbnN0IEdJVEhVQl9PSURDX0NPTkZJRyA9IHtcbiAgUFJPVklERVJfVVJMOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gIENMSUVOVF9JRDogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgVEhVTUJQUklOVDogJzY5MzhmZDRkOThiYWIwM2ZhYWRiOTdiMzQzOTY4MzFlMzc4MGExODgnLFxuICBERUZBVUxUX0JSQU5DSEVTOiBbJ21haW4nLCAnbWFzdGVyJ10sXG4gIFBMQUNFSE9MREVSX09XTkVSOiAnPGdpdGh1Yi1vd25lcj4nLFxuICBQTEFDRUhPTERFUl9SRVBPOiAnPGdpdGh1Yi1yZXBvPicsXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgY2xhc3MgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBjb25zdCBoYXNFeHBsaWNpdEFjY291bnQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocHJvcHMuZW52ID8/IHt9LCAnYWNjb3VudCcpO1xuICAgIGNvbnN0IGV4cGxpY2l0QWNjb3VudCA9IHByb3BzLmVudj8uYWNjb3VudDtcbiAgICBpZiAoIWhhc0V4cGxpY2l0QWNjb3VudCB8fCAhZXhwbGljaXRBY2NvdW50IHx8ICFBQ0NPVU5UX0lEX1JFR0VYLnRlc3QoZXhwbGljaXRBY2NvdW50KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnZW52LmFjY291bnQgbXVzdCBiZSBleHBsaWNpdGx5IHNldCB0byBhIDEyLWRpZ2l0IEFXUyBhY2NvdW50IElELiBTZXQgQ0RLX0RFRkFVTFRfQUNDT1VOVCBiZWZvcmUgc3ludGgvZGVwbG95LicsXG4gICAgICApO1xuICAgIH1cblxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8g5a6f6KGM5pmC44GrIC1jIGVudj1wcm9kIOOBqOa4oeOBm+OCi1xuICAgIGNvbnN0IGVudk5hbWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgpLjgrPjg7Pjg4bjgq3jgrnjg4jjgYvjgonlj5blvpfvvIjjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjgoLnlKjmhI/vvIlcbiAgICBjb25zdCBnaXRodWJPd25lciA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJPd25lcicpIHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUjtcbiAgICBjb25zdCBnaXRodWJSZXBvID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YlJlcG8nKSB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQTztcbiAgICBjb25zdCBnaXRodWJCcmFuY2ggPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViQnJhbmNoJyk7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoZXMgPSBnaXRodWJCcmFuY2hcbiAgICAgID8gW1N0cmluZyhnaXRodWJCcmFuY2gpXVxuICAgICAgOiBHSVRIVUJfT0lEQ19DT05GSUcuREVGQVVMVF9CUkFOQ0hFUztcbiAgICBcbiAgICAvLyDml6LlrZjjga5BUk7jgYzmmI7npLrnmoTjgavmjIflrprjgZXjgozjgabjgYTjgovloLTlkIjjgIHjgb7jgZ/jga9BV1PjgqLjgqvjgqbjg7Pjg4jjgavml6Ljgavjg5fjg63jg5DjgqTjg4Djg7zjgYzlrZjlnKjjgZnjgovjgajmg7PlrprjgZXjgozjgovloLTlkIjjga5BUk5cbiAgICBjb25zdCBleGlzdGluZ1Byb3ZpZGVyQXJuID0gYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWA7XG4gICAgXG4gICAgY29uc3QgZ2l0aHViU3VicyA9IGdpdGh1YkJyYW5jaGVzLm1hcChcbiAgICAgIChicmFuY2gpID0+IGByZXBvOiR7Z2l0aHViT3duZXJ9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvJHticmFuY2h9YCxcbiAgICApO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgYzjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjga7jgb7jgb7jga7loLTlkIjjga/orablkYrjgpLlh7rjgZlcbiAgICBpZiAoXG4gICAgICBnaXRodWJPd25lciA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSIHx8XG4gICAgICBnaXRodWJSZXBvID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQT1xuICAgICkge1xuICAgICAgY2RrLkFubm90YXRpb25zLm9mKHRoaXMpLmFkZFdhcm5pbmcoXG4gICAgICAgICdHaXRIdWIgT0lEQyB0cnVzdCBpcyB1c2luZyBwbGFjZWhvbGRlcnMuIFBhc3MgLWMgZ2l0aHViT3duZXI9PG93bmVyPiAtYyBnaXRodWJSZXBvPTxyZXBvPiBhbmQgb3B0aW9uYWxseSAtYyBnaXRodWJCcmFuY2g9PGJyYW5jaD4gYmVmb3JlIGRlcGxveW1lbnQuJyxcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIOOCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQXG5cbiAgICBjb25zdCBhcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke1NUT1JBR0VfQ09ORklHLkxPR19CVUNLRVRfUFJFRklYfS0ke2Vudk5hbWV9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgLy8gQXdzU29sdXRpb25zLVMxMCDlr77nrZY6XG4gICAgICAvLyDjgqLjgq/jgrvjgrnjg63jgrDlsILnlKjjg5DjgrHjg4Pjg4jjgafjgYLjgaPjgabjgoLjgIHjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgacgSFRUUFMoVExTKSDku6XlpJbjga5cbiAgICAgIC8vIOODquOCr+OCqOOCueODiO+8iGF3czpTZWN1cmVUcmFuc3BvcnQ9ZmFsc2XvvInjgpLmi5LlkKbjgZnjgovjgZPjgajjgYzmsYLjgoHjgonjgozjgovjgIJcbiAgICAgIC8vIEJldnlBcnRpZmFjdEJ1Y2tldCDjgajlkIzjgZjmlrnph53jgacgZW5mb3JjZVNTTCDjgpLmnInlirnljJbjgZnjgovjgIJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgfSk7XG4gICAgLy8gY2RrLW5hZ+OBp1Mz44Ki44Kv44K744K544Ot44Kw44OQ44Kx44OD44OI44Gr5a++44GZ44KL6K2m5ZGK44KS5oqR5Yi277yI44GT44Gu44OQ44Kx44OD44OI44Gv44Ki44Kv44K744K544Ot44Kw5bCC55So44Gn44CB44GV44KJ44Gr44Ki44Kv44K744K544Ot44Kw44Gu44ON44K544OI44KS6YG/44GR44KL44Gf44KB44Gr44K144O844OQ44O844Ki44Kv44K744K544Ot44Kw44KS54Sh5Yq544Gr44GX44Gm44GE44KL44Gf44KB77yJXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgYXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1TMScsXG4gICAgICAgICAgcmVhc29uOiAnVGhpcyBidWNrZXQgc3RvcmVzIFMzIGFjY2VzcyBsb2dzIGZvciBCZXZ5QXJ0aWZhY3RCdWNrZXQgYW5kIGRvZXMgbm90IHJlcXVpcmUgbmVzdGVkIHNlcnZlciBhY2Nlc3MgbG9nZ2luZy4nLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QnVja2V0Jywge1xuICAgICAgLy8g55Kw5aKD5ZCN44Go44Ki44Kr44Km44Oz44OISUTjgpLntYTjgb/lkIjjgo/jgZvjgabkuIDmhI/mgKfjgpLmi4Xkv51cbiAgICAgIGJ1Y2tldE5hbWU6IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7ZW52TmFtZX0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIFxuICAgICAgLy8g44K744Kt44Ol44Oq44OG44Kj5by35YyW44Gu44Gf44KB44Gu6Kit5a6a44KS6L+95YqgXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgLy8gUzPjg57jg43jg7zjgrjjg4nmmpflj7fljJbjgpLmnInlirnjgavjgZfjgabjgIHkv53lrZjjg4fjg7zjgr/jgpLmmpflj7fljJbjgZnjgotcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIC8vIEF3c1NvbHV0aW9ucy1TMTAg5a++562WOlxuICAgICAgLy8g44GT44Gu6Kit5a6a44KS5pyJ5Yq55YyW44GZ44KL44Go44CBQ0RLIOOBjOODkOOCseODg+ODiOODneODquOCt+ODvOOBq1xuICAgICAgLy8g44CMYXdzOlNlY3VyZVRyYW5zcG9ydCDjgYwgZmFsc2XvvIg9SFRUUOmAmuS/oe+8ieOBruODquOCr+OCqOOCueODiOOCkuaLkuWQpuOAjeOBmeOCi1xuICAgICAgLy8gRGVueSDjg6vjg7zjg6vjgpLoh6rli5XnlJ/miJDjgZnjgovjgIJcbiAgICAgIC8vIOOBk+OCjOOBq+OCiOOCiuOAgeW9k+ipsuODkOOCseODg+ODiOOBuOOBruOCouOCr+OCu+OCueOCkiBIVFRQUyhUTFMpIOOBruOBv+OBq+WItumZkOOBp+OBjeOCi+OAglxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIC8vIOODkOODvOOCuOODp+ODi+ODs+OCsOOCkuacieWKueOBq+OBl+OBpuOAgeiqpOOBo+OBpuWJiumZpOOBleOCjOOBn+OCquODluOCuOOCp+OCr+ODiOOBruW+qeWFg+OCkuWPr+iDveOBq+OBmeOCi1xuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgLy8g44K544K/44OD44Kv5YmK6Zmk5pmC44Gr44OQ44Kx44OD44OI44KC5YmK6Zmk44GZ44KL6Kit5a6a77yI5pys55Wq55Kw5aKD44Gn44Gv5rOo5oSP44GM5b+F6KaB77yJXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgLy8g44OQ44Kx44OD44OI5YmK6Zmk5pmC44Gr44Kq44OW44K444Kn44Kv44OI44KC5YmK6Zmk44GZ44KL6Kit5a6a77yI5pys55Wq55Kw5aKD44Gn44Gv5rOo5oSP44GM5b+F6KaB77yJXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcblxuICAgICAgLyog44Gd44Gu44G744GL6L+95Yqg5Y+v6IO944Gq6Kit5a6aXG4gICAgICAgICAg44O744Ki44Kv44K744K544Ot44Kw44Gu6Kit5a6aXG4gICAgICAgICAg44O754m55a6a44Gu44Oq44O844K444On44Oz44Gr44Os44OX44Oq44Kx44O844K344On44Oz44GZ44KL6Kit5a6aXG4gICAgICAgICAg44O744Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44Gn54m55a6a44Gu44OX44Os44OV44Kj44OD44Kv44K544KE44K/44Kw44Gr5Z+644Gl44GE44Gm44Kq44OW44K444Kn44Kv44OI44KS566h55CG44GZ44KL6Kit5a6aXG4gICAgICAgICAg44O744Ki44Kv44K744K544Kz44Oz44OI44Ot44O844Or44Oq44K544OI77yIQUNM77yJ44KE44OQ44Kx44OD44OI44Od44Oq44K344O844Gn57Sw44GL44GE44Ki44Kv44K744K55Yi25b6h44KS6Kit5a6a44GZ44KL44GT44Go44KC5Y+v6IO9XG4gICAgICAgICAg44Gq44GpXG4gICAgICAgICAg6Kmz44GX44GP44Gv5LiL6KiY44GuVVJM44KS5Y+C54WnIFxuICAgICAgICAgIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX3MzLkJ1Y2tldFByb3BzLmh0bWxcbiAgICAgICAqL1xuXG4gICAgICAvLyDjg6njgqTjg5XjgrXjgqTjgq/jg6vjg6vjg7zjg6vjgpLov73liqDjgZfjgablj6TjgYTjgqrjg5bjgrjjgqfjgq/jg4jjgpLoh6rli5XnmoTjgavliYrpmaRcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0V4cGlyZU9sZEJ1aWxkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAvLyDlrprmlbDjgpLkvb/nlKhcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5SRVRFTlRJT05fREFZUyksXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhTVE9SQUdFX0NPTkZJRy5ISVNUT1JZX1JFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIC8vIOOCouOCr+OCu+OCueODreOCsOOBruioreWumuOBk+OCjOOBjOOBquOBhOOBqHMx44Gu6K2m5ZGK44GM5Ye644KL44CCXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiBhcnRpZmFjdEFjY2Vzc0xvZ0J1Y2tldCxcbiAgICAgIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxuICAgIH0pO1xuICAgIC8vIOKYhSDkv67mraPnrofmiYDvvJrluLjjgavmlrDjgZfjgYTjg5fjg63jg5DjgqTjg4Djg7zjgpLkvZzjgovjga7jgafjga/jgarjgY/jgIHml6LlrZjjga5BUk7jgpLlj4LnhafjgZnjgotcbiAgICAvLyDliJ3lm57kvZzmiJDmmYLvvIjjg5fjg63jg5DjgqTjg4Djg7zjgYzjgarjgYTnirbmhYvvvInjga/jgIFgZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybmAg44Gn44Gv44Gq44GP5paw6KaP5L2c5oiQ44GZ44KL44GL44CB44G+44Gf44Gv5L6L5aSW44KS6ICD5oWu44GZ44KL5b+F6KaB44GM44GC44KK44G+44GZ44GM44CBXG4gICAgLy8g5pei5a2Y44Gu44Ko44Op44O877yIRW50aXR5QWxyZWFkeUV4aXN0c0V4Y2VwdGlvbu+8ieOCkuWbnumBv+OBmeOCi+OBn+OCgeOAgeOBmeOBp+OBq+WtmOWcqOOBmeOCi+WgtOWQiOOBr+aXouWtmOOBrkFSTuOBp+WPgueFp+OBl+OBvuOBmeOAglxuICAgIC8vIENES+OBrue1hOOBv+i+vOOBv+ODoeOCveODg+ODiSBgT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm5gIOOCkuS9v+eUqOOBl+OBvuOBmeOAglxuXG4gICAgY29uc3QgZ2l0aHViUHJvdmlkZXIgPSBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgICB0aGlzLFxuICAgICAgJ0dpdGh1YlByb3ZpZGVyJyxcbiAgICAgIGV4aXN0aW5nUHJvdmlkZXJBcm4sXG4gICAgKTtcbiAgICAvLyBHaXRIdWIgQWN0aW9uc+OBjOeJueWumuOBruODquODneOCuOODiOODquOBqOODluODqeODs+ODgeOBi+OCieOBruOBv+ODreODvOODq+OCkuW8leOBjeWPl+OBkeOCieOCjOOCi+OCiOOBhuOBq+OBmeOCi1xuICAgIGNvbnN0IGdpdGh1YlJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0dpdGh1YkFjdGlvbnNSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBnaXRodWJQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiBHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lELFxuICAgICAgICAgIH0sXG4gICAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IGdpdGh1YlN1YnMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgYXNzdW1lZCBieSBHaXRIdWIgQWN0aW9ucyBmb3IgYXJ0aWZhY3QgYnVja2V0IGFjY2VzcycsXG4gICAgfSk7XG5cbiAgICAvLyBBd3NTb2x1dGlvbnMtSUFNNSDlr77nrZbvvIhHaXRIdWIgQWN0aW9ucyDnlKjjg63jg7zjg6vjga7mnIDlsI/mqKnpmZDljJbvvIk6XG4gICAgLy8gYGdyYW50UmVhZFdyaXRlYCDjga8gYHMzOkdldE9iamVjdCpgIC8gYHMzOkxpc3QqYCDjgarjganjga7jg6/jgqTjg6vjg4njgqvjg7zjg4kgQWN0aW9uIOOCkuWQq+OCgOOBn+OCgeOAgVxuICAgIC8vIFdvcmtmbG93IOOBp+Wun+mam+OBq+S9v+OBhiBTMyDmk43kvZzjgaDjgZHjgpLmmI7npLrjgZnjgovjgIJcbiAgICAvLyDlj4Lnhafjg6/jg7zjgq/jg5Xjg63jg7w6IGAuZ2l0aHViL3dvcmtmbG93cy9hcnRpZmFjdC55bWxgXG4gICAgLy8gLSBhd3MgczMgbHNcbiAgICAvLyAtIGF3cyBzMyBzeW5jIGRpc3QvIHMzOi8vLi4uL2FydGlmYWN0cy8ke0dJVEhVQl9TSEF9L1xuICAgIC8vIC0gYXdzIHMzIGNwIC0gczM6Ly8uLi4vYXJ0aWZhY3RzLyR7R0lUSFVCX1NIQX0vX0NPTVBMRVRFXG4gICAgLy8gLSBhd3MgczMgY3AgLSBzMzovLy4uLi90YWdzL3N0YWdpbmdfbGF0ZXN0LnR4dFxuICAgIC8v44Gq44Gc5pyA5bCP44Go44GE44GI44KL44GL44CALSBMaXN0QnVja2V0IOOBr+ODkOOCseODg+ODiOOBruWtmOWcqOeiuuiqjeOBqOOCquODluOCuOOCp+OCr+ODiOOCreODvOOBruWIl+aMmeOBq+W/heimgeOBp+OBmeOBjOOAgeeJueWumuOBruODl+ODrOODleOCo+ODg+OCr+OCueOBp+OBruWIl+aMmeOCkuioseWPr+OBmeOCi+OBk+OBqOOBr+OBp+OBjeOBquOBhOOBn+OCgeOAgeODkOOCseODg+ODiOWFqOS9k+OBq+WvvuOBl+OBpiBMaXN0QnVja2V0IOOCkuioseWPr+OBl+OBvuOBmeOAglxuICAgIC8vIC0gR2V0QnVja2V0TG9jYXRpb24g44Gv44Oq44O844K444On44Oz56K66KqN44Gu44Gf44KB44Gr5b+F6KaBXG4gICAgLy8gLSBHZXRPYmplY3QgLyBQdXRPYmplY3QgLyBEZWxldGVPYmplY3QgLyBBYm9ydE11bHRpcGFydFVwbG9hZCAvIExpc3RNdWx0aXBhcnRVcGxvYWRQYXJ0cyDjga/jgqrjg5bjgrjjgqfjgq/jg4jjga7jgqLjg4Pjg5fjg63jg7zjg4njgajnrqHnkIbjgavlv4XopoHjgafjgIHjgZPjgozjgonjga/jgqrjg5bjgrjjgqfjgq/jg4jjg6zjg5njg6vjga7jg6rjgr3jg7zjgrnmjIflrprjgYzlv4XopoHjgarjgZ/jgoHjgIFBUk7mnKvlsL7jgasgYC8qYCDjgpLku5jjgZHjgabjg5DjgrHjg4Pjg4jlhoXjga7lhajjgqrjg5bjgrjjgqfjgq/jg4jjgpLlr77osaHjgajjgZfjgb7jgZnjgIJcbiAgICAvLyDjgZPjgozjgonjga7jgqLjgq/jgrfjg6fjg7Pjga/jgIFHaXRIdWIgQWN0aW9uc+OBjOODk+ODq+ODieaIkOaenOeJqeOCkuODkOOCseODg+ODiOOBq+OCouODg+ODl+ODreODvOODieOBl+OAgeW/heimgeOBq+W/nOOBmOOBpueuoeeQhuOBmeOCi+OBn+OCgeOBq+W/heimgeOBquacgOWwj+mZkOOBruaoqemZkOOCu+ODg+ODiOOBp+OBmeOAglxuICAgIGdpdGh1YlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgJ3MzOkFib3J0TXVsdGlwYXJ0VXBsb2FkJyxcbiAgICAgICAgICAnczM6TGlzdE11bHRpcGFydFVwbG9hZFBhcnRzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLUlBTTXvvIhSZXNvdXJjZSB3aWxkY2FyZO+8iemZkOWumiBzdXBwcmVzczpcbiAgICAvLyBPYmplY3Qg44Os44OZ44Or44GuIFMzIOaTjeS9nOOBryBBUk4g5pyr5bC+IGAvKmAg44GM5b+F6KaB77yI44Kq44OW44K444Kn44Kv44OI44Kt44O844KS5YiX5oyZ44Gn44GN44Gq44GE44Gf44KB77yJ44CCXG4gICAgLy8gQWN0aW9uIOOBr+aYjuekuuWIl+aMmea4iOOBv+OBpyB3aWxkY2FyZCDjgpLkvb/jgaPjgabjgYTjgarjgYTjgZ/jgoHjgIFSZXNvdXJjZSDjga7jgb/jgpLpmZDlrpogc3VwcHJlc3Mg44GZ44KL44CCXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgZ2l0aHViUm9sZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTUnLFxuICAgICAgICAgIHJlYXNvbjogJ0dpdEh1YiBBY3Rpb25zIHVwbG9hZHMgYnVpbGQgb3V0cHV0cyB1bmRlciBkeW5hbWljIG9iamVjdCBrZXlzIChjb21taXQgU0hBIHBhdGhzKSwgd2hpY2ggcmVxdWlyZXMgb2JqZWN0LWxldmVsIHJlc291cmNlIHdpbGRjYXJkIHdoaWxlIGFjdGlvbnMgYXJlIGV4cGxpY2l0bHkgc2NvcGVkLicsXG4gICAgICAgICAgYXBwbGllc1RvOiBbeyByZWdleDogJy9eUmVzb3VyY2U6Oi4qXFxcXC9cXFxcKiQvJyB9XSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICAvLyBTM+OCr+ODreOCueODquODvOOCuOODp+ODs+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBruioreWumlxuICAgIGNvbnN0IHJlcGxpY2F0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUzNSZXBsaWNhdGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnczMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIHVzZWQgYnkgUzMgdG8gcmVwbGljYXRlIG9iamVjdHMgdG8gdGhlIHNlY29uZGFyeSByZWdpb24gYnVja2V0JyxcbiAgICB9KTtcbiAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjgavlv4XopoHjgarmqKnpmZDjgpLjg63jg7zjg6vjgavku5jkuI5cbiAgICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0UmVwbGljYXRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIC8vIOOCquODluOCuOOCp+OCr+ODiOOBruODrOODl+ODquOCseODvOOCt+ODp+ODs+OBq+W/heimgeOBquaoqemZkOOCkuODreODvOODq+OBq+S7mOS4jlxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uRm9yUmVwbGljYXRpb24nLFxuICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uQWNsJyxcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvblRhZ2dpbmcnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtgJHthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz5YWI44Gu44OQ44Kx44OD44OI44Gr5a++44GZ44KL5qip6ZmQ44KS44Ot44O844Or44Gr5LuY5LiOXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZU9iamVjdCcsXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZURlbGV0ZScsXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZVRhZ3MnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtgJHtwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm59LypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBBd3NTb2x1dGlvbnMtSUFNNe+8iFJlcGxpY2F0aW9uIFJvbGUg44GuIFJlc291cmNlIHdpbGRjYXJk77yJ6ZmQ5a6aIHN1cHByZXNzOlxuICAgIC8vIOWFqOmHj+OCr+ODreOCueODquODvOOCuOODp+ODs+ODrOODl+ODquOCseODvOOCt+ODp+ODs+imgeS7tuOBp+OBryBvYmplY3QtbGV2ZWwg44GuIGAvKmAg44GM5b+F6KaB44CCXG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz5a++6LGh44KS44OX44Os44OV44Kj44OD44Kv44K56ZmQ5a6a44GX44Gq44GE54++6KGM5LuV5qeY44Gu44Gf44KB44CBUmVzb3VyY2Ug44Gu44G/44KS6ZmQ5a6aIHN1cHByZXNzIOOBmeOCi+OAglxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHJlcGxpY2F0aW9uUm9sZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTUnLFxuICAgICAgICAgIHJlYXNvbjogJ0Nyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbiBpcyBjb25maWd1cmVkIGZvciBhbGwgb2JqZWN0cywgd2hpY2ggcmVxdWlyZXMgb2JqZWN0LWxldmVsIHdpbGRjYXJkIHJlc291cmNlcyBpbiBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGJ1Y2tldCBBUk5zLicsXG4gICAgICAgICAgYXBwbGllc1RvOiBbeyByZWdleDogJy9eUmVzb3VyY2U6Oi4qXFxcXC9cXFxcKiQvJyB9XSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG4gICAgLy8gUzPjgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7oqK3lrprjgpLjg5DjgrHjg4Pjg4jjgavov73liqBcbiAgICBjb25zdCBjZm5CdWNrZXQgPSBhcnRpZmFjdEJ1Y2tldC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBzMy5DZm5CdWNrZXQ7XG4gICAgY2ZuQnVja2V0LnJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IHtcbiAgICAgIHJvbGU6IHJlcGxpY2F0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgLy8g5a6a5pWw44KS5L2/55So44GX44Gm44Os44OX44Oq44Kx44O844K344On44Oz44Or44O844Or44KS5a6a576pXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgLy8g44Or44O844OrSUTjga/ku7vmhI/jga7mloflrZfliJfjgafjgIHopIfmlbDjg6vjg7zjg6vjgYzjgYLjgovloLTlkIjjga/kuIDmhI/jgafjgYLjgovlv4XopoHjgYzjgYLjgorjgb7jgZlcbiAgICAgICAgICBpZDogJ0Nyb3NzUmVnaW9uUmVwbGljYXRpb25SdWxlJyxcbiAgICAgICAgICAvLyDjg6vjg7zjg6vjgpLmnInlirnjgavjgZnjgotcbiAgICAgICAgICBzdGF0dXM6ICdFbmFibGVkJyxcbiAgICAgICAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7lhKrlhYjpoIbkvY3vvIjopIfmlbDjg6vjg7zjg6vjgYzjgYLjgovloLTlkIjjgavpgannlKjjgZXjgozjgovpoIbluo/jgpLlrprnvqnvvIlcbiAgICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7lr77osaHjgpLmjIflrprvvIjjgZPjga7kvovjgafjga/lhajjgabjga7jgqrjg5bjgrjjgqfjgq/jg4jjgpLjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PvvIlcbiAgICAgICAgICBmaWx0ZXI6IHtcbiAgICAgICAgICAgIHByZWZpeDogJycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyDjg5Djg7zjgrjjg6fjg4vjg7PjgrDjgYzmnInlirnjgarjg5DjgrHjg4Pjg4jjga7loLTlkIjjgIHliYrpmaTjg57jg7zjgqvjg7zjgoLjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PjgZnjgovoqK3lrppcbiAgICAgICAgICBkZWxldGVNYXJrZXJSZXBsaWNhdGlvbjoge1xuICAgICAgICAgICAgc3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7lrpvlhYjjgpLmjIflrprvvIjjgrvjgqvjg7Pjg4Djg6rjg5DjgrHjg4Pjg4jjga5BUk7jgpLkvb/nlKjvvIlcbiAgICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0OiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfTtcbiAgICAvLyDjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PoqK3lrprjga7kvp3lrZjplqLkv4LjgpLmmI7npLrnmoTjgavov73liqDvvIhDREvjgYzoh6rli5XnmoTjgavlh6bnkIbjgZnjgovjgZPjgajjgoLjgYLjgorjgb7jgZnjgYzjgIHmmI7npLrnmoTjgavjgZnjgovjgZPjgajjgafnorrlrp/jgavpoIbluo/jgYzkv53oqLzjgZXjgozjgb7jgZnvvIlcbiAgICBjZm5CdWNrZXQuYWRkRGVwZW5kZW5jeShyZXBsaWNhdGlvblJvbGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgaWFtLkNmblJvbGUpO1xuICAgIC8vIOODkOOCseODg+ODiOWQjeOCkuWHuuWKm1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWNrZXROYW1lRXhwb3J0Jywge1xuICAgICAgdmFsdWU6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjg63jg7zjg6vjga5BUk7jgpLlh7rliptcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBnaXRodWJSb2xlLnJvbGVBcm4sXG4gICAgfSk7XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz5YWI44OQ44Kx44OD44OI44GuQVJO44KS5Ye65YqbXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1JlcGxpY2F0aW9uRGVzdGluYXRpb25CdWNrZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgIH0pO1xuICB9XG59Il19