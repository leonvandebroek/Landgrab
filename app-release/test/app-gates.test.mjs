// Tests deploy/apps/gate.mjs (no proof, no publish) and deploy/apps/rollout-watch.mjs (the nightly roll-out watch).
// Usage (from the repository root): node --test deploy/tests/app-gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decide, findProofs, parseArgs } from '../gates/gate.mjs';
import { checkVersion, combine, compareVersions, parseFeed, verdict, watchDesktop } from '../gates/rollout-watch.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const proof = (target, files, extra = {}) => ({ target, version: '1.0.9', files, checks: [{ name: 'probe', ok: true }], ok: true, ...extra });
const files = new Map([['a.dmg', sha('A')], ['b.exe', sha('B')], ['latest.yml', sha('L')]]);
const cover = /\.(dmg|exe)$/;
const base = { actual: files, expect: ['mac', 'windows'], version: '1.0.9', cover };

test('gate opens when every expected proof passed on exactly these files', () => {
  const r = decide({ ...base, records: [{ file: 'm', data: proof('mac', { 'a.dmg': sha('A') }) }, { file: 'w', data: proof('windows', { 'b.exe': sha('B') }) }] });
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('a proof that did not run keeps the gate shut', () => {
  const r = decide({ ...base, records: [{ file: 'm', data: proof('mac', { 'a.dmg': sha('A') }) }] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /no proof for windows/);
  assert.match(r.problems.join(), /b\.exe would be published but no proof tested it/);
});

test('a swapped or rebuilt file keeps the gate shut', () => {
  const r = decide({ ...base, records: [{ file: 'm', data: proof('mac', { 'a.dmg': sha('other') }) }, { file: 'w', data: proof('windows', { 'b.exe': sha('B') }) }] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /a\.dmg is not the file that was tested/);
});

test('a failed check, a not-ok record, no checks, another version or a duplicate all keep it shut', () => {
  const w = { file: 'w', data: proof('windows', { 'b.exe': sha('B') }) };
  const cases = [
    proof('mac', { 'a.dmg': sha('A') }, { checks: [{ name: 'update rehearsal', ok: false, detail: 'stayed on 1.0.8' }] }),
    proof('mac', { 'a.dmg': sha('A') }, { ok: false }),
    proof('mac', { 'a.dmg': sha('A') }, { checks: [] }),
    proof('mac', { 'a.dmg': sha('A') }, { version: '1.0.8' }),
  ];
  for (const c of cases) assert.equal(decide({ ...base, records: [{ file: 'm', data: c }, w] }).ok, false, JSON.stringify(c));
  assert.equal(decide({ ...base, records: [{ file: 'm', data: proof('mac', { 'a.dmg': sha('A') }) }, w, { file: 'w2', data: proof('windows', { 'b.exe': sha('B') }) }] }).ok, false);
  assert.equal(decide({ ...base, records: [{ file: 'm', data: null }, w] }).ok, false);
});

test('the gate command reads artifacts from disk and exits 1 without proof', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  mkdirSync(join(dir, 'files')); mkdirSync(join(dir, 'proofs', 'proof-mac'), { recursive: true });
  writeFileSync(join(dir, 'files', 'a.dmg'), 'A');
  writeFileSync(join(dir, 'proofs', 'proof-mac', 'proof-mac.json'), JSON.stringify(proof('mac', { 'a.dmg': sha('A') })));
  assert.equal(findProofs(join(dir, 'proofs')).length, 1);
  const run = (expect) => {
    try {
      execFileSync(process.execPath, [new URL('../gates/gate.mjs', import.meta.url).pathname, '--version', '1.0.9', '--expect', expect, '--proofs', join(dir, 'proofs'),
        '--files', join(dir, 'files'), '--cover', '\\.dmg$', '--out', join(dir, 'record.json')], { stdio: 'pipe' });
      return 0;
    } catch (e) { return e.status; }
  };
  assert.equal(run('mac'), 0);
  assert.equal(run('mac,windows'), 1);
  assert.throws(() => parseArgs(['--version', '1']), /--expect/);
});

test('versions compare as numbers', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.9', '1.0.9'), 0);
  assert.equal(compareVersions('1.0.9', '1.1.0'), -1);
});

test('feeds: version and staging percentage', () => {
  assert.deepEqual(parseFeed('version: 1.0.5\npath: x\nstagingPercentage: 20\n'), { version: '1.0.5', percent: 20 });
  assert.deepEqual(parseFeed('version: 1.0.5\n'), { version: '1.0.5', percent: 100 });
});

test('verdict: full, wait, halt', () => {
  const v = (rows) => verdict({ versions: rows }, '1.0.10');
  assert.equal(v([{ version: '1.0.10', started: 10, crashed: 0 }, { version: '1.0.9', started: 100, crashed: 1 }]).action, 'full');
  assert.equal(v([{ version: '1.0.9', started: 100, crashed: 1 }]).action, 'wait');
  assert.equal(v([{ version: '1.0.10', started: 0, crashed: 0 }]).action, 'wait');
  // 1 of 3 crashed against 1 %: far above the 5 % floor.
  assert.equal(v([{ version: '1.0.10', started: 3, crashed: 1 }, { version: '1.0.9', started: 100, crashed: 1 }]).action, 'halt');
  // 3 % against 2 %: under the floor, fine.
  assert.equal(v([{ version: '1.0.10', started: 100, crashed: 3 }, { version: '1.0.9', started: 100, crashed: 2 }]).action, 'full');
  // 12 % against 5 %: more than twice as bad.
  assert.equal(v([{ version: '1.0.10', started: 100, crashed: 12 }, { version: '1.0.9', started: 100, crashed: 5 }]).action, 'halt');
  assert.equal(verdict(null, '1.0.10').action, 'halt');
  assert.equal(v([{ version: '1.0.10', started: 'x', crashed: 0 }]).action, 'halt');
});

test('combine: one halt stops all, one wait waits', () => {
  assert.equal(combine([{ action: 'full' }, { action: 'halt' }]), 'halt');
  assert.equal(combine([{ action: 'full' }, { action: 'wait' }]), 'wait');
  assert.equal(combine([{ action: 'full' }, { action: 'full' }]), 'full');
});

function fakeFetch(routes) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const r = routes[u.pathname];
    if (!r) return new Response('nope', { status: 404 });
    if (u.pathname.endsWith('/summary') && init.headers?.['X-App-Health-Key'] !== 'k') return new Response('', { status: 401 });
    return new Response(typeof r === 'function' ? r(u) : r, { status: 200 });
  };
}

test('desktop watch: staged and healthy goes to everyone; at 100 % or 0 % nothing moves; no key halts', async () => {
  const summary = (u) => JSON.stringify({ platform: u.searchParams.get('platform'), days: 2, versions: [{ version: '1.0.10', started: 5, crashed: 0 }, { version: '1.0.9', started: 50, crashed: 0 }] });
  const staged = 'version: 1.0.10\nstagingPercentage: 20\n';
  const routes = { '/download/desktop/latest.yml': staged, '/download/desktop/latest-mac.yml': staged, '/health/summary': summary };
  const opts = { health: 'https://app.example/health/summary?platform={platform}&days=2', feed: 'https://site.example/download/desktop', key: 'k' };
  assert.equal((await watchDesktop({ ...opts, fetchImpl: fakeFetch(routes) })).action, 'full');
  assert.equal((await watchDesktop({ ...opts, key: '', fetchImpl: fakeFetch(routes) })).action, 'halt');
  assert.equal((await watchDesktop({ ...opts, key: 'wrong', fetchImpl: fakeFetch(routes) })).action, 'halt');
  const all = { ...routes, '/download/desktop/latest.yml': 'version: 1.0.10\n', '/download/desktop/latest-mac.yml': 'version: 1.0.10\n' };
  assert.equal((await watchDesktop({ ...opts, fetchImpl: fakeFetch(all) })).action, 'none');
  const stopped = { ...routes, '/download/desktop/latest.yml': 'version: 1.0.10\nstagingPercentage: 0\n', '/download/desktop/latest-mac.yml': 'version: 1.0.10\nstagingPercentage: 0\n' };
  assert.equal((await watchDesktop({ ...opts, fetchImpl: fakeFetch(stopped) })).action, 'none');
  const differ = { ...routes, '/download/desktop/latest-mac.yml': 'version: 1.0.9\n' };
  assert.equal((await watchDesktop({ ...opts, fetchImpl: fakeFetch(differ) })).action, 'halt');
  // A Mac-only app has no latest.yml: only its own feed is read.
  const macOnly = { '/download/desktop/latest-mac.yml': staged, '/health/summary': summary };
  assert.equal((await watchDesktop({ ...opts, platforms: ['mac'], fetchImpl: fakeFetch(macOnly) })).action, 'full');
});

test('after a day on the early ring: quiet or unused goes on, more crashes or unreadable numbers stop it (no tap)', async () => {
  const rows = (now) => (u) => JSON.stringify({ platform: u.searchParams.get('platform'), days: 2, versions: [now, { version: '1.0.9', started: 50, crashed: 1 }] });
  const opts = { health: 'https://app.example/health/summary?platform={platform}&days=2', key: 'k', version: '1.0.10' };
  const run = (now, extra = {}) => checkVersion({ ...opts, ...extra, fetchImpl: fakeFetch({ '/health/summary': rows(now) }) });
  assert.equal((await run({ version: '1.0.10', started: 8, crashed: 0 })).action, 'full');
  assert.equal((await run({ version: '1.0.8', started: 8, crashed: 0 })).action, 'wait');
  assert.equal((await run({ version: '1.0.10', started: 8, crashed: 3 })).action, 'halt');
  assert.equal((await run({ version: '1.0.10', started: 8, crashed: 0 }, { key: '' })).action, 'halt');
  assert.equal((await run({ version: '1.0.10', started: 8, crashed: 0 }, { key: 'wrong' })).action, 'halt');
});

test('stapled Mac download: only its feed entry gets the new checksum and size', async () => {
  const { updateFeed } = await import('../gates/staple-dmg.mjs');
  const yml = [
    'version: 1.0.7',
    'files:',
    '  - url: Example-App-1.0.7-mac.zip',
    '    sha512: ZIPSUM',
    '    size: 100',
    '  - url: Example-App-1.0.7.dmg',
    '    sha512: OLDDMG',
    '    size: 200',
    'path: Example-App-1.0.7-mac.zip',
    'sha512: ZIPSUM',
    "releaseDate: '2026-11-21T15:00:00.000Z'",
    '',
  ].join('\n');
  const out = updateFeed(yml, 'Example-App-1.0.7.dmg', 'NEWDMG', 250);
  assert.match(out, /url: Example-App-1\.0\.7\.dmg\n {4}sha512: NEWDMG\n {4}size: 250/);
  assert.match(out, /mac\.zip\n {4}sha512: ZIPSUM\n {4}size: 100/);
  assert.match(out, /^sha512: ZIPSUM$/m);
  const dmgFirst = yml.replace('path: Example-App-1.0.7-mac.zip', 'path: Example-App-1.0.7.dmg').replace(/^sha512: ZIPSUM$/m, 'sha512: OLDDMG');
  assert.match(updateFeed(dmgFirst, 'Example-App-1.0.7.dmg', 'NEWDMG', 250), /^sha512: NEWDMG$/m);
  assert.throws(() => updateFeed(yml, 'other.dmg', 'X', 1), /no entry/);
});
