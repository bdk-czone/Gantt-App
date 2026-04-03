#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  exec docker compose down
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose down
fi

echo "No Docker Compose command is available."
exit 1
