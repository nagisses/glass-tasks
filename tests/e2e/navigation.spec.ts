import { expect, test } from '@playwright/test';
import { addTask, createList, login, openMenu, row } from './helpers';

test.describe('ハンバーガーメニュー', () => {
  test('3本線ボタンで開閉し、開いている間は背面を操作できない', async ({ page }) => {
    await login(page);
    const burger = page.getByRole('button', { name: 'メニューを開く' });
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await expect(burger.locator('.hamburger-line')).toHaveCount(3);
    const menu = await openMenu(page);
    await expect(page.getByRole('button', { name: 'メニューを閉じる' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    await expect(menu.getByRole('link', { name: 'ホーム' })).toBeVisible();

    // Escape closes
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');

    // Backdrop closes
    await openMenu(page);
    await page.getByTestId('modal-backdrop').click({ position: { x: 360, y: 300 }, force: true });
    await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeHidden();
  });

  test('メニューからリストへ移動でき、移動後にメニューが閉じる', async ({ page }) => {
    await login(page);
    const list = await createList(page, '旅行');
    await page.reload();
    const menu = await openMenu(page);
    await menu.getByRole('link', { name: /旅行/ }).click();
    await expect(page).toHaveURL(new RegExp(`/lists/${list.id}$`));
    await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeHidden();
    await expect(page.getByRole('heading', { name: '旅行', level: 1 })).toBeVisible();
  });

  test('メニューの「表示」アコーディオンのラジオで完了タスクを隠せる', async ({ page }) => {
    await login(page);
    const menu = await openMenu(page);
    const view = menu.getByRole('button', { name: '表示', exact: true });
    await expect(view).toHaveAttribute('aria-expanded', 'false');
    await view.click();
    await expect(view).toHaveAttribute('aria-expanded', 'true');
    const hide = menu.getByRole('radio', { name: '非表示' });
    await hide.check();
    await expect(hide).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^完了/ })).toHaveCount(0);
    await openMenu(page);
    await page.getByRole('radio', { name: '表示', exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^完了/ })).toBeVisible();
  });
});

test.describe('パンくずリスト', () => {
  test('ホーム＞リスト＞タスクと現在地を示し、押すと上の階層に戻れる', async ({ page }) => {
    await login(page);
    const list = await createList(page, '家事');
    await page.goto(`/lists/${list.id}`);
    const crumbs = page.getByRole('navigation', { name: 'パンくずリスト' });
    await expect(crumbs.getByRole('listitem')).toHaveText(['ホーム', '家事']);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('家事');

    await addTask(page, '洗濯する');
    await row(page, '洗濯する').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/lists/${list.id}/tasks/`));
    await expect(crumbs.getByRole('listitem')).toHaveText(['ホーム', '家事', '洗濯する']);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('洗濯する');

    await crumbs.getByRole('link', { name: '家事' }).click();
    await expect(page).toHaveURL(new RegExp(`/lists/${list.id}$`));
    await expect(crumbs.getByRole('listitem')).toHaveText(['ホーム', '家事']);

    await crumbs.getByRole('link', { name: 'ホーム' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(crumbs.getByRole('listitem')).toHaveText(['ホーム']);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('ホーム');
  });

  test('ブラウザの戻る/進むでも正しく表示される', async ({ page }) => {
    await login(page);
    const list = await createList(page, '読書');
    await page.goto(`/lists/${list.id}`);
    await addTask(page, '本を読む');
    await row(page, '本を読む').getByRole('link').click();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue('本を読む');
    await page.goBack();
    await expect(page.getByRole('heading', { name: '読書', level: 1 })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue('本を読む');
  });

  test('存在しないページは「見つかりません」を表示しホームへ戻れる', async ({ page }) => {
    await login(page);
    await page.goto('/lists/does-not-exist');
    await expect(page.getByText('見つかりません').first()).toBeVisible();
    await page.getByRole('link', { name: 'ホームへ' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
