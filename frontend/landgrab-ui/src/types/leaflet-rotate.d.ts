import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
  }

  interface Map {
    setBearing(bearing: number, options?: ZoomPanOptions): this;
    getBearing(): number;
  }
}