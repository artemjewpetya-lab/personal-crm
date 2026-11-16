#!/usr/bin/env bash
# Runs in GitHub Actions: the whole Deploy prod job. Chooses which version (commit
# SHA) goes to prod, takes the deploy/ folder of that same commit and runs its
# ci-deploy.sh prod: the image and the deploy scripts of one version, the ones that
# passed the test stand. Writes the result to the run summary.
#
# How the version is chosen:
#   ROLLBACK=true - the prod version before the current one; the server remembers it
#     (state/previous_tag). The test stand is not checked, INPUT_SHA is ignored.
#   INPUT_SHA set - that commit, only if its deploy to the test stand succeeded.
#   INPUT_SHA empty - the newest commit whose deploy to the test stand succeeded.
# The history of the test stand's deploys is GitHub Deployments of the environment
# "staging": the Deploy staging workflow makes them.
#
# Env: ROLLBACK (true/false), INPUT_SHA, GH_TOKEN (contents: read, deployments: read),
#      GITHUB_REPOSITORY, GITHUB_REF, GITHUB_SERVER_URL, GITHUB_STEP_SUMMARY (set by
#      GitHub), and for ci-deploy.sh: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS,
#      DEPLOY_SSH_KEY, GHCR_USER, GHCR_TOKEN
# Runs in the checkout of main (actions/checkout leaves git able to fetch).
set -euo pipefail

: "${ROLLBACK:?}" "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_REF:?}"
: "${GITHUB_SERVER_URL:?}" "${GITHUB_STEP_SUMMARY:?}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STAGING_ENV=staging
readonly APP_URL=https://app.personalcrm.site

# The run summary is for the person who pressed the button, so it is in Russian.
# report <heading> <lines...>: the heading, then what is known about the version,
# then the lines.
version_lines=()
report() {
  local heading="$1"
  shift
  {
    printf '%s\n\n' "### $heading"
    if ((${#version_lines[@]} > 0)); then
      printf '%s\n' "${version_lines[@]}" ""
    fi
    printf '%s\n' "$@"
  } >>"$GITHUB_STEP_SUMMARY"
}

# fail <log message> <summary line>: stops before anything on the server is touched.
fail() {
  echo "$1" >&2
  report "Выкатка на прод не запускалась" "$2" "" "Прод не тронут."
  exit 1
}

# gh_api <args>: the GitHub API; on failure stops with a message.
gh_api() {
  if ! gh api "$@"; then
    fail "GitHub API call failed: gh api $*" \
      "Не получилось прочитать данные из GitHub — запустите Deploy prod ещё раз."
  fi
}

# True if GitHub deployment $1 ever had the status success. A successful deploy
# gets the status inactive when a newer one succeeds, so the whole history of its
# statuses is checked, not only the last one.
succeeded() {
  local ids
  ids="$(gh_api --paginate "repos/$GITHUB_REPOSITORY/deployments/$1/statuses?per_page=100" \
    --jq '.[] | select(.state == "success") | .id')" || exit 1
  [[ -n "$ids" ]]
}

if [[ "$GITHUB_REF" != refs/heads/main ]]; then
  fail "Deploy prod runs from main only, not from $GITHUB_REF." \
    "Deploy prod запускается только из ветки main: в «Use workflow from» выберите main."
fi

# 1. Choose the version
input_sha="$(tr -d '[:space:]' <<<"${INPUT_SHA:-}")"
if [[ "$ROLLBACK" == true ]]; then
  # shellcheck source=ci-ssh.sh
  source "$script_dir/ci-ssh.sh"
  # What the server remembers (deploy.sh writes it after a passed smoke test):
  # current_tag - the version that passed its smoke test last, previous_tag - the
  # one before it; and the version the app container really runs.
  # shellcheck disable=SC2016 # expanded on the server
  remembered="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" '
    current="$(cat '"$REMOTE_DIR"'/state/current_tag 2>/dev/null)"
    previous="$(cat '"$REMOTE_DIR"'/state/previous_tag 2>/dev/null)"
    image="$(docker inspect --format "{{.Config.Image}}" prod-app-1 2>/dev/null)"
    running="${image##*:}"
    echo "${current:-none} ${previous:-none} ${running:-none}"')"
  read -r current previous running <<<"$remembered"
  echo "==> On the server: current_tag $current, previous_tag $previous, the app runs $running"
  if [[ "$running" != none && "$running" != "$current" ]]; then
    # The last deploy failed its smoke test: the app runs the new version, which
    # did not answer. Back to the version that ran before that deploy.
    sha="$current"
    how="откат — последняя выкатка не прошла smoke, возврат на версию, которая работала до неё; тест-стенд не проверялся"
  else
    sha="$previous"
    how="откат — версия прода, которая работала до текущей; тест-стенд не проверялся"
  fi
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    fail "No version to roll back to on the server: \"$sha\"." \
      "Сервер не помнит прошлую версию прода (\`$REMOTE_DIR/state/\`): откатываться не на что."
  fi
  if [[ -n "$input_sha" ]]; then
    how="$how; поле SHA при откате не учитывается"
  fi
elif [[ -n "$input_sha" ]]; then
  if [[ ! "$input_sha" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    fail "\"$input_sha\" is not a commit SHA." "«$input_sha» — не SHA коммита."
  fi
  if ! sha="$(gh api "repos/$GITHUB_REPOSITORY/commits/$input_sha" --jq .sha)"; then
    fail "No commit $input_sha in $GITHUB_REPOSITORY." "Коммита \`$input_sha\` нет в репозитории."
  fi
  ids="$(gh_api --paginate \
    "repos/$GITHUB_REPOSITORY/deployments?environment=$STAGING_ENV&sha=$sha&per_page=100" \
    --jq '.[].id')"
  passed=false
  for id in $ids; do
    if succeeded "$id"; then
      passed=true
      break
    fi
  done
  if [[ "$passed" != true ]]; then
    fail "Commit $sha never deployed to the test stand successfully, so it may not go to prod." \
      "Версия \`$sha\` ни разу удачно не выкатилась на тест-стенд, на прод её выкатывать нельзя. Оставьте поле SHA пустым — выкатится последняя версия, которая прошла тест-стенд."
  fi
  how="указана вручную, удачно выкатывалась на тест-стенд"
else
  # GitHub lists the deployments newest first.
  deployments="$(gh_api --paginate \
    "repos/$GITHUB_REPOSITORY/deployments?environment=$STAGING_ENV&per_page=100" \
    --jq '.[] | "\(.id) \(.sha)"')"
  sha=""
  while read -r id deployment_sha; do
    if [[ -n "$id" ]] && succeeded "$id"; then
      sha="$deployment_sha"
      break
    fi
  done <<<"$deployments"
  if [[ -z "$sha" ]]; then
    fail "No successful deploy to the test stand in the GitHub history." \
      "Ни одна выкатка на тест-стенд не прошла удачно: выкатывать на прод нечего."
  fi
  how="последняя версия, которая удачно выкатилась на тест-стенд"
fi

title="$(gh_api "repos/$GITHUB_REPOSITORY/commits/$sha" --jq '.commit.message | split("\n")[0]')"
echo "==> Version for prod: $sha ($how) $title"
version_lines=(
  "- Версия: [\`${sha:0:7}\`]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/commit/$sha) $title"
  "- Полный SHA: \`$sha\`"
  "- Как выбрана: $how"
)

# 2. The deploy/ folder of that commit
release_dir="$(mktemp -d)"
if ! git fetch --quiet --depth=1 origin "$sha" \
  || ! git archive "$sha" deploy | tar -x -C "$release_dir"; then
  fail "Could not get deploy/ of $sha from git." \
    "Не получилось взять скрипты выкатки этой версии из git — запустите Deploy prod ещё раз."
fi

# 3. Deploy with the scripts of that commit
if IMAGE_TAG="$sha" bash "$release_dir/deploy/ci-deploy.sh" prod; then
  report "✅ Выкачено на прод" \
    "Проверить: $APP_URL/health — в \`version\` должен быть \`$sha\`."
else
  status=$?
  report "❌ Выкатка на прод упала" \
    "Что случилось — в логе шага «Run deploy/ci-prod-deploy.sh», в конце. Сам ничего не откатывается." \
    "Что делать — README, раздел «Если выкатка упала»."
  exit "$status"
fi
