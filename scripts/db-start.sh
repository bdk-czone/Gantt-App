#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v colima >/dev/null 2>&1 && (! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1); then
  echo "Colima detected but Docker is not responding yet. Starting Colima..."
  colima start
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  exec docker compose up -d
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose up -d
fi

echo "No Docker Compose command is available."
echo "Install Docker Desktop, OrbStack, or Colima + docker/docker-compose first."
exit 1
