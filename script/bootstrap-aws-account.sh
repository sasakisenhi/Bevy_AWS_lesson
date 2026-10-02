#!/usr/bin/env bash

set -Eeuo pipefail

readonly PRIMARY_REGION="ap-northeast-1"
readonly SECONDARY_REGION="us-east-1"
readonly PRIMARY_STACK="BevyPlatformInfraStack"
readonly SECONDARY_STACK="BevyPlatformInfraSecondaryBucketStack"
readonly BOOTSTRAP_STACK="CDKToolkit"
readonly BOOTSTRAP_QUALIFIER="hnb659fds"
readonly OIDC_HOST="token.actions.githubusercontent.com"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${REPOSITORY_ROOT}/infra/bevy-platform-infra"

PROFILE=""
REPOSITORY_OVERRIDE=""
BRANCH_OVERRIDE=""
ENV_NAME="dev"
DRY_RUN=false
CURRENT_STEP="argument validation"

usage() {
  cat <<'EOF'
Usage:
  ./script/bootstrap-aws-account.sh --profile <aws-profile> [options]

Required:
  --profile <name>   Authenticated AWS CLI profile to use for every AWS/CDK call

Options:
  --repo <owner/repo>  Override the GitHub repository resolved from the current checkout
  --branch <name>      Override the repository default branch
  --env <name>         CDK environment context (default: dev)
  --dry-run            Resolve and display targets without changing AWS, GitHub, or dependencies
  -h, --help           Show this help

Before running this script, authenticate interactively:
  aws login --profile <aws-profile>
  gh auth login
EOF
}

on_error() {
  local exit_code=$?
  local line_number=${BASH_LINENO[0]:-unknown}

  printf '\nERROR: AWS account bootstrap failed during: %s (line %s).\n' "${CURRENT_STEP}" "${line_number}" >&2
  printf 'The script is designed to be safely re-run after the problem is corrected.\n' >&2
  printf 'Check the command output above, the selected AWS profile, and GitHub CLI access, then retry.\n' >&2
  exit "${exit_code}"
}
trap on_error ERR

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  return 1
}

require_command() {
  local command_name=$1
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command is not available: ${command_name}"
}

validate_repository() {
  local repository=$1
  [[ "${repository}" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] ||
    fail "GitHub repository must use owner/repository format: ${repository}"
}

validate_branch() {
  local branch=$1
  [[ "${branch}" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "Invalid GitHub branch: ${branch}"
  [[ "${branch}" != /* && "${branch}" != */ && "${branch}" != *//* ]] ||
    fail "GitHub branch must not begin/end with '/' or contain '//': ${branch}"
  [[ "${branch}" != *'*'* && "${branch}" != *'?'* && "${branch}" != *'['* ]] ||
    fail "GitHub branch must not contain wildcard characters: ${branch}"
}

parse_arguments() {
  while (($# > 0)); do
    case "$1" in
      --profile)
        (($# >= 2)) || fail "--profile requires a value"
        PROFILE=$2
        shift 2
        ;;
      --repo)
        (($# >= 2)) || fail "--repo requires a value"
        REPOSITORY_OVERRIDE=$2
        shift 2
        ;;
      --branch)
        (($# >= 2)) || fail "--branch requires a value"
        BRANCH_OVERRIDE=$2
        shift 2
        ;;
      --env)
        (($# >= 2)) || fail "--env requires a value"
        ENV_NAME=$2
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done

  [[ -n "${PROFILE}" ]] || fail "--profile is required"
  [[ "${PROFILE}" != -* ]] || fail "AWS profile must not begin with '-': ${PROFILE}"
  [[ "${ENV_NAME}" =~ ^(dev|test|stg|prod)$ ]] || fail "--env must be one of: dev, test, stg, prod"
  [[ -z "${REPOSITORY_OVERRIDE}" ]] || validate_repository "${REPOSITORY_OVERRIDE}"
  [[ -z "${BRANCH_OVERRIDE}" ]] || validate_branch "${BRANCH_OVERRIDE}"
}

repository_from_origin() {
  local origin_url repository
  origin_url="$(git -C "${REPOSITORY_ROOT}" remote get-url origin)" || return 1

  case "${origin_url}" in
    https://github.com/*)
      repository=${origin_url#https://github.com/}
      ;;
    git@github.com:*)
      repository=${origin_url#git@github.com:}
      ;;
    ssh://git@github.com/*)
      repository=${origin_url#ssh://git@github.com/}
      ;;
    *)
      fail "Could not resolve a GitHub repository from origin: ${origin_url}"
      return 1
      ;;
  esac

  repository=${repository%.git}
  repository=${repository%/}
  validate_repository "${repository}" || return 1
  printf '%s\n' "${repository}"
}

resolve_repository() {
  local candidate resolved

  if [[ -n "${REPOSITORY_OVERRIDE}" ]]; then
    candidate=${REPOSITORY_OVERRIDE}
  elif candidate="$(cd "${REPOSITORY_ROOT}" && gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)" && [[ -n "${candidate}" ]]; then
    :
  else
    candidate="$(repository_from_origin)" || return 1
  fi

  resolved="$(gh repo view "${candidate}" --json nameWithOwner --jq '.nameWithOwner')" || return 1
  validate_repository "${resolved}" || return 1
  printf '%s\n' "${resolved}"
}

resolve_branch() {
  local repository=$1 branch

  if [[ -n "${BRANCH_OVERRIDE}" ]]; then
    branch=${BRANCH_OVERRIDE}
  else
    branch="$(gh repo view "${repository}" --json defaultBranchRef --jq '.defaultBranchRef.name')" || return 1
  fi

  if [[ -z "${branch}" ]]; then
    fail "Could not resolve the default branch for ${repository}"
    return 1
  fi
  validate_branch "${branch}" || return 1
  printf '%s\n' "${branch}"
}

get_aws_identity() {
  aws sts get-caller-identity \
    --profile "${PROFILE}" \
    --query '[Account,Arn]' \
    --output text
}

assert_account_unchanged() {
  local identity current_account current_arn extra
  identity="$(get_aws_identity)"
  read -r current_account current_arn extra <<<"${identity}"
  [[ "${current_account}" == "${ACCOUNT_ID}" ]] ||
    fail "AWS account changed during execution: expected ${ACCOUNT_ID}, got ${current_account}"
}

read_stack_status() {
  local stack_name=$1 region=$2
  aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${region}" \
    --stack-name "${stack_name}" \
    --query 'Stacks[0].StackStatus' \
    --output text
}

verify_complete_stack() {
  local stack_name=$1 region=$2 status
  status="$(read_stack_status "${stack_name}" "${region}")"
  case "${status}" in
    CREATE_COMPLETE|UPDATE_COMPLETE|IMPORT_COMPLETE)
      ;;
    *)
      fail "Stack ${stack_name} in ${region} is not in a successful state: ${status}"
      ;;
  esac
}

verify_bootstrap_region() {
  local region=$1 bootstrap_version expected_bucket
  expected_bucket="cdk-${BOOTSTRAP_QUALIFIER}-assets-${ACCOUNT_ID}-${region}"

  verify_complete_stack "${BOOTSTRAP_STACK}" "${region}"
  bootstrap_version="$(aws ssm get-parameter \
    --profile "${PROFILE}" \
    --region "${region}" \
    --name "/cdk-bootstrap/${BOOTSTRAP_QUALIFIER}/version" \
    --query 'Parameter.Value' \
    --output text)"
  [[ "${bootstrap_version}" =~ ^[0-9]+$ ]] ||
    fail "Invalid CDK bootstrap version in ${region}: ${bootstrap_version}"
  aws s3api head-bucket \
    --profile "${PROFILE}" \
    --region "${region}" \
    --bucket "${expected_bucket}" >/dev/null
}

verify_github_variable() {
  local repository=$1 name=$2 expected=$3 actual
  actual="$(gh variable get "${name}" --repo "${repository}")"
  [[ "${actual}" == "${expected}" ]] || fail "GitHub variable ${name} does not match the expected value"
}

verify_github_secret_exists() {
  local repository=$1 secret_names
  secret_names="$(gh secret list --repo "${repository}" --json name --jq '.[].name')"
  [[ $'\n'"${secret_names}"$'\n' == *$'\nAWS_ROLE_ARN\n'* ]] ||
    fail "GitHub repository secret AWS_ROLE_ARN was not found"
}

redact_iam_role_arns() {
  local line matched_arn
  while IFS= read -r line; do
    while [[ "${line}" =~ arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+ ]]; do
      matched_arn=${BASH_REMATCH[0]}
      line=${line//"${matched_arn}"/[REDACTED_IAM_ROLE_ARN]}
    done
    printf '%s\n' "${line}"
  done
}

parse_arguments "$@"

export AWS_PAGER=""
export AWS_PROFILE="${PROFILE}"
export AWS_SDK_LOAD_CONFIG=1

CURRENT_STEP="preflight"
printf '[1/8] Preflight\n'
for required_command in aws git gh node npm; do
  require_command "${required_command}"
done
printf '✓ Required commands\n'
printf 'AWS CLI: %s\n' "$(aws --version 2>&1)"
printf 'Node.js: %s\n' "$(node --version)"
printf 'npm: %s\n' "$(npm --version)"

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  printf '\nGitHub CLI authentication is not available.\n\nRun:\n\n  gh auth login\n\nand retry.\n' >&2
  exit 1
fi
printf '✓ GitHub CLI authentication\n'

if ! AWS_IDENTITY="$(get_aws_identity)"; then
  printf '\nAWS authentication is not available.\n\nRun:\n\n  aws login --profile %s\n\nand retry.\n' "${PROFILE}" >&2
  exit 1
fi

read -r ACCOUNT_ID CALLER_ARN IDENTITY_EXTRA <<<"${AWS_IDENTITY}"
[[ "${ACCOUNT_ID}" =~ ^[0-9]{12}$ ]] || fail "AWS STS returned an invalid account ID: ${ACCOUNT_ID:-<empty>}"
[[ -n "${CALLER_ARN}" ]] || fail "AWS STS did not return a caller ARN"
export CDK_DEFAULT_ACCOUNT="${ACCOUNT_ID}"

printf '✓ AWS authentication\n\n'
printf 'AWS profile: %s\n' "${PROFILE}"
printf 'AWS account: %s\n' "${ACCOUNT_ID}"
printf 'AWS caller: %s\n\n' "${CALLER_ARN}"

CURRENT_STEP="repository resolution"
printf '[2/8] Resolve repository\n'
GITHUB_REPOSITORY="$(resolve_repository)"
GITHUB_BRANCH="$(resolve_branch "${GITHUB_REPOSITORY}")"
GITHUB_OWNER=${GITHUB_REPOSITORY%%/*}
GITHUB_REPO=${GITHUB_REPOSITORY#*/}
printf '✓ %s\n' "${GITHUB_REPOSITORY}"
printf '✓ branch: %s\n\n' "${GITHUB_BRANCH}"

if [[ "${DRY_RUN}" == true ]]; then
  printf '[dry-run] No changes will be made.\n\n'
  printf 'AWS account: %s\n' "${ACCOUNT_ID}"
  printf 'AWS regions: %s, %s\n' "${PRIMARY_REGION}" "${SECONDARY_REGION}"
  printf 'GitHub repository: %s\n' "${GITHUB_REPOSITORY}"
  printf 'GitHub branch: %s\n' "${GITHUB_BRANCH}"
  printf 'CDK environment: %s\n\n' "${ENV_NAME}"
  printf 'Planned operations:\n'
  printf '  1. npm ci in %s\n' "${INFRA_DIR}"
  printf '  2. CDK bootstrap in both AWS regions\n'
  printf '  3. Deploy %s and %s\n' "${SECONDARY_STACK}" "${PRIMARY_STACK}"
  printf '  4. Set GitHub variables CDK_ENV, CDK_DEFAULT_ACCOUNT, AWS_REGION\n'
  printf '  5. Set GitHub secret AWS_ROLE_ARN from the CloudFormation output\n'
  printf '  6. Verify AWS and GitHub configuration\n'
  exit 0
fi

CURRENT_STEP="dependency installation"
printf '[3/8] Install dependencies\n'
(
  cd "${INFRA_DIR}"
  npm ci
)
printf '✓ npm ci\n\n'

CURRENT_STEP="CDK bootstrap"
printf '[4/8] Bootstrap AWS environments\n'
assert_account_unchanged
(
  cd "${INFRA_DIR}"
  npm run cdk -- bootstrap \
    "aws://${ACCOUNT_ID}/${PRIMARY_REGION}" \
    "aws://${ACCOUNT_ID}/${SECONDARY_REGION}" \
    --profile "${PROFILE}"
)
printf '✓ %s\n' "${PRIMARY_REGION}"
printf '✓ %s\n\n' "${SECONDARY_REGION}"

CURRENT_STEP="CDK deployment"
printf '[5/8] Deploy infrastructure\n'
assert_account_unchanged
(
  cd "${INFRA_DIR}"
  npm run cdk -- deploy \
    "${SECONDARY_STACK}" \
    "${PRIMARY_STACK}" \
    --profile "${PROFILE}" \
    --require-approval never \
    -c env="${ENV_NAME}" \
    -c githubOwner="${GITHUB_OWNER}" \
    -c githubRepo="${GITHUB_REPO}" \
    -c githubBranch="${GITHUB_BRANCH}"
) 2>&1 | redact_iam_role_arns
printf '✓ %s\n' "${SECONDARY_STACK}"
printf '✓ %s\n\n' "${PRIMARY_STACK}"

CURRENT_STEP="CloudFormation output resolution"
ROLE_ARN="$(aws cloudformation describe-stacks \
  --profile "${PROFILE}" \
  --region "${PRIMARY_REGION}" \
  --stack-name "${PRIMARY_STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='GithubActionsRoleArn'].OutputValue | [0]" \
  --output text)"
[[ -n "${ROLE_ARN}" && "${ROLE_ARN}" != "None" ]] || fail "CloudFormation output GithubActionsRoleArn was not found"
[[ "${ROLE_ARN}" =~ ^arn:aws:iam::${ACCOUNT_ID}:role/[A-Za-z0-9+=,.@_/-]+$ ]] ||
  fail "GithubActionsRoleArn is invalid or belongs to a different AWS account"

CURRENT_STEP="GitHub configuration"
printf '[6/8] Configure GitHub\n'
gh variable set CDK_ENV --repo "${GITHUB_REPOSITORY}" --body "${ENV_NAME}"
gh variable set CDK_DEFAULT_ACCOUNT --repo "${GITHUB_REPOSITORY}" --body "${ACCOUNT_ID}"
gh variable set AWS_REGION --repo "${GITHUB_REPOSITORY}" --body "${PRIMARY_REGION}"
printf '%s' "${ROLE_ARN}" | gh secret set AWS_ROLE_ARN --repo "${GITHUB_REPOSITORY}"
printf '✓ CDK_ENV\n'
printf '✓ CDK_DEFAULT_ACCOUNT\n'
printf '✓ AWS_REGION\n'
printf '✓ AWS_ROLE_ARN\n\n'

CURRENT_STEP="post-deploy verification"
printf '[7/8] Verify AWS resources and GitHub configuration\n'
assert_account_unchanged
verify_bootstrap_region "${PRIMARY_REGION}"
verify_bootstrap_region "${SECONDARY_REGION}"
printf '✓ CDK bootstrap in both regions\n'

verify_complete_stack "${SECONDARY_STACK}" "${SECONDARY_REGION}"
verify_complete_stack "${PRIMARY_STACK}" "${PRIMARY_REGION}"
printf '✓ CloudFormation application stacks\n'

OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"
aws iam get-open-id-connect-provider \
  --profile "${PROFILE}" \
  --open-id-connect-provider-arn "${OIDC_PROVIDER_ARN}" >/dev/null
printf '✓ GitHub OIDC Provider\n'

ROLE_NAME=${ROLE_ARN##*/}
VERIFIED_ROLE_ARN="$(aws iam get-role \
  --profile "${PROFILE}" \
  --role-name "${ROLE_NAME}" \
  --query 'Role.Arn' \
  --output text)"
[[ "${VERIFIED_ROLE_ARN}" == "${ROLE_ARN}" ]] || fail "Deployed GitHub Actions role does not match the CloudFormation output"
printf '✓ GitHub Actions IAM Role\n'

verify_github_variable "${GITHUB_REPOSITORY}" CDK_ENV "${ENV_NAME}"
verify_github_variable "${GITHUB_REPOSITORY}" CDK_DEFAULT_ACCOUNT "${ACCOUNT_ID}"
verify_github_variable "${GITHUB_REPOSITORY}" AWS_REGION "${PRIMARY_REGION}"
verify_github_secret_exists "${GITHUB_REPOSITORY}"
printf '✓ GitHub variables and AWS_ROLE_ARN secret\n\n'

CURRENT_STEP="completion"
printf '[8/8] Complete\n\n'
printf 'AWS account bootstrap completed successfully.\n'
printf 'GitHub Actions can now authenticate to AWS account %s via OIDC.\n' "${ACCOUNT_ID}"
