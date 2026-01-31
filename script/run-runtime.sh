#!/usr/bin/env bash
set -euo pipefail

# 1) .env 読み込み（あれば）
if [[ -f ./.env ]]; then
  set -a
  . ./.env
  set +a
else
  echo ".env not found; proceeding with defaults..."
fi

# 2) 未設定値の補完
GIT_SHA="${RUNTIME_GIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo '')}"
export RUNTIME_GIT_SHA="${RUNTIME_GIT_SHA:-$GIT_SHA}"
export CORE_GIT_SHA="${CORE_GIT_SHA:-$GIT_SHA}"
export LOGIC_GIT_SHA="${LOGIC_GIT_SHA:-$GIT_SHA}"
export GITHUB_RUN_ID="${GITHUB_RUN_ID:-local-$(date +%Y%m%d%H%M%S)}"

echo "Provenance:"
echo "  CORE_GIT_SHA     = $CORE_GIT_SHA"
echo "  LOGIC_GIT_SHA    = $LOGIC_GIT_SHA"
echo "  RUNTIME_GIT_SHA  = $RUNTIME_GIT_SHA"
echo "  GITHUB_RUN_ID    = $GITHUB_RUN_ID"

# 3) 実行
cargo run -p game_runtime