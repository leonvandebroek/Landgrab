# Landgrab — Game Manual

**The neighborhood war game. Your streets. Your rules. Your victory.**

---

## Table of Contents

1. [What is Landgrab?](#what-is-landgrab)
2. [Game Modes](#game-modes)
3. [Getting Started (Alliances Mode)](#getting-started-alliances-mode)
4. [Roles](#roles)
5. [Abilities Reference](#abilities-reference)
6. [How a Turn Works](#how-a-turn-works)
7. [Combat](#combat)
8. [Territory & Troop Management](#territory--troop-management)
9. [Fog of War & Visibility](#fog-of-war--visibility)
10. [Win Conditions](#win-conditions)
11. [The Map](#the-map)
12. [Free-for-All (Global Map)](#free-for-all-global-map)
13. [Tips for New Players](#tips-for-new-players)

---

## What is Landgrab?

Landgrab is a **real-world territory game** where your neighborhood becomes the battlefield. A hexagonal grid overlays actual streets, parks, and buildings. You physically move through the world (or use keyboard controls on desktop) to claim hexes, build armies, coordinate with allies, and fight for territorial dominance.

**The core fantasy:** You're a field commander in a living neighborhood war. The streets you walk become battle lines. The park is a strategic chokepoint. Your phone is your war table.

**What makes it special:**
- **The map is YOUR neighborhood** — real buildings, real roads, real terrain
- **Movement is physical** — you walk to claim territory
- **Combat is tactical** — positioning, roles, and coordination matter
- **The fog of war** means you never know the full picture

---

## Game Modes

### Alliances Mode (Room-Based)
The primary competitive mode. A host creates a room, players join with a code, and the game unfolds on a local hex grid anchored to a real-world location. Teams (alliances) compete for territorial control in real-time.

**The feel:** A neighborhood skirmish. 20-60 minutes. Fast, tense, social. You're coordinating with your alliance on the ground.

**Key features:**
- Up to 8 players in up to 8 alliances
- Host configures everything: map location, game rules, win conditions, player roles
- Real-time gameplay — no turns, everyone acts simultaneously
- Games are ephemeral — they exist in memory and end when a win condition is met

### Free-for-All (Global Map)
A persistent, always-on world map. No turns, no rooms — just open territory. You claim hexes, attack neighbors, and climb the leaderboard.

**The feel:** A slow-burn empire builder. Check in throughout the day. Expand when you can. Defend what you have.

**Key features:**
- Join anytime, play anytime
- No game setup — just start claiming
- Actions have cooldowns but no turn structure
- Your territory survives server restarts
- Global leaderboard tracks the top 20 players

---

## Getting Started (Alliances Mode)

### Creating an Account
1. Open Landgrab and tap **Sign Up**
2. Enter a username (this is what other players see)
3. Enter your email (private, for password reset only)
4. Create a password (minimum 8 characters)
5. Tap **Create Account**

> **Privacy note:** Only your username is shown to other players. Your email stays hidden.

### Hosting a Game
When you create a room, you become the host. You'll guide everyone through a 6-step setup wizard:

#### Step 1: Choose Your Battlefield
Set the center of the game map. This determines where everyone plays.

**Options:**
- **Use my current location** — Tap to use GPS
- **Enter coordinates manually** — Input latitude and longitude

> **Pro tip:** Choose a location that's walkable for all players. Parks, neighborhoods, and open areas work best.

#### Step 2: Invite Players & Pick Teams
Share your **6-character room code** with friends. They'll enter it to join.

**Alliance setup (host only):**
- Add up to 8 alliances (tap **Add**)
- Name each alliance
- Assign players to alliances using the dropdown next to their name
- Or tap **Distribute Players Randomly** to auto-assign

**Ready indicators:**
- Each player shows connection status and alliance status
- Game won't start until all connected players have chosen an alliance
- Minimum 2 players required to start

#### Step 3: Game Rules
Configure how the match plays out. Defaults are already set, so you can skip ahead if they look good.

**Tile size:**
- How large each hex is in the real world (meters)
- Smaller tiles = finer control, larger tiles = faster coverage

**Claim mode:**
- **Presence only:** Just walk onto a hex to claim it
- **Presence with troop:** Neutral claims spend 1 carried troop
- **Border your territory:** You can only claim hexes touching your team's territory

**Win condition:**
- **Territory %:** First team to control X% of the map wins (default 60%)
- **Elimination:** Eliminate all other players by taking all their hexes
- **Timed game:** Game lasts X minutes, highest territory at the end wins

#### Step 4: Game Dynamics
Configure optional gameplay mechanics.

**Presets:**
- **Classic** — Traditional territory control
- **Balanced** — Dice-based combat with probabilistic outcomes
- **Siege** — Defender-advantage mode, harder to capture territory

**Features (toggle on/off):**
- **Beacon enabled** — Scout role gets directional visibility cone
- **Tile decay enabled** — Hexes lose troops if unvisited for 3+ minutes
- **Enemy sighting memory** — How long enemy intel persists (0, 15, 30, 60, or 120 seconds)
- **Player roles enabled** — Unlock Commander, Scout, Engineer roles with unique abilities
- **HQ enabled** — Each alliance gets a home base; capturing it freezes enemy claims for 5 minutes
- **HQ auto-assign** — Automatically assigns HQ to first owned tile

#### Step 5: Player Roles (if enabled)
Assign a role to each player from the dropdown next to their name. Roles grant unique abilities during the game.

**Available roles:**
- **Commander** — Offensive coordination and combat bonuses
- **Scout** — Intelligence gathering and vision control
- **Engineer** — Infrastructure manipulation and sabotage

Tap **Randomize roles** to auto-assign randomly.

> **Strategic note:** A balanced team has all three roles. No single player can do everything.

#### Step 6: Review & Start
Review your settings. Home base and starting tiles will be placed automatically when you start.

**Optional:**
- Toggle **Customize tile placements** to manually place home base and starting tiles on a map editor

When ready, tap **Start Game** 🚀

### Joining a Game
1. Tap **Join Room** on the home screen
2. Enter the **6-character room code** your host shared
3. Tap **Join**
4. Wait for the host to configure the game
5. When prompted, **pick your alliance** from the dropdown
6. Wait for the host to start the game

**As a guest, you'll see:**
- Step 1: "The host is choosing the battlefield location…"
- Step 2: Your alliance picker
- Steps 3-6: Waiting screens with progress indicators

### The Lobby Screen
Before the game starts, you'll see:
- **Room code** (top bar) — share this with friends
- **Players list** — who's connected and their alliance status
- **Connection status chip** — "Connected" or "Connecting…"
- **Your alliance** — which team you're on
- **Ready indicators** — who's ready to play

---

## Roles

Roles are **optional** — the host enables them in Step 4 of setup. When enabled, each player picks a role that grants unique abilities. Roles create asymmetric gameplay: no single player can do everything, so team coordination becomes essential.

### 🔭 Scout

**What makes this role special:**  
You are the eyes of the alliance. You see what others cannot. You're the early warning system, the intel gatherer, the one who keeps your team from walking into traps.

**Passive abilities:**
- **Always-On Beacon:** Your beacon activates automatically when you have a valid GPS position. It creates a directional visibility cone (45° by default) extending 3 hexes in the direction you're facing. This reveals enemy territory and troop positions within the cone.
- **Sabotage Alert:** When an enemy Engineer starts a sabotage mission within 3 hexes of you, you receive an alert. You're the only role that gets this early warning.

**Active abilities:**
- **Share Intel** (60s cooldown) — Broadcasts all hex intel within your beacon cone to every alliance member's memory. They can now see what you see, even after you move away.
- **Intercept** (no cooldown) — Counters an enemy Engineer's active sabotage. Must be in the same hex as the saboteur, face them within 20° for 5 seconds while they're NOT facing you within 90°. On success, cancels their sabotage and blocks that hex from re-sabotage for 5 minutes.

> **Strategic tip:** Scouts don't fight — they decide where to fight. Without a Scout, your alliance is blind beyond its own borders. Use Share Intel before major pushes to give your team the full picture.

**How it plays differently:**  
Scouts spend time on the edges of friendly territory, rotating their heading to sweep the horizon. You report positions, intercept saboteurs, and gather intel — not engaging enemies directly.

---

### ⚔️ Commander

**What makes this role special:**  
You're the tactical leader. You call the shots — where to strike, when to rally, how to break enemy defenses. Your abilities directly impact combat outcomes.

**Passive abilities:**
- **Commander Presence:** When you're physically present in a hex where an ally is attacking, your ally gets **+1 attack strength**. You don't need to be the attacker — just being there provides the bonus.

**Active abilities:**
- **Commando Raid** (15 min cooldown) — Designates an adjacent enemy hex as a raid target visible to all alliance members. Creates a 5-minute countdown for your team to converge and capture the target. HQ raids require 40% of the map to be claimed first.
- **Tactical Strike** (20 min cooldown) — Marks a hex (current or adjacent) for a tactical strike. Attacks against this hex bypass Rally and Fort defensive bonuses for 5 minutes. The key ability for cracking fortified positions.
- **Rally Point** (15 min cooldown) — Plants a rally flag on your current friendly hex. Alliance members have 3 minutes to converge. When the deadline expires, bonus troops are awarded: +2 troops per converged ally, capped at 2× alliance size.

> **Strategic tip:** The Commander is the offensive playmaker. Without a Commander, your alliance has no way to coordinate pushes or crack fortified positions. Stay close to the front line to provide combat bonuses.

**How it plays differently:**  
Commanders stay in the thick of it. You need to be physically present for combat bonuses, adjacent to targets for abilities, and on friendly territory for Rally Point. You're always at the front.

---

### 🔧 Engineer

**What makes this role special:**  
You're the builder and saboteur. You shape the battlefield itself — fortifying your positions and undermining the enemy's. While others fight, you change what the map *means*.

**Active abilities (no passive bonuses):**
- **Fort Construction** (no cooldown) — Starts building a fort on your current owned hex. You must physically walk the entire 6-hex perimeter around the target to complete. Fort grants **+1 defense bonus** permanently (until demolished).
- **Sabotage** (20 min cooldown) — Targets an enemy hex you're standing on. Walk 3 of the 6 neighboring hexes to complete. On completion, the target hex **cannot regenerate troops for 10 minutes**. Scouts can intercept this.
- **Demolish** (30 min cooldown) — Targets an enemy fort you're standing on. Move to 3 different neighboring hexes, facing the fort within 20° for 5 seconds at each. On completion, the fort is destroyed.

> **Strategic tip:** The Engineer is the long game. Forts compound over time — a fortified hex is much harder to take. Sabotage starves enemy positions, making them vulnerable. Demolish removes enemy fortifications before assaults.

**How it plays differently:**  
Engineers have "missions" — multi-step physical tasks requiring specific walking patterns. You're frequently away from battles, circling enemy positions or fortifying rear territory. Always working on something, always vulnerable.

---

## Abilities Reference

A complete reference for every ability in the game.

| Ability | Role | What it does | Cooldown | Duration/Cost |
|---------|------|--------------|----------|---------------|
| **Beacon** | Scout | Creates a directional 3-hex visibility cone showing enemy positions | None (passive) | Always on |
| **Share Intel** | Scout | Shares all tiles in your beacon cone with alliance members | 60 seconds | Instant snapshot |
| **Intercept** | Scout | Cancels enemy Engineer's sabotage if you face them for 5s | None | 5s lock required |
| **Commando Raid** | Commander | Designates adjacent hex as 5-minute raid target for alliance | 15 minutes | 5 min deadline |
| **Tactical Strike** | Commander | Marks hex so attacks bypass Rally/Fort bonuses | 20 minutes | 5 minutes |
| **Rally Point** | Commander | Plants rally flag; allies converge for bonus troops | 15 minutes | 3 min convergence |
| **Fort Construction** | Engineer | Build permanent +1 defense fort by walking full perimeter | None | Walk 6 neighbors |
| **Sabotage** | Engineer | Disables target hex troop regen for 10 minutes | 20 minutes | Walk 3 neighbors |
| **Demolish** | Engineer | Destroys enemy fort by facing from 3 directions | 30 minutes | 3 × 5s facing |

### Detailed Ability Guides

#### Beacon (Scout — Passive)
**What it does:** Creates a 45° cone extending 3 hexes in the direction you're facing. Reveals enemy hex ownership, troop counts, and fort status within the cone.

**How to use it:**
1. Move to a position near enemy territory
2. Rotate your heading to sweep the area
3. The cone updates automatically as you turn

**Pro tip:** Sweep enemy borders before a push. Monitor enemy troop movements on the front line. Provide early warning of incoming attacks.

---

#### Share Intel (Scout — Active)
**What it does:** Takes a snapshot of everything in your beacon cone and writes it to every alliance member's fog-of-war memory.

**Cooldown:** 60 seconds

**How to use it:**
1. Position your beacon cone over the area you want to share
2. Tap **Share Intel**
3. All alliance members now see what you saw, even after you move away

**Pro tip:** Share before a coordinated push so everyone knows troop distributions. Share periodically to keep alliance awareness updated.

---

#### Intercept (Scout — Active)
**What it does:** Counters an enemy Engineer's sabotage mission. If successful, cancels their sabotage and blocks that hex from re-sabotage for 5 minutes.

**No cooldown** (situational)

**How to use it:**
1. Get an alert that an enemy Engineer is sabotaging nearby
2. Move to the same hex as the Engineer
3. Face them within 20° while they're NOT facing you within 90°
4. Hold for 5 seconds
5. Success! Their sabotage is cancelled

**Pro tip:** This creates a real-world cat-and-mouse dynamic. The Engineer can counter by turning to face you. Protect critical hexes from sabotage.

---

#### Commando Raid (Commander — Active)
**What it does:** Designates an adjacent hex as a raid target visible to all alliance members. Creates a 5-minute countdown for the alliance to converge and capture the target.

**Cooldown:** 15 minutes

**How to use it:**
1. Stand adjacent to the target hex
2. Tap **Commando Raid**
3. Select the target hex
4. All alliance members see the raid marker
5. Coordinate convergence within 5 minutes

**Success condition:** At least 2 alliance members must be standing in the target hex at deadline AND must outnumber any defenders present  
**HQ raids:** Require 40% of the map to be claimed first

**Pro tip:** Use this to coordinate your team's focus. The visible marker helps everyone know where to converge. Time it with a Tactical Strike for maximum effect.

---

#### Tactical Strike (Commander — Active)
**What it does:** Marks a hex so that attacks against it bypass Rally (+1) and Fort (+1) defensive bonuses for 5 minutes.

**Cooldown:** 20 minutes  
**Duration:** 5 minutes

**How to use it:**
1. Stand on or adjacent to the target hex
2. Tap **Tactical Strike**
3. Select the target
4. The hex is marked for 5 minutes
5. Any ally attacking this hex ignores defensive bonuses

**Pro tip:** Use before attacking a fortified enemy position. Coordinate with alliance members — the strike benefits everyone attacking that hex during the window.

---

#### Rally Point (Commander — Active)
**What it does:** Plants a rally marker on your current friendly hex. Alliance members have 3 minutes to physically converge. When the deadline expires, bonus troops are deposited on the hex.

**Cooldown:** 15 minutes  
**Duration:** 3-minute convergence window  
**Troop bonus:** +2 troops per converged ally, capped at 2× alliance size

**How to use it:**
1. Stand on a friendly hex
2. Tap **Rally Point**
3. All alliance members see the rally marker
4. Everyone has 3 minutes to reach the hex
5. At the deadline, bonus troops are awarded based on who showed up

**Example:** 3-player alliance, 2 players converge → +4 bonus troops (capped at 6 max)

**Pro tip:** Build up troop concentrations before a major offensive. Rally at a forward position to create a staging ground.

---

#### Fort Construction (Engineer — Active)
**What it does:** Builds a permanent fort on a hex you own. Requires physically walking the entire 6-hex perimeter. Once complete, the hex gets +1 defense in all combat.

**No cooldown** (but only one construction at a time)

**How to use it:**
1. Stand on your own hex
2. Tap **Fort Construction**
3. Walk the full perimeter (all 6 adjacent hexes)
4. Progress bar shows completion percentage
5. When complete, the hex becomes fortified

**Cancellation:** If the hex is captured mid-construction, the mission fails.

**Pro tip:** Fortify chokepoints and strategic hexes. Fortify your HQ. Build a defensive line before the enemy can push through.

---

#### Sabotage (Engineer — Active)
**What it does:** Targets an enemy hex. Walk 3 of the 6 neighboring hexes to complete. On success, the target hex cannot regenerate troops for 10 minutes.

**Cooldown:** 20 minutes after completion

**How to use it:**
1. Stand on an enemy hex
2. Tap **Sabotage**
3. Walk 3 of the 6 adjacent hexes
4. Progress bar shows completion
5. When complete, the hex is sabotaged for 10 minutes

**Warning:** Enemy Scouts get an alert when you start. They can intercept you if they reach your hex.

**Pro tip:** Soften a key enemy position before an assault. Disable regen on a front-line hex so your attacks stick. Target high-troop hexes to prevent rebuilding.

---

#### Demolish (Engineer — Active)
**What it does:** Destroys an enemy fort. Approach from 3 different neighboring hexes, facing the fort within 20° for 5 continuous seconds at each.

**Cooldown:** 30 minutes after completion

**How to use it:**
1. Walk onto the enemy fort hex
2. Tap **Demolish** to initiate
3. Move to each of 3 different adjacent hexes (neighboring the fort):
   - Face the fort within 20°
   - Hold for 5 continuous seconds
   - Move to the next adjacent hex
4. When all 3 approaches complete, the fort is destroyed

**Warning:** If you move or turn away, the facing timer resets.

**Pro tip:** Remove key defensive fortifications before a Commander-led assault. Target enemy forts on strategic chokepoints.

---

## How a Turn Works

**Wait, there are no turns!**

In Alliances mode, gameplay is **real-time**. All players act simultaneously. There's no "your turn" or "their turn" — everyone is always playing at the same time.

### The Real-Time Cycle

**What happens continuously:**

1. **You move** — Walk in the real world (GPS) or use arrow keys (desktop). Your hex position updates automatically.

2. **Troops regenerate** — Every 30 seconds, owned hexes gain troops:
   - **+1 troop** per hex (base rate)
   - **+3 troops** if you're physically standing in your own hex (3× bonus)
   - **+0 troops** if an enemy is standing in your hex (hostile drain)
   - **+0 troops** if the hex is sabotaged (Engineer ability)

3. **You take actions:**
   - **Claim** neutral hexes (if adjacent to your territory or you meet claim mode requirements)
   - **Attack** enemy hexes (spend carried troops to fight)
   - **Pick up troops** from your own hexes (carry them for attacks or reinforcements)
   - **Place troops** on hexes to reinforce

4. **Abilities activate:**
   - Scouts share intel
   - Commanders call raids and strikes
   - Engineers build, sabotage, demolish

5. **Win condition checks** — After every significant action, the game checks if anyone has won

### Key Differences from Turn-Based Games

| Turn-Based | Landgrab (Real-Time) |
|------------|----------------------|
| Wait for your turn | Act anytime |
| Roll dice for moves | No dice, just walk |
| Fixed action points | No limits (except cooldowns) |
| Plan ahead during enemy turn | React in real-time |
| Predictable timing | Chaotic and dynamic |

### What This Means for You

- **You can't "wait it out"** — enemies are always moving
- **Coordination is live** — talk to your team in real-time
- **Timing matters** — rally points expire, strikes have windows, sabotage missions can be intercepted
- **You must patrol** — unattended territory decays (if tile decay is enabled)

---

## Combat

Combat happens when you attack an enemy-owned hex. The outcome depends on troop counts, defensive bonuses, and the combat mode configured by the host.

### How Attacking Works

1. **Move adjacent to an enemy hex** while carrying troops
2. **Tap ATTACK** on the action bar
3. **Select number of troops** to deploy (slider appears)
4. **Confirm attack**
5. **Combat resolves** instantly — dice roll (in Balanced/Siege modes) or strength comparison (Classic mode)
6. **Results broadcast** — you see combat log, map updates to show winner

### What the Dice Represent

In **Balanced** and **Siege** combat modes, both attacker and defender roll dice:

- **Attacker:** Each attacking troop has a chance to inflict a hit (remove 1 defender troop)
- **Defender:** Each defending troop has a chance to inflict a hit (remove 1 attacker troop)
- **Win probability** is calculated based on effective attack vs. defense strength, then clamped to 20-80%
- **3 rounds** of dice rolling occur, or until one side is eliminated

**Classic mode** skips dice entirely — highest effective strength wins.

### Combat Bonuses

Your effective combat strength includes bonuses from various sources:

**Attacker bonuses:**
- **Commander Presence (+1):** An allied Commander is physically in the target hex during the attack

**Defender bonuses:**
- **Rally (+1):** The hex is "fortified" — 2 or more allied players are physically present
- **Fort (+1):** The hex has a permanent fort (built by an Engineer)
- **Siege Defender (+25%):** In Siege combat mode, defenders get +25% effective defense (rounded up)

**Negation:**
- **Tactical Strike** (Commander ability) bypasses both Rally and Fort bonuses for 5 minutes

### Combat Modes

The host chooses the combat mode during setup:

#### Classic (Deterministic)
- **Resolution:** Pure strength comparison. Higher effective strength wins.
- **Attacker wins:** Keeps max(1, AttackerTroops - DefenderTroops) troops on captured hex
- **Attacker loses:** Loses up to 50% of attacking troops (minimum 1)
- **Feel:** Predictable. You can calculate outcomes before attacking. Rewards numerical superiority.

#### Balanced (Probabilistic)
- **Resolution:** Up to 3 rounds of dice combat
- **Each round:** Both sides roll for hits based on win probability
- **Win probability:** effectiveAttack / (effectiveAttack + effectiveDefence), clamped to 20-80%
- **Feel:** Exciting but uncertain. Even weak defenders can sometimes hold.

#### Siege (Defender Advantage)
- **Resolution:** Same dice mechanics as Balanced
- **Siege bonus:** Defender gets +25% effective defense (rounded up)
- **Feel:** Extremely hard to take territory. Attackers need significant numerical advantage or Tactical Strike.

### Troop Losses

**When you win:**
- Defender loses all troops
- Attacker keeps remaining troops after casualties
- You capture the hex

**When you lose:**
- Attacker loses troops (varies by combat mode)
- Defender keeps hex and surviving troops
- You retreat empty-handed

**Examples:**

**Classic mode:**
- Attack with 10 troops vs. 6 defenders → You win with 4 troops remaining
- Attack with 5 troops vs. 8 defenders → You lose 2-3 troops, defender keeps hex

**Balanced mode:**
- Attack with 10 troops vs. 6 defenders (60% win chance) → Roll 3 rounds, outcome varies
- Could win with 7 troops left, or lose with 2 troops remaining — dice decide

---

## Territory & Troop Management

### How Troops Regenerate

Every **30 seconds**, your owned hexes automatically gain troops:

- **Base rate:** +1 troop per hex per tick
- **Copresence boost:** +3 troops instead of +1 if a friendly player is physically present in the hex
- **Master tile:** Always gains +1 troop (never decays, never drains)

**This means:**
- Attended hexes grow **3× faster** than unattended ones
- Standing in your own territory is a powerful economic boost
- The longer you stay, the more troops you accumulate

### How the Presence Bonus Works

**Stand on your own hex = 3× regen.**

When you (or an ally) physically occupy one of your hexes at the moment the 30-second regeneration tick happens, that hex gets +3 troops instead of +1.

**Example:**
- 10 hexes unattended: +10 troops per 30s
- 1 hex attended, 9 unattended: +3 + 9 = +12 troops per 30s
- 2 hexes attended, 8 unattended: +6 + 8 = +14 troops per 30s

**Strategic implications:**
- **Patrol key hexes** — rotate presence to maximize growth
- **Coordinate with allies** — split coverage to boost multiple hexes
- **Rally Point is a multiplier** — all converged players boost the hex simultaneously

### Shepherd Decay

If **Tile Decay** is enabled (host setting), hexes that go unvisited for more than **3 minutes** start losing troops:

- **Effect:** -1 troop per 30s tick (instead of +1)
- **Trigger:** 3+ minutes since last friendly player visit
- **Reset:** Visit the hex to restart the decay timer

**This punishes overextension** — you must patrol your territory or it withers. You can't just claim everything and forget about it.

### Hostile Drain

When an **enemy player** is physically standing in your hex at the regeneration tick, that hex gains **0 troops** instead of the normal amount.

**This is a powerful harassment tactic:**
- Stand in enemy territory to deny their regen
- Force them to respond or lose economic growth
- Combine with an attack to keep them from rebuilding

### Sabotage Effect

When an Engineer successfully sabotages a hex, it **cannot regenerate troops for 10 minutes**.

**Effect:** The hex is frozen — 0 troops per tick, no matter what
**Duration:** 10 minutes from completion
**Interaction:** Presence bonus, hostile drain, and decay don't matter — sabotaged hexes always get 0

### Picking Up and Carrying Troops

You can pick up troops from your own hexes and carry them:

1. **Stand on your own hex** with troops
2. **Tap PICK UP** on the action bar
3. **Select number of troops** to pick up (slider)
4. **Confirm**
5. Your **carried troops count** increases

**Single-source constraint:** You can only carry troops from one source hex at a time. If you pick up from a second hex, the previous carried troops are returned to their original hex.

**Use cases:**
- Concentrate troops at the front line for attacks
- Reinforce weak positions
- Claim neutral territory (if Presence With Troop mode is enabled)

---

## Fog of War & Visibility

Fog of War is **always active** — you only see a subset of the map, and the rest is darkness. The host can configure **Enemy Sighting Memory**, which controls how long remembered intel about enemy tiles persists after they leave your vision.

### What You Can See (Visible)

1. **Your own territory:** Every hex owned by you or your alliance is always fully visible with live troop counts.

2. **Adjacent enemy hexes:** Hexes directly bordering your alliance's territory are visible (alliance border visibility). You always know what's on the other side of your front lines.

3. **Proximity:** Hexes within **1 hex** of your current position are visible regardless of ownership.

4. **Beacon cone (Scout only):** If you're a Scout, your beacon reveals hexes up to **3 hexes** in the direction you're facing within a 45° cone.

### What You Cannot See (Hidden/Remembered)

- Enemy territory beyond your borders
- Troop movements in distant parts of the map
- New forts or sabotage effects outside your vision
- Enemy player positions beyond your visible range

### Remembered Tiles: Stale Intel

When a hex transitions from visible to not-visible, it enters a **Remembered** state. You see the *last known* information:

- Who owned it
- How many troops it had
- Whether it was a fort

**This data ages:**
- **Fading (0-120 seconds):** Intel is recent. Displayed with a slight amber tint.
- **Stale (120+ seconds):** Intel is old. Strong amber visual treatment with **"ARCHIVED"** badge. Reality may have changed significantly.

**On the map:**
- Remembered hexes show "ARCHIVED" indicator
- The data is frozen in time — troop counts don't update
- You're guessing how accurate it still is

### Hidden Tiles

Hexes you've never seen or that have no remembered data show as **"Unknown territory"** — complete darkness.

### How Scout's Beacon Extends Visibility

When Beacon is enabled and you're a Scout:

1. Your beacon automatically activates when you have valid GPS
2. A **3-hex cone** (45° by default) extends in the direction you're facing
3. Everything in the cone is visible — enemy positions, troop counts, forts
4. As you rotate, the cone sweeps — updating what you see

**This is personal vision** — only you see it by default.

### How Share Intel Shares Your Vision

To share what your beacon sees with allies:

1. Position your beacon over the area you want to share
2. Tap **Share Intel** (60s cooldown)
3. All alliance members' fog-of-war memory is updated with what you saw
4. They now see that intel, even after you move away

**This is the primary intel-sharing mechanism** — without it, allies remain blind beyond their own borders.

### Alliance Border Visibility

**Free intel for everyone:**  
All hexes directly adjacent to your alliance's territory are automatically visible to all alliance members.

**This means:**
- You always see one hex deep into enemy territory at your borders
- The front line is your intelligence line
- Expansion extends your vision

### Strategic Implications

- **Scouts become essential** — they're the only way to get deep intel
- **Attacks into fog are risky** — you don't know enemy troop counts
- **Feints become possible** — the enemy can't see your full force
- **Border intel is your edge** — defend borders to keep vision
- **Remembered intel decays** — that "5 troops" you saw 3 minutes ago might be 15 now

---

## Win Conditions

The host chooses the win condition during setup. Win conditions are checked after every significant action.

### Territory Percent (Default)

**Goal:** Be the first player/alliance to control X% of the map.

**Default:** 60% of claimable hexes (excludes master tile)

**How it works:**
- Your territory count increases every time you claim or capture a hex
- When your count reaches the threshold, you win
- Formula: (Your hexes / Total claimable hexes) × 100 ≥ Target %

**Tiebreaker:** If 100% of the map is claimed and no one has hit the threshold yet, the player/alliance with the highest territory count wins.

**Alliance wins:** All alliance members must collectively reach the threshold.

### Elimination

**Goal:** Be the last player/alliance with territory remaining.

**How it works:**
- When a player/alliance loses their last hex, they're eliminated
- Game continues until only one player/alliance has territory
- Winner is determined when ≤1 player/alliance remains

**Tiebreaker:** Highest current territory count wins. If still tied, winner is determined alphabetically by name (ascending, case-insensitive).

### Timed Game

**Goal:** Have the most territory when the timer expires.

**How it works:**
- Game lasts X minutes (host-configured)
- When time expires, the player/alliance with the highest territory count wins
- Countdown timer is visible in the top bar

**Tiebreaker:** If tied, winner is determined alphabetically by name (ascending, case-insensitive).

### HQ Capture

When **HQ mode** is enabled:

**Effect of losing your HQ:**
- Your alliance suffers a **5-minute claim freeze**
- You cannot claim neutral hexes for 5 minutes
- You can still attack enemy hexes

**HQ raids (via Commander Commando Raid):**
- Unlocked when ≥40% of the map is claimed
- Prevents early-game HQ rushes
- If the raid succeeds, HQ is captured and claim freeze applies

**Recapturing your HQ:**
- HQ hexes are **immune to direct combat**. The only way to capture an enemy HQ is via a Commander's **Commando Raid** ability.
- Your alliance must use a Commando Raid to recapture your own HQ as well.
- The 5-minute claim freeze runs its **full duration** regardless of whether you recapture the HQ. Recapturing prevents further freezes but does not cancel the current one.

### Alliance Wins vs Solo Wins

**Alliance victory:**
- All alliance members share the win
- Requires entire alliance to collectively meet the win condition
- Individual contributions don't matter — it's a team win

**Solo victory:**
- One player wins alone
- Happens when alliances are not used or when playing Free-for-All

---

## The Map

### What the Icons and Colors Mean

**Hex colors:**
- **Your color** — Hexes you own
- **Alliance colors** — Hexes owned by alliance members (if in an alliance)
- **Enemy colors** — Hexes owned by opponents
- **Gray** — Neutral/unclaimed hexes
- **Amber/faded** — Remembered intel (stale data)
- **Dark/fog** — Hidden/unknown territory

**Icons:**
- **🏠 HQ marker** — Alliance headquarters (if HQ mode enabled)
- **🏰 Fort icon** — Hex has a fort (+1 defense)
- **⚑ Rally Point flag** — Active Commander rally
- **🎯 Raid target marker** — Active Commando Raid
- **🔴 Tactical Strike marker** — Hex marked for tactical strike
- **👁️ Beacon cone** — Scout's visibility cone (Scout only)
- **ARCHIVED** — Remembered intel (stale data)
- **Player dots** — Player positions (if visible)

### Tile Info Card

When you tap a hex, a tile info card appears showing:

**For your own hexes:**
- Hex coordinates (q, r)
- Owner (You or alliance member name)
- Troop count
- Fort status
- Last visited time (if tile decay enabled)
- Sabotage status (if sabotaged)

**For enemy hexes:**
- Hex coordinates
- Owner name
- Troop count (if visible)
- Fort status (if visible)
- **Contested** badge (if adjacent to friendly territory)
- **ARCHIVED** indicator (if remembered intel)

**For neutral hexes:**
- Hex coordinates
- "Neutral hex" label
- Claim mode requirements
- Adjacency status

### How to Read Your HUD

**Top bar:**
- **Room code badge** — Your game's code
- **Alliance name** — Your team (if in an alliance)
- **Phase** — "⚡ Real-time match"
- **Timer** — Countdown (if timed game)
- **Territory progress** — "{Your count} / {Total} ({Percent}%)"

**Bottom bar:**
- **Player initials badge** — Your color-coded indicator
- **Carried troops count** — Troops you're carrying
- **Current tile coordinates** — "⬡ q, r"
- **Tile owner** — Colored dot + name
- **Troops on tile count**
- **Action buttons** — CLAIM, ATTACK, REINF., PICK UP (contextual)

**Guidance hints:**
- "Enable GPS to get move hints."
- "Walk onto the game grid."
- "Tap here to pick up troops."
- "This tile is empty — find more troops."
- "Carrying troops — expand or attack."

**Side menu buttons:**
- **Players** — View scores and standings
- **Event Log** — Combat results and game events
- **Menu** — Settings and options

**Map controls (bottom right):**
- Zoom in/out buttons
- Center on GPS button
- Compass rotation toggle
- Follow me toggle ("Auto-pan on" / "Auto-pan off")
- Map layers toggle
- Map legend toggle

### Map Legend

Tap **Map legend** to view:
- Hex color key (your team, enemies, neutral)
- Icon explanations (fort, HQ, rally, raid, etc.)
- Visibility tiers (visible, remembered, hidden)
- Troop count ranges (if applicable)

---

## Free-for-All (Global Map)

The persistent, always-on world map. No rooms, no setup, no turns — just claim territory and climb the leaderboard.

### How to Start

1. Sign in to Landgrab
2. Tap **Play Free-for-All** (or equivalent button)
3. You're automatically placed on the nearest unclaimed hex within a 5-hex radius
4. You start with **3 troops** on that hex
5. Start claiming!

### How It Differs from Alliances Mode

| Feature | Alliances Mode | Free-for-All |
|---------|----------------|--------------|
| **Setup** | Host configures | None — just join |
| **Turns** | Real-time, no turns | Real-time, no turns |
| **Alliances** | Teams | Solo only |
| **Roles** | Optional (Commander/Scout/Engineer) | No roles |
| **Abilities** | Full ability system | No abilities |
| **Combat** | 3 modes (Classic/Balanced/Siege) | Simplified (d6 + troop bonus vs d6) |
| **Persistence** | Ephemeral (ends at game over) | Persistent (survives restarts) |
| **Win condition** | Territory %/Elimination/Timed | Leaderboard climb |
| **Duration** | 20-60 minutes | Ongoing (check in anytime) |

### How to Claim and Attack

**Claiming neutral hexes:**
1. Move adjacent to an unclaimed hex
2. Tap **CLAIM**
3. Hex is yours — no troops spent, no combat

**Attacking enemy hexes:**
1. Move adjacent to an enemy hex while carrying troops
2. Tap **ATTACK**
3. Select troops to deploy
4. Combat resolves (simplified dice: d6 + troop bonus for attacker vs d6 for defender)
5. Ties go to the defender

**Simplified combat:**
- Attacker rolls 1d6 and gets **+1** if they have more troops than the defender
- Defender rolls 1d6 (no bonus)
- Attacker wins if their roll is **strictly greater** than the defender's roll — ties go to the **defender**
- Outcomes are probabilistic — even weak defenders can hold

### Cooldown After Failed Attack

If you attack and **lose**:
- You suffer a **5-minute cooldown** before you can attack again from that hex
- You can still claim neutral hexes
- You can still attack from different hexes
- Cooldown is per-hex, not global

**This prevents spam attacking** — you must choose your battles carefully.

### Persistence

Everything you do in Free-for-All is **permanent**:
- Your territory survives server restarts
- Troop counts persist
- Ownership records are stored in PostgreSQL
- You can leave and come back anytime

### Leaderboard

Check the **Global Leaderboard** to see the top 20 players by hex count:

- **Rank** — Your position
- **Player name**
- **Hex count** — Total territory owned
- **Last active** — When they last played

**Climb the leaderboard by:**
- Claiming more territory
- Attacking and capturing enemy hexes
- Defending your borders

### No Win Condition

Free-for-All has **no end state** — the game continues indefinitely. Your goal is to:
- Maximize your territory
- Climb the leaderboard
- Dominate your region

---

## Tips for New Players

1. **Start small, expand carefully**  
   Don't overextend in the first few minutes. Claim a cluster of hexes, let them regenerate troops, then expand. Wide empires with thin defenses are easy targets.

2. **Presence is power**  
   Standing in your own hex gives 3× troop regeneration. Spend time on your territory to build up forces before attacking.

3. **Watch your borders**  
   Alliance border visibility shows you one hex deep into enemy territory. Use this free intel to spot buildups and threats.

4. **Coordinate with your team**  
   If roles are enabled, no single player can do everything. A Scout without a Commander can't coordinate strikes. A Commander without an Engineer can't crack forts. Talk to your team.

5. **Use abilities wisely**  
   Cooldowns are long (15-30 minutes). Don't waste a Tactical Strike on a low-value hex. Save Rally Point for major offensives. Time abilities together for maximum impact.

6. **Fortify chokepoints, not everything**  
   Engineer fort construction takes time. Fortify strategic positions — HQ, narrow passages, high-traffic areas. Don't waste time fortifying rear territory.

7. **Attack with overwhelming force**  
   Combat bonuses and dice rolls can swing outcomes. Always attack with significantly more troops than the defender has. 2:1 is risky. 3:1 is safer.

8. **Patrol your territory (if tile decay is on)**  
   Hexes decay after 3 minutes unvisited. Rotate through your territory or lose troops. Don't just claim and forget.

9. **Use fog of war to your advantage**  
   If fog is enabled, the enemy can't see your full force. Stage troops in rear hexes, then move them forward all at once. Feint attacks to draw attention, then strike elsewhere.

10. **In Free-for-All, patience wins**  
    You can't capture everything at once. Claim slowly, build up, defend your borders. Every failed attack costs you a 5-minute cooldown. Choose battles carefully.

---

## Additional Resources

- **Gameplay Videos** — Watch how experienced players coordinate roles and strategies
- **Discord Community** — Join to find teammates and discuss tactics
- **Patch Notes** — Stay updated on balance changes and new features

---

**Good luck, Commander. Your neighborhood awaits.**
