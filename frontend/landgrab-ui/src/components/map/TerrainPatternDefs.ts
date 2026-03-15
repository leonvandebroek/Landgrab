export function injectTerrainPatternSVG(mapContainer: HTMLElement): void {
  const svg = mapContainer.querySelector('.leaflet-overlay-pane svg');
  if (!svg || svg.querySelector('#terrain-patterns-defs')) return;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.id = 'terrain-patterns-defs';

  const patterns: Array<{ id: string; size: number; content: string }> = [
    {
      id: 'terrain-water',
      size: 12,
      content: '<path d="M0 6 Q3 3 6 6 Q9 9 12 6" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.4"/>',
    },
    {
      id: 'terrain-forest',
      size: 10,
      content: '<circle cx="3" cy="3" r="1.5" fill="#166534" opacity="0.35"/><circle cx="8" cy="7" r="1.5" fill="#166534" opacity="0.35"/>',
    },
    {
      id: 'terrain-park',
      size: 12,
      content: '<circle cx="4" cy="4" r="1.2" fill="#4ade80" opacity="0.3"/><circle cx="10" cy="9" r="1.2" fill="#4ade80" opacity="0.3"/>',
    },
    {
      id: 'terrain-road',
      size: 8,
      content: '<path d="M0 0 L8 8" stroke="#d4a373" stroke-width="1.5" opacity="0.3"/>',
    },
    {
      id: 'terrain-building',
      size: 8,
      content: '<rect x="1" y="1" width="3" height="3" fill="none" stroke="#6b7280" stroke-width="0.5" opacity="0.3"/><rect x="5" y="5" width="3" height="3" fill="none" stroke="#6b7280" stroke-width="0.5" opacity="0.3"/>',
    },
    {
      id: 'terrain-hills',
      size: 12,
      content: '<path d="M2 8 L6 4 L10 8" fill="none" stroke="#a16207" stroke-width="1" opacity="0.35"/>',
    },
    {
      id: 'terrain-steep',
      size: 6,
      content: '<path d="M0 0 L6 6" stroke="#78350f" stroke-width="1" opacity="0.35"/><path d="M3 0 L9 6" stroke="#78350f" stroke-width="1" opacity="0.35"/>',
    },
    {
      id: 'terrain-path',
      size: 8,
      content: '<circle cx="2" cy="4" r="0.8" fill="#c2b280" opacity="0.3"/><circle cx="6" cy="4" r="0.8" fill="#c2b280" opacity="0.3"/>',
    },
  ];

  for (const p of patterns) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.id = p.id;
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', String(p.size));
    pattern.setAttribute('height', String(p.size));
    pattern.innerHTML = p.content;
    defs.appendChild(pattern);
  }

  svg.insertBefore(defs, svg.firstChild);
}
