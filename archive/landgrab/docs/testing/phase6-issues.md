# Phase 6 — Stealth, CommandoRaid, JagerProoi: Test Results

**Test file:** `/tmp/lg-test-phase6.mjs`
**Result:** 12/12 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| Stealth | `stealthUntil` set on player; broken immediately when hostile player enters the same hex | PASS |
| CommandoRaid | On arrival at target hex, hex is immediately claimed by attacker without a standard combat roll | PASS |
| JagerProoi | Hunter gains +3 troops; prey player's role is rotated to next in list | PASS |

## Bugs / Issues Found

_None._

## Notes

- **Stealth break mechanics**: `stealthUntil` is cleared (`null`) when a copresent hostile player enters the stealth player's hex. The stealth buff does not survive copresence with hostiles.
- **CommandoRaid**: Unlike standard `ClaimHex` (which requires `effectiveAttack > effectiveDefense`), CommandoRaid bypasses this check. The hex ownership is transferred directly. Troops on the claimed hex are set to 1.
- **JagerProoi rotation**: The prey player's `role` field cycles through available roles in the `Roles` array. This is the only mechanic that mutates another player's role at runtime.
