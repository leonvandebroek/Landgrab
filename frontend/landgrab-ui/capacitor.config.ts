import type { CapacitorConfig } from '@capacitor/cli';

// The iPhone and Android app (app-release.config.json at the repository root ships it).
//
// The app loads the live web app from the server instead of the copy in dist/: sign-in uses a same-origin,
// SameSite=Strict cookie and the API and game hub are called on relative /api and /hub URLs, which only work on the
// server's own origin. Web changes then reach the app without a store build; only native changes (plugins,
// permissions) need one. dist/ is still bundled: offline.html is shown when the server cannot be reached.
const LIVE_URL = process.env.LANDGRAB_APP_URL ?? 'https://app-landgrab-prod.azurewebsites.net';

const config: CapacitorConfig = {
  appId: 'app.landgrab',
  appName: 'Landgrab',
  webDir: 'dist',
  server: {
    url: LIVE_URL,
    cleartext: LIVE_URL.startsWith('http://'),
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
