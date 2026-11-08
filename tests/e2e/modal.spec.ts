import { expect, test } from '@playwright/test';
import { addTask, createList, login, openMenu, row } from './helpers';

test.describe('モーダル', () => {
  test('新しいリストのモーダル: 開いている間は背面が操作できず、閉じると戻る', async ({ page }) => {
    await login(page);
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: '新しいリスト' }).click();
    const dialog = page.getByRole('dialog', { name: '新しいリスト' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByLabel('名前')).toBeFocused();

    // Background is inert: not clickable, not focusable
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    const burgerClickable = await page
      .getByRole('button', { name: /メニューを/ })
      .click({ timeout: 800 })
      .then(() => true)
      .catch(() => false);
    expect(burgerClickable).toBe(false);
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  });

  test('名前が空だとエラー、入力して作成するとリスト画面へ移動する', async ({ page }) => {
    await login(page);
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: '新しいリスト' }).click();
    const dialog = page.getByRole('dialog', { name: '新しいリスト' });
    await dialog.getByRole('button', { name: '作成' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('名前を入力してください');
    await expect(dialog.getByLabel('名前')).toHaveAttribute('aria-invalid', 'true');

    await dialog.getByLabel('名前').fill('ジム');
    // Cover image picker is a carousel too
    const picker = dialog.getByRole('region', { name: 'カバー画像' });
    await picker.getByRole('button', { name: '1枚目を表示' }).click();
    await expect(picker.locator('[aria-roledescription="slide"]').nth(0)).toHaveAttribute('aria-current', 'true');
    await picker.getByRole('button', { name: '次へ' }).click();
    await picker.getByRole('button', { name: '次へ' }).click();
    await expect(picker.locator('[aria-roledescription="slide"]').nth(2)).toHaveAttribute('aria-current', 'true');
    await dialog.getByRole('button', { name: '作成' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'ジム', level: 1 })).toBeVisible();
    await expect(page.locator('.list-hero-image')).toHaveAttribute('src', '/covers/cover-2.svg');
  });

  test('背景（オーバーレイ）を押すと閉じる', async ({ page }) => {
    await login(page);
    const list = await createList(page, '閉じる確認');
    await page.goto(`/lists/${list.id}`);
    await page.getByRole('button', { name: 'リストを編集' }).click();
    const dialog = page.getByRole('dialog', { name: 'リストを編集' });
    await expect(dialog).toBeVisible();
    await page.getByTestId('modal-backdrop').click({ position: { x: 10, y: 10 }, force: true });
    await expect(dialog).toBeHidden();
  });

  test('リスト名を編集するとパンくずとメニューに反映される', async ({ page }) => {
    await login(page);
    const list = await createList(page, '旧名');
    await page.goto(`/lists/${list.id}`);
    await page.getByRole('button', { name: 'リストを編集' }).click();
    const dialog = page.getByRole('dialog', { name: 'リストを編集' });
    await expect(dialog.getByLabel('名前')).toHaveValue('旧名');
    await dialog.getByLabel('名前').fill('新名');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toContainText('新名');
    await page.reload();
    await expect(page.getByRole('heading', { name: '新名', level: 1 })).toBeVisible();
  });

  test('確認モーダルでリストを削除できる（キャンセルでは消えない）', async ({ page }) => {
    await login(page);
    const list = await createList(page, '消すリスト');
    await page.goto(`/lists/${list.id}`);
    await addTask(page, '中のタスク');
    await page.getByRole('button', { name: 'リストを削除' }).click();
    const confirm = page.getByRole('dialog', { name: 'リストを削除しますか？' });
    await confirm.getByRole('button', { name: 'キャンセル' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('heading', { name: '消すリスト', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'リストを削除' }).click();
    await confirm.getByRole('button', { name: '削除' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: '消すリストを開く' })).toHaveCount(0);
    await expect(row(page, '中のタスク')).toHaveCount(0);
  });

  test('インボックスは削除できない', async ({ page }) => {
    await login(page);
    await page.getByRole('region', { name: 'リスト', exact: true }).getByRole('button', { name: 'インボックスを開く' }).click();
    await expect(page.getByRole('heading', { name: 'インボックス', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'リストを削除' })).toHaveCount(0);
  });
});
