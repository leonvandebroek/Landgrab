import type { Page } from '@playwright/test';

export async function enableDebugGps(page: Page): Promise<void> {
  const panel = page.getByTestId('debug-gps-panel');
  const toggle = page.getByTestId('debug-gps-toggle');
  const isActive = await panel.evaluate(el => el.classList.contains('is-active'));
  if (!isActive) {
    await toggle.click();
  }
}

export async function stepDirection(
  page: Page,
  direction: 'north' | 'south' | 'east' | 'west',
): Promise<void> {
  const btn = page.getByTestId(`debug-gps-step-${direction}`);
  await btn.waitFor({ state: 'visible' });
  await btn.click();
}

export async function moveSteps(
  page: Page,
  direction: 'north' | 'south' | 'east' | 'west',
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await stepDirection(page, direction);
    await page.waitForTimeout(300);
  }
}

const DIRECTION_KEYS: Record<string, string> = {
  north: 'ArrowUp',
  south: 'ArrowDown',
  west: 'ArrowLeft',
  east: 'ArrowRight',
};

export async function stepDirectionKeyboard(
  page: Page,
  direction: 'north' | 'south' | 'east' | 'west',
): Promise<void> {
  await page.keyboard.press(DIRECTION_KEYS[direction]);
}

export async function moveStepsKeyboard(
  page: Page,
  direction: 'north' | 'south' | 'east' | 'west',
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await stepDirectionKeyboard(page, direction);
  }
}

export async function zoomIn(page: Page): Promise<void> {
  await page.keyboard.press('Equal');
}

export async function zoomOut(page: Page): Promise<void> {
  await page.keyboard.press('Minus');
}

export async function centerOnPlayer(page: Page): Promise<void> {
  await page.keyboard.press('Home');
}

export async function toggleFollowMe(page: Page): Promise<void> {
  await page.keyboard.press('f');
}

export async function confirmAction(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
}

export async function cancelAction(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}
