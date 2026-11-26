#!/bin/sh
# The signing keys of an app, made and stored once (the signing-keys skill). Runs on the developer's Mac, where the
# Azure CLI is signed in; the pipelines read everything from Key Vault and nothing else.
#
#   sh app-release/keys/app-keys.sh make      make what we can make ourselves: the Android upload key, the Windows
#                                         certificate (self-signed until there is a paid one) and the request file for
#                                         Apple's Developer ID certificate (Mac apps outside the App Store)
#   sh app-release/keys/app-keys.sh combine   after Apple gave developerID_application.cer back: the Developer ID .p12
#   sh app-release/keys/app-keys.sh check     what is there and what is still missing (names only, never contents)
#   sh app-release/keys/app-keys.sh upload    store everything that is there in Key Vault (skips what Key Vault already has
#                                         unless FORCE=1), then says which local files may be deleted
#
# Everything comes from app-release.config.json: the folder (keys.dir), the vault (keys.vault), a secret name prefix
# (keys.prefix, so several apps can share one vault), the certificate subject (keys.subject) and which platforms are
# on. Only what an enabled platform needs is made or asked for. Files downloaded from Apple and Google go into the
# folder unchanged:
#   AuthKey_<id>.p8 (the App Store Connect API key, and the push key when push is on), google-services.json, the
#   Firebase service account key (*-firebase-adminsdk-*.json), developerID_application.cer, and apple.txt with:
#     ASC_KEY_ID=...   ASC_ISSUER_ID=...   APNS_KEY_ID=...   TEAM_ID=...
# Made files are never overwritten: a second "make" keeps the first keys. The folder is chmod 700 and outside the repo.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
NODE="${NODE:-node}"
eval "$("$NODE" "$HERE/keys-env.mjs")"
DIR="${APP_KEYS_DIR:-$KEYS_DIR}"
VAULT="${APP_KEY_VAULT:-$KEY_VAULT}"
AZ="${AZ:-az}"
OPENSSL="${OPENSSL:-openssl}"

say() { printf '%s\n' "$*"; }
die() { printf 'app-keys.sh: %s\n' "$*" >&2; exit 1; }
on() { [ "$1" = 1 ]; }
mac_or_ios() { on "$WANT_MAC" || on "$WANT_IOS"; }

# OpenSSL 3 writes .p12 files with algorithms the macOS keychain (and older Windows) cannot read; -legacy fixes that.
# LibreSSL (the Mac's own openssl) already writes the old ones and does not know the flag.
legacy() { if "$OPENSSL" version | grep -q '^OpenSSL 3'; then printf '%s' '-legacy'; fi; }
password() { "$OPENSSL" rand -base64 24 | tr -d '\n/+=' | cut -c1-28; }

apple_value() {
  [ -f "$DIR/apple.txt" ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*[=:][[:space:]]*//p" "$DIR/apple.txt" | tr -d '\r' | sed 's/[[:space:]]*$//' | head -n 1
}

make_keys() {
  mkdir -p "$DIR" && chmod 700 "$DIR"
  cd "$DIR"
  if on "$WANT_ANDROID"; then
    if [ ! -f android-upload.p12 ]; then
      P="$(password)"
      "$OPENSSL" req -x509 -newkey rsa:4096 -nodes -keyout android-upload.key -out android-upload.crt -days 10950 \
        -subj "/CN=$SUBJECT_CN upload key/O=$SUBJECT_CN/C=$SUBJECT_C" 2>/dev/null
      # One password for store and key: a PKCS12 key store has only one.
      "$OPENSSL" pkcs12 -export $(legacy) -inkey android-upload.key -in android-upload.crt -name upload \
        -out android-upload.p12 -passout "pass:$P"
      printf 'ANDROID_KEYSTORE_PASSWORD=%s\nANDROID_KEY_ALIAS=upload\nANDROID_KEY_PASSWORD=%s\n' "$P" "$P" > android-upload.env
      rm -f android-upload.key android-upload.crt
      say "made     android-upload.p12 (the Android upload key, valid 30 years)"
    else
      say "kept     android-upload.p12"
    fi
  fi
  if on "$WANT_WINDOWS"; then
    if [ ! -f windows-signing.pfx ]; then
      P="$(password)"
      cat > windows-signing.cnf <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $SUBJECT_CN
O = $SUBJECT_CN
C = $SUBJECT_C
[ext]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
CNF
      "$OPENSSL" req -x509 -newkey rsa:3072 -nodes -keyout windows-signing.key -out windows-signing.crt -days 3650 \
        -config windows-signing.cnf 2>/dev/null
      "$OPENSSL" pkcs12 -export $(legacy) -inkey windows-signing.key -in windows-signing.crt -name "$SUBJECT_CN" \
        -out windows-signing.pfx -passout "pass:$P"
      printf '%s' "$P" > windows-signing.password
      rm -f windows-signing.key windows-signing.crt windows-signing.cnf
      say "made     windows-signing.pfx (self-signed \"$SUBJECT_CN\", valid 10 years)"
    else
      say "kept     windows-signing.pfx"
    fi
  fi
  if on "$WANT_MAC"; then
    if [ ! -f developer-id.key ]; then
      "$OPENSSL" req -new -newkey rsa:2048 -nodes -keyout developer-id.key -out developer-id.certSigningRequest \
        -subj "/CN=$SUBJECT_CN/C=$SUBJECT_C" 2>/dev/null
      chmod 600 developer-id.key
      say "made     developer-id.certSigningRequest: upload it at developer.apple.com, Certificates, plus, Developer ID Application"
    else
      say "kept     developer-id.key"
    fi
  fi
  return 0
}

combine() {
  cd "$DIR"
  [ -f developer-id.key ] || die "developer-id.key is missing: run make first, and upload its request file to Apple"
  CER="$(ls developerID_application*.cer 2>/dev/null | head -n 1 || true)"
  [ -n "$CER" ] || die "no developerID_application.cer in $DIR yet (Apple gives it after the request file is uploaded)"
  "$OPENSSL" x509 -inform DER -in "$CER" -out developer-id.crt
  # The key must belong to the certificate Apple signed.
  [ "$("$OPENSSL" x509 -noout -modulus -in developer-id.crt)" = "$("$OPENSSL" rsa -noout -modulus -in developer-id.key 2>/dev/null)" ] \
    || die "$CER does not belong to developer-id.key; upload developer-id.certSigningRequest again and download the new certificate"
  P="$(password)"
  "$OPENSSL" pkcs12 -export $(legacy) -inkey developer-id.key -in developer-id.crt -name "Developer ID Application" \
    -out developer-id.p12 -passout "pass:$P"
  printf '%s' "$P" > developer-id.password
  rm -f developer-id.crt
  say "made     developer-id.p12 ($("$OPENSSL" x509 -noout -subject -inform DER -in "$CER" | sed 's/^subject= *//'))"
}

# Which local file feeds which secret: "<secret> <encoding> <file>". Base64 for binary files, utf-8 for text.
plan() {
  cd "$DIR"
  ASC_KEY_ID="$(apple_value ASC_KEY_ID)"; APNS_KEY_ID="$(apple_value APNS_KEY_ID)"
  [ -n "$ASC_KEY_ID" ] && [ -f "AuthKey_$ASC_KEY_ID.p8" ] && say "apple-asc-key-p8 utf-8 AuthKey_$ASC_KEY_ID.p8"
  [ -n "$APNS_KEY_ID" ] && [ -f "AuthKey_$APNS_KEY_ID.p8" ] && say "push-apns-key-p8 utf-8 AuthKey_$APNS_KEY_ID.p8"
  [ -f developer-id.p12 ] && say "desktop-mac-developer-id-p12 base64 developer-id.p12" && say "desktop-mac-developer-id-password utf-8 developer-id.password"
  [ -f windows-signing.pfx ] && say "desktop-windows-cert-pfx base64 windows-signing.pfx" && say "desktop-windows-cert-password utf-8 windows-signing.password"
  [ -f android-upload.p12 ] && say "android-upload-keystore base64 android-upload.p12" && say "android-keystore-env utf-8 android-upload.env"
  [ -f google-services.json ] && say "android-google-services-json utf-8 google-services.json"
  SA="$(ls ./*firebase-adminsdk*.json 2>/dev/null | head -n 1 || true)"
  # One service account can serve both: FCM push from the server, and the pipeline's Play uploads (invited in Play Console).
  [ -n "$SA" ] && say "play-service-account-json utf-8 ${SA#./}" && { on "$WANT_PUSH_ANDROID" && say "push-fcm-service-account-json utf-8 ${SA#./}"; true; }
  return 0
}

values() {
  for k in ASC_KEY_ID ASC_ISSUER_ID APNS_KEY_ID TEAM_ID; do
    v="$(apple_value "$k")"
    [ -n "$v" ] || continue
    case "$k" in ASC_KEY_ID) s=apple-asc-key-id ;; ASC_ISSUER_ID) s=apple-asc-issuer-id ;; APNS_KEY_ID) s=push-apns-key-id ;; TEAM_ID) s=apple-team-id ;; esac
    say "$s $v"
  done
}

# The secrets this app needs, from the platforms that are on.
needed() {
  mac_or_ios && say apple-asc-key-p8 && say apple-asc-key-id && say apple-asc-issuer-id && say apple-team-id
  on "$WANT_PUSH_IOS" && say push-apns-key-p8 && say push-apns-key-id
  on "$WANT_MAC" && say desktop-mac-developer-id-p12 && say desktop-mac-developer-id-password
  on "$WANT_WINDOWS" && say desktop-windows-cert-pfx && say desktop-windows-cert-password
  on "$WANT_ANDROID" && say android-upload-keystore && say android-keystore-env && say play-service-account-json
  on "$WANT_PUSH_ANDROID" && say android-google-services-json && say push-fcm-service-account-json
  return 0
}

check() {
  [ -d "$DIR" ] || die "$DIR does not exist yet: run make first"
  have="$(plan | cut -d' ' -f1; values | cut -d' ' -f1)"
  missing=0
  for s in $(needed); do
    if printf '%s\n' "$have" | grep -qx "$s"; then say "ready    $SECRET_PREFIX$s"; else say "missing  $SECRET_PREFIX$s"; missing=$((missing + 1)); fi
  done
  say "$missing missing"
}

exists() { "$AZ" keyvault secret show --vault-name "$VAULT" --name "$1" --query id -o tsv >/dev/null 2>&1; }

upload() {
  [ -d "$DIR" ] || die "$DIR does not exist yet"
  [ -n "$VAULT" ] || die "keys.vault is not set in app-release.config.json"
  "$AZ" account show -o none 2>/dev/null || die "the Azure CLI is not signed in (az login)"
  plan | while read -r secret encoding file; do
    name="$SECRET_PREFIX$secret"
    if [ "${FORCE:-0}" != 1 ] && exists "$name"; then say "skipped  $name (already in Key Vault)"; continue; fi
    "$AZ" keyvault secret set --vault-name "$VAULT" --name "$name" --file "$DIR/$file" --encoding "$encoding" -o none
    say "stored   $name"
  done
  values | while read -r secret value; do
    name="$SECRET_PREFIX$secret"
    if [ "${FORCE:-0}" != 1 ] && exists "$name"; then say "skipped  $name (already in Key Vault)"; continue; fi
    "$AZ" keyvault secret set --vault-name "$VAULT" --name "$name" --value "$value" -o none
    say "stored   $name"
  done
  say "Done. Everything listed as stored or skipped is in Key Vault $VAULT; the copies in $DIR may be deleted."
}

case "${1:-}" in
  make) make_keys ;;
  combine) combine ;;
  check) check ;;
  upload) upload ;;
  plan) plan ;;
  needed) needed ;;
  *) die "use make, combine, check or upload" ;;
esac
