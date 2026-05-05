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
    DEFAULT_BRANCH: 'main',
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
        const githubBranch = this.node.tryGetContext('githubBranch') || GITHUB_OIDC_CONFIG.DEFAULT_BRANCH;
        const githubOidcProviderArn = this.node.tryGetContext('githubOidcProviderArn');
        const githubSub = `repo:${githubOwner}/${githubRepo}:ref:refs/heads/${githubBranch}`;
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
            // ライフサイクルルールを追加して古いオブジェクトを自動的に削除
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
        // GitHub Actions用のIAMロールを作成（ブランチスコープの信頼関係を設定）
        const githubProvider = githubOidcProviderArn
            ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubProvider', githubOidcProviderArn)
            // OIDCプロバイダーが指定されていない場合は新規作成
            : new iam.OpenIdConnectProvider(this, 'GithubProvider', {
                url: GITHUB_OIDC_CONFIG.PROVIDER_URL,
                clientIds: [GITHUB_OIDC_CONFIG.CLIENT_ID],
                thumbprints: [GITHUB_OIDC_CONFIG.THUMBPRINT],
            });
        // GitHub Actionsが特定のリポジトリとブランチからのみロールを引き受けられるようにする
        const githubRole = new iam.Role(this, 'GithubActionsRole', {
            assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
                StringEquals: {
                    'token.actions.githubusercontent.com:aud': GITHUB_OIDC_CONFIG.CLIENT_ID,
                },
                StringLike: {
                    'token.actions.githubusercontent.com:sub': githubSub,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFFM0MsK0JBQStCO0FBQy9CLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLGNBQWMsRUFBRSxFQUFFO0lBQ2xCLHNCQUFzQixFQUFFLENBQUM7SUFDekIsYUFBYSxFQUFFLGdCQUFnQjtDQUN2QixDQUFDO0FBQ1gsOEJBQThCO0FBQzlCLE1BQU0sa0JBQWtCLEdBQUc7SUFDekIsWUFBWSxFQUFFLDZDQUE2QztJQUMzRCxTQUFTLEVBQUUsbUJBQW1CO0lBQzlCLFVBQVUsRUFBRSwwQ0FBMEM7SUFDdEQsY0FBYyxFQUFFLE1BQU07SUFDdEIsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLGdCQUFnQixFQUFFLGVBQWU7Q0FDekIsQ0FBQztBQUVYLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix3QkFBd0I7UUFDeEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1FBQ3hELHlDQUF5QztRQUN6QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQztRQUNuRyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxn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a0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVO1NBQ2pDLENBQUMsQ0FBQztRQUNILDJCQUEyQjtRQUUzQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxVQUFVLENBQUMsT0FBTztTQUMxQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFsR0Qsd0RBa0dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcblxuLy8g6Kit5a6a5YCk44KS44Kq44OW44K444Kn44Kv44OI44Gr44G+44Go44KB44KL77yI44Oe44K444OD44Kv44OK44Oz44OQ44O844Gu5o6S6Zmk77yJXG5jb25zdCBTVE9SQUdFX0NPTkZJRyA9IHtcbiAgUkVURU5USU9OX0RBWVM6IDMwLFxuICBISVNUT1JZX1JFVEVOVElPTl9EQVlTOiA3LFxuICBCVUNLRVRfUFJFRklYOiAnYmV2eS1hcnRpZmFjdHMnLFxufSBhcyBjb25zdDtcbi8vR2l0SHViIE9JREPjga7oqK3lrprjgoLlrprmlbDjgqrjg5bjgrjjgqfjgq/jg4jjgavjgb7jgajjgoHjgotcbmNvbnN0IEdJVEhVQl9PSURDX0NPTkZJRyA9IHtcbiAgUFJPVklERVJfVVJMOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gIENMSUVOVF9JRDogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgVEhVTUJQUklOVDogJzY5MzhmZDRkOThiYWIwM2ZhYWRiOTdiMzQzOTY4MzFlMzc4MGExODgnLFxuICBERUZBVUxUX0JSQU5DSDogJ21haW4nLFxuICBQTEFDRUhPTERFUl9PV05FUjogJzxnaXRodWItb3duZXI+JyxcbiAgUExBQ0VIT0xERVJfUkVQTzogJzxnaXRodWItcmVwbz4nLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNsYXNzIEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyDlrp/ooYzmmYLjgasgLWMgZW52PXByb2Qg44Go5rih44Gb44KLXG4gICAgY29uc3QgZW52TmFtZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOCkuOCs+ODs+ODhuOCreOCueODiOOBi+OCieWPluW+l++8iOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCgueUqOaEj++8iVxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1Yk93bmVyJykgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSO1xuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViUmVwbycpIHx8IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9SRVBPO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJCcmFuY2gnKSB8fCBHSVRIVUJfT0lEQ19DT05GSUcuREVGQVVMVF9CUkFOQ0g7XG4gICAgY29uc3QgZ2l0aHViT2lkY1Byb3ZpZGVyQXJuID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1Yk9pZGNQcm92aWRlckFybicpO1xuICAgIGNvbnN0IGdpdGh1YlN1YiA9IGByZXBvOiR7Z2l0aHViT3duZXJ9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvJHtnaXRodWJCcmFuY2h9YDtcblxuICAgIC8vIEdpdEh1YiBPSURD44Gu6Kit5a6a44GM44OX44Os44O844K544Ob44Or44OA44O844Gu44G+44G+44Gu5aC05ZCI44Gv6K2m5ZGK44KS5Ye644GZXG4gICAgaWYgKFxuICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICApIHtcbiAgICAgIGNkay5Bbm5vdGF0aW9ucy5vZih0aGlzKS5hZGRXYXJuaW5nKFxuICAgICAgICAnR2l0SHViIE9JREMgdHJ1c3QgaXMgdXNpbmcgcGxhY2Vob2xkZXJzLiBQYXNzIC1jIGdpdGh1Yk93bmVyPTxvd25lcj4gLWMgZ2l0aHViUmVwbz08cmVwbz4gYW5kIG9wdGlvbmFsbHkgLWMgZ2l0aHViQnJhbmNoPTxicmFuY2g+IGJlZm9yZSBkZXBsb3ltZW50LicsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmV2eUFydGlmYWN0QnVja2V0Jywge1xuICAgICAgLy8g55Kw5aKD5ZCN44Go44Ki44Kr44Km44Oz44OISUTjgpLntYTjgb/lkIjjgo/jgZvjgabkuIDmhI/mgKfjgpLmi4Xkv51cbiAgICAgIGJ1Y2tldE5hbWU6IGAke1NUT1JBR0VfQ09ORklHLkJVQ0tFVF9QUkVGSVh9LSR7ZW52TmFtZX0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIFxuICAgICAgLy8g44K744Kt44Ol44Oq44OG44Kj5by35YyW44Gu44Gf44KB44Gu6Kit5a6a44KS6L+95YqgXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgLy8g44Op44Kk44OV44K144Kk44Kv44Or44Or44O844Or44KS6L+95Yqg44GX44Gm5Y+k44GE44Kq44OW44K444Kn44Kv44OI44KS6Ieq5YuV55qE44Gr5YmK6ZmkXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAvLyDjg5Djg7zjgrjjg6fjg4vjg7PjgrDjgpLmnInlirnjgavjgZfjgabjgIHoqqTjgaPjgabliYrpmaTjgZXjgozjgZ/jgqrjg5bjgrjjgqfjgq/jg4jjga7lvqnlhYPjgpLlj6/og73jgavjgZnjgotcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIC8vIOOCueOCv+ODg+OCr+WJiumZpOaZguOBq+ODkOOCseODg+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIC8vIOODkOOCseODg+ODiOWJiumZpOaZguOBq+OCquODluOCuOOCp+OCr+ODiOOCguWJiumZpOOBmeOCi+ioreWumu+8iOacrOeVqueSsOWig+OBp+OBr+azqOaEj+OBjOW/heimge+8iVxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG5cbiAgICAgIC8qIOOBneOBruOBu+OBi+i/veWKoOWPr+iDveOBquioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueODreOCsOOBruioreWumlxuICAgICAgICAgIOODu+eJueWumuOBruODquODvOOCuOODp+ODs+OBq+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OBmeOCi+ioreWumlxuICAgICAgICAgIOODu+ODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OBp+eJueWumuOBruODl+ODrOODleOCo+ODg+OCr+OCueOChOOCv+OCsOOBq+WfuuOBpeOBhOOBpuOCquODluOCuOOCp+OCr+ODiOOCkueuoeeQhuOBmeOCi+ioreWumlxuICAgICAgICAgIOODu+OCouOCr+OCu+OCueOCs+ODs+ODiOODreODvOODq+ODquOCueODiO+8iEFDTO+8ieOChOODkOOCseODg+ODiOODneODquOCt+ODvOOBp+e0sOOBi+OBhOOCouOCr+OCu+OCueWItuW+oeOCkuioreWumuOBmeOCi+OBk+OBqOOCguWPr+iDvVxuICAgICAgICAgIOOBquOBqVxuICAgICAgICovXG5cbiAgICAgIC8vIOODqeOCpOODleOCteOCpOOCr+ODq+ODq+ODvOODq+OCkui/veWKoOOBl+OBpuWPpOOBhOOCquODluOCuOOCp+OCr+ODiOOCkuiHquWLleeahOOBq+WJiumZpFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRXhwaXJlT2xkQnVpbGRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIC8vIOWumuaVsOOCkuS9v+eUqFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLlJFVEVOVElPTl9EQVlTKSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKFNUT1JBR0VfQ09ORklHLkhJU1RPUllfUkVURU5USU9OX0RBWVMpLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgIH0pO1xuICAgIC8vIEdpdEh1YiBBY3Rpb25z55So44GuSUFN44Ot44O844Or44KS5L2c5oiQ77yI44OW44Op44Oz44OB44K544Kz44O844OX44Gu5L+h6aC86Zai5L+C44KS6Kit5a6a77yJXG5cbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IGdpdGh1Yk9pZGNQcm92aWRlckFyblxuICAgICAgPyBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyLmZyb21PcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4oXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICAnR2l0aHViUHJvdmlkZXInLFxuICAgICAgICAgIGdpdGh1Yk9pZGNQcm92aWRlckFybixcbiAgICAgICAgKVxuICAgIC8vIE9JREPjg5fjg63jg5DjgqTjg4Djg7zjgYzmjIflrprjgZXjgozjgabjgYTjgarjgYTloLTlkIjjga/mlrDopo/kvZzmiJBcbiAgICAgIDogbmV3IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIodGhpcywgJ0dpdGh1YlByb3ZpZGVyJywge1xuICAgICAgICAgIHVybDogR0lUSFVCX09JRENfQ09ORklHLlBST1ZJREVSX1VSTCxcbiAgICAgICAgICBjbGllbnRJZHM6IFtHSVRIVUJfT0lEQ19DT05GSUcuQ0xJRU5UX0lEXSxcbiAgICAgICAgICB0aHVtYnByaW50czogW0dJVEhVQl9PSURDX0NPTkZJRy5USFVNQlBSSU5UXSxcbiAgICAgICAgfSk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjgYznibnlrprjga7jg6rjg53jgrjjg4jjg6rjgajjg5bjg6njg7Pjg4HjgYvjgonjga7jgb/jg63jg7zjg6vjgpLlvJXjgY3lj5fjgZHjgonjgozjgovjgojjgYbjgavjgZnjgotcbiAgICBjb25zdCBnaXRodWJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgZ2l0aHViUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogR0lUSFVCX09JRENfQ09ORklHLkNMSUVOVF9JRCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBnaXRodWJTdWIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgYXNzdW1lZCBieSBHaXRIdWIgQWN0aW9ucyBmb3IgYXJ0aWZhY3QgYnVja2V0IGFjY2VzcycsXG4gICAgfSk7XG5cbiAgICBhcnRpZmFjdEJ1Y2tldC5ncmFudFJlYWRXcml0ZShnaXRodWJSb2xlKTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWNrZXROYW1lRXhwb3J0Jywge1xuICAgICAgdmFsdWU6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgfSk7XG4gICAgLy8gR2l0SHViIEFjdGlvbnPjg63jg7zjg6vjga5BUk7jgpLlh7rliptcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRodWJBY3Rpb25zUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBnaXRodWJSb2xlLnJvbGVBcm4sXG4gICAgfSk7XG4gIH1cbn0iXX0=