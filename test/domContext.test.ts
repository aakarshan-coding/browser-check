import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { captureDomContext } from '../src/domContext.js';

describe('captureDomContext', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(`
      <form>
        <input name="card-number" />
        <button id="pay">Pay Now</button>
      </form>
    `);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('captures tag, text, nearby text, and form field names', async () => {
    const context = await captureDomContext(page.locator('#pay'));
    expect(context.tag).toBe('button');
    expect(context.text).toBe('Pay Now');
    expect(context.formFieldNames).toContain('card-number');
  });
});
