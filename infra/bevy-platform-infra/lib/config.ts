// 設定値をオブジェクトにまとめる（マジックナンバーの排除）
export const STORAGE_CONFIG = {
  RETENTION_DAYS: 30,
  HISTORY_RETENTION_DAYS: 7,
  BUCKET_PREFIX: 'bevy-artifacts',
  LOG_BUCKET_PREFIX: 'bevy-artifacts-logs',
} as const;

// GitHub OIDCの設定も定数オブジェクトにまとめる
export const GITHUB_OIDC_CONFIG = {
  PROVIDER_URL: 'https://token.actions.githubusercontent.com',
  CLIENT_ID: 'sts.amazonaws.com',
  THUMBPRINT: '6938fd4d98bab03faadb97b34396831e3780a188',
  DEFAULT_BRANCHES: ['main', 'master'],
  PLACEHOLDER_OWNER: '<github-owner>',
  PLACEHOLDER_REPO: '<github-repo>',
} as const;

export const ACCOUNT_ID_REGEX = /^\d{12}$/;
export const ENV_NAME_REGEX = /^(dev|test|stg|prod)$/;
export const GITHUB_OWNER_REGEX = /^[A-Za-z0-9-]+$/;
export const GITHUB_REPO_REGEX = /^[A-Za-z0-9._-]+$/;
export const GITHUB_BRANCH_REGEX = /^(?!\/)(?!.*\/\/)(?!.*\/$)[A-Za-z0-9._/-]+$/;
export const GITHUB_BRANCH_WILDCARD_REGEX = /[?*\[]/;
export const S3_BUCKET_ARN_REGEX = /^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
