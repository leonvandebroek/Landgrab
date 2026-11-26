#!/usr/bin/env node
// The release gate of the app pipelines ("no proof, no publish": the release-gates skill).
//
//   node app-release/gates/gate.mjs --version 1.0.123 --expect mac,windows --proofs <dir> --files <dir> [--files <dir>]
//                             [--cover '\.(dmg|zip|exe)$'] [--out release-record.json]
//
// Passes only when every expected proof record is there, says ok, has only ok checks, names the version being
// released, and every file it names has exactly the hash of the file about to be published. Every publishable file
// (matching --cover) must be named by some proof: a file nobody tested is never published. Exit 0 = publish, 1 = not.
// Node's own modules only, so it runs on any agent with Node 22.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const out = { files: [], expect: [], cover: null, out: null, version: null, proofs: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    switch (a) {
      case '--version': out.version = v; i++; break;
      case '--expect': out.expect = String(v).split(',').map((s) => s.trim()).filter(Boolean); i++; break;
      case '--proofs': out.proofs = v; i++; break;
      case '--files': out.files.push(v); i++; break;
      case '--cover': out.cover = new RegExp(v); i++; break;
      case '--out': out.out = v; i++; break;
      default: throw new Error(`unknown argument ${a}`);
    }
  }
  if (!out.version) throw new Error('--version is required');
  if (!out.expect.length) throw new Error('--expect is required');
  if (!out.proofs) throw new Error('--proofs is required');
  if (!out.files.length) throw new Error('--files is required');
  return out;
}

/** Every proof-*.json under dir (pipeline artifacts land as <dir>/proof-<target>/proof-<target>.json). */
export function findProofs(dir) {
  const found = [];
  const walk = (d, depth) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (st.isFile() && /^proof-[a-z0-9-]+\.json$/.test(name)) found.push(p);
    }
  };
  if (existsSync(dir)) walk(dir, 0);
  return found;
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('error', reject).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex')));
  });
}

/** name -> absolute path for every regular file in the given folders (one level deep, as pipeline artifacts are). */
export function listFiles(dirs) {
  const map = new Map();
  for (const d of dirs) {
    if (!existsSync(d)) throw new Error(`no such folder: ${d}`);
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (!statSync(p).isFile()) continue;
      if (map.has(name)) throw new Error(`two files named ${name}`);
      map.set(name, p);
    }
  }
  return map;
}

/**
 * The decision, without touching the disk: records (parsed JSON, with their file names), the actual hashes of the
 * files about to be published, and what is expected. Returns { ok, problems[], summary[] }.
 */
export function decide({ records, actual, expect, version, cover }) {
  const problems = [];
  const summary = [];
  const byTarget = new Map();
  for (const { file, data } of records) {
    if (!data || typeof data !== 'object') { problems.push(`${file}: not a proof record`); continue; }
    const t = data.target;
    if (typeof t !== 'string') { problems.push(`${file}: has no target`); continue; }
    if (byTarget.has(t)) { problems.push(`two proof records for ${t}`); continue; }
    byTarget.set(t, { file, data });
  }
  const tested = new Set();
  for (const target of expect) {
    const rec = byTarget.get(target);
    if (!rec) { problems.push(`no proof for ${target}: the test did not run, so this is not published`); continue; }
    const d = rec.data;
    if (d.version !== version) problems.push(`${target}: proof is for version ${d.version}, not ${version}`);
    const checks = Array.isArray(d.checks) ? d.checks : [];
    if (!checks.length) problems.push(`${target}: proof has no checks`);
    for (const c of checks) if (!c || c.ok !== true) problems.push(`${target}: check "${c?.name ?? '?'}" failed${c?.detail ? `: ${c.detail}` : ''}`);
    if (d.ok !== true) problems.push(`${target}: proof says not ok`);
    const files = d.files && typeof d.files === 'object' ? d.files : {};
    for (const [name, hash] of Object.entries(files)) {
      if (!actual.has(name)) continue; // a file the proof made itself (a simulator build), not one we publish
      tested.add(name);
      if (String(hash).toLowerCase() !== actual.get(name)) problems.push(`${target}: ${name} is not the file that was tested (hash differs)`);
    }
    summary.push(`${target}: ${checks.filter((c) => c?.ok === true).length}/${checks.length} checks ok`);
  }
  for (const t of byTarget.keys()) if (!expect.includes(t)) summary.push(`${t}: extra proof, not required`);
  if (cover) for (const name of actual.keys()) if (cover.test(name) && !tested.has(name)) problems.push(`${name} would be published but no proof tested it`);
  return { ok: problems.length === 0, problems, summary };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = findProofs(args.proofs).map((file) => {
    try { return { file: basename(file), data: JSON.parse(readFileSync(file, 'utf8')) }; }
    catch (e) { return { file: basename(file), data: null }; }
  });
  const files = listFiles(args.files);
  const actual = new Map();
  for (const [name, p] of files) actual.set(name, await sha256File(p));
  const result = decide({ records, actual, expect: args.expect, version: args.version, cover: args.cover });
  const record = {
    version: args.version, decidedAt: new Date().toISOString(), ok: result.ok, expect: args.expect,
    summary: result.summary, problems: result.problems, files: Object.fromEntries(actual),
  };
  if (args.out) writeFileSync(args.out, JSON.stringify(record, null, 2));
  for (const line of result.summary) console.log(`  ${line}`);
  if (!result.ok) {
    for (const p of result.problems) console.log(`##vso[task.logissue type=error]${p}`);
    console.log(`Not published: ${result.problems.length} problem(s) in the proof for ${args.version}.`);
    process.exit(1);
  }
  console.log(`Gate open for ${args.version}: every expected proof passed on exactly these files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.log(`##vso[task.logissue type=error]${e.message}`); process.exit(1); });
}
