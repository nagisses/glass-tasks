import { expect, test } from '@playwright/test';
import { addTask, composer, createList, login, row, section } from './helpers';

test.describe('即時入力', () => {
  test('開いた直後から入力欄が使える（PCでは自動フォーカス）', async ({ page, isMobile }) => {
    await login(page);
    const input = composer(page);
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();
    await expect(input).toBeInViewport();
    if (!isMobile) await expect(input).toBeFocused();
  });

  test('Enterで続けて追加でき、入力欄のフォーカスが残る', async ({ page }) => {
    await login(page);
    await addTask(page, '企画書を書く');
    await expect(composer(page)).toBeFocused();
    await addTask(page, '牛乳を買う');
    await expect(section(page, '未着手').getByTestId('task-row')).toHaveCount(2);
    // Newest first
    await expect(section(page, '未着手').getByTestId('task-row').first()).toContainText('牛乳を買う');
    await page.reload();
    await expect(row(page, '企画書を書く')).toBeVisible();
  });

  test('送信ボタンでも追加でき、空文字は追加されない', async ({ page }) => {
    await login(page);
    const input = composer(page);
    await expect(page.getByRole('button', { name: '追加', exact: true })).toHaveCount(0);
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.getByTestId('task-row')).toHaveCount(0);
    await input.fill('ボタンで追加');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(row(page, 'ボタンで追加')).toBeVisible();
  });

  test('プルダウンで追加先リストを選べる', async ({ page }) => {
    await login(page);
    const list = await createList(page, '仕事');
    await page.reload();
    await page.getByRole('button', { name: /^追加先リスト/ }).click();
    const listbox = page.getByRole('listbox', { name: '追加先リスト' });
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: '仕事' }).click();
    await expect(listbox).toBeHidden();
    await expect(page.getByRole('button', { name: '追加先リスト: 仕事' })).toBeVisible();
    await addTask(page, '週報を出す');
    await expect(row(page, '週報を出す')).toContainText('仕事');
    await page.goto(`/lists/${list.id}`);
    await expect(row(page, '週報を出す')).toBeVisible();
  });

  test('リスト画面ではそのリストに追加される', async ({ page }) => {
    await login(page);
    const list = await createList(page, '買い物');
    await page.goto(`/lists/${list.id}`);
    await expect(page.getByRole('button', { name: '追加先リスト: 買い物' })).toBeVisible();
    await addTask(page, '卵');
    await page.goto('/');
    await expect(row(page, '卵')).toContainText('買い物');
  });

  test('入力途中の下書きは再読み込みしても残る', async ({ page }) => {
    await login(page);
    await composer(page).fill('書きかけのメモ');
    await page.reload();
    await expect(composer(page)).toHaveValue('書きかけのメモ');
  });
});
