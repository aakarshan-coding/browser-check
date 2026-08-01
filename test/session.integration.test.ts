import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { BrowserCheckSession, ActionBlockedError, type EscalationHandler } from '../src/index.js';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'test-page.html');
const logPath = path.join(path.dirname(fixturePath), 'integration-audit.log.jsonl');

class AutoDenyHandler implements EscalationHandler {
  async escalate(): Promise<boolean> {
    return false;
  }
}

describe('BrowserCheckSession integration', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  afterEach(async () => {
    await page.close();
    await unlink(logPath).catch(() => {});
  });

  it('auto-allows a safe fill action end to end', async () => {
    page = await browser.newPage();
    await page.goto(`file://${fixturePath}`);
    const session = new BrowserCheckSession({
      page,
      goal: 'search for a product',
      logPath,
      escalationHandler: new AutoDenyHandler(),
    });

    await session.fill(page.locator('#search'), 'shoes');
    await expect(page.locator('#search').inputValue()).resolves.toBe('shoes');
  });

  it('escalates and blocks a destructive click when the human denies', async () => {
    page = await browser.newPage();
    await page.goto(`file://${fixturePath}`);
    const session = new BrowserCheckSession({
      page,
      goal: 'search for a product',
      logPath,
      escalationHandler: new AutoDenyHandler(),
    });

    await expect(session.click(page.locator('#delete-btn'))).rejects.toThrow(ActionBlockedError);
  });
});
