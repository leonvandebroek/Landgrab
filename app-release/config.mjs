// The one settings file of an app's release kit: app-release.config.json at the root of the app's repository.
// Every script in app-release/ reads it through loadConfig(); nothing about the app is written into the scripts.
//
//   APP_RELEASE_CONFIG=<path>   use this file instead of searching upwards from the working folder
//
// Node's own modules only, so it runs on any build agent with Node 22.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG_FILE = 'app-release.config.json';

/** Searches the folder and its parents for app-release.config.json. */
export function findConfig(start = process.cwd(), env = process.env) {
  if (env.APP_RELEASE_CONFIG) return resolve(env.APP_RELEASE_CONFIG);
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

const expandHome = (p) => (p && p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/**
 * The settings with defaults filled in and paths made absolute (relative to the file's folder). Problems are listed,
 * not thrown, so `doctor` can show them all at once; `requireApp` throws for the app a command needs.
 */
export function normalize(raw, file = null) {
  const root = file ? dirname(file) : process.cwd();
  const at = (p) => (p ? (isAbsolute(expandHome(p)) ? expandHome(p) : join(root, p)) : null);
  const problems = [];
  const name = raw?.app?.name;
  if (!name) problems.push('app.name is missing');
  const platforms = { ios: false, android: false, mac: false, windows: false, ...(raw?.platforms ?? {}) };
  const apps = {};
  for (const [key, a] of Object.entries(raw?.apps ?? {})) {
    apps[key] = {
      key,
      name: a.name ?? name,
      bundleId: a.bundleId ?? null,
      androidPackage: a.androidPackage ?? a.bundleId ?? null,
      storeDir: at(a.storeDir ?? (key === 'main' ? 'app-release/store' : join('app-release/store', key))),
    };
    if ((platforms.ios || platforms.mac) && !apps[key].bundleId) problems.push(`apps.${key}.bundleId is missing`);
  }
  if (!apps.main) problems.push('apps.main is missing (the app the commands use when --app is not given)');
  const testflight = {
    teamGroup: raw?.testflight?.teamGroup ?? `${name ?? 'App'} team`,
    earlyGroup: raw?.testflight?.earlyGroup ?? 'Early testers',
  };
  const keys = {
    dir: expandHome(raw?.keys?.dir ?? `~/app-keys/${raw?.app?.slug ?? 'app'}`),
    vault: raw?.keys?.vault ?? null,
    prefix: raw?.keys?.prefix ?? '',
    subject: raw?.keys?.subject ?? { commonName: raw?.app?.publisher ?? name ?? 'App', country: raw?.app?.country ?? 'NL' },
  };
  if (!keys.vault) problems.push('keys.vault is missing (the Azure Key Vault that holds the signing keys)');
  // Azure DevOps (pipelines/*.yml): the service connection that reads Key Vault, who approves store releases, and the
  // pool of own Macs for the simulator, emulator and Mac proofs.
  const pipelines = {
    azureConnection: raw?.pipelines?.azureConnection ?? null,
    approvers: raw?.pipelines?.approvers ?? null,
    proofPool: raw?.pipelines?.proofPool ?? 'mac-proof',
  };
  if (!pipelines.azureConnection) problems.push('pipelines.azureConnection is missing (the Azure DevOps service connection that reads the Key Vault)');
  if ((platforms.ios || platforms.android) && !pipelines.approvers) problems.push('pipelines.approvers is missing (who approves a store release, an e-mail address or a group)');
  // The Mac and Windows app (pipelines/desktop.yml). dir and outDir stay relative: the pipeline uses them as they are.
  const d = raw?.desktop ?? {};
  const desktop = {
    ...d,
    dir: d.dir ?? 'desktop',
    outDir: d.outDir ?? 'release',
    feedUrl: d.feedUrl ?? null,
    healthUrl: d.healthUrl ?? null,
    healthKeyHeader: d.healthKeyHeader ?? 'X-App-Health-Key',
    firstPercent: d.firstPercent ?? 100,
    windowsSigning: d.windowsSigning ?? 'self-signed',
    publish: d.publish ?? null,
  };
  if (platforms.mac || platforms.windows) {
    const kind = desktop.publish?.kind;
    if (!['azure-blob', 'ssh'].includes(kind)) problems.push('desktop.publish.kind must be azure-blob or ssh (where the installers and update feeds go)');
    if (kind === 'azure-blob' && !(desktop.publish.storageAccount && desktop.publish.container)) problems.push('desktop.publish needs storageAccount and container');
    if (kind === 'ssh' && !(desktop.publish.connection && desktop.publish.folder)) problems.push('desktop.publish needs connection (an SSH service connection) and folder');
    if (!desktop.feedUrl) problems.push('desktop.feedUrl is missing (the https folder installed apps read latest.yml from)');
    if (!['self-signed', 'azure-artifact-signing'].includes(desktop.windowsSigning)) problems.push('desktop.windowsSigning must be self-signed or azure-artifact-signing');
  }
  return {
    file, root, raw, problems,
    kit: raw?.kit ?? null,
    app: { name, slug: raw?.app?.slug ?? null, publisher: raw?.app?.publisher ?? name, country: raw?.app?.country ?? 'NL' },
    platforms, apps, testflight, keys, pipelines,
    desktop,
    mobile: {
      dir: at(raw?.mobile?.dir ?? 'mobile'),
      syncIos: raw?.mobile?.syncIos ?? 'npx cap sync ios',
      syncAndroid: raw?.mobile?.syncAndroid ?? 'npx cap sync android',
      firstScreen: raw?.mobile?.firstScreen ?? '.*',
      offlineText: raw?.mobile?.offlineText ?? null,
    },
    android: { firstTrack: 'internal', productionFraction: 0.2, ...(raw?.android ?? {}) },
  };
}

export function loadConfig({ start = process.cwd(), env = process.env } = {}) {
  const file = findConfig(start, env);
  if (!file) throw new Error(`No ${CONFIG_FILE} found from ${start} upwards. Run the app-shipping setup first, or set APP_RELEASE_CONFIG.`);
  return normalize(JSON.parse(readFileSync(file, 'utf8')), file);
}

/** The app a command works on (`--app <key>`, default main), with what that command needs from it. */
export function requireApp(config, key = 'main', needs = []) {
  const app = config.apps[key];
  if (!app) throw new Error(`${CONFIG_FILE} has no apps.${key} (it has ${Object.keys(config.apps).join(', ') || 'none'})`);
  for (const field of needs) if (!app[field]) throw new Error(`${CONFIG_FILE}: apps.${key}.${field} is missing`);
  return app;
}

/** The Key Vault secret name for a kit secret, with the app's prefix (two apps can share one vault). */
export const secretName = (config, name) => `${config.keys.prefix}${name}`;

/** Reads one value by its dotted path (`apps.main.bundleId`), for shell scripts. */
export function get(config, path) {
  return path.split('.').reduce((v, k) => (v === null || v === undefined ? undefined : v[k]), config);
}

// node app-release/config.mjs get <dotted.path>   prints the value (empty line when unset), exit 1 without a settings file
// node app-release/config.mjs problems            prints what is missing in the settings file, exit 1 when anything is
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const config = loadConfig();
    const [command, path] = process.argv.slice(2);
    if (command === 'get') {
      const v = get(config, path ?? '');
      console.log(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    } else if (command === 'problems') {
      for (const p of config.problems) console.log(p);
      process.exit(config.problems.length ? 1 : 0);
    } else throw new Error('use get <path> or problems');
  } catch (e) { console.error(e.message); process.exit(1); }
}
