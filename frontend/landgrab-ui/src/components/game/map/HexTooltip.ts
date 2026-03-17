import i18n from '../../../i18n';
import type { HexCell } from '../../../types/game';
import { terrainIcons } from '../../../utils/terrainIcons';

export function buildHexTooltipHtml(
  cell: HexCell,
  currentHex: [number, number] | null,
  isContested = false,
): string {
  const owner = escapeHtml(cell.ownerName ?? i18n.t('map.unclaimed'));
  const terrainType = cell.terrainType ?? 'None';
  const terrainIcon = terrainType !== 'None' ? escapeHtml(terrainIcons[terrainType] ?? '') : '';
  const terrainName = terrainType !== 'None' ? escapeHtml(i18n.t(`terrain.${terrainType}` as never)) : '';
  const ownerColor = escapeHtml(cell.ownerColor ?? 'transparent');
  const fortInfo = cell.isFort ? `<div class="tooltip-stat"><span class="tooltip-stat-icon">🏰</span>${escapeHtml(i18n.t('map.fort'))}</div>` : '';
  const contestedInfo = isContested
    ? `<div class="tooltip-stat"><span class="tooltip-stat-icon">⚔️</span>${escapeHtml(i18n.t('map.contestedLabel' as never, { defaultValue: 'Contested' }))} - ${escapeHtml(i18n.t('map.contestedDescription' as never, { defaultValue: 'borders enemy territory' }))}</div>`
    : '';

  const distance = currentHex == null ? null : getHexDistance([cell.q, cell.r], currentHex);
  const distanceHtml = distance == null
    ? ''
    : `<div class="tooltip-distance">${distance} hex${distance !== 1 ? 'es' : ''}</div>`;

  return `<div class="tooltip-card">
    <div class="tooltip-header">
      <span class="tooltip-terrain-icon">${terrainIcon}${terrainName ? ` ${terrainName}` : ''}</span>
    </div>
    <div class="tooltip-owner">
      <span class="tooltip-owner-swatch" style="background:${ownerColor}"></span>
      ${owner}${cell.isMasterTile ? ' 👑' : ''}
    </div>
    <div class="tooltip-stat"><span class="tooltip-stat-icon">⚔️</span>${cell.troops}</div>
    ${fortInfo}${contestedInfo}${distanceHtml}
  </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getHexDistance(a: [number, number], b: [number, number]): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs((a[0] + a[1]) - (b[0] + b[1]))
  );
}
