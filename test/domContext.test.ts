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

  it('excludes sibling interactive controls text from nearbyText', async () => {
    await page.setContent(`
      <div>
        <input id="search" name="search" type="text" placeholder="Search" />
        <button id="delete-btn">Delete Account</button>
      </div>
    `);

    const context = await captureDomContext(page.locator('#search'));
    expect(context.nearbyText).not.toContain('Delete Account');
  });

  it('still includes non-interactive sibling text in nearbyText', async () => {
    await page.setContent(`
      <div>
        <input id="search" name="search" type="text" placeholder="Search" />
        <span class="warning">This action cannot be undone</span>
      </div>
    `);

    const context = await captureDomContext(page.locator('#search'));
    expect(context.nearbyText).toContain('This action cannot be undone');
  });
});
