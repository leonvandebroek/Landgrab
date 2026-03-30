import L from 'leaflet';

const PDOK_ATTRIBUTION =
    'Kaartgegevens &copy; <a href="https://www.kadaster.nl">Kadaster</a> / <a href="https://www.pdok.nl">PDOK</a> (CC0)';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const ESRI_ATTRIBUTION =
    'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community';
const MAP_MAX_ZOOM = 19;
const TOP25_NATIVE_MAX_ZOOM = 16;
const WMTS_NATIVE_MAX_ZOOM = 19;
const HILLSHADE_NATIVE_MAX_ZOOM = 13;
const ESRI_TOPO_NATIVE_MAX_ZOOM = 19;

export type MapLookPreset = 'nightVision' | 'military' | 'blackWhite' | 'normal';
export type BasemapLayer = L.TileLayer | L.TileLayer.WMS;
export type GameBasemapId = 'normal' | 'terrain' | 'top25' | 'elevation';

export interface GameBasemapDefinition {
    id: GameBasemapId;
    labelKey: 'map.layerNormal' | 'map.layerTerrain' | 'map.layerTopo' | 'map.layerElevation';
    layer: BasemapLayer;
    recommendedLook: Extract<MapLookPreset, 'military' | 'blackWhite' | 'normal'>;
}

export const MAP_LOOK_TO_BASEMAP: Record<MapLookPreset, GameBasemapId> = {
    nightVision: 'top25',
    military: 'terrain',
    blackWhite: 'normal',
    normal: 'normal',
};

function createPdokWmtsLayer(style: 'standaard' | 'grijs'): L.TileLayer {
    return L.tileLayer(
        `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${style}/EPSG:3857/{z}/{x}/{y}.png`,
        {
            attribution: PDOK_ATTRIBUTION,
            className: `pdok-layer pdok-layer--${style === 'standaard' ? 'standard' : 'gray'}`,
            maxNativeZoom: WMTS_NATIVE_MAX_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            minZoom: 6,
        }
    );
}

function createOpenStreetMapLayer(): L.TileLayer {
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: OSM_ATTRIBUTION,
        className: 'pdok-layer pdok-layer--osm',
        maxNativeZoom: WMTS_NATIVE_MAX_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        minZoom: 3,
    });
}

function createTerrainLayer(): L.TileLayer {
    return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: ESRI_ATTRIBUTION,
        className: 'pdok-layer pdok-layer--terrain',
        maxNativeZoom: ESRI_TOPO_NATIVE_MAX_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        minZoom: 3,
    });
}

function createWorldHillshadeLayer(): L.TileLayer {
    return L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
        {
            attribution: ESRI_ATTRIBUTION,
            className: 'pdok-layer pdok-layer--elevation',
            maxNativeZoom: HILLSHADE_NATIVE_MAX_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            minZoom: 3,
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
            className: 'pdok-layer pdok-layer--top25',
            format: 'image/png',
            layers: 'top25raster',
            maxNativeZoom: TOP25_NATIVE_MAX_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            transparent: false,
            version: '1.3.0',
        }),
    };
}

export function createGameBaseLayers(): GameBasemapDefinition[] {
    const { top25 } = createPdokBaseLayers();

    return [
        {
            id: 'normal',
            labelKey: 'map.layerNormal',
            layer: createOpenStreetMapLayer(),
            recommendedLook: 'normal',
        },
        {
            id: 'terrain',
            labelKey: 'map.layerTerrain',
            layer: createTerrainLayer(),
            recommendedLook: 'normal',
        },
        {
            id: 'top25',
            labelKey: 'map.layerTopo',
            layer: top25,
            recommendedLook: 'military',
        },
        {
            id: 'elevation',
            labelKey: 'map.layerElevation',
            layer: createWorldHillshadeLayer(),
            recommendedLook: 'blackWhite',
        },
    ];
}

export { MAP_MAX_ZOOM, TOP25_NATIVE_MAX_ZOOM };