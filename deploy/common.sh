# shellcheck shell=bash
# Shared by deploy.sh, restore.sh and copy-prod-db.sh (sourced, not run): the
# environments, paths, the docker compose wrapper, the lock, database backups and
# the /health smoke test.
# The caller sets `set -euo pipefail`, calls use_env <prod|staging> and exports
# APP_TAG (the app version).

# This folder: the scripts and compose.yaml, shared by both environments.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR
# Backups of the prod database. Only prod is backed up; the test stand is
# loaded from these (copy-prod-db.sh).
readonly BACKUP_DIR="$APP_DIR/backups"
# shellcheck disable=SC2034 # used by deploy.sh
readonly IMAGE_REPO="ghcr.io/artemjewpetya-lab/personal-crm"

log() { echo "==> $*"; }

# Folder with the .env and state/ of environment $1. Prod keeps them in APP_DIR,
# where they were before the test stand appeared; the test stand in APP_DIR/staging.
env_dir_of() {
  case "$1" in
    prod) echo "$APP_DIR" ;;
    staging) echo "$APP_DIR/staging" ;;
    *) return 1 ;;
  esac
}

# Selects the environment the script works with: prod or staging (the test stand).
# Sets ENV_NAME (also the docker compose project name), ENV_DIR, STATE_DIR,
# LOCK_FILE, HEALTH_URL and what compose.yaml takes from the environment:
#   APP_PORT - the loopback port of the app, nginx proxies the site to it
#   APP_MEM_LIMIT, DB_MEM_LIMIT - memory limits of the containers, 0 = no limit
use_env() {
  local dir
  if ! dir="$(env_dir_of "$1")"; then
    echo "Unknown environment \"$1\": prod or staging." >&2
    return 2
  fi
  ENV_NAME="$1"
  ENV_DIR="$dir"
  case "$ENV_NAME" in
    prod) APP_PORT=3000 APP_MEM_LIMIT=0 DB_MEM_LIMIT=0 ;;
    # The test stand shares the server with prod: it must not take prod's memory.
    staging) APP_PORT=3001 APP_MEM_LIMIT=512m DB_MEM_LIMIT=256m ;;
  esac
  STATE_DIR="$ENV_DIR/state"
  LOCK_FILE="$STATE_DIR/deploy.lock"
  HEALTH_URL="http://127.0.0.1:$APP_PORT/health"
  # compose.yaml reads these three from the environment.
  export APP_PORT APP_MEM_LIMIT DB_MEM_LIMIT
  readonly ENV_NAME ENV_DIR STATE_DIR LOCK_FILE HEALTH_URL APP_PORT APP_MEM_LIMIT DB_MEM_LIMIT
}

compose() {
  APP_TAG="${APP_TAG:?APP_TAG is not set}" docker compose -p "$ENV_NAME" \
    --project-directory "$ENV_DIR" --env-file "$ENV_DIR/.env" -f "$APP_DIR/compose.yaml" "$@"
}

# Files written here (backups, state) must belong to the owner of the app folder.
check_user() {
  local owner
  owner="$(stat -c %U "$APP_DIR")"
  if [[ "$(id -un)" != "$owner" ]]; then
    echo "Run this script as the user $owner: sudo -u $owner bash $0 ..." >&2
    exit 2
  fi
}

check_env_file() {
  if [[ ! -f "$ENV_DIR/.env" ]]; then
    echo "$ENV_DIR/.env is missing (what goes there: see compose.yaml)." >&2
    exit 1
  fi
  if [[ "$(stat -c %a "$ENV_DIR/.env")" != "600" ]]; then
    echo "$ENV_DIR/.env must be readable by its owner only: chmod 600 $ENV_DIR/.env" >&2
    exit 1
  fi
}

# One deploy or restore at a time in an environment. Arguments go to flock: -n
# (fail at once) or -w <seconds> (wait). The lock is released when the script exits.
take_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  if ! flock "$@" 9; then
    echo "Another deploy or restore is running in $ENV_NAME (lock $LOCK_FILE)." >&2
    return 1
  fi
}

# The version that runs in environment $1 now, empty if it was never deployed.
current_tag_of() {
  cat "$(env_dir_of "$1")/state/current_tag" 2>/dev/null || true
}

# Path for a new backup: backups/<kind>_<UTC date>_<UTC time>_<app version>.dump
new_backup_path() {
  local kind="$1" version="$2"
  echo "$BACKUP_DIR/${kind}_$(date -u +%Y-%m-%d_%H%M%S)_${version}.dump"
}

# Dumps the database of the environment into $1 and checks that the file can be
# read back. On failure no file is left behind. The db container must be running.
backup_db() {
  local file="$1" tmp="$1.partial"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  # The variables are expanded inside the db container, not here.
  # shellcheck disable=SC2016
  if (umask 077 && compose exec -T db \
    sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    </dev/null >"$tmp") \
    && [[ -s "$tmp" ]] \
    && compose exec -T db pg_restore --list <"$tmp" >/dev/null; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    return 1
  fi
}

# Keeps the newest $2 backups of kind $1 and deletes the older ones.
prune_backups() {
  local kind="$1" keep="$2" files i
  shopt -s nullglob
  files=("$BACKUP_DIR/${kind}_"*.dump)
  shopt -u nullglob
  # The names start with the date and time, so the glob lists them oldest first.
  for ((i = 0; i < ${#files[@]} - keep; i++)); do
    log "Removing old backup ${files[i]##*/}"
    rm -f -- "${files[i]}"
  done
}

# Drops the database of the environment, creates it again empty and loads the
# backup file $1 into it, all or nothing. The app must be stopped.
load_backup() {
  local file="$1"
  # shellcheck disable=SC2016
  compose exec -T db sh -c '
    dropdb --if-exists --force -U "$POSTGRES_USER" --maintenance-db=postgres "$POSTGRES_DB" &&
    createdb -U "$POSTGRES_USER" --maintenance-db=postgres -O "$POSTGRES_USER" "$POSTGRES_DB"
  ' </dev/null || return 1
  # shellcheck disable=SC2016
  compose exec -T db sh -c \
    'pg_restore --exit-on-error --single-transaction --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    <"$file"
}

# Waits up to a minute for /health to answer 200 from version $1, which also
# means the app reaches the database. On failure prints the last app logs.
smoke_test() {
  local expected="$1" body
  log "Smoke test $HEALTH_URL"
  for _ in $(seq 1 30); do
    if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" \
      && [[ "$body" == *"\"version\":\"$expected\""* ]]; then
      log "Smoke test passed: $body"
      return 0
    fi
    sleep 2
  done
  echo "SMOKE TEST FAILED: $HEALTH_URL did not answer 200 for version $expected." >&2
  echo "--- last app logs ---" >&2
  compose logs --no-color --tail 50 app >&2 || true
  echo "---" >&2
  return 1
}
