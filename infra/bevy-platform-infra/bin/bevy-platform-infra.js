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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0Esc0RBQXdDO0FBQ3hDLDZDQUFzQztBQUN0QyxxQ0FBNkM7QUFDN0MsZ0ZBQTBFO0FBQzFFLDBFQUFxRTtBQUNyRSxrREFBOEQ7QUFFOUQsd0JBQXdCO0FBQ3hCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUN2RCxNQUFNLE9BQU8sR0FBRyxJQUFBLHNDQUF5QixFQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUUzRSwyQkFBMkI7QUFDM0IsTUFBTSxhQUFhLEdBQUcsZ0JBQWdCLENBQUM7QUFDdkMsTUFBTSxlQUFlLEdBQUcsV0FBVyxDQUFDO0FBRXBDLHVEQUF1RDtBQUN2RCxNQUFNLGNBQWMsR0FBRyxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSx1Q0FBdUMsRUFBRTtJQUM1RixHQUFHLEVBQUU7UUFDSCxPQUFPO1FBQ1AsTUFBTSxFQUFFLGVBQWU7S0FDeEI7SUFDRCxXQUFXLEVBQUUscUVBQXFFO0lBQ2xGLE9BQU87Q0FDUixDQUFDLENBQUM7QUFFSCxrREFBa0Q7QUFDbEQsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBRXZFLHNEQUFzRDtBQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLGtEQUFzQixDQUFDLEdBQUcsRUFBRSx3QkFBd0IsRUFBRTtJQUM3RSxHQUFHLEVBQUU7UUFDSCxPQUFPO1FBQ1AsTUFBTSxFQUFFLGFBQWE7S0FDdEI7SUFDRCxXQUFXLEVBQUUsZ0VBQWdFO0lBQzdFLGtCQUFrQjtDQUNuQixDQUFDLENBQUM7QUFFSCxpQ0FBaUM7QUFDakMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUUzQyx1Q0FBdUM7QUFDdkMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksNEJBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliL2NvcmUnO1xuaW1wb3J0IHsgQXNwZWN0cyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF3c1NvbHV0aW9uc0NoZWNrcyB9IGZyb20gJ2Nkay1uYWcnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuaW1wb3J0IHsgdmFsaWRhdGVDZGtEZWZhdWx0QWNjb3VudCB9IGZyb20gJy4uL2xpYi92YWxpZGF0b3JzJztcblxuLy8gQ0RL44Ki44OX44Oq44Kx44O844K344On44Oz44Gu44Ko44Oz44OI44Oq44O844Od44Kk44Oz44OIXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuY29uc3QgZW52TmFtZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xuY29uc3QgYWNjb3VudCA9IHZhbGlkYXRlQ2RrRGVmYXVsdEFjY291bnQocHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCk7XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBqOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OCkuWumue+qVxuY29uc3QgcHJpbWFyeVJlZ2lvbiA9ICdhcC1ub3J0aGVhc3QtMSc7XG5jb25zdCBzZWNvbmRhcnlSZWdpb24gPSAndXMtZWFzdC0xJztcblxuLy8g44K744Kr44Oz44OA44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq/jgpLlhYjjgavjg4fjg5fjg63jgqTjgZfjgabjgIFBUk7jgpLlj5blvpdcbmNvbnN0IHNlY29uZGFyeVN0YWNrID0gbmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ0JldnlQbGF0Zm9ybUluZnJhU2Vjb25kYXJ5QnVja2V0U3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQsXG4gICAgcmVnaW9uOiBzZWNvbmRhcnlSZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnU2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQgc3RhY2sgZm9yIGFydGlmYWN0IGNyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbicsXG4gIGVudk5hbWUsXG59KTtcblxuLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gr5rih44GX44Gm44CB44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44KS6Kit5a6aXG5jb25zdCBzZWNvbmRhcnlCdWNrZXRBcm4gPSBgYXJuOmF3czpzMzo6OiR7c2Vjb25kYXJ5U3RhY2suYnVja2V0TmFtZX1gO1xuXG4vLyDjg5fjg6njgqTjg57jg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOBqEdpdEh1YiBPSURD44Ot44O844Or44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5jb25zdCBwcmltYXJ5U3RhY2sgPSBuZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50LFxuICAgIHJlZ2lvbjogcHJpbWFyeVJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdQcmltYXJ5IHJlZ2lvbiBzdGFjayBmb3IgYXJ0aWZhY3Qgc3RvcmFnZSBhbmQgR2l0SHViIE9JREMgcm9sZScsXG4gIHNlY29uZGFyeUJ1Y2tldEFybixcbn0pO1xuXG4vLyDjg4fjg5fjg63jgqTpoIbluo/jgpLkv53oqLzvvIjjgrvjgqvjg7Pjg4Djg6rkvZzmiJDlrozkuoblvozjgavjg5fjg6njgqTjg57jg6rjgpLmm7TmlrDvvIlcbnByaW1hcnlTdGFjay5hZGREZXBlbmRlbmN5KHNlY29uZGFyeVN0YWNrKTtcblxuLy8gY2RrLW5hZzogQVdTIFNvbHV0aW9ucyDjg4Hjgqfjg4Pjgq/jgpLjgqLjg5fjg6rlhajkvZPjgavpgannlKhcbkFzcGVjdHMub2YoYXBwKS5hZGQobmV3IEF3c1NvbHV0aW9uc0NoZWNrcyh7IHZlcmJvc2U6IHRydWUgfSkpO1xuIl19