#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib/core"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cdk_nag_1 = require("cdk-nag");
const bevy_platform_infra_stack_1 = require("../lib/bevy-platform-infra-stack");
const secondary_bucket_stack_1 = require("../lib/secondary-bucket-stack");
const validators_1 = require("../lib/validators");
// CDKアプリケーションのエントリーポイント
const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
// CDK_DEFAULT_ACCOUNTが設定されていることを検証し、AWSアカウントIDを取得
const account = (0, validators_1.validateCdkDefaultAccount)(process.env.CDK_DEFAULT_ACCOUNT);
// プライマリリージョンとセカンダリリージョンを定義
const primaryRegion = 'ap-northeast-1';
const secondaryRegion = 'us-east-1';
// セカンダリリージョンにアーティファクト用のS3バケットを作成するスタックを先にデプロイして、ARNを取得
const secondaryStack = new secondary_bucket_stack_1.SecondaryBucketStack(app, 'BevyPlatformInfraSecondaryBucketStack', {
    env: {
        account,
        region: secondaryRegion,
    },
    description: 'Secondary region bucket stack for artifact cross-region replication',
    envName,
});
// セカンダリバケットのARNをプライマリスタックに渡して、クロスリージョンレプリケーションを設定
const secondaryBucketArn = `arn:aws:s3:::${secondaryStack.bucketName}`;
// プライマリリージョンにアーティファクト用のS3バケットとGitHub OIDCロールを作成するスタック
const primaryStack = new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'BevyPlatformInfraStack', {
    env: {
        account,
        region: primaryRegion,
    },
    description: 'Primary region stack for artifact storage and GitHub OIDC role',
    secondaryBucketArn,
});
// デプロイ順序を保証（セカンダリ作成完了後にプライマリを更新）
primaryStack.addDependency(secondaryStack);
// cdk-nag: AWS Solutions チェックをアプリ全体に適用
aws_cdk_lib_1.Aspects.of(app).add(new cdk_nag_1.AwsSolutionsChecks({ verbose: true }));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0Esc0RBQXdDO0FBQ3hDLDZDQUFzQztBQUN0QyxxQ0FBNkM7QUFDN0MsZ0ZBQTBFO0FBQzFFLDBFQUFxRTtBQUNyRSxrREFBOEQ7QUFFOUQsd0JBQXdCO0FBQ3hCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUN2RCxrREFBa0Q7QUFDbEQsTUFBTSxPQUFPLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7QUFFM0UsMkJBQTJCO0FBQzNCLE1BQU0sYUFBYSxHQUFHLGdCQUFnQixDQUFDO0FBQ3ZDLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQztBQUVwQyx1REFBdUQ7QUFDdkQsTUFBTSxjQUFjLEdBQUcsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsdUNBQXVDLEVBQUU7SUFDNUYsR0FBRyxFQUFFO1FBQ0gsT0FBTztRQUNQLE1BQU0sRUFBRSxlQUFlO0tBQ3hCO0lBQ0QsV0FBVyxFQUFFLHFFQUFxRTtJQUNsRixPQUFPO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsa0RBQWtEO0FBQ2xELE1BQU0sa0JBQWtCLEdBQUcsZ0JBQWdCLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUV2RSxzREFBc0Q7QUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxrREFBc0IsQ0FBQyxHQUFHLEVBQUUsd0JBQXdCLEVBQUU7SUFDN0UsR0FBRyxFQUFFO1FBQ0gsT0FBTztRQUNQLE1BQU0sRUFBRSxhQUFhO0tBQ3RCO0lBQ0QsV0FBVyxFQUFFLGdFQUFnRTtJQUM3RSxrQkFBa0I7Q0FDbkIsQ0FBQyxDQUFDO0FBRUgsaUNBQWlDO0FBQ2pDLFlBQVksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFM0MsdUNBQXVDO0FBQ3ZDLHFCQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDRCQUFrQixDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYi9jb3JlJztcbmltcG9ydCB7IEFzcGVjdHMgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBd3NTb2x1dGlvbnNDaGVja3MgfSBmcm9tICdjZGstbmFnJztcbmltcG9ydCB7IEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBTZWNvbmRhcnlCdWNrZXRTdGFjayB9IGZyb20gJy4uL2xpYi9zZWNvbmRhcnktYnVja2V0LXN0YWNrJztcbmltcG9ydCB7IHZhbGlkYXRlQ2RrRGVmYXVsdEFjY291bnQgfSBmcm9tICcuLi9saWIvdmFsaWRhdG9ycyc7XG5cbi8vIENES+OCouODl+ODquOCseODvOOCt+ODp+ODs+OBruOCqOODs+ODiOODquODvOODneOCpOODs+ODiFxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbmNvbnN0IGVudk5hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2Jztcbi8vIENES19ERUZBVUxUX0FDQ09VTlTjgYzoqK3lrprjgZXjgozjgabjgYTjgovjgZPjgajjgpLmpJzoqLzjgZfjgIFBV1PjgqLjgqvjgqbjg7Pjg4hJROOCkuWPluW+l1xuY29uc3QgYWNjb3VudCA9IHZhbGlkYXRlQ2RrRGVmYXVsdEFjY291bnQocHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCk7XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBqOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OCkuWumue+qVxuY29uc3QgcHJpbWFyeVJlZ2lvbiA9ICdhcC1ub3J0aGVhc3QtMSc7XG5jb25zdCBzZWNvbmRhcnlSZWdpb24gPSAndXMtZWFzdC0xJztcblxuLy8g44K744Kr44Oz44OA44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq/jgpLlhYjjgavjg4fjg5fjg63jgqTjgZfjgabjgIFBUk7jgpLlj5blvpdcbmNvbnN0IHNlY29uZGFyeVN0YWNrID0gbmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ0JldnlQbGF0Zm9ybUluZnJhU2Vjb25kYXJ5QnVja2V0U3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQsXG4gICAgcmVnaW9uOiBzZWNvbmRhcnlSZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnU2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQgc3RhY2sgZm9yIGFydGlmYWN0IGNyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbicsXG4gIGVudk5hbWUsXG59KTtcblxuLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gr5rih44GX44Gm44CB44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44KS6Kit5a6aXG5jb25zdCBzZWNvbmRhcnlCdWNrZXRBcm4gPSBgYXJuOmF3czpzMzo6OiR7c2Vjb25kYXJ5U3RhY2suYnVja2V0TmFtZX1gO1xuXG4vLyDjg5fjg6njgqTjg57jg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOBqEdpdEh1YiBPSURD44Ot44O844Or44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5jb25zdCBwcmltYXJ5U3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50LFxuICAgIHJlZ2lvbjogcHJpbWFyeVJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdQcmltYXJ5IHJlZ2lvbiBzdGFjayBmb3IgYXJ0aWZhY3Qgc3RvcmFnZSBhbmQgR2l0SHViIE9JREMgcm9sZScsXG4gIHNlY29uZGFyeUJ1Y2tldEFybixcbn0pO1xuXG4vLyDjg4fjg5fjg63jgqTpoIbluo/jgpLkv53oqLzvvIjjgrvjgqvjg7Pjg4Djg6rkvZzmiJDlrozkuoblvozjgavjg5fjg6njgqTjg57jg6rjgpLmm7TmlrDvvIlcbnByaW1hcnlTdGFjay5hZGREZXBlbmRlbmN5KHNlY29uZGFyeVN0YWNrKTtcblxuLy8gY2RrLW5hZzogQVdTIFNvbHV0aW9ucyDjg4Hjgqfjg4Pjgq/jgpLjgqLjg5fjg6rlhajkvZPjgavpgannlKhcbkFzcGVjdHMub2YoYXBwKS5hZGQobmV3IEF3c1NvbHV0aW9uc0NoZWNrcyh7IHZlcmJvc2U6IHRydWUgfSkpO1xuIl19