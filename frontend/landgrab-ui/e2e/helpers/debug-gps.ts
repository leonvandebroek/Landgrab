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
