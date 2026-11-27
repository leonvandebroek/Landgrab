#!/bin/sh
# Runs ON THE NAS, from the release bundle the pipeline unpacked into <project dir>/.landgrab-release (deploy/nas/pipeline.yml).
#
#   sh .landgrab-release/nas-deploy.sh <image tag> <bundle dir>
#
# Installs compose.yml, merges the bundle's settings.env (secrets from Key Vault) into .env, pulls the images, starts the stack
# and waits for /health through the web container. When the new release is not healthy in time it puts the previous .env and
# compose.yml back and starts those images again, then fails. Postgres data in ./postgres is never touched. POSIX sh only.
set -eu

TAG="${1:?usage: nas-deploy.sh <image tag> <bundle dir>}"
BUNDLE="${2:?usage: nas-deploy.sh <image tag> <bundle dir>}"
# Docker lives in /usr/local/bin on the Synology, which a non-login ssh shell does not have on its PATH.
PATH="/usr/local/bin:$PATH"
export PATH
HEALTH_SECONDS="${HEALTH_SECONDS:-300}"

cleanup() { rm -rf "$BUNDLE"; }
trap cleanup EXIT

[ -f "$BUNDLE/compose.yml" ] || { echo "nas-deploy: $BUNDLE/compose.yml is missing" >&2; exit 1; }
[ -s "$BUNDLE/settings.env" ] || { echo "nas-deploy: $BUNDLE/settings.env is missing or empty" >&2; exit 1; }

umask 077
mkdir -p postgres

# The previous release, to roll back to.
[ -f .env ] && cp .env .env.previous
[ -f compose.yml ] && cp compose.yml compose.yml.previous

# .env = what was there (hand-set values such as LANDGRAB_PORT stay), with the bundle's settings and the new tag on top.
NEW=.env.new
: > "$NEW"
if [ -f .env ]; then
  grep -v -E '^(IMAGE_TAG|POSTGRES_PASSWORD|JWT_SECRET|PUBLIC_ORIGIN)=' .env >> "$NEW" || true
fi
grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|PUBLIC_ORIGIN)=' "$BUNDLE/settings.env" >> "$NEW"
echo "IMAGE_TAG=$TAG" >> "$NEW"
for key in POSTGRES_PASSWORD JWT_SECRET; do
  grep -q "^$key=." "$NEW" || { echo "nas-deploy: $key is empty, nothing changed" >&2; rm -f "$NEW"; exit 1; }
done
cp "$BUNDLE/compose.yml" compose.yml
mv "$NEW" .env
chmod 600 .env

port=$(grep -E '^LANDGRAB_PORT=' .env | tail -n 1 | cut -d= -f2)
port="${port:-8150}"
bind=$(grep -E '^LANDGRAB_BIND_IP=' .env | tail -n 1 | cut -d= -f2)
bind="${bind:-10.233.1.253}"

healthy() {
  waited=0
  while [ "$waited" -lt "$HEALTH_SECONDS" ]; do
    if curl --fail --silent --max-time 5 "http://$bind:$port/health" > /dev/null 2>&1; then return 0; fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

rollback() {
  echo "nas-deploy: release $TAG is not healthy after ${HEALTH_SECONDS}s; rolling back" >&2
  docker compose logs --tail 80 backend >&2 || true
  if [ -f .env.previous ] && [ -f compose.yml.previous ]; then
    cp .env.previous .env
    cp compose.yml.previous compose.yml
    docker compose up -d --remove-orphans || true
    if healthy; then echo "nas-deploy: previous release is back and healthy" >&2; else echo "nas-deploy: previous release is NOT healthy either" >&2; fi
  else
    echo "nas-deploy: first release, nothing to roll back to" >&2
  fi
  exit 1
}

docker compose config --quiet
docker compose pull
docker compose up -d --remove-orphans
if healthy; then
  echo "nas-deploy: release $TAG is healthy on http://$bind:$port"
  docker image prune -f > /dev/null 2>&1 || true
else
  rollback
fi
