import type { Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EVIDENCE_DIR = process.env.LANDGRAB_EVIDENCE_DIR ?? './evidence';

export interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: string;
}

const consoleLogs = new Map<string, ConsoleEntry[]>();

export function startConsoleCapture(sessionId: string, page: Page): void {
  const entries: ConsoleEntry[] = [];
  consoleLogs.set(sessionId, entries);
  page.on('console', (msg) => {
    entries.push({ type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() });
  });
  page.on('pageerror', (err) => {
    entries.push({ type: 'error', text: err.message, timestamp: new Date().toISOString() });
  });
}

export function getConsoleEntries(sessionId: string): ConsoleEntry[] {
  return consoleLogs.get(sessionId) ?? [];
}

export function getConsoleErrors(sessionId: string): ConsoleEntry[] {
  return getConsoleEntries(sessionId).filter(e => e.type === 'error');
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
  const lines = [
    `## Console Evidence: "${sessionId}"`,
    `- Total: ${entries.length}, Errors: ${errors.length}, Warnings: ${warnings.length}`,
  ];
  if (errors.length > 0) {
    lines.push('', '### Errors');
    for (const e of errors) lines.push(`- [${e.timestamp}] ${e.text}`);
  }
  if (warnings.length > 0) {
    lines.push('', '### Warnings');
    for (const e of warnings) lines.push(`- [${e.timestamp}] ${e.text}`);
  }
  return lines.join('\n');
}
