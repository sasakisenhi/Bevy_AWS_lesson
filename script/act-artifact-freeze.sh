#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--dry-run" ]]; then
  cat <<'EOF'
act workflow_dispatch \
  -W .github/workflows/artifact.yml \
  -j artifact-freeze \
  -e .act/artifact.event.json \
  --var-file .act/infra-ci.vars \
  --env-file .act/infra-ci.env.local \
  --secret-file .act/infra-ci.secrets.local
EOF
  exit 0
fi

if [[ ! -f .act/infra-ci.env.local ]]; then
  echo ".act/infra-ci.env.local is missing. Copy .act/infra-ci.env.example first." >&2
  exit 1
fi

if [[ ! -f .act/infra-ci.secrets.local ]]; then
  echo ".act/infra-ci.secrets.local is missing. Copy .act/infra-ci.secrets.example first." >&2
  exit 1
fi

exec act workflow_dispatch \
  -W .github/workflows/artifact.yml \
  -j artifact-freeze \
  -e .act/artifact.event.json \
  --var-file .act/infra-ci.vars \
  --env-file .act/infra-ci.env.local \
  --secret-file .act/infra-ci.secrets.local \
  "$@"
