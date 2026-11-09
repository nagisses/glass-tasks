// Renders public/icon.svg into the PNG icons iOS and Android need (run: node scripts/make-icons.mjs)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  { file: 'public/icons/apple-touch-icon.png', size: 180, pad: 0, bg: '#e8f1ff' },
  { file: 'public/icons/icon-192.png', size: 192, pad: 0 },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0 },
  // Maskable: keep the artwork inside the 80% safe zone on a full-bleed background
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.12, bg: '#dbe8ff' },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setContent(
    `<html><body style="margin:0;width:${t.size}px;height:${t.size}px;display:grid;place-items:center;background:${t.bg ?? 'transparent'}">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: !t.bg });
  console.log('wrote', t.file);
}
await browser.close();
