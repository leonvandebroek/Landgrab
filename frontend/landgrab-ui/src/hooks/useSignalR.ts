import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import type { GameState, CombatResult } from '../types/game';

export interface GameEvents {
  onRoomCreated?: (code: string, state: GameState) => void;
  onPlayerJoined?: (state: GameState) => void;
  onGameStarted?: (state: GameState) => void;
  onStateUpdated?: (state: GameState) => void;
  onCombatResult?: (result: CombatResult) => void;
  onGameOver?: (data: { winnerId: string; winnerName: string; isAllianceVictory: boolean }) => void;
  onGlobalHexUpdated?: (hex: unknown) => void;
  onGlobalMapLoaded?: (hexes: unknown[]) => void;
  onError?: (message: string) => void;
}

export function useSignalR(token: string | null, events: GameEvents) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const eventsRef = useRef(events);
  useLayoutEffect(() => { eventsRef.current = events; });

  useEffect(() => {
    if (!token) return;

    let disposed = false;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl('/hub/game', {
        accessTokenFactory: () => token,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('RoomCreated', (code: string, state: GameState) => eventsRef.current.onRoomCreated?.(code, state));
    conn.on('PlayerJoined', (state: GameState) => eventsRef.current.onPlayerJoined?.(state));
    conn.on('GameStarted', (state: GameState) => eventsRef.current.onGameStarted?.(state));
    conn.on('StateUpdated', (state: GameState) => eventsRef.current.onStateUpdated?.(state));
    conn.on('CombatResult', (result: CombatResult) => eventsRef.current.onCombatResult?.(result));
    conn.on('GameOver', (data: { winnerId: string; winnerName: string; isAllianceVictory: boolean }) => eventsRef.current.onGameOver?.(data));
    conn.on('GlobalHexUpdated', (hex: unknown) => eventsRef.current.onGlobalHexUpdated?.(hex));
    conn.on('GlobalMapLoaded', (hexes: unknown[]) => eventsRef.current.onGlobalMapLoaded?.(hexes));
    conn.on('Error', (msg: string) => eventsRef.current.onError?.(msg));

    void Promise.resolve().then(async () => {
      if (disposed) {
        return;
      }

      try {
        await conn.start();
        if (!disposed) {
          setConnected(true);
        }
      } catch (err) {
        if (!disposed && !isExpectedStartAbort(err)) {
          console.error('SignalR connect error:', err);
        }
      }
    });

    conn.onreconnected(() => {
      if (!disposed) {
        setConnected(true);
      }
    });
    conn.onclose(() => {
      if (!disposed) {
        setConnected(false);
      }
    });

    connectionRef.current = conn;
    return () => {
      disposed = true;
      if (connectionRef.current === conn) {
        connectionRef.current = null;
      }
      setConnected(false);
      void conn.stop();
    };
  }, [token]);

  const invoke = useCallback(<T = void>(method: string, ...args: unknown[]): Promise<T> => {
    if (!connectionRef.current) return Promise.reject(new Error('Not connected'));
    return connectionRef.current.invoke<T>(method, ...args);
  }, []);

  return { connected, invoke };
}

function isExpectedStartAbort(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.message.includes('stopped during negotiation');
}
