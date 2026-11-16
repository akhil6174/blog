// npm run brand: renders the brand PNGs (favicon.ico sizes, apple-touch-icon, OG logo, default share image, monogram avatar) with Playwright.
import { chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'trutiai-brand-'));
const favPaths = readFileSync(`${root}/public/favicon.svg`, 'utf8').match(/<g[\s\S]*<\/g>/)[0].replace(/class="e"/g, 'fill="#292929"');
const emblem = (bg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 565 565" width="100%" height="100%">${bg ? `<rect width="565" height="565" rx="${bg.r}" fill="${bg.c}"/>` : ''}<g transform="translate(${pad} ${pad}) scale(${(565 - 2 * pad) / 565})">${favPaths}</g></svg>`;
const logo = readFileSync(`${root}/public/logo.svg`, 'utf8');
const b = await chromium.launch();
const page = await b.newPage();
async function shot(html, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
  await page.waitForTimeout(150);
  writeFileSync(out, await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } }));
}
const icoSizes = [16, 32, 48];
const pngs = [];
for (const s of icoSizes) { const f = `${tmp}/fav-${s}.png`; await shot(emblem({ c: '#f0ede6', r: 110 }, 40), s, s, f, true); pngs.push(readFileSync(f)); }
// ICO container with embedded PNGs.
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
const dir = Buffer.alloc(16 * pngs.length); let offset = 6 + 16 * pngs.length;
pngs.forEach((png, i) => { const s = icoSizes[i]; dir.writeUInt8(s % 256, i * 16); dir.writeUInt8(s % 256, i * 16 + 1); dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6); dir.writeUInt32LE(png.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12); offset += png.length; });
writeFileSync(`${root}/public/favicon.ico`, Buffer.concat([header, dir, ...pngs]));
await shot(emblem({ c: '#f0ede6', r: 0 }, 70), 180, 180, `${root}/public/apple-touch-icon.png`);
await shot(emblem(null, 0), 96, 96, `${root}/src/assets/brand/emblem-96.png`, true);
const card = (w, h, tagline) => `<div style="width:${w}px;height:${h}px;background:#f0ede6;position:relative;font-family:Arial,Helvetica,sans-serif">
  <div style="position:absolute;left:${w * 0.075}px;top:${h * 0.36}px;width:${w * 0.55}px">${logo}</div>
  ${tagline ? `<p style="position:absolute;left:${w * 0.078}px;top:${h * 0.36 + w * 0.55 * 225 / 940 + h * 0.05}px;margin:0;font-size:${Math.round(w / 34)}px;color:#625e57">${tagline}</p>` : ''}
  <div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(h * 0.045)}px;background:#6a5cb1"></div></div>`;
await shot(card(1200, 630, 'trutiai.in'), 1200, 630, `${root}/public/og-default.png`);
// Monogram avatar in the brand purple (replace with a real photo when available).
await shot(`<div style="width:512px;height:512px;background:#6a5cb1;display:flex;align-items:center;justify-content:center;color:#f0ede6;font:700 200px Arial,Helvetica,sans-serif;letter-spacing:-6px">AD</div>`, 512, 512, `${root}/src/assets/images/avatar-akhil.png`);
await b.close();
console.log('done');
