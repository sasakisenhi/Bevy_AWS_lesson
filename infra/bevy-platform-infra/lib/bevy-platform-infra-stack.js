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
// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に指定されているか、またはAWSアカウントに既にプロバイダーが存在すると想定される場合のARNを検証
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MscUNBQTBDO0FBRTFDLCtCQUErQjtBQUMvQixNQUFNLGNBQWMsR0FBRztJQUNyQixjQUFjLEVBQUUsRUFBRTtJQUNsQixzQkFBc0IsRUFBRSxDQUFDO0lBQ3pCLGFBQWEsRUFBRSxnQkFBZ0I7SUFDL0IsaUJBQWlCLEVBQUUscUJBQXFCO0NBQ2hDLENBQUM7QUFDWCxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztBQUtwQyw4QkFBOEI7QUFDOUIsTUFBTSxrQkFBa0IsR0FBRztJQUN6QixZQUFZLEVBQUUsNkNBQTZDO0lBQzNELFNBQVMsRUFBRSxtQkFBbUI7SUFDOUIsVUFBVSxFQUFFLDBDQUEwQztJQUN0RCxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7SUFDcEMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLGdCQUFnQixFQUFFLGVBQWU7Q0FDekIsQ0FBQztBQUVYLHNEQUFzRDtBQUN0RCxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25ELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0M7UUFDMUUsbUVBQW1FO1FBQ25FLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDO1FBQzNDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLGVBQWUsSUFBSSxD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KiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSAnY2RrLW5hZyc7XG5cbi8vIOioreWumuWApOOCkuOCquODluOCuOOCp+OCr+ODiOOBq+OBvuOBqOOCgeOCi++8iOODnuOCuOODg+OCr+ODiuODs+ODkOODvOOBruaOkumZpO+8iVxuY29uc3QgU1RPUkFHRV9DT05GSUcgPSB7XG4gIFJFVEVOVElPTl9EQVlTOiAzMCxcbiAgSElTVE9SWV9SRVRFTlRJT05fREFZUzogNyxcbiAgQlVDS0VUX1BSRUZJWDogJ2JldnktYXJ0aWZhY3RzJyxcbiAgTE9HX0JVQ0tFVF9QUkVGSVg6ICdiZXZ5LWFydGlmYWN0cy1sb2dzJyxcbn0gYXMgY29uc3Q7XG5jb25zdCBBQ0NPVU5UX0lEX1JFR0VYID0gL15cXGR7MTJ9JC87XG5cbmludGVyZmFjZSBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nO1xufVxuLy9HaXRIdWIgT0lEQ+OBruioreWumuOCguWumuaVsOOCquODluOCuOOCp+OCr+ODiOOBq+OBvuOBqOOCgeOCi1xuY29uc3QgR0lUSFVCX09JRENfQ09ORklHID0ge1xuICBQUk9WSURFUl9VUkw6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgQ0xJRU5UX0lEOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuICBUSFVNQlBSSU5UOiAnNjkzOGZkNGQ5OGJhYjAzZmFhZGI5N2IzNDM5NjgzMWUzNzgwYTE4OCcsXG4gIERFRkFVTFRfQlJBTkNIRVM6IFsnbWFpbicsICdtYXN0ZXInXSxcbiAgUExBQ0VIT0xERVJfT1dORVI6ICc8Z2l0aHViLW93bmVyPicsXG4gIFBMQUNFSE9MREVSX1JFUE86ICc8Z2l0aHViLXJlcG8+Jyxcbn0gYXMgY29uc3Q7XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44GoR2l0SHViIE9JREPjg63jg7zjg6vjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq9cbmV4cG9ydCBjbGFzcyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcykge1xuICAgIC8vIEFXU+OCouOCq+OCpuODs+ODiElE44GM5piO56S655qE44Gr5oyH5a6a44GV44KM44Gm44GE44KL44GL44CB44G+44Gf44GvQVdT44Ki44Kr44Km44Oz44OI44Gr5pei44Gr44OX44Ot44OQ44Kk44OA44O844GM5a2Y5Zyo44GZ44KL44Go5oOz5a6a44GV44KM44KL5aC05ZCI44GuQVJO44KS5qSc6Ki8XG4gICAgY29uc3QgaGFzRXhwbGljaXRBY2NvdW50ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3BzLmVudiA/PyB7fSwgJ2FjY291bnQnKTtcbiAgICBjb25zdCBleHBsaWNpdEFjY291bnQgPSBwcm9wcy5lbnY/LmFjY291bnQ7XG4gICAgaWYgKCFoYXNFeHBsaWNpdEFjY291bnQgfHwgIWV4cGxpY2l0QWNjb3VudCB8fCAhQUNDT1VOVF9JRF9SRUdFWC50ZXN0KGV4cGxpY2l0QWNjb3VudCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ2Vudi5hY2NvdW50IG11c3QgYmUgZXhwbGljaXRseSBzZXQgdG8gYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRC4gU2V0IENES19ERUZBVUxUX0FDQ09VTlQgYmVmb3JlIHN5bnRoL2RlcGxveS4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIOWun+ihjOaZguOBqyAtYyBlbnY9cHJvZCDjgajmuKHjgZvjgotcbiAgICBjb25zdCBlbnZOYW1lID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xuICAgIC8vIEdpdEh1YiBPSURD44Gu6Kit5a6a44KS44Kz44Oz44OG44Kt44K544OI44GL44KJ5Y+W5b6X77yI44OX44Os44O844K544Ob44Or44OA44O844KC55So5oSP77yJXG4gICAgY29uc3QgZ2l0aHViT3duZXIgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViT3duZXInKSB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfT1dORVI7XG4gICAgY29uc3QgZ2l0aHViUmVwbyA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJSZXBvJykgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE87XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YkJyYW5jaCcpO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaGVzID0gZ2l0aHViQnJhbmNoXG4gICAgICA/IFtTdHJpbmcoZ2l0aHViQnJhbmNoKV1cbiAgICAgIDogR0lUSFVCX09JRENfQ09ORklHLkRFRkFVTFRfQlJBTkNIRVM7XG4gICAgXG4gICAgLy8g5pei5a2Y44GuQVJO44GM5piO56S655qE44Gr5oyH5a6a44GV44KM44Gm44GE44KL5aC05ZCI44CB44G+44Gf44GvQVdT44Ki44Kr44Km44Oz44OI44Gr5pei44Gr44OX44Ot44OQ44Kk44OA44O844GM5a2Y5Zyo44GZ44KL44Go5oOz5a6a44GV44KM44KL5aC05ZCI44GuQVJOXG4gICAgY29uc3QgZXhpc3RpbmdQcm92aWRlckFybiA9IGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9Om9pZGMtcHJvdmlkZXIvdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb21gO1xuICAgIFxuICAgIGNvbnN0IGdpdGh1YlN1YnMgPSBnaXRodWJCcmFuY2hlcy5tYXAoXG4gICAgICAoYnJhbmNoKSA9PiBgcmVwbzoke2dpdGh1Yk93bmVyfS8ke2dpdGh1YlJlcG99OnJlZjpyZWZzL2hlYWRzLyR7YnJhbmNofWAsXG4gICAgKTtcblxuICAgIC8vIEdpdEh1YiBPSURD44Gu6Kit5a6a44GM44OX44Os44O844K544Ob44Or44OA44O844Gu44G+44G+44Gu5aC05ZCI44Gv6K2m5ZGK44KS5Ye644GZXG4gICAgaWYgKFxuICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICApIHtcbiAgICAgIGNkay5Bbm5vdGF0aW9ucy5vZih0aGlzKS5hZGRXYXJuaW5nKFxuICAgICAgICAnR2l0SHViIE9JREMgdHJ1c3QgaXMgdXNpbmcgcGxhY2Vob2xkZXJzLiBQYXNzIC1jIGdpdGh1Yk93bmVyPTxvd25lcj4gLWMgZ2l0aHViUmVwbz08cmVwbz4gYW5kIG9wdGlvbmFsbHkgLWMgZ2l0aHViQnJhbmNoPTxicmFuY2g+IGJlZm9yZSBkZXBsb3ltZW50LicsXG4gICAgICApO1xuICAgIH1cbiAgICAvLyDjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOCkuS9nOaIkFxuXG4gICAgY29uc3QgYXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCZXZ5QXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5MT0dfQlVDS0VUX1BSRUZJWH0tJHtlbnZOYW1lfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIC8vIEF3c1NvbHV0aW9ucy1TMTAg5a++562WOlxuICAgICAgLy8g44Ki44Kv44K744K544Ot44Kw5bCC55So44OQ44Kx44OD44OI44Gn44GC44Gj44Gm44KC44CB44OQ44Kx44OD44OI44Od44Oq44K344O844GnIEhUVFBTKFRMUykg5Lul5aSW44GuXG4gICAgICAvLyDjg6rjgq/jgqjjgrnjg4jvvIhhd3M6U2VjdXJlVHJhbnNwb3J0PWZhbHNl77yJ44KS5ouS5ZCm44GZ44KL44GT44Go44GM5rGC44KB44KJ44KM44KL44CCXG4gICAgICAvLyBCZXZ5QXJ0aWZhY3RCdWNrZXQg44Go5ZCM44GY5pa56Yed44GnIGVuZm9yY2VTU0wg44KS5pyJ5Yq55YyW44GZ44KL44CCXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuICAgIC8vIGNkay1uYWfjgadTM+OCouOCr+OCu+OCueODreOCsOODkOOCseODg+ODiOOBq+WvvuOBmeOCi+itpuWRiuOCkuaKkeWItu+8iOOBk+OBruODkOOCseODg+ODiOOBr+OCouOCr+OCu+OCueODreOCsOWwgueUqOOBp+OAgeOBleOCieOBq+OCouOCr+OCu+OCueODreOCsOOBruODjeOCueODiOOCkumBv+OBkeOCi+OBn+OCgeOBq+OCteODvOODkOODvOOCouOCr+OCu+OCueODreOCsOOCkueEoeWKueOBq+OBl+OBpuOBhOOCi+OBn+OCge+8iVxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGFydGlmYWN0QWNjZXNzTG9nQnVja2V0LFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtUzEnLFxuICAgICAgICAgIHJlYXNvbjogJ1RoaXMgYnVja2V0IHN0b3JlcyBTMyBhY2Nlc3MgbG9ncyBmb3IgQmV2eUFydGlmYWN0QnVja2V0IGFuZCBkb2VzIG5vdCByZXF1aXJlIG5lc3RlZCBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcuJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldCcsIHtcbiAgICAgIC8vIOeSsOWig+WQjeOBqOOCouOCq+OCpuODs+ODiElE44KS57WE44G/5ZCI44KP44Gb44Gm5LiA5oSP5oCn44KS5ouF5L+dXG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYfS0ke2Vudk5hbWV9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBcbiAgICAgIC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOBruioreWumuOCkui/veWKoFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIC8vIFMz44Oe44ON44O844K444OJ5pqX5Y+35YyW44KS5pyJ5Yq544Gr44GX44Gm44CB5L+d5a2Y44OH44O844K/44KS5pqX5Y+35YyW44GZ44KLXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyBBd3NTb2x1dGlvbnMtUzEwIOWvvuetljpcbiAgICAgIC8vIOOBk+OBruioreWumuOCkuacieWKueWMluOBmeOCi+OBqOOAgUNESyDjgYzjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgatcbiAgICAgIC8vIOOAjGF3czpTZWN1cmVUcmFuc3BvcnQg44GMIGZhbHNl77yIPUhUVFDpgJrkv6HvvInjga7jg6rjgq/jgqjjgrnjg4jjgpLmi5LlkKbjgI3jgZnjgotcbiAgICAgIC8vIERlbnkg44Or44O844Or44KS6Ieq5YuV55Sf5oiQ44GZ44KL44CCXG4gICAgICAvLyDjgZPjgozjgavjgojjgorjgIHlvZPoqbLjg5DjgrHjg4Pjg4jjgbjjga7jgqLjgq/jgrvjgrnjgpIgSFRUUFMoVExTKSDjga7jgb/jgavliLbpmZDjgafjgY3jgovjgIJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICAvLyDjg5Djg7zjgrjjg6fjg4vjg7PjgrDjgpLmnInlirnjgavjgZfjgabjgIHoqqTjgaPjgabliYrpmaTjgZXjgozjgZ/jgqrjg5bjgrjjgqfjgq/jg4jjga7lvqnlhYPjgpLlj6/og73jgavjgZnjgotcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIC8vIOOCueOCv+ODg+OCr+WJiumZpOaZguOBq+ODkOOCseODg+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIC8vIOODkOOCseODg+ODiOWJiumZpOaZguOBq+OCquODluOCuOOCp+OCr+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG5cbiAgICAgIC8qIOOBneOBruOBu+OBi+i/veWKoOWPr+iDveOBquioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueODreOCsOOBruioreWumlxuICAgICAgICAgIOODu+eJueWumuOBruODquODvOOCuOODp+ODs+OBq+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBmeOCi+ioreWumlxuICAgICAgICAgIOODu+ODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OBp+eJueWumuOBruODl+ODrOODleOCo+ODg+OCr+OCueOChOOCv+OCsOOBq+WfuuOBpeOBhOOBpuOCquODluOCuOOCp+OCr+ODiOOCkueuoeeQhuOBmeOCi+ioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueOCs+ODs+ODiOODreODvOODq+ODquOCueODiO+8iEFDTO+8ieOChOODkOOCseODg+ODiOODneODquOCt+ODvOOBp+e0sOOBi+OBhOOCouOCr+OCu+OCueWItuW+oeOCkuioreWumuOBmeOCi+OBk+OBqOOCguWPr+iDvVxuICAgICAgICAgIOOBquOBqVxuICAgICAgICAgIOips+OBl+OBj+OBr+S4i+iomOOBrlVSTOOCkuWPgueFpyBcbiAgICAgICAgICBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19zMy5CdWNrZXRQcm9wcy5odG1sXG4gICAgICAgKi9cblxuICAgICAgLy8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44KS6L+95Yqg44GX44Gm5Y+k44GE44Kq44OW44K444Kn44Kv44OI44KS6Ieq5YuV55qE44Gr5YmK6ZmkXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdFeHBpcmVPbGRCdWlsZHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgLy8g5a6a5pWw44KS5L2/55SoXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuUkVURU5USU9OX0RBWVMpLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuSElTVE9SWV9SRVRFTlRJT05fREFZUyksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICAvLyDjgqLjgq/jgrvjgrnjg63jgrDjga7oqK3lrprjgZPjgozjgYzjgarjgYTjgahzMeOBruitpuWRiuOBjOWHuuOCi+OAglxuICAgICAgc2VydmVyQWNjZXNzTG9nc0J1Y2tldDogYXJ0aWZhY3RBY2Nlc3NMb2dCdWNrZXQsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcbiAgICB9KTtcbiAgICAvLyDimIUg5L+u5q2j566H5omA77ya5bi444Gr5paw44GX44GE44OX44Ot44OQ44Kk44OA44O844KS5L2c44KL44Gu44Gn44Gv44Gq44GP44CB5pei5a2Y44GuQVJO44KS5Y+C54Wn44GZ44KLXG4gICAgLy8g5Yid5Zue5L2c5oiQ5pmC77yI44OX44Ot44OQ44Kk44OA44O844GM44Gq44GE54q25oWL77yJ44Gv44CBYGZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm5gIOOBp+OBr+OBquOBj+aWsOimj+S9nOaIkOOBmeOCi+OBi+OAgeOBvuOBn+OBr+S+i+WkluOCkuiAg+aFruOBmeOCi+W/heimgeOBjOOBguOCiuOBvuOBmeOBjOOAgVxuICAgIC8vIOaXouWtmOOBruOCqOODqeODvO+8iEVudGl0eUFscmVhZHlFeGlzdHNFeGNlcHRpb27vvInjgpLlm57pgb/jgZnjgovjgZ/jgoHjgIHjgZnjgafjgavlrZjlnKjjgZnjgovloLTlkIjjga/ml6LlrZjjga5BUk7jgaflj4LnhafjgZfjgb7jgZnjgIJcbiAgICAvLyBDREvjga7ntYTjgb/ovrzjgb/jg6Hjgr3jg4Pjg4kgYE9wZW5JZENvbm5lY3RQcm92aWRlci5mcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuYCDjgpLkvb/nlKjjgZfjgb7jgZnjgIJcblxuICAgIGNvbnN0IGdpdGh1YlByb3ZpZGVyID0gaWFtLk9wZW5JZENvbm5lY3RQcm92aWRlci5mcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuKFxuICAgICAgdGhpcyxcbiAgICAgICdHaXRodWJQcm92aWRlcicsXG4gICAgICBleGlzdGluZ1Byb3ZpZGVyQXJuLFxuICAgICk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjgYznibnlrprjga7jg6rjg53jgrjjg4jjg6rjgajjg5bjg6njg7Pjg4HjgYvjgonjga7jgb/jg63jg7zjg6vjgpLlvJXjgY3lj5fjgZHjgonjgozjgovjgojjgYbjgavjgZnjgotcbiAgICBjb25zdCBnaXRodWJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgZ2l0aHViUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogR0lUSFVCX09JRENfQ09ORklHLkNMSUVOVF9JRCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBnaXRodWJTdWJzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIGFzc3VtZWQgYnkgR2l0SHViIEFjdGlvbnMgZm9yIGFydGlmYWN0IGJ1Y2tldCBhY2Nlc3MnLFxuICAgIH0pO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLUlBTTUg5a++562W77yIR2l0SHViIEFjdGlvbnMg55So44Ot44O844Or44Gu5pyA5bCP5qip6ZmQ5YyW77yJOlxuICAgIC8vIGBncmFudFJlYWRXcml0ZWAg44GvIGBzMzpHZXRPYmplY3QqYCAvIGBzMzpMaXN0KmAg44Gq44Gp44Gu44Ov44Kk44Or44OJ44Kr44O844OJIEFjdGlvbiDjgpLlkKvjgoDjgZ/jgoHjgIFcbiAgICAvLyBXb3JrZmxvdyDjgaflrp/pmpvjgavkvb/jgYYgUzMg5pON5L2c44Gg44GR44KS5piO56S644GZ44KL44CCXG4gICAgLy8g5Y+C54Wn44Ov44O844Kv44OV44Ot44O8OiBgLmdpdGh1Yi93b3JrZmxvd3MvYXJ0aWZhY3QueW1sYFxuICAgIC8vIC0gYXdzIHMzIGxzXG4gICAgLy8gLSBhd3MgczMgc3luYyBkaXN0LyBzMzovLy4uLi9hcnRpZmFjdHMvJHtHSVRIVUJfU0hBfS9cbiAgICAvLyAtIGF3cyBzMyBjcCAtIHMzOi8vLi4uL2FydGlmYWN0cy8ke0dJVEhVQl9TSEF9L19DT01QTEVURVxuICAgIC8vIC0gYXdzIHMzIGNwIC0gczM6Ly8uLi4vdGFncy9zdGFnaW5nX2xhdGVzdC50eHRcbiAgICAvL+OBquOBnOacgOWwj+OBqOOBhOOBiOOCi+OBi+OAgC0gTGlzdEJ1Y2tldCDjga/jg5DjgrHjg4Pjg4jjga7lrZjlnKjnorroqo3jgajjgqrjg5bjgrjjgqfjgq/jg4jjgq3jg7zjga7liJfmjJnjgavlv4XopoHjgafjgZnjgYzjgIHnibnlrprjga7jg5fjg6zjg5XjgqPjg4Pjgq/jgrnjgafjga7liJfmjJnjgpLoqLHlj6/jgZnjgovjgZPjgajjga/jgafjgY3jgarjgYTjgZ/jgoHjgIHjg5DjgrHjg4Pjg4jlhajkvZPjgavlr77jgZfjgaYgTGlzdEJ1Y2tldCDjgpLoqLHlj6/jgZfjgb7jgZnjgIJcbiAgICAvLyAtIEdldEJ1Y2tldExvY2F0aW9uIOOBr+ODquODvOOCuOODp+ODs+eiuuiqjeOBruOBn+OCgeOBq+W/heimgVxuICAgIC8vIC0gR2V0T2JqZWN0IC8gUHV0T2JqZWN0IC8gRGVsZXRlT2JqZWN0IC8gQWJvcnRNdWx0aXBhcnRVcGxvYWQgLyBMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMg44Gv44Kq44OW44K444Kn44Kv44OI44Gu44Ki44OD44OX44Ot44O844OJ44Go566h55CG44Gr5b+F6KaB44Gn44CB44GT44KM44KJ44Gv44Kq44OW44K444Kn44Kv44OI44Os44OZ44Or44Gu44Oq44K944O844K55oyH5a6a44GM5b+F6KaB44Gq44Gf44KB44CBQVJO5pyr5bC+44GrIGAvKmAg44KS5LuY44GR44Gm44OQ44Kx44OD44OI5YaF44Gu5YWo44Kq44OW44K444Kn44Kv44OI44KS5a++6LGh44Go44GX44G+44GZ44CCXG4gICAgLy8g44GT44KM44KJ44Gu44Ki44Kv44K344On44Oz44Gv44CBR2l0SHViIEFjdGlvbnPjgYzjg5Pjg6vjg4nmiJDmnpznianjgpLjg5DjgrHjg4Pjg4jjgavjgqLjg4Pjg5fjg63jg7zjg4njgZfjgIHlv4XopoHjgavlv5zjgZjjgabnrqHnkIbjgZnjgovjgZ/jgoHjgavlv4XopoHjgarmnIDlsI/pmZDjga7mqKnpmZDjgrvjg4Pjg4jjgafjgZnjgIJcbiAgICBnaXRodWJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgZ2l0aHViUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICAgJ3MzOkxpc3RNdWx0aXBhcnRVcGxvYWRQYXJ0cycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake2FydGlmYWN0QnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEF3c1NvbHV0aW9ucy1JQU0177yIUmVzb3VyY2Ugd2lsZGNhcmTvvInpmZDlrpogc3VwcHJlc3M6XG4gICAgLy8gT2JqZWN0IOODrOODmeODq+OBriBTMyDmk43kvZzjga8gQVJOIOacq+WwviBgLypgIOOBjOW/heimge+8iOOCquODluOCuOOCp+OCr+ODiOOCreODvOOCkuWIl+aMmeOBp+OBjeOBquOBhOOBn+OCge+8ieOAglxuICAgIC8vIEFjdGlvbiDjga/mmI7npLrliJfmjJnmuIjjgb/jgacgd2lsZGNhcmQg44KS5L2/44Gj44Gm44GE44Gq44GE44Gf44KB44CBUmVzb3VyY2Ug44Gu44G/44KS6ZmQ5a6aIHN1cHByZXNzIOOBmeOCi+OAglxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGdpdGh1YlJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgICByZWFzb246ICdHaXRIdWIgQWN0aW9ucyB1cGxvYWRzIGJ1aWxkIG91dHB1dHMgdW5kZXIgZHluYW1pYyBvYmplY3Qga2V5cyAoY29tbWl0IFNIQSBwYXRocyksIHdoaWNoIHJlcXVpcmVzIG9iamVjdC1sZXZlbCByZXNvdXJjZSB3aWxkY2FyZCB3aGlsZSBhY3Rpb25zIGFyZSBleHBsaWNpdGx5IHNjb3BlZC4nLFxuICAgICAgICAgIGFwcGxpZXNUbzogW3sgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcXFwvXFxcXCokLycgfV0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgLy8gUzPjgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjga7oqK3lrppcbiAgICBjb25zdCByZXBsaWNhdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1MzUmVwbGljYXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3MzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSB1c2VkIGJ5IFMzIHRvIHJlcGxpY2F0ZSBvYmplY3RzIHRvIHRoZSBzZWNvbmRhcnkgcmVnaW9uIGJ1Y2tldCcsXG4gICAgfSk7XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gr5b+F6KaB44Gq5qip6ZmQ44KS44Ot44O844Or44Gr5LuY5LiOXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbicsXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFthcnRpZmFjdEJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgfSksXG4gICAgKTtcbiAgICAvLyDjgqrjg5bjgrjjgqfjgq/jg4jjga7jg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7Pjgavlv4XopoHjgarmqKnpmZDjgpLjg63jg7zjg6vjgavku5jkuI5cbiAgICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkZvclJlcGxpY2F0aW9uJyxcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkFjbCcsXG4gICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25UYWdnaW5nJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOOBruODkOOCseODg+ODiOOBq+WvvuOBmeOCi+aoqemZkOOCkuODreODvOODq+OBq+S7mOS4jlxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpSZXBsaWNhdGVPYmplY3QnLFxuICAgICAgICAgICdzMzpSZXBsaWNhdGVEZWxldGUnLFxuICAgICAgICAgICdzMzpSZXBsaWNhdGVUYWdzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXdzU29sdXRpb25zLUlBTTXvvIhSZXBsaWNhdGlvbiBSb2xlIOOBriBSZXNvdXJjZSB3aWxkY2FyZO+8iemZkOWumiBzdXBwcmVzczpcbiAgICAvLyDlhajph4/jgq/jg63jgrnjg6rjg7zjgrjjg6fjg7Pjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PopoHku7bjgafjga8gb2JqZWN0LWxldmVsIOOBriBgLypgIOOBjOW/heimgeOAglxuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WvvuixoeOCkuODl+ODrOODleOCo+ODg+OCr+OCuemZkOWumuOBl+OBquOBhOePvuihjOS7leanmOOBruOBn+OCgeOAgVJlc291cmNlIOOBruOBv+OCkumZkOWumiBzdXBwcmVzcyDjgZnjgovjgIJcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICByZXBsaWNhdGlvblJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcbiAgICAgICAgICByZWFzb246ICdDcm9zcy1yZWdpb24gcmVwbGljYXRpb24gaXMgY29uZmlndXJlZCBmb3IgYWxsIG9iamVjdHMsIHdoaWNoIHJlcXVpcmVzIG9iamVjdC1sZXZlbCB3aWxkY2FyZCByZXNvdXJjZXMgaW4gc291cmNlIGFuZCBkZXN0aW5hdGlvbiBidWNrZXQgQVJOcy4nLFxuICAgICAgICAgIGFwcGxpZXNUbzogW3sgcmVnZXg6ICcvXlJlc291cmNlOjouKlxcXFwvXFxcXCokLycgfV0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuICAgIC8vIFMz44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44Gu6Kit5a6a44KS44OQ44Kx44OD44OI44Gr6L+95YqgXG4gICAgY29uc3QgY2ZuQnVja2V0ID0gYXJ0aWZhY3RCdWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgczMuQ2ZuQnVja2V0O1xuICAgIGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICByb2xlOiByZXBsaWNhdGlvblJvbGUucm9sZUFybixcbiAgICAgIC8vIOWumuaVsOOCkuS9v+eUqOOBl+OBpuODrOODl+ODquOCseODvOOCt+ODp+ODs+ODq+ODvOODq+OCkuWumue+qVxuICAgICAgcnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIC8vIOODq+ODvOODq0lE44Gv5Lu75oSP44Gu5paH5a2X5YiX44Gn44CB6KSH5pWw44Or44O844Or44GM44GC44KL5aC05ZCI44Gv5LiA5oSP44Gn44GC44KL5b+F6KaB44GM44GC44KK44G+44GZXG4gICAgICAgICAgaWQ6ICdDcm9zc1JlZ2lvblJlcGxpY2F0aW9uUnVsZScsXG4gICAgICAgICAgLy8g44Or44O844Or44KS5pyJ5Yq544Gr44GZ44KLXG4gICAgICAgICAgc3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5YSq5YWI6aCG5L2N77yI6KSH5pWw44Or44O844Or44GM44GC44KL5aC05ZCI44Gr6YGp55So44GV44KM44KL6aCG5bqP44KS5a6a576p77yJXG4gICAgICAgICAgcHJpb3JpdHk6IDEsXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5a++6LGh44KS5oyH5a6a77yI44GT44Gu5L6L44Gn44Gv5YWo44Gm44Gu44Kq44OW44K444Kn44Kv44OI44KS44Os44OX44Oq44Kx44O844K344On44Oz77yJXG4gICAgICAgICAgZmlsdGVyOiB7XG4gICAgICAgICAgICBwcmVmaXg6ICcnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8g44OQ44O844K444On44OL44Oz44Kw44GM5pyJ5Yq544Gq44OQ44Kx44OD44OI44Gu5aC05ZCI44CB5YmK6Zmk44Oe44O844Kr44O844KC44Os44OX44Oq44Kx44O844K344On44Oz44GZ44KL6Kit5a6aXG4gICAgICAgICAgZGVsZXRlTWFya2VyUmVwbGljYXRpb246IHtcbiAgICAgICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz44Gu5a6b5YWI44KS5oyH5a6a77yI44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS5L2/55So77yJXG4gICAgICAgICAgZGVzdGluYXRpb246IHtcbiAgICAgICAgICAgIGJ1Y2tldDogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH07XG4gICAgLy8g44Os44OX44Oq44Kx44O844K344On44Oz6Kit5a6a44Gu5L6d5a2Y6Zai5L+C44KS5piO56S655qE44Gr6L+95Yqg77yIQ0RL44GM6Ieq5YuV55qE44Gr5Yem55CG44GZ44KL44GT44Go44KC44GC44KK44G+44GZ44GM44CB5piO56S655qE44Gr44GZ44KL44GT44Go44Gn56K65a6f44Gr6aCG5bqP44GM5L+d6Ki844GV44KM44G+44GZ77yJXG4gICAgY2ZuQnVja2V0LmFkZERlcGVuZGVuY3kocmVwbGljYXRpb25Sb2xlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGlhbS5DZm5Sb2xlKTtcbiAgICAvLyDjg5DjgrHjg4Pjg4jlkI3jgpLlh7rliptcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQnVja2V0TmFtZUV4cG9ydCcsIHtcbiAgICAgIHZhbHVlOiBhcnRpZmFjdEJ1Y2tldC5idWNrZXROYW1lLFxuICAgIH0pO1xuICAgIC8vIEdpdEh1YiBBY3Rpb25z44Ot44O844Or44GuQVJO44KS5Ye65YqbXG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR2l0aHViQWN0aW9uc1JvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogZ2l0aHViUm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOODkOOCseODg+ODiOOBrkFSTuOCkuWHuuWKm1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZXBsaWNhdGlvbkRlc3RpbmF0aW9uQnVja2V0QXJuJywge1xuICAgICAgdmFsdWU6IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICB9KTtcbiAgfVxufSJdfQ==