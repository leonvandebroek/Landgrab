/**
 * Canonical shared utility types used across the frontend.
 * Import from here instead of defining local copies.
 */

/** Lat/lng coordinate pair used for map location passing. */
export interface LocationPoint {
  lat: number;
  lng: number;
}

/** SignalR invoke function signature — matches HubConnection.invoke semantics. */
export type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;
