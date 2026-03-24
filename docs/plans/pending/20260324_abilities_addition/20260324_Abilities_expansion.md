
# Spec for changing abilities
This spec describes how the current abilities work (current implementation) and how they are supposed to work (target implementation).

## Current implementation
This section describes the abilities as they are currently implemented in the codebase. This is based on the existing code and may not reflect the intended design.

### Commando Raid (Commander — Active)
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

### Tactical Strike (Commander — Active)
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

## Target implementation
This section describes how the abilities are intended to work based on design discussions and plans. This may differ from the current implementation and is meant to reflect the desired functionality.

### Commando Raid (Commander — Active)
**What it does:** Designates the current hex the user is standing on as a raid target visible to all alliance members. Creates a 5-minute countdown for the alliance to converge and capture the target.

**Cooldown:** 15 minutes

**How to use it:**
1. Stand on the target hex
2. Tap **Commando Raid**
3. All alliance members see the raid marker
4. Coordinate convergence within 5 minutes

**Success condition:** At least 2 alliance members must be standing in the target hex at deadline AND their carried troop count must outnumber that of any defenders present
**HQ raids:** Require 40% of the map to be claimed first

**Pro tip:** Use this to coordinate your team's focus. The visible marker helps everyone know where to converge. Time it with a Tactical Strike for maximum effect.

---

### Tactical Strike (Commander — Active)
**What it does:** Marks a hex that is within a maximum range of 1 hexes and the user is actively pointing at (based on bearing) from the hex the user is standing on so any attacks against it bypass Rally (+1) and Fort (+1) defensive bonuses for 5 minutes.

**Cooldown:** 20 minutes  
**Duration:** 5 minutes

**How to use it:**
1. Stand adjacent to the target hex and point towards it
2. Tap **Tactical Strike**
3. The hex is marked for 5 minutes
4. Any ally attacking this hex ignores defensive bonuses

**Pro tip:** Use before attacking a fortified enemy position. Coordinate with alliance members — the strike benefits everyone attacking that hex during the window.

---



## New abilities
This section describes any new abilities that are planned to be added to the game. These are based on design discussions and may not be implemented yet.

### Troop Transfer (Role-agnostic — Active)
**What it does:** Allows a player to transfer troops, on all tiles except enemy tiles, to another player being a member of the same alliance. The player can choose how many troops to transfer, up to the number of troops they are currently carrying. The receiving player can accept or reject the transfer. If accepted, the troops are added to the receiving player's carried troop count and subtracted from the sending player's carried troop count.

**Cooldown:** 1 minute
**How to use it:**
1. Tap **Troop Transfer**
2. Point towards the receiving player (based on bearing)
3. Select the number of troops to transfer
4. The receiving player gets a notification to accept or reject the transfer
5. If accepted, the troops are transferred

**Pro tip:** Use this to support your teammates in the field. If you have excess troops, transfer them to a teammate who is about to engage in combat. Coordinate with your alliance for maximum efficiency.

---
### Field battle (Role-agnostic — Active)
**What it does:** Allows a player to initiate a field battle on the tile they are standing on. This can only be used on tiles that are not owned by any alliance and can only be used when the current player is carrying troops AND the tile is not under any active Tactical Strike or Commando Raid effects AND the player is not currently engaged in another battle AND at least one enemy player is present on the tile AND the enemy player(s) is/are carrying troops. The player with the highest carried troop count wins the battle and claims the tile for their alliance. This ability does not result in claiming a tile. This ability can be used to deplete enemy troops and create an opening for a future attack. Battle resolution is based on field-battle configurable rules that can be set by the host when creating the game. The rules available are: Battle initiator troop count v.s. joined enemy players' troop count sum, Battle initiator troop count v.s. joined enemy player with the highest troop count, Battle initiator troop count + random(0-5) v.s. joined enemy players' troop count sum + random(0-5), Battle initiator troop count + random(0-5) v.s. joined enemy player with the highest troop count + random(0-5). In case of a tie, the player that initiated the battle wins.
**Cooldown:** Cooldown ends when player moves off the tile or when the player is no longer carrying troops, whichever comes first.
**How to use it:**
1. Stand on a neutral tile with at least one enemy player present and carrying troops
2. Tap **Field Battle**
3. Similar modal to the tile attack modal opens showing the players present on the tile but not their troop counts and asking the player to confirm initiating the battle.
4. Enemy players receive a notification that a field battle has been initiated and can choose to join the battle by tapping on the notification and accepting to join the battle within 30 seconds.
5. Player who initiated the battle waits for enemy players to join. If no enemy player joins the battle within 30 seconds, the battle is resolved immediately. If at least one enemy player joins the battle, the battle is resolved immediately. In case of a tie, the player that initiated the battle wins.

---