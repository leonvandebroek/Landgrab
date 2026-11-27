#!/bin/sh
# Android proof (the release-gates skill): installs the SIGNED bundle as a universal APK on an emulator and runs the
# app's Maestro smoke flow. Runs on a Mac agent (Apple Silicon: arm64-v8a image) or any x86_64 Linux/Mac with KVM/HVF.
# Microsoft's hosted Ubuntu has no KVM, so it cannot run the emulator.
#   android-proof.sh <signed.aab> <out-proof.json>
# Needs: Java 17+, Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT with cmdline-tools), Node 22, Maestro, APP_VERSION.
# bundletool re-signs the universal APK with its debug key; the bundle itself is the signed file that is hashed and
# published, so the gate compares the bundle.
set -eu
. "$(dirname "$0")/lib.sh"

AAB=${1:?usage: android-proof.sh <signed.aab> <out-proof.json>}
OUT=${2:?usage: android-proof.sh <signed.aab> <out-proof.json>}
OUT=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")
FLOW_TIMEOUT=${SMOKE_TIMEOUT:-420}
FLOW=${FLOW:-$RELEASE/maestro/smoke-android.yaml}
# Pinned and hash checked: a release path downloads nothing it has not seen before.
BUNDLETOOL_VERSION=1.18.1
BUNDLETOOL_SHA256=675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c
API=${ANDROID_API:-35}
WORK=${WORK_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
CHECKS=$WORK/checks.tsv
: > "$CHECKS"
EMU_PID=""
SERIAL=emulator-5598
EMU_PORT=5598

SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
cleanup() {
  [ -n "$SDK" ] && "$SDK/platform-tools/adb" -s "$SERIAL" emu kill >/dev/null 2>&1 || true
  [ -n "$EMU_PID" ] && kill "$EMU_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

[ -f "$AAB" ] || { check input fail "the signed bundle $AAB does not exist"; finish android "$OUT" "none=none" || true; exit 1; }
AAB_NAME=$(basename "$AAB")
AAB_SHA=$(sha256_of "$AAB")
fail_now() { check "$1" fail "$2"; finish android "$OUT" "$AAB_NAME=$AAB_SHA" || true; exit 1; }

for tool in java node maestro curl unzip; do
  command -v "$tool" >/dev/null 2>&1 || fail_now "tool-$tool" "$tool is not installed on this machine"
done
[ -n "$SDK" ] && [ -x "$SDK/platform-tools/adb" ] || fail_now android-sdk "ANDROID_HOME is not set or has no platform-tools/adb"
ADB="$SDK/platform-tools/adb"
PACKAGE=$(cfg apps.main.androidPackage)
[ -n "$PACKAGE" ] || fail_now config "apps.main.androidPackage (or bundleId) is not set in app-release.config.json"
[ -f "$FLOW" ] || fail_now flow "the Maestro flow $FLOW does not exist"

# 1. bundletool.
JAR=$WORK/bundletool-$BUNDLETOOL_VERSION.jar
log "Downloading bundletool $BUNDLETOOL_VERSION"
tmo 300 curl -fsSL -o "$JAR" "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSION/bundletool-all-$BUNDLETOOL_VERSION.jar" || fail_now bundletool "download failed"
[ "$(sha256_of "$JAR")" = "$BUNDLETOOL_SHA256" ] || fail_now bundletool "sha256 of the downloaded jar does not match the pinned value"

# 2. The universal APK from the signed bundle.
log "Building the universal APK from $AAB_NAME"
tmo 600 java -jar "$JAR" build-apks --bundle="$AAB" --output="$WORK/app.apks" --mode=universal --overwrite || fail_now universal-apk "bundletool build-apks failed"
unzip -p "$WORK/app.apks" universal.apk > "$WORK/universal.apk" || fail_now universal-apk "universal.apk not found in the apks archive"
check universal-apk ok "universal APK made from the signed bundle"

# 3. The emulator: arm64 on Apple Silicon (and other ARM hosts), x86_64 otherwise.
case $(uname -m) in arm64|aarch64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac
IMAGE="system-images;android-$API;google_apis;$ABI"
SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager"; AVDM="$SDK/cmdline-tools/latest/bin/avdmanager"
log "Preparing emulator image $IMAGE"
[ -x "$SDKM" ] || fail_now emulator "cmdline-tools/latest is missing in the Android SDK"
yes | tmo 900 "$SDKM" --install "$IMAGE" "emulator" "platform-tools" >/dev/null 2>&1 || fail_now emulator "sdkmanager could not install $IMAGE"
export ANDROID_AVD_HOME=$WORK/avd; mkdir -p "$ANDROID_AVD_HOME"
echo no | "$AVDM" create avd -n release-proof -k "$IMAGE" -d pixel_7 --force >/dev/null 2>&1 || fail_now emulator "avdmanager could not create the AVD"
log "Booting the emulator ($ABI)"
"$SDK/emulator/emulator" -avd release-proof -port "$EMU_PORT" -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect > "$WORK/emulator.log" 2>&1 &
EMU_PID=$!
if ! tmo 420 sh -c "'$ADB' -s $SERIAL wait-for-device; until [ \"\$('$ADB' -s $SERIAL shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r')\" = 1 ]; do sleep 3; done"; then
  fail_now emulator "the emulator did not finish booting within 420s (see $WORK/emulator.log)"
fi
check emulator ok "emulator $IMAGE booted"
export ANDROID_SERIAL=$SERIAL

# 4. The flow on the universal APK.
"$ADB" uninstall "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" install -r "$WORK/universal.apk" >/dev/null || fail_now install "adb install of the universal APK failed"
run_check smoke "$FLOW_TIMEOUT" maestro --device "$SERIAL" test -e "APP_ID=$PACKAGE" "$FLOW" --test-output-dir "$WORK/maestro"

finish android "$OUT" "$AAB_NAME=$AAB_SHA"
