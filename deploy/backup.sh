#!/usr/bin/env bash
# Daily backup of the prod database. The systemd timer personal-crm-backup.timer
# runs it every day at 03:00 Moscow time, as the user deploy; what it prints goes to
# the server journal: journalctl -u personal-crm-backup
# By hand: sudo systemctl start personal-crm-backup.service
#
# The backup goes to backups/daily_<UTC time>_<app version>.dump; the newest 7 daily
# backups are kept (the backups before deploys are counted apart, deploy.sh keeps
# their newest 7). restore.sh loads one back, copy-prod-db.sh copies the newest one
# to the test stand.
# The database is only read: if it is not running, the backup fails and nothing is
# started. If a deploy or a restore is running, waits up to 15 minutes for it.
#
# Uses only what common.sh of older versions also has: after a rollback of prod the
# server has the common.sh of that older version, and this script stays.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
use_env prod

readonly KEEP_DAILY_BACKUPS=7

cd "$APP_DIR"
check_user
check_env_file

current_tag="$(current_tag_of prod)"
if [[ -z "$current_tag" ]]; then
  echo "BACKUP FAILED: prod was never deployed (no $STATE_DIR/current_tag)." >&2
  exit 1
fi
export APP_TAG="$current_tag"

if ! take_lock -w 900; then
  echo "BACKUP FAILED: waited 15 minutes for a deploy or a restore in prod." >&2
  exit 1
fi

backup="$(new_backup_path daily "$current_tag")"
log "Backing up the prod database to $backup"
if ! backup_db "$backup"; then
  echo "BACKUP FAILED: no backup was made. Is the database running? sudo docker ps" >&2
  exit 1
fi
log "Backup done: $(du -h "$backup" | cut -f1)"
prune_backups daily "$KEEP_DAILY_BACKUPS"
