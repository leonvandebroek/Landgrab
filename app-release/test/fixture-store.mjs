// A small store folder for the tests, made in a temporary folder: two languages, texts that fit, and real PNG files in
// the sizes Apple takes (a plain colour, so they stay a few kilobytes). Nothing binary is kept in the repository.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A valid grey PNG of width x height. */
export function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit greyscale
  const row = Buffer.alloc(width + 1, 0x80); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const text = (lang) => ({
  name: 'Example App',
  subtitle: lang === 'nl' ? 'Een voorbeeld' : 'An example',
  promotionalText: 'Example App does one thing well.',
  keywords: 'example,test,sample',
  shortDescription: 'Example App does one thing well.',
  description: `Example App is the sample app of the release kit tests (${lang}).`,
  whatsNew: 'The first version.',
  supportUrl: `https://example.com/${lang}/`,
  marketingUrl: `https://example.com/${lang}/`,
  privacyPolicyUrl: `https://example.com/${lang}/privacy/`,
  betaDescription: 'The test version of Example App.',
  feedbackEmail: 'support@example.com',
});

export const LISTING = {
  primaryLocale: 'nl-NL',
  locales: ['nl-NL', 'en-GB'],
  copyright: '2026 Example Publisher',
  ios: {
    primaryCategory: 'UTILITIES', secondaryCategory: 'PRODUCTIVITY', contentRights: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
    free: true, baseTerritory: 'NLD', screenshotSets: { 'iphone-69': 'APP_IPHONE_67', 'ipad-13': 'APP_IPAD_PRO_3GEN_129' },
  },
  review: { contactFirstName: 'Sam', contactLastName: 'Example', contactPhone: '+31000000000', contactEmail: 'support@example.com', notes: 'Sign in with the demo account.' },
};

/** Makes the folder and returns its path. `listing` overrides parts of listing.json. */
export function makeStore({ listing = {}, shots = 3 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'store-'));
  const l = { ...LISTING, ...listing, ios: { ...LISTING.ios, ...(listing.ios ?? {}) } };
  writeFileSync(join(dir, 'listing.json'), JSON.stringify(l, null, 2));
  for (const locale of l.locales) writeFileSync(join(dir, `${locale}.json`), JSON.stringify(text(locale.slice(0, 2)), null, 2));
  const iphone = png(1320, 2868), ipad = png(2064, 2752);
  for (const locale of l.locales) {
    for (const [folder, img] of [['iphone-69', iphone], ['ipad-13', ipad]]) {
      const d = join(dir, 'screenshots/ios', locale, folder);
      mkdirSync(d, { recursive: true });
      for (let i = 1; i <= shots; i++) writeFileSync(join(d, `${i}.png`), img);
    }
  }
  mkdirSync(join(dir, 'android'), { recursive: true });
  writeFileSync(join(dir, 'android/icon-512.png'), png(512, 512));
  return dir;
}
