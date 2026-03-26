import { useEffect, useMemo, useState } from 'react';
import type L from 'leaflet';
import type { GameEventLogEntry } from '../../types/game';
import { roomHexToLatLng } from './HexMath';

interface TroopSplash {
    createdAtMs: number;
    id: string;
    colorClassName: string;
    q: number;
    r: number;
    text: string;
}

interface Props {
    events?: GameEventLogEntry[] | null;
    map: L.Map | null;
    mapLat: number | null;
    mapLng: number | null;
    tileSizeMeters: number;
}

export function TroopSplashLayer({
    events,
    map,
    mapLat,
    mapLng,
    tileSizeMeters,
}: Props) {
    const [viewportTick, setViewportTick] = useState(0);

    useEffect(() => {
        if (!map) {
            return;
        }

        const handleViewportChange = () => {
            setViewportTick((tick) => tick + 1);
        };

        map.on('zoom move resize', handleViewportChange);
        return () => {
            map.off('zoom move resize', handleViewportChange);
        };
    }, [map]);

    const positionedSplashes = useMemo(() => {
        void viewportTick;

        if (!map || mapLat == null || mapLng == null || !Array.isArray(events)) {
            return [];
        }

        return events
            .map((event) => {
                const eventId = getEventId(event);
                return mapEventToSplash(event, eventId);
            })
            .filter((splash): splash is TroopSplash => splash != null)
            .map((splash) => {
                const [lat, lng] = roomHexToLatLng(splash.q, splash.r, mapLat, mapLng, tileSizeMeters);
                const point = map.latLngToContainerPoint([lat, lng]);

                return {
                    ...splash,
                    x: point.x,
                    y: point.y,
                };
            });
    }, [events, map, mapLat, mapLng, tileSizeMeters, viewportTick]);

    if (positionedSplashes.length === 0) {
        return null;
    }

    return (
        <div className="game-map-overlay-layer" aria-hidden="true">
            {positionedSplashes.map((splash) => (
                <div
                    key={splash.id}
                    className={`troop-splash ${splash.colorClassName}`}
                    style={{ left: `${splash.x}px`, top: `${splash.y}px` }}
                >
                    {splash.text}
                </div>
            ))}
        </div>
    );
}

function getEventId(event: GameEventLogEntry): string {
    return [
        event.createdAt,
        event.type,
        event.playerId ?? '',
        event.q ?? '',
        event.r ?? '',
    ].join(':');
}

function mapEventToSplash(event: GameEventLogEntry, id: string): TroopSplash | null {
    if (event.q == null || event.r == null) {
        return null;
    }

    const createdAtMs = Date.parse(event.createdAt);
    if (!Number.isFinite(createdAtMs)) {
        return null;
    }

    switch (event.type) {
        case 'ScoutFirstVisitBonus':
            return { id, createdAtMs, q: event.q, r: event.r, text: '+2', colorClassName: 'troop-splash--scout' };
        case 'Reinforce':
        case 'ReinforceActivated':
            return { id, createdAtMs, q: event.q, r: event.r, text: '+3', colorClassName: 'troop-splash--reinforce' };
        case 'Sabotage':
        case 'SabotageActivated':
            return { id, createdAtMs, q: event.q, r: event.r, text: '+3', colorClassName: 'troop-splash--repair' };
        case 'TileCaptured':
            return { id, createdAtMs, q: event.q, r: event.r, text: '⚔️', colorClassName: 'troop-splash--capture' };
        case 'TileClaimed':
            return { id, createdAtMs, q: event.q, r: event.r, text: '🚩', colorClassName: 'troop-splash--capture' };
        default:
            return null;
    }
}