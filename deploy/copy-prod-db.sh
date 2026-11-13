#!/usr/bin/env bash
# Makes the database of the test stand (staging) a fresh copy of prod: loads the
# newest prod backup into it. Run it on the server as the user deploy, when the
# test stand is set up and whenever its data got spoiled:
#
#   sudo -u deploy bash /opt/personal-crm/copy-prod-db.sh [--yes]
#
# Steps: find the newest backup in backups/ -> show which file replaces which
# database and wait for "yes" (--yes: do not ask, for runs without a terminal) ->
# stop the app of the test stand -> drop its database, create it again, load the
# backup -> apply the migrations of the version the test stand runs -> start the
# app -> smoke test /health.
# Prod is not touched: the backup file is only read. Everything done on the test
# stand since the previous copy is lost. If the test stand was never deployed,
# only the database is loaded; the first deploy starts the app.
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
use_env staging

assume_yes=false
case "${1:-}" in
  "") ;;
  --yes) assume_yes=true ;;
  *)
    echo "Usage: copy-prod-db.sh [--yes]" >&2
    exit 2
    ;;
esac
if [[ "$assume_yes" == false && ! -t 0 ]]; then
  echo "copy-prod-db.sh waits for you to type yes: run it in a terminal, or add --yes." >&2
  exit 2
fi

cd "$APP_DIR"
check_user
check_env_file

current_tag="$(current_tag_of staging)"
# compose.yaml needs a version even when only the database is started.
export APP_TAG="${current_tag:-none}"

if ! take_lock -n; then
  echo "A deploy to $ENV_NAME is running: wait until it finishes and run copy-prod-db.sh" >&2
  echo "again. Nothing was changed." >&2
  exit 1
fi

# The newest finished backup of any kind (a half-written one ends with .partial).
# The names are ours, without spaces, so ls is safe here.
# shellcheck disable=SC2012
file="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n 1 || true)"
if [[ -z "$file" ]]; then
  echo "No prod backups in $BACKUP_DIR: deploy prod first. Nothing was changed." >&2
  exit 1
fi

log "Starting the database of $ENV_NAME"
compose up -d --wait db

log "Checking the backup file"
if ! compose exec -T db pg_restore --list <"$file" >/dev/null; then
  echo "$file is not a database backup or it is damaged. Nothing was changed." >&2
  exit 1
fi

db_name="$(compose exec -T db printenv POSTGRES_DB </dev/null)"
echo
echo "  Prod backup:           $file"
echo "                         $(du -h "$file" | cut -f1), made $(date -u -r "$file" '+%Y-%m-%d %H:%M UTC')"
echo "  Database to replace:   \"$db_name\" of the test stand (all its data is dropped)"
echo "  Test stand version:    ${current_tag:-none, not deployed yet}"
echo
if [[ "$assume_yes" == false ]]; then
  read -r -p "Type yes to replace the database of the test stand with this backup: " answer
  if [[ "$answer" != "yes" ]]; then
    echo "Cancelled. Nothing was changed."
    exit 0
  fi
fi

copy_failed() {
  echo "COPY FAILED: the database of the test stand may be empty or incomplete." >&2
  echo "The app of the test stand is stopped. Run copy-prod-db.sh again." >&2
  exit 1
}

log "Stopping the app of $ENV_NAME"
compose stop app

log "Dropping the database $db_name, creating it again and loading the backup"
load_backup "$file" || copy_failed

if [[ -z "$current_tag" ]]; then
  log "Loaded $file into $ENV_NAME. The test stand was never deployed: the first deploy starts it."
  exit 0
fi

# The test stand may run a newer version than prod: bring the copy up to it.
log "Applying the migrations of $current_tag"
compose run --rm --no-deps -T migrate || copy_failed

log "Starting the app $current_tag"
if ! compose up -d --no-deps app || ! smoke_test "$current_tag"; then
  echo "The database was copied from $file, but the app of the test stand does not answer." >&2
  exit 1
fi

log "The test stand now has a copy of prod from $file"
