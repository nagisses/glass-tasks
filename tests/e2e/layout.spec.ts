import { expect, test } from '@playwright/test';
import { addTask, login, row } from './helpers';

test.describe('レイアウトとデザイン', () => {
  test('横スクロールが発生しない（ホーム・リスト・詳細）', async ({ page }) => {
    await login(page);
    await addTask(page, 'とても長いタスク名を入れてレイアウトが崩れないことを確認するためのテキストです');
    const noOverflow = async () =>
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await noOverflow();
    await row(page, 'とても長いタスク名').getByRole('link').click();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toBeVisible();
    await noOverflow();
    await page.getByRole('navigation', { name: 'パンくずリスト' }).getByRole('link', { name: 'インボックス' }).click();
    await expect(page.getByRole('heading', { name: 'インボックス', level: 1 })).toBeVisible();
    await noOverflow();
  });

  test('白基調のガラス表現（背景ぼかし・半透明）', async ({ page }) => {
    await login(page);
    const style = await page.locator('header.topbar').evaluate((el) => {
      const s = getComputedStyle(el);
      return { filter: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter, bg: s.backgroundImage };
    });
    expect(style.filter).toContain('blur');
    expect(style.bg).toContain('rgba(255, 255, 255');
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(244, 247, 252)');
  });

  test('ログイン後の画面に宣伝文句がない（表示テキストは機能ラベルのみ）', async ({ page }) => {
    await login(page);
    const text = await page.locator('#root').innerText();
    const words = text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = new Set(['ホーム', 'インボックス', '未完了', '0件', '新しいリスト', 'すべてのタスク', '新しい順', '未着手', '0', '進行中', '完了', 'タスクはありません']);
    expect(words.filter((w) => !allowed.has(w))).toEqual([]);
  });

  test('タップしやすい大きさ（主要ボタン 40px 以上）', async ({ page }) => {
    await login(page);
    for (const name of ['メニューを開く', '並び替え: 新しい順']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(36);
      expect(box.width).toBeGreaterThanOrEqual(36);
    }
    const input = (await page.getByRole('textbox', { name: 'タスクを追加' }).boundingBox())!;
    expect(input.height).toBeGreaterThanOrEqual(40);
  });
});
