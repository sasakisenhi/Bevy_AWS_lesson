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
        new cdk.CfnOutput(this, 'BucketNameExport', {
            value: artifactBucket.bucketName,
        });
        // GitHub ActionsロールのARNを出力
        new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
            value: githubRole.roleArn,
        });
    }
}
exports.BevyPlatformInfraStack = BevyPlatformInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFFM0MsK0JBQStCO0FBQy9CLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLHNCQUFzQixFQUFFLENBQUM7SUFDekIsYUFBYSxFQUFFLGdCQUFnQjtDQUN2QixDQUFDO0FBQ1gsOEJBQThCO0FBQzlCLE1BQU0sa0JBQWtCLEdBQUc7SUFDekIsWUFBWSxFQUFFLDZDQUE2QztJQUMzRCxTQUFTLEVBQUUsbUJBQW1CO0lBQzlCLFVBQVUsRUFBRSwwQ0FBMEM7SUFDdEQsZ0JBQWdCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO0lBQ3BDLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxnQkFBZ0IsRUFBRSxlQUFlO0NBQ3pCLENBQUM7QUFFWCxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25ELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsd0JBQXdCO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUN4RCx5Q0FBeUM7UUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksa0JBQWtCLENBQUMsaUJBQWlCLENBQUM7UUFDbkcsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxD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QUFjLENBQUMsVUFBVTtTQUNqQyxDQUFDLENBQUM7UUFDSCwyQkFBMkI7UUFFM0IsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsVUFBVSxDQUFDLE9BQU87U0FDMUIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBeEdELHdEQXdHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5cbi8vIOioreWumuWApOOCkuOCquODluOCuOOCp+OCr+ODiOOBq+OBvuOBqOOCgeOCi++8iOODnuOCuOODg+OCr+ODiuODs+ODkOODvOOBruaOkumZpO+8iVxuY29uc3QgU1RPUkFHRV9DT05GSUcgPSB7XG4gIFJFVEVOVElPTl9EQVlTOiAzMCxcbiAgSElTVE9SWV9SRVRFTlRJT05fREFZUzogNyxcbiAgQlVDS0VUX1BSRUZJWDogJ2JldnktYXJ0aWZhY3RzJyxcbn0gYXMgY29uc3Q7XG4vL0dpdEh1YiBPSURD44Gu6Kit5a6a44KC5a6a5pWw44Kq44OW44K444Kn44Kv44OI44Gr44G+44Go44KB44KLXG5jb25zdCBHSVRIVUJfT0lEQ19DT05GSUcgPSB7XG4gIFBST1ZJREVSX1VSTDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICBDTElFTlRfSUQ6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gIFRIVU1CUFJJTlQ6ICc2OTM4ZmQ0ZDk4YmFiMDNmYWFkYjk3YjM0Mzk2ODMxZTM3ODBhMTg4JyxcbiAgREVGQVVMVF9CUkFOQ0hFUzogWydtYWluJywgJ21hc3RlciddLFxuICBQTEFDRUhPTERFUl9PV05FUjogJzxnaXRodWItb3duZXI+JyxcbiAgUExBQ0VIT0xERVJfUkVQTzogJzxnaXRodWItcmVwbz4nLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNsYXNzIEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyDlrp/ooYzmmYLjgasgLWMgZW52PXByb2Qg44Go5rih44Gb44KLXG4gICAgY29uc3QgZW52TmFtZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOCkuOCs+ODs+ODhuOCreOCueODiOOBi+OCieWPluW+l++8iOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCgueUqOaEj++8iVxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1Yk93bmVyJykgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSO1xuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViUmVwbycpIHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJCcmFuY2gnKTtcbiAgICBjb25zdCBnaXRodWJCcmFuY2hlcyA9IGdpdGh1YkJyYW5jaFxuICAgICAgPyBbU3RyaW5nKGdpdGh1YkJyYW5jaCldXG4gICAgICA6IEdJVEhVQl9PSURDX0NPTkZJRy5ERUZBVUxUX0JSQU5DSEVTO1xuICAgIFxuICAgIC8vIOaXouWtmOOBrkFSTuOBjOaYjuekuueahOOBq+aMh+WumuOBleOCjOOBpuOBhOOCi+WgtOWQiOOAgeOBvuOBn+OBr0FXU+OCouOCq+OCpuODs+ODiOOBq+aXouOBq+ODl+ODreODkOOCpOODgOODvOOBjOWtmOWcqOOBmeOCi+OBqOaDs+WumuOBleOCjOOCi+WgtOWQiOOBrkFSTlxuICAgIGNvbnN0IGV4aXN0aW5nUHJvdmlkZXJBcm4gPSBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpvaWRjLXByb3ZpZGVyL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tYDtcbiAgICBcbiAgICBjb25zdCBnaXRodWJTdWJzID0gZ2l0aHViQnJhbmNoZXMubWFwKFxuICAgICAgKGJyYW5jaCkgPT4gYHJlcG86JHtnaXRodWJPd25lcn0vJHtnaXRodWJSZXBvfTpyZWY6cmVmcy9oZWFkcy8ke2JyYW5jaH1gLFxuICAgICk7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOBjOODl+ODrOODvOOCueODm+ODq+ODgOODvOOBruOBvuOBvuOBruWgtOWQiOOBr+itpuWRiuOCkuWHuuOBmVxuICAgIGlmIChcbiAgICAgIGdpdGh1Yk93bmVyID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfT1dORVIgfHxcbiAgICAgIGdpdGh1YlJlcG8gPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPXG4gICAgKSB7XG4gICAgICBjZGsuQW5ub3RhdGlvbnMub2YodGhpcykuYWRkV2FybmluZyhcbiAgICAgICAgJ0dpdEh1YiBPSURDIHRydXN0IGlzIHVzaW5nIHBsYWNlaG9sZGVycy4gUGFzcyAtYyBnaXRodWJPd25lcj08b3duZXI+IC1jIGdpdGh1YlJlcG89PHJlcG8+IGFuZCBvcHRpb25hbGx5IC1jIGdpdGh1YkJyYW5jaD08YnJhbmNoPiBiZWZvcmUgZGVwbG95bWVudC4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JldnlBcnRpZmFjdEJ1Y2tldCcsIHtcbiAgICAgIC8vIOeSsOWig+WQjeOBqOOCouOCq+OCpuODs+ODiElE44KS57WE44G/5ZCI44KP44Gb44Gm5LiA5oSP5oCn44KS5ouF5L+dXG4gICAgICBidWNrZXROYW1lOiBgJHtTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYfS0ke2Vudk5hbWV9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBcbiAgICAgIC8vIOOCu+OCreODpeODquODhuOCo+W8t+WMluOBruOBn+OCgeOBruioreWumuOCkui/veWKoFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIC8vIFMz44Oe44ON44O844K444OJ5pqX5Y+35YyW44KS5pyJ5Yq544Gr44GX44Gm44CB5L+d5a2Y44OH44O844K/44KS5pqX5Y+35YyW44GZ44KLXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyDjg5Djg7zjgrjjg6fjg4vjg7PjgrDjgpLmnInlirnjgavjgZfjgabjgIHoqqTjgaPjgabliYrpmaTjgZXjgozjgZ/jgqrjg5bjgrjjgqfjgq/jg4jjga7lvqnlhYPjgpLlj6/og73jgavjgZnjgotcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIC8vIOOCueOCv+ODg+OCr+WJiumZpOaZguOBq+ODkOOCseODg+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIC8vIOODkOOCseODg+ODiOWJiumZpOaZguOBq+OCquODluOCuOOCp+OCr+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG5cbiAgICAgIC8qIOOBneOBruOBu+OBi+i/veWKoOWPr+iDveOBquioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueODreOCsOOBruioreWumlxuICAgICAgICAgIOODu+eJueWumuOBruODquODvOOCuOODp+ODs+OBq+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBmeOCi+ioreWumlxuICAgICAgICAgIOODu+ODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OBp+eJueWumuOBruODl+ODrOODleOCo+ODg+OCr+OCueOChOOCv+OCsOOBq+WfuuOBpeOBhOOBpuOCquODluOCuOOCp+OCr+ODiOOCkueuoeeQhuOBmeOCi+ioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueOCs+ODs+ODiOODreODvOODq+ODquOCueODiO+8iEFDTO+8ieOChOODkOOCseODg+ODiOODneODquOCt+ODvOOBp+e0sOOBi+OBhOOCouOCr+OCu+OCueWItuW+oeOCkuioreWumuOBmeOCi+OBk+OBqOOCguWPr+iDvVxuICAgICAgICAgIOOBquOBqVxuICAgICAgICAgIOips+OBl+OBj+OBr+S4i+iomOOBrlVSTOOCkuWPgueFpyBcbiAgICAgICAgICBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS92Mi9kb2NzL2F3cy1jZGstbGliLmF3c19zMy5CdWNrZXRQcm9wcy5odG1sXG4gICAgICAgKi9cblxuICAgICAgLy8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44KS6L+95Yqg44GX44Gm5Y+k44GE44Kq44OW44K444Kn44Kv44OI44KS6Ieq5YuV55qE44Gr5YmK6ZmkXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdFeHBpcmVPbGRCdWlsZHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgLy8g5a6a5pWw44KS5L2/55SoXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuUkVURU5USU9OX0RBWVMpLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoU1RPUkFHRV9DT05GSUcuSElTVE9SWV9SRVRFTlRJT05fREFZUyksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgfSk7XG4gICAgLy8g4piFIOS/ruato+euh+aJgO+8muW4uOOBq+aWsOOBl+OBhOODl+ODreODkOOCpOODgOODvOOCkuS9nOOCi+OBruOBp+OBr+OBquOBj+OAgeaXouWtmOOBrkFSTuOCkuWPgueFp+OBmeOCi1xuICAgIC8vIOWIneWbnuS9nOaIkOaZgu+8iOODl+ODreODkOOCpOODgOODvOOBjOOBquOBhOeKtuaFi++8ieOBr+OAgWBmcm9tT3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuYCDjgafjga/jgarjgY/mlrDopo/kvZzmiJDjgZnjgovjgYvjgIHjgb7jgZ/jga/kvovlpJbjgpLogIPmha7jgZnjgovlv4XopoHjgYzjgYLjgorjgb7jgZnjgYzjgIFcbiAgICAvLyDml6LlrZjjga7jgqjjg6njg7zvvIhFbnRpdHlBbHJlYWR5RXhpc3RzRXhjZXB0aW9u77yJ44KS5Zue6YG/44GZ44KL44Gf44KB44CB44GZ44Gn44Gr5a2Y5Zyo44GZ44KL5aC05ZCI44Gv5pei5a2Y44GuQVJO44Gn5Y+C54Wn44GX44G+44GZ44CCXG4gICAgLy8gQ0RL44Gu57WE44G/6L6844G/44Oh44K944OD44OJIGBPcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybmAg44KS5L2/55So44GX44G+44GZ44CCXG5cbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybihcbiAgICAgIHRoaXMsXG4gICAgICAnR2l0aHViUHJvdmlkZXInLFxuICAgICAgZXhpc3RpbmdQcm92aWRlckFybixcbiAgICApO1xuICAgIC8vIEdpdEh1YiBBY3Rpb25z44GM54m55a6a44Gu44Oq44Od44K444OI44Oq44Go44OW44Op44Oz44OB44GL44KJ44Gu44G/44Ot44O844Or44KS5byV44GN5Y+X44GR44KJ44KM44KL44KI44GG44Gr44GZ44KLXG4gICAgY29uc3QgZ2l0aHViUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnR2l0aHViQWN0aW9uc1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICAgIGdpdGh1YlByb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6IEdJVEhVQl9PSURDX0NPTkZJRy5DTElFTlRfSUQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogZ2l0aHViU3VicyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBhc3N1bWVkIGJ5IEdpdEh1YiBBY3Rpb25zIGZvciBhcnRpZmFjdCBidWNrZXQgYWNjZXNzJyxcbiAgICB9KTtcblxuICAgIGFydGlmYWN0QnVja2V0LmdyYW50UmVhZFdyaXRlKGdpdGh1YlJvbGUpO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogYXJ0aWZhY3RCdWNrZXQuYnVja2V0TmFtZSxcbiAgICB9KTtcbiAgICAvLyBHaXRIdWIgQWN0aW9uc+ODreODvOODq+OBrkFSTuOCkuWHuuWKm1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IGdpdGh1YlJvbGUucm9sZUFybixcbiAgICB9KTtcbiAgfVxufSJdfQ==