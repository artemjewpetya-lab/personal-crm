#!/usr/bin/env bash
# Deploys one version of the app on the server (docker compose project "prod").
#
#   deploy.sh <tag> [registry user]     tag = commit SHA of an image in GHCR
#
# Steps: get the image -> apply migrations in a one-off container -> start the
# new version -> smoke test /health -> keep only the current and previous images.
# Failed migrations: the new version is not started, the old one keeps running.
# Failed smoke test: the script exits with an error and rolls nothing back.
#
# CI (deploy/ci-deploy.sh) sends a short-lived GHCR token on stdin for the pull.
# Manual rollback: run this script with the previous tag; its image is kept on
# the server, so no token is needed:
#   bash /opt/personal-crm/deploy.sh "$(cat /opt/personal-crm/state/previous_tag)"
set -euo pipefail

readonly IMAGE_REPO="ghcr.io/artemjewpetya-lab/personal-crm"
readonly HEALTH_URL="http://127.0.0.1:3000/health"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR
readonly STATE_DIR="$APP_DIR/state"

tag="${1:-}"
registry_user="${2:-github-actions}"
if [[ ! "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: deploy.sh <image tag (commit SHA)> [registry user]" >&2
  exit 2
fi
image="$IMAGE_REPO:$tag"

log() { echo "==> $*"; }
compose() {
  APP_TAG="$tag" docker compose -p prod --project-directory "$APP_DIR" \
    -f "$APP_DIR/compose.yaml" "$@"
}

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "$APP_DIR/.env is missing (what goes there: see compose.yaml)." >&2
  exit 1
fi
if [[ "$(stat -c %a .env)" != "600" ]]; then
  echo "$APP_DIR/.env must be readable by its owner only: chmod 600 $APP_DIR/.env" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
current_tag="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"

# 1. Image
if docker image inspect "$image" >/dev/null 2>&1; then
  log "Image $image is already on the server"
else
  log "Pulling $image"
  token=""
  if [[ ! -t 0 ]]; then
    read -r -t 10 token || true
  fi
  if [[ -n "$token" ]]; then
    # Log in for this pull only, in a throwaway config: no token stays on disk.
    docker_config="$(mktemp -d)"
    trap 'rm -rf "$docker_config"' EXIT
    printf '%s' "$token" | DOCKER_CONFIG="$docker_config" \
      docker login ghcr.io -u "$registry_user" --password-stdin >/dev/null
    DOCKER_CONFIG="$docker_config" docker pull --quiet "$image"
  else
    docker pull --quiet "$image"
  fi
fi

# 2. Database (nothing happens if it is already up)
log "Starting the database"
compose up -d --wait db

# 3. Migrations, in a one-off container from the new image
log "Applying migrations"
if ! compose run --rm --no-deps -T migrate; then
  echo "MIGRATIONS FAILED: the new version was not started." >&2
  echo "The running version (${current_tag:-none}) was left as is." >&2
  exit 1
fi

# 4. New version
log "Starting the app $tag"
compose up -d --no-deps app

# 5. Smoke test: /health must answer 200 from the new version
log "Smoke test $HEALTH_URL"
healthy=""
for _ in $(seq 1 30); do
  if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" \
    && [[ "$body" == *"\"version\":\"$tag\""* ]]; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ -z "$healthy" ]]; then
  echo "SMOKE TEST FAILED: $HEALTH_URL did not answer 200 for version $tag." >&2
  echo "--- last app logs ---" >&2
  compose logs --no-color --tail 50 app >&2 || true
  echo "---" >&2
  echo "Nothing was rolled back. To roll back by hand, run on the server:" >&2
  echo "  bash $APP_DIR/deploy.sh ${current_tag:-<previous tag>}" >&2
  exit 1
fi
log "Smoke test passed: $body"

# 6. Remember the versions: a manual rollback goes to the previous one.
if [[ -n "$current_tag" && "$current_tag" != "$tag" ]]; then
  echo "$current_tag" > "$STATE_DIR/previous_tag"
fi
echo "$tag" > "$STATE_DIR/current_tag"
previous_tag="$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)"

# 7. Keep only the current and previous app images, so the disk does not fill up.
for old in $(docker image ls "$IMAGE_REPO" --format '{{.Tag}}'); do
  if [[ "$old" != "$tag" && "$old" != "$previous_tag" ]]; then
    log "Removing old image $IMAGE_REPO:$old"
    docker image rm "$IMAGE_REPO:$old" >/dev/null \
      || echo "Warning: could not remove $IMAGE_REPO:$old" >&2
  fi
done

log "Deployed $tag (previous: ${previous_tag:-none})"
