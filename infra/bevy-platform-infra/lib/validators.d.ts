export declare function validateExplicitStackAccount(env?: {
    account?: string;
}): string;
export declare function validateCdkDefaultAccount(account?: string): string;
export declare function validateSecondaryBucketArn(secondaryBucketArn: string): void;
export declare function toBucketNameFromArn(bucketArn: string): string;
export declare function validateGitHubOidcContext(githubOwner?: string, githubRepo?: string, githubBranch?: string): void;
