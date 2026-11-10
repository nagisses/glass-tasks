import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { addTask, clipRect, createList, login, openMenu, row } from './helpers';

async function expectCovers(pill: Locator, target: Locator) {
  await expect
    .poll(async () => {
      const p = await clipRect(pill);
      const t = (await target.boundingBox())!;
      if (!p || p.opacity !== '1') return 99;
      return Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y), Math.abs(p.width - t.width), Math.abs(p.height - t.height));
    })
    .toBeLessThan(1.5);
}

test.describe('伸縮するスライドピル', () => {
  test('セグメントの選択ピルは先端が先に伸び、後から追いついて選択肢にぴったり重なる', async ({ page }) => {
    await login(page);
    await addTask(page, 'ピルの確認');
    await row(page, 'ピルの確認').getByRole('link').click();
    const group = page.getByRole('group', { name: 'ステータス' });
    const pill = group.getByTestId('segment-pill');
    const seg = (name: string) => group.locator('label.segment').filter({ hasText: name });
    await expectCovers(pill, seg('未着手'));

    // Record the pill's edges on every frame while it moves from the first to the last segment.
    // The slide is slowed down 4x here so slow CI machines still catch plenty of frames mid-stretch.
    const { frames, segs } = await group.evaluate(async (el) => {
      (window as { __pillTimeScale?: number }).__pillTimeScale = 4;
      const track = el.querySelector<HTMLElement>('.segmented')!;
      const layer = el.querySelector<HTMLElement>('[data-testid="segment-pill"]')!;
      const tx = track.getBoundingClientRect().left;
      const segs = [...track.querySelectorAll<HTMLElement>(':scope > .segment')].map((s) => {
        const r = s.getBoundingClientRect();
        return { l: r.left - tx, r: r.right - tx };
      });
      const read = () => {
        const m = layer.style.clipPath.match(/inset\(([^)]*?)(?: round [^)]*)?\)/)!;
        const [t, r = t, , l = r] = m[1].trim().split(/\s+/).map((x) => parseFloat(x));
        return { l, r: layer.clientWidth - r };
      };
      const frames: { l: number; r: number }[] = [];
      track.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].click();
      const t0 = performance.now();
      while (performance.now() - t0 < 2800) {
        await new Promise(requestAnimationFrame);
        frames.push(read());
      }
      delete (window as { __pillTimeScale?: number }).__pillTimeScale;
      return { frames, segs };
    });
    const [first, , last] = segs;
    // How far each edge has travelled (0 = start, 1 = arrived). Judged per frame, so it also works
    // where the browser only paints a few frames per second (WebKit without a GPU).
    const gap = frames.map((f) => (f.r - first.r) / (last.r - first.r) - (f.l - first.l) / (last.l - first.l));
    // The leading (right) edge runs well ahead of the trailing (left) edge on the way...
    expect(Math.max(...gap)).toBeGreaterThan(0.25);
    // ...so the pill is stretched wider than one segment, and never the other way round
    expect(Math.max(...frames.map((f) => f.r - f.l))).toBeGreaterThan((first.r - first.l) * 1.15);
    expect(Math.min(...gap)).toBeGreaterThan(-0.02);
    await expect(group.getByRole('radio', { name: '完了' })).toBeChecked();
    await expectCovers(pill, seg('完了'));
  });

  test('サイドメニューでは現在のページの項目にピルが重なる', async ({ page }) => {
    await login(page);
    let menu = await openMenu(page);
    const pill = menu.getByTestId('menu-pill');
    await expectCovers(pill, menu.getByRole('link', { name: 'ホーム' }));
    await page.keyboard.press('Escape');

    const list = await createList(page, 'ピルのリスト');
    await page.goto(`/lists/${list.id}`);
    await expect(page.getByRole('heading', { name: 'ピルのリスト', level: 1 })).toBeVisible();
    menu = await openMenu(page);
    const link = menu.getByRole('link', { name: /ピルのリスト/ });
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expectCovers(pill, link);

    // Choosing another page slides the pill there before the menu closes
    const home = (await menu.getByRole('link', { name: 'ホーム' }).boundingBox())!;
    await menu.getByRole('link', { name: 'ホーム' }).click();
    // The leading (top) edge shoots up to the new item first
    await expect.poll(async () => Math.abs((await clipRect(pill))!.y - home.y), { timeout: 2000, intervals: [30] }).toBeLessThan(1.5);
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });
});

