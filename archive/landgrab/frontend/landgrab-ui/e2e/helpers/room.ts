import type { Page } from '@playwright/test';

export async function createRoom(page: Page): Promise<string> {
  await page.getByTestId('lobby-create-room-btn').click();
  const roomCodeEl = page.getByTestId('wizard-room-code');
  await roomCodeEl.waitFor({ state: 'visible', timeout: 10000 });
  const roomCode = await roomCodeEl.textContent();
  if (!roomCode || roomCode.length !== 6) {
    throw new Error(`Invalid room code: "${roomCode}"`);
  }
  return roomCode;
}

export async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.getByTestId('lobby-join-code-input').fill(roomCode);
  await page.getByTestId('lobby-join-btn').click();
}

export async function wizardNext(page: Page): Promise<void> {
  const btn = page.getByTestId('wizard-next-btn');
  await btn.waitFor({ state: 'visible' });
  await btn.click();
}

export async function getRoomCode(page: Page): Promise<string> {
  const el = page.getByTestId('wizard-room-code');
  await el.waitFor({ state: 'visible' });
  return (await el.textContent()) ?? '';
}
