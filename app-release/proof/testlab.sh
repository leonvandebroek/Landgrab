#!/bin/sh
# Firebase Test Lab proof (the release-gates skill): a Robo test of the signed app on two physical phones (one Samsung, one
# Pixel, picked at run time), 5 minutes each, within the free daily minutes. Writes proof-testlab.json.
#   testlab.sh <signed.aab-or-apk> <out-proof.json>
# Env: FIREBASE_TEST_LAB_SA_JSON (service account key JSON, needs the Firebase Test Lab Admin and Viewer roles),
#      FIREBASE_PROJECT_ID, APP_VERSION. Optional: TESTLAB_TIMEOUT (seconds for the whole run, default 1500).
set -eu
. "$(dirname "$0")/lib.sh"

APP=${1:?usage: testlab.sh <signed.aab-or-apk> <out-proof.json>}
OUT=${2:?usage: testlab.sh <signed.aab-or-apk> <out-proof.json>}
OUT=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")
WORK=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
CHECKS=$WORK/checks.tsv
: > "$CHECKS"
KEY=$WORK/sa.json

cleanup() { rm -f "$KEY"; }
trap cleanup EXIT INT TERM

[ -f "$APP" ] || { check input fail "$APP does not exist"; finish testlab "$OUT" "none=none" || true; exit 1; }
NAME=$(basename "$APP")
SHA=$(sha256_of "$APP")
fail_now() { check "$1" fail "$2"; finish testlab "$OUT" "$NAME=$SHA" || true; exit 1; }

command -v gcloud >/dev/null 2>&1 || fail_now tool-gcloud "gcloud is not installed on this machine"
[ -n "${FIREBASE_TEST_LAB_SA_JSON:-}" ] || fail_now credentials "FIREBASE_TEST_LAB_SA_JSON is not set"
[ -n "${FIREBASE_PROJECT_ID:-}" ] || fail_now credentials "FIREBASE_PROJECT_ID is not set"

# The key goes to a private temporary file, never to the log.
( umask 077; printf '%s' "$FIREBASE_TEST_LAB_SA_JSON" > "$KEY" )
log "Signing in to Google Cloud as the Test Lab service account"
tmo 120 gcloud auth activate-service-account --key-file="$KEY" --quiet >/dev/null 2>&1 || fail_now credentials "gcloud could not sign in with the service account key"

# Two current physical phones; the fallback list is used when the catalogue cannot be read.
log "Picking a Samsung and a Pixel from the Test Lab catalogue"
if tmo 120 gcloud firebase test android models list --project "$FIREBASE_PROJECT_ID" --filter="form=PHYSICAL" --format=json > "$WORK/models.json" 2>"$WORK/models.err"; then :; else log "model list failed, using the fallback devices"; : > "$WORK/models.json"; fi
DEVICES=$(node "$HERE/testlab-outcome.mjs" models "$WORK/models.json")
D1=$(echo "$DEVICES" | sed -n 1p); D2=$(echo "$DEVICES" | sed -n 2p)
log "Devices: $D1 and $D2"

log "Starting the Robo test (5 minutes per device)"
set +e
tmo "${TESTLAB_TIMEOUT:-1500}" gcloud firebase test android run --project "$FIREBASE_PROJECT_ID" --type robo --app "$APP" \
  --device "$D1" --device "$D2" --timeout 5m --format=json > "$WORK/run.json" 2> "$WORK/run.err"
RUN_EXIT=$?
set -e
tail -15 "$WORK/run.err" || true
[ "$RUN_EXIT" -eq 124 ] && check testlab-timeout fail "the test matrix did not finish in time"

# gcloud exits non-zero for a failed matrix too; the outcome per device is what counts.
node "$HERE/testlab-outcome.mjs" outcome "$WORK/run.json" "$WORK/outcome.tsv" || true
cat "$WORK/outcome.tsv" >> "$CHECKS" 2>/dev/null || check testlab-result fail "no outcome could be read (gcloud exit $RUN_EXIT)"
[ "$RUN_EXIT" -ne 0 ] && [ "$(grep -c '	ok	' "$CHECKS" 2>/dev/null || echo 0)" -eq 0 ] && check testlab-run fail "gcloud exited with $RUN_EXIT"

finish testlab "$OUT" "$NAME=$SHA"
