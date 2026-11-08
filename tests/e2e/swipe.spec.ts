import { expect, test } from '@playwright/test';
import { addTask, login, row, section, swipe, touchFlick } from './helpers';

test.describe('スワイプでステータス変更', () => {
  test('右スワイプで 未着手 → 進行中 → 完了 と進み、保存される', async ({ page }) => {
    await login(page);
    await addTask(page, 'スワイプするタスク');

    await swipe(page, row(page, 'スワイプするタスク'), 170);
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveAttribute('data-status', 'doing');
    await expect(page.getByRole('status')).toContainText('進行中にしました');

    await swipe(page, row(page, 'スワイプするタスク'), 170);
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveCount(0);
    // 完了 is collapsed by default
    await section(page, '完了').getByRole('button', { name: /^完了/ }).click();
    await expect(section(page, '完了').getByTestId('task-row')).toHaveAttribute('data-status', 'done');

    await page.reload();
    await expect(row(page, 'スワイプするタスク')).toHaveAttribute('data-status', 'done');
  });

  test('左スワイプで削除し、トーストの「元に戻す」で復元できる', async ({ page }) => {
    await login(page);
    await addTask(page, '消すタスク');
    await swipe(page, row(page, '消すタスク'), -170);
    await expect(row(page, '消すタスク')).toHaveCount(0);
    const toast = page.getByRole('status');
    await expect(toast).toContainText('削除しました');
    await toast.getByRole('button', { name: '元に戻す' }).click();
    await expect(row(page, '消すタスク')).toBeVisible();
    await page.reload();
    await expect(row(page, '消すタスク')).toBeVisible();
  });

  test('左スワイプの削除は再読み込み後も反映される', async ({ page }) => {
    await login(page);
    await addTask(page, '本当に消す');
    const deleted = page.waitForResponse((r) => r.url().includes('/api/tasks/') && r.request().method() === 'DELETE');
    await swipe(page, row(page, '本当に消す'), -170);
    await expect(row(page, '本当に消す')).toHaveCount(0);
    expect((await deleted).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
    await expect(row(page, '本当に消す')).toHaveCount(0);
  });

  test('短いスワイプは元の位置に戻り、何も変わらない', async ({ page }) => {
    await login(page);
    await addTask(page, 'ちょっとだけ');
    await swipe(page, row(page, 'ちょっとだけ'), 40);
    await page.waitForTimeout(500);
    await expect(row(page, 'ちょっとだけ')).toHaveAttribute('data-status', 'todo');
    await expect(page).toHaveURL(/\/$/);
    const transform = await row(page, 'ちょっとだけ').getByTestId('task-swipe').evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });

  test('タッチのフリックで完了にできる（Chromium実タッチ入力）', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !isMobile, 'CDP touch input is Chromium-only');
    await login(page);
    await addTask(page, 'フリック');
    const box = (await row(page, 'フリック').getByTestId('task-swipe').boundingBox())!;
    await touchFlick(page, box.x + 80, box.y + box.height / 2, 200);
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveCount(1);
  });

  test('ステータスボタンでも同じ操作ができる', async ({ page }) => {
    await login(page);
    await addTask(page, 'ボタン操作');
    await page.getByRole('button', { name: 'ボタン操作を進行中にする' }).click();
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'ボタン操作を完了にする' }).click();
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveCount(0);
    await expect(section(page, '完了').getByRole('button', { name: /^完了/ })).toContainText('1');
  });
});
