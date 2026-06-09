#!/usr/bin/env bash
set -euo pipefail

exec act -W .github/workflows/app-ci-job.yml -j app-ci "$@"
