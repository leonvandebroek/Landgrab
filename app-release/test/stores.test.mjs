import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appStoreConnectToken, googleAccessToken, call } from '../stores/jwt.mjs';
import { playClient, upload, promote, finish, halt, vitals, newestRelease, parseArgs } from '../stores/play.mjs';
const TEAM = 'Example team';
const PKG = 'com.example.app';
import { ascClient, findApp, waitForBuild, testflight, teamGroup, submit, phased } from '../stores/asc.mjs';

// A fake HTTP server: routes are "METHOD path-without-query" -> (body, url) => [status, json].
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname}`;
    calls.push({ key, url, init, body: typeof init.body === 'string' && init.headers?.['content-type'] === 'application/json' ? JSON.parse(init.body) : init.body });
    const route = routes[key];
    if (!route) return new Response(JSON.stringify({ error: { message: `no route ${key}` } }), { status: 404 });
    const [status, json] = route(calls.at(-1).body, u);
    return new Response(json === undefined || status === 204 ? null : JSON.stringify(json), { status });
  };
  return { impl, calls };
}

test('App Store Connect token is a valid ES256 JWT for 15 minutes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = appStoreConnectToken({ keyId: 'K1', issuerId: 'I1', privateKey: pem }, 1_700_000_000_000);
  const [h, c, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'K1', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 900);
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  assert.throws(() => appStoreConnectToken({ keyId: 'K1', issuerId: '', privateKey: pem }));
});

test('Google token exchange signs RS256 and refuses a non service account', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { type: 'service_account', client_email: 'ci@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), private_key_id: 'abc' };
  const fake = fakeFetch({ 'POST /token': (body) => {
    const assertion = new URLSearchParams(body).get('assertion');
    const [h, c, s] = assertion.split('.');
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url')));
    assert.equal(JSON.parse(Buffer.from(c, 'base64url')).scope, 'scope-x');
    return [200, { access_token: 'tok' }];
  } });
  assert.equal(await googleAccessToken(JSON.stringify(account), 'scope-x', fake.impl), 'tok');
  await assert.rejects(() => googleAccessToken({ type: 'authorized_user' }, 's', fake.impl), /service account/);
});

test('call() names the request and the store answer, never the token', async () => {
  const fake = fakeFetch({ 'GET /v1/x': () => [403, { errors: [{ title: 'Forbidden', detail: 'role too low' }] }] });
  await assert.rejects(() => call(fake.impl, 'GET', 'https://api.example/v1/x?secret=1', 'TOKEN'), (e) => {
    assert.match(e.message, /GET https:\/\/api.example\/v1\/x answered 403: Forbidden: role too low/);
    assert.doesNotMatch(e.message, /TOKEN|secret/);
    return e.status === 403;
  });
});

function playRoutes(tracks) {
  const base = '/androidpublisher/v3/applications/com.example.app';
  return {
    [`POST ${base}/edits`]: () => [200, { id: 'e1' }],
    [`POST /upload${base}/edits/e1/bundles`]: () => [200, { versionCode: 4711 }],
    [`GET ${base}/edits/e1/tracks/internal`]: () => [200, tracks.internal ?? { releases: [] }],
    [`GET ${base}/edits/e1/tracks/production`]: () => [200, tracks.production ?? { releases: [] }],
    [`PUT ${base}/edits/e1/tracks/internal`]: (b) => { tracks.internal = b; return [200, b]; },
    [`PUT ${base}/edits/e1/tracks/production`]: (b) => { tracks.production = b; return [200, b]; },
    [`POST ${base}/edits/e1:commit`]: () => [200, { id: 'e1' }],
  };
}

test('Play upload puts the bundle on the track and commits the edit', async () => {
  const tracks = {};
  const fake = fakeFetch(playRoutes(tracks));
  const code = await upload(playClient('t', fake.impl, PKG), { bytes: new Uint8Array([1, 2, 3]), track: 'internal', name: '1.0.9' });
  assert.equal(code, '4711');
  assert.deepEqual(tracks.internal.releases, [{ name: '1.0.9', versionCodes: ['4711'], status: 'completed' }]);
  assert.equal(fake.calls.at(-1).key.endsWith(':commit'), true);
  assert.equal(fake.calls[1].init.headers['content-type'], 'application/octet-stream');
});

test('Play promote takes the newest internal release to production at 20%, finish takes it to everyone', async () => {
  const tracks = { internal: { releases: [{ name: 'old', versionCodes: ['10'], status: 'completed' }, { name: 'new', versionCodes: ['12'], status: 'completed' }] } };
  const client = playClient('t', fakeFetch(playRoutes(tracks)).impl, PKG);
  assert.deepEqual(await promote(client, { from: 'internal', to: 'production', fraction: 0.2 }), ['12']);
  assert.deepEqual(tracks.production.releases[0], { name: 'new', versionCodes: ['12'], status: 'inProgress', userFraction: 0.2 });
  assert.deepEqual(await finish(client, { track: 'production' }), ['12']);
  assert.equal(tracks.production.releases[0].status, 'completed');
  assert.equal(await finish(client, { track: 'production' }), null);
  tracks.production = { releases: [{ name: 'x', versionCodes: ['12'], status: 'halted' }] };
  assert.equal(await finish(client, { track: 'production' }), null, 'a halted roll-out stays halted');
});

test('Play promote with nothing on the source track stops', async () => {
  const client = playClient('t', fakeFetch(playRoutes({})).impl, PKG);
  await assert.rejects(() => promote(client, { from: 'internal', to: 'production', fraction: 1 }), /no release on the internal track/);
  assert.equal(newestRelease(null), null);
});

test('parseArgs reads --key value pairs and refuses loose words', () => {
  assert.deepEqual(parseArgs(['upload', '--aab', 'a.aab', '--track', 'internal']), { command: 'upload', opts: { aab: 'a.aab', track: 'internal' } });
  assert.throws(() => parseArgs(['upload', 'oops']));
});

function ascRoutes(state) {
  return {
    'GET /v1/apps': () => [200, { data: [{ id: 'app1', attributes: { bundleId: 'com.example.app' } }] }],
    'GET /v1/builds': () => [200, { data: state.builds.length ? [state.builds.shift()] : [] }],
    'GET /v1/betaGroups': () => [200, { data: state.groups }],
    'POST /v1/betaGroups': (b) => { const g = { id: 'g-new', attributes: b.data.attributes }; state.groups.push(g); return [201, { data: g }]; },
    'POST /v1/betaGroups/g-new/relationships/builds': (b) => { state.added = b; return [204]; },
    'POST /v1/betaAppReviewSubmissions': () => [state.betaStatus ?? 201, { data: { id: 'br1' } }],
    'GET /v1/apps/app1/appStoreVersions': () => [200, { data: state.versions }],
    'POST /v1/appStoreVersions': (b) => { state.createdVersion = b; return [201, { data: { id: 'v-new', attributes: b.data.attributes } }]; },
    'PATCH /v1/appStoreVersions/v1': (b) => { state.renamed = b; return [200, { data: { id: 'v1', attributes: b.data.attributes } }]; },
    'PATCH /v1/appStoreVersions/v1/relationships/build': (b) => { state.build = b; return [204]; },
    'PATCH /v1/appStoreVersions/v-new/relationships/build': (b) => { state.build = b; return [204]; },
    'GET /v1/appStoreVersions/v1/appStoreVersionPhasedRelease': () => [200, { data: null }],
    'GET /v1/appStoreVersions/v-new/appStoreVersionPhasedRelease': () => [200, { data: null }],
    'POST /v1/appStoreVersionPhasedReleases': (b) => { state.phased = b; return [201, { data: { id: 'p1' } }]; },
    'GET /v1/reviewSubmissions': () => [200, { data: [] }],
    'POST /v1/reviewSubmissions': () => [201, { data: { id: 'rs1' } }],
    'POST /v1/reviewSubmissionItems': (b) => { state.item = b; return [201, { data: { id: 'i1' } }]; },
    'PATCH /v1/reviewSubmissions/rs1': (b) => { state.submitted = b.data.attributes.submitted; return [200, { data: { id: 'rs1' } }]; },
  };
}

test('waitForBuild polls until Apple has processed the build, and stops on a failed one', async () => {
  const state = { builds: [{ id: 'b1', attributes: { processingState: 'PROCESSING' } }, { id: 'b1', attributes: { processingState: 'VALID' } }] };
  const api = ascClient(() => 't', fakeFetch(ascRoutes(state)).impl);
  let waits = 0;
  assert.equal(await waitForBuild(api, 'app1', { version: '1.0.2', build: '99', wait: async () => { waits++; } }), 'b1');
  assert.equal(waits, 1);
  state.builds = [{ id: 'b2', attributes: { processingState: 'INVALID' } }];
  await assert.rejects(() => waitForBuild(api, 'app1', { version: '1.0.2', build: '99', wait: async () => {} }), /INVALID/);
  state.builds = [];
  await assert.rejects(() => waitForBuild(api, 'app1', { version: '1.0.2', build: '99', timeoutMs: 0, wait: async () => {} }), /not processed/);
});

test('testflight makes the early group once, adds the build and asks for the beta review', async () => {
  const state = { builds: [], groups: [] };
  const api = ascClient(() => 't', fakeFetch(ascRoutes(state)).impl);
  assert.equal(await findApp(api, 'com.example.app'), 'app1');
  assert.deepEqual(await testflight(api, 'app1', 'b1', 'Early testers', TEAM), { group: 'g-new', review: 'submitted' });
  assert.deepEqual(state.added, { data: [{ type: 'builds', id: 'b1' }] });
  state.betaStatus = 409;
  assert.equal((await testflight(api, 'app1', 'b1', 'Early testers', TEAM)).review, 'already approved or waiting');
});

test('the team group is internal, sees every build and holds every App Store Connect user once', async () => {
  const state = { builds: [], groups: [], testers: [] };
  const routes = {
    ...ascRoutes(state),
    'GET /v1/users': () => [200, { data: [{ id: 'u1', attributes: { username: 'owner@example.com', firstName: 'A', lastName: 'B' } },
      { id: 'u2', attributes: { username: 'not-an-email' } }] }],
    'POST /v1/betaTesters': (b) => { if (state.testers.includes(b.data.attributes.email)) return [409, { errors: [{ detail: 'exists' }] }];
      state.testers.push(b.data.attributes.email); state.testerGroup = b.data.relationships.betaGroups.data[0].id; return [201, { data: { id: 't1' } }]; },
  };
  const api = ascClient(() => 't', fakeFetch(routes).impl);
  assert.deepEqual(await teamGroup(api, 'app1', TEAM), { group: 'g-new', added: 1 });
  assert.equal(state.groups[0].attributes.name, TEAM);
  assert.equal(state.groups[0].attributes.isInternalGroup, true);
  assert.equal(state.groups[0].attributes.hasAccessToAllBuilds, true);
  assert.deepEqual(state.testers, ['owner@example.com']);
  assert.equal(state.testerGroup, 'g-new');
  assert.deepEqual(await teamGroup(api, 'app1', TEAM), { group: 'g-new', added: 0 });
  assert.equal(state.groups.length, 1);
});

test('testflight keeps going when the outside group still misses its test information', async () => {
  const state = { builds: [], groups: [], betaStatus: 422 };
  const api = ascClient(() => 't', fakeFetch(ascRoutes(state)).impl);
  assert.match((await testflight(api, 'app1', 'b1', 'Early testers', TEAM)).review, /^not sent: /);
});

test('testflight keeps going when Apple does not yet offer the build to the outside group', async () => {
  const state = { builds: [], groups: [] };
  const routes = { ...ascRoutes(state), 'POST /v1/betaGroups/g-new/relationships/builds': () => [404, { errors: [{ detail: 'no build' }] }] };
  const api = ascClient(() => 't', fakeFetch(routes).impl);
  assert.match((await testflight(api, 'app1', 'b1', 'Early testers', TEAM)).review, /^not sent: build not yet available/);
});

test('submit creates the version with phased release and sends it to review', async () => {
  const state = { builds: [], groups: [], versions: [{ id: 'v0', attributes: { versionString: '1.0.1', appStoreState: 'READY_FOR_SALE' } }] };
  const api = ascClient(() => 't', fakeFetch(ascRoutes(state)).impl);
  await submit(api, 'app1', 'b7', '1.0.2');
  assert.equal(state.createdVersion.data.attributes.releaseType, 'AFTER_APPROVAL');
  assert.deepEqual(state.build, { data: { type: 'builds', id: 'b7' } });
  assert.equal(state.phased.data.attributes.phasedReleaseState, 'INACTIVE');
  assert.equal(state.item.data.relationships.appStoreVersion.data.id, 'v-new');
  assert.equal(state.submitted, true);
});

test('submit reuses an editable version (for example after a rejection) and renames it', async () => {
  const state = { builds: [], groups: [], versions: [{ id: 'v1', attributes: { versionString: '1.0.1', appStoreState: 'REJECTED' } }] };
  const api = ascClient(() => 't', fakeFetch(ascRoutes(state)).impl);
  await submit(api, 'app1', 'b8', '1.0.3');
  assert.equal(state.createdVersion, undefined);
  assert.equal(state.renamed.data.attributes.versionString, '1.0.3');
  assert.equal(state.item.data.relationships.appStoreVersion.data.id, 'v1');
});

test('Play halt stops a staged roll-out and leaves a finished one alone', async () => {
  const tracks = { production: { releases: [{ name: 'new', versionCodes: ['12'], status: 'inProgress', userFraction: 0.2 }] } };
  const client = playClient('t', fakeFetch(playRoutes(tracks)).impl, PKG);
  assert.deepEqual(await halt(client, { track: 'production' }), ['12']);
  assert.equal(tracks.production.releases[0].status, 'halted');
  assert.equal(tracks.production.releases[0].userFraction, 0.2);
  assert.equal(await halt(client, { track: 'production' }), null);
});

test('Play vitals turn crash rates per version code into started and crashed users', async () => {
  const fake = fakeFetch({ 'POST /v1beta1/apps/com.example.app/crashRateMetricSet:query': (body) => {
    assert.deepEqual(body.dimensions, ['versionCode']);
    return [200, { rows: [
      { dimensions: [{ dimension: 'versionCode', stringValue: '12' }], metrics: [{ metric: 'crashRate', decimalValue: { value: '0.25' } }, { metric: 'distinctUsers', decimalValue: { value: '4' } }] },
      { dimensions: [{ dimension: 'versionCode', stringValue: '12' }], metrics: [{ metric: 'crashRate', decimalValue: { value: '0' } }, { metric: 'distinctUsers', decimalValue: { value: '6' } }] },
      { dimensions: [{ dimension: 'versionCode', stringValue: '11' }], metrics: [{ metric: 'crashRate', decimalValue: { value: '0.01' } }, { metric: 'distinctUsers', decimalValue: { value: '100' } }] },
    ] }];
  } });
  const health = await vitals('t', fake.impl, 'com.example.app', new Date('2026-11-20T03:00:00Z'));
  assert.deepEqual(health.versions.find((v) => v.version === '12'), { version: '12', started: 10, crashed: 1 });
  assert.deepEqual(health.versions.find((v) => v.version === '11'), { version: '11', started: 100, crashed: 1 });
});

test('App Store phased release pauses and resumes, and does nothing without one running', async () => {
  let state = 'ACTIVE';
  const patches = [];
  const routes = {
    'GET /v1/apps/app1/appStoreVersions': () => [200, { data: [{ id: 'v1', attributes: { versionString: '1.0.9' } }] }],
    'GET /v1/appStoreVersions/v1/appStoreVersionPhasedRelease': () => [200, { data: { id: 'p1', attributes: { phasedReleaseState: state } } }],
    'PATCH /v1/appStoreVersionPhasedReleases/p1': (body) => { patches.push(body); state = body.data.attributes.phasedReleaseState; return [200, { data: {} }]; },
  };
  const api = ascClient(() => 't', fakeFetch(routes).impl);
  assert.equal(await phased(api, 'app1', '1.0.9', 'PAUSED'), 'PAUSED');
  assert.equal(state, 'PAUSED');
  assert.equal(await phased(api, 'app1', '1.0.9', 'PAUSED'), 'PAUSED');
  assert.equal(patches.length, 1, 'already paused: no second call');
  assert.equal(await phased(api, 'app1', '1.0.9', 'ACTIVE'), 'ACTIVE');
  state = 'COMPLETE';
  assert.equal(await phased(api, 'app1', '1.0.9', 'PAUSED'), null);
  await assert.rejects(() => phased(api, 'app1', '1.0.9', 'GONE'), /PAUSED or ACTIVE/);
});

test('testflight to the team group itself adds nothing and asks no review (it already sees every build)', async () => {
  const calls = [];
  const api = { get: async (p) => { calls.push(p); return { data: [] }; }, post: async (p) => { calls.push(p); return { data: {} }; } };
  assert.deepEqual(await testflight(api, 'app1', 'b1', TEAM, TEAM), { group: null, review: 'not needed' });
  assert.deepEqual(calls, []);
});
