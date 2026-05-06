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
const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required. Configure AWS credentials before synth/deploy.');
}
const primaryRegion = 'ap-northeast-1';
const secondaryRegion = 'us-east-1';
const secondaryBucketName = `bevy-artifacts-${envName}-secondary-${account}`;
const secondaryBucketArn = `arn:aws:s3:::${secondaryBucketName}`;
new secondary_bucket_stack_1.SecondaryBucketStack(app, 'BevyPlatformInfraSecondaryBucketStack', {
    env: {
        account,
        region: secondaryRegion,
    },
    description: 'Secondary region bucket stack for artifact cross-region replication',
    envName,
});
new bevy_platform_infra_stack_1.BevyPlatformInfraStack(app, 'BevyPlatformInfraStack', {
    env: {
        account,
        region: primaryRegion,
    },
    description: 'Primary region stack for artifact storage and GitHub OIDC role',
    secondaryBucketArn,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmV2eS1wbGF0Zm9ybS1pbmZyYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJldnktcGxhdGZvcm0taW5mcmEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0Esc0RBQXdDO0FBQ3hDLGdGQUEwRTtBQUMxRSwwRUFBcUU7QUFFckUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDMUIsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO0FBQ3ZELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7QUFFaEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpRkFBaUYsQ0FBQyxDQUFDO0FBQ3JHLENBQUM7QUFFRCxNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQztBQUN2QyxNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUM7QUFDcEMsTUFBTSxtQkFBbUIsR0FBRyxrQkFBa0IsT0FBTyxjQUFjLE9BQU8sRUFBRSxDQUFDO0FBQzdFLE1BQU0sa0JBQWtCLEdBQUcsZ0JBQWdCLG1CQUFtQixFQUFFLENBQUM7QUFFakUsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsdUNBQXVDLEVBQUU7SUFDckUsR0FBRyxFQUFFO1FBQ0gsT0FBTztRQUNQLE1BQU0sRUFBRSxlQUFlO0tBQ3hCO0lBQ0QsV0FBVyxFQUFFLHFFQUFxRTtJQUNsRixPQUFPO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsSUFBSSxrREFBc0IsQ0FBQyxHQUFHLEVBQUUsd0JBQXdCLEVBQUU7SUFDeEQsR0FBRyxFQUFFO1FBQ0gsT0FBTztRQUNQLE1BQU0sRUFBRSxhQUFhO0tBQ3RCO0lBQ0QsV0FBVyxFQUFFLGdFQUFnRTtJQUM3RSxrQkFBa0I7Q0FDbkIsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliL2NvcmUnO1xuaW1wb3J0IHsgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9iZXZ5LXBsYXRmb3JtLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFNlY29uZGFyeUJ1Y2tldFN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY29uZGFyeS1idWNrZXQtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuY29uc3QgZW52TmFtZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xuY29uc3QgYWNjb3VudCA9IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQ7XG5cbmlmICghYWNjb3VudCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ0NES19ERUZBVUxUX0FDQ09VTlQgaXMgcmVxdWlyZWQuIENvbmZpZ3VyZSBBV1MgY3JlZGVudGlhbHMgYmVmb3JlIHN5bnRoL2RlcGxveS4nKTtcbn1cblxuY29uc3QgcHJpbWFyeVJlZ2lvbiA9ICdhcC1ub3J0aGVhc3QtMSc7XG5jb25zdCBzZWNvbmRhcnlSZWdpb24gPSAndXMtZWFzdC0xJztcbmNvbnN0IHNlY29uZGFyeUJ1Y2tldE5hbWUgPSBgYmV2eS1hcnRpZmFjdHMtJHtlbnZOYW1lfS1zZWNvbmRhcnktJHthY2NvdW50fWA7XG5jb25zdCBzZWNvbmRhcnlCdWNrZXRBcm4gPSBgYXJuOmF3czpzMzo6OiR7c2Vjb25kYXJ5QnVja2V0TmFtZX1gO1xuXG5uZXcgU2Vjb25kYXJ5QnVja2V0U3RhY2soYXBwLCAnQmV2eVBsYXRmb3JtSW5mcmFTZWNvbmRhcnlCdWNrZXRTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudCxcbiAgICByZWdpb246IHNlY29uZGFyeVJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdTZWNvbmRhcnkgcmVnaW9uIGJ1Y2tldCBzdGFjayBmb3IgYXJ0aWZhY3QgY3Jvc3MtcmVnaW9uIHJlcGxpY2F0aW9uJyxcbiAgZW52TmFtZSxcbn0pO1xuXG5uZXcgQmV2eVBsYXRmb3JtSW5mcmFTdGFjayhhcHAsICdCZXZ5UGxhdGZvcm1JbmZyYVN0YWNrJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50LFxuICAgIHJlZ2lvbjogcHJpbWFyeVJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdQcmltYXJ5IHJlZ2lvbiBzdGFjayBmb3IgYXJ0aWZhY3Qgc3RvcmFnZSBhbmQgR2l0SHViIE9JREMgcm9sZScsXG4gIHNlY29uZGFyeUJ1Y2tldEFybixcbn0pO1xuIl19