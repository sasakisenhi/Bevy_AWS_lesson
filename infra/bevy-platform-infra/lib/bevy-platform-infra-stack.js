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
// 設定値をオブジェクトにまとめる（マジックナンバーの排除）
const STORAGE_CONFIG = {
    RETENTION_DAYS: 30,
    HISTORY_RETENTION_DAYS: 7,
    BUCKET_PREFIX: 'bevy-artifacts',
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
        const artifactBucket = new s3.Bucket(this, 'BevyArtifactBucket', {
            // 環境名とアカウントIDを組み合わせて一意性を担保
            bucketName: `${STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-${this.account}`,
            // セキュリティ強化のための設定を追加
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // S3マネージド暗号化を有効にして、保存データを暗号化する
            encryption: s3.BucketEncryption.S3_MANAGED,
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
        artifactBucket.grantReadWrite(githubRole);
        const replicationRole = new iam.Role(this, 'S3ReplicationRole', {
            assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
            description: 'Role used by S3 to replicate objects to the secondary region bucket',
        });
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetReplicationConfiguration',
                's3:ListBucket',
            ],
            resources: [artifactBucket.bucketArn],
        }));
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetObjectVersionForReplication',
                's3:GetObjectVersionAcl',
                's3:GetObjectVersionTagging',
            ],
            resources: [`${artifactBucket.bucketArn}/*`],
        }));
        replicationRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:ReplicateObject',
                's3:ReplicateDelete',
                's3:ReplicateTags',
            ],
            resources: [`${props.secondaryBucketArn}/*`],
        }));
        const cfnBucket = artifactBucket.node.defaultChild;
        cfnBucket.replicationConfiguration = {
            role: replicationRole.roleArn,
            rules: [
                {
                    id: 'CrossRegionReplicationRule',
                    status: 'Enabled',
                    priority: 1,
                    filter: {
                        prefix: '',
                    },
                    deleteMarkerReplication: {
                        status: 'Enabled',
                    },
                    destination: {
                        bucket: props.secondaryBucketArn,
                    },
                },
            ],
        };
        cfnBucket.addDependency(replicationRole.node.defaultChild);
        new cdk.CfnOutput(this, 'BucketNameExport', {
            value: artifactBucket.bucketName,
        });
        // GitHub ActionsロールのARNを出力
        new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
            value: githubRole.roleArn,
        });
        new cdk.CfnOutput(this, 'ReplicationDestinationBucketArn', {
            value: props.secondaryBucketArn,
        });
    }
}
exports.BevyPlatformInfraStack = BevyPlatformInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFFM0MsK0JBQStCO0FBQy9CLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLHNCQUFzQixFQUFFLENBQUM7SUFDekIsYUFBYSxFQUFFLGdCQUFnQjtDQUN2QixDQUFDO0FBS1gsOEJBQThCO0FBQzlCLE1BQU0sa0JBQWtCLEdBQUc7SUFDekIsWUFBWSxFQUFFLDZDQUE2QztJQUMzRCxTQUFTLEVBQUUsbUJBQW1CO0lBQzlCLFVBQVUsRUFBRSwwQ0FBMEM7SUFDdEQsZ0JBQWdCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO0lBQ3BDLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxnQkFBZ0IsRUFBRSxlQUFlO0NBQ3pCLENBQUM7QUFFWCxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25ELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0M7UUFDMUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsd0JBQXdCO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUN4RCx5Q0FBeUM7UUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksa0JBQWtCLENBQUMsaUJBQWlCLENBQUM7UUFDbkcsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxD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U0FBUztxQkFDbEI7b0JBQ0QsV0FBVyxFQUFFO3dCQUNYLE1BQU0sRUFBRSxLQUFLLENBQUMsa0JBQWtCO3FCQUNqQztpQkFDRjthQUNGO1NBQ0YsQ0FBQztRQUVGLFNBQVMsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxZQUEyQixDQUFDLENBQUM7UUFFMUUsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLFVBQVU7U0FDakMsQ0FBQyxDQUFDO1FBQ0gsMkJBQTJCO1FBRTNCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxPQUFPO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUNBQWlDLEVBQUU7WUFDekQsS0FBSyxFQUFFLEtBQUssQ0FBQyxrQkFBa0I7U0FDaEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBeEtELHdEQXdLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5cbi8vIOioreWumuWApOOCkuOCquODluOCuOOCp+OCr+ODiOOBq+OBvuOBqOOCgeOCi++8iOODnuOCuOODg+OCr+ODiuODs+ODkOODvOOBruaOkumZpO+8iVxuY29uc3QgU1RPUkFHRV9DT05GSUcgPSB7XG4gIFJFVEVOVElPTl9EQVlTOiAzMCxcbiAgSElTVE9SWV9SRVRFTlRJT05fREFZUzogNyxcbiAgQlVDS0VUX1BSRUZJWDogJ2JldnktYXJ0aWZhY3RzJyxcbn0gYXMgY29uc3Q7XG5cbmludGVyZmFjZSBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHNlY29uZGFyeUJ1Y2tldEFybjogc3RyaW5nO1xufVxuLy9HaXRIdWIgT0lEQ+OBruioreWumuOCguWumuaVsOOCquODluOCuOOCp+OCr+ODiOOBq+OBvuOBqOOCgeOCi1xuY29uc3QgR0lUSFVCX09JRENfQ09ORklHID0ge1xuICBQUk9WSURFUl9VUkw6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgQ0xJRU5UX0lEOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuICBUSFVNQlBSSU5UOiAnNjkzOGZkNGQ5OGJhYjAzZmFhZGI5N2IzNDM5NjgzMWUzNzgwYTE4OCcsXG4gIERFRkFVTFRfQlJBTkNIRVM6IFsnbWFpbicsICdtYXN0ZXInXSxcbiAgUExBQ0VIT0xERVJfT1dORVI6ICc8Z2l0aHViLW93bmVyPicsXG4gIFBMQUNFSE9MREVSX1JFUE86ICc8Z2l0aHViLXJlcG8+Jyxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjbGFzcyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8g5a6f6KGM5pmC44GrIC1jIGVudj1wcm9kIOOBqOa4oeOBm+OCi1xuICAgIGNvbnN0IGVudk5hbWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgpLjgrPjg7Pjg4bjgq3jgrnjg4jjgYvjgonlj5blvpfvvIjjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjgoLnlKjmhI/vvIlcbiAgICBjb25zdCBnaXRodWJPd25lciA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJPd25lcicpIHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUjtcbiAgICBjb25zdCBnaXRodWJSZXBvID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YlJlcG8nKSB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQTztcbiAgICBjb25zdCBnaXRodWJCcmFuY2ggPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViQnJhbmNoJyk7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoZXMgPSBnaXRodWJCcmFuY2hcbiAgICAgID8gW1N0cmluZyhnaXRodWJCcmFuY2gpXVxuICAgICAgOiBHSVRIVUJfT0lEQ19DT05GSUcuREVGQVVMVF9CUkFOQ0hFUztcbiAgICBcbiAgICAvLyDml6LlrZjjga5BUk7jgYzmmI7npLrnmoTjgavmjIflrprjgZXjgozjgabjgYTjgovloLTlkIjjgIHjgb7jgZ/jga9BV1PjgqLjgqvjgqbjg7Pjg4jjgavml6Ljgavjg5fjg63jg5DjgqTjg4Djg7zjgYzlrZjlnKjjgZnjgovjgajmg7PlrprjgZXjgozjgovloLTlkIjjga5BUk5cbiAgICBjb25zdCBleGlzdGluZ1Byb3ZpZGVyQXJuID0gYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWA7XG4gICAgXG4gICAgY29uc3QgZ2l0aHViU3VicyA9IGdpdGh1YkJyYW5jaGVzLm1hcChcbiAgICAgIChicmFuY2gpID0+IGByZXBvOiR7Z2l0aHViT3duZXJ9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvJHticmFuY2h9YCxcbiAgICApO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgYzjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjga7jgb7jgb7jga7loLTlkIjjga/orablkYrjgpLlh7rjgZlcbiAgICBpZiAoXG4gICAgICBnaXRodWJPd25lciA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSIHx8XG4gICAgICBnaXRodWJSZXBvID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQT1xuICAgICkge1xuICAgICAgY2RrLkFubm90YXRpb25zLm9mKHRoaXMpLmFkZFdhcm5pbmcoXG4gICAgICAgICdHaXRIdWIgT0lEQyB0cnVzdCBpcyB1c2luZyBwbGFjZWhvbGRlcnMuIFBhc3MgLWMgZ2l0aHViT3duZXI9PG93bmVyPiAtYyBnaXRodWJSZXBvPTxyZXBvPiBhbmQgb3B0aW9uYWxseSAtYyBnaXRodWJCcmFuY2g9PGJyYW5jaD4gYmVmb3JlIGRlcGxveW1lbnQuJyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgYXJ0aWZhY3RCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCZXZ5QXJ0aWZhY3RCdWNrZXQnLCB7XG4gICAgICAvLyDnkrDlooPlkI3jgajjgqLjgqvjgqbjg7Pjg4hJROOCkue1hOOBv+WQiOOCj+OBm+OBpuS4gOaEj+aAp+OCkuaLheS/nVxuICAgICAgYnVja2V0TmFtZTogYCR7U1RPUkFHRV9DT05GSUcuQlVDS0VUX1BSRUZJWH0tJHtlbnZOYW1lfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgXG4gICAgICAvLyDjgrvjgq3jg6Xjg6rjg4bjgqPlvLfljJbjga7jgZ/jgoHjga7oqK3lrprjgpLov73liqBcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAvLyBTM+ODnuODjeODvOOCuOODieaal+WPt+WMluOCkuacieWKueOBq+OBl+OBpuOAgeS/neWtmOODh+ODvOOCv+OCkuaal+WPt+WMluOBmeOCi1xuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgLy8g44OQ44O844K444On44OL44Oz44Kw44KS5pyJ5Yq544Gr44GX44Gm44CB6Kqk44Gj44Gm5YmK6Zmk44GV44KM44Gf44Kq44OW44K444Kn44Kv44OI44Gu5b6p5YWD44KS5Y+v6IO944Gr44GZ44KLXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICAvLyDjgrnjgr/jg4Pjgq/liYrpmaTmmYLjgavjg5DjgrHjg4Pjg4jjgoLliYrpmaTjgZnjgovoqK3lrprvvIjmnKznlarnkrDlooPjgafjga/ms6jmhI/jgYzlv4XopoHvvIlcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAvLyDjg5DjgrHjg4Pjg4jliYrpmaTmmYLjgavjgqrjg5bjgrjjgqfjgq/jg4jjgoLliYrpmaTjgZnjgovoqK3lrprvvIjmnKznlarnkrDlooPjgafjga/ms6jmhI/jgYzlv4XopoHvvIlcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuXG4gICAgICAvKiDjgZ3jga7jgbvjgYvov73liqDlj6/og73jgaroqK3lrppcbiAgICAgICAgICDjg7vjgqLjgq/jgrvjgrnjg63jgrDjga7oqK3lrppcbiAgICAgICAgICDjg7vnibnlrprjga7jg6rjg7zjgrjjg6fjg7Pjgavjg6zjg5fjg6rjgrHjg7zjgrfjg6fjg7PjgZnjgovoqK3lrppcbiAgICAgICAgICDjg7vjg6njgqTjg5XjgrXjgqTjgq/jg6vjg6vjg7zjg6vjgafnibnlrprjga7jg5fjg6zjg5XjgqPjg4Pjgq/jgrnjgoTjgr/jgrDjgavln7rjgaXjgYTjgabjgqrjg5bjgrjjgqfjgq/jg4jjgpLnrqHnkIbjgZnjgovoqK3lrppcbiAgICAgICAgICDjg7vjgqLjgq/jgrvjgrnjgrPjg7Pjg4jjg63jg7zjg6vjg6rjgrnjg4jvvIhBQ0zvvInjgoTjg5DjgrHjg4Pjg4jjg53jg6rjgrfjg7zjgafntLDjgYvjgYTjgqLjgq/jgrvjgrnliLblvqHjgpLoqK3lrprjgZnjgovjgZPjgajjgoLlj6/og71cbiAgICAgICAgICDjgarjgalcbiAgICAgICAgICDoqbPjgZfjgY/jga/kuIvoqJjjga5VUkzjgpLlj4LnhacgXG4gICAgICAgICAgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfczMuQnVja2V0UHJvcHMuaHRtbFxuICAgICAgICovXG5cbiAgICAgIC8vIOODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OCkui/veWKoOOBl+OBpuWPpOOBhOOCquODluOCuOOCp+OCr+ODiOOCkuiHquWLleeahOOBq+WJiumZpFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIC8vIOWumuaVsOOCkuS9v+eUqFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLlJFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgIH0pO1xuICAgIC8vIOKYhSDkv67mraPnrofmiYDvvJrluLjjgavmlrDjgZfjgYTjg5fjg63jg5DjgqTjg4Djg7zjgpLkvZzjgovjga7jgafjga/jgarjgY/jgIHml6LlrZjjga5BUk7jgpLlj4LnhafjgZnjgotcbiAgICAvLyDliJ3lm57kvZzmiJDmmYLvvIjjg5fjg63jg5DjgqTjg4Djg7zjgYzjgarjgYTnirbmhYvvvInjga/jgIFgZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybmAg44Gn44Gv44Gq44GP5paw6KaP5L2c5oiQ44GZ44KL44GL44CB44G+44Gf44Gv5L6L5aSW44KS6ICD5oWu44GZ44KL5b+F6KaB44GM44GC44KK44G+44GZ44GM44CBXG4gICAgLy8g5pei5a2Y44Gu44Ko44Op44O877yIRW50aXR5QWxyZWFkeUV4aXN0c0V4Y2VwdGlvbu+8ieOCkuWbnumBv+OBmeOCi+OBn+OCgeOAgeOBmeOBp+OBq+WtmOWcqOOBmeOCi+WgtOWQiOOBr+aXouWtmOOBrkFSTuOBp+WPgueFp+OBl+OBvuOBmeOAglxuICAgIC8vIENES+OBrue1hOOBv+i+vOOBv+ODoeOCveODg+ODiSBgT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm5gIOOCkuS9v+eUqOOBl+OBvuOBmeOAglxuXG4gICAgY29uc3QgZ2l0aHViUHJvdmlkZXIgPSBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgICB0aGlzLFxuICAgICAgJ0dpdGh1YlByb3ZpZGVyJyxcbiAgICAgIGV4aXN0aW5nUHJvdmlkZXJBcm4sXG4gICAgKTtcbiAgICAvLyBHaXRIdWIgQWN0aW9uc+OBjOeJueWumuOBruODquODneOCuOODiOODquOBqOODluODqeODs+ODgeOBi+OCieOBruOBv+ODreODvOODq+OCkuW8leOBjeWPl+OBkeOCieOCjOOCi+OCiOOBhuOBq+OBmeOCi1xuICAgIGNvbnN0IGdpdGh1YlJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0dpdGh1YkFjdGlvbnNSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBnaXRodWJQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiBHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lELFxuICAgICAgICAgIH0sXG4gICAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IGdpdGh1YlN1YnMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgYXNzdW1lZCBieSBHaXRIdWIgQWN0aW9ucyBmb3IgYXJ0aWZhY3QgYnVja2V0IGFjY2VzcycsXG4gICAgfSk7XG5cbiAgICBhcnRpZmFjdEJ1Y2tldC5ncmFudFJlYWRXcml0ZShnaXRodWJSb2xlKTtcblxuICAgIGNvbnN0IHJlcGxpY2F0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUzNSZXBsaWNhdGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnczMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIHVzZWQgYnkgUzMgdG8gcmVwbGljYXRlIG9iamVjdHMgdG8gdGhlIHNlY29uZGFyeSByZWdpb24gYnVja2V0JyxcbiAgICB9KTtcblxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24nLFxuICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICByZXBsaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkZvclJlcGxpY2F0aW9uJyxcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkFjbCcsXG4gICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25UYWdnaW5nJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJ0aWZhY3RCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZU9iamVjdCcsXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZURlbGV0ZScsXG4gICAgICAgICAgJ3MzOlJlcGxpY2F0ZVRhZ3MnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtgJHtwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm59LypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBjZm5CdWNrZXQgPSBhcnRpZmFjdEJ1Y2tldC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBzMy5DZm5CdWNrZXQ7XG4gICAgY2ZuQnVja2V0LnJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IHtcbiAgICAgIHJvbGU6IHJlcGxpY2F0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgcnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQ3Jvc3NSZWdpb25SZXBsaWNhdGlvblJ1bGUnLFxuICAgICAgICAgIHN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIGZpbHRlcjoge1xuICAgICAgICAgICAgcHJlZml4OiAnJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZU1hcmtlclJlcGxpY2F0aW9uOiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdFbmFibGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlc3RpbmF0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9O1xuXG4gICAgY2ZuQnVja2V0LmFkZERlcGVuZGVuY3kocmVwbGljYXRpb25Sb2xlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGlhbS5DZm5Sb2xlKTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWNrZXROYW1lRXhwb3J0Jywge1xuICAgICAgdmFsdWU6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjg63jg7zjg6vjga5BUk7jgpLlh7rliptcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBnaXRodWJSb2xlLnJvbGVBcm4sXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVwbGljYXRpb25EZXN0aW5hdGlvbkJ1Y2tldEFybicsIHtcbiAgICAgIHZhbHVlOiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgfSk7XG4gIH1cbn0iXX0=