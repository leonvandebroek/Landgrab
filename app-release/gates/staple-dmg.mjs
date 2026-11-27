#!/usr/bin/env node
// The Mac download (the .dmg) notarised and stapled, not only the app inside it (pipelines/desktop.yml).
//
//   node app-release/gates/staple-dmg.mjs <dmg> <latest-mac.yml>
//
// electron-builder notarises and staples the .app, then packs it into the .dmg; the .dmg itself has no ticket, so a
// customer's Mac checks it online on first open and `stapler validate` fails. This sends the .dmg to Apple with the App
// Store Connect API key (APPLE_API_KEY = path of the .p8, APPLE_API_KEY_ID, APPLE_API_ISSUER), waits, staples, and then
// writes the stapled file's sha512 and size into latest-mac.yml, which electron-builder wrote for the unstapled file.
// The updater itself uses the .zip; its entry is left as it is. Node's own modules only.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** latest-mac.yml with new sha512/size for the file `name`, and the top-level sha512 when `path` is that file. */
export function updateFeed(yml, name, sha512, size) {
  const lines = yml.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s+url:\s*(\S+)\s*$/.exec(lines[i]);
    if (!m || m[2] !== name) continue;
    found = true;
    const indent = `${m[1]}  `;
    for (let j = i + 1; j < lines.length && lines[j].startsWith(indent) && !/^\s*-\s/.test(lines[j]); j++) {
      if (/^\s*sha512:/.test(lines[j])) lines[j] = `${indent}sha512: ${sha512}`;
      else if (/^\s*size:/.test(lines[j])) lines[j] = `${indent}size: ${size}`;
    }
  }
  if (!found) throw new Error(`latest-mac.yml has no entry for ${name}`);
  const top = lines.findIndex((l) => /^path:\s*/.test(l));
  if (top >= 0 && lines[top].replace(/^path:\s*/, '').trim() === name) {
    const s = lines.findIndex((l) => /^sha512:\s*/.test(l));
    if (s >= 0) lines[s] = `sha512: ${sha512}`;
  }
  return lines.join('\n');
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (exit ${r.status})`);
}

function main() {
  const [dmg, feed] = process.argv.slice(2);
  if (!dmg || !feed) throw new Error('Use: staple-dmg.mjs <dmg> <latest-mac.yml>');
  const { APPLE_API_KEY: key, APPLE_API_KEY_ID: keyId, APPLE_API_ISSUER: issuer } = process.env;
  if (!key || !keyId || !issuer) throw new Error('APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER are needed');
  run('xcrun', ['notarytool', 'submit', dmg, '--key', key, '--key-id', keyId, '--issuer', issuer, '--wait', '--timeout', '45m']);
  run('xcrun', ['stapler', 'staple', dmg]);
  const bytes = readFileSync(dmg);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  writeFileSync(feed, updateFeed(readFileSync(feed, 'utf8'), basename(dmg), sha512, statSync(dmg).size));
  console.log(`${basename(dmg)} notarised and stapled; latest-mac.yml has its new checksum`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (e) { console.log(`##vso[task.logissue type=error]${e.message}`); process.exit(1); }
}
