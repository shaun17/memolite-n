#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${MEMOLITE_BASE_URL:-http://127.0.0.1:${MEMOLITE_PORT:-18731}}"

curl --fail --silent "${BASE_URL}/health" | python3 -m json.tool
