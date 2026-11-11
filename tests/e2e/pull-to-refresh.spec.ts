import { expect, test } from '@playwright/test';
import { addTask, apiPost, createList, login, pullDown, row } from './helpers';

test.describe('プルトゥリフレッシュ', () => {
  test('画面を下に引っ張って離すと再読み込みされ、トーストが出て自動で消える', async ({ page }) => {
    await login(page);
    await addTask(page, '最初からある');
    // Let the add's own background refresh finish first
    await page.waitForLoadState('networkidle');
    // Added elsewhere (another device): not on screen until refreshed
    await apiPost(page, '/api/tasks', { title: '別の端末で追加' });
    await page.waitForTimeout(300);
    await expect(row(page, '別の端末で追加')).toHaveCount(0);

    const ptr = page.getByTestId('ptr');
    await pullDown(page, 260, {
      beforeRelease: async () => {
        await expect(ptr).toHaveAttribute('data-phase', 'armed');
        // The page follows the finger (with resistance)
        const y = await page.locator('main.page').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
        expect(y).toBeGreaterThan(60);
        expect(y).toBeLessThan(260);
      },
    });
    await expect(ptr).toHaveAttribute('data-phase', 'refreshing');
    await expect(row(page, '別の端末で追加')).toBeVisible();
    const toast = page.getByRole('status').getByText('更新しました');
    await expect(toast).toBeVisible();
    await expect(ptr).toHaveAttribute('data-phase', 'idle');
    await expect(toast).toBeHidden({ timeout: 6000 });
  });

  test('少し引っ張っただけでは更新されず、元の位置に戻る', async ({ page }) => {
    await login(page);
    let fetches = 0;
    page.on('request', (r) => r.url().includes('/api/tasks') && r.method() === 'GET' && fetches++);
    await pullDown(page, 50);
    await page.waitForTimeout(800);
    expect(fetches).toBe(0);
    await expect(page.getByTestId('ptr')).toHaveAttribute('data-phase', 'idle');
    // Springs back to where it was
    await expect
      .poll(() => page.locator('main.page').evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });

  test('リスト画面でも使える', async ({ page }) => {
    await login(page);
    const list = await createList(page, '更新するリスト');
    await page.goto(`/lists/${list.id}`);
    await expect(page.getByRole('heading', { name: '更新するリスト', level: 1 })).toBeVisible();
    await apiPost(page, '/api/tasks', { title: 'あとから届いた', listId: list.id });
    await pullDown(page, 260);
    await expect(row(page, 'あとから届いた')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('更新しました');
  });

  test('横方向の動きや入力欄からの操作では反応しない', async ({ page }) => {
    await login(page);
    const vp = page.viewportSize()!;
    await pullDown(page, 260, { y: vp.height - 40 }); // starts on the composer
    await page.waitForTimeout(400);
    await expect(page.getByTestId('ptr')).toHaveAttribute('data-phase', 'idle');
    await expect(page.getByRole('status')).not.toContainText('更新しました');
  });
});
