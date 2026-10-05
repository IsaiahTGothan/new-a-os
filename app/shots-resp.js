// Responsive screenshots on the real store: 1024 and 390 widths.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const FILE = 'file://' + path.join(DIR, 'NewA-Land-Registry.html');
const SHOTS = path.join(DIR, 'shots');
const v2 = JSON.parse(fs.readFileSync(path.join(DIR, 'v2-state.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const booted = async () => { await page.waitForFunction(() => typeof S !== 'undefined' && S && !document.getElementById('boot'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(150); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FILE); await booted();
  await page.evaluate(async st => { await idbPut('state', 'main', st); }, v2);
  await page.reload(); await booted(); await page.evaluate(() => closeModal());
  for (const [w, h] of [[1024, 768], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const nav of ['overview', 'map', 'registry', 'history']) {
      await page.evaluate(id => setNav(id), nav); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `resp-${w}-${nav}.png`) });
    }
  }
  console.log('errors:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
