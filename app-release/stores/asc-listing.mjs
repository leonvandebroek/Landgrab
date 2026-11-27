// Fills in the App Store page from the app's store folder (store/ by default): names, texts, addresses, categories,
// age rating, price (free), countries, review contact and the screenshots. It never sends anything to review; that
// stays `asc.mjs submit`.
//
//   node app-release/stores/asc-listing.mjs check     # only reads the store folder and says what Apple would refuse
//   node app-release/stores/asc-listing.mjs plan      # reads App Store Connect and prints what `apply` would do
//   node app-release/stores/asc-listing.mjs apply     # writes it; add --only texts,screenshots,... to do a part
//   node app-release/stores/asc-listing.mjs verify    # reads the whole page back from Apple, changes nothing
//   node app-release/stores/asc-listing.mjs appid     # registers the app's App ID (bundle id) with push; safe to repeat
//
// --app <key> works on another app of app-release.config.json (its own storeDir and bundle id). The app record itself
// cannot be made through Apple's API: App Store Connect, Apps, +, New App.
//
// Parts: app (categories, content rights), texts, age, price, countries, review, build, testflight, screenshots.
// The key comes from ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8, as in asc.mjs. The review demo account comes from
// ASC_DEMO_USER and ASC_DEMO_PASSWORD and is never written to the repository; without them the review part keeps
// what App Store Connect already has for the account.
//
// What Apple's API cannot do, so stays by hand in App Store Connect: the App Privacy answers and the EU trader status
// (the store folder's README lists the answers to give).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, requireApp } from '../config.mjs';
import { ascClient, findApp, EDITABLE } from './asc.mjs';
import { appStoreConnectToken, call } from './jwt.mjs';

const SCREENSHOT_PROBLEM = /screenshots/;
const ref = (type, id) => ({ data: { type, id } });
export const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000 };
/** The pixel sizes Apple takes per screenshot set (portrait or landscape). */
export const SIZES = { APP_IPHONE_67: [[1320, 2868], [1290, 2796]], APP_IPAD_PRO_3GEN_129: [[2064, 2752], [2048, 2732]] };
const AGE_FALSE = ['gambling', 'unrestrictedWebAccess', 'lootBox', 'messagingAndChat', 'parentalControls', 'ageAssurance', 'userGeneratedContent', 'advertising', 'healthOrWellnessTopics', 'socialMedia', 'socialMediaAgeRestricted'];
const AGE_SKIP = ['kidsAgeBand', 'ageRatingOverride', 'ageRatingOverrideV2', 'koreaAgeRatingOverride', 'developerAgeRatingInfoUrl', 'seventeenPlus', 'gracRatingClassificationNumber'];

/** Width and height of a PNG or JPEG, read from its header. */
export function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('Not a PNG or JPEG');
}

/** Everything in a store folder that goes to Apple, with the problems Apple would refuse it for. */
export function readStore(dir) {
  const listing = JSON.parse(readFileSync(join(dir, 'listing.json'), 'utf8'));
  const problems = [];
  const locales = {};
  for (const locale of listing.locales) {
    const text = JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8'));
    for (const [field, max] of Object.entries(LIMITS)) {
      if ((text[field] ?? '').length > max) problems.push(`${locale} ${field} is ${text[field].length} characters, Apple takes ${max}`);
    }
    for (const field of ['name', 'subtitle', 'description', 'keywords', 'supportUrl', 'privacyPolicyUrl']) if (!text[field]) problems.push(`${locale} ${field} is missing`);
    const sets = {};
    for (const [folder, type] of Object.entries(listing.ios.screenshotSets)) {
      const path = join(dir, 'screenshots/ios', locale, folder);
      if (!existsSync(path)) continue;
      const files = readdirSync(path).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => join(path, f));
      if (files.length > 10) problems.push(`${locale} ${folder} has ${files.length} screenshots, Apple takes 10`);
      for (const f of files) {
        const [w, h] = imageSize(readFileSync(f));
        if (!SIZES[type].some(([a, b]) => (a === w && b === h) || (a === h && b === w))) problems.push(`${f.replace(dir + '/', '')} is ${w} x ${h}, not a size for ${type}`);
      }
      if (files.length) sets[type] = files;
    }
    locales[locale] = { text, sets };
  }
  const main = locales[listing.primaryLocale];
  if (!main) problems.push(`primary locale ${listing.primaryLocale} is not in locales`);
  else for (const type of Object.values(listing.ios.screenshotSets)) if (!main.sets[type]) problems.push(`${listing.primaryLocale} has no screenshots for ${type}`);
  return { listing, locales, problems };
}

/**
 * Registers the app's App ID with Apple (or finds it) and switches push notifications on for it. Safe to repeat.
 * The platform follows an App ID the account already has (`like`), so both apps are registered the same way.
 */
export async function ensureAppId(api, { bundleId, name, like, write }) {
  const find = async (identifier) => (await api.get(`/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=20`)).data.find((b) => b.attributes.identifier === identifier);
  const lines = [];
  let appId = await find(bundleId);
  if (!appId) {
    if (!write) return [`App ID ${bundleId} is not registered yet`];
    const model = like && like !== bundleId ? await find(like) : null;
    appId = (await api.post('/bundleIds', { data: { type: 'bundleIds', attributes: { identifier: bundleId, name, platform: model?.attributes.platform ?? 'IOS' } } })).data;
    lines.push(`App ID ${bundleId} registered as "${name}"`);
  } else lines.push(`App ID ${bundleId} is registered as "${appId.attributes.name}"`);
  const capabilities = (await api.get(`/bundleIds/${appId.id}/bundleIdCapabilities`)).data.map((c) => c.attributes.capabilityType);
  if (capabilities.includes('PUSH_NOTIFICATIONS')) lines.push('push notifications are on');
  else if (write) {
    await api.post('/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: ref('bundleIds', appId.id) } } });
    lines.push('push notifications switched on');
  } else lines.push('push notifications are off');
  const record = (await api.get(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=5`)).data.find((a) => a.attributes?.bundleId === bundleId);
  lines.push(record ? `app record "${record.attributes.name}" exists` : 'no app record yet: make it in App Store Connect (Apps, +, New App)');
  return lines;
}

// Apple answers 500 now and then on calls that work a moment later. Reads, changes and deletes can simply be asked
// again; a POST is not repeated, since it might have made the thing already.
export function client(tokenFn, fetchImpl, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const api = ascClient(tokenFn, fetchImpl);
  const again = (fn) => async (...args) => {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(...args); }
      catch (e) { if (!(e.status >= 500) || attempt === 4) throw e; await wait(2000 * 2 ** attempt); }
    }
  };
  return { get: again(api.get), patch: again(api.patch), post: api.post,
    delete: again((path) => call(fetchImpl, 'DELETE', `https://api.appstoreconnect.apple.com/v1${path}`, tokenFn())) };
}
const all = async (api, path) => (await api.get(path)).data ?? [];

async function editableVersion(api, appId) {
  const versions = await all(api, `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const v = versions.find((x) => EDITABLE.includes(x.attributes?.appStoreState ?? x.attributes?.appVersionState));
  if (!v) throw new Error('No App Store version that can still be edited. Create version 1.0 in App Store Connect, or run after the next upload.');
  return v;
}
async function editableInfo(api, appId) {
  const infos = await all(api, `/apps/${appId}/appInfos?limit=10`);
  const info = infos.find((i) => EDITABLE.includes(i.attributes?.appStoreState ?? i.attributes?.state)) ?? infos.find((i) => (i.attributes?.state ?? i.attributes?.appStoreState) !== 'READY_FOR_DISTRIBUTION') ?? infos[0];
  if (!info) throw new Error('The app has no app information record');
  return info;
}

/** The newest build Apple finished processing, with the version number it was built as. */
async function newestBuild(api, appId) {
  const res = await api.get(`/builds?filter[app]=${appId}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=5&include=preReleaseVersion`);
  const build = (res.data ?? [])[0];
  if (!build) return null;
  const pre = build.relationships?.preReleaseVersion?.data?.id;
  const marketing = (res.included ?? []).find((i) => i.type === 'preReleaseVersions' && i.id === pre)?.attributes?.version;
  return { build, marketing };
}

/** One localisation of `type` under `parentPath`: changed when it exists, made when it does not. */
async function upsertLocalization(api, { listPath, type, parent, locale, attributes, write }) {
  const existing = (await all(api, `${listPath}?limit=50`)).find((l) => l.attributes.locale === locale);
  if (!write) return existing ? `change ${locale}` : `add ${locale}`;
  if (existing) await api.patch(`/${type}/${existing.id}`, { data: { type, id: existing.id, attributes } });
  else await api.post(`/${type}`, { data: { type, attributes: { locale, ...attributes }, relationships: parent } });
  return existing ? `changed ${locale}` : `added ${locale}`;
}

export const PARTS = {
  async app(api, ctx, write) {
    const { ios } = ctx.store.listing;
    if (!write) return `categories ${ios.primaryCategory} + ${ios.secondaryCategory}, content rights ${ios.contentRights}`;
    await api.patch(`/apps/${ctx.appId}`, { data: { type: 'apps', id: ctx.appId, attributes: { contentRightsDeclaration: ios.contentRights } } });
    const info = await editableInfo(api, ctx.appId);
    await api.patch(`/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: {
      primaryCategory: ref('appCategories', ios.primaryCategory), secondaryCategory: ref('appCategories', ios.secondaryCategory) } } });
    return 'categories and content rights set';
  },

  async texts(api, ctx, write) {
    const info = await editableInfo(api, ctx.appId);
    const version = await editableVersion(api, ctx.appId);
    const first = (await all(api, `/apps/${ctx.appId}/appStoreVersions?filter[platform]=IOS&limit=20`)).length === 1;
    const done = [];
    if (write) await api.patch(`/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: ctx.store.listing.copyright } } });
    for (const [locale, { text }] of Object.entries(ctx.store.locales)) {
      done.push(await upsertLocalization(api, { write, locale, type: 'appInfoLocalizations', listPath: `/appInfos/${info.id}/appInfoLocalizations`,
        parent: { appInfo: ref('appInfos', info.id) }, attributes: { name: text.name, subtitle: text.subtitle, privacyPolicyUrl: text.privacyPolicyUrl } }));
      const attributes = { description: text.description, keywords: text.keywords, promotionalText: text.promotionalText, supportUrl: text.supportUrl, marketingUrl: text.marketingUrl };
      if (!first && text.whatsNew) attributes.whatsNew = text.whatsNew; // Apple refuses "what's new" on a first version
      await upsertLocalization(api, { write, locale, type: 'appStoreVersionLocalizations', listPath: `/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
        parent: { appStoreVersion: ref('appStoreVersions', version.id) }, attributes });
    }
    return `version ${version.attributes.versionString}: ${done.join(', ')}`;
  },

  // Every question "none" or "no". Only right for an app without any of the rated content: an app with chat, user
  // content, gambling or the like sets listing.ios.ageRating to "manual" and answers in App Store Connect.
  async age(api, ctx, write) {
    if (ctx.store.listing.ios.ageRating === 'manual') return 'skipped (listing.ios.ageRating is manual: answer in App Store Connect)';
    const info = await editableInfo(api, ctx.appId);
    const { data } = await api.get(`/appInfos/${info.id}/ageRatingDeclaration`);
    const attributes = {};
    for (const key of Object.keys(data.attributes ?? {})) {
      if (AGE_SKIP.includes(key)) continue;
      attributes[key] = AGE_FALSE.includes(key) || typeof data.attributes[key] === 'boolean' ? false : 'NONE';
    }
    if (!write) return `${Object.keys(attributes).length} questions answered none/no`;
    // Apple adds questions over time and a null answer does not say whether it wants "NONE" or false: when it says
    // which ones it expected differently, answer those the other way and ask once more.
    for (let attempt = 0; ; attempt++) {
      try { await api.patch(`/ageRatingDeclarations/${data.id}`, { data: { type: 'ageRatingDeclarations', id: data.id, attributes } }); break; }
      catch (e) {
        const wrong = [...e.message.matchAll(/attribute '(\w+)'\. Expected a (BOOLEAN|STRING)/g)];
        const notOurs = [...e.message.matchAll(/The attribute '(\w+)' cannot be set/g)]; // not a question at all
        if (e.status !== 409 || !(wrong.length + notOurs.length) || attempt === 3) throw e;
        for (const [, key, type] of wrong) attributes[key] = type === 'BOOLEAN' ? false : 'NONE';
        for (const [, key] of notOurs) delete attributes[key];
      }
    }
    return `${Object.keys(attributes).length} questions answered none/no`;
  },

  async price(api, ctx, write) {
    const { ios } = ctx.store.listing;
    if (!ios.free) return 'skipped (not free)';
    const points = await all(api, `/apps/${ctx.appId}/appPricePoints?filter[territory]=${ios.baseTerritory}&limit=200`);
    const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
    if (!free) throw new Error(`No free price point for ${ios.baseTerritory}`);
    if (!write) return `free, base country ${ios.baseTerritory}`;
    await api.post('/appPriceSchedules', {
      data: { type: 'appPriceSchedules', relationships: { app: ref('apps', ctx.appId), baseTerritory: ref('territories', ios.baseTerritory),
        manualPrices: { data: [{ type: 'appPrices', id: '${price1}' }] } } },
      included: [{ type: 'appPrices', id: '${price1}', attributes: { startDate: null }, relationships: { appPricePoint: ref('appPricePoints', free.id) } }],
    });
    return `free, base country ${ios.baseTerritory}`;
  },

  // Every country, and new ones as Apple adds them (listing.ios.countries "all", the default). Set it to "manual" to
  // choose countries in App Store Connect instead.
  async countries(api, ctx, write) {
    if (ctx.store.listing.ios.countries === 'manual') return 'skipped (listing.ios.countries is manual)';
    const V2 = 'https://api.appstoreconnect.apple.com/v2';
    const territories = (await all(api, '/territories?limit=200')).map((t) => t.id);
    const current = await api.get(`/apps/${ctx.appId}/appAvailabilityV2`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
    if (!current?.data) {
      if (!write) return `all ${territories.length} countries, and new ones as they come`;
      await api.post(`${V2}/appAvailabilities`, {
        data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { app: ref('apps', ctx.appId),
          territoryAvailabilities: { data: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t}}` })) } } },
        included: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t}}`, attributes: { available: true }, relationships: { territory: ref('territories', t) } })),
      });
      return `all ${territories.length} countries, and new ones as they come`;
    }
    const rows = await all(api, `${V2}/appAvailabilities/${current.data.id}/territoryAvailabilities?limit=200`);
    const off = rows.filter((r) => r.attributes?.available === false);
    if (!write) return `${rows.length - off.length} of ${rows.length} countries on already, ${off.length} to switch on`;
    for (const r of off) await api.patch(`/territoryAvailabilities/${r.id}`, { data: { type: 'territoryAvailabilities', id: r.id, attributes: { available: true } } });
    return `${rows.length} countries on (${off.length} switched on now)`;
  },

  async review(api, ctx, write) {
    const version = await editableVersion(api, ctx.appId);
    const attributes = { ...ctx.store.listing.review };
    const demo = ctx.demo?.user && ctx.demo?.password;
    if (demo) Object.assign(attributes, { demoAccountRequired: true, demoAccountName: ctx.demo.user, demoAccountPassword: ctx.demo.password });
    const note = demo ? 'with the demo account' : 'WITHOUT a demo account (set ASC_DEMO_USER and ASC_DEMO_PASSWORD); Apple needs one before review';
    if (!write) return `review contact ${note}`;
    const existing = await api.get(`/appStoreVersions/${version.id}/appStoreReviewDetail`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
    if (existing?.data) await api.patch(`/appStoreReviewDetails/${existing.data.id}`, { data: { type: 'appStoreReviewDetails', id: existing.data.id, attributes } });
    else await api.post('/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: ref('appStoreVersions', version.id) } } });
    return `review contact ${note}`;
  },

  // The build on the version page: Apple takes the app icon it shows there (and in the store) from the attached
  // build, so a page without one has an empty icon. The newest processed build is attached; the version takes
  // that build's version number, because Apple refuses a build whose number differs. This sends nothing to review.
  async build(api, ctx, write) {
    const version = await editableVersion(api, ctx.appId);
    const found = await newestBuild(api, ctx.appId);
    if (!found) throw new Error('No processed build at Apple yet; upload one first (the mobile pipeline does)');
    const { build, marketing } = found;
    const rename = marketing && marketing !== version.attributes.versionString;
    const text = `build ${build.attributes.version}${marketing ? ` of ${marketing}` : ''} on the version page${rename ? ` (version ${version.attributes.versionString} becomes ${marketing})` : ''}`;
    if (!write) return text;
    if (rename) await api.patch(`/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { versionString: marketing } } });
    await api.patch(`/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
    return `${text}: attached${build.attributes.iconAssetToken ? '' : ' (this build carries NO icon)'}`;
  },

  // TestFlight: what testers read under "What to test", where their feedback goes, and who Apple calls about a
  // test build for people outside the account. The same contact and demo account as the store review.
  async testflight(api, ctx, write) {
    const done = [];
    for (const [locale, { text }] of Object.entries(ctx.store.locales)) {
      if (!text.betaDescription) continue;
      done.push(await upsertLocalization(api, { write, locale, type: 'betaAppLocalizations', listPath: `/apps/${ctx.appId}/betaAppLocalizations`,
        parent: { app: ref('apps', ctx.appId) }, attributes: { description: text.betaDescription, feedbackEmail: text.feedbackEmail } }));
    }
    const { contactFirstName, contactLastName, contactPhone, contactEmail, notes } = ctx.store.listing.review;
    const attributes = { contactFirstName, contactLastName, contactPhone, contactEmail, notes };
    if (ctx.demo?.user && ctx.demo?.password) Object.assign(attributes, { demoAccountRequired: true, demoAccountName: ctx.demo.user, demoAccountPassword: ctx.demo.password });
    if (write) await api.patch(`/betaAppReviewDetails/${ctx.appId}`, { data: { type: 'betaAppReviewDetails', id: ctx.appId, attributes } });
    return `test description ${done.join(', ')}; review contact ${attributes.demoAccountName ? 'with' : 'without'} the demo account`;
  },

  // Each set is replaced as a whole, so the order on the page is the order of the file names.
  async screenshots(api, ctx, write) {
    const version = await editableVersion(api, ctx.appId);
    const localizations = await all(api, `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
    const done = [];
    for (const [locale, { sets }] of Object.entries(ctx.store.locales)) {
      const loc = localizations.find((l) => l.attributes.locale === locale);
      if (!Object.keys(sets).length) continue;
      if (!loc) { if (write) throw new Error(`${locale} has no texts yet; run the texts part first`); done.push(`${locale}: after texts`); continue; }
      const existing = await all(api, `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`);
      for (const [type, files] of Object.entries(sets)) {
        if (!write) { done.push(`${locale} ${type}: ${files.length}`); continue; }
        let set = existing.find((s) => s.attributes.screenshotDisplayType === type);
        if (!set) ({ data: set } = await api.post('/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type },
          relationships: { appStoreVersionLocalization: ref('appStoreVersionLocalizations', loc.id) } } }));
        for (const old of await all(api, `/appScreenshotSets/${set.id}/appScreenshots?limit=50`)) await api.delete(`/appScreenshots/${old.id}`);
        for (const file of files) await uploadScreenshot(api, ctx.fetchImpl, set.id, file);
        done.push(`${locale} ${type}: ${files.length} uploaded`);
      }
    }
    return done.join('; ');
  },
};

/** Apple's three steps: reserve, send the bytes to the addresses it hands back, then confirm with the checksum. */
export async function uploadScreenshot(api, fetchImpl, setId, file) {
  const bytes = readFileSync(file);
  const { data } = await api.post('/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: file.split('/').pop(), fileSize: bytes.length },
    relationships: { appScreenshotSet: ref('appScreenshotSets', setId) } } });
  for (const op of data.attributes.uploadOperations ?? []) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await fetchImpl(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`Upload of ${file.split('/').pop()} answered ${res.status}`);
  }
  await api.patch(`/appScreenshots/${data.id}`, { data: { type: 'appScreenshots', id: data.id,
    attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } });
  return data.id;
}

/** Runs the parts one by one; one failing part does not stop the others, and the result names each outcome. */
export async function run(api, { store, appId, write, only, demo, fetchImpl = fetch }) {
  const ctx = { store, appId, demo, fetchImpl };
  const results = [];
  for (const name of Object.keys(PARTS)) {
    if (only && !only.includes(name)) continue;
    try { results.push({ part: name, ok: true, text: await PARTS[name](api, ctx, write) }); }
    catch (e) { results.push({ part: name, ok: false, text: e.message }); }
  }
  return results;
}

/** Reads the whole page back from Apple and says per point whether it is there. Changes nothing. */
export async function verify(api, appId, fetchImpl = fetch) {
  const V2 = 'https://api.appstoreconnect.apple.com/v2';
  const lines = [];
  const say = (mark, text) => lines.push(`${mark} ${text}`);
  const step = async (name, fn) => { try { await fn(); } catch (e) { say('??  ', `${name}: could not read (${e.message.slice(0, 200)})`); } };
  const state = (x) => x?.attributes?.appVersionState ?? x?.attributes?.appStoreState ?? x?.attributes?.state;
  const have = (v) => (v === null || v === undefined || v === '' ? 'MISS' : 'ok  ');
  let version, info;
  await step('app', async () => {
    const { data } = await api.get(`/apps/${appId}`);
    say('info', `app "${data.attributes.name}", bundle ${data.attributes.bundleId}, main language ${data.attributes.primaryLocale}`);
    say(have(data.attributes.contentRightsDeclaration), `content rights: ${data.attributes.contentRightsDeclaration ?? 'not answered'}`);
  });
  await step('app information', async () => {
    info = await editableInfo(api, appId);
    const full = await api.get(`/appInfos/${info.id}?include=primaryCategory,secondaryCategory`);
    const cats = (full.included ?? []).map((c) => c.id);
    say(cats.length ? 'ok  ' : 'MISS', `categories: ${cats.join(', ') || 'none'}`);
    say('info', `age rating shown in the store: ${full.data.attributes.appStoreAgeRating ?? full.data.attributes.ageRating ?? 'unknown'}`);
    for (const l of await all(api, `/appInfos/${info.id}/appInfoLocalizations?limit=50`)) {
      const a = l.attributes;
      say(have(a.name) === 'ok  ' && have(a.subtitle) === 'ok  ' ? 'ok  ' : 'MISS', `${a.locale}: name "${a.name}", subtitle "${a.subtitle ?? ''}"`);
      if (!a.privacyPolicyUrl) { say('MISS', `${a.locale}: no privacy policy address`); continue; }
      const res = await fetchImpl(a.privacyPolicyUrl, { redirect: 'follow' }).catch((e) => ({ status: e.message }));
      say(res.status === 200 ? 'ok  ' : 'MISS', `${a.locale}: privacy policy ${a.privacyPolicyUrl} answers ${res.status}`);
    }
    const { data: age } = await api.get(`/appInfos/${info.id}/ageRatingDeclaration`);
    const open = Object.entries(age.attributes ?? {}).filter(([k, v]) => v === null && !AGE_SKIP.includes(k)).map(([k]) => k);
    say(open.length ? 'MISS' : 'ok  ', open.length ? `age rating: unanswered ${open.join(', ')}` : 'age rating: every question answered');
  });
  await step('version', async () => {
    const versions = await all(api, `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`);
    for (const v of versions) say('info', `version ${v.attributes.versionString}: ${state(v)}, release ${v.attributes.releaseType}, copyright "${v.attributes.copyright ?? ''}"`);
    version = versions.find((x) => EDITABLE.includes(state(x))) ?? versions[0];
    if (!version) return say('MISS', 'no App Store version');
    say(have(version.attributes.copyright), 'copyright');
    const build = await api.get(`/appStoreVersions/${version.id}/build`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
    say(build?.data ? 'ok  ' : 'MISS', build?.data ? `build ${build.data.attributes.version} is attached to version ${version.attributes.versionString}` : `no build attached to version ${version.attributes.versionString} yet, so the page shows no icon (apply --only build)`);
    const newest = await newestBuild(api, appId).catch(() => null);
    if (!newest) say('MISS', 'no processed build at Apple');
    else {
      const b = newest.build.attributes;
      say('info', `newest build: ${b.version} of ${newest.marketing ?? '?'}, uploaded ${b.uploadedDate}`);
      say(b.iconAssetToken ? 'ok  ' : 'MISS', b.iconAssetToken ? 'the newest build carries the app icon' : 'the newest build carries NO app icon');
      say(b.usesNonExemptEncryption === null || b.usesNonExemptEncryption === undefined ? 'MISS' : 'ok  ', `export compliance (encryption question): ${b.usesNonExemptEncryption ?? 'not answered'}`);
    }
    for (const l of await all(api, `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)) {
      const a = l.attributes;
      const missing = ['description', 'keywords', 'supportUrl'].filter((f) => !a[f]);
      say(missing.length ? 'MISS' : 'ok  ', `${a.locale} texts: description ${a.description?.length ?? 0}, keywords ${a.keywords?.length ?? 0}, promo ${a.promotionalText?.length ?? 0} characters${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
      if (a.supportUrl) { const res = await fetchImpl(a.supportUrl, { redirect: 'follow' }).catch((e) => ({ status: e.message })); say(res.status === 200 ? 'ok  ' : 'MISS', `${a.locale}: support address ${a.supportUrl} answers ${res.status}`); }
      const sets = await all(api, `/appStoreVersionLocalizations/${l.id}/appScreenshotSets?limit=50`);
      if (!sets.length) say('MISS', `${a.locale}: no screenshots of its own (the store shows the main language's)`);
      for (const set of sets) {
        const shots = await all(api, `/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
        const bad = shots.filter((x) => x.attributes.assetDeliveryState?.state !== 'COMPLETE');
        say(shots.length && !bad.length ? 'ok  ' : 'MISS', `${a.locale} ${set.attributes.screenshotDisplayType}: ${shots.length} screenshots${bad.length ? `, ${bad.length} not accepted (${bad.map((x) => x.attributes.assetDeliveryState?.state).join(', ')})` : ', all accepted'}`);
      }
    }
    const review = await api.get(`/appStoreVersions/${version.id}/appStoreReviewDetail`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
    const r = review?.data?.attributes;
    say(r?.contactEmail && r?.contactPhone && r?.contactFirstName ? 'ok  ' : 'MISS', `review contact: ${r ? `${r.contactFirstName ?? ''} ${r.contactLastName ?? ''}, ${r.contactEmail ?? 'no e-mail'}, ${r.contactPhone ?? 'no phone'}` : 'none'}`);
    say(r?.demoAccountName ? 'ok  ' : 'MISS', r?.demoAccountName ? `review demo account: ${r.demoAccountName} (required: ${r.demoAccountRequired})` : `review demo account: none (sign-in required box: ${r?.demoAccountRequired ?? 'unset'})`);
    say(have(r?.notes), `review notes: ${r?.notes?.length ?? 0} characters`);
  });
  await step('price', async () => {
    const sched = await api.get(`/apps/${appId}/appPriceSchedule?include=baseTerritory,manualPrices`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    say(sched?.data ? 'ok  ' : 'MISS', sched?.data ? `price schedule set, base country ${(sched.included ?? []).find((i) => i.type === 'territories')?.id ?? '?'}` : 'no price set');
  });
  await step('countries', async () => {
    const av = await api.get(`/apps/${appId}/appAvailabilityV2`).catch((e) => (e.status === 404 ? { data: null } : Promise.reject(e)));
    if (!av?.data) return say('MISS', 'countries: not set');
    const rows = await all(api, `${V2}/appAvailabilities/${av.data.id}/territoryAvailabilities?limit=200`);
    say('ok  ', `countries: ${rows.filter((x) => x.attributes.available).length} of ${rows.length} on, new countries ${av.data.attributes.availableInNewTerritories ? 'included' : 'not included'}`);
  });
  await step('builds', async () => {
    const builds = await all(api, `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=5`);
    if (!builds.length) say('MISS', 'no build uploaded');
    for (const b of builds) say(b.attributes.processingState === 'VALID' && !b.attributes.expired ? 'ok  ' : 'info', `build ${b.attributes.version}: ${b.attributes.processingState}${b.attributes.expired ? ', expired' : ''}, encryption answer ${b.attributes.usesNonExemptEncryption === null ? 'MISSING' : b.attributes.usesNonExemptEncryption}, uploaded ${b.attributes.uploadedDate}`);
  });
  await step('TestFlight', async () => {
    for (const l of await all(api, `/apps/${appId}/betaAppLocalizations?limit=50`)) {
      const a = l.attributes;
      say(a.description && a.feedbackEmail ? 'ok  ' : 'MISS', `TestFlight ${a.locale}: description ${a.description?.length ?? 0} characters, feedback e-mail ${a.feedbackEmail ?? 'none'}, privacy ${a.privacyPolicyUrl ?? 'none'}`);
    }
    const br = (await api.get(`/apps/${appId}/betaAppReviewDetail`)).data?.attributes;
    say(br?.contactEmail && br?.contactPhone ? 'ok  ' : 'MISS', `TestFlight review contact: ${br?.contactFirstName ?? ''} ${br?.contactLastName ?? ''}, ${br?.contactEmail ?? 'no e-mail'}, ${br?.contactPhone ?? 'no phone'}; demo account ${br?.demoAccountName ? 'set' : 'none'} (required: ${br?.demoAccountRequired})`);
    for (const g of await all(api, `/apps/${appId}/betaGroups?limit=50`)) {
      const testers = await api.get(`/betaGroups/${g.id}/betaTesters?limit=200`).catch(() => ({ data: [] }));
      const builds = await api.get(`/betaGroups/${g.id}/builds?limit=5`).catch(() => ({ data: [] }));
      say('info', `TestFlight group "${g.attributes.name}": ${g.attributes.isInternalGroup ? 'internal' : 'external'}, ${testers.data.length} testers, ${builds.data.length} builds${g.attributes.hasAccessToAllBuilds ? ' (gets every build)' : ''}`);
    }
  });
  say('info', 'App Privacy answers and the EU trader status cannot be read through Apple\'s API: check them in App Store Connect.');
  return lines;
}

async function main() {
  const [command = 'check', ...rest] = process.argv.slice(2);
  const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
  const only = option('--only')?.split(',') ?? null;
  const config = loadConfig();
  const app = requireApp(config, option('--app') ?? 'main', ['bundleId']);
  const store = readStore(app.storeDir);
  const bundleId = store.listing.bundleId ?? app.bundleId;
  // Screenshots that are not drawn yet only stand in the way of the screenshots part.
  const problems = store.problems.filter((p) => !(SCREENSHOT_PROBLEM.test(p) && (['appid', 'verify'].includes(command) || (only && !only.includes('screenshots')))));
  for (const p of problems) console.error(`Problem: ${p}`);
  if (problems.length) process.exit(1);
  if (command === 'check') {
    for (const [locale, { sets }] of Object.entries(store.locales)) console.log(`${locale}: texts fit; screenshots ${Object.entries(sets).map(([t, f]) => `${t} ${f.length}`).join(', ') || 'none (the store shows the main language\'s)'}`);
    return;
  }
  const key = { keyId: process.env.ASC_KEY_ID, issuerId: process.env.ASC_ISSUER_ID, privateKey: process.env.ASC_KEY_P8 };
  const api = client(() => appStoreConnectToken(key), fetch);
  if (command === 'appid') {
    const name = store.locales[store.listing.primaryLocale].text.name;
    // A second app registers on the same platform as the main one, so both are set up alike.
    const like = config.apps.main?.bundleId;
    for (const line of await ensureAppId(api, { bundleId, name, like, write: !rest.includes('--dry-run') })) console.log(line);
    return;
  }
  if (command === 'verify') {
    for (const line of await verify(api, await findApp(api, bundleId))) console.log(line);
    return;
  }
  if (!['plan', 'apply'].includes(command)) throw new Error('Use check, plan, apply, verify or appid');
  const appId = await findApp(api, bundleId);
  const results = await run(api, { store, appId, write: command === 'apply', only, demo: { user: process.env.ASC_DEMO_USER, password: process.env.ASC_DEMO_PASSWORD } });
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.part}: ${r.text}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
