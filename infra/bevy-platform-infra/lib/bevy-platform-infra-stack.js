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
const config_1 = require("./config");
const validators_1 = require("./validators");
const s3_buckets_1 = require("./s3-buckets");
const github_oidc_1 = require("./github-oidc");
const s3_replication_1 = require("./s3-replication");
// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
class BevyPlatformInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        // AWSアカウントIDが明示的に指定されているかを検証
        (0, validators_1.validateExplicitStackAccount)(props.env);
        // セカンダリバケットのARNを検証
        (0, validators_1.validateSecondaryBucketArn)(props.secondaryBucketArn);
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
        (0, validators_1.validateGitHubOidcContext)(githubOwnerFromContext, githubRepoFromContext, githubBranch);
        const githubOwner = githubOwnerFromContext || config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER;
        const githubRepo = githubRepoFromContext || config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO;
        const githubBranches = githubBranch
            ? [String(githubBranch)]
            : config_1.GITHUB_OIDC_CONFIG.DEFAULT_BRANCHES;
        const githubSubs = githubBranches.map((branch) => `repo:${githubOwner}/${githubRepo}:ref:refs/heads/${branch}`);
        // GitHub OIDCの設定がプレースホルダーのままの場合は警告を出す
        if (githubOwner === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
            githubRepo === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO) {
            cdk.Annotations.of(this).addWarning('GitHub OIDC trust is using placeholders. Pass -c githubOwner=<owner> -c githubRepo=<repo> and optionally -c githubBranch=<branch> before deployment.');
        }
        // アーティファクト用のS3バケットを作成
        const { artifactBucket } = (0, s3_buckets_1.createPrimaryArtifactBuckets)(this, envName, this.account);
        // GitHub OIDCロールを作成
        const githubRole = (0, github_oidc_1.createGithubActionsRole)({
            scope: this,
            account: this.account,
            artifactBucket,
            githubSubs,
        });
        // S3クロスリージョンレプリケーションを設定
        const { cfnBucket } = (0, s3_replication_1.setupCrossRegionReplication)({
            scope: this,
            artifactBucket,
            secondaryBucketArn: props.secondaryBucketArn,
        });
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
            validate: () => {
                const errors = [];
                // 環境名のバリデーション
                if (!config_1.ENV_NAME_REGEX.test(envName)) {
                    errors.push('env context must be one of dev, test, stg, prod for naming and policy consistency.');
                }
                // GitHub OIDCのプレースホルダー値を使用している場合は、prod環境ではエラーとする
                if (envName === 'prod' &&
                    (githubOwner === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_OWNER ||
                        githubRepo === config_1.GITHUB_OIDC_CONFIG.PLACEHOLDER_REPO)) {
                    errors.push('In env=prod, githubOwner and githubRepo placeholders are not allowed. Pass explicit context values.');
                }
                // セカンダリバケットARNのバリデーション
                const expectedSecondaryBucketName = `${config_1.STORAGE_CONFIG.BUCKET_PREFIX}-${envName}-secondary-${this.account}`;
                const secondaryBucketName = (0, validators_1.toBucketNameFromArn)(props.secondaryBucketArn);
                if (secondaryBucketName !== expectedSecondaryBucketName) {
                    errors.push(`secondaryBucketArn must target ${expectedSecondaryBucketName} for env/account consistency; got ${secondaryBucketName}.`);
                }
                // レプリケーション設定のバリデーション
                const replicationConfig = cfnBucket.replicationConfiguration;
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
exports.BevyPlatformInfraStack = BevyPlatformInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBSW5DLHFDQUlrQjtBQUNsQiw2Q0FLc0I7QUFDdEIsNkNBQTREO0FBQzVELCtDQUF3RDtBQUN4RCxxREFBK0Q7QUFNL0Qsc0RBQXNEO0FBQ3RELE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSw2QkFBNkI7UUFDN0IsSUFBQSx5Q0FBNEIsRUFBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsbUJBQW1CO1FBQ25CLElBQUEsdUNBQTBCLEVBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFckQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsd0JBQXdCO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUV4RCx5Q0FBeUM7UUFDekMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRSxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFcEUsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENB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cnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuXG5pbXBvcnQge1xuICBFTlZfTkFNRV9SRUdFWCxcbiAgR0lUSFVCX09JRENfQ09ORklHLFxuICBTVE9SQUdFX0NPTkZJRyxcbn0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHtcbiAgdG9CdWNrZXROYW1lRnJvbUFybixcbiAgdmFsaWRhdGVFeHBsaWNpdFN0YWNrQWNjb3VudCxcbiAgdmFsaWRhdGVHaXRIdWJPaWRjQ29udGV4dCxcbiAgdmFsaWRhdGVTZWNvbmRhcnlCdWNrZXRBcm4sXG59IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5pbXBvcnQgeyBjcmVhdGVQcmltYXJ5QXJ0aWZhY3RCdWNrZXRzIH0gZnJvbSAnLi9zMy1idWNrZXRzJztcbmltcG9ydCB7IGNyZWF0ZUdpdGh1YkFjdGlvbnNSb2xlIH0gZnJvbSAnLi9naXRodWItb2lkYyc7XG5pbXBvcnQgeyBzZXR1cENyb3NzUmVnaW9uUmVwbGljYXRpb24gfSBmcm9tICcuL3MzLXJlcGxpY2F0aW9uJztcblxuaW50ZXJmYWNlIEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc2Vjb25kYXJ5QnVja2V0QXJuOiBzdHJpbmc7XG59XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBq+OCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44GoR2l0SHViIE9JREPjg63jg7zjg6vjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq9cbmV4cG9ydCBjbGFzcyBCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEJldnlQbGF0Zm9ybUluZnJhU3RhY2tQcm9wcykge1xuICAgIC8vIEFXU+OCouOCq+OCpuODs+ODiElE44GM5piO56S655qE44Gr5oyH5a6a44GV44KM44Gm44GE44KL44GL44KS5qSc6Ki8XG4gICAgdmFsaWRhdGVFeHBsaWNpdFN0YWNrQWNjb3VudChwcm9wcy5lbnYpO1xuICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiOOBrkFSTuOCkuaknOiovFxuICAgIHZhbGlkYXRlU2Vjb25kYXJ5QnVja2V0QXJuKHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybik7XG5cbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIOWun+ihjOaZguOBqyAtYyBlbnY9cHJvZCDjgajmuKHjgZvjgotcbiAgICBjb25zdCBlbnZOYW1lID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgpLjgrPjg7Pjg4bjgq3jgrnjg4jjgYvjgonlj5blvpfvvIjjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjgoLnlKjmhI/vvIlcbiAgICBjb25zdCBnaXRodWJPd25lckNvbnRleHQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0aHViT3duZXInKTtcbiAgICBjb25zdCBnaXRodWJSZXBvQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJSZXBvJyk7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJCcmFuY2gnKTtcblxuICAgIGNvbnN0IGdpdGh1Yk93bmVyRnJvbUNvbnRleHQgPSBnaXRodWJPd25lckNvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJPd25lckNvbnRleHQpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGdpdGh1YlJlcG9Gcm9tQ29udGV4dCA9IGdpdGh1YlJlcG9Db250ZXh0ICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoZ2l0aHViUmVwb0NvbnRleHQpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IGdpdGh1YkJyYW5jaENvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJCcmFuY2hDb250ZXh0KSA6IHVuZGVmaW5lZDtcblxuICAgIC8vIEdpdEh1YiBPSURD44Gu44Kz44Oz44OG44Kt44K544OI5YCk44KS44OQ44Oq44OH44O844K344On44OzXG4gICAgdmFsaWRhdGVHaXRIdWJPaWRjQ29udGV4dChnaXRodWJPd25lckZyb21Db250ZXh0LCBnaXRodWJSZXBvRnJvbUNvbnRleHQsIGdpdGh1YkJyYW5jaCk7XG5cbiAgICBjb25zdCBnaXRodWJPd25lciA9IGdpdGh1Yk93bmVyRnJvbUNvbnRleHQgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSO1xuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSBnaXRodWJSZXBvRnJvbUNvbnRleHQgfHwgR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE87XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoZXMgPSBnaXRodWJCcmFuY2hcbiAgICAgID8gW1N0cmluZyhnaXRodWJCcmFuY2gpXVxuICAgICAgOiBHSVRIVUJfT0lEQ19DT05GSUcuREVGQVVMVF9CUkFOQ0hFUztcblxuICAgIGNvbnN0IGdpdGh1YlN1YnMgPSBnaXRodWJCcmFuY2hlcy5tYXAoXG4gICAgICAoYnJhbmNoKSA9PiBgcmVwbzoke2dpdGh1Yk93bmVyfS8ke2dpdGh1YlJlcG99OnJlZjpyZWZzL2hlYWRzLyR7YnJhbmNofWAsXG4gICAgKTtcblxuICAgIC8vIEdpdEh1YiBPSURD44Gu6Kit5a6a44GM44OX44Os44O844K544Ob44Or44OA44O844Gu44G+44G+44Gu5aC05ZCI44Gv6K2m5ZGK44KS5Ye644GZXG4gICAgaWYgKFxuICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICApIHtcbiAgICAgIGNkay5Bbm5vdGF0aW9ucy5vZih0aGlzKS5hZGRXYXJuaW5nKFxuICAgICAgICAnR2l0SHViIE9JREMgdHJ1c3QgaXMgdXNpbmcgcGxhY2Vob2xkZXJzLiBQYXNzIC1jIGdpdGh1Yk93bmVyPTxvd25lcj4gLWMgZ2l0aHViUmVwbz08cmVwbz4gYW5kIG9wdGlvbmFsbHkgLWMgZ2l0aHViQnJhbmNoPTxicmFuY2g+IGJlZm9yZSBkZXBsb3ltZW50LicsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIOOCouODvOODhuOCo+ODleOCoeOCr+ODiOeUqOOBrlMz44OQ44Kx44OD44OI44KS5L2c5oiQXG4gICAgY29uc3QgeyBhcnRpZmFjdEJ1Y2tldCB9ID0gY3JlYXRlUHJpbWFyeUFydGlmYWN0QnVja2V0cyh0aGlzLCBlbnZOYW1lLCB0aGlzLmFjY291bnQpO1xuXG4gICAgLy8gR2l0SHViIE9JREPjg63jg7zjg6vjgpLkvZzmiJBcbiAgICBjb25zdCBnaXRodWJSb2xlID0gY3JlYXRlR2l0aHViQWN0aW9uc1JvbGUoe1xuICAgICAgc2NvcGU6IHRoaXMsXG4gICAgICBhY2NvdW50OiB0aGlzLmFjY291bnQsXG4gICAgICBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgIGdpdGh1YlN1YnMsXG4gICAgfSk7XG5cbiAgICAvLyBTM+OCr+ODreOCueODquODvOOCuOODp+ODs+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OCkuioreWumlxuICAgIGNvbnN0IHsgY2ZuQnVja2V0IH0gPSBzZXR1cENyb3NzUmVnaW9uUmVwbGljYXRpb24oe1xuICAgICAgc2NvcGU6IHRoaXMsXG4gICAgICBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgIHNlY29uZGFyeUJ1Y2tldEFybjogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgIH0pO1xuXG4gICAgLy8g44OQ44Kx44OD44OI5ZCN44KS5Ye65YqbXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1Y2tldE5hbWVFeHBvcnQnLCB7XG4gICAgICB2YWx1ZTogYXJ0aWZhY3RCdWNrZXQuYnVja2V0TmFtZSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBBY3Rpb25z44Ot44O844Or44GuQVJO44KS5Ye65YqbXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dpdGh1YkFjdGlvbnNSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IGdpdGh1YlJvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+WFiOODkOOCseODg+ODiOOBrkFSTuOCkuWHuuWKm1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZXBsaWNhdGlvbkRlc3RpbmF0aW9uQnVja2V0QXJuJywge1xuICAgICAgdmFsdWU6IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICB9KTtcblxuICAgIHRoaXMubm9kZS5hZGRWYWxpZGF0aW9uKHtcbiAgICAgIC8vIOOCueOCv+ODg+OCr+WFqOS9k+OBruODkOODquODh+ODvOOCt+ODp+ODs+ODq+ODvOODq+OCkuWumue+qVxuICAgICAgdmFsaWRhdGU6ICgpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAvLyDnkrDlooPlkI3jga7jg5Djg6rjg4fjg7zjgrfjg6fjg7NcbiAgICAgICAgaWYgKCFFTlZfTkFNRV9SRUdFWC50ZXN0KGVudk5hbWUpKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goJ2VudiBjb250ZXh0IG11c3QgYmUgb25lIG9mIGRldiwgdGVzdCwgc3RnLCBwcm9kIGZvciBuYW1pbmcgYW5kIHBvbGljeSBjb25zaXN0ZW5jeS4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdpdEh1YiBPSURD44Gu44OX44Os44O844K544Ob44Or44OA44O85YCk44KS5L2/55So44GX44Gm44GE44KL5aC05ZCI44Gv44CBcHJvZOeSsOWig+OBp+OBr+OCqOODqeODvOOBqOOBmeOCi1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZW52TmFtZSA9PT0gJ3Byb2QnICYmXG4gICAgICAgICAgKFxuICAgICAgICAgICAgZ2l0aHViT3duZXIgPT09IEdJVEhVQl9PSURDX0NPTkZJRy5QTEFDRUhPTERFUl9PV05FUiB8fFxuICAgICAgICAgICAgZ2l0aHViUmVwbyA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX1JFUE9cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGVycm9ycy5wdXNoKCdJbiBlbnY9cHJvZCwgZ2l0aHViT3duZXIgYW5kIGdpdGh1YlJlcG8gcGxhY2Vob2xkZXJzIGFyZSBub3QgYWxsb3dlZC4gUGFzcyBleHBsaWNpdCBjb250ZXh0IHZhbHVlcy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOOCu+OCq+ODs+ODgOODquODkOOCseODg+ODiEFSTuOBruODkOODquODh+ODvOOCt+ODp+ODs1xuICAgICAgICBjb25zdCBleHBlY3RlZFNlY29uZGFyeUJ1Y2tldE5hbWUgPSBgJHtTVE9SQUdFX0NPTkZJRy5CVUNLRVRfUFJFRklYfS0ke2Vudk5hbWV9LXNlY29uZGFyeS0ke3RoaXMuYWNjb3VudH1gO1xuICAgICAgICBjb25zdCBzZWNvbmRhcnlCdWNrZXROYW1lID0gdG9CdWNrZXROYW1lRnJvbUFybihwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4pO1xuICAgICAgICBpZiAoc2Vjb25kYXJ5QnVja2V0TmFtZSAhPT0gZXhwZWN0ZWRTZWNvbmRhcnlCdWNrZXROYW1lKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goXG4gICAgICAgICAgICBgc2Vjb25kYXJ5QnVja2V0QXJuIG11c3QgdGFyZ2V0ICR7ZXhwZWN0ZWRTZWNvbmRhcnlCdWNrZXROYW1lfSBmb3IgZW52L2FjY291bnQgY29uc2lzdGVuY3k7IGdvdCAke3NlY29uZGFyeUJ1Y2tldE5hbWV9LmAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOODrOODl+ODquOCseODvOOCt+ODp+ODs+ioreWumuOBruODkOODquODh+ODvOOCt+ODp+ODs1xuICAgICAgICBjb25zdCByZXBsaWNhdGlvbkNvbmZpZyA9IGNmbkJ1Y2tldC5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gYXMgczMuQ2ZuQnVja2V0LlJlcGxpY2F0aW9uQ29uZmlndXJhdGlvblByb3BlcnR5IHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIXJlcGxpY2F0aW9uQ29uZmlnPy5yb2xlKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goJ1MzIHJlcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gbXVzdCBpbmNsdWRlIGEgcm9sZSBBUk4uJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVwbGljYXRpb25SdWxlcyA9IHJlcGxpY2F0aW9uQ29uZmlnPy5ydWxlcztcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlcGxpY2F0aW9uUnVsZXMpIHx8IHJlcGxpY2F0aW9uUnVsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goJ1MzIHJlcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gbXVzdCBpbmNsdWRlIGF0IGxlYXN0IG9uZSBlbmFibGVkIHJ1bGUuJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JzO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufVxuIl19