#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_UNDER_TEST="${SCRIPT_DIR}/bootstrap-aws-account.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "${TEST_TMP}"' EXIT

PASS_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'ok %d - %s\n' "${PASS_COUNT}" "$1"
}

fail_test() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local text=$1 expected=$2 description=$3
  [[ "${text}" == *"${expected}"* ]] || fail_test "${description}: expected output to contain '${expected}'"
}

make_common_mocks() {
  local mock_dir=$1 account_id=$2
  mkdir -p "${mock_dir}"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [[ "${1:-}" == "--version" ]]; then echo "aws-cli/2.99.0"; exit 0; fi' \
    'if [[ "${1:-} ${2:-}" == "sts get-caller-identity" ]]; then' \
    "  printf '%s\\t%s\\n' '${account_id}' 'arn:aws:iam::123456789012:user/bootstrap-test'" \
    '  exit 0' \
    'fi' \
    'echo "unexpected aws call: $*" >&2' \
    'exit 90' >"${mock_dir}/aws"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [[ "${1:-} ${2:-}" == "auth status" ]]; then exit 0; fi' \
    'if [[ "${1:-} ${2:-}" == "repo view" ]]; then' \
    '  for arg in "$@"; do' \
    '    if [[ "$arg" == "nameWithOwner" ]]; then echo "sasakisenhi/Bevy_AWS_lesson"; exit 0; fi' \
    '    if [[ "$arg" == "defaultBranchRef" ]]; then echo "master"; exit 0; fi' \
    '  done' \
    'fi' \
    'echo "unexpected gh call: $*" >&2' \
    'exit 91' >"${mock_dir}/gh"

  printf '%s\n' '#!/usr/bin/env bash' 'echo "git version 2.99.0"' >"${mock_dir}/git"
  printf '%s\n' '#!/usr/bin/env bash' 'echo "v22.0.0"' >"${mock_dir}/node"
  printf '%s\n' '#!/usr/bin/env bash' 'echo "10.0.0"' >"${mock_dir}/npm"
  chmod +x "${mock_dir}/aws" "${mock_dir}/gh" "${mock_dir}/git" "${mock_dir}/node" "${mock_dir}/npm"
}

run_script() {
  local mock_dir=$1
  shift
  PATH="${mock_dir}:/usr/bin:/bin" bash "${SCRIPT_UNDER_TEST}" "$@" 2>&1
}

bash -n "${SCRIPT_UNDER_TEST}"
pass "bash syntax"

HELP_OUTPUT="$(bash "${SCRIPT_UNDER_TEST}" --help)"
assert_contains "${HELP_OUTPUT}" "--profile <name>" "help"
assert_contains "${HELP_OUTPUT}" "--dry-run" "help"
pass "help output"

if bash "${SCRIPT_UNDER_TEST}" --dry-run >"${TEST_TMP}/missing-profile.log" 2>&1; then
  fail_test "missing --profile should fail"
fi
assert_contains "$(<"${TEST_TMP}/missing-profile.log")" "--profile is required" "missing profile validation"
pass "required profile validation"

if bash "${SCRIPT_UNDER_TEST}" --profile bevy --repo invalid >"${TEST_TMP}/invalid-repo.log" 2>&1; then
  fail_test "invalid --repo should fail"
fi
assert_contains "$(<"${TEST_TMP}/invalid-repo.log")" "owner/repository format" "repository validation"
pass "repository argument validation"

UNAUTH_BIN="${TEST_TMP}/unauth-bin"
make_common_mocks "${UNAUTH_BIN}" "123456789012"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" == "--version" ]]; then echo "aws-cli/2.99.0"; exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "sts get-caller-identity" ]]; then exit 1; fi' \
  'exit 90' >"${UNAUTH_BIN}/aws"
chmod +x "${UNAUTH_BIN}/aws"
if run_script "${UNAUTH_BIN}" --profile broken --dry-run >"${TEST_TMP}/unauth.log"; then
  fail_test "unauthenticated AWS profile should fail"
fi
UNAUTH_OUTPUT="$(<"${TEST_TMP}/unauth.log")"
assert_contains "${UNAUTH_OUTPUT}" "AWS authentication is not available" "AWS authentication failure"
assert_contains "${UNAUTH_OUTPUT}" "aws login --profile broken" "AWS authentication recovery hint"
pass "unauthenticated AWS profile fail-fast"

INVALID_ACCOUNT_BIN="${TEST_TMP}/invalid-account-bin"
make_common_mocks "${INVALID_ACCOUNT_BIN}" "not-an-account"
if run_script "${INVALID_ACCOUNT_BIN}" --profile bevy --dry-run >"${TEST_TMP}/invalid-account.log"; then
  fail_test "invalid AWS account ID should fail"
fi
assert_contains "$(<"${TEST_TMP}/invalid-account.log")" "invalid account ID" "AWS account validation"
pass "AWS account ID validation"

DRY_RUN_BIN="${TEST_TMP}/dry-run-bin"
make_common_mocks "${DRY_RUN_BIN}" "123456789012"
DRY_RUN_OUTPUT="$(run_script "${DRY_RUN_BIN}" --profile bevy --dry-run)"
assert_contains "${DRY_RUN_OUTPUT}" "AWS account: 123456789012" "dry-run account"
assert_contains "${DRY_RUN_OUTPUT}" "✓ sasakisenhi/Bevy_AWS_lesson" "repository resolution"
assert_contains "${DRY_RUN_OUTPUT}" "✓ branch: master" "default branch resolution"
assert_contains "${DRY_RUN_OUTPUT}" "No changes will be made" "dry-run safety"
assert_contains "${DRY_RUN_OUTPUT}" "CDK bootstrap in both AWS regions" "dry-run plan"
pass "repository/default-branch resolution and dry-run"

ORIGIN_FALLBACK_BIN="${TEST_TMP}/origin-fallback-bin"
make_common_mocks "${ORIGIN_FALLBACK_BIN}" "123456789012"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" == "--version" ]]; then echo "git version 2.99.0"; exit 0; fi' \
  'if [[ "$*" == *"remote get-url origin"* ]]; then echo "git@github.com:sasakisenhi/Bevy_AWS_lesson.git"; exit 0; fi' \
  'exit 95' >"${ORIGIN_FALLBACK_BIN}/git"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-} ${2:-}" == "auth status" ]]; then exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "repo view" && "${3:-}" == "--json" ]]; then exit 1; fi' \
  'if [[ "${1:-} ${2:-} ${3:-}" == "repo view sasakisenhi/Bevy_AWS_lesson" ]]; then' \
  '  for arg in "$@"; do' \
  '    if [[ "$arg" == "nameWithOwner" ]]; then echo "sasakisenhi/Bevy_AWS_lesson"; exit 0; fi' \
  '    if [[ "$arg" == "defaultBranchRef" ]]; then echo "master"; exit 0; fi' \
  '  done' \
  'fi' \
  'exit 91' >"${ORIGIN_FALLBACK_BIN}/gh"
chmod +x "${ORIGIN_FALLBACK_BIN}/git" "${ORIGIN_FALLBACK_BIN}/gh"
ORIGIN_OUTPUT="$(run_script "${ORIGIN_FALLBACK_BIN}" --profile bevy --dry-run)"
assert_contains "${ORIGIN_OUTPUT}" "✓ sasakisenhi/Bevy_AWS_lesson" "origin repository fallback"
pass "git origin repository fallback"

FULL_RUN_BIN="${TEST_TMP}/full-run-bin"
FULL_RUN_LOG="${TEST_TMP}/full-run-calls.log"
FULL_ROLE_ARN="arn:aws:iam::123456789012:role/bootstrap-test-role"
make_common_mocks "${FULL_RUN_BIN}" "123456789012"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "aws %s\\n" "$*" >>"${MOCK_CALL_LOG}"' \
  'if [[ "${1:-}" == "--version" ]]; then echo "aws-cli/2.99.0"; exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "sts get-caller-identity" ]]; then printf "123456789012\\tarn:aws:iam::123456789012:user/bootstrap-test\\n"; exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "cloudformation describe-stacks" ]]; then' \
  '  if [[ "$*" == *"GithubActionsRoleArn"* ]]; then echo "arn:aws:iam::123456789012:role/bootstrap-test-role"; else echo "CREATE_COMPLETE"; fi' \
  '  exit 0' \
  'fi' \
  'if [[ "${1:-} ${2:-}" == "ssm get-parameter" ]]; then echo "25"; exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "s3api head-bucket" ]]; then exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "iam get-open-id-connect-provider" ]]; then exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "iam get-role" ]]; then echo "arn:aws:iam::123456789012:role/bootstrap-test-role"; exit 0; fi' \
  'echo "unexpected aws call: $*" >&2' \
  'exit 90' >"${FULL_RUN_BIN}/aws"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "gh %s\\n" "$*" >>"${MOCK_CALL_LOG}"' \
  'if [[ "${1:-} ${2:-}" == "auth status" ]]; then exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "repo view" ]]; then' \
  '  for arg in "$@"; do' \
  '    if [[ "$arg" == "nameWithOwner" ]]; then echo "sasakisenhi/Bevy_AWS_lesson"; exit 0; fi' \
  '    if [[ "$arg" == "defaultBranchRef" ]]; then echo "master"; exit 0; fi' \
  '  done' \
  'fi' \
  'if [[ "${1:-} ${2:-}" == "variable set" ]]; then exit 0; fi' \
  'if [[ "${1:-} ${2:-}" == "variable get" ]]; then' \
  '  case "${3:-}" in CDK_ENV) echo dev ;; CDK_DEFAULT_ACCOUNT) echo 123456789012 ;; AWS_REGION) echo ap-northeast-1 ;; *) exit 92 ;; esac' \
  '  exit 0' \
  'fi' \
  'if [[ "${1:-} ${2:-} ${3:-}" == "secret set AWS_ROLE_ARN" ]]; then' \
  '  IFS= read -r secret_value || true' \
  '  [[ "$secret_value" == "arn:aws:iam::123456789012:role/bootstrap-test-role" ]] || exit 93' \
  '  echo "secret-stdin-ok" >>"${MOCK_CALL_LOG}"' \
  '  exit 0' \
  'fi' \
  'if [[ "${1:-} ${2:-}" == "secret list" ]]; then echo AWS_ROLE_ARN; exit 0; fi' \
  'echo "unexpected gh call: $*" >&2' \
  'exit 91' >"${FULL_RUN_BIN}/gh"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "npm %s\\n" "$*" >>"${MOCK_CALL_LOG}"' \
  'if [[ "${1:-}" == "--version" ]]; then echo "10.0.0"; exit 0; fi' \
  'if [[ "${1:-}" == "ci" ]]; then exit 0; fi' \
  'if [[ "$*" == *" cdk -- deploy "* || "$*" == "run cdk -- deploy"* ]]; then' \
  '  echo "BevyPlatformInfraStack.GithubActionsRoleArn = arn:aws:iam::123456789012:role/bootstrap-test-role"' \
  '  exit 0' \
  'fi' \
  'if [[ "$*" == *" cdk -- bootstrap "* || "$*" == "run cdk -- bootstrap"* ]]; then exit 0; fi' \
  'echo "unexpected npm call: $*" >&2' \
  'exit 94' >"${FULL_RUN_BIN}/npm"

chmod +x "${FULL_RUN_BIN}/aws" "${FULL_RUN_BIN}/gh" "${FULL_RUN_BIN}/npm"
FULL_RUN_OUTPUT="$(MOCK_CALL_LOG="${FULL_RUN_LOG}" run_script "${FULL_RUN_BIN}" --profile bevy)"
assert_contains "${FULL_RUN_OUTPUT}" "AWS account bootstrap completed successfully" "full bootstrap flow"
assert_contains "${FULL_RUN_OUTPUT}" "[REDACTED_IAM_ROLE_ARN]" "deploy output redaction"
[[ "${FULL_RUN_OUTPUT}" != *"${FULL_ROLE_ARN}"* ]] || fail_test "AWS_ROLE_ARN must not appear in bootstrap output"
FULL_CALLS="$(<"${FULL_RUN_LOG}")"
assert_contains "${FULL_CALLS}" "bootstrap aws://123456789012/ap-northeast-1 aws://123456789012/us-east-1 --profile bevy" "two-region bootstrap"
assert_contains "${FULL_CALLS}" "deploy BevyPlatformInfraSecondaryBucketStack BevyPlatformInfraStack --profile bevy" "ordered stack deployment"
assert_contains "${FULL_CALLS}" "secret-stdin-ok" "secret standard input"
assert_contains "${FULL_CALLS}" "get-open-id-connect-provider --profile bevy" "OIDC verification profile"
while IFS= read -r call; do
  if [[ "${call}" == "aws --version" || "${call}" != aws\ * ]]; then
    continue
  fi
  [[ "${call}" == *"--profile bevy"* ]] || fail_test "AWS API call did not explicitly use --profile bevy: ${call}"
done <<<"${FULL_CALLS}"
pass "full mocked bootstrap, configuration, and verification flow"

printf '1..%d\n' "${PASS_COUNT}"
