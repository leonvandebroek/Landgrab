import type { Page, Request } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EVIDENCE_DIR = process.env.LANDGRAB_EVIDENCE_DIR ?? './evidence';

export interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface NetworkEntry {
  url: string;
  method: string;
  resourceType: string;
  status: number | null;
  ok: boolean;
  failureText: string | null;
  timestamp: string;
  durationMs: number | null;
}

const consoleLogs = new Map<string, ConsoleEntry[]>();
const networkLogs = new Map<string, NetworkEntry[]>();

export function startConsoleCapture(sessionId: string, page: Page): void {
  const entries: ConsoleEntry[] = [];
  consoleLogs.set(sessionId, entries);
  const requestStarts = new Map<Request, number>();
  const networkEntries: NetworkEntry[] = [];
  networkLogs.set(sessionId, networkEntries);

  page.on('console', (msg) => {
    entries.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString(),
      location: msg.location(),
    });
  });
  page.on('pageerror', (err) => {
    entries.push({ type: 'error', text: err.message, timestamp: new Date().toISOString() });
  });

  page.on('request', (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on('requestfinished', async (request) => {
    const response = await request.response().catch(() => null);
    const startedAt = requestStarts.get(request) ?? Date.now();
    networkEntries.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: response?.status() ?? null,
      ok: response?.ok() ?? false,
      failureText: null,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
    requestStarts.delete(request);
  });

  page.on('requestfailed', (request) => {
    const startedAt = requestStarts.get(request) ?? Date.now();
    networkEntries.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
      ok: false,
      failureText: request.failure()?.errorText ?? 'unknown',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
    requestStarts.delete(request);
  });
}

export function getConsoleEntries(sessionId: string): ConsoleEntry[] {
  return consoleLogs.get(sessionId) ?? [];
}

export function getConsoleErrors(sessionId: string): ConsoleEntry[] {
  return getConsoleEntries(sessionId).filter(e => e.type === 'error');
}

export function getConsoleEntriesSince(sessionId: string, startIndex = 0): { entries: ConsoleEntry[]; nextIndex: number } {
  const entries = getConsoleEntries(sessionId);
  return {
    entries: entries.slice(startIndex),
    nextIndex: entries.length,
  };
}

export function getNetworkEntries(sessionId: string): NetworkEntry[] {
  return networkLogs.get(sessionId) ?? [];
}

export function getNetworkEntriesSince(sessionId: string, startIndex = 0): { entries: NetworkEntry[]; nextIndex: number } {
  const entries = getNetworkEntries(sessionId);
  return {
    entries: entries.slice(startIndex),
    nextIndex: entries.length,
  };
}

export async function captureScreenshot(page: Page, label: string): Promise<string> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${label}_${timestamp}.png`;
  const filepath = join(EVIDENCE_DIR, filename);
  const buffer = await page.screenshot({ fullPage: true });
  await writeFile(filepath, buffer);
  return filepath;
}

export async function captureScreenshotBase64(page: Page): Promise<string> {
  const buffer = await page.screenshot({ fullPage: true });
  return buffer.toString('base64');
}

export function generateEvidenceSummary(sessionId: string): string {
  const entries = getConsoleEntries(sessionId);
  const errors = entries.filter(e => e.type === 'error');
  const warnings = entries.filter(e => e.type === 'warning');
  const network = getNetworkEntries(sessionId);
  const failedNetwork = network.filter(entry => !entry.ok);
  const lines = [
    `## Console Evidence: "${sessionId}"`,
    `- Total: ${entries.length}, Errors: ${errors.length}, Warnings: ${warnings.length}`,
    `- Network requests: ${network.length}, Failed: ${failedNetwork.length}`,
  ];
  if (errors.length > 0) {
    lines.push('', '### Errors');
    for (const e of errors) lines.push(`- [${e.timestamp}] ${e.text}`);
  }
  if (warnings.length > 0) {
    lines.push('', '### Warnings');
    for (const e of warnings) lines.push(`- [${e.timestamp}] ${e.text}`);
  }
  if (failedNetwork.length > 0) {
    lines.push('', '### Failed Network');
    for (const entry of failedNetwork) {
      lines.push(`- [${entry.timestamp}] ${entry.method} ${entry.url} (${entry.failureText ?? entry.status ?? 'failed'})`);
    }
  }
  return lines.join('\n');
}
