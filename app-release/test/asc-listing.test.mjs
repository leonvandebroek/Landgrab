import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readStore as readFolder, run, client, verify, imageSize, ensureAppId, LIMITS, SIZES } from '../stores/asc-listing.mjs';
import { makeStore } from './fixture-store.mjs';
import { ascClient } from '../stores/asc.mjs';
import { call } from '../stores/jwt.mjs';

const STORE = makeStore();
const readStore = (dir = STORE) => readFolder(dir);

// A fake App Store Connect: "METHOD path" -> (body, url) => [status, json]; a path may end in * to match a prefix.
function fakeApple(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname.replace(/^\/v1/, '')}`;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ key, body });
    const route = routes[key] ?? Object.entries(routes).find(([k]) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))?.[1];
    if (!route) return new Response(JSON.stringify({ errors: [{ title: 'no route', detail: key }] }), { status: 404 });
    const [status, json] = route(body, u);
    return new Response(status === 204 ? null : JSON.stringify(json ?? {}), { status });
  };
  const api = { ...ascClient(() => 't', impl), delete: (path) => call(impl, 'DELETE', `https://api.appstoreconnect.apple.com/v1${path}`, 't') };
  return { api, impl, calls };
}

test('the store folder fits Apple: text lengths, both screenshot sets, right pixel sizes', () => {
  const store = readStore();
  assert.deepEqual(store.problems, []);
  const main = store.locales[store.listing.primaryLocale];
  for (const type of Object.keys(SIZES)) assert.ok(main.sets[type].length >= 3 && main.sets[type].length <= 10, type);
  for (const { text } of Object.values(store.locales)) {
    for (const [field, max] of Object.entries(LIMITS)) assert.ok((text[field] ?? '').length <= max, field);
    assert.ok(text.shortDescription.length <= 80, 'Google Play short description');
  }
});

test('the store folder names what Apple would refuse: too long, too many, wrong sizes, missing sets', () => {
  const dir = makeStore({ shots: 11 });
  const problems = readFolder(dir).problems.join('\n');
  assert.match(problems, /iphone-69 has 11 screenshots, Apple takes 10/);
  const none = makeStore({ shots: 0 });
  assert.match(readFolder(none).problems.join('\n'), /nl-NL has no screenshots for APP_IPHONE_67/);
});

test('image sizes are read from PNG and JPEG headers', () => {
  const store = readStore();
  const file = store.locales['nl-NL'].sets.APP_IPHONE_67[0];
  assert.deepEqual(imageSize(readFileSync(file)), [1320, 2868]);
  assert.deepEqual(imageSize(readFileSync(join(STORE, 'android/icon-512.png'))), [512, 512]);
});

const version = { id: 'v1', attributes: { versionString: '1.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } };
const base = {
  'GET /apps/A/appStoreVersions': () => [200, { data: [version] }],
  'GET /apps/A/appInfos': () => [200, { data: [{ id: 'i1', attributes: { state: 'PREPARE_FOR_SUBMISSION' } }] }],
};

test('texts: the main language is changed, a new language is added, and a first version gets no "what is new"', async () => {
  const fake = fakeApple({ ...base,
    'PATCH /appStoreVersions/v1': () => [200, { data: version }],
    'GET /appInfos/i1/appInfoLocalizations': () => [200, { data: [{ id: 'il-nl', attributes: { locale: 'nl-NL' } }] }],
    'GET /appStoreVersions/v1/appStoreVersionLocalizations': () => [200, { data: [{ id: 'vl-nl', attributes: { locale: 'nl-NL' } }] }],
    'PATCH /appInfoLocalizations/il-nl': () => [200, {}], 'POST /appInfoLocalizations': () => [201, {}],
    'PATCH /appStoreVersionLocalizations/vl-nl': () => [200, {}], 'POST /appStoreVersionLocalizations': () => [201, {}],
  });
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['texts'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  const patched = fake.calls.find((c) => c.key === 'PATCH /appStoreVersionLocalizations/vl-nl').body.data.attributes;
  assert.equal(patched.whatsNew, undefined);
  assert.match(patched.description, /Example App/);
  const added = fake.calls.find((c) => c.key === 'POST /appStoreVersionLocalizations').body.data;
  assert.equal(added.attributes.locale, 'en-GB');
  assert.equal(fake.calls.find((c) => c.key === 'PATCH /appInfoLocalizations/il-nl').body.data.attributes.subtitle, 'Een voorbeeld');
});

test('plan writes nothing', async () => {
  const fake = fakeApple({ ...base,
    'GET /appInfos/i1/appInfoLocalizations': () => [200, { data: [] }],
    'GET /appStoreVersions/v1/appStoreVersionLocalizations': () => [200, { data: [] }],
    'GET /appInfos/i1/ageRatingDeclaration': () => [200, { data: { id: 'age', attributes: { gambling: null, violenceRealistic: null, kidsAgeBand: null } } }],
    'GET /apps/A/appPricePoints': () => [200, { data: [{ id: 'p0', attributes: { customerPrice: '0.0' } }] }],
    'GET /territories': () => [200, { data: [{ id: 'NLD' }, { id: 'BEL' }] }],
    'GET /apps/A/appAvailabilityV2': () => [404, { errors: [{ title: 'none' }] }],
    'GET /apps/A/betaAppLocalizations': () => [200, { data: [] }],
    'GET /builds': () => [200, { data: [{ id: 'b1', attributes: { version: '7' } }] }],
  });
  const results = await run(fake.api, { store: readStore(), appId: 'A', write: false, fetchImpl: fake.impl });
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  assert.ok(fake.calls.every((c) => c.key.startsWith('GET ')), fake.calls.map((c) => c.key).join());
});

test('age rating answers every question Apple lists with none or no, and leaves the kids band alone', async () => {
  const fake = fakeApple({ ...base,
    'GET /appInfos/i1/ageRatingDeclaration': () => [200, { data: { id: 'age', attributes: { gambling: null, violenceRealistic: null, unrestrictedWebAccess: true, kidsAgeBand: null } } }],
    'PATCH /ageRatingDeclarations/age': () => [200, {}],
  });
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['age'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  assert.deepEqual(fake.calls.at(-1).body.data.attributes, { gambling: false, violenceRealistic: 'NONE', unrestrictedWebAccess: false });
});

test('review: the demo account comes from the environment only, and its absence is said out loud', async () => {
  const routes = { ...base, 'GET /appStoreVersions/v1/appStoreReviewDetail': () => [404, { errors: [{ title: 'none' }] }], 'POST /appStoreReviewDetails': () => [201, {}] };
  let fake = fakeApple(routes);
  let [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['review'], fetchImpl: fake.impl });
  assert.match(r.text, /WITHOUT a demo account/);
  assert.equal(fake.calls.at(-1).body.data.attributes.demoAccountName, undefined);
  fake = fakeApple(routes);
  [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['review'], demo: { user: 'u', password: 'p' }, fetchImpl: fake.impl });
  assert.equal(fake.calls.at(-1).body.data.attributes.demoAccountPassword, 'p');
  assert.equal(fake.calls.at(-1).body.data.attributes.demoAccountRequired, true);
});

test('screenshots: a set is emptied, then every file is reserved, sent in parts and confirmed with its checksum', async () => {
  let n = 0;
  const sent = [];
  const fake = fakeApple({ ...base,
    'GET /appStoreVersions/v1/appStoreVersionLocalizations': () => [200, { data: [{ id: 'vl-nl', attributes: { locale: 'nl-NL' } }, { id: 'vl-en', attributes: { locale: 'en-GB' } }] }],
    'GET /appStoreVersionLocalizations/vl-en/appScreenshotSets': () => [200, { data: [] }],
    'GET /appStoreVersionLocalizations/vl-nl/appScreenshotSets': () => [200, { data: [{ id: 's-phone', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } }] }],
    'POST /appScreenshotSets': (b) => [201, { data: { id: 's-pad', attributes: b.data.attributes } }],
    'GET /appScreenshotSets/s-phone/appScreenshots': () => [200, { data: [{ id: 'old1' }] }],
    'GET /appScreenshotSets/s-pad/appScreenshots': () => [200, { data: [] }],
    'DELETE /appScreenshots/old1': () => [204],
    'POST /appScreenshots': (b) => { const half = Math.floor(b.data.attributes.fileSize / 2); return [201, { data: { id: `shot${++n}`, attributes: { uploadOperations: [
      { method: 'PUT', url: 'https://upload.example/part1', offset: 0, length: half, requestHeaders: [{ name: 'Content-Type', value: 'image/jpeg' }] },
      { method: 'PUT', url: 'https://upload.example/part2', offset: half, length: b.data.attributes.fileSize - half, requestHeaders: [] }] } } }]; },
    'PATCH /appScreenshots/*': () => [200, {}],
  });
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://upload.example/')) { sent.push(init.body.length); return new Response(null, { status: 200 }); }
    return fake.impl(url, init);
  };
  const store = readStore();
  const [r] = await run(fake.api, { store, appId: 'A', write: true, only: ['screenshots'], fetchImpl });
  assert.ok(r.ok, r.text);
  assert.ok(fake.calls.some((c) => c.key === 'DELETE /appScreenshots/old1'));
  assert.equal(n, 12); // three iPhone and three iPad pictures in Dutch and in English
  assert.equal(sent.length, 24); // each sent in two parts
  const confirm = fake.calls.filter((c) => c.key.startsWith('PATCH /appScreenshots/'));
  assert.equal(confirm.length, 12);
  assert.ok(confirm.every((c) => c.body.data.attributes.uploaded === true && /^[0-9a-f]{32}$/.test(c.body.data.attributes.sourceFileChecksum)));
});

test('one failing part does not stop the others', async () => {
  const fake = fakeApple({ ...base, 'PATCH /apps/A': () => [409, { errors: [{ title: 'conflict', detail: 'x' }] }],
    'GET /appInfos/i1/ageRatingDeclaration': () => [200, { data: { id: 'age', attributes: { gambling: null } } }], 'PATCH /ageRatingDeclarations/age': () => [200, {}] });
  const results = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['app', 'age'], fetchImpl: fake.impl });
  assert.deepEqual(results.map((r) => r.ok), [false, true]);
});

test('a 500 from Apple on a read is asked again; a POST is not repeated', async () => {
  let gets = 0, posts = 0;
  const impl = async (url, init = {}) => {
    if ((init.method ?? 'GET') === 'GET') return ++gets < 3 ? new Response('{"errors":[{"title":"An unexpected error occurred."}]}', { status: 500 }) : new Response('{"data":[1]}', { status: 200 });
    posts++;
    return new Response('{"errors":[{"title":"boom"}]}', { status: 500 });
  };
  const api = client(() => 't', impl, async () => {});
  assert.deepEqual(await api.get('/apps/A/appInfos'), { data: [1] });
  assert.equal(gets, 3);
  await assert.rejects(api.post('/appScreenshots', {}), /500/);
  assert.equal(posts, 1);
});

test('countries: every territory is switched on in one call, with new countries included', async () => {
  const fake = fakeApple({ 'GET /territories': () => [200, { data: [{ id: 'NLD' }, { id: 'BEL' }] }],
    'GET /apps/A/appAvailabilityV2': () => [404, { errors: [{ title: 'none' }] }], 'POST /v2/appAvailabilities': () => [201, {}] });
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['countries'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  const body = fake.calls.at(-1).body;
  assert.equal(body.data.attributes.availableInNewTerritories, true);
  assert.deepEqual(body.included.map((i) => [i.id, i.attributes.available, i.relationships.territory.data.id]), [['${NLD}', true, 'NLD'], ['${BEL}', true, 'BEL']]);
  assert.deepEqual(body.data.relationships.territoryAvailabilities.data.map((d) => d.id), ['${NLD}', '${BEL}']);
});

test('age rating: a question Apple wants as yes/no instead of a word is answered again the right way', async () => {
  let tries = 0;
  const fake = fakeApple({ ...base,
    'GET /appInfos/i1/ageRatingDeclaration': () => [200, { data: { id: 'age', attributes: { brandNewQuestion: null, violenceRealistic: null, gracRatingClassificationNumber: null, someNumber: null } } }],
    'PATCH /ageRatingDeclarations/age': (b) => (++tries === 1
      ? [409, { errors: [{ title: 'An attribute in the provided entity has the wrong type', detail: "Unexpected json type provided for attribute 'brandNewQuestion'. Expected a BOOLEAN but got STRING" }] }]
      : tries === 2 ? [409, { errors: [{ title: 'There is a problem with the request entity.', detail: "The attribute 'someNumber' cannot be set unless 'x' is also set to a non-NONE value." }] }]
      : [200, {}]),
  });
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['age'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  assert.deepEqual(fake.calls.at(-1).body.data.attributes, { brandNewQuestion: false, violenceRealistic: 'NONE' });
});

test('verify only reads, names what is missing and survives a part Apple will not show', async () => {
  const fake = fakeApple({ ...base,
    'GET /apps/A': () => [200, { data: { attributes: { name: 'Example App', bundleId: 'b', primaryLocale: 'nl-NL', contentRightsDeclaration: null } } }],
    'GET /appInfos/i1': () => [200, { data: { attributes: {} }, included: [{ type: 'appCategories', id: 'BUSINESS' }] }],
    'GET /appInfos/i1/appInfoLocalizations': () => [200, { data: [{ id: 'l', attributes: { locale: 'nl-NL', name: 'Example App', subtitle: 's', privacyPolicyUrl: 'https://site.example/privacy' } }] }],
    'GET /appInfos/i1/ageRatingDeclaration': () => [200, { data: { id: 'age', attributes: { gambling: false, violenceRealistic: null, kidsAgeBand: null } } }],
    'GET /appStoreVersions/v1/build': () => [404, { errors: [{ title: 'none' }] }],
    'GET /appStoreVersions/v1/appStoreVersionLocalizations': () => [200, { data: [] }],
    'GET /appStoreVersions/v1/appStoreReviewDetail': () => [200, { data: { attributes: { contactFirstName: 'A', contactEmail: 'a@b.c', contactPhone: '+31', notes: 'n', demoAccountName: null, demoAccountRequired: false } } }],
  });
  const fetchImpl = async (url, init) => (String(url).startsWith('https://site.example') ? new Response('', { status: 404 }) : fake.impl(url, init));
  const lines = await verify(fake.api, 'A', fetchImpl);
  assert.ok(fake.calls.every((c) => c.key.startsWith('GET ')));
  const text = lines.join('\n');
  assert.match(text, /MISS content rights: not answered/);
  assert.match(text, /MISS nl-NL: privacy policy https:\/\/site.example\/privacy answers 404/);
  assert.match(text, /MISS age rating: unanswered violenceRealistic/);
  assert.match(text, /MISS no build attached/);
  assert.match(text, /MISS review demo account: none/);
  assert.match(text, /MISS no price set/);
  assert.match(text, /\?\?   builds: could not read/);
});

test('testflight: test description per language and the review contact, without inventing a demo account', async () => {
  const fake = fakeApple({ 'GET /apps/A/betaAppLocalizations': () => [200, { data: [{ id: 'b-nl', attributes: { locale: 'nl-NL' } }] }],
    'PATCH /betaAppLocalizations/b-nl': () => [200, {}], 'POST /betaAppLocalizations': () => [201, {}], 'PATCH /betaAppReviewDetails/A': () => [200, {}] });
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['testflight'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  assert.equal(fake.calls.find((c) => c.key === 'POST /betaAppLocalizations').body.data.attributes.locale, 'en-GB');
  assert.ok(fake.calls.find((c) => c.key === 'PATCH /betaAppLocalizations/b-nl').body.data.attributes.description.length <= 4000);
  const contact = fake.calls.at(-1).body.data.attributes;
  assert.equal(contact.contactEmail, 'support@example.com');
  assert.equal(contact.demoAccountName, undefined);
});

test('build: the newest processed build goes on the version page and the version takes its number', async () => {
  const fake = fakeApple({ ...base,
    'GET /builds': () => [200, { data: [{ id: 'b9', attributes: { version: '31', iconAssetToken: { templateUrl: 'x' } }, relationships: { preReleaseVersion: { data: { id: 'pr1' } } } }],
      included: [{ type: 'preReleaseVersions', id: 'pr1', attributes: { version: '1.0.4' } }] }],
    'PATCH /appStoreVersions/v1': () => [200, { data: version }],
    'PATCH /appStoreVersions/v1/relationships/build': () => [204],
  });
  const [plan] = await run(fake.api, { store: readStore(), appId: 'A', write: false, only: ['build'], fetchImpl: fake.impl });
  assert.match(plan.text, /build 31 of 1\.0\.4.*1\.0 becomes 1\.0\.4/);
  assert.ok(!fake.calls.some((c) => c.key.startsWith('PATCH')));
  const [r] = await run(fake.api, { store: readStore(), appId: 'A', write: true, only: ['build'], fetchImpl: fake.impl });
  assert.ok(r.ok, r.text);
  assert.equal(fake.calls.find((c) => c.key === 'PATCH /appStoreVersions/v1').body.data.attributes.versionString, '1.0.4');
  assert.deepEqual(fake.calls.find((c) => c.key === 'PATCH /appStoreVersions/v1/relationships/build').body.data, { type: 'builds', id: 'b9' });
});

test('age rating and countries can be left to a person (manual), for apps with rated content', async () => {
  const store = readFolder(makeStore({ listing: { ios: { ageRating: 'manual', countries: 'manual' } } }));
  const fake = fakeApple({});
  const results = await run(fake.api, { store, appId: 'A', write: true, only: ['age', 'countries'], fetchImpl: fake.impl });
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.match(results.map((r) => r.text).join(), /manual/);
  assert.equal(fake.calls.length, 0);
});

test('appid registers the App ID once, like the one the account has, and switches push on', async () => {
  const registered = [];
  const capabilities = [];
  const fake = fakeApple({
    'GET /bundleIds': (_, u) => {
      const id = u.searchParams.get('filter[identifier]');
      if (id === 'com.example.app') return [200, { data: [{ id: 'B1', attributes: { identifier: id, platform: 'UNIVERSAL', name: 'Example App' } }] }];
      return [200, { data: registered }];
    },
    'POST /bundleIds': (body) => {
      const made = { id: 'B2', attributes: body.data.attributes };
      registered.push(made);
      return [201, { data: made }];
    },
    'GET /bundleIds/B2/bundleIdCapabilities': () => [200, { data: capabilities }],
    'POST /bundleIdCapabilities': (body) => {
      capabilities.push({ attributes: body.data.attributes });
      return [201, { data: {} }];
    },
    'GET /apps': () => [200, { data: [] }],
  });
  const ask = { bundleId: 'com.example.companion', name: 'Example Companion', like: 'com.example.app' };
  assert.deepEqual(await ensureAppId(fake.api, { ...ask, write: false }), ['App ID com.example.companion is not registered yet']);
  assert.equal(registered.length, 0);

  const first = await ensureAppId(fake.api, { ...ask, write: true });
  assert.equal(registered[0].attributes.platform, 'UNIVERSAL');
  assert.match(first.join('\n'), /registered as "Example Companion"[\s\S]*push notifications switched on[\s\S]*no app record yet/);

  const second = await ensureAppId(fake.api, { ...ask, write: true });
  assert.equal(registered.length, 1);
  assert.equal(capabilities.length, 1);
  assert.match(second.join('\n'), /is registered as[\s\S]*push notifications are on/);
});
