import { expect, test } from '@playwright/test';
import { addTask, createList, delay, login, openMenu, row } from './helpers';

test.describe('スケルトンローディング', () => {
  test('起動時（JS読み込み前）もスケルトンの画面と入力欄がある', async ({ page }) => {
    await login(page);
    await page.route('**/assets/*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.app.boot')).toBeVisible();
    await expect(page.locator('.app.boot .sk').first()).toBeVisible();
    await expect(page.locator('#boot-input')).toBeEditable();
    await page.locator('#boot-input').fill('先に入力');
    // When the app boots, the typed text is carried over
    await expect(page.locator('.app.boot')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: 'タスクを追加' })).toHaveValue('先に入力');
  });

  test('セッション確認中は全体のスケルトン', async ({ page }) => {
    await login(page);
    await delay(page, '**/api/me', 1500);
    await page.reload();
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
  });

  test('ホーム・リスト・タスク詳細・メニューのそれぞれにスケルトンがある', async ({ page }) => {
    await login(page);
    const list = await createList(page, 'スケルトン');
    await page.goto(`/lists/${list.id}`);
    await addTask(page, '読み込み確認');
    const href = await row(page, '読み込み確認').getByRole('link').getAttribute('href');

    await delay(page, /\/api\/(lists|tasks)/, 1200);

    // Home
    await page.goto('/');
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await expect(page.locator('.sk-carousel')).toBeVisible();
    await expect(page.getByRole('region', { name: 'リスト', exact: true })).toBeVisible({ timeout: 10_000 });

    // List
    await page.goto(`/lists/${list.id}`);
    await expect(page.locator('.sk-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'スケルトン', level: 1 })).toBeVisible({ timeout: 10_000 });

    // Task detail (+ breadcrumb placeholder while the title loads)
    await page.goto(href!);
    await expect(page.locator('.sk-segment').first()).toBeVisible();
    await expect(page.locator('.crumb-skeleton').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue('読み込み確認', { timeout: 10_000 });

    // Side menu lists
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.goto('/');
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
    await delay(page, '**/api/lists', 1500);
    await page.reload();
    const menu = await openMenu(page);
    await expect(menu.getByTestId('menu-skeleton')).toBeVisible();
    await expect(menu.getByRole('link', { name: /スケルトン/ })).toBeVisible({ timeout: 10_000 });
  });
});
