// Google Play from the pipeline (pipelines/mobile.yml), through the Android Publisher API v3.
//
//   node app-release/stores/play.mjs upload  --aab <file> --track internal --name <release name>
//   node app-release/stores/play.mjs promote --from internal --to production --fraction 0.2
//   node app-release/stores/play.mjs finish  --track production
//   node app-release/stores/play.mjs halt    --track production       (the roll-out watch: nobody new gets it)
//   node app-release/stores/play.mjs staged  --track production       (prints the staged version code, or nothing)
//   node app-release/stores/play.mjs vitals  --out health.json         (crash numbers per version code, for the watch)
//   --app <key> works on another app of app-release.config.json (default main)
//
// The service account comes from PLAY_SERVICE_ACCOUNT_JSON (Key Vault secret play-service-account-json). It must be
// invited in Play Console (Users and permissions) with the right to release to testing and production tracks.
// Google wants the very first bundle of a new app uploaded by hand; after that every call here works.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, requireApp } from '../config.mjs';
import { call, googleAccessToken } from './jwt.mjs';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export function playClient(token, fetchImpl, packageName) {
  if (!packageName) throw new Error('the Android package name is needed (apps.<key>.androidPackage)');
  const base = `${API}/${packageName}`;
  return {
    async edit(work) {
      const { id } = await call(fetchImpl, 'POST', `${base}/edits`, token, {});
      const result = await work({
        id,
        getTrack: (track) => call(fetchImpl, 'GET', `${base}/edits/${id}/tracks/${track}`, token),
        putTrack: (track, releases) => call(fetchImpl, 'PUT', `${base}/edits/${id}/tracks/${track}`, token, { track, releases }),
        uploadBundle: (bytes) => call(fetchImpl, 'POST', `${UPLOAD}/${packageName}/edits/${id}/bundles?uploadType=media`, token,
          bytes, { 'content-type': 'application/octet-stream' }),
      });
      await call(fetchImpl, 'POST', `${base}/edits/${id}:commit`, token);
      return result;
    },
  };
}

// The newest release on a track: highest version code first.
export function newestRelease(track) {
  const releases = (track?.releases ?? []).filter((r) => (r.versionCodes ?? []).length > 0);
  releases.sort((a, b) => Math.max(...b.versionCodes.map(Number)) - Math.max(...a.versionCodes.map(Number)));
  return releases[0] ?? null;
}

export async function upload(client, { bytes, track, name }) {
  return client.edit(async (edit) => {
    const bundle = await edit.uploadBundle(bytes);
    const versionCode = String(bundle.versionCode);
    await edit.putTrack(track, [{ name, versionCodes: [versionCode], status: 'completed' }]);
    return versionCode;
  });
}

export async function promote(client, { from, to, fraction }) {
  return client.edit(async (edit) => {
    const release = newestRelease(await edit.getTrack(from));
    if (!release) throw new Error(`There is no release on the ${from} track to promote`);
    const staged = fraction > 0 && fraction < 1;
    await edit.putTrack(to, [{
      name: release.name, versionCodes: release.versionCodes, ...(release.releaseNotes ? { releaseNotes: release.releaseNotes } : {}),
      status: staged ? 'inProgress' : 'completed', ...(staged ? { userFraction: fraction } : {}),
    }]);
    return release.versionCodes;
  });
}

// Takes a staged roll-out to everyone. A halted roll-out (someone pressed "halt" in Play Console) is left alone.
export async function finish(client, { track }) {
  return client.edit(async (edit) => {
    const current = await edit.getTrack(track);
    const release = (current.releases ?? []).find((r) => r.status === 'inProgress');
    if (!release) return null;
    await edit.putTrack(track, [{ name: release.name, versionCodes: release.versionCodes,
      ...(release.releaseNotes ? { releaseNotes: release.releaseNotes } : {}), status: 'completed' }]);
    return release.versionCodes;
  });
}

// Stops a staged roll-out: people who have the version keep it, nobody new gets it (resume in Play Console).
export async function halt(client, { track }) {
  return client.edit(async (edit) => {
    const current = await edit.getTrack(track);
    const release = (current.releases ?? []).find((r) => r.status === 'inProgress');
    if (!release) return null;
    await edit.putTrack(track, [{ ...release, status: 'halted' }]);
    return release.versionCodes;
  });
}

const REPORTING = 'https://playdeveloperreporting.googleapis.com/v1beta1/apps';
export const REPORTING_SCOPE = 'https://www.googleapis.com/auth/playdeveloperreporting';

/**
 * Crash numbers of the last two full days per version code (Play Developer Reporting API, crashRateMetricSet), in the
 * shape deploy/apps/rollout-watch.mjs reads: { versions: [{ version, started, crashed }] } with started = distinct users
 * and crashed = users who saw a crash. Play's numbers lag about a day; no row means nobody yet.
 */
export async function vitals(token, fetchImpl, packageName, now = new Date()) {
  const day = (offset) => { const d = new Date(now.getTime() - offset * 86_400_000); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }; };
  const body = {
    timelineSpec: { aggregationPeriod: 'DAILY', startTime: { ...day(3), timeZone: { id: 'America/Los_Angeles' } }, endTime: { ...day(1), timeZone: { id: 'America/Los_Angeles' } } },
    dimensions: ['versionCode'], metrics: ['crashRate', 'distinctUsers'], pageSize: 1000,
  };
  const res = await call(fetchImpl, 'POST', `${REPORTING}/${packageName}/crashRateMetricSet:query`, token, body);
  const byVersion = new Map();
  for (const row of res.rows ?? []) {
    const version = row.dimensions?.find((d) => d.dimension === 'versionCode')?.stringValue;
    if (!version) continue;
    const metric = (name) => Number(row.metrics?.find((m) => m.metric === name)?.decimalValue?.value ?? 0);
    const users = metric('distinctUsers');
    const acc = byVersion.get(version) ?? { version, started: 0, crashed: 0 };
    acc.started += users;
    acc.crashed += Math.round(metric('crashRate') * users);
    byVersion.set(version, acc);
  }
  return { versions: [...byVersion.values()] };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`Unexpected argument ${rest[i]}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, opts };
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  const { androidPackage } = requireApp(loadConfig(), opts.app ?? 'main', ['androidPackage']);
  if (command === 'vitals') {
    const reportingToken = await googleAccessToken(process.env.PLAY_SERVICE_ACCOUNT_JSON ?? '', REPORTING_SCOPE);
    const health = await vitals(reportingToken, fetch, androidPackage);
    const json = JSON.stringify(health, null, 2);
    if (opts.out) (await import('node:fs')).writeFileSync(opts.out, json);
    console.log(json);
    return;
  }
  const token = await googleAccessToken(process.env.PLAY_SERVICE_ACCOUNT_JSON ?? '', SCOPE);
  const client = playClient(token, fetch, androidPackage);
  if (command === 'staged') {
    // Prints the version code of the staged (inProgress) release, or nothing.
    const code = await client.edit(async (edit) => {
      const release = ((await edit.getTrack(opts.track ?? 'production')).releases ?? []).find((r) => r.status === 'inProgress');
      return release ? Math.max(...release.versionCodes.map(Number)) : null;
    });
    if (code !== null) console.log(String(code));
    return;
  }
  if (command === 'halt') {
    const codes = await halt(client, { track: opts.track ?? 'production' });
    console.log(codes ? `Roll-out of ${codes.join(', ')} halted: nobody new gets it` : 'No staged roll-out to halt');
    return;
  }
  if (command === 'upload') {
    const code = await upload(client, { bytes: readFileSync(opts.aab), track: opts.track ?? 'internal', name: opts.name ?? '' });
    console.log(`Uploaded version code ${code} to the ${opts.track ?? 'internal'} track`);
  } else if (command === 'promote') {
    const fraction = Number(opts.fraction ?? '1');
    if (!(fraction > 0 && fraction <= 1)) throw new Error('--fraction must be above 0 and at most 1');
    const codes = await promote(client, { from: opts.from ?? 'internal', to: opts.to ?? 'production', fraction });
    console.log(`Released ${codes.join(', ')} on ${opts.to ?? 'production'} to ${Math.round(fraction * 100)}% of devices`);
  } else if (command === 'finish') {
    const codes = await finish(client, { track: opts.track ?? 'production' });
    console.log(codes ? `Roll-out of ${codes.join(', ')} now reaches everyone` : 'No staged roll-out to finish');
  } else {
    throw new Error('Use upload, promote, finish, halt, staged or vitals');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`##vso[task.logissue type=error]${e.message}`); process.exit(1); });
}
