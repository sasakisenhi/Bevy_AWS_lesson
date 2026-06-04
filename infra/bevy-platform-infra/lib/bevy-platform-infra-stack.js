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
        // S3クロスリージョンレプリケーションを設定
        const { cfnBucket } = (0, s3_replication_1.setupCrossRegionReplication)({
            scope: this,
            artifactBucket,
            secondaryBucketArn: props.secondaryBucketArn,
        });
        (0, stack_outputs_1.addPrimaryStackOutputs)({
            scope: this,
            artifactBucket,
            githubRole,
            secondaryBucketArn: props.secondaryBucketArn,
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBR25DLHFDQUVrQjtBQUNsQiw2Q0FJc0I7QUFDdEIsNkNBQTREO0FBQzVELCtDQUF3RDtBQUN4RCxxREFBK0Q7QUFDL0QseURBQW9FO0FBQ3BFLG1EQUF5RDtBQU16RCxzREFBc0Q7QUFDdEQsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWtDO1FBQzFFLDZCQUE2QjtRQUM3QixJQUFBLHlDQUE0QixFQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxtQkFBbUI7UUFDbkIsSUFBQSx1Q0FBMEIsRUFBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUVyRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix3QkFBd0I7UUFDeEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1FBRXhELHlDQUF5QztRQUN6QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDaEUsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVwRSxNQUFNLHNCQUFzQixHQUFHLGtCQUFrQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6RyxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN0RyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFakcsOEJBQThCO1FBQzlCLElBQUEsc0NBQXlCLEVBQUMsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFdkYsTUFBTSxXQUFXLEdBQUcsc0JBQXNCLElBQUksMkJBQWtCLENBQUMsaUJBQWlCLENBQUM7UUFDbkYsTUFBTSxVQUFVLEdBQUcscUJBQXFCLElBQUksMkJBQWtCLENBQUMsZ0JBQWdCLENBQUM7UUFDaEYsTUFBTSxjQUFjLEdBQUcsWUFBWTtZQUNqQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDeEIsQ0FBQyxDQUFDLDJCQUFrQixDQUFDLGdCQUFnQixDQUFDO1FBRXhDLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQ25DLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxRQUFRLFdBQVcsSUFBSSxVQUFVLG1CQUFtQixNQUFNLEVBQUUsQ0FDekUsQ0FBQztRQUVGLHNDQUFzQztRQUN0QyxJQUNFLFdBQVcsS0FBSywyQkFBa0IsQ0FBQyxpQkFBaUI7WUFDcEQsVUFBVSxLQUFLLDJCQUFrQixDQUFDLGdCQUFnQixFQUNsRCxDQUFDO1lBQ0QsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUNqQyxzSkFBc0osQ0FDdkosQ0FBQztRQUNKLENBQUM7UUFFRCxzQkFBc0I7UUFDdEIsTUFBTSxFQUFFLGNBQWMsRUFBRSxHQUFHLElBQUEseUNBQTRCLEVBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFckYsb0JBQW9CO1FBQ3BCLE1BQU0sVUFBVSxHQUFHLElBQUEscUNBQXVCLEVBQUM7WUFDekMsS0FBSyxFQUFFLElBQUk7WUFDWCxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsY0FBYztZQUNkLFVBQVU7U0FDWCxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUEsNENBQTJCLEVBQUM7WUFDaEQsS0FBSyxFQUFFLElBQUk7WUFDWCxjQUFjO1lBQ2Qsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFBLHNDQUFzQixFQUFDO1lBQ3JCLEtBQUssRUFBRSxJQUFJO1lBQ1gsY0FBYztZQUNkLFVBQVU7WUFDVixrQkFBa0IsRUFBRSxLQUFLLENBQUMsa0JBQWtCO1NBQzdDLENBQUMsQ0FBQztRQUVILElBQUEsaURBQThCLEVBQUM7WUFDN0IsS0FBSyxFQUFFLElBQUk7WUFDWCxPQUFPO1lBQ1AsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLFdBQVc7WUFDWCxVQUFVO1lBQ1Ysa0JBQWtCLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtZQUM1QyxTQUFTO1NBQ1YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBL0VELHdEQStFQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW1wb3J0IHtcbiAgR0lUSFVCX09JRENfQ09ORklHLFxufSBmcm9tICcuL2NvbmZpZyc7XG5pbXBvcnQge1xuICB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50LFxuICB2YWxpZGF0ZUdpdEh1Yk9pZGNDb250ZXh0LFxuICB2YWxpZGF0ZVNlY29uZGFyeUJ1Y2tldEFybixcbn0gZnJvbSAnLi92YWxpZGF0b3JzJztcbmltcG9ydCB7IGNyZWF0ZVByaW1hcnlBcnRpZmFjdEJ1Y2tldHMgfSBmcm9tICcuL3MzLWJ1Y2tldHMnO1xuaW1wb3J0IHsgY3JlYXRlR2l0aHViQWN0aW9uc1JvbGUgfSBmcm9tICcuL2dpdGh1Yi1vaWRjJztcbmltcG9ydCB7IHNldHVwQ3Jvc3NSZWdpb25SZXBsaWNhdGlvbiB9IGZyb20gJy4vczMtcmVwbGljYXRpb24nO1xuaW1wb3J0IHsgcmVnaXN0ZXJQcmltYXJ5U3RhY2tWYWxpZGF0aW9uIH0gZnJvbSAnLi9zdGFjay12YWxpZGF0b3JzJztcbmltcG9ydCB7IGFkZFByaW1hcnlTdGFja091dHB1dHMgfSBmcm9tICcuL3N0YWNrLW91dHB1dHMnO1xuXG5pbnRlcmZhY2UgQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzZWNvbmRhcnlCdWNrZXRBcm46IHN0cmluZztcbn1cblxuLy8g44OX44Op44Kk44Oe44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgahHaXRIdWIgT0lEQ+ODreODvOODq+OCkuS9nOaIkOOBmeOCi+OCueOCv+ODg+OCr1xuZXhwb3J0IGNsYXNzIEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQmV2eVBsYXRmb3JtSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgLy8gQVdT44Ki44Kr44Km44Oz44OISUTjgYzmmI7npLrnmoTjgavmjIflrprjgZXjgozjgabjgYTjgovjgYvjgpLmpJzoqLxcbiAgICB2YWxpZGF0ZUV4cGxpY2l0U3RhY2tBY2NvdW50KHByb3BzLmVudik7XG4gICAgLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS5qSc6Ki8XG4gICAgdmFsaWRhdGVTZWNvbmRhcnlCdWNrZXRBcm4ocHJvcHMuc2Vjb25kYXJ5QnVja2V0QXJuKTtcblxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8g5a6f6KGM5pmC44GrIC1jIGVudj1wcm9kIOOBqOa4oeOBm+OCi1xuICAgIGNvbnN0IGVudk5hbWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+OBruioreWumuOCkuOCs+ODs+ODhuOCreOCueODiOOBi+OCieWPluW+l++8iOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCgueUqOaEj++8iVxuICAgIGNvbnN0IGdpdGh1Yk93bmVyQ29udGV4dCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRodWJPd25lcicpO1xuICAgIGNvbnN0IGdpdGh1YlJlcG9Db250ZXh0ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YlJlcG8nKTtcbiAgICBjb25zdCBnaXRodWJCcmFuY2hDb250ZXh0ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2dpdGh1YkJyYW5jaCcpO1xuXG4gICAgY29uc3QgZ2l0aHViT3duZXJGcm9tQ29udGV4dCA9IGdpdGh1Yk93bmVyQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGdpdGh1Yk93bmVyQ29udGV4dCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZ2l0aHViUmVwb0Zyb21Db250ZXh0ID0gZ2l0aHViUmVwb0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhnaXRodWJSZXBvQ29udGV4dCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZ2l0aHViQnJhbmNoID0gZ2l0aHViQnJhbmNoQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGdpdGh1YkJyYW5jaENvbnRleHQpIDogdW5kZWZpbmVkO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7jgrPjg7Pjg4bjgq3jgrnjg4jlgKTjgpLjg5Djg6rjg4fjg7zjgrfjg6fjg7NcbiAgICB2YWxpZGF0ZUdpdEh1Yk9pZGNDb250ZXh0KGdpdGh1Yk93bmVyRnJvbUNvbnRleHQsIGdpdGh1YlJlcG9Gcm9tQ29udGV4dCwgZ2l0aHViQnJhbmNoKTtcblxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gZ2l0aHViT3duZXJGcm9tQ29udGV4dCB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfT1dORVI7XG4gICAgY29uc3QgZ2l0aHViUmVwbyA9IGdpdGh1YlJlcG9Gcm9tQ29udGV4dCB8fCBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQTztcbiAgICBjb25zdCBnaXRodWJCcmFuY2hlcyA9IGdpdGh1YkJyYW5jaFxuICAgICAgPyBbU3RyaW5nKGdpdGh1YkJyYW5jaCldXG4gICAgICA6IEdJVEhVQl9PSURDX0NPTkZJRy5ERUZBVUxUX0JSQU5DSEVTO1xuXG4gICAgY29uc3QgZ2l0aHViU3VicyA9IGdpdGh1YkJyYW5jaGVzLm1hcChcbiAgICAgIChicmFuY2gpID0+IGByZXBvOiR7Z2l0aHViT3duZXJ9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvJHticmFuY2h9YCxcbiAgICApO1xuXG4gICAgLy8gR2l0SHViIE9JREPjga7oqK3lrprjgYzjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjga7jgb7jgb7jga7loLTlkIjjga/orablkYrjgpLlh7rjgZlcbiAgICBpZiAoXG4gICAgICBnaXRodWJPd25lciA9PT0gR0lUSFVCX09JRENfQ09ORklHLlBMQUNFSE9MREVSX09XTkVSIHx8XG4gICAgICBnaXRodWJSZXBvID09PSBHSVRIVUJfT0lEQ19DT05GSUcuUExBQ0VIT0xERVJfUkVQT1xuICAgICkge1xuICAgICAgY2RrLkFubm90YXRpb25zLm9mKHRoaXMpLmFkZFdhcm5pbmcoXG4gICAgICAgICdHaXRIdWIgT0lEQyB0cnVzdCBpcyB1c2luZyBwbGFjZWhvbGRlcnMuIFBhc3MgLWMgZ2l0aHViT3duZXI9PG93bmVyPiAtYyBnaXRodWJSZXBvPTxyZXBvPiBhbmQgb3B0aW9uYWxseSAtYyBnaXRodWJCcmFuY2g9PGJyYW5jaD4gYmVmb3JlIGRlcGxveW1lbnQuJyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8g44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJBcbiAgICBjb25zdCB7IGFydGlmYWN0QnVja2V0IH0gPSBjcmVhdGVQcmltYXJ5QXJ0aWZhY3RCdWNrZXRzKHRoaXMsIGVudk5hbWUsIHRoaXMuYWNjb3VudCk7XG5cbiAgICAvLyBHaXRIdWIgT0lEQ+ODreODvOODq+OCkuS9nOaIkFxuICAgIGNvbnN0IGdpdGh1YlJvbGUgPSBjcmVhdGVHaXRodWJBY3Rpb25zUm9sZSh7XG4gICAgICBzY29wZTogdGhpcyxcbiAgICAgIGFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICAgIGFydGlmYWN0QnVja2V0LFxuICAgICAgZ2l0aHViU3VicyxcbiAgICB9KTtcblxuICAgIC8vIFMz44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44KS6Kit5a6aXG4gICAgY29uc3QgeyBjZm5CdWNrZXQgfSA9IHNldHVwQ3Jvc3NSZWdpb25SZXBsaWNhdGlvbih7XG4gICAgICBzY29wZTogdGhpcyxcbiAgICAgIGFydGlmYWN0QnVja2V0LFxuICAgICAgc2Vjb25kYXJ5QnVja2V0QXJuOiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgfSk7XG5cbiAgICBhZGRQcmltYXJ5U3RhY2tPdXRwdXRzKHtcbiAgICAgIHNjb3BlOiB0aGlzLFxuICAgICAgYXJ0aWZhY3RCdWNrZXQsXG4gICAgICBnaXRodWJSb2xlLFxuICAgICAgc2Vjb25kYXJ5QnVja2V0QXJuOiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgfSk7XG5cbiAgICByZWdpc3RlclByaW1hcnlTdGFja1ZhbGlkYXRpb24oe1xuICAgICAgc2NvcGU6IHRoaXMsXG4gICAgICBlbnZOYW1lLFxuICAgICAgYWNjb3VudDogdGhpcy5hY2NvdW50LFxuICAgICAgZ2l0aHViT3duZXIsXG4gICAgICBnaXRodWJSZXBvLFxuICAgICAgc2Vjb25kYXJ5QnVja2V0QXJuOiBwcm9wcy5zZWNvbmRhcnlCdWNrZXRBcm4sXG4gICAgICBjZm5CdWNrZXQsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==