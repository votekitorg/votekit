#!/usr/bin/env bash
set -Eeuo pipefail

DB_PATH="${DATABASE_PATH:-/var/lib/votekit/plebiscite.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/votekit}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINATION="$BACKUP_DIR/plebiscite-$TIMESTAMP.db"

install -d -m 0700 "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$DESTINATION'"

if [[ "$(sqlite3 "$DESTINATION" 'PRAGMA quick_check;')" != "ok" ]]; then
  echo "Backup integrity check failed" >&2
  exit 1
fi

chmod 0600 "$DESTINATION"
find "$BACKUP_DIR" -type f -name 'plebiscite-*.db' -mtime +30 -delete
printf 'Backup completed: %s\n' "$DESTINATION"
