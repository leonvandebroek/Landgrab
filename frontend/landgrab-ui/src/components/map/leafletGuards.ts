import L from 'leaflet';

/**
 * Leaflet finishes a running pan animation on the next animation frame. When
 * the map was removed in between (a screen change while the map was still
 * gliding), Leaflet reads its panes after they are gone and throws
 * "Cannot read properties of undefined (reading 'classList')". Ignore the
 * end of an animation for a map that no longer exists.
 */
type GuardedMap = L.Map & {
  _mapPane?: HTMLElement;
  _onPanTransitionEnd?: (...args: unknown[]) => void;
  _onZoomTransitionEnd?: (...args: unknown[]) => void;
  _landgrabGuarded?: boolean;
};

const proto = L.Map.prototype as GuardedMap;

if (!proto._landgrabGuarded) {
  proto._landgrabGuarded = true;
  for (const name of ['_onPanTransitionEnd', '_onZoomTransitionEnd'] as const) {
    const original = proto[name];
    if (typeof original === 'function') {
      proto[name] = function guarded(this: GuardedMap, ...args: unknown[]) {
        if (!this._mapPane) return;
        original.apply(this, args);
      };
    }
  }
}
