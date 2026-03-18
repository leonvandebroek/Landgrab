import L from 'leaflet';

export class ReactSvgOverlay extends L.Layer {
  private _svg!: SVGSVGElement;
  private _rootG!: SVGGElement;
  private readonly _pane: string;
  private _className: string;

  constructor(options?: { pane?: string; className?: string }) {
    super();
    this._pane = options?.pane ?? 'overlayPane';
    this._className = options?.className?.trim() ?? '';
  }

  override onAdd(map: L.Map): this {
    const pane = map.getPane(this._pane) ?? map.getPane('overlayPane');
    if (!pane) {
      throw new Error(`[ReactSvgOverlay] Leaflet pane not found: ${this._pane}`);
    }

    this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this._svg.setAttribute('class', this._buildClassName());
    this._svg.style.position = 'absolute';
    this._svg.style.overflow = 'visible';
    this._svg.style.pointerEvents = 'none';

    this._rootG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this._rootG.style.pointerEvents = 'auto';
    this._svg.appendChild(this._rootG);

    pane.appendChild(this._svg);

    this._updatePosition();
    map.on('zoom viewreset', this._updatePosition, this);
    map.on('moveend', this._updatePosition, this);

    return this;
  }

  getContainer(): SVGGElement {
    return this._rootG;
  }

  getSvg(): SVGSVGElement {
    return this._svg;
  }

  setClassName(className: string): void {
    this._className = className.trim();
    if (this._svg) {
      this._svg.setAttribute('class', this._buildClassName());
    }
  }

  override onRemove(map: L.Map): this {
    map.off('zoom viewreset', this._updatePosition, this);
    map.off('moveend', this._updatePosition, this);
    this._svg.remove();
    return this;
  }

  private _updatePosition(): void {
    const map = this._map;
    if (!map || !this._svg) {
      return;
    }

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._svg as unknown as HTMLElement, topLeft);

    const size = map.getSize();
    this._svg.setAttribute('width', String(size.x));
    this._svg.setAttribute('height', String(size.y));
    this._rootG.setAttribute('transform', `translate(${-topLeft.x},${-topLeft.y})`);
  }

  private _buildClassName(): string {
    return ['hex-overlay-svg', this._className].filter(Boolean).join(' ');
  }
}
