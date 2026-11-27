// Builds proof-<target>.json (the release-gates skill) from a TSV of checks. Pure functions plus a tiny CLI:
//   node proof.mjs --target ios --version 1.0.5 --checks checks.tsv --file name=sha256 ... --out proof.json
// TSV line: name<TAB>ok|fail<TAB>detail. No checks, no files or a missing version is a failed proof.
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseChecks(tsv) {
  return tsv
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const [name, status, ...rest] = line.split('\t');
      return { name, ok: status === 'ok', detail: rest.join('\t') };
    });
}

export function buildProof({ target, version, files, checks }) {
  const all = [...checks];
  if (!version) all.push({ name: 'version', ok: false, detail: 'APP_VERSION is not set' });
  if (!Object.keys(files).length) all.push({ name: 'files', ok: false, detail: 'no file was hashed' });
  if (!checks.length) all.push({ name: 'checks', ok: false, detail: 'no check ran' });
  return { target, version: version || '', files, checks: all, ok: all.length > 0 && all.every((c) => c.ok === true) };
}

function args(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === `--${name}`) out.push(process.argv[i + 1]); });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = {};
  for (const f of args('file')) {
    const i = f.lastIndexOf('=');
    files[f.slice(0, i)] = f.slice(i + 1);
  }
  let tsv = '';
  try { tsv = readFileSync(args('checks')[0], 'utf8'); } catch { /* no checks file: failed proof */ }
  const proof = buildProof({ target: args('target')[0], version: args('version')[0] || '', files, checks: parseChecks(tsv) });
  writeFileSync(args('out')[0], JSON.stringify(proof, null, 2) + '\n');
  console.log(`Proof ${proof.target}: ${proof.ok ? 'OK' : 'NOT OK'} (${proof.checks.filter((c) => c.ok).length}/${proof.checks.length} checks)`);
  process.exit(proof.ok ? 0 : 1);
}
