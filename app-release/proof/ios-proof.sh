#!/bin/sh
# iPhone and iPad proof (the release-gates skill): builds the simulator app of this commit, runs the app's Maestro
# smoke flow on an iPhone and an iPad simulator and writes proof-ios.json. Runs on a Mac agent with full Xcode.
#   ios-proof.sh <out-proof.json>
# Needs: Xcode, Node 22, Maestro, APP_VERSION (the version the store build carries).
# From app-release.config.json: apps.main.bundleId, mobile.dir (the Capacitor project), mobile.syncIos.
# Optional: SMOKE_TIMEOUT (seconds per flow, default 420), WORK_DIR, FLOW (default app-release/maestro/smoke-ios.yaml).
set -eu
. "$(dirname "$0")/lib.sh"

OUT=${1:?usage: ios-proof.sh <out-proof.json>}
OUT=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")
FLOW_TIMEOUT=${SMOKE_TIMEOUT:-420}
FLOW=${FLOW:-$RELEASE/maestro/smoke-ios.yaml}
WORK=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
CHECKS=$WORK/checks.tsv
: > "$CHECKS"
BOOTED=""

cleanup() { for u in $BOOTED; do xcrun simctl shutdown "$u" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT INT TERM

fail_now() { # a missing tool or a failed build still leaves a proof with ok:false
  check "$1" fail "$2"
  finish ios "$OUT" "none=none" || true
  exit 1
}

for tool in xcodebuild xcrun node maestro ditto; do
  command -v "$tool" >/dev/null 2>&1 || fail_now "tool-$tool" "$tool is not installed on this machine"
done
BUNDLE_ID=$(cfg apps.main.bundleId); MOBILE=$(cfg mobile.dir); SYNC=$(cfg mobile.syncIos)
[ -n "$BUNDLE_ID" ] || fail_now config "apps.main.bundleId is not set in app-release.config.json"
[ -f "$FLOW" ] || fail_now flow "the Maestro flow $FLOW does not exist"

# 1. The two simulators.
log "Looking for an iPhone and an iPad simulator"
xcrun simctl list devices available -j > "$WORK/sims.json" || fail_now simulators "simctl list failed"
SIMS=$(node "$HERE/simulators.mjs" "$WORK/sims.json") || fail_now simulators "no iPhone and iPad simulator is installed"
IPHONE=$(echo "$SIMS" | awk '$1=="iphone"{print $2}'); IPHONE_NAME=$(echo "$SIMS" | awk '$1=="iphone"{$1="";$2="";print}')
IPAD=$(echo "$SIMS" | awk '$1=="ipad"{print $2}');     IPAD_NAME=$(echo "$SIMS" | awk '$1=="ipad"{$1="";$2="";print}')
log "iPhone:$IPHONE_NAME ($IPHONE), iPad:$IPAD_NAME ($IPAD)"

# 2. A simulator build of the same commit. Unsigned (simulators need no signing); the store build is the archive of
#    the same commit made by the pipeline's iOS stage.
log "Building the simulator app (Release, iphonesimulator, no signing)"
(cd "$MOBILE" && npm ci --no-audit --no-fund >/dev/null && sh -c "$SYNC" >/dev/null) || fail_now build "npm ci or '$SYNC' failed in $MOBILE"
tmo 1500 xcodebuild -project "$MOBILE/ios/App/App.xcodeproj" -scheme App -configuration Release -sdk iphonesimulator \
  -derivedDataPath "$WORK/dd" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build > "$WORK/xcodebuild.log" 2>&1 \
  || { tail -30 "$WORK/xcodebuild.log"; fail_now build "xcodebuild failed for the simulator app"; }
APP=$WORK/dd/Build/Products/Release-iphonesimulator/App.app
[ -d "$APP" ] || fail_now build "App.app not found in the derived data"
ZIP=$WORK/app-${APP_VERSION:-unknown}-simulator.app.zip
ditto -c -k --keepParent "$APP" "$ZIP"
ZIP_SHA=$(sha256_of "$ZIP")
check build ok "simulator app built; zip sha256 ${ZIP_SHA}"

# 3. Per device: install fresh and run the flow (portrait and landscape are in the flow itself).
run_device() { # <label> <udid> <name>
  label=$1; udid=$2
  log "Booting $label ($3)"
  if tmo 300 sh -c "xcrun simctl boot $udid 2>/dev/null; xcrun simctl bootstatus $udid -b >/dev/null"; then
    BOOTED="$BOOTED $udid"
  else
    check "$label-boot" fail "simulator $udid did not boot within 300s"; return 0
  fi
  xcrun simctl uninstall "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$udid" "$APP" || { check "$label-install" fail "installing the app failed"; return 0; }
  run_check "$label-smoke" "$FLOW_TIMEOUT" maestro --device "$udid" test -e "APP_ID=$BUNDLE_ID" "$FLOW" --test-output-dir "$WORK/maestro-$label"
}
run_device iphone "$IPHONE" "$IPHONE_NAME"
run_device ipad "$IPAD" "$IPAD_NAME"

finish ios "$OUT" "$(basename "$ZIP")=$ZIP_SHA"
