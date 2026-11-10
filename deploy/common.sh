# Shared by deploy.sh and restore.sh (sourced, not run): paths, the docker
# compose wrapper, the lock, database backups and the /health smoke test.
# The caller sets `set -euo pipefail` and exports APP_TAG (the app version).

readonly HEALTH_URL="http://127.0.0.1:3000/health"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR
readonly STATE_DIR="$APP_DIR/state"
readonly BACKUP_DIR="$APP_DIR/backups"
readonly LOCK_FILE="$STATE_DIR/deploy.lock"

log() { echo "==> $*"; }

compose() {
  APP_TAG="${APP_TAG:?APP_TAG is not set}" docker compose -p prod \
    --project-directory "$APP_DIR" -f "$APP_DIR/compose.yaml" "$@"
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
  if [[ ! -f "$APP_DIR/.env" ]]; then
    echo "$APP_DIR/.env is missing (what goes there: see compose.yaml)." >&2
    exit 1
  fi
  if [[ "$(stat -c %a "$APP_DIR/.env")" != "600" ]]; then
    echo "$APP_DIR/.env must be readable by its owner only: chmod 600 $APP_DIR/.env" >&2
    exit 1
  fi
}

# One deploy or restore at a time. Arguments go to flock: -n (fail at once)
# or -w <seconds> (wait). The lock is released when the script exits.
take_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  if ! flock "$@" 9; then
    echo "Another deploy or restore is running on the server (lock $LOCK_FILE)." >&2
    return 1
  fi
}

# Path for a new backup: backups/<kind>_<UTC date>_<UTC time>_<app version>.dump
new_backup_path() {
  local kind="$1" version="$2"
  echo "$BACKUP_DIR/${kind}_$(date -u +%Y-%m-%d_%H%M%S)_${version}.dump"
}

# Dumps the prod database into $1 and checks that the file can be read back.
# On failure no file is left behind. The db container must be running.
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
