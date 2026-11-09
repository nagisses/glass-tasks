import { expect, test } from '@playwright/test';

test.describe('スマホのホーム画面に追加', () => {
  test('マニフェストとアイコンが正しく配信される', async ({ page, request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m).toMatchObject({ name: 'Glass Tasks', display: 'standalone', start_url: '/' });
    for (const icon of m.icons as { src: string }[]) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);

    await page.goto('/');
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const r = await request.get(apple!);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  });

  test('Chromeのインストール条件を満たしている', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'installability check uses the Chrome DevTools Protocol');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
  });
});
