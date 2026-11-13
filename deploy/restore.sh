#!/usr/bin/env bash
# Restores the prod database from a backup file (made by deploy.sh or by this
# script). Run it by hand on the server, in a terminal, as the user deploy:
#
#   sudo -u deploy bash /opt/personal-crm/restore.sh /opt/personal-crm/backups/<file>.dump
#
# Steps: check the file -> show which file replaces which database and wait for
# "yes" -> back up the current database to backups/before-restore_*.dump ->
# stop the app -> drop the database, create it again, load the backup -> start
# the app of the same version -> smoke test /health.
# The app version does not change and no migrations run. If a step fails after
# the database was dropped, the app stays stopped and nothing is rolled back:
# the script prints how to load the copy it made before the restore.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
# Only prod is backed up and restored. The test stand: copy-prod-db.sh.
use_env prod

if [[ $# -ne 1 ]]; then
  echo "Usage: restore.sh <backup file>" >&2
  echo "Backups: ls -lh $BACKUP_DIR" >&2
  exit 2
fi
if [[ ! -t 0 ]]; then
  echo "restore.sh waits for you to type yes: run it in an interactive terminal." >&2
  exit 2
fi
file="$1"
if [[ ! -f "$file" || ! -r "$file" ]]; then
  echo "No such backup file, or the user $(id -un) cannot read it: $file" >&2
  exit 1
fi
file="$(realpath "$file")"

cd "$APP_DIR"
check_user
check_env_file

current_tag="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"
if [[ -z "$current_tag" ]]; then
  echo "No app version in $STATE_DIR/current_tag: deploy the app first." >&2
  exit 1
fi
export APP_TAG="$current_tag"

if ! take_lock -n; then
  echo "Wait until the deploy finishes and run restore.sh again. Nothing was changed." >&2
  exit 1
fi

log "Starting the database"
compose up -d --wait db

log "Checking the backup file"
if ! compose exec -T db pg_restore --list <"$file" >/dev/null; then
  echo "$file is not a database backup or it is damaged. Nothing was changed." >&2
  exit 1
fi

db_name="$(compose exec -T db printenv POSTGRES_DB </dev/null)"
backup_version="unknown"
if [[ "${file##*/}" =~ _([0-9a-f]{7,40}|none)\.dump$ ]]; then
  backup_version="${BASH_REMATCH[1]}"
fi

echo
echo "  Backup file:           $file"
echo "                         $(du -h "$file" | cut -f1), made $(date -u -r "$file" '+%Y-%m-%d %H:%M UTC')"
echo "  Taken on app version:  $backup_version"
echo "  Database to replace:   $db_name (all its data is dropped and loaded from the file)"
echo "  App version:           $current_tag (stays the same)"
echo
if [[ "$backup_version" != "$current_tag" ]]; then
  echo "  WARNING: the backup was taken on another app version. The restore does not"
  echo "  change the app version and does not run migrations, so the app may not work"
  echo "  with this database."
  if [[ "$backup_version" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "  To go back to that version first, answer no and run:"
    echo "    sudo -u deploy bash $APP_DIR/deploy.sh prod $backup_version"
    echo "  then run restore.sh again."
  fi
  echo
fi

read -r -p "Type yes to replace the database \"$db_name\" with this backup: " answer
if [[ "$answer" != "yes" ]]; then
  echo "Cancelled. Nothing was changed."
  exit 0
fi

# Copy of the current database. It may be missing if a previous restore failed
# between dropping and creating it: then there is nothing to save.
# shellcheck disable=SC2016
if ! databases="$(compose exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "select datname from pg_database"' \
  </dev/null)"; then
  echo "Could not list the databases. Nothing was changed." >&2
  exit 1
fi
safety=""
if grep -qxF "$db_name" <<<"$databases"; then
  safety="$(new_backup_path before-restore "$current_tag")"
  log "Saving the current database to $safety"
  if ! backup_db "$safety"; then
    echo "BACKUP FAILED: could not save the current database. Nothing was changed." >&2
    exit 1
  fi
else
  log "Database $db_name does not exist: nothing to save"
fi

restore_failed() {
  echo "RESTORE FAILED: the database \"$db_name\" may be empty or incomplete." >&2
  echo "The app is stopped, nothing was rolled back." >&2
  if [[ -n "$safety" ]]; then
    echo "To load the database as it was before this restore, run:" >&2
    echo "  sudo -u deploy bash $APP_DIR/restore.sh $safety" >&2
  fi
  exit 1
}

log "Stopping the app"
if ! compose stop app; then
  echo "Could not stop the app. The database was not changed." >&2
  echo "Check the containers: sudo docker ps -a" >&2
  exit 1
fi

log "Dropping the database $db_name, creating it again and loading the backup"
load_backup "$file" || restore_failed

log "Starting the app $current_tag"
if ! compose up -d --no-deps app || ! smoke_test "$current_tag"; then
  echo "The database was loaded from $file, but the app does not answer." >&2
  echo "Nothing was rolled back." >&2
  if [[ -n "$safety" ]]; then
    echo "The database as it was before this restore: $safety" >&2
  fi
  exit 1
fi

log "Restored the database $db_name from $file, app version $current_tag"
if [[ -n "$safety" ]]; then
  log "The database as it was before this restore: $safety"
fi
