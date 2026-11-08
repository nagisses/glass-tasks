import { expect, test } from '@playwright/test';
import { composer, createList, login, row } from './helpers';

test.describe('Geminiで追加', () => {
  test('自然な文から期限と優先度を読み取って追加する', async ({ page }) => {
    await login(page);
    await composer(page).fill('明日 歯医者に電話 急ぎ');
    const ai = page.getByRole('button', { name: 'AIで追加' });
    await expect(ai).toBeVisible();
    const res = page.waitForResponse((r) => r.url().endsWith('/api/ai/quick-add'));
    await ai.click();
    expect((await res).status()).toBe(201);
    const added = row(page, '歯医者に電話');
    await expect(added).toBeVisible();
    await expect(added).toContainText('明日');
    await expect(added).toContainText('高');
    await expect(added.locator('.task-title')).toHaveText('歯医者に電話');
    await expect(composer(page)).toHaveValue('');
    await expect(page.getByRole('status')).toContainText('AIで追加しました');
    await page.reload();
    await expect(row(page, '歯医者に電話')).toContainText('明日');
  });

  test('表示中のリストに追加される', async ({ page }) => {
    await login(page);
    const list = await createList(page, '通院');
    await page.goto(`/lists/${list.id}`);
    await composer(page).fill('いつか 健康診断の予約');
    await page.getByRole('button', { name: 'AIで追加' }).click();
    const added = row(page, '健康診断の予約');
    await expect(added).toBeVisible();
    await expect(added).toContainText('低');
    await page.goto('/');
    await expect(row(page, '健康診断の予約')).toContainText('通院');
  });

  test('Geminiが失敗したら入力を残してエラーを表示する', async ({ page }) => {
    await login(page);
    await composer(page).fill('失敗するメモ');
    await page.getByRole('button', { name: 'AIで追加' }).click();
    await expect(page.getByRole('status')).toContainText('AIで追加できませんでした');
    await expect(composer(page)).toHaveValue('失敗するメモ');
    await expect(page.getByTestId('task-row')).toHaveCount(0);
  });
});
