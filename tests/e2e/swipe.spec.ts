import { expect, test } from '@playwright/test';
import { addTask, login, row, rowWidth, section, slowSwipe, swipe, touchFlick } from './helpers';

test.describe('スワイプアクション', () => {
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

  test('左にスワイプすると「編集」「削除」ボタンが出て、削除はトーストの「元に戻す」で復元できる', async ({ page }) => {
    await login(page);
    await addTask(page, '消すタスク');
    const r = row(page, '消すタスク');
    // Hidden until the row is swiped
    await expect(r.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
    await swipe(page, r, -170);
    await expect(r).toHaveAttribute('data-open', 'right');
    await expect(r.getByRole('button', { name: '編集', exact: true })).toBeVisible();
    const del = r.getByRole('button', { name: '削除', exact: true });
    await expect(del).toBeVisible();
    // The row slid exactly far enough to uncover both buttons
    await expect
      .poll(async () => {
        const swipeBox = (await r.getByTestId('task-swipe').boundingBox())!;
        const delBox = (await del.boundingBox())!;
        return Math.abs(swipeBox.x + swipeBox.width - (delBox.x - 80));
      })
      .toBeLessThan(2);

    await del.click();
    await expect(row(page, '消すタスク')).toHaveCount(0);
    const toast = page.getByRole('status');
    await expect(toast).toContainText('削除しました');
    await toast.getByRole('button', { name: '元に戻す' }).click();
    await expect(row(page, '消すタスク')).toBeVisible();
    await page.reload();
    await expect(row(page, '消すタスク')).toBeVisible();
  });

  test('削除ボタンでの削除は再読み込み後も反映される', async ({ page }) => {
    await login(page);
    await addTask(page, '本当に消す');
    const deleted = page.waitForResponse((r) => r.url().includes('/api/tasks/') && r.request().method() === 'DELETE');
    await slowSwipe(page, row(page, '本当に消す'), -150);
    await row(page, '本当に消す').getByRole('button', { name: '削除', exact: true }).click();
    await expect(row(page, '本当に消す')).toHaveCount(0);
    expect((await deleted).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
    await expect(row(page, '本当に消す')).toHaveCount(0);
  });

  test('左に大きく引き切るとボタンを押さずに削除される', async ({ page }) => {
    await login(page);
    await addTask(page, '引き切る');
    const r = row(page, '引き切る');
    await slowSwipe(page, r, -(await rowWidth(r)) * 0.8);
    await expect(row(page, '引き切る')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('削除しました');
  });

  test('ゆっくり右にずらすとステータスボタンが出て、押すと進行中になる', async ({ page }) => {
    await login(page);
    await addTask(page, 'ボタンで進める');
    const r = row(page, 'ボタンで進める');
    await slowSwipe(page, r, 110);
    await expect(r).toHaveAttribute('data-open', 'left');
    await expect(r).toHaveAttribute('data-status', 'todo');
    await r.getByRole('button', { name: 'ステータスを進行中に' }).click();
    await expect(section(page, '進行中').getByTestId('task-row')).toHaveAttribute('data-status', 'doing');
  });

  test('開いた行は、行をタップするか他の場所を触ると閉じ、詳細画面は開かない', async ({ page }) => {
    await login(page);
    await addTask(page, '閉じる行');
    const r = row(page, '閉じる行');
    await slowSwipe(page, r, -150);
    await expect(r).toHaveAttribute('data-open', 'right');
    await r.getByRole('link').click();
    await expect(r).not.toHaveAttribute('data-open');
    await expect(page).toHaveURL(/\/$/);

    await slowSwipe(page, r, -150);
    await expect(r).toHaveAttribute('data-open', 'right');
    await page.getByRole('heading', { name: 'すべてのタスク' }).click();
    await expect(r).not.toHaveAttribute('data-open');
    await expect(r.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
  });

  test('別の行を開くと、前に開いていた行は閉じる', async ({ page }) => {
    await login(page);
    await addTask(page, '一つ目');
    await addTask(page, '二つ目');
    await slowSwipe(page, row(page, '一つ目'), -150);
    await expect(row(page, '一つ目')).toHaveAttribute('data-open', 'right');
    await slowSwipe(page, row(page, '二つ目'), -150);
    await expect(row(page, '二つ目')).toHaveAttribute('data-open', 'right');
    await expect(row(page, '一つ目')).not.toHaveAttribute('data-open');
  });

  test('短いスワイプは元の位置に戻り、何も変わらない', async ({ page }) => {
    await login(page);
    await addTask(page, 'ちょっとだけ');
    await swipe(page, row(page, 'ちょっとだけ'), 40);
    // The snap-back is animated; slow CI renderers may need a while to finish it
    await expect
      .poll(() => row(page, 'ちょっとだけ').getByTestId('task-swipe').evaluate((el) => getComputedStyle(el).transform), {
        timeout: 8000,
      })
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(row(page, 'ちょっとだけ')).toHaveAttribute('data-status', 'todo');
    await expect(page).toHaveURL(/\/$/);
  });

  test('一瞬で終わる短いスワイプでも詳細画面は開かない', async ({ page }) => {
    await login(page);
    await addTask(page, '素早く');
    const box = (await row(page, '素早く').getByTestId('task-swipe').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 90, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/$/);
    await expect(row(page, '素早く')).toHaveAttribute('data-status', 'todo');
  });

  test('処理の遅い端末でも、短いスワイプは元の位置に戻る', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling uses the Chrome DevTools Protocol');
    await login(page);
    await addTask(page, '遅い端末');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
    const swipeEl = row(page, '遅い端末').getByTestId('task-swipe');
    const box = (await swipeEl.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 90, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 2 });
    await page.mouse.up();
    await expect
      .poll(() => swipeEl.evaluate((el) => getComputedStyle(el).transform), { timeout: 8000 })
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await expect(page).toHaveURL(/\/$/);
    await expect(row(page, '遅い端末')).toHaveAttribute('data-status', 'todo');
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
