import L from 'leaflet';

const PDOK_ATTRIBUTION =
    'Kaartgegevens &copy; <a href="https://www.kadaster.nl">Kadaster</a> / <a href="https://www.pdok.nl">PDOK</a> (CC0)';
const MAP_MAX_ZOOM = 19;
const TOP25_NATIVE_MAX_ZOOM = 16;
const WMTS_NATIVE_MAX_ZOOM = 19;

function createPdokWmtsLayer(style: 'standaard' | 'grijs'): L.TileLayer {
    return L.tileLayer(
        `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${style}/EPSG:3857/{z}/{x}/{y}.png`,
        {
            attribution: PDOK_ATTRIBUTION,
            crossOrigin: true,
            maxNativeZoom: WMTS_NATIVE_MAX_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            minZoom: 6,
        }
    );
}

export function createPdokBaseLayers(): {
    brtStandard: L.TileLayer;
    brtGray: L.TileLayer;
    top25: L.TileLayer.WMS;
} {
    return {
        brtStandard: createPdokWmtsLayer('standaard'),
        brtGray: createPdokWmtsLayer('grijs'),
        top25: L.tileLayer.wms('https://service.pdok.nl/brt/topraster/wms/v1_0?', {
            attribution: PDOK_ATTRIBUTION,
            crossOrigin: true,
            format: 'image/png',
            layers: 'top25raster',
            maxNativeZoom: TOP25_NATIVE_MAX_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            transparent: false,
            version: '1.3.0',
        }),
    };
}

export { MAP_MAX_ZOOM, TOP25_NATIVE_MAX_ZOOM };