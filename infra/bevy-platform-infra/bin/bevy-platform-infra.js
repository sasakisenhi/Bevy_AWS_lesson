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
const bevy_platform_infra_stack_1 = require("../lib/bevy-platform-infra-stack");
const secondary_bucket_stack_1 = require("../lib/secondary-bucket-stack");
// CDKアプリケーションのエントリーポイント
const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
// AWSアカウントIDが環境変数から取得できない場合はエラーをスローして、AWS認証情報の設定を促す
if (!account) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required. Configure AWS credentials before synth/deploy.');
}
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
new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'BevyPlatformInfraStack', {
    env: {
        account,
        region: primaryRegion,
    },
    description: 'Primary region stack for artifact storage and GitHub OIDC role',
    secondaryBucketArn,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0Esc0RBQXdDO0FBQ3hDLGdGQUEwRTtBQUMxRSwwRUFBcUU7QUFFckUsd0JBQXdCO0FBQ3hCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUN2RCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBRWhELG9EQUFvRDtBQUNwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDYixNQUFNLElBQUksS0FBSyxDQUFDLGlGQUFpRixDQUFDLENBQUM7QUFDckcsQ0FBQztBQUVELDJCQUEyQjtBQUMzQixNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQztBQUN2QyxNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUM7QUFFcEMsdURBQXVEO0FBQ3ZELE1BQU0sY0FBYyxHQUFHLElBQUksNkNBQW9CLENBQUMsR0FBRyxFQUFFLHVDQUF1QyxFQUFFO0lBQzVGLEdBQUcsRUFBRTtRQUNILE9BQU87UUFDUCxNQUFNLEVBQUUsZUFBZTtLQUN4QjtJQUNELFdBQVcsRUFBRSxxRUFBcUU7SUFDbEYsT0FBTztDQUNSLENBQUMsQ0FBQztBQUVILGtEQUFrRDtBQUNsRCxNQUFNLGtCQUFrQixHQUFHLGdCQUFnQixjQUFjLENBQUMsVUFBVSxFQUFFLENBQUM7QUFFdkUsc0RBQXNEO0FBQ3RELElBQUksa0RBQXNCLENBQUMsR0FBRyxFQUFFLHdCQUF3QixFQUFFO0lBQ3hELEdBQUcsRUFBRTtRQUNILE9BQU87UUFDUCxNQUFNLEVBQUUsYUFBYTtLQUN0QjtJQUNELFdBQVcsRUFBRSxnRUFBZ0U7SUFDN0Usa0JBQWtCO0NBQ25CLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYi9jb3JlJztcbmltcG9ydCB7IEJldnlQbGF0Zm9ybUluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvYmV2eS1wbGF0Zm9ybS1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBTZWNvbmRhcnlCdWNrZXRTdGFjayB9IGZyb20gJy4uL2xpYi9zZWNvbmRhcnktYnVja2V0LXN0YWNrJztcblxuLy8gQ0RL44Ki44OX44Oq44Kx44O844K344On44Oz44Gu44Ko44Oz44OI44Oq44O844Od44Kk44Oz44OIXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuY29uc3QgZW52TmFtZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xuY29uc3QgYWNjb3VudCA9IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQ7XG5cbi8vIEFXU+OCouOCq+OCpuODs+ODiElE44GM55Kw5aKD5aSJ5pWw44GL44KJ5Y+W5b6X44Gn44GN44Gq44GE5aC05ZCI44Gv44Ko44Op44O844KS44K544Ot44O844GX44Gm44CBQVdT6KqN6Ki85oOF5aCx44Gu6Kit5a6a44KS5L+D44GZXG5pZiAoIWFjY291bnQpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdDREtfREVGQVVMVF9BQ0NPVU5UIGlzIHJlcXVpcmVkLiBDb25maWd1cmUgQVdTIGNyZWRlbnRpYWxzIGJlZm9yZSBzeW50aC9kZXBsb3kuJyk7XG59XG5cbi8vIOODl+ODqeOCpOODnuODquODquODvOOCuOODp+ODs+OBqOOCu+OCq+ODs+ODgOODquODquODvOOCuOODp+ODs+OCkuWumue+qVxuY29uc3QgcHJpbWFyeVJlZ2lvbiA9ICdhcC1ub3J0aGVhc3QtMSc7XG5jb25zdCBzZWNvbmRhcnlSZWdpb24gPSAndXMtZWFzdC0xJztcblxuLy8g44K744Kr44Oz44OA44Oq44Oq44O844K444On44Oz44Gr44Ki44O844OG44Kj44OV44Kh44Kv44OI55So44GuUzPjg5DjgrHjg4Pjg4jjgpLkvZzmiJDjgZnjgovjgrnjgr/jg4Pjgq/jgpLlhYjjgavjg4fjg5fjg63jgqTjgZfjgabjgIFBUk7jgpLlj5blvpdcbmNvbnN0IHNlY29uZGFyeVN0YWNrID0gbmV3IFNlY29uZGFyeUJ1Y2tldFN0YWNrKGFwcCwgJ0JldnlQbGF0Zm9ybUluZnJhU2Vjb25kYXJ5QnVja2V0U3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQsXG4gICAgcmVnaW9uOiBzZWNvbmRhcnlSZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnU2Vjb25kYXJ5IHJlZ2lvbiBidWNrZXQgc3RhY2sgZm9yIGFydGlmYWN0IGNyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbicsXG4gIGVudk5hbWUsXG59KTtcblxuLy8g44K744Kr44Oz44OA44Oq44OQ44Kx44OD44OI44GuQVJO44KS44OX44Op44Kk44Oe44Oq44K544K/44OD44Kv44Gr5rih44GX44Gm44CB44Kv44Ot44K544Oq44O844K444On44Oz44Os44OX44Oq44Kx44O844K344On44Oz44KS6Kit5a6aXG5jb25zdCBzZWNvbmRhcnlCdWNrZXRBcm4gPSBgYXJuOmF3czpzMzo6OiR7c2Vjb25kYXJ5U3RhY2suYnVja2V0TmFtZX1gO1xuXG4vLyDjg5fjg6njgqTjg57jg6rjg6rjg7zjgrjjg6fjg7PjgavjgqLjg7zjg4bjgqPjg5XjgqHjgq/jg4jnlKjjga5TM+ODkOOCseODg+ODiOOBqEdpdEh1YiBPSURD44Ot44O844Or44KS5L2c5oiQ44GZ44KL44K544K/44OD44KvXG5uZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50LFxuICAgIHJlZ2lvbjogcHJpbWFyeVJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdQcmltYXJ5IHJlZ2lvbiBzdGFjayBmb3IgYXJ0aWZhY3Qgc3RvcmFnZSBhbmQgR2l0SHViIE9JREMgcm9sZScsXG4gIHNlY29uZGFyeUJ1Y2tldEFybixcbn0pO1xuIl19