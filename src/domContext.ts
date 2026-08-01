import type { Locator } from 'playwright';
import type { DomContext } from './types.js';

export async function captureDomContext(locator: Locator): Promise<DomContext> {
  return locator.evaluate((el) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 200);

    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }

    const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);

    const parent = el.parentElement;
    let nearbyText = '';
    if (parent) {
      for (const node of Array.from(parent.childNodes)) {
        if (node === el) continue;
        if (node.nodeType === Node.TEXT_NODE) {
          nearbyText += (node.textContent || '') + ' ';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const sibling = node as Element;
          if (!INTERACTIVE_TAGS.has(sibling.tagName.toLowerCase())) {
            nearbyText += (sibling.textContent || '') + ' ';
          }
        }
      }
      nearbyText = nearbyText.trim().slice(0, 300);
    }

    const form = el.closest('form');
    const formFieldNames: string[] = form
      ? Array.from(form.querySelectorAll('input, select, textarea')).map(
          (f) => (f as HTMLInputElement).name || (f as HTMLInputElement).type || ''
        )
      : [];

    return { tag, text, attributes, nearbyText, formFieldNames };
  });
}
