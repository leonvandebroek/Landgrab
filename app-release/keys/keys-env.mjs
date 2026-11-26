#!/usr/bin/env node
// Prints the key settings of app-release.config.json as shell assignments for app-keys.sh:
//   eval "$(node app-release/keys/keys-env.mjs)"
// Values are single-quoted, so nothing in the settings file can run as a command.
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.mjs';

const q = (v) => `'${String(v ?? '').replaceAll("'", "'\\''")}'`;

export function keysEnv(config) {
  const p = config.platforms;
  return [
    ['KEYS_DIR', config.keys.dir],
    ['KEY_VAULT', config.keys.vault ?? ''],
    ['SECRET_PREFIX', config.keys.prefix],
    ['SUBJECT_CN', config.keys.subject.commonName],
    ['SUBJECT_C', config.keys.subject.country],
    ['WANT_IOS', p.ios ? 1 : 0],
    ['WANT_ANDROID', p.android ? 1 : 0],
    ['WANT_MAC', p.mac ? 1 : 0],
    ['WANT_WINDOWS', p.windows ? 1 : 0],
    // push: { ios, android } in app-release.config.json (push notifications need their own keys per platform).
    ['WANT_PUSH_IOS', p.ios && config.raw?.push?.ios ? 1 : 0],
    ['WANT_PUSH_ANDROID', p.android && config.raw?.push?.android ? 1 : 0],
  ].map(([k, v]) => `${k}=${q(v)}`).join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(keysEnv(loadConfig())); } catch (e) { console.error(e.message); process.exit(1); }
}
