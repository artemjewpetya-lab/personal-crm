#!/usr/bin/env bash
# Runs in GitHub Actions after a successful deploy to prod: keeps the newest 10
# builds of the app image in GHCR and deletes the older ones.
#
# One build is several package versions in GHCR: the image index tagged with the
# commit SHA and its untagged parts (the image itself and its attestation). The
# parts of the kept builds are kept with them. Versions that appeared after the
# oldest kept build are not touched either: a build may be pushing right now, and
# its parts come before its tag.
# The server keeps its own copies of the images it needs for a rollback, so a prod
# version older than the newest 10 builds can still be rolled back to.
#
# Env: GH_TOKEN (packages: write), GITHUB_REPOSITORY_OWNER (set by GitHub)
set -euo pipefail

readonly KEEP_BUILDS=10
readonly PACKAGE=personal-crm
: "${GH_TOKEN:?}" "${GITHUB_REPOSITORY_OWNER:?}"
readonly IMAGE="ghcr.io/$GITHUB_REPOSITORY_OWNER/$PACKAGE"
readonly API="users/$GITHUB_REPOSITORY_OWNER/packages/container/$PACKAGE/versions"

# Every version as "id <tab> digest <tab> created_at <tab> tags", newest first.
versions="$(gh api --paginate "$API?per_page=100" \
  --jq '.[] | [.id, .name, .created_at, (.metadata.container.tags | join(","))] | @tsv' \
  | sort -t $'\t' -k3,3r)"
builds="$(awk -F '\t' '$4 != ""' <<<"$versions")"
build_count="$(grep -c . <<<"$builds" || true)"
echo "==> $build_count builds in GHCR, keeping the newest $KEEP_BUILDS"
if ((build_count <= KEEP_BUILDS)); then
  echo "==> Nothing to delete"
  exit 0
fi

# The kept builds and their parts, by digest.
declare -A keep=()
while IFS=$'\t' read -r _ digest _ _; do
  keep["$digest"]=1
  parts="$(docker buildx imagetools inspect --raw "$IMAGE@$digest" | jq -r '.manifests[]?.digest')"
  for part in $parts; do
    keep["$part"]=1
  done
done < <(head -n "$KEEP_BUILDS" <<<"$builds")
oldest_kept="$(sed -n "${KEEP_BUILDS}p" <<<"$builds" | cut -f3)"
echo "==> The oldest kept build was pushed at $oldest_kept"

deleted=0
while IFS=$'\t' read -r id digest created tags; do
  if [[ -n "${keep[$digest]:-}" || ! "$created" < "$oldest_kept" ]]; then
    continue
  fi
  echo "==> Deleting ${tags:-$digest} (pushed at $created)"
  if ! gh api --silent -X DELETE "$API/$id"; then
    echo "Could not delete a package version. If GitHub answered 403, give this repository" >&2
    echo "the Admin role: the package $PACKAGE -> Package settings -> Manage Actions access." >&2
    exit 1
  fi
  deleted=$((deleted + 1))
done <<<"$versions"
echo "==> Deleted $deleted package versions"
