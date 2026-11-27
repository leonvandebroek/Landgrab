import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, stage, withPercent } from '../gates/feed.mjs';

const feed = (v) => `version: ${v}\nfiles:\n  - url: App-${v}.dmg\n    sha512: abc\n    size: 3\npath: App-${v}.dmg\nsha512: abc\nreleaseDate: '2026-11-26T10:00:00.000Z'\n`;

test('percent below 100 adds one stagingPercentage line, 100 removes it', () => {
  assert.match(withPercent(feed('1.0.2'), 20), /\nstagingPercentage: 20\n$/);
  assert.doesNotMatch(withPercent(withPercent(feed('1.0.2'), 20), 100), /stagingPercentage/);
  assert.equal(withPercent(withPercent(feed('1.0.2'), 20), 0).match(/stagingPercentage/g).length, 1);
  assert.throws(() => withPercent(feed('1'), 101), /0-100/);
});

test('prepare writes the channel feeds and copies the installers, never the old feed names', () => {
  const root = mkdtempSync(join(tmpdir(), 'feed-'));
  const mac = join(root, 'mac'), win = join(root, 'win'), out = join(root, 'out');
  mkdirSync(mac); mkdirSync(win);
  writeFileSync(join(mac, 'latest-mac.yml'), feed('1.0.2')); writeFileSync(join(mac, 'App-1.0.2.dmg'), 'D');
  writeFileSync(join(win, 'latest.yml'), feed('1.0.2')); writeFileSync(join(win, 'App-Setup-1.0.2.exe'), 'E');
  prepare({ from: [mac, win], to: out, channel: 'early', percent: 100 });
  assert.deepEqual(readdirSync(out).sort(), ['App-1.0.2.dmg', 'App-Setup-1.0.2.exe', 'early-mac.yml', 'early.yml']);
  assert.throws(() => prepare({ from: [mac], to: out, channel: '../x' }), /plain name/);
});

test('stage moves both feeds only while they announce the version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stage-'));
  writeFileSync(join(dir, 'latest.yml'), withPercent(feed('1.0.2'), 20));
  writeFileSync(join(dir, 'latest-mac.yml'), withPercent(feed('1.0.2'), 20));
  stage({ dir, version: '1.0.2', percent: 100 });
  assert.doesNotMatch(readFileSync(join(dir, 'latest.yml'), 'utf8'), /stagingPercentage/);
  writeFileSync(join(dir, 'latest-mac.yml'), feed('1.0.3'));
  assert.throws(() => stage({ dir, version: '1.0.2', percent: 0 }), /announces 1\.0\.3, not 1\.0\.2/);
  assert.doesNotMatch(readFileSync(join(dir, 'latest.yml'), 'utf8'), /stagingPercentage/, 'nothing changed');
});
