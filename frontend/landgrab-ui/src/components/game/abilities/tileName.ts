import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../../types/game';

/** A tile in plain words ("Your tile", "Owls tile"), never its coordinates. */
export function describeTile(
  t: TFunction,
  state: GameState | null | undefined,
  me: Player | null | undefined,
  q: number | null | undefined,
  r: number | null | undefined,
): string {
  if (q == null || r == null || !state) return '–';
  const cell = state.grid[`${q},${r}`];
  if (!cell) return t('ui.play.outside');
  if (cell.isMasterTile) return t('ui.play.centreTile');
  if (!cell.ownerId) return t('ui.play.freeTile');
  if (cell.ownerId === me?.id) return t('ui.play.yourTile');
  const team = state.alliances.find((alliance) => alliance.id === cell.ownerAllianceId);
  if (team) return t('ui.play.teamTile', { team: team.name });
  return t('ui.play.playerTile', { name: cell.ownerName ?? '?' });
}
