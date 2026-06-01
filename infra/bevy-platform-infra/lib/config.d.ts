export declare const STORAGE_CONFIG: {
    readonly RETENTION_DAYS: 30;
    readonly HISTORY_RETENTION_DAYS: 7;
    readonly BUCKET_PREFIX: "bevy-artifacts";
    readonly LOG_BUCKET_PREFIX: "bevy-artifacts-logs";
};
export declare const GITHUB_OIDC_CONFIG: {
    readonly PROVIDER_URL: "https://token.actions.githubusercontent.com";
    readonly CLIENT_ID: "sts.amazonaws.com";
    readonly THUMBPRINT: "6938fd4d98bab03faadb97b34396831e3780a188";
    readonly DEFAULT_BRANCHES: readonly ["main", "master"];
    readonly PLACEHOLDER_OWNER: "<github-owner>";
    readonly PLACEHOLDER_REPO: "<github-repo>";
};
export declare const ACCOUNT_ID_REGEX: RegExp;
export declare const ENV_NAME_REGEX: RegExp;
export declare const GITHUB_OWNER_REGEX: RegExp;
export declare const GITHUB_REPO_REGEX: RegExp;
export declare const GITHUB_BRANCH_REGEX: RegExp;
export declare const GITHUB_BRANCH_WILDCARD_REGEX: RegExp;
export declare const S3_BUCKET_ARN_REGEX: RegExp;
