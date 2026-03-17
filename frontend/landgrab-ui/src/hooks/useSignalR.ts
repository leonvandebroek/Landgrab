import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import type { GameState, CombatResult, GameDynamics, Player } from '../types/game';

const AUTO_RECONNECT_DELAYS = [0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000, 30000, 60000, 60000, 60000];
const MANUAL_RECONNECT_DELAY_MS = 15000;
const MANUAL_RECONNECT_MAX_ATTEMPTS = 40;

export interface GameEvents {
  onRoomCreated?: (code: string, state: GameState) => void;
  onPlayerJoined?: (state: GameState) => void;
  onGameStarted?: (state: GameState) => void;
  onStateUpdated?: (state: GameState) => void;
  onPlayersMoved?: (players: Player[]) => void;
  onCombatResult?: (result: CombatResult) => void;
  onDrainTick?: (data: { q: number; r: number; troopsLost: number; allianceId: string | null }) => void;
  onDynamicsChanged?: (dynamics: GameDynamics) => void;
  onGameOver?: (data: { winnerId: string; winnerName: string; isAllianceVictory: boolean }) => void;
  onTileLost?: (data: { Q: number; R: number; AttackerName: string }) => void;
  onGlobalHexUpdated?: (hex: unknown) => void;
  onGlobalMapLoaded?: (hexes: unknown[]) => void;
  onError?: (message: string) => void;
  onReconnected?: () => void;
  // Host Observer Mode
  onHostMessage?: (data: { message: string; fromHost: boolean }) => void;
  // Map Editor
  onTemplateSaved?: (data: { templateId: string; name: string }) => void;
}

export function useSignalR(token: string | null, events: GameEvents) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const eventsRef = useRef(events);
  const manualReconnectTimerRef = useRef<number | null>(null);
  const manualReconnectAttemptsRef = useRef(0);

  useLayoutEffect(() => { eventsRef.current = events; });

  const clearManualReconnect = useCallback(() => {
    if (manualReconnectTimerRef.current !== null) {
      window.clearTimeout(manualReconnectTimerRef.current);
      manualReconnectTimerRef.current = null;
    }
    manualReconnectAttemptsRef.current = 0;
  }, []);

  const scheduleManualReconnect = useCallback((conn: signalR.HubConnection, isDisposed: () => boolean) => {
    if (manualReconnectTimerRef.current !== null || connectionRef.current !== conn) {
      return;
    }

    const attemptReconnect = () => {
      if (isDisposed() || connectionRef.current !== conn) {
        clearManualReconnect();
        return;
      }

      if (conn.state !== signalR.HubConnectionState.Disconnected) {
        clearManualReconnect();
        return;
      }

      if (manualReconnectAttemptsRef.current >= MANUAL_RECONNECT_MAX_ATTEMPTS) {
        clearManualReconnect();
        setConnected(false);
        setReconnecting(false);
        return;
      }

      manualReconnectTimerRef.current = null;
      manualReconnectAttemptsRef.current += 1;
      setReconnecting(true);

      void Promise.resolve().then(async () => {
        if (isDisposed() || connectionRef.current !== conn || conn.state !== signalR.HubConnectionState.Disconnected) {
          return;
        }

        try {
          await conn.start();
          if (!isDisposed() && connectionRef.current === conn) {
            clearManualReconnect();
            setConnected(true);
            setReconnecting(false);
            eventsRef.current.onReconnected?.();
          }
        } catch {
          if (!isDisposed() && connectionRef.current === conn && manualReconnectAttemptsRef.current < MANUAL_RECONNECT_MAX_ATTEMPTS) {
            manualReconnectTimerRef.current = window.setTimeout(attemptReconnect, MANUAL_RECONNECT_DELAY_MS);
          } else if (!isDisposed()) {
            setReconnecting(false);
          }
        }
      });
    };

    manualReconnectTimerRef.current = window.setTimeout(attemptReconnect, MANUAL_RECONNECT_DELAY_MS);
  }, [clearManualReconnect]);

  useEffect(() => {
    if (token === null) {
      clearManualReconnect();
      return;
    }

    let disposed = false;
    const isDisposed = () => disposed;
    const connectionOptions: signalR.IHttpConnectionOptions = {
      transport: signalR.HttpTransportType.WebSockets
    };

    if (token) {
      connectionOptions.accessTokenFactory = () => token;
    }

    const conn = new signalR.HubConnectionBuilder()
      .withUrl('/hub/game', connectionOptions)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: ({ previousRetryCount }) => AUTO_RECONNECT_DELAYS[previousRetryCount] ?? null
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('RoomCreated', (code: string, state: GameState) => eventsRef.current.onRoomCreated?.(code, state));
    conn.on('PlayerJoined', (state: GameState) => eventsRef.current.onPlayerJoined?.(state));
    conn.on('GameStarted', (state: GameState) => eventsRef.current.onGameStarted?.(state));
    conn.on('StateUpdated', (state: GameState) => eventsRef.current.onStateUpdated?.(state));
    conn.on('PlayersMoved', (players: Player[]) => eventsRef.current.onPlayersMoved?.(players));
    conn.on('CombatResult', (result: CombatResult) => eventsRef.current.onCombatResult?.(result));
    conn.on('GameOver', (data: { winnerId: string; winnerName: string; isAllianceVictory: boolean }) => eventsRef.current.onGameOver?.(data));
    conn.on('TileLost', (data: { Q: number; R: number; AttackerName: string }) => eventsRef.current.onTileLost?.(data));
    conn.on('GlobalHexUpdated', (hex: unknown) => eventsRef.current.onGlobalHexUpdated?.(hex));
    conn.on('GlobalMapLoaded', (hexes: unknown[]) => eventsRef.current.onGlobalMapLoaded?.(hexes));
    conn.on('Error', (msg: string) => eventsRef.current.onError?.(msg));
    conn.on('HostMessage', (data: { message: string; fromHost: boolean }) => eventsRef.current.onHostMessage?.(data));
    conn.on('TemplateSaved', (data: { templateId: string; name: string }) => eventsRef.current.onTemplateSaved?.(data));
    conn.on('DrainTick', (data: { q: number; r: number; troopsLost: number; allianceId: string | null }) => eventsRef.current.onDrainTick?.(data));
    conn.on('DynamicsChanged', (dynamics: GameDynamics) => eventsRef.current.onDynamicsChanged?.(dynamics));

    conn.onreconnecting(() => {
      if (!disposed) {
        clearManualReconnect();
        setConnected(false);
        setReconnecting(true);
      }
    });

    conn.onreconnected(() => {
      if (!disposed) {
        clearManualReconnect();
        setConnected(true);
        setReconnecting(false);
        eventsRef.current.onReconnected?.();
      }
    });

    conn.onclose(() => {
      if (!disposed) {
        setConnected(false);
        setReconnecting(true);
        scheduleManualReconnect(conn, isDisposed);
      }
    });

    void Promise.resolve().then(async () => {
      if (disposed) {
        return;
      }

      try {
        await conn.start();
        if (!disposed) {
          clearManualReconnect();
          setConnected(true);
          setReconnecting(false);
        }
        } catch (err) {
          if (!disposed && !isExpectedStartAbort(err)) {
            setConnected(false);
            setReconnecting(true);
            scheduleManualReconnect(conn, isDisposed);
        }
      }
    });

    connectionRef.current = conn;
    return () => {
      disposed = true;
      clearManualReconnect();
      if (connectionRef.current === conn) {
        connectionRef.current = null;
      }
      setConnected(false);
      setReconnecting(false);
      void conn.stop();
    };
  }, [clearManualReconnect, scheduleManualReconnect, token]);

  const invoke = useCallback(<T = void>(method: string, ...args: unknown[]): Promise<T> => {
    if (!connectionRef.current) return Promise.reject(new Error('Not connected'));
    return connectionRef.current.invoke<T>(method, ...args);
  }, []);

  return { connected, reconnecting, invoke };
}

function isExpectedStartAbort(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.message.includes('stopped during negotiation');
}
