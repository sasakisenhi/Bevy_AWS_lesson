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
const codebuild_prep_role_1 = require("./codebuild-prep-role");
const s3_replication_1 = require("./s3-replication");
const stack_validators_1 = require("./stack-validators");
const stack_outputs_1 = require("./stack-outputs");
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
        // 将来のCodeBuild移行に備えた最小サービスロールを作成
        const codeBuildServiceRole = (0, codebuild_prep_role_1.createCodeBuildPreparationRole)({
            scope: this,
            artifactBucket,
        });
        // S3クロスリージョンレプリケーションを設定
        const { cfnBucket } = (0, s3_replication_1.setupCrossRegionReplication)({
            scope: this,
            artifactBucket,
            secondaryBucketArn: props.secondaryBucketArn,
        });
        // スタックの出力を追加
        (0, stack_outputs_1.addPrimaryStackOutputs)({
            scope: this,
            artifactBucket,
            githubRole,
            codeBuildServiceRole,
            secondaryBucketArn: props.secondaryBucketArn,
        });
        // スタックのバリデーションを登録
        (0, stack_validators_1.registerPrimaryStackValidation)({
            scope: this,
            envName,
            account: this.account,
            githubOwner,
            githubRepo,
            secondaryBucketArn: props.secondaryBucketArn,
            cfnBucket,
        });
    }
}
exports.BevyPlatformInfraStack = BevyPlatformInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBR25DLHFDQUVrQjtBQUNsQiw2Q0FJc0I7QUFDdEIsNkNBQTREO0FBQzVELCtDQUF3RDtBQUN4RCwrREFBdUU7QUFDdkUscURBQStEO0FBQy9ELHlEQUFvRTtBQUNwRSxtREFBeUQ7QUFNekQsc0RBQXNEO0FBQ3RELE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSw2QkFBNkI7UUFDN0IsSUFBQSx5Q0FBNEIsRUFBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsbUJBQW1CO1FBQ25CLElBQUEsdUNBQTBCLEVBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFckQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsd0JBQXdCO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUV4RCx5Q0FBeUM7UUFDekMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRSxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFcEUsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDekcsTUFBTSxxQkFBcUIsR0FBRyxpQkFBaUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdEcsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRWpHLDhCQUE4QjtRQUM5QixJQUFBLHNDQUF5QixFQUFDLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRXZGLE1BQU0sV0FBVyxHQUFHLHNCQUFzQixJQUFJLDJCQUFrQixDQUFDLGlCQUFpQixDQUFDO1FBQ25GLE1BQU0sVUFBVSxHQUFHLHFCQUFxQixJQUFJLDJCQUFrQixDQUFDLGdCQUFnQixDQUFDO1FBQ2hGLE1BQU0sY0FBYyxHQUFHLFlBQVk7WUFDakMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3hCLENBQUMsQ0FBQywyQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQztRQUV4QyxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUNuQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsUUFBUSxXQUFXLElBQUksVUFBVSxtQkFBbUIsTUFBTSxFQUFFLENBQ3pFLENBQUM7UUFFRixzQ0FBc0M7UUFDdEMsSUFDRSxXQUFXLEtBQUssMkJBQWtCLENBQUMsaUJBQWlCO1lBQ3BELFVBQVUsS0FBSywyQkFBa0IsQ0FBQyxnQkFBZ0IsRUFDbEQsQ0FBQztZQUNELEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FDakMsc0pBQXNKLENBQ3ZKLENBQUM7UUFDSixDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLE1BQU0sRUFBRSxjQUFjLEVBQUUsR0FBRyxJQUFBLHlDQUE0QixFQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXJGLG9CQUFvQjtRQUNwQixNQUFNLFVBQVUsR0FBRyxJQUFBLHFDQUF1QixFQUFDO1lBQ3pDLEtBQUssRUFBRSxJQUFJO1lBQ1gsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLGNBQWM7WUFDZCxVQUFVO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLE1BQU0sb0JBQW9CLEdBQUcsSUFBQSxvREFBOEIsRUFBQztZQUMxRCxLQUFLLEVBQUUsSUFBSTtZQUNYLGNBQWM7U0FDZixDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUEsNENBQTJCLEVBQUM7WUFDaEQsS0FBSyxFQUFFLElBQUk7WUFDWCxjQUFjO1lBQ2Qsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtTQUM3QyxDQUFDLENBQUM7UUFFUCxhQUFhO1FBQ1QsSUFBQSxzQ0FBc0IsRUFBQztZQUNyQixLQUFLLEVBQUUsSUFBSTtZQUNYLGNBQWM7WUFDZCxVQUFVO1lBQ1Ysb0JBQW9CO1lBQ3BCLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxrQkFBa0I7U0FDN0MsQ0FBQyxDQUFDO1FBRVAsa0JBQWtCO1FBQ2QsSUFBQSxpREFBOEIsRUFBQztZQUM3QixLQUFLLEVBQUUsSUFBSTtZQUNYLE9BQU87WUFDUCxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsV0FBVztZQUNYLFVBQVU7WUFDVixrQkFBa0IsRUFBRSxLQUFLLENBQUMsa0JBQWtCO1lBQzVDLFNBQVM7U0FDVixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4RkQsd0RBd0ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbXBvcnQge1xuICBHSVRIVUJfT0lEQ19DT05GSUcsXG59IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7XG4gIHZhbGlkYXRlRXhwbGljaXRTdGFja0FjY291bnQsXG4gIHZhbGlkYXRlR2l0SHViT2lkY0NvbnRleHQsXG4gIHZhbGlkYXRlU2Vjb25kYXJ5QnVja2V0QXJuLFxufSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuaW1wb3J0IHsgY3JlYXRlUHJpbWFyeUFydGlmYWN0QnVja2V0cyB9IGZyb20gJy4vczMtYnVja2V0cyc7XG5pbXBvcnQgeyBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSB9IGZyb20gJy4vZ2l0aHViLW9pZGMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZUJ1aWxkUHJlcGFyYXRpb25Sb2xlIH0gZnJvbSAnLi9jb2RlYnVpbGQtcHJlcC1yb2xlJztcbmltcG9ydCB7IHNldHVwQ3Jvc3NSZWdpb25SZXBsaWNhdGlvbiB9IGZyb20gJy4vczMtcmVwbGljYXRpb24nO1xuaW1wb3J0IHsgcmVnaXN0ZXJQcmltYXJ5U3RhY2tWYWxpZGF0aW9uIH0gZnJvbSAnLi9zdGFjay12YWxpZGF0b3JzJztcbmltcG9ydCB7IGFkZFByaW1hcnlTdGFja091dHB1dHMgfSBmcm9tICcuL3N0YWNrLW91dHB1dHMnO1xuXG5pbnRlcmZhY2UgQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzZWNvbmRhcnlCdWNrZXRBcm46IHN0cmluZztcbn1cblxuLy8g44OX44Op44Kk44Oe44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgahHaXRIdWIgT0lEQ+ODreODvOODq+OCkuS9nOaIkOOBmeOCi+OCueOCv+ODg+OCr1xuZXhwb3J0IGNsYXNzIEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgLy8gQVdT44Ki44Kr44Km44Oz44OISUTjgYzmmI7npLrnmoTjgavmjIflrprjgZXjgozjgabjgYTjgovjgYvjgpLmpJzoqLxcbiAgICB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50KHByb3BzLmVudik7XG4gICAgLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS5qSc6Ki8XG4gICAgdmFsaWRhdGVTZWNvbmRhcnlCdWNrZXRBcm4ocHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuKTtcblxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8g5a6f6KGM5pmC44GrIC1jIGVudj1wcm9kIOOBqOa4oeOBm+OCi1xuICAgIGNvbnN0IGVudk5hbWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOCkuOCs+ODs+ODhuOCreOCueODiOOBi+OCieWPluW+l++8iOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCgueUqOaEj++8iVxuICAgIGNvbnN0IGdpdGh1Yk93bmVyQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJPd25lcicpO1xuICAgIGNvbnN0IGdpdGh1YlJlcG9Db250ZXh0ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YlJlcG8nKTtcbiAgICBjb25zdCBnaXRodWJCcmFuY2hDb250ZXh0ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YkJyYW5jaCcpO1xuXG4gICAgY29uc3QgZ2l0aHViT3duZXJGcm9tQ29udGV4dCA9IGdpdGh1Yk93bmVyQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGdpdGh1Yk93bmVyQ29udGV4dCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZ2l0aHViUmVwb0Zyb21Db250ZXh0ID0gZ2l0aHViUmVwb0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJSZXBvQ29udGV4dCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoID0gZ2l0aHViQnJhbmNoQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGdpdGh1YkJyYW5jaENvbnRleHQpIDogdW5kZWZpbmVkO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7jgrPjg7Pjg4bjgq3jgrnjg4jlgKTjgpLjg5Djg6rjg4fjg7zjgrfjg6fjg7NcbiAgICB2YWxpZGF0ZUdpdEh1Yk9pZGNDb250ZXh0KGdpdGh1Yk93bmVyRnJvbUNvbnRleHQsIGdpdGh1YlJlcG9Gcm9tQ29udGV4dCwgZ2l0aHViQnJhbmNoKTtcblxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gZ2l0aHViT3duZXJGcm9tQ29udGV4dCB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfT1dORVI7XG4gICAgY29uc3QgZ2l0aHViUmVwbyA9IGdpdGh1YlJlcG9Gcm9tQ29udGV4dCB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQTztcbiAgICBjb25zdCBnaXRodWJCcmFuY2hlcyA9IGdpdGh1YkJyYW5jaFxuICAgICAgPyBbU3RyaW5nKGdpdGh1YkJyYW5jaCldXG4gICAgICA6IEdJVEhVQl9PSURDX0NPTkZJRy5ERUZBVUxUX0JSQU5DSEVTO1xuXG4gICAgY29uc3QgZ2l0aHViU3VicyA9IGdpdGh1YkJyYW5jaGVzLm1hcChcbiAgICAgIChicmFuY2gpID0+IGByZXBvOiR7Z2l0aHViT3duZXJ9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvJHticmFuY2h9YCxcbiAgICApO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgYzjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjga7jgb7jgb7jga7loLTlkIjjga/orablkYrjgpLlh7rjgZlcbiAgICBpZiAoXG4gICAgICBnaXRodWJPd25lciA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSIHx8XG4gICAgICBnaXRodWJSZXBvID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQT1xuICAgICkge1xuICAgICAgY2RrLkFubm90YXRpb25zLm9mKHRoaXMpLmFkZFdhcm5pbmcoXG4gICAgICAgICdHaXRIdWIgT0lEQyB0cnVzdCBpcyB1c2luZyBwbGFjZWhvbGRlcnMuIFBhc3MgLWMgZ2l0aHViT3duZXI9PG93bmVyPiAtYyBnaXRodWJSZXBvPTxyZXBvPiBhbmQgb3B0aW9uYWxseSAtYyBnaXRodWJCcmFuY2g9PGJyYW5jaD4gYmVmb3JlIGRlcGxveW1lbnQuJyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8g44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJBcbiAgICBjb25zdCB7IGFydGlmYWN0QnVja2V0IH0gPSBjcmVhdGVQcmltYXJ5QXJ0aWZhY3RCdWNrZXRzKHRoaXMsIGVudk5hbWUsIHRoaXMuYWNjb3VudCk7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OCkuS9nOaIkFxuICAgIGNvbnN0IGdpdGh1YlJvbGUgPSBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSh7XG4gICAgICBzY29wZTogdGhpcyxcbiAgICAgIGFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICAgIGFydGlmYWN0QnVja2V0LFxuICAgICAgZ2l0aHViU3VicyxcbiAgICB9KTtcblxuICAgIC8vIOWwhuadpeOBrkNvZGVCdWlsZOenu+ihjOOBq+WCmeOBiOOBn+acgOWwj+OCteODvOODk+OCueODreODvOODq+OCkuS9nOaIkFxuICAgIGNvbnN0IGNvZGVCdWlsZFNlcnZpY2VSb2xlID0gY3JlYXRlQ29kZUJ1aWxkUHJlcGFyYXRpb25Sb2xlKHtcbiAgICAgIHNjb3BlOiB0aGlzLFxuICAgICAgYXJ0aWZhY3RCdWNrZXQsXG4gICAgfSk7XG5cbiAgICAvLyBTM+OCr+ODreOCueODquODvOOCuOODp+ODs+ODrOODl+ODquOCseODvOOCt+ODp+ODs+OCkuioreWumlxuICAgIGNvbnN0IHsgY2ZuQnVja2V0IH0gPSBzZXR1cENyb3NzUmVnaW9uUmVwbGljYXRpb24oe1xuICAgICAgc2NvcGU6IHRoaXMsXG4gICAgICBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgIHNlY29uZGFyeUJ1Y2tldEFybjogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgIH0pO1xuXG4vLyDjgrnjgr/jg4Pjgq/jga7lh7rlipvjgpLov73liqBcbiAgICBhZGRQcmltYXJ5U3RhY2tPdXRwdXRzKHtcbiAgICAgIHNjb3BlOiB0aGlzLFxuICAgICAgYXJ0aWZhY3RCdWNrZXQsXG4gICAgICBnaXRodWJSb2xlLFxuICAgICAgY29kZUJ1aWxkU2VydmljZVJvbGUsXG4gICAgICBzZWNvbmRhcnlCdWNrZXRBcm46IHByb3BzLnNlY29uZGFyeUJ1Y2tldEFybixcbiAgICB9KTtcblxuLy8g44K544K/44OD44Kv44Gu44OQ44Oq44OH44O844K344On44Oz44KS55m76YyyXG4gICAgcmVnaXN0ZXJQcmltYXJ5U3RhY2tWYWxpZGF0aW9uKHtcbiAgICAgIHNjb3BlOiB0aGlzLFxuICAgICAgZW52TmFtZSxcbiAgICAgIGFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICAgIGdpdGh1Yk93bmVyLFxuICAgICAgZ2l0aHViUmVwbyxcbiAgICAgIHNlY29uZGFyeUJ1Y2tldEFybjogcHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuLFxuICAgICAgY2ZuQnVja2V0LFxuICAgIH0pO1xuICB9XG59XG4iXX0=