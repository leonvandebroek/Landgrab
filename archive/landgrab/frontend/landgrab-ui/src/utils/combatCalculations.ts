import { hexNeighbors, roomHexToLatLng } from '../components/map/HexMath';
import type { CombatBonusDetail, CombatPreviewDto, GameState, HexCell, Player } from '../types/game';

export function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (lat1 === lat2 && lng1 === lng2) {
    return 0;
  }

  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaLambda = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

export function headingDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

export function normalizeHeading(heading: number): number {
  if (!Number.isFinite(heading)) {
    return 0;
  }

  let normalized = heading % 360;
  if (normalized < 0) {
    normalized += 360;
  }

  return normalized;
}

export function resolveRaidTarget(
  player: Player,
  state: GameState,
): { targetQ: number; targetR: number } | null {
  if (state.phase !== 'Playing') {
    return null;
  }
  if (!state.dynamics.playerRolesEnabled) {
    return null;
  }
  if (player.role !== 'Commander') {
    return null;
  }
  if (player.currentHexQ == null || player.currentHexR == null) {
    return null;
  }

  return { targetQ: player.currentHexQ, targetR: player.currentHexR };
}

export function resolveTacticalStrikeTarget(
  player: Player,
  state: GameState,
  heading: number,
): { targetQ: number; targetR: number } | null {
  if (state.phase !== 'Playing') {
    return null;
  }
  if (!state.dynamics.playerRolesEnabled) {
    return null;
  }
  if (!state.hasMapLocation || state.mapLat == null || state.mapLng == null) {
    return null;
  }
  if (!Number.isFinite(heading)) {
    return null;
  }
  if (player.role !== 'Commander') {
    return null;
  }
  if (player.currentHexQ == null || player.currentHexR == null) {
    return null;
  }
  if (player.currentLat == null || player.currentLng == null) {
    return null;
  }

  const normalizedHeading = normalizeHeading(heading);
  let closestDiff: number | null = null;
  let closestHex: { targetQ: number; targetR: number } | null = null;

  for (const [candidateQ, candidateR] of hexNeighbors(player.currentHexQ, player.currentHexR)) {
    const candidateKey = `${candidateQ},${candidateR}`;
    if (!(candidateKey in state.grid)) {
      continue;
    }

    const [candidateLat, candidateLng] = roomHexToLatLng(
      candidateQ,
      candidateR,
      state.mapLat,
      state.mapLng,
      state.tileSizeMeters,
    );
    const candidateBearing = bearingDegrees(
      player.currentLat,
      player.currentLng,
      candidateLat,
      candidateLng,
    );
    const diff = headingDiff(normalizedHeading, candidateBearing);

    if (closestDiff !== null && diff >= closestDiff) {
      continue;
    }

    closestDiff = diff;
    closestHex = { targetQ: candidateQ, targetR: candidateR };
  }

  return closestDiff !== null && closestDiff <= 30 ? closestHex : null;
}

export function resolveTroopTransferTarget(
  player: Player,
  allPlayers: Player[],
  heading: number,
): { recipientId: string; recipientName: string } | null {
  if (player.currentLat == null || player.currentLng == null) {
    return null;
  }
  if (!player.allianceId) {
    return null;
  }
  if (!Number.isFinite(heading) || heading < 0 || heading > 360) {
    return null;
  }

  const normalizedHeading = normalizeHeading(heading);
  let bestDistance: number | null = null;
  let bestTarget: { recipientId: string; recipientName: string } | null = null;

  for (const candidate of allPlayers) {
    if (candidate.id === player.id) {
      continue;
    }
    if (candidate.allianceId !== player.allianceId) {
      continue;
    }
    if (candidate.currentLat == null || candidate.currentLng == null) {
      continue;
    }

    const candidateBearing = bearingDegrees(
      player.currentLat,
      player.currentLng,
      candidate.currentLat,
      candidate.currentLng,
    );
    const diff = headingDiff(normalizedHeading, candidateBearing);
    if (diff > 45) {
      continue;
    }

    const latDiff = player.currentLat - candidate.currentLat;
    const lngDiff = player.currentLng - candidate.currentLng;
    const distanceScore = latDiff * latDiff + lngDiff * lngDiff;

    if (bestDistance !== null && distanceScore >= bestDistance) {
      continue;
    }

    bestDistance = distanceScore;
    bestTarget = { recipientId: candidate.id, recipientName: candidate.name };
  }

  return bestTarget;
}

export function calculateCombatPreview(
  player: Player,
  targetCell: HexCell,
  q: number,
  r: number,
  allPlayers: Player[],
  state: GameState,
): CombatPreviewDto {
  const combatMode = state.dynamics.combatMode ?? 'Balanced';
  const attackerBonuses: CombatBonusDetail[] = [];
  const defenderBonuses: CombatBonusDetail[] = [];

  const tacticalStrikeUsed = state.dynamics.playerRolesEnabled
    && player.tacticalStrikeActive === true
    && player.tacticalStrikeTargetQ === q
    && player.tacticalStrikeTargetR === r;

  if (targetCell.isFortified && !tacticalStrikeUsed) {
    defenderBonuses.push({ source: 'Rally', value: 1 });
  }
  if (targetCell.isFort && !tacticalStrikeUsed) {
    defenderBonuses.push({ source: 'Fort', value: 1 });
  }

  if (state.dynamics.playerRolesEnabled) {
    const commanderPresent = allPlayers.some((candidate) => (
      candidate.currentHexQ === q
      && candidate.currentHexR === r
      && candidate.role === 'Commander'
      && candidate.allianceId === player.allianceId
    ));

    if (commanderPresent) {
      attackerBonuses.push({ source: 'Commander', value: 1 });
    }
  }

  const attackerBonusTotal = attackerBonuses.reduce((sum, bonus) => sum + bonus.value, 0);
  const defenderBonusTotal = defenderBonuses.reduce((sum, bonus) => sum + bonus.value, 0);
  const effectiveAttack = player.carriedTroops + attackerBonusTotal;
  let effectiveDefence = targetCell.troops + defenderBonusTotal;

  if (combatMode === 'Siege') {
    const siegeBonus = Math.ceil(effectiveDefence * 0.25);
    defenderBonuses.push({ source: 'Siege Defender Advantage', value: siegeBonus });
    effectiveDefence += siegeBonus;
  }

  let attackerWinProbability: number;
  if (combatMode === 'Classic') {
    attackerWinProbability = effectiveAttack > effectiveDefence ? 1 : 0;
  } else {
    const totalPower = effectiveAttack + effectiveDefence;
    if (totalPower <= 0) {
      attackerWinProbability = 0.5;
    } else {
      const rawProbability = effectiveAttack / totalPower;
      attackerWinProbability = Math.max(0.2, Math.min(0.8, rawProbability));
    }
  }

  const defenderAllianceName = targetCell.ownerAllianceId == null
    ? null
    : state.alliances.find((alliance) => alliance.id === targetCell.ownerAllianceId)?.name ?? null;

  return {
    attackerTroops: player.carriedTroops,
    defenderTroops: targetCell.troops,
    effectiveAttack,
    effectiveDefence,
    attackerWinProbability,
    attackerBonuses,
    defenderBonuses,
    combatMode,
    defenderName: targetCell.ownerName ?? 'Unknown defender',
    defenderAllianceName,
  };
}