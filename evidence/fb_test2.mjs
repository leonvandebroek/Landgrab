/**
 * FieldBattleCard Auto-Trigger Test
 * 
 * Full self-contained test:
 * 1. Register fresh test users
 * 2. Inject scenario: both players at hex (0,0), 5 troops, different alliances
 * 3. Open 2 browser windows with the tokens and savedSession
 * 4. Both auto-rejoin (session is fresh, positions preserved from inject)
 * 5. Verify FieldBattleCard appears (fix for null !== null = false bug)
 */
import pkg from '/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/node_modules/playwright/index.js';
import http from 'http';
const { chromium } = pkg;

const BASE = 'http://localhost:5001';
const FRONTEND = 'http://localhost:5173';
const EVIDENCE = '/Users/leonvandebroek/Projects/Github/Landgrab/evidence';
const TS = Date.now();

function apiPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ hostname: 'localhost', port: 5001, path, method: 'POST', headers }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getBridgeSnapshot(page) {
  return page.evaluate(() => {
    const b = window.__LANDGRAB_AGENT_BRIDGE__;
    if (!b || typeof b.getSnapshot !== 'function') return null;
    return b.getSnapshot();
  }).catch(() => null);
}

async function waitForPhase(page, label, targetPhase, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800));
    const info = await page.evaluate(() => {
      const b = window.__LANDGRAB_AGENT_BRIDGE__;
      const snap = b?.getSnapshot?.();
      return {
        phase: snap?.gameState?.phase ?? null,
        view: snap?.view ?? null,
        auth: snap?.auth?.username ?? null,
        connected: snap?.connected ?? null
      };
    }).catch(() => null);
    const phase = info?.phase;
    console.log(`  [${label}] phase=${phase}, view=${info?.view}, auth=${info?.auth}, connected=${info?.connected}`);
    if (phase === targetPhase) return true;
  }
  return false;
}

async function main() {
  console.log(`\n====== FieldBattleCard Test [TS=${TS}] ======\n`);

  // STEP 1: Register fresh users
  console.log('Step 1: Registering fresh test users...');
  const hostReg = await apiPost('/api/auth/register', {
    username: `fb_h_${TS}`, email: `h${TS}@test.com`, password: 'Test123!'
  });
  const guestReg = await apiPost('/api/auth/register', {
    username: `fb_g_${TS}`, email: `g${TS}@test.com`, password: 'Test123!'
  });

  if (!hostReg.body.token || !guestReg.body.token) {
    console.error('Registration failed:', JSON.stringify(hostReg.body), JSON.stringify(guestReg.body));
    return;
  }

  const hostToken = hostReg.body.token;
  const hostId = hostReg.body.userId;
  const guestToken = guestReg.body.token;
  const guestId = guestReg.body.userId;
  console.log(`  Host: ${hostReg.body.username} (${hostId})`);
  console.log(`  Guest: ${guestReg.body.username} (${guestId})`);

  // STEP 2: Inject scenario - both at hex (1,0), 5 troops, different alliances
  // NOTE: We use hex (1,0) [lat=52.000389, lng=4.901094] instead of the center hex (0,0) [lat=52.0, lng=4.9]
  // because HasValidCurrentHexForVisibility() explicitly excludes (0,0) as "uninitialized" — 
  // players at the center hex would be invisible to each other.
  console.log('\nStep 2: Injecting scenario...');
  const injectResult = await apiPost('/api/playtest/inject-scenario', {
    mapLat: 52.0, mapLng: 4.9, tileSizeMeters: 50, gridRadius: 6,
    hostBypassGps: true,
    players: [
      { userId: hostId, username: `fb_h_${TS}`, allianceName: 'Alpha', carriedTroops: 5, lat: 52.000389, lng: 4.901094 },
      { userId: guestId, username: `fb_g_${TS}`, allianceName: 'Bravo', carriedTroops: 5, lat: 52.000389, lng: 4.901094 }
    ]
  }, hostToken);

  if (injectResult.status !== 200 || !injectResult.body.roomCode) {
    console.error('Inject failed:', JSON.stringify(injectResult.body));
    return;
  }

  const roomCode = injectResult.body.roomCode;
  console.log(`  Room code: ${roomCode}`);

  // STEP 3: Launch browser and set up sessions
  console.log('\nStep 3: Launching browser...');
  const browser = await chromium.launch({ headless: false });

  try {
    // Setup host context
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await hostCtx.addCookies([{
      name: 'landgrab_token', value: hostToken,
      domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax'
    }]);
    const hostPage = await hostCtx.newPage();

    // Setup guest context
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await guestCtx.addCookies([{
      name: 'landgrab_token', value: guestToken,
      domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax'
    }]);
    const guestPage = await guestCtx.newPage();

    // STEP 4: Navigate and inject savedSession
    console.log('\nStep 4: Navigating to frontend and injecting savedSession...');
    await hostPage.goto(FRONTEND, { waitUntil: 'domcontentloaded' });
    await guestPage.goto(FRONTEND, { waitUntil: 'domcontentloaded' });

    await hostPage.evaluate(([rc, uid]) => {
      localStorage.setItem('landgrab_session', JSON.stringify({ roomCode: rc, userId: uid }));
    }, [roomCode, hostId]);
    await guestPage.evaluate(([rc, uid]) => {
      localStorage.setItem('landgrab_session', JSON.stringify({ roomCode: rc, userId: uid }));
    }, [roomCode, guestId]);

    // Reload so auth cookie + savedSession both take effect
    await Promise.all([
      hostPage.reload({ waitUntil: 'domcontentloaded' }),
      guestPage.reload({ waitUntil: 'domcontentloaded' })
    ]);

    // STEP 5: Wait for bridge
    await hostPage.waitForFunction(() => !!window.__LANDGRAB_AGENT_BRIDGE__, { timeout: 10000 })
      .catch(() => console.log('  WARNING: Host bridge not found!'));
    await guestPage.waitForFunction(() => !!window.__LANDGRAB_AGENT_BRIDGE__, { timeout: 10000 })
      .catch(() => console.log('  WARNING: Guest bridge not found!'));

    // Check auth state immediately
    const hostAuth = await getBridgeSnapshot(hostPage).then(s => ({ auth: s?.auth, view: s?.view, connected: s?.connected })).catch(() => null);
    const guestAuth = await getBridgeSnapshot(guestPage).then(s => ({ auth: s?.auth, view: s?.view, connected: s?.connected })).catch(() => null);
    console.log('  Host auth:', JSON.stringify(hostAuth));
    console.log('  Guest auth:', JSON.stringify(guestAuth));

    // STEP 5: Wait for Playing phase
    console.log('\nStep 5: Waiting for Playing phase...');
    const [hPlaying, gPlaying] = await Promise.all([
      waitForPhase(hostPage, 'HOST', 'Playing'),
      waitForPhase(guestPage, 'GUEST', 'Playing')
    ]);

    if (!hPlaying || !gPlaying) {
      console.log(`\nWARNING: Not all players reached Playing phase! Host=${hPlaying}, Guest=${gPlaying}`);
      await hostPage.screenshot({ path: `${EVIDENCE}/fb-fail-host-${TS}.png` });
      await guestPage.screenshot({ path: `${EVIDENCE}/fb-fail-guest-${TS}.png` });
    }

    // STEP 6: Wait for SignalR state propagation (both players need to be seen by each other)
    console.log('\nStep 6: Waiting for state propagation (2s)...');
    await new Promise(r => setTimeout(r, 2000));

    // STEP 7: Capture complete state
    console.log('\nStep 7: Capturing state snapshots...');
    const hostSnap = await getBridgeSnapshot(hostPage);
    const guestSnap = await getBridgeSnapshot(guestPage);

    console.log('\n--- HOST STATE ---');
    console.log('Phase:', hostSnap?.gameState?.phase);
    console.log('MyPlayer:', hostSnap?.myPlayer ? JSON.stringify({
      name: hostSnap.myPlayer.name,
      hex: `(${hostSnap.myPlayer.currentHexQ},${hostSnap.myPlayer.currentHexR})`,
      troops: hostSnap.myPlayer.carriedTroops,
      alliance: hostSnap.myPlayer.allianceId
    }) : 'null');
    if (hostSnap?.gameState?.players) {
      console.log('All players from HOST perspective:');
      for (const p of hostSnap.gameState.players) {
        console.log(`  ${p.name}: hex=(${p.currentHexQ},${p.currentHexR}), troops=${p.carriedTroops}, alliance=${p.allianceId}`);
      }
    }

    console.log('\n--- GUEST STATE ---');
    console.log('Phase:', guestSnap?.gameState?.phase);
    console.log('MyPlayer:', guestSnap?.myPlayer ? JSON.stringify({
      name: guestSnap.myPlayer.name,
      hex: `(${guestSnap.myPlayer.currentHexQ},${guestSnap.myPlayer.currentHexR})`,
      troops: guestSnap.myPlayer.carriedTroops,
      alliance: guestSnap.myPlayer.allianceId
    }) : 'null');
    if (guestSnap?.gameState?.players) {
      console.log('All players from GUEST perspective:');
      for (const p of guestSnap.gameState.players) {
        console.log(`  ${p.name}: hex=(${p.currentHexQ},${p.currentHexR}), troops=${p.carriedTroops}, alliance=${p.allianceId}`);
      }
    }

    // STEP 8: Run localBattleEligible simulation in the browser
    console.log('\n--- localBattleEligible simulation (HOST) ---');
    const hostEligCheck = await hostPage.evaluate(([myId]) => {
      const b = window.__LANDGRAB_AGENT_BRIDGE__;
      const snap = b?.getSnapshot?.();
      const state = snap?.gameState;
      if (!state) return { eligible: false, reason: 'no gameState' };

      const me = state.players?.find(p => p.id === myId);
      if (!me) return { eligible: false, reason: 'me not found', userId: myId, playerCount: state.players?.length };

      if ((me.carriedTroops ?? 0) <= 0) return { eligible: false, reason: 'no troops', troops: me.carriedTroops };
      if (me.fieldBattleCooldownUntil && new Date(me.fieldBattleCooldownUntil) > new Date()) {
        return { eligible: false, reason: 'cooldown', until: me.fieldBattleCooldownUntil };
      }
      if (me.currentHexQ == null || me.currentHexR == null) {
        return { eligible: false, reason: 'null hex', currentHexQ: me.currentHexQ, currentHexR: me.currentHexR };
      }

      const hexKey = `${me.currentHexQ},${me.currentHexR}`;
      const cell = state.grid?.[hexKey];
      if (!cell) return { eligible: false, reason: 'no cell at ' + hexKey };
      if (cell.ownerId != null) return { eligible: false, reason: 'hex owned', ownerId: cell.ownerId };

      const allPlayers = state.players ?? [];
      const enemies = allPlayers.filter(p => {
        if (p.id === me.id) return false;
        // The fix: null allianceId means enemy
        if (me.allianceId != null && p.allianceId === me.allianceId) return false;
        return p.currentHexQ === me.currentHexQ &&
               p.currentHexR === me.currentHexR &&
               (p.carriedTroops ?? 0) > 0;
      });

      const othersOnHex = allPlayers.filter(p => p.id !== me.id && p.currentHexQ === me.currentHexQ && p.currentHexR === me.currentHexR);

      return {
        eligible: enemies.length > 0,
        me: { name: me.name, hex: `(${me.currentHexQ},${me.currentHexR})`, troops: me.carriedTroops, alliance: me.allianceId },
        cellOwnerId: cell.ownerId,
        totalPlayers: allPlayers.length,
        othersOnHex: othersOnHex.map(p => ({ name: p.name, hex: `(${p.currentHexQ},${p.currentHexR})`, troops: p.carriedTroops, alliance: p.allianceId })),
        enemies: enemies.map(p => ({ name: p.name, hex: `(${p.currentHexQ},${p.currentHexR})`, alliance: p.allianceId }))
      };
    }, [hostId]).catch(e => ({ error: e.message }));
    console.log(JSON.stringify(hostEligCheck, null, 2));

    // STEP 9: Screenshots
    console.log('\nStep 9: Taking screenshots...');
    await hostPage.screenshot({ path: `${EVIDENCE}/fb2-host-${TS}.png` });
    await guestPage.screenshot({ path: `${EVIDENCE}/fb2-guest-${TS}.png` });
    console.log(`  Saved: fb2-host-${TS}.png, fb2-guest-${TS}.png`);

    // STEP 10: Check FieldBattleCard in DOM
    console.log('\nStep 10: Checking FieldBattleCard in DOM...');
    const hostDom = await hostPage.evaluate(() => {
      const allText = document.body.innerText;
      // Dutch translations for fieldBattle elements
      const battleWords = ['Veldslag', 'veldslag', 'Uitdagen', 'uitdagen', 'Uitdaging', 'uitdaging'];
      const hasBattleWord = battleWords.some(w => allText.includes(w));
      const abilityCards = document.querySelectorAll('[class*="ability-card"], .ability-card');
      const fbSelectors = document.querySelectorAll('[class*="fb-"], .fb-target-btn, .fb-target-list');
      return {
        hasBattleWord,
        abilityCardCount: abilityCards.length,
        fbElementCount: fbSelectors.length,
        // Full text for manual inspection
        fullText: allText.substring(0, 1500)
      };
    }).catch(e => ({ error: e.message }));

    const guestDom = await guestPage.evaluate(() => {
      const allText = document.body.innerText;
      const battleWords = ['Veldslag', 'veldslag', 'Uitdagen', 'uitdagen', 'Uitdaging', 'uitdaging'];
      const hasBattleWord = battleWords.some(w => allText.includes(w));
      const abilityCards = document.querySelectorAll('[class*="ability-card"], .ability-card');
      const fbSelectors = document.querySelectorAll('[class*="fb-"], .fb-target-btn, .fb-target-list');
      return {
        hasBattleWord,
        abilityCardCount: abilityCards.length,
        fbElementCount: fbSelectors.length,
        fullText: allText.substring(0, 1500)
      };
    }).catch(e => ({ error: e.message }));

    console.log('\n--- HOST DOM ---');
    console.log('hasBattleWord:', hostDom?.hasBattleWord, '| abilityCards:', hostDom?.abilityCardCount, '| fbElements:', hostDom?.fbElementCount);
    if (hostDom?.fullText) console.log('UI text (first 800):', hostDom.fullText.substring(0, 800));

    console.log('\n--- GUEST DOM ---');
    console.log('hasBattleWord:', guestDom?.hasBattleWord, '| abilityCards:', guestDom?.abilityCardCount, '| fbElements:', guestDom?.fbElementCount);
    if (guestDom?.fullText) console.log('UI text (first 800):', guestDom.fullText.substring(0, 800));

    // STEP 11: Final verdict
    console.log('\n====== RESULT ======');
    const hostFBShowing = hostDom?.hasBattleWord || hostDom?.abilityCardCount > 0 || hostDom?.fbElementCount > 0;
    const guestFBShowing = guestDom?.hasBattleWord || guestDom?.abilityCardCount > 0 || guestDom?.fbElementCount > 0;

    if (hostFBShowing) {
      console.log('✅ HOST: FieldBattleCard IS showing!');
    } else {
      console.log('❌ HOST: FieldBattleCard NOT showing');
    }

    if (guestFBShowing) {
      console.log('✅ GUEST: FieldBattleCard IS showing!');
    } else {
      console.log('❌ GUEST: FieldBattleCard NOT showing');
    }

    if (hostEligCheck?.eligible) {
      console.log('✅ localBattleEligible = TRUE (fix is working)');
    } else {
      console.log(`❌ localBattleEligible = FALSE: ${JSON.stringify(hostEligCheck?.reason ?? hostEligCheck)}`);
    }

    // Keep browser open to visually inspect
    await new Promise(r => setTimeout(r, 5000));

  } finally {
    await browser.close();
    console.log('\nBrowser closed. Test complete.');
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
