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

dc exec -T web node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.rmSync('/data/auth.backup.db', { force: true });
const db = new DatabaseSync('/data/auth.db');
db.exec(\"VACUUM INTO '/data/auth.backup.db'\");
db.close();
"
dc exec -T web tar -cf - -C /data auth.backup.db | gzip > "$dest/wcag-auditor-auth-$stamp.tar.gz"
dc exec -T web rm -f /data/auth.backup.db

ls -1t "$dest"/wcag-auditor-2*.tar.gz | tail -n +"$((keep + 1))" | xargs -r rm -f
ls -1t "$dest"/wcag-auditor-auth-*.tar.gz | tail -n +"$((keep + 1))" | xargs -r rm -f
echo "$dest/wcag-auditor-$stamp.tar.gz"
echo "$dest/wcag-auditor-auth-$stamp.tar.gz"
