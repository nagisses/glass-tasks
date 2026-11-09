import { expect, test } from '@playwright/test';
import { addTask, composer, createList, login, row } from './helpers';

test.describe('オートコンプリート', () => {
  test('入力の途中で過去のタスク名を候補に出し、↓とEnterで選べる', async ({ page }) => {
    await login(page);
    await addTask(page, '牛乳を買う');
    await addTask(page, '牛肉を買う');
    await addTask(page, '電話する');

    const input = composer(page);
    await input.fill('牛');
    const box = page.getByRole('listbox', { name: '候補' });
    await expect(box).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(box.getByRole('option')).toHaveText(['牛肉を買う', '牛乳を買う']);

    await input.press('ArrowDown');
    await expect(box.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    const activeId = await box.getByRole('option').first().getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', activeId!);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toHaveValue('牛乳を買う');
    await expect(box).toBeHidden();

    // Enter again adds it
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(row(page, '牛乳を買う')).toHaveCount(2);
  });

  test('候補をタップで選べ、ひらがな・カタカナの違いは無視される', async ({ page }) => {
    await login(page);
    await addTask(page, 'コーヒー豆を注文');
    const input = composer(page);
    await input.fill('こーひー');
    const option = page.getByRole('option', { name: 'コーヒー豆を注文' });
    await expect(option).toBeVisible();
    await option.click();
    await expect(input).toHaveValue('コーヒー豆を注文');
    await expect(input).toBeFocused();
  });

  test('「#」でリスト名の候補を出し、選ぶと追加先が変わる', async ({ page }) => {
    await login(page);
    await createList(page, '仕事場');
    await page.reload();
    const input = composer(page);
    await input.fill('資料を印刷 #仕');
    await page.getByRole('option', { name: '仕事場' }).click();
    await expect(input).toHaveValue('資料を印刷');
    await expect(page.getByRole('button', { name: '追加先リスト: 仕事場' })).toBeVisible();
    await input.press('Enter');
    await expect(row(page, '資料を印刷')).toContainText('仕事場');
  });

  test('Escで閉じ、一致がなければ候補は出ない', async ({ page }) => {
    await login(page);
    await addTask(page, '掃除をする');
    const input = composer(page);
    await input.fill('掃');
    await expect(page.getByRole('listbox', { name: '候補' })).toBeVisible();
    await input.press('Escape');
    await expect(page.getByRole('listbox', { name: '候補' })).toBeHidden();
    await expect(input).toHaveValue('掃');
    await input.fill('まったく別の文字');
    await expect(page.getByRole('listbox', { name: '候補' })).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
