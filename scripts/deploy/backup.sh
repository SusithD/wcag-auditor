#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
compose="${COMPOSE_FILE:-$root/deploy/compose.yaml}"
dest="${BACKUP_DIR:-$HOME/wcag-auditor-backups}"
keep="${BACKUP_KEEP:-7}"
stamp="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$dest"
dc() { docker compose -f "$compose" "$@"; }

dc exec -T api python -c "
import sqlite3
src = sqlite3.connect('/data/app.db')
dst = sqlite3.connect('/data/app.backup.db')
src.backup(dst)
dst.close()
src.close()
"
dc exec -T api sh -c 'cd /data && tar -cf - app.backup.db $(ls -d runs uploads 2>/dev/null)' | gzip > "$dest/wcag-auditor-$stamp.tar.gz"
dc exec -T api rm -f /data/app.backup.db

ls -1t "$dest"/wcag-auditor-*.tar.gz | tail -n +"$((keep + 1))" | xargs -r rm -f
echo "$dest/wcag-auditor-$stamp.tar.gz"
