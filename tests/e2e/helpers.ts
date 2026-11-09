import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const BASE = 'http://localhost:8788';

/** Signs in through the (mock) Google OAuth flow as a brand-new user, so every test has isolated data. */
export async function login(page: Page, prefix = 'user'): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Googleでログイン' }).click();
  await expect(page).toHaveURL(/localhost:9999\/o\/oauth2\/v2\/auth/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
  await expect(page.getByTestId('skeleton')).toHaveCount(0);
  return email;
}

export const composer = (page: Page) => page.getByRole('combobox', { name: 'タスクを追加' });

export async function addTask(page: Page, title: string) {
  const input = composer(page);
  await input.fill(title);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(row(page, title)).toBeVisible();
}

export const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

export const section = (page: Page, name: '未着手' | '進行中' | '完了') =>
  page.locator('section.accordion').filter({ has: page.getByRole('button', { name: new RegExp(`^${name}`) }) });

/** Waits until an element stops moving (enter/layout animations finished) and returns its box. */
export async function stableBox(loc: Locator) {
  let prev = await loc.boundingBox();
  for (let i = 0; i < 30; i++) {
    await loc.page().waitForTimeout(50);
    const cur = await loc.boundingBox();
    if (prev && cur && Math.abs(prev.x - cur.x) + Math.abs(prev.y - cur.y) + Math.abs(prev.height - cur.height) < 0.5) {
      return cur;
    }
    prev = cur;
  }
  return prev!;
}

/** Mouse drag on a task row (works on every engine, including touch-emulated devices). */
export async function swipe(page: Page, target: Locator, dx: number) {
  const el = target.getByTestId('task-swipe');
  await el.scrollIntoViewIfNeeded();
  const box = await stableBox(el);
  const y = box.y + box.height / 2;
  const x0 = dx > 0 ? box.x + 72 : box.x + box.width - 24;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + (dx * i) / steps, y + i * 0.3);
  await page.mouse.up();
}

/**
 * Slow drag on a task row that pauses before letting go (no flick velocity), so the row
 * settles by distance: it opens to show its buttons, or runs the action when pulled far enough.
 */
export async function slowSwipe(page: Page, target: Locator, dx: number) {
  const el = target.getByTestId('task-swipe');
  await el.scrollIntoViewIfNeeded();
  const box = await stableBox(el);
  const y = box.y + box.height / 2;
  const x0 = dx > 0 ? box.x + 72 : box.x + box.width - 24;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dx * i) / steps, y + i * 0.2);
    await page.waitForTimeout(16);
  }
  // Slow down and settle like a real finger before lifting
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(x0 + dx + Math.sign(dx) * i * 0.5, y + 3.2);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  await page.mouse.up();
}

/** Width of a task row, for "pull all the way" gestures */
export async function rowWidth(target: Locator) {
  return (await target.getByTestId('task-swipe').boundingBox())!.width;
}

/** Real touch flick via the Chrome DevTools Protocol (Chromium only). */
export async function touchFlick(page: Page, x0: number, y: number, dx: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Same-origin API call with the page's session cookie (for fast test setup). */
export async function apiPost<T>(page: Page, path: string, data: unknown): Promise<T> {
  const res = await page.request.post(path, { data, headers: { origin: BASE } });
  expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

export async function createList(page: Page, name: string, cover = 2) {
  const { list } = await apiPost<{ list: { id: string; name: string } }>(page, '/api/lists', { name, cover });
  return list;
}

export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  const menu = page.getByRole('dialog', { name: 'メニュー' });
  await expect(menu).toBeVisible();
  return menu;
}

export async function delay(page: Page, pattern: string | RegExp, ms: number) {
  await page.route(pattern, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

/**
 * Pull the page down with a finger and let go.
 * Chromium phones get real touch input via the DevTools Protocol; other engines get
 * touch events dispatched from the page (Playwright has no touch-move API for WebKit).
 */
export async function pullDown(page: Page, dy: number, opts: { x?: number; y?: number; beforeRelease?: () => Promise<void> } = {}) {
  const vp = page.viewportSize()!;
  const x = opts.x ?? Math.round(vp.width / 2);
  const y0 = opts.y ?? 160;
  const steps = 12;
  const browserName = page.context().browser()?.browserType().name();
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (browserName === 'chromium' && hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / steps }] });
      await page.waitForTimeout(16);
    }
    await opts.beforeRelease?.();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  const fire = (type: string, py: number) =>
    page.evaluate(
      ({ type, x, py }) => {
        const target = document.elementFromPoint(x, py) ?? document.body;
        const ev = new Event(type, { bubbles: true, cancelable: true });
        const pt = { clientX: x, clientY: py, pageX: x, pageY: py, identifier: 1, target };
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [pt] });
        Object.defineProperty(ev, 'changedTouches', { value: [pt] });
        target.dispatchEvent(ev);
      },
      { type, x, py },
    );
  await fire('touchstart', y0);
  for (let i = 1; i <= steps; i++) {
    await fire('touchmove', y0 + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await opts.beforeRelease?.();
  await fire('touchend', y0 + dy);
}

/** The visible rectangle of an element cut out with clip-path: inset(...) */
export async function clipRect(loc: Locator) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const m = getComputedStyle(el).clipPath.match(/inset\(([^)]*?)(?: round [^)]*)?\)/);
    if (!m) return null;
    // Browsers shorten inset() like the margin shorthand (1–4 values)
    const v = m[1].trim().split(/\s+/).map((x) => parseFloat(x));
    const [t, rr = t, b = t, l = rr] = v;
    return { x: r.left + l, y: r.top + t, width: r.width - l - rr, height: r.height - t - b, opacity: getComputedStyle(el).opacity };
  });
}
