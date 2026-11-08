import { expect, test } from '@playwright/test';
import { BASE, login, openMenu } from './helpers';

test.describe('Google認証', () => {
  test('未ログインではGoogleログインだけが表示され、余計な文言がない', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.login-card');
    await expect(page.getByRole('link', { name: 'Googleでログイン' })).toBeVisible();
    // Only the app name and the sign-in button: no taglines or decorative copy
    await expect(card).toHaveText(/^\s*Glass Tasks\s*Googleでログイン\s*$/);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  });

  test('Googleでログインし、再読み込み後もセッションが続く', async ({ page }) => {
    const email = await login(page);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
    const menu = await openMenu(page);
    await expect(menu.getByText(email)).toBeVisible();
  });

  test('ハンバーガーメニューからログアウトできる', async ({ page }) => {
    await login(page);
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page.getByRole('link', { name: 'Googleでログイン' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Googleでログイン' })).toBeVisible();
    expect((await page.request.get('/api/me')).status()).toBe(401);
  });

  test('Googleの同意画面でキャンセルするとエラーを表示する', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Googleでログイン' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alert')).toHaveText('ログインできませんでした');
    await expect(page).toHaveURL(`${BASE}/`);
  });

  test('state不一致のコールバックは拒否される', async ({ page }) => {
    await page.goto('/auth/callback?code=forged&state=forged');
    await expect(page.getByRole('alert')).toHaveText('ログインできませんでした');
    expect((await page.request.get('/api/me')).status()).toBe(401);
  });

  test('APIは未認証・別オリジンからの書き込みを拒否する', async ({ page, request }) => {
    expect((await request.get('/api/me')).status()).toBe(401);
    expect((await request.get('/api/tasks')).status()).toBe(401);
    await login(page);
    const noOrigin = await page.request.post('/api/tasks', { data: { title: 'x' } });
    expect(noOrigin.status()).toBe(403);
    const evil = await page.request.post('/api/tasks', { data: { title: 'x' }, headers: { origin: 'https://evil.example' } });
    expect(evil.status()).toBe(403);
    const ok = await page.request.post('/api/tasks', { data: { title: 'x' }, headers: { origin: BASE } });
    expect(ok.status()).toBe(201);
  });

  test('他のユーザーのタスクは見えない', async ({ browser }) => {
    const a = await browser.newPage();
    await login(a, 'alice');
    const res = await a.request.post('/api/tasks', { data: { title: 'Aliceの秘密' }, headers: { origin: BASE } });
    const { task } = await res.json();

    const b = await browser.newPage();
    await login(b, 'bob');
    expect((await b.request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
    const patch = await b.request.patch(`/api/tasks/${task.id}`, { data: { title: 'hacked' }, headers: { origin: BASE } });
    expect(patch.status()).toBe(404);
    await expect(b.getByText('Aliceの秘密')).toHaveCount(0);
    await a.close();
    await b.close();
  });
});
