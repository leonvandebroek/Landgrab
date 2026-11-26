// Firebase Test Lab helpers for testlab.sh: picks two phones from `gcloud firebase test android models list
// --format=json` and reads the outcome of `gcloud firebase test android run --format=json`.
//   node testlab-outcome.mjs models <models.json>   -> prints "--device" values, one per line (always two)
//   node testlab-outcome.mjs outcome <run.json> <out.tsv> -> writes checks TSV, exit 0 only when all passed
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Used when the models list cannot be read at run time. */
export const FALLBACK_DEVICES = ['model=dm1q,version=34,locale=en,orientation=portrait', 'model=panther,version=34,locale=en,orientation=portrait'];

function newest(model) {
  const versions = (model.supportedVersionIds || []).map(Number).filter(Number.isFinite);
  return versions.length ? Math.max(...versions) : 0;
}

function usable(m) {
  const tags = m.tags || [];
  return m.form === undefined || m.form === 'PHYSICAL' ? !tags.includes('deprecated') && !tags.includes('unsupported') : false;
}

/** One current Samsung and one current Pixel (physical, not deprecated); highest Android version first. */
export function pickDevices(list) {
  const models = Array.isArray(list) ? list.filter(usable) : [];
  const best = (pred) => models.filter(pred).sort((a, b) => newest(b) - newest(a) || String(b.name).localeCompare(String(a.name)))[0];
  const samsung = best((m) => /samsung/i.test(m.manufacturer || ''));
  const pixel = best((m) => /google/i.test(m.manufacturer || '') && /^pixel/i.test(m.name || ''));
  const fmt = (m) => `model=${m.id},version=${newest(m)},locale=en,orientation=portrait`;
  return [samsung ? fmt(samsung) : FALLBACK_DEVICES[0], pixel ? fmt(pixel) : FALLBACK_DEVICES[1]];
}

/**
 * gcloud --format=json prints one entry per device: { axis_value, outcome, test_details }. Only "Passed" passes.
 * A crash shows up as Failed; Inconclusive, Skipped, Flaky, an empty answer or fewer than `minDevices` entries fail.
 */
export function parseOutcome(text, minDevices = 2) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [{ name: 'testlab-result', ok: false, detail: 'gcloud printed no JSON result (the matrix did not finish)' }];
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (!rows.length) return [{ name: 'testlab-result', ok: false, detail: 'gcloud returned no device results' }];
  const checks = rows.map((r) => {
    const outcome = String(r.outcome || 'Unknown');
    const detail = `${outcome}${r.test_details ? `: ${r.test_details}` : ''}`;
    return { name: `testlab-${r.axis_value || 'device'}`, ok: outcome === 'Passed', detail };
  });
  if (rows.length < minDevices) checks.push({ name: 'testlab-devices', ok: false, detail: `${rows.length} device result(s), expected ${minDevices}` });
  return checks;
}

export function toTsv(checks) {
  return checks.map((c) => `${c.name}\t${c.ok ? 'ok' : 'fail'}\t${String(c.detail).replace(/[\t\n]+/g, ' ')}`).join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, input, out] = process.argv.slice(2);
  let text = '';
  try { text = readFileSync(input, 'utf8'); } catch { /* handled below */ }
  if (cmd === 'models') {
    let list = [];
    try { list = JSON.parse(text); } catch { /* fallback */ }
    console.log(pickDevices(list).join('\n'));
  } else if (cmd === 'outcome') {
    const checks = parseOutcome(text);
    writeFileSync(out, toTsv(checks));
    for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name} ${c.detail}`);
    process.exit(checks.every((c) => c.ok) ? 0 : 1);
  } else {
    console.error('usage: testlab-outcome.mjs models <file> | outcome <file> <out.tsv>');
    process.exit(2);
  }
}
