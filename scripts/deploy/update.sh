#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
compose="${COMPOSE_FILE:-$root/deploy/compose.yaml}"

git -C "$root" pull --ff-only
docker compose -f "$compose" build
docker compose -f "$compose" up -d
docker image prune -f
docker compose -f "$compose" ps
