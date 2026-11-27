#!/usr/bin/env node
// The nightly roll-out watch of the app pipelines (the release-gates skill, "early ring and roll-out").
//
//   node app-release/gates/rollout-watch.mjs desktop  [--health <url>] [--feed <url>]
//       a staged desktop release: compares the crash rate of the staged version with the previous one
//   node app-release/gates/rollout-watch.mjs decide   --health <summary.json> --version <v>    (Android: from play.mjs vitals)
//   node app-release/gates/rollout-watch.mjs early    [--health <url>] --version <v>
//       a desktop release after its time on the early ring: full or wait lets it go on, halt stops the run
//
// Prints the verdict and sets the pipeline variables rolloutAction (full | halt | wait | none) and rolloutVersion:
//   full  the new version started without crashing more than the previous one: take it to everyone
//   halt  it crashes more (or the numbers cannot be read): stop the roll-out and fail the run so someone gets the mail
//   wait  nobody started it yet: leave the roll-out where it is, look again the next night
//   none  there is no staged roll-out (already at 100 %, or stopped at 0 % and waiting for a person)
//
// The desktop numbers come from the app's own health endpoint (desktop.healthUrl in app-release.config.json, with
// {platform} for mac or windows), which answers { versions: [{ version, started, crashed }] }. The read key comes from
// APP_HEALTH_READ_KEY and goes in the header desktop.healthKeyHeader (default X-App-Health-Key). The feed is
// desktop.feedUrl, the folder with electron-builder's latest.yml and latest-mac.yml. Node's own modules only.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.mjs';

/** A crash rate this much worse than the previous version stops the roll-out; small numbers get a floor. */
export const WORSE_FACTOR = 2;
export const RATE_FLOOR = 0.05;

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The feed's version and staging percentage (100 when the line is absent). */
export function parseFeed(text) {
  const version = /^version:\s*(\S+)\s*$/m.exec(text)?.[1] ?? null;
  const staging = /^stagingPercentage:\s*(\d+)\s*$/m.exec(text)?.[1];
  return { version, percent: staging === undefined ? 100 : Number(staging) };
}

/**
 * One platform's verdict. summary = { versions: [{ version, started, crashed }] } (any order). The previous version is
 * the newest one older than `version` with at least one start in the window.
 */
export function verdict(summary, version) {
  const rows = Array.isArray(summary?.versions) ? summary.versions : null;
  if (!rows) return { action: 'halt', reason: 'the health numbers could not be read' };
  const num = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : NaN);
  for (const r of rows) if (Number.isNaN(num(r.started)) || Number.isNaN(num(r.crashed))) return { action: 'halt', reason: `bad numbers for ${r.version}` };
  const now = rows.find((r) => r.version === version);
  if (!now || num(now.started) === 0) return { action: 'wait', reason: `nobody started ${version} yet` };
  const rate = num(now.crashed) / num(now.started);
  const prev = rows.filter((r) => compareVersions(r.version, version) < 0 && num(r.started) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  const prevRate = prev ? num(prev.crashed) / num(prev.started) : 0;
  const limit = Math.max(prevRate * WORSE_FACTOR, RATE_FLOOR);
  const text = `${version}: ${now.crashed}/${now.started} crashed (${(rate * 100).toFixed(1)} %)` +
    (prev ? `, ${prev.version}: ${prev.crashed}/${prev.started} (${(prevRate * 100).toFixed(1)} %)` : ', no previous version to compare');
  if (num(now.crashed) > 0 && rate > limit) return { action: 'halt', reason: `${text}; above the limit of ${(limit * 100).toFixed(1)} %` };
  return { action: 'full', reason: text };
}

/** Several platforms released together: one halt stops all, one wait waits. */
export function combine(verdicts) {
  if (verdicts.some((v) => v.action === 'halt')) return 'halt';
  if (verdicts.some((v) => v.action === 'wait')) return 'wait';
  if (verdicts.length && verdicts.every((v) => v.action === 'none')) return 'none';
  return 'full';
}

async function getText(url, fetchImpl, headers = {}) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Mac and Windows numbers of one version, combined: one halt stops all. */
export async function checkVersion({ health, header = 'X-App-Health-Key', key, version, platforms = ['mac', 'windows'], fetchImpl = fetch }) {
  if (!key) return { action: 'halt', version, lines: ['no APP_HEALTH_READ_KEY: the numbers cannot be read'] };
  const verdicts = [];
  const lines = [];
  if (!health) return { action: 'halt', version, lines: ['no health address (desktop.healthUrl): the numbers cannot be read'] };
  for (const platform of platforms) {
    let v;
    try {
      const summary = JSON.parse(await getText(health.replaceAll('{platform}', platform), fetchImpl, { [header]: key }));
      v = verdict(summary, version);
    } catch (e) {
      v = { action: 'halt', reason: `health numbers unavailable: ${e.message}` };
    }
    verdicts.push(v);
    lines.push(`${platform}: ${v.action}, ${v.reason}`);
  }
  return { action: combine(verdicts), version, lines };
}

export async function watchDesktop({ health, header, feed, key, platforms = ['mac', 'windows'], fetchImpl = fetch }) {
  if (!feed) throw new Error('no update feed address (desktop.feedUrl)');
  if (!platforms.length) throw new Error('no desktop platform is switched on');
  const file = { windows: 'latest.yml', mac: 'latest-mac.yml' };
  const feeds = {};
  for (const p of platforms) feeds[p] = parseFeed(await getText(`${feed}/${file[p]}`, fetchImpl));
  const versions = [...new Set(platforms.map((p) => feeds[p].version))];
  if (versions.length > 1) return { action: 'halt', version: null, lines: [`the feeds differ: ${platforms.map((p) => `${p} ${feeds[p].version}`).join(', ')}`] };
  const version = versions[0];
  const percent = Math.min(...platforms.map((p) => feeds[p].percent));
  if (percent >= 100) return { action: 'none', version, lines: [`${version} already reaches everyone`] };
  if (percent === 0) return { action: 'none', version, lines: [`${version} is stopped at 0 %; a person decides (resume or a fixed version)`] };
  const checked = await checkVersion({ health, header, key, version, platforms, fetchImpl });
  return { ...checked, lines: [`${version} is at ${percent} %`, ...checked.lines] };
}

function args(argv) {
  const [command, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, '')] = rest[i + 1];
  return { command, o };
}

async function main() {
  const { command, o } = args(process.argv.slice(2));
  let result;
  const config = command === 'decide' ? null : loadConfig();
  const desktop = config?.desktop ?? {};
  const platforms = config ? ['mac', 'windows'].filter((p) => config.platforms[p]) : [];
  const where = { health: o.health ?? desktop.healthUrl, header: desktop.healthKeyHeader ?? 'X-App-Health-Key', key: process.env.APP_HEALTH_READ_KEY ?? '', platforms };
  if (command === 'desktop') {
    result = await watchDesktop({ ...where, feed: o.feed ?? desktop.feedUrl });
  } else if (command === 'early') {
    if (!o.version) throw new Error('--version is needed');
    result = await checkVersion({ ...where, version: o.version });
  } else if (command === 'decide') {
    let summary = null;
    try { summary = JSON.parse(readFileSync(o.health, 'utf8')); } catch { summary = null; }
    const v = verdict(summary, o.version);
    result = { action: v.action, version: o.version, lines: [`${o.version}: ${v.action}, ${v.reason}`] };
  } else {
    throw new Error('Use desktop, early or decide');
  }
  for (const l of result.lines) console.log(l);
  console.log(`##vso[task.setvariable variable=rolloutAction;isOutput=true]${result.action}`);
  console.log(`##vso[task.setvariable variable=rolloutVersion;isOutput=true]${result.version ?? ''}`);
  console.log(`verdict: ${result.action}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    // Cannot even decide: the roll-out must not move on by itself.
    console.log(`##vso[task.logissue type=error]${e.message}`);
    console.log('##vso[task.setvariable variable=rolloutAction;isOutput=true]halt');
    process.exit(1);
  });
}
