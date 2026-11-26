#!/usr/bin/env node
// The desktop update feed (electron-updater's latest.yml / latest-mac.yml), written for a channel and a share of the
// computers (the desktop-release skill). The pipeline uploads the result: installers first, feed files last, so an
// installed app never reads a feed that names a file which is not there yet.
//
//   node app-release/gates/feed.mjs prepare --from <dir> [--from <dir>] --to <dir> --channel latest|early [--percent 20]
//       copies the installers and writes <channel>.yml / <channel>-mac.yml from electron-builder's latest*.yml.
//       percent below 100 adds stagingPercentage (electron-updater lets that share of computers take it)
//   node app-release/gates/feed.mjs stage --dir <dir> --version <v> --percent <0-100>
//       moves a staged roll-out: both feeds together, and only while they still announce <v> (a newer release
//       published meanwhile is never touched). 0 stops it: no installed app takes the version any more.
//
// The early ring: an app whose user is on the early ring sets autoUpdater.channel = 'early' and then reads early.yml.
// Node's own modules only.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FEEDS = ['latest.yml', 'latest-mac.yml'];

/** The feed text with stagingPercentage set (below 100) or removed (100). */
export function withPercent(yml, percent) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error(`percent must be 0-100 (${percent})`);
  const lines = yml.replace(/\n+$/, '').split('\n').filter((l) => !/^stagingPercentage:/.test(l));
  if (percent < 100) lines.push(`stagingPercentage: ${percent}`);
  return `${lines.join('\n')}\n`;
}

export const versionOf = (yml) => /^version:\s*(\S+)\s*$/m.exec(yml)?.[1] ?? null;

/** latest.yml -> early.yml, latest-mac.yml -> early-mac.yml. */
export const channelName = (feed, channel) => feed.replace(/^latest/, channel);

export function prepare({ from, to, channel, percent = 100 }) {
  if (!/^[a-z][a-z0-9-]*$/.test(channel)) throw new Error(`channel must be a plain name (${channel})`);
  mkdirSync(to, { recursive: true });
  const written = [];
  for (const dir of from) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!statSync(p).isFile()) continue;
      if (FEEDS.includes(name)) {
        const out = channelName(name, channel);
        writeFileSync(join(to, out), withPercent(readFileSync(p, 'utf8'), percent));
        written.push(out);
      } else if (!/\.ya?ml$/.test(name)) {
        copyFileSync(p, join(to, name));
        written.push(name);
      }
    }
  }
  if (!written.some((n) => n.endsWith('.yml'))) throw new Error('no latest.yml or latest-mac.yml in the build folders');
  return written;
}

export function stage({ dir, version, percent, feeds = FEEDS }) {
  const present = feeds.filter((f) => existsSync(join(dir, f)));
  if (!present.length) throw new Error(`no feed in ${dir}; nothing changed`);
  for (const f of present) {
    const v = versionOf(readFileSync(join(dir, f), 'utf8'));
    if (v !== version) throw new Error(`${f} announces ${v}, not ${version}; nothing changed`);
  }
  // Both written, then both moved: an app never sees one platform moved and the other not.
  for (const f of present) writeFileSync(join(dir, `.${f}.staging`), withPercent(readFileSync(join(dir, f), 'utf8'), percent));
  for (const f of present) renameSync(join(dir, `.${f}.staging`), join(dir, f));
  return present;
}

function args(argv) {
  const [command, ...rest] = argv;
  const o = { from: [] };
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, '');
    if (k === 'from') o.from.push(rest[i + 1]); else o[k] = rest[i + 1];
  }
  return { command, o };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { command, o } = args(process.argv.slice(2));
    if (command === 'prepare') {
      const files = prepare({ from: o.from, to: o.to, channel: o.channel ?? 'latest', percent: Number(o.percent ?? 100) });
      console.log(`feed ${o.channel ?? 'latest'} (${o.percent ?? 100} %): ${files.map((f) => basename(f)).join(', ')}`);
    } else if (command === 'stage') {
      const moved = stage({ dir: o.dir, version: o.version, percent: Number(o.percent) });
      console.log(`desktop ${o.version}: ${o.percent} % (${moved.join(', ')})`);
    } else throw new Error('use prepare or stage');
  } catch (e) { console.log(`##vso[task.logissue type=error]${e.message}`); process.exit(1); }
}
