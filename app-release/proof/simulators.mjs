// Picks an iPhone and an iPad simulator from `xcrun simctl list devices available -j`.
//   node simulators.mjs <list.json>  -> prints "iphone <udid> <name>" and "ipad <udid> <name>", exit 1 if one is missing
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function runtimeVersion(key) {
  const m = /iOS-(\d+)-(\d+)/.exec(key);
  return m ? Number(m[1]) * 1000 + Number(m[2]) : -1;
}

/** Newest iOS runtime first; within it the last name in sort order (iPhone 17 beats iPhone 16, Pro models are fine). */
export function pickSimulators(list) {
  const runtimes = Object.keys((list && list.devices) || {}).filter((k) => runtimeVersion(k) >= 0).sort((a, b) => runtimeVersion(b) - runtimeVersion(a));
  const pick = (re, avoid) => {
    for (const rt of runtimes) {
      const found = list.devices[rt].filter((d) => d.isAvailable !== false && re.test(d.name) && !(avoid && avoid.test(d.name)));
      found.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
      if (found.length) return { udid: found[found.length - 1].udid, name: found[found.length - 1].name, runtime: rt };
    }
    return null;
  };
  return { iphone: pick(/^iPhone/, /\b(SE|Air|Plus|mini)\b/i) || pick(/^iPhone/), ipad: pick(/^iPad/, /mini/i) || pick(/^iPad/) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const picked = pickSimulators(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  for (const [k, v] of Object.entries(picked)) if (v) console.log(`${k} ${v.udid} ${v.name}`);
  process.exit(picked.iphone && picked.ipad ? 0 : 1);
}
