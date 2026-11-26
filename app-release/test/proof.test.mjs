import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProof, parseChecks } from '../proof/proof.mjs';
import { pickDevices, parseOutcome, toTsv, FALLBACK_DEVICES } from '../proof/testlab-outcome.mjs';
import { pickSimulators } from '../proof/simulators.mjs';

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const goodResult = () => ({
  capacitor: { present: true, platform: 'android', isNative: true },
  plugins: Object.fromEntries(Object.keys(REQUIRED_PLUGINS).map((k) => [k, true])),
  appInfo: { id: 'com.example.app', version: '1.0', build: '1' },
});

test('proof: ok only when every check is ok and files and version exist', () => {
  const checks = parseChecks('a\tok\tfine\nb\tok\tfine\n');
  const ok = buildProof({ target: 'ios', version: '1.0.1', files: { 'x.zip': 'abc' }, checks });
  assert.equal(ok.ok, true);
  assert.equal(ok.target, 'ios');
  assert.equal(buildProof({ target: 'ios', version: '1.0.1', files: { 'x.zip': 'abc' }, checks: parseChecks('a\tfail\tno') }).ok, false);
  assert.equal(buildProof({ target: 'ios', version: '', files: { 'x.zip': 'abc' }, checks }).ok, false);
  assert.equal(buildProof({ target: 'ios', version: '1', files: {}, checks }).ok, false);
  assert.equal(buildProof({ target: 'ios', version: '1', files: { a: 'b' }, checks: [] }).ok, false);
});

test('testlab: picks the newest non-deprecated Samsung and Pixel, physical only', () => {
  assert.deepEqual(pickDevices(JSON.parse(fixture('testlab-models.json'))), [
    'model=dm1q,version=34,locale=en,orientation=portrait',
    'model=husky,version=35,locale=en,orientation=portrait',
  ]);
  assert.deepEqual(pickDevices([]), FALLBACK_DEVICES);
  assert.deepEqual(pickDevices(null), FALLBACK_DEVICES);
});

test('testlab: all devices passed is ok', () => {
  assert.ok(parseOutcome(fixture('testlab-pass.json')).every((c) => c.ok));
});

test('testlab: a crash, inconclusive, skipped, empty or garbage result fails', () => {
  assert.ok(parseOutcome(fixture('testlab-crash.json')).some((c) => !c.ok && /crashed/.test(c.detail)));
  const row = (outcome) => JSON.stringify([{ axis_value: 'a', outcome }, { axis_value: 'b', outcome: 'Passed' }]);
  for (const o of ['Inconclusive', 'Skipped', 'Flaky', 'Failed']) assert.ok(parseOutcome(row(o)).some((c) => !c.ok), o);
  assert.ok(parseOutcome('[]').some((c) => !c.ok));
  assert.ok(parseOutcome('').some((c) => !c.ok));
  assert.ok(parseOutcome('Error: matrix failed').some((c) => !c.ok));
  assert.ok(parseOutcome(JSON.stringify([{ axis_value: 'a', outcome: 'Passed' }])).some((c) => !c.ok), 'one device is not two');
});

test('testlab outcome survives the TSV round trip into a proof', () => {
  const checks = parseChecks(toTsv(parseOutcome(fixture('testlab-crash.json'))));
  assert.equal(buildProof({ target: 'testlab', version: '1', files: { 'a.aab': 'x' }, checks }).ok, false);
});

test('simulators: newest runtime, plain iPhone and a full-size iPad', () => {
  const p = pickSimulators(JSON.parse(fixture('simctl.json')));
  assert.equal(p.iphone.udid, 'B2');
  assert.equal(p.ipad.udid, 'B5');
  assert.equal(pickSimulators({ devices: {} }).iphone, null);
});
