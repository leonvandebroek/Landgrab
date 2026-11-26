# Shared by ios-proof.sh, android-proof.sh and testlab.sh (sourced, POSIX sh). The release-gates skill explains them.
# A test that cannot run is a failed check, never a skipped one.

HERE=$(cd "$(dirname "$0")" && pwd)
RELEASE=$(cd "$HERE/.." && pwd)
cfg() { node "$RELEASE/config.mjs" get "$1"; }

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# tmo <seconds> <command...>: run with a hard time limit (GNU timeout, Homebrew gtimeout, or perl on a bare Mac).
tmo() {
  secs=$1; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
  else perl -e 'alarm shift; exec @ARGV or exit 127' "$secs" "$@"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# check <name> <ok|fail> <detail>: append to the checks file.
check() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$CHECKS"
  if [ "$2" = ok ]; then log "PASS $1: $3"; else log "FAIL $1: $3"; fi
}

# run_check <name> <seconds> <command...>: ok when the command exits 0 within the limit.
run_check() {
  name=$1; secs=$2; shift 2
  if tmo "$secs" "$@"; then check "$name" ok "passed"; else check "$name" fail "failed or timed out after at most ${secs}s (exit $?)"; fi
}

# finish <target> <out.json> <name=sha256>...: writes the proof, exits 0 only when it says ok:true.
finish() {
  target=$1; out=$2; shift 2
  set --  "$@"
  fileargs=""
  for f in "$@"; do fileargs="$fileargs --file $f"; done
  # shellcheck disable=SC2086
  node "$HERE/proof.mjs" --target "$target" --version "${APP_VERSION:-}" --checks "$CHECKS" --out "$out" $fileargs
}
