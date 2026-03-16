import type { Page } from 'playwright';

export interface GameStateSnapshot {
  roomCode: string | null;
  phase: string | null;
  playerCount: number;
  gridSize: number;
  timestamp: string;
}

export async function getVisibleRoomCode(page: Page): Promise<string | null> {
  for (const testId of ['wizard-room-code', 'lobby-room-code']) {
    const el = page.locator(`[data-testid="${testId}"]`);
    if (await el.isVisible().catch(() => false)) {
      return el.textContent();
    }
  }
  return null;
}

export async function isGamePlaying(page: Page): Promise<boolean> {
  return page.locator('.leaflet-container').isVisible().catch(() => false);
}

export async function getBasicState(page: Page): Promise<GameStateSnapshot> {
  const roomCode = await getVisibleRoomCode(page);
  const playing = await isGamePlaying(page);
  return {
    roomCode,
    phase: playing ? 'playing' : 'lobby',
    playerCount: 0,
    gridSize: 0,
    timestamp: new Date().toISOString(),
  };
}
