import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addTask, createList, delay, login, row, section } from './helpers';

async function openTask(page: Page, title: string) {
  await addTask(page, title);
  await row(page, title).getByRole('link').click();
  await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue(title);
}

test.describe('タスク詳細', () => {
  test('ラジオボタンでステータスと優先度を1つだけ選べる', async ({ page }) => {
    await login(page);
    await openTask(page, 'ラジオ確認');
    const status = page.getByRole('group', { name: 'ステータス' });
    await expect(status.getByRole('radio')).toHaveCount(3);
    await expect(status.getByRole('radio', { name: '未着手' })).toBeChecked();
    await status.getByRole('radio', { name: '進行中' }).check();
    await expect(status.getByRole('radio', { name: '進行中' })).toBeChecked();
    await expect(status.getByRole('radio', { name: '未着手' })).not.toBeChecked();

    const priority = page.getByRole('group', { name: '優先度' });
    await expect(priority.getByRole('radio', { name: '中' })).toBeChecked();
    await priority.getByRole('radio', { name: '高' }).check();
    await expect(priority.getByRole('radio', { name: '高' })).toBeChecked();
    await expect(priority.locator('input:checked')).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole('group', { name: 'ステータス' }).getByRole('radio', { name: '進行中' })).toBeChecked();
    await expect(page.getByRole('group', { name: '優先度' }).getByRole('radio', { name: '高' })).toBeChecked();

    await page.getByRole('navigation', { name: 'パンくずリスト' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(section(page, '進行中').getByTestId('task-row')).toContainText('高');
  });

  test('キーボードの矢印キーでもラジオを切り替えられる', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await login(page);
    await openTask(page, 'キーボード');
    const priority = page.getByRole('group', { name: '優先度' });
    await priority.getByRole('radio', { name: '中' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(priority.getByRole('radio', { name: '低' })).toBeChecked();
  });

  test('プルダウンで別のリストへ移動するとURLとパンくずが更新される', async ({ page }) => {
    await login(page);
    await createList(page, '移動先');
    await page.reload();
    await openTask(page, '引っ越すタスク');
    const button = page.getByRole('button', { name: 'リスト: インボックス', exact: true });
    await button.click();
    const listbox = page.getByRole('listbox', { name: 'リスト', exact: true });
    await expect(listbox.getByRole('option')).toHaveCount(2);
    await expect(listbox.getByRole('option', { name: 'インボックス' })).toHaveAttribute('aria-selected', 'true');
    await listbox.getByRole('option', { name: '移動先' }).click();
    await expect(page.getByRole('button', { name: 'リスト: 移動先', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' }).getByRole('listitem')).toHaveText([
      'ホーム',
      '移動先',
      '引っ越すタスク',
    ]);
    await page.reload();
    await expect(page.getByRole('button', { name: 'リスト: 移動先', exact: true })).toBeVisible();
  });

  test('プルダウンはキーボード操作（↓/Enter/Esc）に対応する', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await login(page);
    await createList(page, 'キー移動');
    await page.reload();
    await openTask(page, 'キー操作');
    const button = page.getByRole('button', { name: 'リスト: インボックス', exact: true });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    const listbox = page.getByRole('listbox', { name: 'リスト', exact: true });
    await expect(listbox).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(button).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'リスト: キー移動', exact: true })).toBeVisible();
  });

  test('アコーディオンで開閉でき、状態が保存される', async ({ page }) => {
    await login(page);
    await openTask(page, 'アコーディオン');
    const trigger = page.getByRole('button', { name: /^サブタスク/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('textbox', { name: 'サブタスクを追加' })).toBeVisible();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'サブタスクを追加' })).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: /^サブタスク/ })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: /^サブタスク/ }).click();
    await expect(page.getByRole('textbox', { name: 'サブタスクを追加' })).toBeVisible();
  });

  test('サブタスクの追加・完了・削除', async ({ page }) => {
    await login(page);
    await openTask(page, '旅行の準備');
    const input = page.getByRole('textbox', { name: 'サブタスクを追加' });
    await input.fill('パスポート');
    await input.press('Enter');
    await input.fill('充電器');
    await input.press('Enter');
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'パスポート' }).check();
    await expect(page.getByRole('button', { name: /^サブタスク/ })).toContainText('1/2');
    await page.getByRole('button', { name: '充電器を削除' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'パスポート' })).toBeChecked();
    await page.getByRole('navigation', { name: 'パンくずリスト' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(row(page, '旅行の準備')).toContainText('1/1');
  });

  test('Workers AIでサブタスクに分解（読み込み中はスケルトン）', async ({ page }) => {
    await login(page);
    await openTask(page, '引っ越し');
    await delay(page, '**/api/ai/breakdown', 1200);
    await page.getByRole('button', { name: 'AIで分解' }).click();
    const dialog = page.getByRole('dialog', { name: 'AIで分解' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('ai-skeleton')).toBeVisible();
    const suggestions = dialog.getByRole('list', { name: '提案' }).getByRole('checkbox');
    await expect(suggestions).toHaveCount(4);
    await expect(dialog.getByTestId('ai-skeleton')).toHaveCount(0);
    await suggestions.nth(3).uncheck();
    await dialog.getByRole('button', { name: '3件を追加' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('サブタスクを3件追加しました');
    await expect(page.getByRole('list').filter({ has: page.getByRole('checkbox') }).getByRole('checkbox')).toHaveCount(3);
  });

  test('AIが失敗したときは再試行できる', async ({ page }) => {
    await login(page);
    await openTask(page, 'AI失敗');
    let calls = 0;
    await page.route('**/api/ai/breakdown', async (route) => {
      calls++;
      if (calls === 1) await route.fulfill({ status: 502, json: { error: 'ai_unavailable' } });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'AIで分解' }).click();
    const dialog = page.getByRole('dialog', { name: 'AIで分解' });
    await expect(dialog.getByRole('alert')).toHaveText('AIの提案を取得できませんでした');
    await dialog.getByRole('button', { name: '再試行' }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(4);
  });

  test('期限・メモ・タイトルを編集でき、保存される', async ({ page }) => {
    await login(page);
    await openTask(page, '編集前');
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await page.getByLabel('期限', { exact: true }).fill(today);
    await expect(page.getByRole('button', { name: '期限をクリア' })).toBeVisible();

    const note = page.getByRole('textbox', { name: 'メモ' });
    await note.fill('駅前の店で');
    const title = page.getByRole('textbox', { name: 'タスク名' });
    await title.fill('編集後');
    await title.press('Enter');
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toContainText('編集後');

    await page.waitForTimeout(900); // note autosave debounce
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'タスク名' })).toHaveValue('編集後');
    await expect(page.getByRole('textbox', { name: 'メモ' })).toHaveValue('駅前の店で');
    await expect(page.getByLabel('期限', { exact: true })).toHaveValue(today);
    await page.getByRole('navigation', { name: 'パンくずリスト' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(row(page, '編集後')).toContainText('今日');
  });

  test('確認モーダルから削除するとリストに戻り、元に戻せる', async ({ page }) => {
    await login(page);
    await openTask(page, '詳細から削除');
    await page.getByRole('button', { name: 'タスクを削除' }).click();
    const confirm = page.getByRole('dialog', { name: 'このタスクを削除しますか？' });
    await confirm.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('heading', { name: 'インボックス', level: 1 })).toBeVisible();
    await expect(row(page, '詳細から削除')).toHaveCount(0);
    await page.getByRole('status').getByRole('button', { name: '元に戻す' }).click();
    await expect(row(page, '詳細から削除')).toBeVisible();
  });
});

test.describe('並び替えプルダウン', () => {
  test('優先度順・期限順に並び替えられる', async ({ page }) => {
    await login(page);
    const mk = async (title: string, patch: Record<string, unknown>) => {
      const r = await page.request.post('/api/tasks', { data: { title, ...patch }, headers: { origin: 'http://localhost:8788' } });
      expect(r.status()).toBe(201);
    };
    await mk('低い', { priority: 'low', dueDate: '2030-01-03' });
    await mk('高い', { priority: 'high', dueDate: '2030-01-02' });
    await mk('普通', { priority: 'medium', dueDate: '2030-01-01' });
    await page.reload();
    const titles = section(page, '未着手').locator('.task-title');
    await expect(titles).toHaveText(['普通', '高い', '低い']);

    await page.getByRole('button', { name: '並び替え: 新しい順' }).click();
    await page.getByRole('option', { name: '優先度順' }).click();
    await expect(titles).toHaveText(['高い', '普通', '低い']);

    await page.getByRole('button', { name: '並び替え: 優先度順' }).click();
    await page.getByRole('option', { name: '期限順' }).click();
    await expect(titles).toHaveText(['普通', '高い', '低い']);

    // Preference survives a reload
    await page.reload();
    await expect(page.getByRole('button', { name: '並び替え: 期限順' })).toBeVisible();
  });

  test('外側を押すとプルダウンが閉じる', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /^並び替え/ }).click();
    await expect(page.getByRole('listbox', { name: '並び替え' })).toBeVisible();
    await page.getByRole('heading', { name: 'すべてのタスク' }).click();
    await expect(page.getByRole('listbox', { name: '並び替え' })).toBeHidden();
  });
});
