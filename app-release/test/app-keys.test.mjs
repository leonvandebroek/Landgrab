import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = new URL('../keys/app-keys.sh', import.meta.url).pathname;

function setup(platforms, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keys-'));
  const keys = join(root, 'keys');
  const config = join(root, 'app-release.config.json');
  writeFileSync(config, JSON.stringify({ app: { name: 'Example App', slug: 'example', publisher: 'Example Publisher' }, platforms,
    apps: { main: { bundleId: 'com.example.app' } }, keys: { dir: keys, vault: 'kv-example', prefix: 'example-' }, ...extra }));
  // A stand-in for the Azure CLI: remembers what was stored, answers "not there" for the rest.
  const log = join(root, 'az.log');
  const az = join(root, 'az');
  writeFileSync(az, `#!/bin/sh\necho "$*" >> ${log}\ncase "$*" in "keyvault secret show"*example-apple-team-id*) exit 0 ;; "keyvault secret show"*) exit 3 ;; esac\nexit 0\n`);
  chmodSync(az, 0o755);
  const run = (cmd) => execFileSync('sh', [SCRIPT, cmd], { env: { ...process.env, APP_RELEASE_CONFIG: config, AZ: az }, encoding: 'utf8' });
  return { root, keys, log, run };
}

test('make only makes the keys of the platforms that are on, and never overwrites them', () => {
  const { keys, run } = setup({ android: true, windows: true });
  const first = run('make');
  assert.match(first, /made {5}android-upload\.p12/);
  assert.match(first, /made {5}windows-signing\.pfx \(self-signed "Example Publisher"/);
  assert.doesNotMatch(first, /developer-id/);
  assert.match(readFileSync(join(keys, 'android-upload.env'), 'utf8'), /^ANDROID_KEYSTORE_PASSWORD=.+\nANDROID_KEY_ALIAS=upload\nANDROID_KEY_PASSWORD=.+\n$/);
  const before = readFileSync(join(keys, 'android-upload.p12'));
  assert.match(run('make'), /kept {5}android-upload\.p12[\s\S]*kept {5}windows-signing\.pfx/);
  assert.deepEqual(readFileSync(join(keys, 'android-upload.p12')), before);
  assert.ok(!existsSync(join(keys, 'android-upload.key')), 'the loose private key is removed');
});

test('check names the missing secrets with the prefix, for the enabled platforms only', () => {
  const { run } = setup({ ios: true, mac: true });
  run('make');
  const out = run('check');
  assert.match(out, /missing {2}example-apple-asc-key-p8/);
  assert.match(out, /missing {2}example-desktop-mac-developer-id-p12/);
  assert.doesNotMatch(out, /android|windows|push-/);
});

test('upload stores what is there, skips what the vault has, and reads Apple values from apple.txt', () => {
  const { keys, log, run } = setup({ ios: true });
  run('make');
  writeFileSync(join(keys, 'apple.txt'), 'ASC_KEY_ID=ABC123\nASC_ISSUER_ID=issuer-1\nTEAM_ID=TEAM42\n');
  writeFileSync(join(keys, 'AuthKey_ABC123.p8'), `-----BEGIN ${'PRIVATE'} KEY-----\nnot a real key\n-----END ${'PRIVATE'} KEY-----\n`);
  const out = run('upload');
  assert.match(out, /stored {3}example-apple-asc-key-p8/);
  assert.match(out, /stored {3}example-apple-asc-key-id/);
  assert.match(out, /skipped {2}example-apple-team-id \(already in Key Vault\)/);
  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /keyvault secret set --vault-name kv-example --name example-apple-asc-key-p8 --file .*AuthKey_ABC123\.p8 --encoding utf-8/);
  assert.doesNotMatch(calls, /not a real key/, 'key contents never reach the command line');
});
