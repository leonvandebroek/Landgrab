#!/bin/sh
# Packs the release bundle the Deploy stage sends to the NAS in one SSH command (deploy/nas/pipeline.yml), as Time for Guests
# and UTA do: SFTP cannot write /volume1 for DeployAgent.
#
#   SETTINGS_FILE=<settings.env> sh deploy/nas/pack-release.sh [--azure] <output dir>
#
# The bundle: nas-deploy.sh, compose.yml and settings.env (POSTGRES_PASSWORD, JWT_SECRET, PUBLIC_ORIGIN). Writes release.tgz,
# release.b64 (one line) and release.sha256. With --azure it sets the pipeline variables releaseB64 (secret: it carries the
# settings) and releaseSha. POSIX sh; tar, gzip, base64 and sha256sum or shasum only.
set -eu

MAX_B64_BYTES="${PACK_RELEASE_MAX_B64_BYTES:-65536}"
AZURE=0
if [ "${1:-}" = --azure ]; then AZURE=1; shift; fi
OUT="${1:?usage: pack-release.sh [--azure] <output dir>}"
HERE=$(cd "$(dirname "$0")" && pwd)
SETTINGS="${SETTINGS_FILE:?SETTINGS_FILE must name the settings.env to ship}"

sha256_of() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

umask 077
mkdir -p "$OUT"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/landgrab-pack.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
cp "$HERE/nas-deploy.sh" "$HERE/compose.yml" "$STAGE/"
cp "$SETTINGS" "$STAGE/settings.env"
(cd "$STAGE" && COPYFILE_DISABLE=1 tar -cf - nas-deploy.sh compose.yml settings.env) | gzip -n -9 > "$OUT/release.tgz"
base64 < "$OUT/release.tgz" | tr -d '\n' > "$OUT/release.b64"
sha256_of "$OUT/release.tgz" > "$OUT/release.sha256"

B64_BYTES=$(wc -c < "$OUT/release.b64" | tr -d ' ')
echo "release bundle: $B64_BYTES bytes base64 (limit $MAX_B64_BYTES), sha256 $(cat "$OUT/release.sha256")" >&2
[ "$B64_BYTES" -le "$MAX_B64_BYTES" ] || { echo "pack-release: bundle too big for one ssh command line" >&2; exit 1; }

if [ "$AZURE" = 1 ]; then
  echo "##vso[task.setvariable variable=releaseB64;issecret=true]$(cat "$OUT/release.b64")"
  echo "##vso[task.setvariable variable=releaseSha]$(cat "$OUT/release.sha256")"
fi
