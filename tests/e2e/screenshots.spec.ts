import { expect, test } from '@playwright/test';
import { apiPost, createList, login, openMenu, row } from './helpers';

// Generates README screenshots. Run with: SCREENSHOTS=1 npx playwright test screenshots --project=mobile-safari
test.skip(!process.env.SCREENSHOTS, 'screenshots only on demand');

test('screens', async ({ page }) => {
  await login(page);
  const work = await createList(page, '仕事', 1);
  await createList(page, '買い物', 2);
  await createList(page, '旅行', 5);
  const mk = (title: string, extra: Record<string, unknown> = {}) =>
    apiPost<{ task: { id: string } }>(page, '/api/tasks', { title, ...extra });
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  await mk('牛乳と卵を買う', { priority: 'low' });
  const a = await mk('企画書のドラフトを書く', { listId: work.id, priority: 'high', dueDate: today });
  await mk('週次ミーティングの議題を送る', { listId: work.id, dueDate: '2030-01-10' });
  const b = await mk('請求書を確認する', { listId: work.id });
  await page.request.patch(`/api/tasks/${b.task.id}`, { data: { status: 'doing' }, headers: { origin: 'http://localhost:8788' } });
  await apiPost(page, `/api/tasks/${a.task.id}/subtasks`, { titles: ['構成を決める', '競合を調べる', '下書きを書く'] });
  await page.reload();
  await expect(row(page, '企画書のドラフトを書く')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/home.png' });

  await openMenu(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/menu.png' });
  await page.keyboard.press('Escape');

  await page.goto(`/lists/${work.id}`);
  await expect(page.getByRole('heading', { name: '仕事', level: 1 })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/list.png' });

  // Swipe in progress
  const el = row(page, '週次ミーティングの議題を送る').getByTestId('task-swipe');
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 80 + i * 14, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/screenshots/swipe.png' });
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();

  await row(page, '企画書のドラフトを書く').getByRole('link').click();
  await expect(page.getByRole('textbox', { name: 'タスク名' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/task.png', fullPage: true });

  await page.getByRole('button', { name: 'AIで分解' }).click();
  await expect(page.getByRole('dialog', { name: 'AIで分解' }).getByRole('checkbox').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/ai.png' });
  await page.keyboard.press('Escape');

  await page.goto('/');
  await page.route('**/api/tasks', async (r) => {
    await new Promise((res) => setTimeout(res, 3000));
    await r.continue();
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/skeleton.png' });
});
