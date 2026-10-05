// Smoke pass: boot fresh, boot on the real schema-2 store, visit every section, collect errors, screenshots.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const FILE = 'file://' + path.join(DIR, 'NewA-Land-Registry.html');
const SHOTS = path.join(DIR, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const v2 = JSON.parse(fs.readFileSync(path.join(DIR, 'v2-state.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const errors = [];
  const newPage = async (ctx, w = 1440, h = 900) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); }); return p; };
  const booted = async p => { await p.waitForFunction(() => typeof S !== 'undefined' && S && !document.getElementById('boot'), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(150); };
  const report = tag => { console.log(`[${tag}] errors: ${errors.length}`); for (const e of errors) console.log('   ', e); errors.length = 0; };

  let ctx = await browser.newContext(); let page = await newPage(ctx);
  await page.goto(FILE); await booted(page);
  console.log('fresh:', await page.evaluate(() => ({ schema: S.schema, n: S.buildings.length, regions: S.regions.length, nav: UI.nav, scope: UI.scope })));
  report('fresh boot');
  for (const nav of ['overview', 'registry', 'map', 'transit', 'civic', 'businesses', 'history']) { await page.evaluate(id => setNav(id), nav); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, `fresh-${nav}.png`) }); report('fresh ' + nav); }
  await ctx.close();

  ctx = await browser.newContext(); page = await newPage(ctx);
  await page.goto(FILE); await booted(page);
  await page.evaluate(async st => { await idbPut('state', 'main', st); }, v2);
  await page.reload(); await booted(page);
  const mig = await page.evaluate(() => ({ schema: S.schema, n: S.buildings.length, regions: S.regions.length, districts: S.districts.map(d => `${d.id}→${d.parentId}:${d.core}`), parcels: S.legacy.parcels.length, links: S.legacy.parcelLinks.length, report: MIGRATION.report ? Object.keys(MIGRATION.report) : null, modal: document.querySelector('#modal-root .mhd h3')?.textContent, hist: histBuildings().length, polys: S.districts.filter(d => d.polygons.length).map(d => d.id) }));
  console.log('migrated:', JSON.stringify(mig, null, 1));
  report('upgrade boot');
  await page.screenshot({ path: path.join(SHOTS, 'real-upgrade-report.png') });
  await page.evaluate(() => closeModal());
  for (const nav of ['overview', 'registry', 'map', 'transit', 'civic', 'businesses', 'history']) { await page.evaluate(id => setNav(id), nav); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, `real-${nav}.png`) }); report('real ' + nav); }
  await page.evaluate(() => { setNav('history'); UI.hseg = 'records'; renderView(false); }); await page.waitForTimeout(200); report('history records');
  await page.evaluate(() => { UI.hseg = 'chronicle'; renderView(false); }); await page.waitForTimeout(200); report('history chronicle');
  for (const seg of ['service', 'times', 'sandbox', 'checks']) { await page.evaluate(s => { setNav('transit'); UI.tseg = s; renderView(false); }, seg); await page.waitForTimeout(200); report('transit ' + seg); }
  for (const seg of ['facilities', 'officials', 'coverage', 'checks']) { await page.evaluate(s => { setNav('civic'); UI.cseg = s; renderView(false); }, seg); await page.waitForTimeout(200); report('civic ' + seg); }
  await page.evaluate(() => { clawToggle(true); }); await page.waitForTimeout(150); report('clawson open'); await page.evaluate(() => clawRun('How is the city doing?')); await page.waitForFunction(() => !CLAW.busy); report('clawson answer'); await page.evaluate(() => { CLAW.view = 'activity'; clawRender(); }); report('clawson activity'); await page.evaluate(() => clawToggle(false));
  await page.evaluate(() => { setNav('overview'); openDigestModal(30); }); await page.waitForTimeout(200); report('digest'); await page.evaluate(() => { closeModal(); openValuationModal(); }); await page.waitForTimeout(200); report('valuations'); await page.evaluate(() => { closeModal(); openOfficialModal(null); }); await page.waitForTimeout(200); report('official modal'); await page.evaluate(() => { closeModal(); openProjectModal(null); }); await page.waitForTimeout(200); report('project modal'); await page.evaluate(() => closeModal());
  await page.evaluate(() => { UI.hseg = 'stats'; renderView(false); }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'real-history-stats.png') }); report('history stats');
  await page.evaluate(() => openHistoryViewer({ index: 0 })); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-hv-0.png') });
  await page.evaluate(() => hvSet(hyIndex(2019, 'L'), { instant: true })); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'real-hv-2019L.png') });
  await page.evaluate(() => hvSet(HV.i1, { instant: true })); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'real-hv-end.png') });
  console.log('hv counts end:', await page.evaluate(() => ({ i1: HV.i1, counts: hyCounts(HV.rows, HV.i1), undated: undatedOf(HV.rows), active: activeBuildings().length })));
  await page.evaluate(() => closeHistoryViewer()); report('viewer');
  // drawer
  await page.evaluate(() => { setNav('registry'); openBuilding(S.buildings.find(b => b.reg === 'MA-0004').id); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-drawer-esb.png') }); report('drawer view');
  await page.evaluate(() => openBuilding(DR.id, 'edit')); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-drawer-edit.png') }); report('drawer edit');
  await page.evaluate(() => closeDrawer(true));
  await page.evaluate(() => openDataModal()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-data-modal.png') }); report('data modal');
  await page.evaluate(() => closeModal());
  await page.evaluate(() => openIssuesModal()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-issues.png') }); report('issues');
  await page.evaluate(() => closeModal());
  await page.evaluate(() => openNewsInbox()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'real-news.png') }); report('news inbox');
  await page.evaluate(() => closeModal());
  await page.evaluate(() => openScopePop()); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'real-scope-pop.png') }); report('scope pop');
  await page.evaluate(() => closeScopePop());
  await page.evaluate(() => { $('#q').value = 'empire'; UI.q = 'empire'; openPalette(); }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'real-palette.png') }); report('palette');
  await ctx.close(); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
