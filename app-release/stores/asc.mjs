// App Store Connect from the pipeline (pipelines/mobile.yml), through the App Store Connect API.
//
//   node app-release/stores/asc.mjs testflight --version 1.0.42 --build 1234 [--group "Early testers"]
//       waits until Apple has processed the upload, gives every App Store Connect user the build through the team
//       group, adds it to the early group (made when missing) and asks for the short beta review that a group outside
//       the account needs once per version
//   node app-release/stores/asc.mjs submit --version 1.0.42 --build 1234
//       puts that build on the App Store version, turns on the 7-day phased release, and sends it to review; once
//       Apple approves, it goes out by itself (release type AFTER_APPROVAL)
//   node app-release/stores/asc.mjs pause|resume --version 1.0.42     the App Store phased release, by hand
//   --app <key> works on another app of app-release.config.json (default main)
//
// The key comes from ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (Key Vault apple-asc-key-id, apple-asc-issuer-id,
// apple-asc-key-p8): one App Store Connect API key with the Admin role. Store texts and screenshots must exist
// before the first submit (asc-listing.mjs).
import { pathToFileURL } from 'node:url';
import { loadConfig, requireApp } from '../config.mjs';
import { appStoreConnectToken, call } from './jwt.mjs';
import { parseArgs } from './play.mjs';

const API = 'https://api.appstoreconnect.apple.com/v1';
export const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ref = (type, id) => ({ data: { type, id } });

export function ascClient(tokenFn, fetchImpl = fetch) {
  const go = (method, path, body) => call(fetchImpl, method, path.startsWith('http') ? path : `${API}${path}`, tokenFn(), body);
  return {
    get: (path) => go('GET', path),
    post: (path, body) => go('POST', path, body),
    patch: (path, body) => go('PATCH', path, body),
  };
}

export async function findApp(api, bundleId) {
  const { data } = await api.get(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=2`);
  const app = data.find((a) => a.attributes?.bundleId === bundleId);
  if (!app) throw new Error(`App Store Connect has no app with bundle id ${bundleId}. Create the app record first.`);
  return app.id;
}

// Apple needs a few minutes (sometimes much longer) after the upload before the build can be used.
export async function waitForBuild(api, appId, { version, build, timeoutMs = 90 * 60_000, pollMs = 60_000, wait = sleep }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { data } = await api.get(`/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}`
      + `&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=1`);
    const found = data[0];
    const state = found?.attributes?.processingState;
    if (state === 'VALID') return found.id;
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`Apple marked build ${build} as ${state}`);
    if (Date.now() >= deadline) throw new Error(`Build ${version} (${build}) was not processed by Apple in time (last state ${state ?? 'not visible yet'})`);
    await wait(pollMs);
  }
}

// Our own team sees every build straight away: an internal group with access to all builds, holding everyone with an
// App Store Connect account (internal testers must be App Store Connect users). No beta review is needed for them.
export async function teamGroup(api, appId, name) {
  if (!name) throw new Error('the team group needs a name (testflight.teamGroup)');
  const groups = await api.get(`/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(name)}&limit=5`);
  let group = groups.data.find((g) => g.attributes?.name === name);
  if (!group) {
    ({ data: group } = await api.post('/betaGroups', {
      data: { type: 'betaGroups', attributes: { name, isInternalGroup: true, hasAccessToAllBuilds: true },
        relationships: { app: ref('apps', appId) } },
    }));
  }
  const users = await api.get('/users?limit=200&fields[users]=username,firstName,lastName');
  let added = 0;
  for (const u of users.data) {
    const email = u.attributes?.username;
    if (!email || !email.includes('@')) continue;
    try {
      await api.post('/betaTesters', {
        data: { type: 'betaTesters', attributes: { email, firstName: u.attributes.firstName ?? '', lastName: u.attributes.lastName ?? '' },
          relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } } },
      });
      added++;
    } catch (e) {
      if (e.status !== 409) throw e; // already a tester in this group
    }
  }
  return { group: group.id, added };
}

export async function testflight(api, appId, buildId, groupName, teamGroupName) {
  // The team group sees every build by itself (hasAccessToAllBuilds): nothing to add, no review.
  if (groupName === teamGroupName) return { group: null, review: 'not needed' };
  const groups = await api.get(`/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(groupName)}&limit=5`);
  let group = groups.data.find((g) => g.attributes?.name === groupName);
  if (!group) {
    ({ data: group } = await api.post('/betaGroups', {
      data: { type: 'betaGroups', attributes: { name: groupName }, relationships: { app: ref('apps', appId) } },
    }));
  }
  try {
    await api.post(`/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: buildId }] });
  } catch (e) {
    // Apple sometimes answers 404 for a build it has just processed, before it is open to outside testers. The team
    // group already has the build, so this only delays the outside group until the next run.
    if (e.status === 404) return { group: group.id, review: `not sent: build not yet available for this group (${e.message})` };
    throw e;
  }
  if (group.attributes?.isInternalGroup) return { group: group.id, review: 'not needed' };
  try {
    await api.post('/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: ref('builds', buildId) } } });
    return { group: group.id, review: 'submitted' };
  } catch (e) {
    // A second build of an already approved version needs no new beta review; Apple answers 409 for that.
    if (e.status === 409) return { group: group.id, review: 'already approved or waiting' };
    // Missing test information (beta description, contact) blocks only the outside group; the team still has the build.
    if (e.status === 422) return { group: group.id, review: `not sent: ${e.message}` };
    throw e;
  }
}

export async function submit(api, appId, buildId, version) {
  const versions = await api.get(`/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`);
  let target = versions.data.find((v) => EDITABLE.includes(v.attributes?.appStoreState ?? v.attributes?.appVersionState));
  if (target && target.attributes.versionString !== version) {
    ({ data: target } = await api.patch(`/appStoreVersions/${target.id}`, {
      data: { type: 'appStoreVersions', id: target.id, attributes: { versionString: version } },
    }));
  }
  if (!target) {
    ({ data: target } = await api.post('/appStoreVersions', {
      data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: version, releaseType: 'AFTER_APPROVAL' },
        relationships: { app: ref('apps', appId) } },
    }));
  }
  await api.patch(`/appStoreVersions/${target.id}/relationships/build`, ref('builds', buildId));
  const phased = await api.get(`/appStoreVersions/${target.id}/appStoreVersionPhasedRelease`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
  if (!phased?.data) {
    await api.post('/appStoreVersionPhasedReleases', {
      data: { type: 'appStoreVersionPhasedReleases', attributes: { phasedReleaseState: 'INACTIVE' },
        relationships: { appStoreVersion: ref('appStoreVersions', target.id) } },
    });
  }
  const open = await api.get(`/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=1`);
  let submission = open.data[0];
  if (!submission) {
    ({ data: submission } = await api.post('/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: ref('apps', appId) } },
    }));
  }
  try {
    await api.post('/reviewSubmissionItems', {
      data: { type: 'reviewSubmissionItems', relationships: {
        reviewSubmission: ref('reviewSubmissions', submission.id), appStoreVersion: ref('appStoreVersions', target.id) } },
    });
  } catch (e) {
    if (e.status !== 409) throw e; // already on this submission
  }
  await api.patch(`/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } });
  return { version: target.id, submission: submission.id };
}

/**
 * Pauses (or resumes) the 7-day phased release of a version that is live in the App Store (the roll-out watch's brake,
 * docs/app-testing.md). Apple allows 30 days of pause in total. Returns the new state, or null when the version has no
 * phased release running.
 */
export async function phased(api, appId, version, state) {
  if (!['PAUSED', 'ACTIVE'].includes(state)) throw new Error('state must be PAUSED or ACTIVE');
  const versions = await api.get(`/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(version)}&limit=1`);
  const target = versions.data[0];
  if (!target) return null;
  const current = await api.get(`/appStoreVersions/${target.id}/appStoreVersionPhasedRelease`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
  const release = current?.data;
  if (!release || !['ACTIVE', 'PAUSED'].includes(release.attributes?.phasedReleaseState)) return null;
  if (release.attributes.phasedReleaseState === state) return state;
  await api.patch(`/appStoreVersionPhasedReleases/${release.id}`, {
    data: { type: 'appStoreVersionPhasedReleases', id: release.id, attributes: { phasedReleaseState: state } },
  });
  return state;
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const { bundleId } = requireApp(config, opts.app ?? 'main', ['bundleId']);
  const key = { keyId: process.env.ASC_KEY_ID, issuerId: process.env.ASC_ISSUER_ID, privateKey: process.env.ASC_KEY_P8 };
  const api = ascClient(() => appStoreConnectToken(key));
  if (command === 'pause' || command === 'resume') {
    if (!opts.version) throw new Error('--version is needed');
    const appId = await findApp(api, bundleId);
    const state = await phased(api, appId, opts.version, command === 'pause' ? 'PAUSED' : 'ACTIVE');
    console.log(state ? `Phased release of ${opts.version}: ${state}` : `${opts.version} has no phased release running`);
    return;
  }
  if (!opts.version || !opts.build) throw new Error('--version and --build are needed');
  const appId = await findApp(api, bundleId);
  const buildId = await waitForBuild(api, appId, { version: opts.version, build: opts.build });
  if (command === 'testflight') {
    const { teamGroup: team, earlyGroup } = config.testflight;
    const added = await teamGroup(api, appId, team);
    console.log(`TestFlight group "${team}" gets every build; ${added.added} App Store Connect user(s) added as tester`);
    const group = opts.group ?? earlyGroup;
    const r = await testflight(api, appId, buildId, group, team);
    if (r.review.startsWith('not sent')) console.log(`##vso[task.logissue type=warning]Beta review for group ${group} ${r.review}`);
    console.log(`Build ${opts.version} (${opts.build}) is in TestFlight group ${group}; beta review ${r.review}`);
  } else if (command === 'submit') {
    await submit(api, appId, buildId, opts.version);
    console.log(`Version ${opts.version} with build ${opts.build} is sent to App Store review; it goes out by itself in 7 days after approval`);
  } else {
    throw new Error('Use testflight, submit, pause or resume');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`##vso[task.logissue type=error]${e.message}`); process.exit(1); });
}
