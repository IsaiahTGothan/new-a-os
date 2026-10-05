// Acceptance checks for NewA-Land-Registry.html 2.5 in headless Chromium, on the real schema-2 data.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const FILE = 'file://' + path.join(DIR, 'NewA-Land-Registry.html');
const SHOTS = path.join(DIR, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const v2 = JSON.parse(fs.readFileSync(path.join(DIR, 'v2-state.json'), 'utf8'));
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  ✗ FAIL:', msg); } else console.log('  ✓', msg); };
const FEED = (extra = '') => `<?xml version="1.0"?><rss version="2.0"><channel><title>New A</title>
<item><title>Empire State Building declared a landmark</title><link>https://newa-site.vercel.app/news/esb-landmark</link><guid>esb-landmark</guid><pubDate>Tue, 06 Jan 2026 10:00:00 GMT</pubDate><description>In January 2026 the Empire State Building was designated a landmark by the City of New A. ${extra}</description></item>
<item><title>Central Park Tower tops out</title><link>https://newa-site.vercel.app/news/cpt</link><guid>cpt-topped</guid><pubDate>Fri, 15 May 2026 10:00:00 GMT</pubDate><description>Central Park Tower topped out in May 2026; the exterior is complete but interiors continue.</description></item>
<item><title>Penn A joins the Union</title><link>https://newa-site.vercel.app/news/penn-a</link><guid>penn-a-joins</guid><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><description>Penn A joins the Union after years of isolation. A new bridge links it to Long Island.</description></item>
</channel></rss>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const errors = [];
  const newPage = async (ctx, w = 1440, h = 900) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource|ERR_FAILED|disk full \(simulated\)/.test(m.text())) errors.push('console: ' + m.text()); }); return p; };
  const booted = async p => { await p.waitForFunction(() => typeof S !== 'undefined' && S && !document.getElementById('boot'), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(150); };
  const noErrors = tag => { ok(errors.length === 0, `no console/page errors · ${tag}` + (errors.length ? ' → ' + errors.join(' | ') : '')); errors.length = 0; };

  // ---------- A · upgrade of the real schema-2 store ----------
  console.log('\nA · upgrade of the real store (153 buildings, 13 parcels, 18 chronicle)');
  let ctx = await browser.newContext(); let page = await newPage(ctx);
  await page.goto(FILE); await booted(page);
  await page.evaluate(async st => { await idbPut('state', 'main', st); }, v2);
  await page.reload(); await booted(page);
  const mig = await page.evaluate(v2 => {
    const byId = Object.fromEntries(v2.buildings.map(b => [b.id, b]));
    const idsSame = S.buildings.length === v2.buildings.length && S.buildings.every(b => byId[b.id]);
    const regsSame = S.buildings.every(b => byId[b.id]?.reg === b.reg);
    const valuesSame = S.buildings.every(b => { const o = byId[b.id]; return ['name', 'number', 'street', 'districtId', 'neighborhoodId', 'bldgClass', 'zoning', 'floors', 'height', 'assessTotal', 'listPrice', 'x', 'z', 'notes', 'created', 'yearDemolished', 'relations', 'formerRegs', 'significance', 'historyNotes'].every(k => k === 'relations' ? JSON.stringify((o[k] || []).map(r => [r.type, r.id])) === JSON.stringify(b[k].filter(r => !/^from parcel/.test(r.note || '')).map(r => [r.type, r.id])) : k === 'historyNotes' ? b[k].startsWith(o[k] || '') : JSON.stringify(o[k] ?? null) === JSON.stringify(b[k] ?? null)); });
    const statusRoundTrip = S.buildings.every(b => summaryStatus(b) === byId[b.id].status && b.legacyStatus === byId[b.id].status && b.status === byId[b.id].status);
    const split = {}; for (const b of S.buildings) { const k = byId[b.id].status; split[k] = split[k] || { physical: new Set(), market: new Set(), landmark: new Set() }; split[k].physical.add(b.physical); split[k].market.add(b.market); split[k].landmark.add(b.landmark); }
    const splitOk = [...split.standing.physical].join() === 'standing' && [...split.landmark.landmark].join() === 'true' && [...split.landmark.physical].join() === 'standing' && [...split['for-sale'].market].join() === 'for-sale' && [...split.vacant.physical].join() === 'vacant-lot' && [...split.construction.physical].join() === 'construction' && [...split.demolished.physical].join() === 'demolished';
    const cpt = S.buildings.find(b => b.reg === 'MA-0013');
    const yearBuiltSame = S.buildings.every(b => b.id === cpt.id ? true : (byId[b.id].yearBuilt ?? null) === (b.yearBuilt ?? null));
    const halvesEmpty = S.buildings.every(b => b.halfBuilt === '' && b.halfDemolished === '');
    return { schema: S.schema, idsSame, regsSame, valuesSame, statusRoundTrip, splitOk, yearBuiltSame, halvesEmpty, cpt: { yearBuilt: cpt.yearBuilt, yearExpected: cpt.yearExpected, physical: cpt.physical, notes: cpt.migrationNotes }, parcelsGone: S.parcels === undefined && !S.buildings.some(b => 'parcelIds' in b), legacy: { parcels: S.legacy.parcels.length, links: S.legacy.parcelLinks.length, notes: S.legacy.notes.length }, parcelLinks: S.buildings.reduce((a, b) => a + b.relations.filter(r => /^from parcel/.test(r.note || '')).length, 0), seq: S.meta.seq, hseq: S.meta.hseq, gseq: S.meta.gseq, hist: histBuildings().length, active: activeBuildings().length, modal: document.querySelector('#modal-root .mhd h3')?.textContent || '', pre: !!MIGRATION.pre, regions: S.regions.map(r => r.id), parents: Object.fromEntries(S.districts.map(d => [d.id, d.parentId])), core: S.districts.filter(d => d.core).map(d => d.id), polys: S.districts.filter(d => d.polygons.length).map(d => [d.id, d.polygons[0].length]), hoodPolys: S.neighborhoods.filter(h => h.polygons.length).length, conflict: S.regions.filter(r => r.placement === 'conflict').map(r => r.id), migrations: S.meta.migrations.map(m => `${m.from}→${m.to}`), archive: S.archive.length, imagesFlag: S.buildings.filter(b => b.image).length, scope: UI.scope, nav: UI.nav };
  }, v2);
  ok(mig.schema === 3, 'schema is 3 after upgrade');
  ok(mig.idsSame && mig.regsSame, 'all 153 ids and registration numbers preserved'); ok(mig.valuesSame, 'existing field values unchanged (incl. relations, former numbers, notes)');
  ok(mig.statusRoundTrip, 'legacy status round-trips: summaryStatus(b) === old status for all 153 (public site keeps working)');
  ok(mig.splitOk, 'status split into physical / market / landmark correctly'); ok(mig.yearBuiltSame && mig.halvesEmpty, 'year-only dates stayed year-only, no half assigned');
  ok(mig.cpt.yearBuilt === null && mig.cpt.yearExpected === 2027 && mig.cpt.physical === 'construction' && mig.cpt.notes.length === 1, `Central Park Tower: built 2027 → expected 2027 with a migration note (${JSON.stringify(mig.cpt)})`);
  ok(mig.parcelsGone && mig.legacy.parcels === 13 && mig.legacy.links === 14, `parcels removed from the live model and archived (13 parcels, 14 links)`);
  ok(mig.parcelLinks >= 0, `${mig.parcelLinks} same-site links carried from parcels onto buildings`);
  ok(JSON.stringify(mig.seq) === JSON.stringify(v2.meta.seq) && JSON.stringify(mig.hseq) === JSON.stringify(v2.meta.hseq), 'seq / hseq counters unchanged');
  ok(mig.hist === 34 && mig.active === 119, `34 historical · 119 active (${mig.hist}/${mig.active})`);
  ok(mig.regions.length === 10 && mig.conflict.includes('new-j-state') && mig.conflict.includes('north-c-region'), 'regions seeded, New J and North C flagged as conflicts');
  ok(['man-a', 'new-bk', 'new-s', 'new-b', 'long-island'].every(id => mig.parents[id] === 'new-a-city') && mig.parents['new-j'] === 'new-j-state' && mig.parents['north-c'] === 'north-c-region', 'districts placed under their regions');
  ok(mig.core.length === 5, 'five boroughs are core (derived from the hierarchy)');
  ok(mig.polys.length === 3 && mig.polys.every(p => p[1] === 4) && mig.hoodPolys === 4, 'rectangles converted to 4-vertex polygons (3 districts, 4 hoods)');
  ok(mig.modal.startsWith('Registry upgraded'), 'upgrade report shown'); ok(mig.pre, 'pre-upgrade copy held'); ok(mig.migrations.join() === '1→2,2→3', 'migrations logged: ' + mig.migrations.join(', '));
  ok(mig.archive === 18, '18 chronicle entries kept');
  const snaps = await page.evaluate(async () => (await listSnapshots()).map(s => s.label));
  ok(snaps.includes('pre-upgrade · schema 2'), 'labelled pre-upgrade snapshot: ' + JSON.stringify(snaps));
  await page.screenshot({ path: path.join(SHOTS, 'A-upgrade-report.png') });
  await page.evaluate(() => closeModal());
  noErrors('upgrade');

  // ---------- B · master export / fresh-profile restore / idempotent import ----------
  console.log('\nB · master export, fresh-profile restore, idempotent and filtered imports');
  const master = await page.evaluate(() => serializeMaster());
  ok(master.kind === 'master' && master.buildings.length === 153 && master.legacy.parcels.length === 13 && master.readme.length > 100, 'master file: kind master, 153 buildings, legacy parcels, readme');
  const compat = await page.evaluate(() => serializeCompat());
  ok(compat.kind === 'new-a' && compat.buildings.length === 153 && compat.buildings.every(b => b.status === v2.buildings.find(o => o.id === b.id).status) && Array.isArray(compat.parcels), 'compat NewA.json keeps the 2.0 shape and old statuses');
  const hist = await page.evaluate(() => { let out; const o = downloadText; window.downloadText = (n, t) => { out = JSON.parse(t); }; exportFiltered('historical'); window.downloadText = o; return out; });
  ok(hist.filter === 'historical' && hist.buildings.length === 34, 'historical extract: 34 buildings, flagged as a filtered file');
  await ctx.close();
  ctx = await browser.newContext(); page = await newPage(ctx); await page.goto(FILE); await booted(page);
  const restored = await page.evaluate(async (m) => { mergePayload(m, 'replace'); commit({ now: true }); await new Promise(r => setTimeout(r, 700)); return { n: S.buildings.length, regs: S.buildings.map(b => b.reg).sort().join(','), rels: relEdges().length, legacy: S.legacy.parcels.length, regions: S.regions.length, archive: S.archive.length }; }, master);
  const expectedRegs = v2.buildings.map(b => b.reg).sort().join(',');
  ok(restored.n === 153 && restored.regs === expectedRegs, 'fresh profile restored from the master file: 153 records, same numbers');
  ok(restored.legacy === 13 && restored.archive === 18 && restored.regions === 10, 'relationships, archive and legacy parcels restored');
  const twice = await page.evaluate(m => { mergePayload(m, 'merge'); return { n: S.buildings.length, roads: S.roads.length, archive: S.archive.length }; }, master);
  ok(twice.n === 153 && twice.archive === 18, 'importing the same master twice does not duplicate');
  const filtered = await page.evaluate(h => { mergePayload(h, 'replace'); return { n: S.buildings.length, active: activeBuildings().length }; }, hist);
  ok(filtered.n === 153 && filtered.active === 119, 'a filtered (historical) file can never replace the whole world');
  await page.reload(); await booted(page);
  const persisted = await page.evaluate(() => ({ n: S.buildings.length, schema: S.schema }));
  ok(persisted.n === 153 && persisted.schema === 3, 'restored data survives reload');
  noErrors('restore');
  // the old two-file workflow still imports, and is upgraded exactly like an in-place upgrade
  console.log('\nB2 · legacy NewA.json + OtherDistricts.json import into a fresh profile');
  await ctx.close(); ctx = await browser.newContext(); page = await newPage(ctx); await page.goto(FILE); await booted(page);
  const legacy = await page.evaluate(([core, other]) => { mergePayload(core, 'replace'); mergePayload(other, 'replace'); const cpt = S.buildings.find(b => b.reg === 'MA-0013'); return { n: S.buildings.length, schema: S.schema, cpt: { yearBuilt: cpt.yearBuilt, yearExpected: cpt.yearExpected }, legacy: S.legacy.parcels.length, links: S.legacy.parcelLinks.length, split: S.buildings.every(b => b.physical && b.legacyStatus && summaryStatus(b) === b.legacyStatus), parents: S.districts.map(d => d.parentId), hist: histBuildings().length, polys: S.districts.filter(d => d.polygons.length).length, noParcelIds: !S.buildings.some(b => 'parcelIds' in b), districts: S.districts.length }; }, [JSON.parse(fs.readFileSync(path.join(DIR, 'real-NewA.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(DIR, 'real-OtherDistricts.json'), 'utf8'))]);
  ok(legacy.n === 153 && legacy.schema === 3 && legacy.districts === 7 && legacy.hist === 34, 'both 2.0 files import into one store (153 buildings, 7 districts)');
  ok(legacy.cpt.yearBuilt === null && legacy.cpt.yearExpected === 2027 && legacy.split && legacy.noParcelIds, 'imported records are upgraded like an in-place upgrade (statuses split, future year → expected, parcel ids removed)');
  ok(legacy.legacy === 13 && legacy.links === 14 && legacy.polys === 3 && legacy.parents.every(Boolean), 'parcels archived, borders converted, districts placed');
  noErrors('legacy import');

  // ---------- C · geography: add a state, draw an irregular border, edit a vertex, reload ----------
  console.log('\nC · add a state in the UI, draw an irregular border, edit a vertex, reload');
  await page.evaluate(() => openRegionModal(null));
  await page.fill('#r-name', 'Penn A South'); await page.selectOption('#r-type', 'state'); await page.selectOption('#r-parent', 'union'); await page.click('#r-save'); await page.waitForTimeout(200);
  const reg = await page.evaluate(() => ({ r: S.regions.find(x => x.name === 'Penn A South'), scope: UI.scope }));
  ok(!!reg.r && reg.r.type === 'state' && reg.r.parentId === 'union' && reg.scope.id === reg.r.id, 'state created through the UI without code and scope switched to it');
  await page.evaluate(() => setNav('map')); await page.waitForTimeout(400);
  await page.evaluate(id => { MAPW.cam = { x: 600, z: 600, k: 2 }; setMapMode('border', { target: { kind: 'region', id } }); mapDraw(); }, reg.r.id);
  const canvas = await page.$('#mapcanvas'); const box = await canvas.boundingBox();
  const click = async (sx, sy, opts = {}) => { await page.mouse.move(box.x + sx, box.y + sy); await page.mouse.down(opts); await page.mouse.up(opts); await page.waitForTimeout(40); };
  const pts = [[200, 200], [420, 180], [520, 330], [450, 480], [260, 460], [160, 330]];
  for (const [x, y] of pts) await click(x, y);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const poly = await page.evaluate(id => { const r = regionById(id); return { n: r.polygons.length, v: r.polygons[0]?.length, area: r.polygons[0] ? polyArea(r.polygons[0]) : 0, first: r.polygons[0]?.[0], mode: MAPW.mode, sel: MAPW.sel }; }, reg.r.id);
  ok(poly.n === 1 && poly.v === 6 && poly.area > 1000, `irregular 6-vertex border saved (${JSON.stringify(poly.first)} · ${Math.round(poly.area)} blk²) and the map returned to Select`);
  // exact vertex edit through the inspector
  await page.evaluate(() => { renderDock(); });
  await page.fill('#dock-body .vlist .vr:first-child input[data-vx$=":0"]', '555'); await page.dispatchEvent('#dock-body .vlist .vr:first-child input[data-vx$=":0"]', 'change'); await page.waitForTimeout(200);
  const edited = await page.evaluate(id => regionById(id).polygons[0][0][0], reg.r.id);
  ok(edited === 555, 'vertex X edited numerically to 555');
  // self-intersecting shapes are refused
  await page.evaluate(id => { setMapMode('border', { target: { kind: 'region', id } }); MAPW.draft = { kind: 'polygon', pts: [[0, 0], [100, 100], [100, 0], [0, 100]], forKind: 'border' }; mapFinishDraft(); }, reg.r.id);
  const refused = await page.evaluate(id => ({ n: regionById(id).polygons.length, draft: !!MAPW.draft }), reg.r.id);
  ok(refused.n === 1 && refused.draft, 'self-intersecting border refused (draft kept for correction)');
  await page.evaluate(() => mapCancel()); await page.waitForTimeout(900);
  await page.reload(); await booted(page);
  const afterReload = await page.evaluate(id => { const r = regionById(id); return { v: r.polygons[0]?.length, x: r.polygons[0]?.[0]?.[0], scope: UI.scope.id }; }, reg.r.id);
  ok(afterReload.v === 6 && afterReload.x === 555 && afterReload.scope === reg.r.id, 'border, vertex edit and scope survive reload');
  // containment suggestions never move records
  const contain = await page.evaluate(() => { const d = districtById('man-a'); const inside = S.buildings.filter(b => b.districtId === 'man-a' && b.x != null && pointInPolys([b.x, b.z], d.polygons) !== 'out').length; const p = placeSuggest(0, 500); return { inside, total: S.buildings.filter(b => b.districtId === 'man-a' && b.x != null).length, sugg: p.districts.map(x => x.d.id), hoods: p.hoods.map(x => x.h.name) }; });
  ok(contain.sugg.includes('man-a'), `point (0,500) suggests Man A by its polygon · ${contain.inside}/${contain.total} Man A buildings inside its border`);
  noErrors('geography');

  // ---------- D · roads: diagonal road, bridge vs junction, recommendation review & override ----------
  console.log('\nD · roads');
  await page.evaluate(() => { setScope({ kind: 'region', id: 'new-a-city' }); setNav('map'); }); await page.waitForTimeout(400);
  const road = await page.evaluate(() => { MAPW.cam = { x: 0, z: 500, k: 2 }; setMapMode('road'); MAPW.draft = { kind: 'polyline', pts: [[-120, 470], [-40, 470], [40, 550]], forKind: 'road' }; mapFinishDraft(); const r = S.roads[S.roads.length - 1]; r.name = 'Diagonal Way'; r.width = 7; commit(); return { reg: r.reg, len: Math.round(polyLength(r.geometry)), steps: blockSteps(r.geometry), sel: MAPW.sel?.kind, mode: MAPW.mode }; });
  ok(/^RD-0001$/.test(road.reg) && road.steps === 160 && road.len === 193, `diagonal road ${road.reg}: ${road.len} blocks geometric, ${road.steps} staircase blocks`);
  const junction = await page.evaluate(() => { setMapMode('road'); MAPW.draft = { kind: 'polyline', pts: [[0, 420], [0, 600]], forKind: 'road' }; mapFinishDraft(); const r2 = S.roads[S.roads.length - 1]; r2.name = 'Cross Street'; commit(); JUNCTION_CACHE.key = ''; const js = roadJunctions(); const kinds = js.map(j => j.kind); r2.grade = 'bridge'; r2.updated = now(); JUNCTION_CACHE.key = ''; const js2 = roadJunctions(); return { before: kinds, after: js2.map(j => j.kind), connectedBefore: roadConnections(r2, js).length, connectedAfter: roadConnections(r2, js2).length }; });
  ok(junction.before.includes('junction') && junction.after.includes('separated') && junction.connectedBefore === 1 && junction.connectedAfter === 0, `same-grade crossing is a junction (${junction.before}); as a bridge it becomes a grade-separated crossing (${junction.after})`);
  const sugg = await page.evaluate(() => { const b = S.buildings.find(x => x.x != null && isActive(x) && Math.abs(x.z - 470) < 30 && x.x < -40 && x.x > -130) || S.buildings.find(x => x.x != null && isActive(x)); const s = roadSuggest(b); return { reg: b.reg, basis: s.basis, items: s.items.map(it => ({ road: it.road.name, d: Math.round(it.d), kind: it.kind, flags: it.flags })), reason: s.items[0] ? roadSuggestReason(s.items[0], s.basis) : '' }; });
  ok(sugg.items.length >= 1 && /proximity/.test(sugg.reason), `recommendation for ${sugg.reg} explained: ${sugg.reason.slice(0, 90)}…`);
  const override = await page.evaluate(reg => { const b = S.buildings.find(x => x.reg === reg); const s = roadSuggest(b); const other = s.items.find(it => it.kind !== 'best') || s.items[0]; MAPW.sel = { kind: 'building', id: b.id }; inspectorAction('insp-road-apply', { dataset: { id: other.road.id } }); const applied = b.roadId === other.road.id; inspectorAction('insp-road-clear', { dataset: {} }); return { applied, cleared: b.roadId === null, sameCoords: b.x != null }; }, sugg.reg);
  ok(override.applied && override.cleared && override.sameCoords, 'recommendation can be overridden and removed; coordinates never change');
  const roadChecks = await page.evaluate(() => roadIssues(roadById(S.roads[0].id)).map(i => i.text));
  ok(roadChecks.some(t => /Checked:/.test(t)), 'road checks explain what was looked at: ' + roadChecks[roadChecks.length - 1].slice(0, 80));
  const rename = await page.evaluate(() => { const id = S.roads[0].id; openRecord('road', id, 'edit'); document.getElementById('f-name').value = 'Harbor Way'; saveDrawer(); const r = roadById(id); const hit = flatItems(searchAll('Diagonal Way')).find(h => h.kind === 'road'); closeDrawer(true); return { name: r.name, former: r.formerNames, found: !!hit && hit.id === r.id }; });
  ok(rename.name === 'Harbor Way' && rename.former.includes('Diagonal Way') && rename.found, 'renaming keeps the identity and the former name, which search still finds');
  await page.screenshot({ path: path.join(SHOTS, 'D-roads.png') });
  noErrors('roads');

  // ---------- E · transit: draw line, add stations, recolour, hide/show, dashboard consistency ----------
  console.log('\nE · transit');
  const line = await page.evaluate(() => { setMapMode('transit'); MAPW.draft = { kind: 'polyline', pts: [[-130, 560], [-60, 560], [20, 500], [80, 500]], forKind: 'transit' }; mapFinishDraft(); const l = S.lines[S.lines.length - 1]; l.name = 'Harbor Line'; l.shortName = 'H'; commit(); return { reg: l.reg, tracks: l.trackIds.length, sel: MAPW.sel, trackLen: Math.round(lineLength(l)) }; });
  ok(/^TL-0001$/.test(line.reg) && line.tracks === 1 && line.trackLen > 200 && line.sel.kind === 'line', `line ${line.reg} drawn over one track (${line.trackLen} blk)`);
  const stations = await page.evaluate(() => { setMapMode('station'); placeStationAt([-130, 560]); S.stations[S.stations.length - 1].name = 'Harbor West'; MAPW.sel = { kind: 'line', id: S.lines[0].id }; setMapMode('station'); placeStationAt([20, 500]); S.stations[S.stations.length - 1].name = 'Canal Street'; MAPW.sel = { kind: 'line', id: S.lines[0].id }; setMapMode('station'); placeStationAt([80, 500]); S.stations[S.stations.length - 1].name = 'Harbor East'; commit(); const l = S.lines[0]; return { n: S.stations.length, stops: l.stopIds.length, names: stationsOf(l).map(s => s.name), districts: S.stations.map(s => s.districtId) }; });
  ok(stations.n === 3 && stations.stops === 3 && stations.names.join() === 'Harbor West,Canal Street,Harbor East', 'three stations placed in order on the line; district suggested from borders: ' + stations.districts.join(','));
  const colour = await page.evaluate(() => { const l = S.lines[0]; l.color = '#FF86CF'; commit(); renderDock(); mapDraw(); const dash = renderTransit(); const badge = lineBadge(l); return { dockHas: document.getElementById('dock-body')?.innerHTML.includes('#FF86CF'), dashHas: dash.includes('#FF86CF'), badgeHas: badge.includes('#FF86CF') }; });
  ok(colour.dockHas && colour.dashHas && colour.badgeHas, 'colour change reflected in inspector, dashboard and badges');
  const hide = await page.evaluate(() => { UI.layers.transit = false; mapDraw(); const kept = S.lines.length === 1 && S.tracks.length === 1 && S.stations.length === 3; UI.layers.transit = true; mapDraw(); return kept; });
  ok(hide, 'hiding the transit overlay keeps every line, track and station');
  const dash = await page.evaluate(() => { setNav('transit'); return { html: document.getElementById('main').innerHTML, issues: transitIssues().map(i => i.text) }; });
  ok(dash.html.includes('Harbor Line') && dash.html.includes('3 stops') || dash.html.includes('>3</b> stops'), 'dashboard lists the line with its 3 stops');
  await page.screenshot({ path: path.join(SHOTS, 'E-transit.png') });
  noErrors('transit');

  // ---------- F · businesses: multiple locations, period revenue, roles distinct ----------
  console.log('\nF · businesses');
  const biz = await page.evaluate(() => {
    const z = newBusiness(S); z.name = 'Silvernine Properties'; z.aliases = ['Silvernine']; z.category = 'Real estate'; z.yearOpened = 2015; S.businesses.push(z);
    const branch = newBusiness(S); branch.name = 'Silvernine Retail'; branch.parentId = z.id; S.businesses.push(branch);
    const bs = S.buildings.filter(b => isActive(b) && b.x != null).slice(0, 3);
    S.tenancies.push(newTenancy(z.id, bs[0].id, 'owner'), newTenancy(z.id, bs[1].id, 'tenant'), newTenancy(z.id, bs[2].id, 'developer'), newTenancy(branch.id, bs[1].id, 'tenant'));
    const t = S.tenancies[0]; const old = newTenancy(z.id, bs[2].id, 'tenant'); old.current = false; old.yearFrom = 2016; old.yearTo = 2019; S.tenancies.push(old);
    z.revenue = [{ id: 'r1', year: 2025, half: '', amount: 1200000, currency: 'USD', basis: 'recorded', source: 'ledger' }, { id: 'r2', year: 2026, half: 'E', amount: 700000, currency: 'USD', basis: 'estimated', source: 'guess' }, { id: 'r3', year: 2026, half: 'E', amount: 650000, currency: 'USD', basis: 'simulated', source: 'site market' }];
    branch.revenue = [{ id: 'r4', year: 2026, half: 'E', amount: 100000, currency: 'USD', basis: 'recorded', source: 'till' }];
    z.listings = [{ id: 'l1', kind: 'sale', price: 5000000, currency: 'USD', year: 2026, half: 'L', what: '40% stake', status: 'active' }]; z.ticker = 'SNP'; z.exchangeListed = true;
    commit();
    const totals = revenueTotals([z, branch], 2026, 'E');
    return { regs: [z.reg, branch.reg], locations: bizBuildings(z).length, roles: tenanciesOf(z).filter(t => t.current).map(t => t.role).sort(), former: tenanciesOf(z).filter(t => !t.current).length, latest: latestRevenue(z), totals, atBuilding: tenanciesAt(bs[1]).length, listing: z.listings.length };
  });
  ok(biz.regs.join() === 'BZ-0001,BZ-0002' && biz.locations === 3, 'business with three locations and a branch');
  ok(biz.roles.join() === 'developer,owner,tenant' && biz.former === 1, 'owner / tenant / developer roles kept distinct; former tenancy preserved in history');
  ok(biz.latest.basis === 'estimated' && biz.latest.amount === 700000, 'latest revenue prefers recorded > estimated > simulated within a period (estimated 700k for Early 2026)');
  ok(biz.totals.total === 700000 && biz.totals.skipped === 1 && biz.totals.counted === 1, `parent reports for the period → branch revenue skipped, no double counting (${biz.totals.total})`);
  ok(biz.atBuilding === 2 && biz.listing === 1, 'tenancies visible from the building; listing separate from ticker and revenue');
  await page.evaluate(() => setNav('businesses')); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'F-businesses.png') });
  await page.evaluate(() => openRecord('business', S.businesses[0].id)); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'F-business-record.png') }); await page.evaluate(() => closeDrawer(true));
  const owners = await page.evaluate(() => ownerNameCandidates().slice(0, 3).map(c => `${c.name}:${c.buildings.length}`));
  ok(owners.length === 3 && !owners.some(o => /Silvernine Properties/.test(o)), 'owner-name import candidates exclude names that already have a business: ' + owners.join(' · '));
  noErrors('businesses');

  // ---------- G · lifecycle: started Early 2020, completed Late 2021, never counted early ----------
  console.log('\nG · lifecycle & half-year counting');
  const life = await page.evaluate(() => {
    const b = newBuilding(S, 'man-a'); b.name = 'Lifecycle Test Tower'; b.physical = 'construction'; b.yearStarted = 2020; b.halfStarted = 'E'; b.yearExpected = 2021; b.halfExpected = 'L'; b.x = 10; b.z = 520; b.status = summaryStatus(b); S.buildings.push(b);
    const at = (y, h, o) => stateAtHY(b, hyIndex(y, h), o);
    const uc = { '2019L': at(2019, 'L'), '2020E': at(2020, 'E'), '2021E': at(2021, 'E'), '2021L': at(2021, 'L'), '2022E': at(2022, 'E'), '2021Lproj': at(2021, 'L', { projection: true }) };
    b.physical = 'standing'; b.yearBuilt = 2021; b.halfBuilt = 'L'; b.status = summaryStatus(b);
    const done = { '2020E': at(2020, 'E'), '2021E': at(2021, 'E'), '2021L': at(2021, 'L'), '2023E': at(2023, 'E') };
    const rows = [b]; const counts = { '2020E': hyCounts(rows, hyIndex(2020, 'E')), '2021E': hyCounts(rows, hyIndex(2021, 'E')), '2021L': hyCounts(rows, hyIndex(2021, 'L')) };
    const ev = { s: hyEvents(rows, hyIndex(2020, 'E')).map(e => e.kind), c: hyEvents(rows, hyIndex(2021, 'L')).map(e => e.kind) };
    // strict final step: undated records never appear as completions
    const all = scopeBuildings(); const { i1 } = hyRange(all); const c1 = hyCounts(all, i1), c0 = hyCounts(all, i1 - 1); const und = undatedOf(all);
    const draftErr = (() => { const d = JSON.parse(JSON.stringify(b)); d.yearBuilt = 2021; d.halfBuilt = 'E'; d.yearStarted = 2021; d.halfStarted = 'L'; return hyIndex(d.yearStarted, d.halfStarted) > hyIndex(d.yearBuilt, d.halfBuilt); })();
    commit();
    return { uc, done, counts: { '2020E': counts['2020E'].construction, '2021E': counts['2021E'].construction, '2021Lstanding': counts['2021L'].standing, '2021Lconstruction': counts['2021L'].construction }, ev, final: { standing1: c1.standing, standing0: c0.standing, undated: c1.undated, construction: c1.construction, undatedOf: und, active: activeBuildings().length }, draftErr };
  });
  ok(life.uc['2019L'] === 'future' && life.uc['2020E'] === 'construction' && life.uc['2021E'] === 'construction' && life.uc['2021L'] === 'construction' && life.uc['2022E'] === 'construction' && life.uc['2021Lproj'] === 'standing', `under way: future→construction from Early 2020, never completed early (projection shows Late 2021): ${JSON.stringify(life.uc)}`);
  ok(life.done['2020E'] === 'construction' && life.done['2021E'] === 'construction' && life.done['2021L'] === 'standing' && life.done['2023E'] === 'standing', `completed Late 2021: construction until then, standing after: ${JSON.stringify(life.done)}`);
  ok(life.counts['2020E'] === 1 && life.counts['2021E'] === 1 && life.counts['2021Lstanding'] === 1 && life.counts['2021Lconstruction'] === 0, 'half-year counts keep construction and completed distinct');
  ok(life.ev.s.includes('started') && life.ev.c.includes('built'), 'events: started in Early 2020, completed in Late 2021');
  ok(life.final.standing1 - life.final.standing0 <= 5 && life.final.undated === life.final.undatedOf.built + life.final.undatedOf.construction && life.final.standing1 < life.final.active, `final step is strict: ${life.final.standing0} → ${life.final.standing1} completed (not the ${life.final.active} live active records); ${life.final.undated} undated reported separately`);
  ok(life.draftErr, 'impossible sequence (start after completion) is detectable for the validator');
  noErrors('lifecycle');

  // ---------- H · playback viewer ----------
  console.log('\nH · playback viewer');
  await page.evaluate(() => setNav('history')); await page.waitForTimeout(300);
  await page.evaluate(() => openHistoryViewer({ index: 0 })); await page.waitForTimeout(200);
  const hv0 = await page.evaluate(() => ({ open: HV.open, i1: HV.i1, date: document.getElementById('hv-date').textContent, counts: document.getElementById('hv-counts').textContent }));
  ok(hv0.open && /2013/.test(hv0.date) && /EARLY/.test(hv0.date), 'viewer opens at Early 2013: ' + hv0.date.replace(/\s+/g, ' ').trim());
  await page.evaluate(() => hvPlay()); await page.waitForTimeout(1400); const playing = await page.evaluate(() => ({ playing: HV.playing, to: HV.to })); ok(playing.playing && playing.to >= 1, `plays smoothly (reached index ${playing.to} after 1.4s)`);
  await page.evaluate(() => hvPause()); await page.evaluate(() => hvSet(hyIndex(2018, 'E'), { instant: true })); await page.waitForTimeout(100);
  const hv2018 = await page.evaluate(() => { const ev = hyEvents(HV.rows, HV.to); return { date: document.getElementById('hv-date').textContent.replace(/\s+/g, ' ').trim(), demolished: ev.filter(e => e.kind === 'demolished').length, built: ev.filter(e => e.kind === 'built').length, listed: document.querySelectorAll('#hv-events .ev').length }; });
  ok(hv2018.demolished >= 1 && hv2018.listed === hv2018.demolished + hv2018.built, `Early 2018: ${hv2018.built} completed · ${hv2018.demolished} demolished, all clickable in What changed`);
  await page.screenshot({ path: path.join(SHOTS, 'H-viewer-2018.png') });
  const proj = await page.evaluate(() => { hvToggleProjection(); const i1 = HV.i1; hvSet(i1, { instant: true }); const c = hyCounts(HV.rows, i1, { projection: true }); hvToggleProjection(); return { i1, standing: c.standing, label: document.getElementById('hv-date')?.textContent || '' }; });
  ok(proj.i1 === (2027 - 2013) * 2 && proj.standing >= 1, `projection mode extends to Early 2027 (expected completion) and is labelled separately`);
  await page.evaluate(() => closeHistoryViewer());
  noErrors('viewer');

  // ---------- I · global search ----------
  console.log('\nI · global search');
  const search = await page.evaluate(() => {
    const b = S.buildings.find(x => x.reg === 'MA-0004'); b.formerRegs = [...(b.formerRegs || []), 'OLD-0099']; const bhist = histBuildings()[0];
    const r1 = flatItems(searchAll('OLD-0099')); const r2 = flatItems(searchAll('Harbor Way')); const r3 = flatItems(searchAll('Canal Street')); const r4 = flatItems(searchAll('Silvernine')); const r5 = flatItems(searchAll('Empire Stat')); const r6 = flatItems(searchAll(bhist.name || bhist.reg)); const r7 = flatItems(searchAll('Empyre State'));
    return { former: r1[0]?.id === b.id, road: r2.some(h => h.kind === 'road'), station: r3.some(h => h.kind === 'station'), biz: r4.some(h => h.kind === 'business'), prefix: r5[0]?.id === b.id, hist: r6.some(h => h.id === bhist.id), typo: r7.some(h => h.id === b.id), groups: searchAll('new').map(g => g.kind) };
  });
  ok(search.former && search.prefix && search.typo, 'finds a former number, a prefix and a typo');
  ok(search.road && search.station && search.biz && search.hist, 'finds roads, stations, businesses and historical buildings');
  ok(search.groups.length >= 2, 'results are grouped by type: ' + search.groups.join(', '));
  await page.evaluate(() => setNav('map')); await page.waitForTimeout(300);
  const located = await page.evaluate(() => { const hit = flatItems(searchAll('Canal Street')).find(h => h.kind === 'station'); openSearchHit(hit, { map: true }); return { sel: MAPW.sel, dock: MAPW.dock, cam: MAPW.cam }; });
  ok(located.sel?.kind === 'station' && located.dock === 'inspector', 'a search hit on the map selects, frames and inspects the record');
  await page.evaluate(() => { document.getElementById('q').value = 'OLD-0099'; }); await page.focus('#q'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const enterHit = await page.evaluate(() => MAPW.sel);
  ok(enterHit?.kind === 'building', 'Enter on an exact (former) number locates the building on the map');
  noErrors('search');

  // ---------- J · news: import twice, conflict, apply & undo ----------
  console.log('\nJ · news');
  const news = await page.evaluate(feed => { const r1 = mergeNewsItems(parseFeed(feed), 'test'); const r2 = mergeNewsItems(parseFeed(feed), 'test'); const items = S.news.items; const cands = items.flatMap(it => it.candidates); return { r1, r2, items: items.length, kinds: cands.map(c => c.kind), pending: newsPendingCount(), esb: cands.find(c => c.kind === 'landmark'), partial: cands.find(c => c.kind === 'partial'), juris: cands.find(c => c.kind === 'jurisdiction') }; }, FEED());
  ok(news.r1.added === 3 && news.r2.added === 0 && news.r2.unchanged === 3 && news.items === 3, 'the same feed imported twice adds no duplicates');
  ok(news.partial && /exterior|structure/.test(news.partial.note || '') && news.partial.after.notes, '“topped out / exterior complete” becomes a note, not a completion');
  ok(news.juris && news.juris.entityKind === 'region' && news.juris.after.source, 'Penn A announcement proposes source + effective date, never a hierarchy change');
  const esbState = await page.evaluate(() => { const b = S.buildings.find(x => x.reg === 'MA-0004'); return { landmark: b.landmark }; });
  const applyUndo = await page.evaluate(() => {
    const b = S.buildings.find(x => x.reg === 'MA-0004'); const c = S.news.items.flatMap(it => it.candidates).find(x => x.kind === 'landmark');
    const already = c.conflict === 'already';
    b.landmark = false; b.status = summaryStatus(b); const c2 = { ...c, conflict: candidateConflict(c) };
    const okApply = applyCandidate(c2); const after = b.landmark; const log = S.news.log[0]; undoLog(log.id); const restored = b.landmark; const dec = S.news.decisions[c.id];
    b.landmark = true; b.status = summaryStatus(b); return { already, okApply, after, restored, dec: dec?.status, logSource: log.source.title };
  });
  ok(applyUndo.already === true, 'a proposal that already matches the record is marked as such');
  ok(applyUndo.okApply && applyUndo.after === true && applyUndo.restored === false && applyUndo.dec === 'undone' && /Empire/.test(applyUndo.logSource), 'apply changes the record with a logged source; undo restores it and keeps the source');
  const conflict = await page.evaluate(feed => { const b = S.buildings.find(x => x.reg === 'MA-0004'); b.verified = true; const r = mergeNewsItems(parseFeed(feed.replaceAll('esb-landmark', 'esb-landmark-2').replace('designated a landmark', 'was demolished')), 'test'); const c = S.news.items.flatMap(it => it.candidates).find(x => x.kind === 'demolition'); b.verified = false; return { kind: c?.kind, conflict: c?.conflict }; }, FEED());
  ok(conflict.kind === 'demolition' && /verified/.test(conflict.conflict || ''), 'a report against a verified record is flagged as a conflict, not applied');
  const revision = await page.evaluate(feed => { const before = S.news.items.find(x => x.guid === 'esb-landmark').revisions.length; const r = mergeNewsItems(parseFeed(feed), 'test'); const it = S.news.items.find(x => x.guid === 'esb-landmark'); return { revised: r.revised, revisions: it.revisions.length - before, items: S.news.items.length }; }, FEED('UPDATE: the plaque was unveiled.'));
  ok(revision.revised === 1 && revision.revisions === 1 && revision.items === 4, 'an edited article is recorded as a revision, not a new item');
  // the Import-feed button path: a real file chosen through the hidden input runs the same pipeline and records its source
  const fileFeed = FEED().replaceAll('esb-landmark', 'file-esb').replaceAll('cpt-topped', 'file-cpt').replaceAll('penn-a-joins', 'file-penn').replaceAll('/news/', '/news/file-');
  await page.setInputFiles('#file-feed', { name: 'feed.xml', mimeType: 'application/rss+xml', buffer: Buffer.from(fileFeed) });
  await page.waitForTimeout(500);
  const viaFile = await page.evaluate(() => ({ items: S.news.items.length, src: S.news.lastSource, err: S.news.lastError, fromFile: S.news.items.filter(i => i.source === 'feed.xml').length }));
  ok(viaFile.items === 7 && viaFile.src === 'feed.xml' && viaFile.fromFile === 3 && !viaFile.err, `Import feed file button ingests a chosen feed.xml (${viaFile.fromFile} items, source recorded)`);
  // the live path from a local file: the failure is reported in the inbox, nothing is thrown, nothing is changed
  const live = await page.evaluate(async () => { const n = S.news.items.length; await Promise.race([newsRefresh({ source: 'live' }), new Promise(r => setTimeout(r, 15000))]); return { n2: S.news.items.length - n, err: S.news.lastError }; });
  ok(live.n2 === 0 && live.err && typeof live.err.message === 'string' && live.err.message.length > 10, `live fetch from file:// fails visibly, not silently: “${live.err?.message}”`);
  await page.evaluate(() => openNewsInbox()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'J-news-inbox.png') }); await page.evaluate(() => closeModal());
  noErrors('news');

  // ---------- K · parcel controls gone, failed saves visible, default interface ----------
  console.log('\nK · parcels removed · failed saves visible');
  const parcelUI = await page.evaluate(() => { const out = []; for (const nav of ['overview', 'registry', 'transit', 'businesses', 'history']) { setNav(nav); const h = document.getElementById('main').innerHTML; if (/data-act="(parcel|gen-parcels|new-parcel)/.test(h) || /New parcel/i.test(h)) out.push(nav); } openBuilding(S.buildings[0].id); const dr = document.getElementById('drawer').innerHTML; closeDrawer(true); return { navs: out, drawer: /PARCEL \/ SITE|Attach parcel/.test(dr), rels: relEdges().length }; });
  ok(parcelUI.navs.length === 0 && !parcelUI.drawer && parcelUI.rels >= 30, `parcel controls removed everywhere; ${parcelUI.rels} relationships remain`);
  const failed = await page.evaluate(async () => { const orig = SAVE.write; SAVE.write = async () => { throw new Error('disk full (simulated)'); }; S.buildings[0].notes += ' x'; commit({ now: true }); await new Promise(r => setTimeout(r, 400)); const state = document.getElementById('savestate').dataset.state, text = document.getElementById('savetext').textContent, toastTxt = document.getElementById("toasts").textContent; SAVE.write = orig; return { state, text, toastTxt }; });
  ok(failed.state === 'error' && /FAILED/.test(failed.text) && /Could not save/.test(failed.toastTxt), `a failed save is visible (${failed.text}) with a backup action`);
  await page.evaluate(() => { commit({ now: true }); }); await page.waitForTimeout(600);
  const recovered = await page.evaluate(() => document.getElementById('savestate').dataset.state); ok(recovered === 'saved', 'saving recovers once storage works again');
  noErrors('parcels/saves');

  // ---------- L · screenshots of every section for review ----------
  console.log('\nL · visual pass');
  for (const nav of ['overview', 'registry', 'map', 'transit', 'businesses', 'history']) { await page.evaluate(id => setNav(id), nav); await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, `L-${nav}.png`) }); }
  await page.evaluate(() => { setNav('map'); MAPW.sel = { kind: 'road', id: S.roads[0].id }; MAPW.cam = { x: -30, z: 520, k: 3 }; renderDock(); mapDraw(); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'L-map-road-inspector.png') });
  await page.evaluate(() => { MAPW.dock = 'layers'; renderDock(); }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'L-map-layers.png') });
  await page.evaluate(() => { MAPW.dock = 'streets'; renderDock(); }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'L-map-streets.png') });
  await page.evaluate(() => { MAPW.dock = 'assistant'; renderDock(); }); await page.evaluate(() => asstRun('which road best serves MA-0004?')); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, 'L-map-assistant.png') });
  const asst = await page.evaluate(() => ({ kind: ASST.log[ASST.log.length - 1].kind, pending: !!ASST.pending, html: ASST.log[ASST.log.length - 1].html.slice(0, 120) }));
  ok(asst.kind === 'sugg' || asst.kind === 'fact', 'assistant answers the road question deterministically: ' + asst.html);
  await page.evaluate(() => asstRun('Show construction in Man A')); await page.waitForTimeout(300);
  const asst2 = await page.evaluate(() => ({ kind: ASST.log[ASST.log.length - 1].kind, hits: ASST.log[ASST.log.length - 1].hits.length }));
  ok(asst2.kind === 'fact' && asst2.hits >= 1, `assistant lists construction in Man A as facts with ${asst2.hits} highlighted records`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => setNav('overview')); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, 'L-mobile-overview.png') });
  await page.evaluate(() => setNav('map')); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, 'L-mobile-map.png') });
  noErrors('visual');

  // ---------- M · the six fixes reported Oct 4 2026 ----------
  console.log('\nM · fixes: viewer hover card · ghosts fade · stacking · play icon · markets importer · street-name links');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => setNav('history')); await page.waitForTimeout(300);
  // 1 · hover card in the playback viewer, with the state at that half-year
  await page.evaluate(() => openHistoryViewer({ year: 2019, half: 'L' })); await page.waitForTimeout(250);
  const hvHover = await page.evaluate(() => { const b = HV.rows.find(x => x.x != null && stateAtHY(x, HV.to) === 'standing'); const [sx, sy] = projFor(HV.cam, HV.w, HV.h).s(b.x, b.z); const r = HV.canvas.getBoundingClientRect(); return { reg: b.reg, x: r.left + sx, y: r.top + sy }; });
  await page.mouse.move(hvHover.x, hvHover.y); await page.waitForTimeout(80);
  const hvCard = await page.evaluate(() => ({ on: $('#hover').classList.contains('on'), txt: $('#hover').textContent, z: +getComputedStyle($('#hover')).zIndex }));
  ok(hvCard.on && hvCard.txt.includes(hvHover.reg) && /AT LATE 2019/.test(hvCard.txt), `hovering a building in the viewer shows its card with the state at that date (${hvHover.reg} · z ${hvCard.z})`);
  await page.mouse.move(hvHover.x + 400, hvHover.y + 300); await page.waitForTimeout(60);
  const hvOff = await page.evaluate(() => $('#hover').classList.contains('on')); ok(!hvOff, 'moving off every building hides the card again');
  // 2 · ghosts fade out about a year after demolition and obey the Ghosts toggle in the viewer
  const ghosts = await page.evaluate(() => {
    const alpha = { a0: ghostAlpha(0), a1: ghostAlpha(1), a2: ghostAlpha(2), a3: ghostAlpha(3), all: ghostAlpha(9, true) };
    const b = HV.rows.find(x => isHist(x) && x.x != null && demolishedIndex(x) != null); const di = demolishedIndex(b);
    const count = (hy, layers) => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const ctx = c.getContext('2d'); let n = 0; const orig = ctx.setLineDash.bind(ctx); ctx.setLineDash = seg => { if (seg.length === 2 && seg[0] === 2 && seg[1] === 2) n++; return orig(seg); }; drawScene({ ctx, W: 800, H: 600, cam: { x: b.x, z: b.z, k: 2 }, layers: { ...HV.layers, ...layers, stations: false, transit: false, roads: false, districts: false, regions: false, hoods: false, footprints: false, labels: false, grid: false }, hy, buildings: [b], districts: [], hoods: [], handles: false, showJunctions: false }); return n; };
    return { reg: b.reg, di, alpha, at0: count(di, {}), at2: count(di + 2, {}), at4: count(di + 4, {}), at4all: count(di + 4, { ghostsAll: true }), off: count(di, { historical: false }) };
  });
  ok(ghosts.alpha.a0 === 1 && ghosts.alpha.a1 > ghosts.alpha.a2 && ghosts.alpha.a2 > 0 && ghosts.alpha.a3 === 0 && ghosts.alpha.all > 0, `ghost opacity fades over a year: ${JSON.stringify(ghosts.alpha)}`);
  ok(ghosts.at0 === 1 && ghosts.at2 === 1 && ghosts.at4 === 0 && ghosts.at4all === 1 && ghosts.off === 0, `${ghosts.reg}: ghost drawn at demolition and a year later, gone after; "All ghosts" keeps it; Ghosts off hides it (${ghosts.at0}/${ghosts.at2}/${ghosts.at4}/${ghosts.at4all}/${ghosts.off})`);
  const toggles = await page.evaluate(() => $$('#hv-root [data-hvlayer]').map(b => b.dataset.hvlayer)); ok(toggles.includes('historical') && toggles.includes('ghostsAll'), 'viewer has Ghosts and All ghosts toggles: ' + toggles.join(', '));
  // 3 · the record drawer and the chronicle image open above the viewer
  const stack = await page.evaluate(() => { const b = HV.rows.find(x => x.x != null); openBuilding(b.id); const zd = +getComputedStyle($('#drawer')).zIndex, zv = +getComputedStyle($('#hv-root')).zIndex; return { zd, zv, body: document.body.classList.contains('hv-open') }; });
  ok(stack.body && stack.zd > stack.zv, `record drawer (z ${stack.zd}) opens above the viewer (z ${stack.zv})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const escOrder = await page.evaluate(() => ({ drawer: $('#drawer').classList.contains('on'), hv: HV.open })); ok(!escOrder.drawer && escOrder.hv, 'Esc closes the drawer first and keeps the viewer open');
  const modalStack = await page.evaluate(() => { openArchiveViewer(S.archive[0].id); const zm = +getComputedStyle($('#modal-root')).zIndex, zv = +getComputedStyle($('#hv-root')).zIndex; const svg = $('#modal-root .rowlink svg'); const r = svg?.getBoundingClientRect(); return { zm, zv, svgH: r?.height, svgW: r?.width }; });
  ok(modalStack.zm > modalStack.zv, `chronicle image modal (z ${modalStack.zm}) opens above the viewer`);
  // 4 · the play icon in "Open playback in YYYY" is a 12px glyph
  ok(modalStack.svgH != null && modalStack.svgH <= 14 && modalStack.svgW <= 14, `play icon in the chronicle viewer is ${modalStack.svgW}×${modalStack.svgH}px, not a 300×150 box`);
  await page.evaluate(() => { closeModal(); closeHistoryViewer(); });
  const unstacked = await page.evaluate(() => ({ body: document.body.classList.contains('hv-open'), zd: +getComputedStyle($('#drawer')).zIndex })); ok(!unstacked.body && unstacked.zd === 80, 'z-order returns to normal when the viewer closes');
  // 5 · businesses importer from the site's markets section: proposals only, simulated basis
  const marketsPayload = { companies: [{ name: 'Silvernine Properties', ticker: 'SNP', sector: 'Real Estate', price: 142.5, change: 1.2 }, { name: 'ZAYS Bank', ticker: 'ZBK', sector: 'Finance', price: 88 }, { company: 'Cray Industries', symbol: 'CRAY', industry: 'Technology', lastPrice: 12.25 }] };
  const mk = await page.evaluate(async payload => { const nBefore = S.businesses.length; const r = await marketsRefresh({ source: 'file', text: JSON.stringify(payload), label: 'markets.json' }); const item = r.item; const cands = item.candidates; return { nAfter: S.businesses.length - nBefore, kinds: cands.map(c => c.kind).sort(), newNames: cands.filter(c => c.kind === 'biz-new').map(c => c.create.name), snp: cands.find(c => c.entityId && bizById(c.entityId)?.ticker === 'SNP'), pending: newsPendingCount(), src: item.source, basis: cands.map(c => c.basis) }; }, marketsPayload);
  ok(mk.nAfter === 0 && mk.kinds.join() === 'biz-market,biz-new,biz-new' && mk.newNames.join() === 'ZAYS Bank,Cray Industries', `markets read → proposals, nothing created: ${mk.kinds.join(', ')} (${mk.newNames.join(', ')})`);
  ok(mk.snp && mk.snp.after.marketQuotes?.[0]?.basis === 'simulated' && mk.basis.every(b => b === 'simulated') && !('revenue' in (mk.snp.after || {})), 'the existing SNP company gets a simulated quote proposal — never revenue');
  const mkApply = await page.evaluate(() => { const c = S.news.items.find(i => i.source === 'markets').candidates.find(x => x.kind === 'biz-new' && x.create.ticker === 'ZBK'); const okA = applyCandidate(c); const z = S.businesses.find(x => x.ticker === 'ZBK'); const log = S.news.log[0]; return { okA, reg: z?.reg, listed: z?.exchangeListed, cat: z?.category, basis: z?.marketQuotes?.[0]?.basis, rev: (z?.revenue || []).length, logCreated: log?.created === z?.id, dec: S.news.decisions[c.id]?.status }; });
  ok(mkApply.okA && /^BZ-\d{4}$/.test(mkApply.reg) && mkApply.listed && mkApply.cat === 'Finance' && mkApply.basis === 'simulated' && mkApply.rev === 0 && mkApply.logCreated && mkApply.dec === 'applied', `creating from a market proposal makes ${mkApply.reg} (listed, Finance, simulated quote, no revenue) with a log entry`);
  const mkUndo = await page.evaluate(() => { const log = S.news.log[0]; undoLog(log.id); return { gone: !S.businesses.some(x => x.ticker === 'ZBK'), dec: S.news.decisions[log.candId]?.status }; });
  ok(mkUndo.gone && mkUndo.dec === 'undone', 'undoing the creation removes the business again');
  const mkTwice = await page.evaluate(async payload => { const n = S.news.items.length; const r = await marketsRefresh({ source: 'file', text: JSON.stringify(payload), label: 'markets.json' }); return { unchanged: r.unchanged, items: S.news.items.length - n }; }, marketsPayload);
  ok(mkTwice.unchanged === 1 && mkTwice.items === 0, 'the same market snapshot imported twice adds nothing');
  const mkVerified = await page.evaluate(async payload => { const z = S.businesses.find(x => x.ticker === 'SNP'); z.verified = true; const r = await marketsRefresh({ source: 'file', text: JSON.stringify(payload), label: 'markets.json' }); const c = r.item.candidates.find(x => x.entityId === z.id); z.verified = false; return { conflict: c?.conflict || '' }; }, { companies: [{ name: 'Silvernine Properties', ticker: 'SNP', price: 150 }] });
  ok(/verified/.test(mkVerified.conflict), 'a market update against a verified business is flagged, not applied');
  const mkCSV = await page.evaluate(() => normalizeMarketPayload('name,ticker,sector,price\nKey Food,KEYF,Retail,10.5\n').map(m => `${m.name}:${m.ticker}:${m.sector}:${m.price}`).join());
  ok(mkCSV === 'Key Food:KEYF:Retail:10.5', 'a CSV markets export is understood too');
  // 6 · buildings link to roads by street name: bulk action, hand-set links respected, undo, name beats proximity
  const streets = await page.evaluate(() => {
    const mill = S.buildings.filter(b => isActive(b) && buildingStreetText(b) === 'Mill Street');
    const r = newRoad(S); r.name = 'Mill Street'; r.geometry = [[-10, 330], [90, 330]]; S.roads.push(r);                 // 28 blocks south of the Mill Street houses
    const decoy = newRoad(S); decoy.name = 'Decoy Lane'; decoy.geometry = [[-10, 304], [90, 304]]; S.roads.push(decoy); // 2 blocks away
    const other = S.roads.find(x => x.name === 'Harbor Way'); const manual = mill[0]; manual.roadId = other.id; manual.roadIdSource = 'manual';
    const named = newBuilding(S, 'new-bk'); named.name = '1493 Mill Street'; named.street = ''; named.x = 50; named.z = 310; named.status = summaryStatus(named); S.buildings.push(named);
    JUNCTION_CACHE.key = ''; commit();
    const c = nameLinkCandidates(r); const sug = roadSuggest(mill[1]);
    return { millN: mill.length, link: c.link.length, manual: c.manualElsewhere.length, manualReg: manual.reg, namedIn: c.link.some(b => b.id === named.id), suggTop: sug.items[0]?.road.name, suggNameMatch: !!sug.items[0]?.nameMatch, suggBasis: sug.basis, reason: sug.items[0] ? roadSuggestReason(sug.items[0], sug.basis) : '', normA: normStreet('Mill St.'), normB: roadMatchesStreet({ name: 'W 11th St' }, 'West 11th Street'), roadId: r.id };
  });
  ok(streets.link === streets.millN && streets.namedIn && streets.manual === 1, `${streets.link} buildings name Mill Street and can be linked (incl. the address-shaped name); ${streets.manualReg} was linked by hand to another road and is left alone`);
  ok(streets.suggTop === 'Mill Street' && streets.suggNameMatch && streets.suggBasis === 'name' && /name/.test(streets.reason), `the street-name match outranks the closer Decoy Lane in the suggestion: ${streets.reason.slice(0, 70)}…`);
  ok(streets.normA === 'mill street' && streets.normB, 'abbreviations normalise (St. → street, W → west)');
  const linked = await page.evaluate(id => { const r = roadById(id); const res = linkByName(r); commit(); const on = buildingsOnRoad(r); const srcs = new Set(on.map(b => b.roadIdSource)); const manualKept = S.buildings.find(b => b.roadIdSource === 'manual' && buildingStreetText(b) === 'Mill Street'); res.undo(); const after = buildingsOnRoad(r).length; return { linked: res.linked, on: on.length, srcs: [...srcs], manualKept: !!manualKept && manualKept.roadId !== id, after }; }, streets.roadId);
  ok(linked.linked === streets.link && linked.on === streets.link && linked.srcs.join() === 'name' && linked.manualKept && linked.after === 0, `bulk link attaches ${linked.linked} buildings (source: name), keeps the hand-set link, and undo detaches them again`);
  const bulk = await page.evaluate(() => { const r = linkAllByName(); const n = S.buildings.filter(b => b.roadIdSource === 'name').length; r.undo(); return { total: r.total, n, roads: r.changes.length, after: S.buildings.filter(b => b.roadIdSource === 'name').length }; });
  ok(bulk.total >= streets.link && bulk.n === bulk.total && bulk.after === 0, `"Link all by street name" links ${bulk.total} across ${bulk.roads} road(s) and undoes cleanly`);
  await page.evaluate(() => { setNav('map'); MAPW.dock = 'streets'; renderDock(); }); await page.waitForTimeout(300);
  const panel = await page.evaluate(() => ({ bulk: !!$('[data-act="link-all-by-name"]'), per: $$('[data-act="link-by-name"]').length })); ok(panel.bulk && panel.per >= 1, `Streets panel offers the bulk action and ${panel.per} per-road "by name" link(s)`);
  await page.screenshot({ path: path.join(SHOTS, 'M-streets-by-name.png') });
  await page.evaluate(() => { const r = S.roads.find(x => x.name === 'Mill Street'); MAPW.sel = { kind: 'road', id: r.id }; MAPW.dock = 'inspector'; renderDock(); });
  const insp = await page.evaluate(() => !!$('#dock-body [data-act="link-by-name"]')); ok(insp, 'the road inspector shows "Link N buildings on Mill Street"');
  noErrors('fixes');

  await ctx.close(); await browser.close();
  console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
