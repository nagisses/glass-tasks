import { expect, test } from '@playwright/test';
import { createList, login, touchFlick } from './helpers';

test.describe('カルーセル', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await createList(page, '仕事', 1);
    await createList(page, '趣味', 4);
    await page.reload();
  });

  const carousel = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'リスト', exact: true });

  test('リストの画像が横に並び、矢印とドットで切り替えられる', async ({ page }) => {
    const c = carousel(page);
    const slides = c.locator('[aria-roledescription="slide"]');
    await expect(slides).toHaveCount(4); // inbox, 仕事, 趣味, new list
    await expect(c.locator('img.carousel-image')).toHaveCount(4);
    await expect(slides.nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(c.getByRole('button', { name: '前へ' })).toBeDisabled();

    await c.getByRole('button', { name: '次へ' }).click();
    await expect(slides.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(c.getByRole('button', { name: '2枚目を表示' })).toHaveAttribute('aria-current', 'true');

    await c.getByRole('button', { name: '4枚目を表示' }).click();
    await expect(slides.nth(3)).toHaveAttribute('aria-current', 'true');
    await expect(c.getByRole('button', { name: '次へ' })).toBeDisabled();

    await c.getByRole('button', { name: '前へ' }).click();
    await expect(slides.nth(2)).toHaveAttribute('aria-current', 'true');
  });

  test('スライドで切り替えられる（横スクロール）', async ({ page, browserName, isMobile }) => {
    const c = carousel(page);
    const track = c.getByTestId('carousel-track');
    const box = (await track.boundingBox())!;
    if (browserName === 'chromium' && isMobile) {
      // Real touch swipe
      await touchFlick(page, box.x + box.width * 0.8, box.y + box.height / 2, -box.width * 0.6);
    } else if (isMobile) {
      // Mobile WebKit in Playwright has no touch-move or wheel input: scroll the track like a swipe would
      await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.8 }));
    } else {
      await track.hover();
      await page.mouse.wheel(box.width * 0.8, 0);
    }
    await expect(c.locator('[aria-roledescription="slide"]').nth(0)).not.toHaveAttribute('aria-current', 'true');
  });

  test('中央のスライドを押すとそのリストが開く', async ({ page }) => {
    const c = carousel(page);
    await c.getByRole('button', { name: '次へ' }).click();
    await expect(c.locator('[aria-roledescription="slide"]').nth(1)).toHaveAttribute('aria-current', 'true');
    await c.getByRole('button', { name: '仕事を開く' }).click();
    await expect(page.getByRole('heading', { name: '仕事', level: 1 })).toBeVisible();
  });

  test('最後のスライドから新しいリストを作れる', async ({ page }) => {
    const c = carousel(page);
    await c.getByRole('button', { name: '4枚目を表示' }).click();
    await expect(c.locator('[aria-roledescription="slide"]').nth(3)).toHaveAttribute('aria-current', 'true');
    await c.getByRole('button', { name: '新しいリストを作成' }).click();
    await expect(page.getByRole('dialog', { name: '新しいリスト' })).toBeVisible();
  });
});
