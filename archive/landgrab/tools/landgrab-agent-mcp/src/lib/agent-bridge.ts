import type { Page } from 'playwright';

const BRIDGE_KEY = '__LANDGRAB_AGENT_BRIDGE__';

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

async function evaluateBridge<T>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(
    ({ bridgeKey, bridgeMethod, bridgeArgs }) => {
      const browserWindow = window as unknown as Record<string, unknown>;
      const bridge = browserWindow[bridgeKey] as Record<string, (...innerArgs: unknown[]) => unknown> | undefined;
      if (!bridge || typeof bridge[bridgeMethod] !== 'function') {
        throw new Error(`Landgrab agent bridge method "${bridgeMethod}" is not available.`);
      }

      return bridge[bridgeMethod](...bridgeArgs);
    },
    { bridgeKey: BRIDGE_KEY, bridgeMethod: method, bridgeArgs: args },
  ) as Promise<T>;
}

export async function waitForAgentBridge(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    (bridgeKey) => {
      const browserWindow = window as unknown as Record<string, unknown>;
      const bridge = browserWindow[bridgeKey] as Record<string, unknown> | undefined;
      return Boolean(bridge && typeof bridge.isEnabled === 'function');
    },
    BRIDGE_KEY,
    { timeout: timeoutMs },
  );
}

export async function getAgentSnapshot<T = Record<string, unknown>>(page: Page): Promise<T> {
  await waitForAgentBridge(page);
  return evaluateBridge<T>(page, 'getSnapshot');
}

export async function getAgentEvents<T = Array<Record<string, unknown>>>(page: Page, sinceId = 0): Promise<T> {
  await waitForAgentBridge(page);
  return evaluateBridge<T>(page, 'getEvents', [sinceId]);
}

export async function getAgentConnectionStatus<T = Record<string, unknown>>(page: Page): Promise<T> {
  await waitForAgentBridge(page);
  return evaluateBridge<T>(page, 'getConnectionStatus');
}

export async function callAgentBridge<T = Record<string, unknown>>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  await waitForAgentBridge(page);
  return evaluateBridge<T>(page, method, args);
}

export async function pollAgentBridge<T>(
  page: Page,
  fetcher: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = 10_000, intervalMs = 250 }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() <= deadline) {
    lastValue = await fetcher();
    if (predicate(lastValue)) {
      return lastValue;
    }

    await page.waitForTimeout(intervalMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for Landgrab agent bridge condition.${lastValue === undefined ? '' : ` Last value: ${JSON.stringify(lastValue)}`}`);
}
