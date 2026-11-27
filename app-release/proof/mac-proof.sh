#!/bin/sh
# Mac proof (the release-gates skill): the signed, notarised download is checked the way a customer's Mac checks it,
# then the app inside is started from a clean copy and must stay up. Writes proof-mac.json.
#   mac-proof.sh <folder with the .dmg> <out-proof.json>
# Needs: a Mac with Xcode command line tools, Node 22, APP_VERSION. Optional: ALIVE_SECONDS (default 20).
# The app gets its own empty settings folder (HOME points to a temporary folder), so it never touches the app the
# person using this Mac has installed.
set -eu
. "$(dirname "$0")/lib.sh"

DIR=${1:?usage: mac-proof.sh <folder with the .dmg> <out-proof.json>}
OUT=${2:?usage: mac-proof.sh <folder with the .dmg> <out-proof.json>}
OUT=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")
ALIVE=${ALIVE_SECONDS:-20}
WORK=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
CHECKS=$WORK/checks.tsv
: > "$CHECKS"
MOUNT=""; PID=""
cleanup() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
  [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

DMG=$(ls "$DIR"/*.dmg 2>/dev/null | head -n 1 || true)
[ -n "$DMG" ] || { check input fail "no .dmg in $DIR"; finish mac "$OUT" "none=none" || true; exit 1; }
NAME=$(basename "$DMG"); SHA=$(sha256_of "$DMG")
fail_now() { check "$1" fail "$2"; finish mac "$OUT" "$NAME=$SHA" || true; exit 1; }

# 1. The download itself carries a notarisation ticket (not only the app inside it).
if xcrun stapler validate "$DMG" >/dev/null 2>&1; then check dmg-ticket ok "stapled"; else check dmg-ticket fail "the .dmg has no stapled ticket"; fi

# 2. Open it like a customer: mount read-only, copy the app out, ask Gatekeeper.
MOUNT=$WORK/mnt; mkdir -p "$MOUNT"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT" -quiet || fail_now mount "hdiutil could not open the .dmg"
APP=$(ls -d "$MOUNT"/*.app 2>/dev/null | head -n 1 || true)
[ -n "$APP" ] || fail_now mount "no .app inside the .dmg"
ditto "$APP" "$WORK/$(basename "$APP")"
COPY="$WORK/$(basename "$APP")"
hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; MOUNT=""
if codesign --verify --deep --strict "$COPY" 2>"$WORK/codesign.txt"; then check codesign ok "signature intact"; else check codesign fail "$(tail -1 "$WORK/codesign.txt")"; fi
if spctl --assess --type execute "$COPY" 2>"$WORK/spctl.txt"; then check gatekeeper ok "accepted"; else check gatekeeper fail "$(tail -1 "$WORK/spctl.txt")"; fi

# 3. It starts and stays up.
EXE=$(ls "$COPY/Contents/MacOS/" | head -n 1)
HOME=$WORK/home; export HOME; mkdir -p "$HOME"
"$COPY/Contents/MacOS/$EXE" > "$WORK/app.log" 2>&1 &
PID=$!
sleep "$ALIVE"
if kill -0 "$PID" 2>/dev/null; then check starts ok "still running after ${ALIVE}s"; else check starts fail "exited within ${ALIVE}s: $(tail -3 "$WORK/app.log" | tr '\n' ' ')"; fi
kill "$PID" 2>/dev/null || true; PID=""

finish mac "$OUT" "$NAME=$SHA"
