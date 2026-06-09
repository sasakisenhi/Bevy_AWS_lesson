#!/usr/bin/env bash
set -euo pipefail

exec act workflow_dispatch \
  -W .github/workflows/infra-ci.yml \
  -j infra-test \
  -e .act/infra-ci-deploy.event.json \
  --var-file .act/infra-ci.vars \
  "$@"
