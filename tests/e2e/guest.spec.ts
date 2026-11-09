import { expect, test } from '@playwright/test';
import { composer, row, section, swipe } from './helpers';

// Public-release setup: no sign-in (each browser gets its own guest account) and AI features off
const GUEST = 'http://localhost:8789';
test.use({ baseURL: GUEST });

async function open(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
  await expect(page.getByTestId('skeleton')).toHaveCount(0);
}

async function add(page: import('@playwright/test').Page, title: string) {
  await composer(page).fill(title);
  await composer(page).press('Enter');
  await expect(row(page, title)).toBeVisible();
}

test.describe('ゲストモード（ログイン不要・AIなし）', () => {
  test('開くとログインなしですぐ使え、再読み込み後もデータが残る', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('link', { name: 'Googleでログイン' })).toHaveCount(0);
    await expect(composer(page)).toBeEditable();
    await add(page, 'ゲストのタスク');
    await page.reload();
    await expect(row(page, 'ゲストのタスク')).toBeVisible();
  });

  test('ブラウザ（端末）ごとにデータが分かれる', async ({ page, browser }) => {
    await open(page);
    await add(page, '自分だけのタスク');
    const other = await browser.newContext({ baseURL: GUEST });
    const otherPage = await other.newPage();
    await open(otherPage);
    await expect(row(otherPage, '自分だけのタスク')).toHaveCount(0);
    await other.close();
  });

  test('メニューはゲスト表示で、ログアウトボタンは出ない', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    const menu = page.getByRole('dialog', { name: 'メニュー' });
    await expect(menu.getByText('ゲスト', { exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'ログアウト' })).toHaveCount(0);
  });

  test('AI機能は表示されず、APIも使えない', async ({ page }) => {
    await open(page);
    await composer(page).fill('明日 歯医者 急ぎ');
    await expect(page.getByRole('button', { name: '追加', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AIで追加' })).toHaveCount(0);
    await composer(page).press('Enter');
    await row(page, '明日 歯医者 急ぎ').getByRole('link').click();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AIで分解' })).toHaveCount(0);
    const id = page.url().split('/tasks/')[1];
    const res = await page.request.post('/api/ai/breakdown', { data: { taskId: id }, headers: { origin: GUEST } });
    expect(res.status()).toBe(404);
  });

  test('スワイプなどの基本操作はそのまま使える', async ({ page }) => {
    await open(page);
    await add(page, 'ゲストでスワイプ');
    await swipe(page, row(page, 'ゲストでスワイプ'), 170);
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveCount(1);
  });
});
