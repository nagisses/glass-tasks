import { expect, test } from '@playwright/test';
import { addTask, login, row, section, slowSwipe, stableBox } from './helpers';

async function openSheet(page: import('@playwright/test').Page, title: string) {
  await slowSwipe(page, row(page, title), -150);
  await row(page, title).getByRole('button', { name: '編集', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('ボトムシート', () => {
  test('スワイプの「編集」で画面の下からせり上がり、ステータスと優先度を変えられる', async ({ page }) => {
    await login(page);
    await addTask(page, 'シートで編集');
    const sheet = await openSheet(page, 'シートで編集');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#root')).toHaveAttribute('inert', '');

    // Anchored to the bottom edge, full width on phones
    const vp = page.viewportSize()!;
    await expect.poll(async () => {
      const box = (await sheet.boundingBox())!;
      return Math.abs(box.y + box.height - vp.height);
    }).toBeLessThan(2);
    if (vp.width < 560) expect((await sheet.boundingBox())!.width).toBeGreaterThan(vp.width - 3);

    await sheet.getByRole('radio', { name: '進行中' }).check();
    await expect(sheet.getByRole('radio', { name: '進行中' })).toBeChecked();
    await sheet.getByRole('radio', { name: '高' }).check();
    await sheet.getByLabel('期限').fill('2030-05-01');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    const r = section(page, '進行中').getByTestId('task-row');
    await expect(r).toHaveAttribute('data-status', 'doing');
    await expect(r.locator('.chip-priority')).toHaveText('高');
    await expect(r.locator('.chip-due')).toHaveText('5/1');
    await page.reload();
    await expect(row(page, 'シートで編集')).toHaveAttribute('data-status', 'doing');
  });

  test('つまみを下に引っ張ると閉じ、少しだけなら元に戻る', async ({ page }) => {
    await login(page);
    await addTask(page, '引いて閉じる');
    const sheet = await openSheet(page, '引いて閉じる');
    const grab = await stableBox(page.getByTestId('sheet-grabber'));
    const x = grab.x + grab.width / 2;
    const y = grab.y + grab.height / 2;

    // A short pull springs back
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 8 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(600);
    await expect(sheet).toBeVisible();
    await expect
      .poll(async () => Math.abs((await page.getByTestId('sheet-grabber').boundingBox())!.y - grab.y))
      .toBeLessThan(1);

    // A long pull dismisses
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 240, { steps: 12 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  });

  test('背景を押すと閉じ、「詳細」でタスク詳細を開ける', async ({ page }) => {
    await login(page);
    await addTask(page, 'シートから詳細');
    let sheet = await openSheet(page, 'シートから詳細');
    await page.getByTestId('modal-backdrop').click({ position: { x: 20, y: 20 }, force: true });
    await expect(sheet).toBeHidden();

    sheet = await openSheet(page, 'シートから詳細');
    await sheet.getByRole('link', { name: '詳細' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue('シートから詳細');
  });

  test('シートの「削除」で削除でき、元に戻せる', async ({ page }) => {
    await login(page);
    await addTask(page, 'シートで削除');
    const sheet = await openSheet(page, 'シートで削除');
    await sheet.getByRole('button', { name: '削除', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(row(page, 'シートで削除')).toHaveCount(0);
    await page.getByRole('status').getByRole('button', { name: '元に戻す' }).click();
    await expect(row(page, 'シートで削除')).toBeVisible();
  });
});
