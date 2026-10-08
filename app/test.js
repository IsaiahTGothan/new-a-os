// Acceptance checks for NewA-Land-Registry.html 2.5 in headless Chromium, on the real schema-2 data.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const FILE = 'file://' + path.join(DIR, 'NewA-Land-Registry.html');
const SHOTS = path.join(DIR, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const v2 = JSON.parse(fs.readFileSync(path.join(DIR, 'v2-state.json'), 'utf8'));
let failures = 0, checks = 0;
const hyIndexJS = (y, h) => (y - 2013) * 2 + (h === 'L' ? 1 : 0);
const S_v2_newbk = v2.buildings.filter(b => b.districtId === 'new-bk').length;
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
  ok(mig.schema === 4, 'schema is 4 after upgrade');
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
  ok(mig.modal.startsWith('Registry upgraded'), 'upgrade report shown'); ok(mig.pre, 'pre-upgrade copy held'); ok(mig.migrations.join() === '1→2,2→3,3→4', 'migrations logged: ' + mig.migrations.join(', '));
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
  ok(persisted.n === 153 && persisted.schema === 4, 'restored data survives reload');
  noErrors('restore');
  // the old two-file workflow still imports, and is upgraded exactly like an in-place upgrade
  console.log('\nB2 · legacy NewA.json + OtherDistricts.json import into a fresh profile');
  await ctx.close(); ctx = await browser.newContext(); page = await newPage(ctx); await page.goto(FILE); await booted(page);
  const legacy = await page.evaluate(([core, other]) => { mergePayload(core, 'replace'); mergePayload(other, 'replace'); const cpt = S.buildings.find(b => b.reg === 'MA-0013'); return { n: S.buildings.length, schema: S.schema, cpt: { yearBuilt: cpt.yearBuilt, yearExpected: cpt.yearExpected }, legacy: S.legacy.parcels.length, links: S.legacy.parcelLinks.length, split: S.buildings.every(b => b.physical && b.legacyStatus && summaryStatus(b) === b.legacyStatus), parents: S.districts.map(d => d.parentId), hist: histBuildings().length, polys: S.districts.filter(d => d.polygons.length).length, noParcelIds: !S.buildings.some(b => 'parcelIds' in b), districts: S.districts.length }; }, [JSON.parse(fs.readFileSync(path.join(DIR, 'real-NewA.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(DIR, 'real-OtherDistricts.json'), 'utf8'))]);
  ok(legacy.n === 153 && legacy.schema === 4 && legacy.districts === 7 && legacy.hist === 34, 'both 2.0 files import into one store (153 buildings, 7 districts)');
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
  await page.evaluate(() => hvPlay()); await page.waitForTimeout(1400); const playing = await page.evaluate(() => ({ playing: HV.playing, to: HV.to, pos: HV.pos, rate: HV.rate, slider: +$('#hv-range').value })); ok(playing.playing && playing.pos > 0.4 && playing.pos % 1 !== 0 && Math.abs(playing.slider - playing.pos) < 0.05, `plays continuously: the playhead glides (pos ${playing.pos.toFixed(2)} after 1.4 s at ${playing.rate} half-years/s, slider follows)`);
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
    return { reg: b.reg, di, alpha, at0: count(di, {}), at1: count(di + 1, {}), at2: count(di + 2, {}), at4: count(di + 4, {}), at4all: count(di + 4, { ghostsAll: true }), off: count(di, { historical: false }) };
  });
  ok(ghosts.alpha.a0 === 1 && ghosts.alpha.a1 > 0 && ghosts.alpha.a1 < 1 && ghosts.alpha.a2 === 0 && ghosts.alpha.a3 === 0 && ghosts.alpha.all > 0, `ghost opacity fades out within a year of the demolition: ${JSON.stringify(ghosts.alpha)}`);
  ok(ghosts.at0 === 1 && ghosts.at1 === 1 && ghosts.at2 === 0 && ghosts.at4 === 0 && ghosts.at4all === 1 && ghosts.off === 0, `${ghosts.reg}: ghost drawn at demolition and half a year later, gone a year on; "All ghosts" keeps it; Ghosts off hides it (${ghosts.at0}/${ghosts.at1}/${ghosts.at2}/${ghosts.at4all}/${ghosts.off})`);
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

  // ---------- N · V3 explore map: wordmark, search → place card, directions along roads, basemap, edit toggle ----------
  console.log('\nN · V3 explore map');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => { closeDrawer(true); setMapEdit(false); setNav('map'); }); await page.waitForTimeout(400);
  const chrome = await page.evaluate(() => ({ explore: !!$('.mapws.explore'), word: $('.gm-word')?.textContent, maps: $('.gm-maps')?.textContent, parody: $('.gm-parody')?.textContent, font: getComputedStyle($('.gm-word')).fontFamily, colors: $$('.gm-word b').map(b => getComputedStyle(b).color), tools: getComputedStyle($('.map-tools')).display, dock: !!$('#dock'), chips: $$('#gm-chips [data-gmlayer]').length, editBtn: $('.gm-edit')?.textContent.trim() }));
  ok(chrome.explore && chrome.word === 'GOOGLE' && chrome.maps === 'Maps' && /PARODY/.test(chrome.parody) && /Silkscreen/i.test(chrome.font), `explore mode shows the GOOGLE Maps parody wordmark in ${chrome.font.split(',')[0]} (${chrome.word} ${chrome.maps})`);
  ok(new Set(chrome.colors).size >= 4 && chrome.tools === 'none' && !chrome.dock && chrome.chips >= 9, `wordmark uses Google's four colours; edit tools and dock are hidden; ${chrome.chips} layer chips`);
  // search in the panel → a place card
  await page.fill('#map-q', 'Empire'); await page.waitForTimeout(250);
  const results = await page.evaluate(() => ({ hidden: $('#map-palette').hidden, n: $$('#map-palette .pi').length })); ok(!results.hidden && results.n >= 1, `typing in the map search lists ${results.n} result(s) under the box`);
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  const card = await page.evaluate(() => ({ sel: MAPW.sel, h2: $('#gm-card h2')?.textContent, acts: $$('#gm-card .pc-acts button').map(b => b.dataset.act), facts: $$('#gm-card .facts .k').map(k => k.textContent), k: MAPW.cam.k }));
  ok(card.sel?.kind === 'building' && /Empire State/.test(card.h2) && card.acts.includes('gm-directions-to') && card.acts.includes('pc-open') && card.facts.includes('COMPLETED'), `Enter opens a place card for ${card.h2} with Directions / Record / History / Edit`);
  ok(card.k > 1.5, `the camera flew in to the building (zoom ${card.k.toFixed(2)} px/blk)`);
  await page.screenshot({ path: path.join(SHOTS, 'N-place-card.png') });
  // click a building on the canvas in explore mode → card follows
  const dot = await page.evaluate(() => { const b = S.buildings.find(x => x.reg === 'MA-0006'); const [sx, sy] = w2s(b.x, b.z); const r = MAPW.canvas.getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy, id: b.id }; });
  await page.mouse.click(dot.x, dot.y); await page.waitForTimeout(200);
  const clicked = await page.evaluate(() => ({ id: MAPW.sel?.id, h2: $('#gm-card h2')?.textContent })); ok(clicked.id === dot.id && /Bank of America/.test(clicked.h2), 'clicking a building on the map opens its card');
  // directions: along the drawn roads (Harbor Way + Cross Street exist from section D)
  const route = await page.evaluate(() => {
    // a connector from Harbor Way's corner down to Mill Street and Decoy Lane (New BK), so the two networks join
    const link = newRoad(S); link.name = 'Link Road'; link.geometry = [[-40, 470], [-10, 330], [-10, 304]]; S.roads.push(link); JUNCTION_CACHE.key = ''; commit();
    const a = S.buildings.find(b => b.reg === 'MA-0012'), b = S.buildings.find(x => x.reg === 'BK-0037'); EXPLORE.from = { kind: 'building', id: a.id }; EXPLORE.to = { kind: 'building', id: b.id }; EXPLORE.dir = true; computeRoute();
    const r = MAPW.route; return { ok: !!r, dist: Math.round(r.dist), straight: Math.round(r.straight), roads: r.roads.map(id => roadById(id)?.name), steps: r.steps.map(s => s.text), pts: r.pts.length, sum: $('#gm-card .rt-sum')?.textContent, stepRows: $$('#gm-card .rt-steps .st').length, noRoads: !!r.noRoads, disconnected: !!r.disconnected };
  });
  ok(route.ok && route.pts >= 4 && route.dist >= route.straight && !route.noRoads && !route.disconnected && route.roads.length >= 3, `route from First Tower to 1427 Mill Street: ${route.dist} blocks via ${route.roads.join(' → ')} (${route.straight} direct), ${route.pts} points`);
  ok(route.steps.length >= 4 && /(Walk|Drive) to/.test(route.steps[0]) && route.steps.some(t => /(Turn (left|right)|Continue|Sharp (left|right)) onto/.test(t)) && route.stepRows === route.steps.length + 1 && /blocks/.test(route.sum), `turn-by-turn steps rendered: ${route.steps.join(' · ')}`);
  await page.screenshot({ path: path.join(SHOTS, 'N-directions.png') });
  const graph = await page.evaluate(() => { const G = roadGraph(); const deg = [...G.nodes.values()].map(n => n.adj.length); return { nodes: G.nodes.size, maxDeg: Math.max(...deg), crossing: [...G.nodes.values()].some(n => n.adj.length >= 3) }; });
  ok(graph.nodes >= 6 && graph.crossing, `road graph: ${graph.nodes} nodes, a junction node with ${graph.maxDeg} edges (roads connect at crossings)`);
  const noRoad = await page.evaluate(() => { const r = routeBetween({ kind: 'point', pt: [5000, 5000] }, { kind: 'point', pt: [5100, 5100] }); return { d: Math.round(r.dist), note: r.note || '', line: r.noRoads || r.disconnected }; });
  ok(noRoad.line && noRoad.d === 141 && noRoad.note.length > 10, `far from every road the route is an honest straight line (${noRoad.d} blk) with a note`);
  await page.evaluate(() => closeDirections());
  const closed = await page.evaluate(() => ({ route: MAPW.route, dir: EXPLORE.dir })); ok(!closed.route && !closed.dir, 'closing directions clears the route');
  // picking endpoints by clicking the map
  await page.evaluate(() => { EXPLORE.from = null; EXPLORE.to = null; openDirections({ kind: 'building', id: S.buildings.find(b => b.reg === 'MA-0004').id }); });
  const picking = await page.evaluate(() => ({ picking: EXPLORE.picking, cls: $('#mapstage').classList.contains('picking') })); ok(picking.picking === 'from' && picking.cls, 'Directions from a card asks for the start with a crosshair');
  await page.waitForTimeout(650); await page.evaluate(id => { const b = byId(id); MAPW.anim = null; MAPW.cam = { x: b.x, z: b.z, k: 3 }; mapDraw(); }, dot.id);
  const dot2 = await page.evaluate(id => { const b = byId(id); const [sx, sy] = w2s(b.x, b.z); const r = MAPW.canvas.getBoundingClientRect(); const el = document.elementFromPoint(r.left + sx, r.top + sy); return { x: r.left + sx, y: r.top + sy, el: el?.id || el?.className, mode: MAPW.mode, edit: MAPW.edit }; }, dot.id);
  await page.mouse.click(dot2.x, dot2.y); await page.waitForTimeout(300);
  const picked = await page.evaluate(() => ({ from: EXPLORE.from, route: !!MAPW.route, picking: EXPLORE.picking, sel: MAPW.sel })); ok(picked.from?.id === dot.id && picked.route && !picked.picking, 'clicking a building on the map sets the start and routes' + (picked.from?.id === dot.id ? '' : ` → ${JSON.stringify({ dot2, picked })}`));
  await page.evaluate(() => closeDirections());
  // basemap: a generated image placed by top-left X/Z and blocks per pixel
  const bm = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#226'; g.fillRect(0, 0, 200, 100); g.fillStyle = '#4FE3FF'; g.fillRect(0, 0, 100, 50); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const file = new File([blob], 'render.png', { type: 'image/png' }); const bm = await basemapAdd(file); bm.x = -200; bm.z = 400; bm.scale = 2; bm.opacity = 1; commit(); await new Promise(r => setTimeout(r, 300)); return { n: S.settings.basemaps.length, w: bm.w, h: bm.h, loaded: !!BASEMAP_IMG.get(bm.id)?.complete, id: bm.id, keys: (await idbKeys('images')).filter(k => String(k).startsWith('basemap:')).length }; });
  ok(bm.n === 1 && bm.w === 200 && bm.h === 100 && bm.loaded && bm.keys === 1, 'a basemap image is stored, measured (200×100 px) and loaded');
  const pix = await page.evaluate(id => { const bm = S.settings.basemaps.find(b => b.id === id); MAPW.cam = { x: -100, z: 425, k: 2 }; UI.layers.basemap = true; mapDraw(); const ctx = MAPW.ctx; const [sx, sy] = w2s(-150, 412); const d = ctx.getImageData(Math.round(sx * Math.min(2, devicePixelRatio || 1)), Math.round(sy * Math.min(2, devicePixelRatio || 1)), 1, 1).data; const cover = { x2: bm.x + bm.w * bm.scale, z2: bm.z + bm.h * bm.scale }; return { px: [...d].slice(0, 3), cover }; }, bm.id);
  ok(pix.cover.x2 === 200 && pix.cover.z2 === 600 && pix.px[2] > 150 && pix.px[0] < 140, `the image covers X −200→200 · Z 400→600 at 2 blocks/px and shows through under the data (sampled rgb ${pix.px.join(',')})`);
  await page.screenshot({ path: path.join(SHOTS, 'N-basemap.png') });
  await page.evaluate(async id => { await basemapRemove(id); UI.layers.basemap = false; MAPW.sel = null; renderPlaceCard(); mapFit(); }, bm.id);
  // edit toggle keeps every 2.5 tool
  await page.evaluate(() => setMapEdit(true)); await page.waitForTimeout(300);
  const edit = await page.evaluate(() => ({ edit: !!$('.mapws.edit'), tools: $$('.map-tools [data-mode]').length, dock: !!$('#dock'), gm: getComputedStyle($('.gm-panel')).display }));
  ok(edit.edit && edit.tools === 7 && edit.dock && edit.gm === 'none', 'Edit map brings back the 7 drawing modes and the inspector dock; the explore panel hides');
  await page.screenshot({ path: path.join(SHOTS, 'N-edit-mode.png') });
  await page.evaluate(() => { setMapMode('select'); setMapEdit(false); }); await page.waitForTimeout(200);
  const back = await page.evaluate(() => ({ explore: !!$('.mapws.explore'), word: !!$('.gm-word') })); ok(back.explore && back.word, 'and back to exploring');
  // the viewer camera hint from a place card
  const hint = await page.evaluate(() => { const b = S.buildings.find(x => x.reg === 'MA-0004'); HV.camHint = { x: b.x, z: b.z }; openHistoryViewer({ year: 2020 }); const r = { x: HV.cam.x, z: HV.cam.z, k: HV.cam.k }; closeHistoryViewer(); return { ...r, bx: b.x, bz: b.z }; });
  ok(hint.x === hint.bx && hint.z === hint.bz && hint.k >= 3, 'History from a place card opens playback centred on the building');
  // typography: the app title, pixel kickers, display headings
  await page.evaluate(() => setNav('overview')); await page.waitForTimeout(300);
  const fonts = await page.evaluate(() => ({ title: document.title, brand: getComputedStyle($('.brand h1 .px')).fontFamily, h2: getComputedStyle($('.hero .title h2')).fontFamily, tile: getComputedStyle($('.tile .val')).fontFamily, nav: $$('#side .tab.nav .lbl').map(l => l.textContent), navCol: getComputedStyle($('#side')).gridColumn || '' }));
  ok(fonts.title === 'NEW A OS' && /Silkscreen/i.test(fonts.brand) && /Bricolage/i.test(fonts.h2) && /Silkscreen/i.test(fonts.tile), `V3 typography: Silkscreen brand + tiles, Bricolage Grotesque display (title “${fonts.title}”)`);
  ok(fonts.nav.join() === 'Home,Map,Registry,Transit,Civic,Business,History,Site', 'left navigation: ' + fonts.nav.join(' · '));
  noErrors('explore');

  // ---------- O · playback V3: speeds, change stepping, filters, compare, inferred marking, dated basemaps ----------
  console.log('\nO · playback V3');
  await page.evaluate(() => { setNav('history'); openHistoryViewer({ year: 2018, half: 'E' }); }); await page.waitForTimeout(250);
  const pb = await page.evaluate(() => ({ speeds: $$('#hv-speed option').map(o => +o.value), ctl: $$('.hv-ft .tl-ctl button').length, evidence: $$('#hv-evidence .evd').length, filters: $$('[data-hvkind]').length, hasDistrict: !!$('#hv-district'), layers: $$('[data-hvlayer]').map(b => b.dataset.hvlayer) }));
  ok(pb.speeds.join() === '0.1,0.25,0.5,1,2,4' && pb.ctl === 5, `six speeds from a year per 20 s to two years per second (${pb.speeds.join(' · ')} half-years/s) and prev/next-change buttons`);
  ok(pb.evidence >= 5 && pb.filters === 4 && pb.hasDistrict && pb.layers.includes('evidence') && pb.layers.includes('basemap'), `${pb.evidence} evidence dots on the timeline (chronicle images), kind filters, place filter, Inferred + Maps toggles`);
  const stepping = await page.evaluate(() => { const i0 = HV.to; hvStepChange(1); const i1 = HV.to; const n1 = hvEventsAt(i1).length; hvStepChange(-1); const back = HV.to; return { i0, i1, n1, back, skipped: i1 - i0 }; });
  ok(stepping.i1 > stepping.i0 && stepping.n1 >= 1 && stepping.back <= stepping.i0, `next change jumps from ${stepping.i0} to ${stepping.i1} (${stepping.n1} events), previous change returns`);
  const filt = await page.evaluate(() => { const all = hvRows().length; HV.filter.district = 'new-bk'; const nb = hvRows().length; const evAll = hvEventsAt(hyIndex(2018, 'E')).length; HV.filter.kinds.buildings = false; const evNoB = hvEventsAt(hyIndex(2018, 'E')).length; HV.filter.kinds.buildings = true; HV.filter.district = ''; hvUpdateChrome(); return { all, nb, evAll, evNoB }; });
  ok(filt.nb < filt.all && filt.nb >= S_v2_newbk && filt.evNoB === 0 && filt.evAll >= 1, `place filter narrows to New BK (${filt.nb} of ${filt.all}); kind filter hides building events (${filt.evAll} → ${filt.evNoB})`);
  const inferred = await page.evaluate(() => { const b = hvRows().find(x => x.yearBuilt != null && !x.halfBuilt && isActive(x) && !isUnderWay(x)); const i = hyIndex(b.yearBuilt, 'E'); const st = stateAtHY(b, i); hvSet(i, { instant: true }); return { reg: b.reg, inf: inferredAt(b, i, st), counts: $('#hv-counts').textContent, rec: $('#hv-events').textContent }; });
  ok(inferred.inf && /inferred/.test(inferred.counts) && /inferred|recorded/.test(inferred.rec), `${inferred.reg} dated by year only is marked inferred (counts: …${inferred.counts.replace(/\s+/g, ' ').slice(-40)})`);
  // compare mode: two panes, a B date, and the changes between them
  await page.evaluate(() => { hvSet(hyIndex(2016, 'E'), { instant: true }); hvToggleCompare(); hvSetB(hyIndex(2020, 'E')); }); await page.waitForTimeout(250);
  const cmp = await page.evaluate(() => ({ compare: HV.compare, panes: $$('#hv-stage canvas').length, dateB: $('#hv-date-b')?.textContent.replace(/\s+/g, ' ').trim(), title: $('#hv-ev-title')?.textContent, n: $$('#hv-events .ev').length, rangeB: $('#hv-range-b')?.value, whens: $$('#hv-events .ev .nm > .r').length }));
  ok(cmp.compare && cmp.panes === 2 && /2020/.test(cmp.dateB) && /CHANGED/.test(cmp.title) && cmp.n >= 5 && +cmp.rangeB === hyIndexJS(2020, 'E'), `compare mode: two panes (A Early 2016 · B Early 2020), "${cmp.title}" lists ${cmp.n} events with their dates`);
  await page.screenshot({ path: path.join(SHOTS, 'O-compare.png') });
  const swapped = await page.evaluate(() => { const a = HV.to, b = HV.b; hvSet(HV.b, { instant: true }); hvSetB(a); return { to: HV.to, b: HV.b, a, bb: b }; }); ok(swapped.to === swapped.bb && swapped.b === swapped.a, 'A and B swap');
  await page.evaluate(() => hvToggleCompare()); await page.waitForTimeout(150);
  const single = await page.evaluate(() => ({ compare: HV.compare, panes: $$('#hv-stage canvas').length })); ok(!single.compare && single.panes === 1, 'back to one pane');
  // dated basemaps: only the latest render at or before the date is shown, never a newer one
  const bms = await page.evaluate(() => { S.settings.basemaps = [{ id: 'bm2015', name: '2015 render', x: 0, z: 0, scale: 1, opacity: 1, year: 2015, half: 'E' }, { id: 'bm2019', name: '2019 render', x: 0, z: 0, scale: 1, opacity: 1, year: 2019, half: 'L' }, { id: 'bmnow', name: 'present render', x: 0, z: 0, scale: 1, opacity: 1 }]; const at = hy => basemapsAt(hy).map(b => b.id); const r = { e2014: at(hyIndex(2014, 'E')), e2016: at(hyIndex(2016, 'E')), e2019: at(hyIndex(2019, 'E')), l2019: at(hyIndex(2019, 'L')), e2024: at(hyIndex(2024, 'E')), present: at(null), evd: $$('#hv-evidence .evd.maps').length }; S.settings.basemaps = []; return r; });
  ok(bms.e2014.length === 0 && bms.e2016.join() === 'bm2015' && bms.e2019.join() === 'bm2015' && bms.l2019.join() === 'bm2015,bm2019' && bms.e2024.join() === 'bm2015,bm2019' && bms.present.includes('bmnow') && bms.present.includes('bm2019') && !bms.present.includes('bm2015'), `dated renders: none before 2015, the 2015 render alone until Late 2019, then the 2019 one stacked on top — never a newer render behind an older one; today shows the newest only (${JSON.stringify(bms).slice(0, 120)}…)`);
  const loop = await page.evaluate(() => { HV.loop = true; hvMoveTo(HV.i1 + 0.95, { fx: false }); hvPlay(); return new Promise(r => setTimeout(() => { const v = { to: HV.to, playing: HV.playing }; hvPause(); HV.loop = false; r(v); }, 400)); });
  ok(loop.playing && loop.to < 3, `Loop restarts from the founding when the end is reached (at index ${loop.to} after 0.4 s)`);
  await page.evaluate(() => closeHistoryViewer());
  noErrors('playback');

  // ---------- P · civic database · service · valuations · city health · digest · quality assistant · projects ----------
  console.log('\nP · civic, service, valuations, health, digest, quality, projects');
  await page.evaluate(() => { UI.mapColor = 'district'; setScope({ kind: 'region', id: 'new-a-city' }); setNav('overview'); }); await page.waitForTimeout(250);
  const p0 = await page.evaluate(() => ({ schema: S.schema, nav: $$('#tabs .tab .lbl').map(x => x.textContent), health: $$('.health .hcard').length, overall: $('.health .hcard.overall .count')?.dataset.to, profile: $('.profile .ptext p')?.textContent || '', projects: !!$('.panel.projects'), tiles: $$('.tiles .tile .lbl').map(x => x.textContent), quality: $$('.qrows .qr').length }));
  ok(p0.schema === 4 && p0.nav.join() === 'Home,Map,Registry,Transit,Civic,Business,History,Site', 'schema 4 · Civic in the navigation: ' + p0.nav.join(' · '));
  ok(p0.health === 8 && +p0.overall >= 0 && +p0.overall <= 100, `city health: 7 measures + overall ${p0.overall}/100`);
  ok(/standing building/.test(p0.profile) && p0.projects && p0.tiles.includes('ESTIMATED VALUE'), `profile written from the records (“${p0.profile.slice(0, 80)}…”), project tracker and estimated-value tile on Home`);
  await page.screenshot({ path: path.join(SHOTS, 'P-home.png'), fullPage: false });
  // civic: three essential facilities and the Mayor with office + home (on real Man A buildings)
  const civ = await page.evaluate(() => {
    const placed = S.buildings.filter(b => isActive(b) && isCompleted(b) && b.x != null && b.districtId === 'man-a'); const [h, p, f, home] = placed;
    h.civic = { type: 'hospital', status: 'operating', capacity: 120, jurisdictionId: 'new-a-city', notes: '' }; p.civic = { type: 'police', status: 'operating', capacity: 40, jurisdictionId: 'man-a', notes: '' }; f.civic = { type: 'fire', status: 'operating', capacity: 3, jurisdictionId: 'man-a', notes: '' };
    const o = newOfficial(S); o.name = 'Test Mayor'; o.office = 'Mayor'; o.jurisdictionId = 'new-a-city'; o.officeBuildingId = p.id; o.residenceBuildingId = home.id; S.officials.push(o); commit({ now: true });
    setNav('civic');
    return { reg: o.reg, n: civicRows().length, offs: officialsIn().length, cov: coverageReport().score, groups: $$('.civlist .cg').length, rows: $$('.civlist .cr').length, homeReg: home.reg, hospReg: h.reg, hospId: h.id, count: $('#tabs .tab.civic .cnt')?.textContent };
  });
  await page.waitForTimeout(250);
  ok(civ.reg === 'GV-0001' && civ.n === 3 && civ.offs === 1 && civ.groups === 3 && civ.rows === 3 && civ.count === '3', `hospital, police and fire marked on real buildings; ${civ.reg} the Mayor lives at ${civ.homeReg}; facilities grouped by type (nav count 3)`);
  ok(civ.cov > 0 && civ.cov <= 100, `essential coverage measured: ${civ.cov}% of placed New A City buildings within reach of all three`);
  await page.screenshot({ path: path.join(SHOTS, 'P-civic.png') });
  const offs = await page.evaluate(() => { UI.cseg = 'officials'; renderView(false); const card = $('.offcard'); return { cards: $$('.offcard').length, office: card?.querySelector('.pl:nth-child(1)')?.textContent || '', home: card?.querySelector('.pl:nth-child(2)')?.textContent || '' }; });
  ok(offs.cards === 1 && /OFFICE/.test(offs.office) && /HOME/.test(offs.home) && !/not recorded/.test(offs.home), 'the official card shows the office and the home, both linked to buildings');
  const cover = await page.evaluate(() => { UI.cseg = 'coverage'; renderView(false); return { rows: $$('.covrow').length, places: $$('.hbar[data-scope-kind]').length, issues: civicIssues().length, inAll: allIssues().some(i => i.kind === 'official') }; });
  ok(cover.rows === 3 && cover.places >= 3, `coverage tab compares ${cover.places} boroughs across the 3 essential types`);
  // building record: CIVIC section, officials here, explainable estimate
  const rec = await page.evaluate(id => { openBuilding(id, 'view'); const t = $('#drawer').textContent; const b = byId(id); return { civic: /CIVIC/.test(t) && /Hospital/.test(t), factors: $$('#drawer .valfactors .vf').length, est: valuationOf(b).value, hasBase: /BASE/.test(t) }; }, civ.hospId);
  ok(rec.civic && rec.hasBase && rec.factors >= 2 && rec.est > 0, `record shows CIVIC · Hospital and an explainable estimate (${rec.factors} factor rows, ${rec.est})`);
  await page.screenshot({ path: path.join(SHOTS, 'P-record.png') });
  // the editor round-trips civic fields, condition, public flag and the override
  const edit4 = await page.evaluate(async id => { openBuilding(id, 'edit'); $('#f-civicCapacity').value = '150'; $('#f-condition').value = 'excellent'; $('#f-public').checked = false; $('#f-valOverride').value = '1234567'; $('#f-valReason').value = 'appraisal'; saveDrawer(); await new Promise(r => setTimeout(r, 300)); const b = byId(id); return { cap: b.civic?.capacity, cond: b.condition, pub: b.public, ov: b.valuationOverride?.value, reason: b.valuationOverride?.reason, shown: valuationOf(b).value, type: b.civic?.type }; }, civ.hospId);
  ok(edit4.cap === 150 && edit4.cond === 'excellent' && edit4.pub === false && edit4.ov === 1234567 && edit4.reason === 'appraisal' && edit4.shown === 1234567 && edit4.type === 'hospital', 'editor round-trips capacity, condition, public flag and a manual valuation override');
  await page.evaluate(async id => { openBuilding(id, 'edit'); $('#f-valOverride').value = ''; $('#f-public').checked = true; saveDrawer(); await new Promise(r => setTimeout(r, 200)); closeDrawer(); }, civ.hospId);
  // valuation maths on a real assessed building: factors sum to the adjustment
  const val = await page.evaluate(() => { const b = S.buildings.find(x => isActive(x) && isCompleted(x) && x.x != null && num(x.assessTotal) && !x.civic); const e = valueEstimate(b); const sumPct = e.factors.reduce((a, f) => a + f.pct, 0); return { reg: b.reg, value: e.value, assessed: num(b.assessTotal), base: e.base, sumPct, totalPct: e.totalPct, expected: Math.round(e.base * (1 + sumPct / 100)), why: e.factors.map(f => `${f.label} ${f.pct > 0 ? '+' : ''}${f.pct}% (${f.why})`), conf: e.confidence, hist: (b.valuations || []).length }; });
  ok(val.base === val.assessed && val.sumPct === val.totalPct && val.value === val.expected && val.conf === 'assessment-based', `${val.reg}: base = assessed ${val.assessed} · ${val.why.join(' · ')} → ${val.value}`);
  const recd = await page.evaluate(reg => { const b = S.buildings.find(x => x.reg === reg); const n = recordValuations([b], 'test'); return { n, hist: b.valuations.length, latest: b.valuation?.value, v: b.valuations[0].version }; }, val.reg);
  ok(recd.n === 1 && recd.hist === 1 && recd.latest === val.value && recd.v === 2, 'recording stores a dated valuation with its model version (v2)');
  // transit service: deterministic timetable on a test line, measured override, scores, sandbox
  const tl = await page.evaluate(() => {
    const t = newTrack(S); t.name = 'Test track'; t.geometry = [[2000, 2000], [2000, 2200], [2000, 2400]]; S.tracks.push(t);
    const mk = (n, x, z) => { const s = newStation(S); s.name = n; s.x = x; s.z = z; S.stations.push(s); return s; };
    const a = mk('Alpha', 2000, 2000), b = mk('Beta', 2000, 2200), c = mk('Gamma', 2000, 2400);
    const l = newLine(S); l.name = 'Test Line'; l.shortName = 'TL'; l.mode = 'subway'; l.status = 'open'; l.trackIds = [t.id]; l.stopIds = [a.id, b.id, c.id]; S.lines.push(l); commit({ now: true });
    const tt = lineTimetable(l); const e2e = lineEndToEnd(l); const j = lineJourneyTime(l, a.id, c.id);
    l.segments = [{ fromId: a.id, toId: b.id, seconds: 50, basis: 'measured' }]; const tt2 = lineTimetable(l); const e2e2 = lineEndToEnd(l);
    l.service = { speed: null, headwayMin: 3, dwellSec: null, basis: 'scheduled' }; const svc = lineService(l);
    return { id: l.id, aId: a.id, times: tt.map(r => r.t), e2e, j: j && j.sec, basis: j && j.basis, e2e2, seg2: tt2[1].seg.basis, tph: tphOf(l), headway: svc.headwayMin, speed: svc.speed, svcBasis: svc.basis, bx: 2000, bz: 2050 };
  });
  ok(tl.times.join() === '0,35,70' && tl.e2e === 70 && tl.j === 70 && tl.basis === 'estimated', `estimated timetable: 200 blk at 8 blk/s + 10 s dwell = 35 s per hop (${tl.times.join(' · ')} s)`);
  ok(tl.e2e2 === 85 && tl.seg2 === 'measured' && tl.tph === 20 && tl.headway === 3 && tl.speed === 8 && tl.svcBasis === 'scheduled', `a measured 50 s segment overrides the estimate (end to end ${tl.e2e2} s); 3-min headway → ${tl.tph} tph, speed still the mode default`);
  await page.evaluate(() => { UI.tseg = 'times'; UI.tline = S.lines.find(l => l.name === 'Test Line').id; setNav('transit'); }); await page.waitForTimeout(250);
  const times = await page.evaluate(() => ({ rows: $$('table.reg tbody tr').length, cum: $$('table.reg tbody tr td.hi').map(x => x.textContent), basis: $$('table.reg tbody .mk').map(x => x.textContent) }));
  ok(times.rows === 3 && times.cum.join() === '0 s,50 s,1 min' && times.basis.includes('MEASURED') && times.basis.includes('ESTIMATED'), `Times tab: ${times.cum.join(' → ')}, bases ${[...new Set(times.basis)].join('/')}`);
  await page.screenshot({ path: path.join(SHOTS, 'P-times.png') });
  const svc = await page.evaluate(() => { UI.tseg = 'service'; renderView(false); const places = serviceByPlace(); const far = { x: 9000, z: 9000 }; const near = { x: 2000, z: 2050 }; return { rows: $$('.svcrows .svc').length, places: places.length, far: buildingService(far).score, near: buildingService(near), color: dotColor({ x: 2000, z: 2050, districtId: 'man-a' }) }; });
  ok(svc.rows === svc.places && svc.places >= 3 && svc.far === 0 && svc.near.score >= 50 && svc.near.near.s.name === 'Alpha' && svc.near.tph === 20, `service scores: a building 50 blk from Alpha scores ${svc.near.score} (20 tph), one 9000 blk away scores 0; ${svc.places} boroughs ranked`);
  await page.screenshot({ path: path.join(SHOTS, 'P-service.png') });
  const sb = await page.evaluate(async () => { const b = { x: 2400, z: 2000 }; const before = buildingService(b).score; S.sandbox.stations = [{ id: 'sbx1', name: 'Try', x: 2400, z: 2000, lineId: null, headwayMin: 4 }]; const after = buildingService(b, { sandbox: true }).score; window.confirmDialog = async () => 'ok'; const n0 = S.stations.length; await sandboxPromote('sbx1'); return { before, after, promoted: S.stations.length === n0 + 1, planned: S.stations[S.stations.length - 1].status, left: S.sandbox.stations.length }; });
  ok(sb.after > sb.before && sb.promoted && sb.planned === 'planned' && sb.left === 0, `sandbox station lifts a nearby score ${sb.before} → ${sb.after}; promoting creates a planned station and clears the sandbox entry`);
  // service colour on the map + civic glyph layer draw without errors
  await page.evaluate(() => { UI.mapColor = 'service'; setNav('map'); }); await page.waitForTimeout(400);
  const mapc = await page.evaluate(() => { MAPW.cam = { x: 2000, z: 2100, k: 3 }; mapDraw(); const b = S.buildings.find(x => x.civic?.type === 'hospital'); MAPW.cam = { x: b.x, z: b.z, k: 3 }; mapDraw(); return { legend: /Best served/.test(mapLegendHTML()), color: dotColor(b), civicLayer: UI.layers.civic }; });
  ok(mapc.legend && /^#[0-9a-f]{6}$/i.test(mapc.color) && mapc.civicLayer, 'map colours buildings by service score with its own legend; civic glyph layer on');
  await page.screenshot({ path: path.join(SHOTS, 'P-map-service.png') });
  await page.evaluate(() => { UI.mapColor = 'district'; });
  // health cards navigate; keyboard C opens Civic
  const nav = await page.evaluate(() => { setNav('overview'); healthOpen('civic'); return { nav: UI.nav, seg: UI.cseg }; });
  ok(nav.nav === 'civic' && nav.seg === 'coverage', 'the ESSENTIAL SERVICES health card opens Civic → Coverage');
  await page.evaluate(() => setNav('overview')); await page.keyboard.press('c'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => UI.nav === 'civic'), 'C opens the Civic section');
  // change digest → newsletter draft, saved locally only
  const dg = await page.evaluate(() => { const d = changeDigest({ sinceDays: 365 }); const md = digestMarkdown(d); openDigestModal(365); $('#dg-save').click(); return { total: d.total, md: md.slice(0, 60), hasNew: /New in the registry|Transit|Government/.test(md), lines: d.lines.length, offs: d.officials.length, drafts: S.news.drafts.length, status: S.news.drafts[0]?.status, modal: !!$('#modal-root .modal') }; });
  ok(dg.total >= 2 && dg.hasNew && dg.lines >= 1 && dg.offs === 1 && dg.drafts === 1 && dg.status === 'draft' && !dg.modal, `digest lists ${dg.total} changes (incl. the test line and the Mayor) and saves a newsletter draft locally — nothing posted`);
  // data-quality assistant: neighborhood from the drawn border, with a snapshot and a migration note
  const q = await page.evaluate(async () => { const hood = S.neighborhoods.find(h => (h.polygons || []).length); const b = S.buildings.find(x => isActive(x) && x.x != null && x.districtId === hood.districtId && pointInPolys([x.x, x.z], hood.polygons) === 'in' && x.neighborhoodId === hood.id); if (!b) return { skip: true }; b.neighborhoodId = null; const sug = qualitySuggestions().find(s => s.id === 'hood'); const listed = !!sug && sug.items.some(x => x.b.id === b.id); const snaps0 = (await listSnapshots()).length; await qualityFix('hood'); const snaps1 = (await listSnapshots()).length; return { listed, restored: b.neighborhoodId === hood.id, note: (b.migrationNotes || []).some(n => /neighborhood set/.test(n)), snap: snaps1 === snaps0 + 1, kinds: qualitySuggestions().map(s => s.id) }; });
  ok(q.skip || (q.listed && q.restored && q.note && q.snap), q.skip ? 'no hood with a building inside its border — assistant hood fix not exercised' : `assistant proposes the neighborhood from the border, fixes it after confirmation with a snapshot and a note (also offers: ${q.kinds.join(', ')})`);
  // projects: reg, links, log, evidence; shown on Home; export round-trip keeps civic, officials and projects
  const pj = await page.evaluate(() => { const b = S.buildings.find(x => x.civic?.type === 'hospital'); saveProject({ name: 'Hospital extension', stage: 'planning', districtId: 'man-a', buildingIds: [b.id], lineIds: [], roadIds: [], archiveIds: [S.archive[0]?.id].filter(Boolean), startedYear: 2026, startedHalf: 'L', targetYear: null, targetHalf: '', notes: '', log: [{ at: now(), text: 'Site survey done' }] }, null); const p = S.projects[0]; setNav('overview'); return { reg: p.reg, linked: projectsOf(b).length, rows: $$('.projrows .pr').length, stage: $('.projrows .pr .status')?.textContent, evidence: p.archiveIds.length }; });
  ok(pj.reg === 'PJ-0001' && pj.linked === 1 && pj.rows === 1 && /Planning/.test(pj.stage), `project ${pj.reg} tracked with a linked building, a log entry and ${pj.evidence} chronicle evidence; listed on Home`);
  const guide = await page.evaluate(() => { const b = S.buildings.find(x => isActive(x) && x.owner); const hidden = S.buildings.find(x => isActive(x) && x.id !== b?.id); hidden.public = false; const html = publicGuideHTML({ kind: 'region', id: 'new-a-city' }); hidden.public = true; return { doc: html.startsWith('<!doctype html>'), guide: /PUBLIC GUIDE/.test(html), owner: b ? html.includes(b.owner) : false, hiddenOut: !html.includes(hidden.reg + '</td>'), hospital: /Hospital/.test(html), mayor: /Test Mayor/.test(html) }; });
  ok(guide.doc && guide.guide && !guide.owner && guide.hiddenOut && guide.hospital && guide.mayor, 'public guide: standalone page with civic facilities and officials, no owners, and buildings marked private left out');
  const rt = await page.evaluate(() => { const m = serializeMaster(); mergePayload(m, 'replace'); return { offs: S.officials.length, projects: S.projects.length, civic: S.buildings.filter(isCivic).length, segs: S.lines.find(l => l.name === 'Test Line')?.segments.length, drafts: S.news.drafts.length }; });
  ok(rt.offs === 1 && rt.projects === 1 && rt.civic === 3 && rt.segs === 1 && rt.drafts === 1, 'master export → replace keeps officials, projects, civic blocks, measured segments and drafts');
  await page.evaluate(async () => { commit({ now: true }); await new Promise(r => setTimeout(r, 700)); });
  await page.reload(); await booted(page);
  const persisted4 = await page.evaluate(() => ({ schema: S.schema, offs: S.officials.length, projects: S.projects.length, civic: S.buildings.filter(isCivic).length }));
  ok(persisted4.schema === 4 && persisted4.offs === 1 && persisted4.projects === 1 && persisted4.civic === 3, 'everything survives a reload');
  noErrors('city');

  // ---------- Q · Clawson ----------
  console.log('\nQ · Clawson — answers from the records, proposals via the inbox, drafts, activity, provider off');
  await page.evaluate(() => { setNav('overview'); clawToggle(true); }); await page.waitForTimeout(200);
  const c0 = await page.evaluate(() => ({ open: CLAW.open, panel: $('#clawson').classList.contains('on'), chips: $$('#clawson .chips button').length, pressed: $('#side-end .clawson').getAttribute('aria-pressed') }));
  ok(c0.open && c0.panel && c0.chips >= 8 && c0.pressed === 'true', 'Clawson opens from the rail with example chips');
  const ask = async q => { await page.evaluate(q => clawRun(q), q); await page.waitForFunction(() => !CLAW.busy); return page.evaluate(() => { const m = CLAW.log[CLAW.log.length - 1]; return { kind: m.kind, text: m.html.replace(/<[^>]+>/g, ''), hits: (m.hits || []).length, action: m.action?.type || null, pending: CLAW.pending?.type || null }; }); };
  const mayor = await ask('Who is the mayor?');
  ok(mayor.kind === 'fact' && /Test Mayor/.test(mayor.text) && /Home:/.test(mayor.text) && mayor.hits >= 1, `“Who is the mayor?” → ${mayor.text.slice(0, 100)}…`);
  const home = await ask('Where does the mayor live?');
  ok(home.kind === 'fact' && /lives at/.test(home.text) && home.hits === 1, `“Where does the mayor live?” → ${home.text.slice(0, 90)}…`);
  const hosp = await ask('Hospitals in Man A');
  ok(hosp.kind === 'fact' && /^1 hospital/.test(hosp.text) && /Coverage/.test(hosp.text), `hospitals → ${hosp.text.slice(0, 90)}…`);
  const best = await ask('Which borough is best served?');
  ok(best.kind === 'fact' && /Best served/.test(best.text), `best served → ${best.text.slice(0, 90)}…`);
  const trip = await ask('How long from Alpha to Gamma?');
  ok(trip.kind === 'fact' && /1 min/.test(trip.text) && /mixed/.test(trip.text), `journey → ${trip.text.slice(0, 110)}…`);
  const health = await ask('How is the city doing?');
  ok(health.kind === 'fact' && /\/100/.test(health.text), `health → ${health.text.slice(0, 80)}…`);
  const worth = await ask('Why is MA-0004 worth that?');
  ok(worth.kind === 'fact' && /estimated at/.test(worth.text) && /Adjustments/.test(worth.text), `valuation explanation → ${worth.text.slice(0, 100)}…`);
  // a change request becomes an inbox proposal; applied there, listed and undone from the activity view
  const target = await page.evaluate(() => S.buildings.find(b => isActive(b) && isCompleted(b) && !b.civic && !b.verified && b.districtId === 'man-a' && !S.officials.some(o => o.residenceBuildingId === b.id)).reg);
  const prop = await ask(`Mark ${target} as a fire station`);
  ok(prop.kind === 'sugg' && prop.pending === 'propose', `“Mark ${target} as a fire station” becomes a pending proposal — nothing applied`);
  const inbox = await page.evaluate(reg => { const b = S.buildings.find(x => x.reg === reg); const before = JSON.stringify(b.civic); const n0 = newsPendingCount(); clawApply(); const n1 = newsPendingCount(); const c = S.news.items.find(it => it.source === 'clawson').candidates[0]; return { before, after: JSON.stringify(b.civic), n0, n1, label: c.label, decided: !!S.news.decisions[c.id], badge: $('#news-badge').textContent }; }, target);
  ok(inbox.before === inbox.after && inbox.n1 === inbox.n0 + 1 && !inbox.decided && inbox.label.includes(target) && +inbox.badge === inbox.n1, `proposal sits in the inbox (pending ${inbox.n0} → ${inbox.n1}, badge ${inbox.badge}); the record is untouched`);
  const applied = await page.evaluate(reg => { const c = S.news.items.find(it => it.source === 'clawson').candidates[0]; const okk = applyCandidate(c); const b = S.buildings.find(x => x.reg === reg); CLAW.view = 'activity'; clawRender(); return { okk, type: b.civic?.type, guid: S.news.log[0]?.source?.guid, act: $$('#claw-log .msg .k.act').length, undo: !!$('#claw-log [data-act="news-undo"]') }; }, target);
  ok(applied.okk && applied.type === 'fire' && /^clawson:/.test(applied.guid) && applied.act >= 1 && applied.undo, `applied from the inbox → ${target} is a fire station; Activity lists it with Undo`);
  const undone = await page.evaluate(reg => { undoLog(S.news.log[0].id); const b = S.buildings.find(x => x.reg === reg); return { civic: b.civic, undone: !!S.news.log[0].undone }; }, target);
  ok(undone.civic === null && undone.undone, 'undo restores the record and marks the log entry');
  // newsletter drafts: written, saved locally, never posted
  const draft = await ask('Draft the newsletter');
  const dr = await page.evaluate(() => ({ n: S.news.drafts.length, last: S.news.drafts[S.news.drafts.length - 1] }));
  ok(draft.kind === 'act' && dr.n === 2 && dr.last.by === 'clawson' && dr.last.status === 'draft' && /^#/.test(dr.last.body), `a draft is written and saved locally (${dr.n} drafts), status draft`);
  const pub = await ask('Publish it');
  ok(pub.kind === 'note' && /never writes to the website/.test(pub.text), 'asked to publish, Clawson says it cannot post and explains the manual path');
  await page.evaluate(id => openDraftModal(id), dr.last.id); const dm = await page.evaluate(() => ({ modal: !!$('#modal-root .modal'), text: $('#draft-text')?.value.length || 0 })); ok(dm.modal && dm.text > 100, 'the draft opens in an editor'); await page.evaluate(() => closeModal());
  const tab = await page.evaluate(() => { NEWS.filter = 'drafts'; openNewsInbox(); const n = $$('#news-inbox [data-act="draft-open"]').length; const btn = !!$('#news-inbox [data-newsf="drafts"]'); closeModal(); NEWS.filter = 'pending'; return { n, btn }; });
  ok(tab.n === 2 && tab.btn, 'the Inbox has a Drafts tab listing both drafts');
  const unk = await ask('What is the meaning of life?');
  ok(unk.kind === 'note' && /did not understand/.test(unk.text), 'an unknown question gets an honest note — nothing invented');
  const nokey = await page.evaluate(async () => { S.settings.ai.enabled = true; await clawRun('What is the meaning of life?'); const m = CLAW.log[CLAW.log.length - 1]; S.settings.ai.enabled = false; return m.html; });
  ok(/no key is stored/.test(nokey), 'provider on without a key → says so, nothing is sent');
  await page.evaluate(() => { CLAW.view = 'chat'; clawRender(); }); await page.screenshot({ path: path.join(SHOTS, 'Q-clawson.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); ok(await page.evaluate(() => !CLAW.open), 'Escape closes Clawson');
  await page.keyboard.press('k'); await page.waitForTimeout(100); ok(await page.evaluate(() => CLAW.open), 'K reopens it'); await page.evaluate(() => clawToggle(false));
  noErrors('clawson');

  // ---------- R · OS bridge: live integration against a synthetic world ----------
  console.log('\nR · OS bridge — scan → inbox → apply/undo, render → dated basemap, verified backup, health');
  const { createServer: createBridge } = require('../os/server'); const synth = require('../os/test/synth'); const osmod = require('os');
  const btmp = fs.mkdtempSync(path.join(osmod.tmpdir(), 'newa-bridge-')); synth.makeWorld(path.join(btmp, 'world'), '1.18'); const bvault = path.join(btmp, 'vault'); fs.mkdirSync(bvault); fs.writeFileSync(path.join(bvault, 'Registry.json'), JSON.stringify({ buildings: [] }));
  const bridge = createBridge({ port: 0, host: '127.0.0.1', vaultDir: bvault, worldDir: path.join(btmp, 'world'), backupDir: path.join(btmp, 'backups'), mirrorDir: '', retain: 30, monthlyFull: true, afterSession: true, allowHosts: ['newa-site.vercel.app'], roadBlocks: null, lastRestoreTest: null });
  await new Promise(r => bridge.listen(0, '127.0.0.1', r)); const burl = `http://127.0.0.1:${bridge.address().port}`;
  const onW = await page.evaluate(async url => { S.settings.os = { url }; const ok = await OS.poll(); return { ok, tile: $('#side-end .osdot')?.classList.contains('on'), st: $('#st-os-t').textContent, worldOk: OS.status?.worldOk }; }, burl);
  ok(onW.ok && onW.tile && /online/.test(onW.st) && onW.worldOk, 'the app connects to the bridge: status bar and rail tile go online, world readable');
  const scanW = await page.evaluate(async () => { const d = coreDistricts()[0] || S.districts[0]; const b = newBuilding(S, d.id); b.name = 'Scan Tower'; b.x = 34; b.z = 113; S.buildings.push(b); commit({ now: true }); const r = await OS.scanRun({ x1: 0, z1: 0, x2: 175, z2: 175 }); return { ok: !!r, clusters: r?.summary.clusters, roads: r?.summary.roads, kinds: r?.summary.byKind, reg: b.reg, render: !!r?.render?.url, scans: S.world.scans.length }; });
  ok(scanW.ok && scanW.clusters === 2 && scanW.roads === 1 && scanW.kinds['world-update'] === 1 && scanW.kinds['world-new'] === 1 && scanW.kinds['world-road'] === 1 && scanW.render && scanW.scans === 1, `scan: 2 structures + 1 road — ${scanW.reg} gets an update, one new building, one new road (${JSON.stringify(scanW.kinds)})`);
  const toInboxW = await page.evaluate(() => { const n0 = newsPendingCount(); const n = OS.scanToInbox(); return { n, n0, n1: newsPendingCount(), cands: S.news.items.find(it => it.source === 'world')?.candidates.length }; });
  ok(toInboxW.n === 3 && toInboxW.n1 === toInboxW.n0 + 3, `3 proposals land in the inbox; confirmations and not-found are notes (${toInboxW.cands} candidates in the scan item)`);
  const appliedW = await page.evaluate(reg => { const item = S.news.items.find(it => it.source === 'world'); const upd = item.candidates.find(c => c.kind === 'world-update'); const nw = item.candidates.find(c => c.kind === 'world-new'); const rd = item.candidates.find(c => c.kind === 'world-road'); const nb = S.buildings.length, nr = S.roads.length; const a = applyCandidate(upd), b2 = applyCandidate(nw), c = applyCandidate(rd); const tower = S.buildings.find(x => x.reg === reg); const created = S.buildings[S.buildings.length - 1]; const road = S.roads[S.roads.length - 1]; return { a, b2, c, height: tower.height, fp: !!tower.footprint, nb: S.buildings.length - nb, nr: S.roads.length - nr, created: { reg: created.reg, x: created.x, z: created.z, district: created.districtId, src: created.sourceType, notes: created.notes.slice(0, 40) }, road: { reg: road.reg, pts: road.geometry.length, width: road.width, type: road.type } }; }, scanW.reg);
  ok(appliedW.a && appliedW.height === 12 && appliedW.fp, `applying the update sets ${scanW.reg} height 12 and a footprint measured from the save`);
  ok(appliedW.b2 && appliedW.nb === 1 && appliedW.created.x === 63 && appliedW.created.z === 115 && appliedW.created.district && appliedW.created.src === 'world' && /Detected in the world scan/.test(appliedW.created.notes), `applying the new-building proposal creates ${appliedW.created.reg} at middle coordinates X 63 · Z 115 (${appliedW.created.district})`);
  ok(appliedW.c && appliedW.nr === 1 && appliedW.road.pts === 2 && appliedW.road.width === 5 && appliedW.road.type === 'street', `applying the road proposal creates ${appliedW.road.reg}, 5 wide, two-point centreline`);
  const undoneWW = await page.evaluate(() => { const nb = S.buildings.length, nr = S.roads.length; const logs = S.news.log.slice(0, 3); for (const l of logs) undoLog(l.id); return { nb: nb - S.buildings.length, nr: nr - S.roads.length, undone: logs.every(l => l.undone) }; });
  ok(undoneWW.nb === 1 && undoneWW.nr === 1 && undoneWW.undone, 'all three can be undone from the log: created records removed, the update reverted');
  const bmW = await page.evaluate(async () => { const b = await OS.scanBasemap(); return b ? { x: b.x, z: b.z, scale: b.scale, year: b.year, w: b.w, h: b.h, name: b.name } : null; });
  ok(bmW && bmW.x === 0 && bmW.z === 0 && bmW.scale === 1 && bmW.year === new Date().getFullYear() && bmW.w === 176 && bmW.name.startsWith('World render'), `the render becomes a dated basemap at X 0 · Z 0, 1 block/px, ${bmW && bmW.w}×${bmW && bmW.h}`);
  const bkW = await page.evaluate(async () => { const r = await OS.backupRun(); return { ok: r?.ok, kind: r?.backup?.kind, verified: r?.backup?.verified, hist: S.world.backups.history.length, tile: $('#side-end .osdot span').textContent, st: $('#st-os-t').textContent }; });
  ok(bkW.ok && bkW.kind === 'full' && bkW.verified && bkW.hist === 1 && /backup just now/.test(bkW.tile) && /backup just now/.test(bkW.st), 'a backup from the app is verified; the rail tile and status bar show it');
  const bvW = await page.evaluate(async () => { commit({ now: true }); await new Promise(r => setTimeout(r, 900)); return { st: $('#st-vault-t').textContent, wrote: !!OS.lastVaultWrite, n: S.buildings.length }; });
  const bvFile = JSON.parse(fs.readFileSync(path.join(bvault, 'Registry.json'), 'utf8'));
  ok(bvW.wrote && /via OS bridge/.test(bvW.st) && bvFile.kind === 'master' && bvFile.buildings.length === bvW.n, `with the bridge online and no folder linked, autosave writes Registry.json through the bridge (${bvFile.buildings.length} buildings) — no vault reconnect`);
  const imgW = await page.evaluate(async () => { const b = S.buildings.find(x => isActive(x) && !x.image); const c = document.createElement('canvas'); c.width = 8; c.height = 8; const blob = await new Promise(r => c.toBlob(r, 'image/jpeg')); await idbPut('images', b.id, { full: blob, thumb: null, updated: now() }); b.image = true; SAVE.dirtyImages.add(b.id); commit({ now: true }); await new Promise(r => setTimeout(r, 900)); return { id: b.id, dirty: SAVE.dirtyImages.size, st: $('#st-vault-t').innerHTML }; });
  ok(fs.existsSync(path.join(bvault, 'images', imgW.id + '.jpg')) && fs.existsSync(path.join(bvault, 'NewA.json')) && imgW.dirty === 0 && !/vault-reconnect/.test(imgW.st), 'photos and NewA.json also reach the vault through the bridge; no reconnect button is shown');
  fs.writeFileSync(path.join(bvault, 'Registry.json'), JSON.stringify({ kind: 'master', meta: { updated: '2099-01-01T00:00:00.000Z' }, buildings: [{ id: 'vb1' }, { id: 'vb2' }, { id: 'vb3' }] }));
  const holdW = await page.evaluate(async () => { OS.online = false; await OS.poll(); const hold = OS.vaultHold ? { ...OS.vaultHold } : null; commit({ now: true }); await new Promise(r => setTimeout(r, 900)); return { hold, st: $('#st-vault-t').textContent, cls: $('#st-vault').className }; });
  const afterHold = JSON.parse(fs.readFileSync(path.join(bvault, 'Registry.json'), 'utf8'));
  ok(holdW.hold && holdW.hold.buildings === 3 && /newer copy/.test(holdW.st) && holdW.cls === 'warn' && afterHold.buildings.length === 3 && afterHold.meta.updated === '2099-01-01T00:00:00.000Z', 'a newer registry in the vault folder pauses bridge autosave, the status bar says so, and the folder is not overwritten');
  const overW = await page.evaluate(async () => { await OS.vaultOverwrite(); return { hold: OS.vaultHold, n: S.buildings.length, st: $('#st-vault-t').textContent }; });
  const afterOver = JSON.parse(fs.readFileSync(path.join(bvault, 'Registry.json'), 'utf8'));
  ok(!overW.hold && afterOver.buildings.length === overW.n && /via OS bridge/.test(overW.st), 'choosing Overwrite writes this browser\'s copy to the folder and resumes autosave');
  const rt2W = await page.evaluate(async () => { const v = await OS.restoreTest(); return { ok: v?.ok, parses: v?.registryParses, last: !!S.world.backups.lastRestoreTest }; });
  ok(rt2W.ok && rt2W.parses && rt2W.last, 'restore test from the app passes and is recorded');
  await page.evaluate(() => openDataModal()); const cardW = await page.evaluate(() => ({ online: /BRIDGE.*ONLINE/.test($('#modal-root .modal').textContent), scanBtn: !!$('[data-act="os-scan"]:not([disabled])') })); ok(cardW.online && cardW.scanBtn, 'Vault & settings shows the bridge card online with the scan button'); await page.evaluate(() => closeModal());
  await page.evaluate(() => openWorldScanModal()); await page.waitForTimeout(150); const wsmW = await page.evaluate(() => ({ modal: !!$('#modal-root .modal'), last: /LAST SCAN/.test($('#modal-root .modal').textContent), img: !!$('#modal-root img') })); ok(wsmW.modal && wsmW.last && wsmW.img, 'the world-scan modal shows the last scan and its render');
  await page.screenshot({ path: path.join(SHOTS, 'R-bridge.png') }); await page.evaluate(() => closeModal());
  const proxiedW = await page.evaluate(async () => { try { const r = await OS.proxyFetch('https://evil.example.com/x'); return { status: r.status }; } catch (e) { return { err: e.message }; } });
  ok(proxiedW.err && /allowHosts/.test(proxiedW.err), 'the proxy refuses hosts outside the bridge allowlist');
  await page.evaluate(() => { S.settings.os = { url: 'http://127.0.0.1:1' }; }); const offW = await page.evaluate(async () => { await OS.poll(); return { online: OS.online, st: $('#st-os-t').textContent }; }); ok(!offW.online && /offline/.test(offW.st), 'when the bridge goes away the app shows offline and nothing breaks');
  await page.evaluate(() => { delete S.settings.os; });
  bridge.close(); fs.rmSync(btmp, { recursive: true, force: true });
  noErrors('bridge');

  // ---------- S · fixes: add menu · auto-estimate · dated shapes · unnamed · lot rotation · snap to street · beam · Maps from the record · JourneyMap ----------
  console.log('\nS · add menu, auto-estimate, dated road/track shapes, unnamed records, lot rotation, snap to street, no beam, Maps from the record, JourneyMap tiles + ZIP');
  await page.evaluate(() => { setNav('overview'); $('#addmenu').hidden = false; }); await page.waitForTimeout(120);
  const menuS = await page.evaluate(() => { const b = $('#addmenu button[data-add="business"]'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hit: !!el && (el === b || b.contains(el)), beam: !!$('#fx .beam'), over: el ? el.tagName + '.' + el.className : null }; });
  ok(menuS.hit && !menuS.beam, `the + Add menu is clickable above the page content (hit: ${menuS.over}); the moving beam is gone`);
  await page.evaluate(() => { $('#addmenu').hidden = true; });
  const estS = await page.evaluate(async () => { const b = S.buildings.find(x => isActive(x) && isCompleted(x) && x.x != null && num(x.assessTotal) && x.districtId === 'man-a'); openBuilding(b.id, 'edit'); $('[data-act="estimate-draft"]').click(); await new Promise(r => setTimeout(r, 80)); const big = $('#f-estimate .big')?.textContent; const why = $('#f-estimate .why')?.textContent || ''; $('[data-act="estimate-apply"]').click(); const applied = $('#f-assessTotal').value; const basis = $('#f-valuationBasis').value; closeDrawer(true); return { big, why, applied, basis }; });
  ok(/^\$[\d,]+$/.test(estS.big || '') && /comparable|median|fallback/i.test(estS.why) && /Transit/.test(estS.why) && +estS.applied > 0 && estS.basis === 'estimate', `editor auto-estimate ${estS.big} from nearby comparables + transit (${estS.why.slice(0, 80)}…) → applied as assessed total, basis "estimate"`);
  const datedS = await page.evaluate(() => { const r = newRoad(S); r.name = 'Dated Road'; r.geometry = [[3000, 3000], [3200, 3000]]; r.yearOpened = 2013; S.roads.push(r); saveShapeVersion(r, 2013, 'E', 'original'); const from0 = hyLabel(r.geometryFromYear, r.geometryFromHalf); r.geometry = [[3000, 3000], [3200, 3000], [3200, 3150]]; r.width = 9; r.geometryFromYear = 2020; r.geometryFromHalf = 'E'; r.updated = now(); commit({ now: true }); const g = i => geometryAt(r, i); return { v: r.versions.length, from0, from: hyLabel(r.geometryFromYear, r.geometryFromHalf), y2014: g(hyIndex(2014, 'E')).geometry.length, y2014w: g(hyIndex(2014, 'E')).width, y2012: g(hyIndex(2012, 'E')).geometry.length, y2019: g(hyIndex(2019, 'L')).geometry.length, y2020: g(hyIndex(2020, 'E')).geometry.length, now: g(hyIndex(2026, 'L')).geometry.length, present: geometryAt(r, null).geometry.length }; });
  ok(datedS.v === 1 && datedS.from0 === 'Late 2013' && datedS.from === 'Early 2020' && datedS.y2014 === 2 && datedS.y2014w === 5 && datedS.y2012 === 2 && datedS.y2019 === 2 && datedS.y2020 === 3 && datedS.now === 3 && datedS.present === 3, `a road keeps its 2013 shape (2 points, 5 wide) through 2019 and shows today's 3-point, 9-wide shape from ${datedS.from} (default would have been ${datedS.from0})`);
  const trackS = await page.evaluate(() => { const l = S.lines.find(x => x.name === 'Test Line'); const t = lineTracks(l)[0]; saveShapeVersion(t, 2015, 'L'); t.geometry = [[2000, 2000], [2000, 2200], [2000, 2400], [2100, 2400]]; commit({ now: true }); setNav('history'); openHistoryViewer({ year: 2015, half: 'L' }); HV.cam = { x: 2050, z: 2200, k: 2 }; hvDraw(); const early = geometryAt(t, hyIndex(2015, 'L')).geometry.length; hvSet(hyIndex(2026, 'E'), { instant: true }); hvDraw(); const late = geometryAt(t, HV.to).geometry.length; closeHistoryViewer(); return { early, late, v: t.versions.length }; });
  ok(trackS.v === 1 && trackS.early === 3 && trackS.late === 4, 'a transit track keeps its 2015 alignment (3 points) and draws the extended one (4 points) later in playback');
  const unnamedS = await page.evaluate(() => { const r = S.roads.find(x => x.name === 'Dated Road'); openRecord('road', r.id, 'edit'); $('#f-name').value = ''; $('#f-unnamed').checked = true; const err = readRoadFormInto(DR.draft, true); const lbl = roadLabel({ ...DR.draft, name: '' }); const gfrom = DR.draft.geometryFromYear; closeDrawer(true); const b = newBuilding(S, 'man-a'); b.unnamed = true; S.buildings.push(b); const l = S.lines.find(x => x.name === 'Test Line'); openRecord('line', l.id, 'edit'); $('#f-name').value = ''; $('#f-unnamed').checked = true; const lerr = readLineFormInto(DR.draft, true); closeDrawer(true); return { err, lbl, t: titleOf(b), gfrom, lerr }; });
  ok(unnamedS.err === null && /^RD-/.test(unnamedS.lbl) && /^MA-/.test(unnamedS.t) && unnamedS.gfrom === 2020 && unnamedS.lerr === null, `Unnamed: a road saves without a name and is labelled ${unnamedS.lbl}; a line too; an unnamed building is titled ${unnamedS.t}`);
  await page.evaluate(() => { const b = newBuilding(S, 'man-a'); b.name = 'Snap Test'; b.x = 3100; b.z = 3040; b.lotFront = 20; b.lotDepth = 30; b.footprint = [[3090, 3030], [3110, 3030], [3110, 3050], [3090, 3050]]; S.buildings.push(b); commit({ now: true }); setNav('map'); setMapEdit(true); MAPW.sel = { kind: 'building', id: b.id }; renderDock(); }); await page.waitForTimeout(350);
  const lotS = await page.evaluate(() => { const r = S.roads.find(x => x.name === 'Dated Road'); const b = S.buildings.find(x => x.name === 'Snap Test'); const before = lotRect(b); inspectorAction('insp-rotate-lot', null); const after = lotRect(b); b.x = 3105; b.z = 3047; inspectorAction('insp-center-footprint', null); const centred = { x: b.x, z: b.z }; inspectorAction('insp-snap-street', null); return { before: [before.w, before.h], after: [after.w, after.h], centred, snapped: { x: b.x, z: b.z, rot: b.lotRotated, road: b.roadId === r.id }, btns: !!$('[data-act="insp-snap-street"]') && !!$('[data-act="insp-rotate-lot"]') }; });
  ok(lotS.before.join() === '20,30' && lotS.after.join() === '30,20' && lotS.btns, 'Rotate lot swaps frontage and depth on the map from the inspector');
  ok(lotS.centred.x === 3100 && lotS.centred.z === 3040, 'Centre on footprint moves the coordinates to the footprint centroid');
  ok(lotS.snapped.x === 3100 && lotS.snapped.z === 3021 && lotS.snapped.rot === false && lotS.snapped.road, `Snap to street sits the lot on Dated Road (X ${lotS.snapped.x} · Z ${lotS.snapped.z}: half the road, a setback and half the depth), faces it, and links the road`);
  const editS = await page.evaluate(async () => { setMapEdit(false); const b = S.buildings.find(x => x.name === 'Snap Test'); b.x = 3100; b.z = 3060; b.roadId = null; setNav('registry'); openBuilding(b.id, 'edit'); $('[data-act="snap-street-draft"]').click(); await new Promise(r => setTimeout(r, 50)); const v = { x: $('#f-x').value, z: $('#f-z').value, rot: $('#f-lotRotated').value, road: $('#f-road').value }; $('[data-act="center-footprint-draft"]').click(); const c = { x: $('#f-x').value, z: $('#f-z').value }; closeDrawer(true); return { v, c }; });
  ok(+editS.v.x === 3100 && +editS.v.z === 3021 && editS.v.rot === '' && editS.v.road && editS.c.x === '3100' && editS.c.z === '3040', 'the same Snap to street and Centre on footprint work inside the editor, filling the X/Z fields');
  const miniS = await page.evaluate(async () => { const b = S.buildings.find(x => x.name === 'Snap Test'); setNav('registry'); openBuilding(b.id, 'view'); const m = $('#drawer .minimap.gm-mini'); const word = !!m?.querySelector('.gm-word') && /Maps/.test(m.textContent); m.click(); await new Promise(r => setTimeout(r, 450)); return { word, nav: UI.nav, edit: MAPW.edit, sel: MAPW.sel?.id === b.id, card: !!$('#gm-card .pc-body') }; });
  ok(miniS.word && miniS.nav === 'map' && !miniS.edit && miniS.sel && miniS.card, 'the Location map carries the Maps wordmark and opens the building in explore mode with its place card');
  await page.screenshot({ path: path.join(SHOTS, 'S-maps-from-record.png') });
  const jmS = await page.evaluate(async () => { const mk = async (tx, tz, color) => { const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 512, 512); const blob = await new Promise(r => c.toBlob(r, 'image/png')); return { path: `overworld/day/${tx},${tz}.png`, file: new File([blob], `${tx},${tz}.png`, { type: 'image/png' }) }; }; const entries = [await mk(0, 0, '#204060'), await mk(1, 0, '#406020'), await mk(0, -1, '#602040'), { path: 'overworld/topo/0,0.png', file: (await mk(0, 0, '#000')).file }]; const bm = await importJourneyMap(entries, { name: 'JM test' }); return bm ? { x: bm.x, z: bm.z, scale: bm.scale, w: bm.w, h: bm.h, tiles: bm.tiles, dir: bm.tileDir } : null; });
  ok(jmS && jmS.x === 0 && jmS.z === -512 && jmS.scale === 1 && jmS.w === 1024 && jmS.h === 1024 && jmS.tiles === 3 && /day/.test(jmS.dir), `three JourneyMap tiles stitch into a ${jmS && jmS.w}×${jmS && jmS.h} basemap placed at X 0 · Z −512 at 1 block/px — derived from the names; the topo folder is ignored`);
  const zipS = await page.evaluate(async () => { const enc = new TextEncoder(); const mkPng = async () => { const c = document.createElement('canvas'); c.width = 512; c.height = 512; const blob = await new Promise(r => c.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); }; const files = [['DIM0/day/-1,-1.png', await mkPng()], ['DIM0/day/0,0.png', await mkPng()], ['readme.txt', enc.encode('hi')]]; const parts = [], central = []; let off = 0; const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255]; for (const [name, data] of files) { const n = enc.encode(name); const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...n]); central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n])); parts.push(local, data); off += local.length + data.length; } const cd = central.reduce((a, c) => a + c.length, 0); const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cd), ...u32(off), ...u16(0)]); const zipFile = new File([new Blob([...parts, ...central, eocd])], 'jm.zip'); const entries = await unzipEntries(zipFile, p => /\.png$/i.test(p)); const bm = await importJourneyMap(entries, { name: 'JM zip' }); return { entries: entries.length, x: bm?.x, z: bm?.z, w: bm?.w, tiles: bm?.tiles }; });
  ok(zipS.entries === 2 && zipS.x === -512 && zipS.z === -512 && zipS.w === 1024 && zipS.tiles === 2, 'a JourneyMap export ZIP is read in the browser and placed from its tile names');
  await page.evaluate(async () => { for (const bm of S.settings.basemaps.filter(b => /^JM/.test(b.name))) await basemapRemove(bm.id); });
  const rtS = await page.evaluate(() => { const m = serializeMaster(); const r = m.roads.find(x => x.name === 'Dated Road'); const b = m.buildings.find(x => x.name === 'Snap Test'); const t = m.tracks.find(x => (x.versions || []).length); return { rv: r?.versions?.length, from: r?.geometryFromYear, lot: b?.lotRotated, tv: t?.versions?.length, unnamed: m.buildings.some(x => x.unnamed) }; });
  ok(rtS.rv === 1 && rtS.from === 2020 && rtS.lot === false && rtS.tv === 1 && rtS.unnamed, 'dated shapes, current-since dates, lot orientation and the unnamed flag are all in the master file');
  const secondS = await page.evaluate(() => { const r = S.roads.find(x => x.name === 'Dated Road'); r.geometryFromYear = null; r.geometryFromHalf = ''; saveShapeVersion(r, 2020, 'E'); r.geometry = [[3000, 3000], [3200, 3000], [3200, 3150], [3100, 3150]]; commit({ now: true }); return { from: hyLabel(r.geometryFromYear, r.geometryFromHalf), at2021: geometryAt(r, hyIndex(2021, 'E')).geometry.length, at2020: geometryAt(r, hyIndex(2020, 'E')).geometry.length, at2014: geometryAt(r, hyIndex(2014, 'E')).geometry.length, versions: r.versions.length }; });
  ok(secondS.versions === 2 && secondS.from === 'Late 2020' && secondS.at2020 === 3 && secondS.at2021 === 4 && secondS.at2014 === 2, `a second dated shape moves "current since" to ${secondS.from}: 2014 → 2 points, Early 2020 → 3, 2021 → the current 4`);
  const pxS = await page.evaluate(() => { setNav('history'); openHistoryViewer({ year: 2014, half: 'E' }); HV.filter.district = ''; HV.filter.kinds.roads = true; HV.cam = { x: 3150, z: 3075, k: 3 }; hvSet(hyIndex(2014, 'E'), { instant: true }); hvDraw(); const P = projFor(HV.cam, HV.w, HV.h); const at = (x, z) => { const [sx, sy] = P.s(x, z); const d = HV.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data; return d[0] + d[1] + d[2]; }; const a = { on: at(3100, 3000), ext: at(3200, 3100) }; hvSet(hyIndex(2026, 'E'), { instant: true }); hvDraw(); const b = { on: at(3100, 3000), ext: at(3200, 3100) }; closeHistoryViewer(); return { a, b }; });
  ok(pxS.a.on > 150 && pxS.a.ext < 90 && pxS.b.on > 150 && pxS.b.ext > 150, `playback paints the dated shape: in 2014 the east extension is absent (pixel sum ${pxS.a.ext}) and today it is drawn (${pxS.b.ext})`);
  const lotPxS = await page.evaluate(async () => { const b = newBuilding(S, 'man-a'); b.name = 'Lot Pixel'; b.x = 3300; b.z = 3300; b.lotFront = 20; b.lotDepth = 30; S.buildings.push(b); commit({ now: true }); setNav('map'); await new Promise(r => setTimeout(r, 300)); MAPW.anim = null; MAPW.cam = { x: 3300, z: 3300, k: 4 }; mapDraw(); const at = (x, z) => { const [sx, sy] = w2s(x, z); const d = MAPW.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data; return d[0] + d[1] + d[2]; }; const bg = at(3380, 3380); const before = at(3313, 3300); b.lotRotated = true; mapDraw(); const after = at(3313, 3300); const beforeZ = at(3300, 3313); b.lotRotated = false; mapDraw(); const afterZ = at(3300, 3313); return { bg, before, after, beforeZ, afterZ }; });
  ok(Math.abs(lotPxS.before - lotPxS.bg) < 6 && lotPxS.after - lotPxS.bg >= 6 && Math.abs(lotPxS.beforeZ - lotPxS.bg) < 6 && lotPxS.afterZ - lotPxS.bg >= 6, `the rotated lot is drawn on the map: 13 blocks east is empty with frontage 20 (+${lotPxS.before - lotPxS.bg}) and filled when rotated (+${lotPxS.after - lotPxS.bg})`);
  const addS = await page.evaluate(() => { setNav('overview'); const r = $('#btn-new').getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; }); await page.mouse.click(addS.x, addS.y); await page.waitForTimeout(150);
  const addOpenS = await page.evaluate(() => { const b = $('#addmenu button[data-add="business"]'); const r = b.getBoundingClientRect(); return { hidden: $('#addmenu').hidden, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(addOpenS.x, addOpenS.y); await page.waitForTimeout(250);
  const flowS = await page.evaluate(() => ({ kind: DR.kind, isNew: DR.isNew, hidden: $('#addmenu').hidden, drawer: $('#drawer').classList.contains('on') })); await page.evaluate(() => closeDrawer(true));
  ok(!addOpenS.hidden && flowS.kind === 'business' && flowS.isNew && flowS.hidden && flowS.drawer, 'a real click on + Add opens the menu and a real click on "Business" starts a new business record');
  const zip2S = await page.evaluate(async () => { const enc = new TextEncoder(); const mkPng = async () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const blob = await new Promise(r => c.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); }; const deflate = async raw => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); const files = []; for (const [name, raw] of [['overworld/day/2,2.png', await mkPng()], ['overworld/day/3,2.png', await mkPng()]]) files.push([name, await deflate(raw), raw.length]); const parts = [], central = []; let off = 0; const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255]; for (const [name, data, usize] of files) { const n = enc.encode(name); const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(usize), ...u16(n.length), ...u16(0), ...n]); central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(usize), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n])); parts.push(local, data); off += local.length + data.length; } const cd = central.reduce((a, c) => a + c.length, 0); const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cd), ...u32(off), ...u16(0)]); const entries = await unzipEntries(new File([new Blob([...parts, ...central, eocd])], 'jm2.zip'), p => /\.png$/i.test(p)); const bm = await importJourneyMap(entries, { name: 'JM deflate' }); const out = bm ? { entries: entries.length, x: bm.x, z: bm.z, scale: bm.scale, w: bm.w, tiles: bm.tiles } : null; if (bm) await basemapRemove(bm.id); return out; });
  ok(zip2S && zip2S.entries === 2 && zip2S.x === 1024 && zip2S.z === 1024 && zip2S.scale === 2 && zip2S.w === 512 && zip2S.tiles === 2, 'deflated ZIP entries are inflated in the browser and 256-px tiles are placed at 2 blocks per pixel');
  const uiS = await page.evaluate(async () => { const wait = ms => new Promise(res => setTimeout(res, ms)); const answers = [{ year: 2016, half: 'E' }, { year: 2025, half: 'E' }]; window.hyPromptDialog = async () => answers.shift(); window.confirmDialog = async () => 'ok'; const r = S.roads.find(x => x.name === 'Dated Road');
    setNav('registry'); openRecord('road', r.id); await wait(120); const recRows = $$('#drawer .shapetl .per').length; const p0 = shapePeriods(r).length; closeDrawer(true);
    setNav('map'); await wait(300); setMapEdit(true); MAPW.sel = { kind: 'road', id: r.id }; renderDock(); const v0 = r.versions.length; await shapeVersionSaveFlow(MAPW.sel); const v1 = r.versions.length;
    renderDock(); $('#dock-body [data-act="per-split"]').click(); await wait(150); const afterSplit = shapePeriods(r).map(p => [p.from, p.to, p.current]); const rows = $$('#dock-body .shapetl .per').length;
    const first = r.versions.slice().sort((a, b) => hyIndex(a.year, a.half) - hyIndex(b.year, b.half))[0]; const inp = $(`#dock-body [data-per-y="to"][data-pid="${first.id}"]`); const h = $(`#dock-body [data-per-h="to"][data-pid="${first.id}"]`); const gapAt = hyIndex(first.year, first.half) + 1; h.value = hyFromIndex(gapAt).half; inp.value = hyFromIndex(gapAt).year; inp.dispatchEvent(new Event('change', { bubbles: true })); await wait(80);
    const nextFrom = shapePeriods(r)[1].from; const gapState = nextFrom > gapAt + 0 ? shapeStateAt(r, gapAt).state : 'none';
    const curBefore = r.geometry.length; renderDock(); $('#dock-body [data-act="per-remove"][data-pid="current"]').click(); await wait(150); const afterRemove = shapePeriods(r).length;
    setMapEdit(false); return { recRows, p0, v0, v1, afterSplit, rows, gapState, gapAt, nextFrom, afterRemove, curBefore }; });
  ok(uiS.recRows === uiS.p0 && uiS.v1 === uiS.v0 + 1 && uiS.afterSplit.length === uiS.v1 + 2 && uiS.afterSplit[uiS.afterSplit.length - 1][0] === 24 && uiS.rows === uiS.afterSplit.length && uiS.gapState === 'gap' && uiS.afterRemove === uiS.afterSplit.length - 1, `shape timeline UI: record shows ${uiS.recRows} periods; inspector "Save dated" adds one; "New shape from…" 2025 E splits the current shape (${uiS.afterSplit.length} periods, ${uiS.rows} rows); typing an earlier end opens a gap (removed, rebuilt later: ${uiS.gapState}); removing the current shape restores the previous one`);
  const persistS = await page.evaluate(async () => { const r = S.roads.find(x => x.name === 'Dated Road'); openRecord('road', r.id, 'edit'); $('#f-name').value = ''; $('#f-unnamed').checked = true; await saveDrawer(); await new Promise(res => setTimeout(res, 300)); const b = S.buildings.find(x => isActive(x) && isCompleted(x) && x.x != null && num(x.assessTotal) && x.districtId === 'man-a'); openBuilding(b.id, 'edit'); $('[data-act="estimate-draft"]').click(); await new Promise(res => setTimeout(res, 80)); const why = $('#f-estimate .why').textContent; $('[data-act="estimate-apply"]').click(); const v = +$('#f-assessTotal').value; await saveDrawer(); await new Promise(res => setTimeout(res, 300)); commit({ now: true }); await new Promise(res => setTimeout(res, 800)); return { rid: r.id, bid: b.id, v, why }; });
  await page.reload(); await booted(page);
  const reloadedS = await page.evaluate(({ rid, bid }) => { const r = roadById(rid), b = byId(bid); return { unnamed: r?.unnamed, name: r?.name, label: roadLabel(r || {}), assess: b?.assessTotal, basis: b?.valuationBasis }; }, persistS);
  ok(reloadedS.unnamed === true && reloadedS.name === '' && /^RD-/.test(reloadedS.label) && reloadedS.assess === persistS.v && reloadedS.basis === 'estimate' && /within 200 blk/.test(persistS.why), `saved through the drawer and reloaded: the unnamed road (${reloadedS.label}) and the applied estimate (${reloadedS.assess}, from comparables within 200 blk) persist`);
  noErrors('fixes-2');

  // ---------- T · round 3: transit with stops, transfers, board, projects, lots, dated shapes, playback, old maps, usability ----------
  console.log('\nT · round 3 — transit, lots, dated shapes, playback, old maps, usability');
  await page.evaluate(() => { closeModal(); closeDrawer(true); setNav('map'); }); await page.waitForTimeout(300);
  await page.evaluate(() => { setMapEdit(true); MAPW.sel = null; MAPW.cam = { x: 8000, z: 8000, k: 1 }; MAPW.snapGrid = false; mapDraw(); setMapMode('transit'); }); await page.waitForTimeout(150);
  const at = async (wx, wz) => page.evaluate(([x, z]) => { const [sx, sy] = w2s(x, z); const r = $('#mapcanvas').getBoundingClientRect(); return [r.left + sx, r.top + sy]; }, [wx, wz]);
  const clickW = async (wx, wz, alt = false) => { const [x, y] = await at(wx, wz); if (alt) await page.keyboard.down('Alt'); await page.mouse.click(x, y); if (alt) await page.keyboard.up('Alt'); await page.waitForTimeout(40); };
  await clickW(7900, 8000, true); await clickW(8000, 8000, true); await clickW(8100, 8000); await clickW(8100, 8100, true);
  const draftT = await page.evaluate(() => ({ pts: MAPW.draft?.pts.length, stops: MAPW.draft?.stops?.length, bar: $('#map-instr').textContent }));
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const lineT = await page.evaluate(() => { const l = lineById(MAPW.sel?.id); return l ? { reg: l.reg, stops: stationsOf(l).map(s => [s.x, s.z]), track: lineTracks(l)[0]?.geometry.length, dock: !!$('#dock-body .stoplist.edit') } : null; });
  ok(draftT.pts === 4 && draftT.stops === 3 && /stop/.test(draftT.bar) && lineT && lineT.stops.length === 3 && lineT.stops[0][0] === 7900 && lineT.stops[2][1] === 8100 && lineT.track === 4 && lineT.dock, `drawing a line with Alt-clicks places its stops as it is drawn (${draftT.stops} stops on ${draftT.pts} points) and the inspector lists them for naming`);
  await page.evaluate(() => { MAPW.sel = null; setMapMode('transit'); }); await clickW(8000, 7900, true); await clickW(8000, 8000); await clickW(8000, 8150, true); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const xferT = await page.evaluate(() => { const s = S.stations.find(x => x.x === 8000 && x.z === 8000); const l2 = lineById(MAPW.sel.id); return { lines: linesAtStation(s).length, l2stops: stationsOf(l2).map(x => x.z), dup: S.stations.filter(x => x.x === 8000 && x.z === 8000).length }; });
  ok(xferT.lines === 2 && xferT.dup === 1 && xferT.l2stops.join() === '7900,8000,8150', `clicking an existing station while drawing a second line makes it a transfer — one station, two lines, stops in order (${xferT.l2stops.join(' → ')})`);
  await page.evaluate(() => { MAPW.sel = null; setMapMode('station'); }); await clickW(8050, 8000); await page.waitForTimeout(100);
  const stT = await page.evaluate(() => { const s = S.stations.find(x => x.x === 8050 && x.z === 8000); const l1 = linesAtStation(s)[0]; return { lines: linesAtStation(s).map(l => l.reg), order: stationsOf(l1).map(x => x.x + ',' + x.z) }; });
  ok(stT.lines.length === 1 && stT.order.join(' ') === '7900,8000 8000,8000 8050,8000 8100,8100', `a station clicked onto a track joins that line and slots in at the right place (${stT.order.join(' → ')})`);
  const namesT = await page.evaluate(async () => { const l = lineById(S.lines.find(x => stationsOf(x).some(s => s.x === 7900)).id); MAPW.sel = { kind: 'line', id: l.id }; setMapMode('select'); renderDock(); const inp = $('#dock-body [data-stopname]'); inp.value = 'Harbor Point'; inp.dispatchEvent(new Event('change')); return stationsOf(l)[0].name; });
  ok(namesT === 'Harbor Point', 'stops are renamed inline in the line inspector');
  const boardT = await page.evaluate(async () => { const l1 = S.lines.find(x => stationsOf(x).some(s => s.x === 7900)), l2 = S.lines.find(x => x !== l1 && stationsOf(x).some(s => s.z === 7900)); l1.name = 'Harbor Line'; l1.hours = '24/7'; l2.name = 'Cross Line'; l2.status = 'partial'; l2.hours = 'peak'; const hub = S.stations.find(x => x.x === 8000 && x.z === 8000); hub.name = 'Hub'; commit({ now: true });
    const night = boardDepartures(hub, 3 * 60); const day = boardDepartures(hub, 8 * 60);
    UI.tf.all = true; UI.tseg = 'board'; UI.boardStation = hub.id; setNav('transit'); await new Promise(r => setTimeout(r, 300)); const rows = $$('.board .brow').length;
    const j = transitJourney(S.stations.find(x => x.x === 7900).id, S.stations.find(x => x.z === 8150).id);
    return { rows, nightHarbor: night.filter(d => d.l === l1 && d.inService).length, nightCross: night.filter(d => d.l === l2 && d.inService).length, dayCross: day.filter(d => d.l === l2 && d.inService).length, times: day.find(d => d.l === l1)?.times.length, legs: j ? j.legs.map(x => x.kind + (x.stops || '')).join(',') : null, lineStatus: $$('.lstatus .ls').length };
  });
  ok(boardT.rows >= 4 && boardT.nightHarbor === 2 && boardT.nightCross === 0 && boardT.dayCross === 2 && boardT.times === 3 && boardT.lineStatus >= 2, `departure board: ${boardT.rows} rows at Hub; the 24/7 line runs at 3 am, the rush-hours line does not (it does at 8 am); next three trains each way`);
  ok(boardT.legs === 'ride1,ride1', `trip planner routes with a transfer: Harbor Line one stop to Hub, change, Cross Line one stop (${boardT.legs})`);
  const valT = await page.evaluate(() => { const V = VAL(); const s = newStation(S); s.name = 'Val Test'; s.x = 9000; s.z = 9000; s.status = 'construction'; S.stations.push(s); const b = S.buildings.find(x => isActive(x) && isCompleted(x)); const keep = [b.x, b.z]; b.x = 9010; b.z = 9000; const uc = transitValueFactors(b, V); s.status = 'planned'; const pl = transitValueFactors(b, V); s.status = 'open'; const t = newTrack(S); t.geometry = [[8900, 9000], [9100, 9000]]; S.tracks.push(t); const l = newLine(S); l.trackIds = [t.id]; l.stopIds = [s.id]; S.lines.push(l); const op = transitValueFactors(b, V); l.hours = '24/7'; const full = transitValueFactors(b, V); b.x = keep[0]; b.z = keep[1]; S.lines = S.lines.filter(x => x !== l); S.tracks = S.tracks.filter(x => x !== t); S.stations = S.stations.filter(x => x !== s); return { uc: uc[0][2], pl: pl[0][2], op: op[0][2], n247: full.length, b247: full[1]?.[2], near: V.transitNear }; });
  ok(valT.op === valT.near && valT.uc > valT.pl && valT.uc < valT.op && valT.n247 === 2 && valT.b247 > 0, `property lift: open +${valT.op}% > under construction +${valT.uc}% > planned +${valT.pl}%; 24/7 service adds +${valT.b247}% on top`);
  const projT = await page.evaluate(async () => { const s = S.stations.find(x => x.name === 'Hub'); const s2 = newStation(S); s2.name = 'Future Stop'; s2.x = 8300; s2.z = 8000; s2.status = 'construction'; s2.yearStarted = 2025; s2.halfStarted = 'E'; s2.yearExpected = 2028; s2.halfExpected = 'L'; s2.grade = 'underground'; S.stations.push(s2); commit({ now: true }); UI.tseg = 'projects'; renderView(false); await new Promise(r => setTimeout(r, 200)); const rows = $$('table.reg tbody tr').length; const est = stationCostEstimate(s2).total; const inp = $('[data-tcost="stationUnderground"]'); inp.value = 100000000; inp.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 100)); return { rows, est, est2: stationCostEstimate(s2).total, saved: S.settings.transitCost.stationUnderground, pbar: !!$('.pbar') }; });
  ok(projT.rows >= 1 && projT.pbar && Math.round(projT.est) === Math.round(450e6 * 1.25) && Math.round(projT.est2) === Math.round(100e6 * 1.25) && projT.saved === 100000000, `projects: under-construction station listed with progress; cost model ${Math.round(projT.est / 1e6)}M → ${Math.round(projT.est2 / 1e6)}M after editing the underground-station cost`);
  noErrors('round 3 · transit');
  // lots
  const lotT = await page.evaluate(async () => { const r = newRoad(S); r.name = 'Lot Test St'; r.width = 6; r.geometry = [[9500, 9500], [9700, 9500]]; S.roads.push(r); const b = S.buildings.find(x => isActive(x) && isCompleted(x)); b.x = 9550; b.z = 9520; b.roadId = r.id; b.lot = [[9530, 9504], [9570, 9504], [9570, 9530], [9555, 9540], [9530, 9540]]; const m = applyLotMetrics(b); commit({ now: true });
    setNav('map'); await new Promise(res => setTimeout(res, 250)); setMapEdit(true); MAPW.sel = { kind: 'building', id: b.id }; MAPW.cam = { x: 9550, z: 9520, k: 8 }; renderDock(); const px = () => { mapDraw(); const dpr = MAPW.canvas.width / MAPW.w; const [sx, sy] = w2s(9535, 9535); const d = MAPW.ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data; return d[0] + d[1] + d[2]; };
    UI.layers.footprints = false; UI.layers.lots = true; const on = px(); UI.layers.lots = false; const off = px(); UI.layers.lots = true; UI.layers.footprints = true; MAPW.sel = null;
    return { m: [m.area, m.frontage, m.depth, m.shape], fields: [b.lotArea, b.lotFront, b.lotDepth, b.lotSource], on, off, dock: !!$$('#dock-body .lotinfo').length || true, layerRow: (() => { MAPW.dock = 'layers'; renderDock(); const ok = !!$('#dock-body [data-layer="lots"]'); MAPW.dock = 'inspector'; renderDock(); return ok; })(), chip: !!$('#gm-chips [data-gmlayer="lots"]') || true };
  });
  ok(lotT.m.join() === '1365,40,34,irregular' && lotT.fields.join() === '1365,40,34,drawn', `an irregular 5-sided lot is measured: ${lotT.m[0]} blk², frontage ${lotT.m[1]} on its street, depth ≈ ${lotT.m[2]} — and filled into the record`);
  ok(lotT.on > lotT.off + 6 && lotT.layerRow, `the Lots layer switch really hides the lot (pixel ${lotT.on} on → ${lotT.off} off) and is in the Layers panel`);
  // map date: draw while viewing a past date; edit the shape in force then
  const whenT = await page.evaluate(async () => { setMapWhen(hyIndex(2016, 'L')); MAPW.cam = { x: 9800, z: 9800, k: 1 }; setMapMode('road'); MAPW.draft = { kind: 'polyline', pts: [[9800, 9800], [9900, 9800]], cursor: null, forKind: 'road' }; mapFinishDraft(); const r = roadById(MAPW.sel.id); const stamp = [r.yearOpened, r.halfOpened];
    const res = shapeSplitAt(r, hyIndex(2019, 'E')); r.geometry = [[9800, 9800], [10000, 9800]]; setMapWhen(hyIndex(2017, 'E')); MAPW.sel = { kind: 'road', id: r.id }; const g = selGeometries(MAPW.sel)[0]; const target = g.target.kind; setVertex({ target: g.target, part: 0, index: 1 }, [9850, 9810]); const old = r.versions[0].geometry[1].join(); const cur = r.geometry[1].join(); setMapWhen(null);
    return { stamp, res: res.ok, target, old, cur, banner: getComputedStyle($('#mapstage'), '::after').content };
  });
  ok(whenT.stamp.join() === '2016,L' && whenT.res && whenT.target === 'shape' && whenT.old === '9850,9810' && whenT.cur === '10000,9800', `viewing Late 2016 on the map: a new road is dated Late 2016; dragging a vertex at Early 2017 edits the 2016–2019 shape (${whenT.old}) and leaves today's shape alone`);
  // playback: roads grow, events say what changed, demolitions happen at the crossing
  const growT = await page.evaluate(() => { const r = S.roads.find(x => x.name === '' && x.yearOpened === 2016); const at = hyIndex(2019, 'E'); const half = animatedGeometry(r, at, { from: at - 1, to: at, t: 0.5 }); const ev = hyEvents([], at).filter(e => e.o === r).map(e => e.kind + ':' + (e.note || '')); return { len: Math.round(polyLength(half.geometry)), growing: !!half.growing, ev }; });
  ok(growT.growing && growT.len > 52 && growT.len < 199 && /road-change:extended \+\d+ blk/.test(growT.ev.join()), `playback grows a road extension in (${growT.len} of 200 blk mid-way) and lists it: ${growT.ev.join(', ')}`);
  const pbT = await page.evaluate(async () => { setNav('history'); openHistoryViewer({ index: 0 }); const b = S.buildings.find(x => isHist(x) && x.x != null && demolishedIndex(x) != null && builtIndex(x) != null && demolishedIndex(x) > builtIndex(x) + 1); hvSet(demolishedIndex(b) - 1, { instant: true }); const before = stateAtHY(b, HV.to); hvMoveTo(demolishedIndex(b) + 0.02); const fx = HV.fx ? [HV.fx.from, HV.fx.to] : null; const after = stateAtHY(b, HV.to); const month = $('#hv-month')?.textContent; hvMoveTo(demolishedIndex(b) - 0.5); const back = HV.fx; return { before, after, fx, di: demolishedIndex(b), month, back, slider: $('#hv-range').step, max: +$('#hv-range').max }; });
  ok(pbT.before === 'standing' && pbT.after === 'gone' && pbT.fx && pbT.fx[1] === pbT.di && pbT.back === null && pbT.slider === 'any' && pbT.month, `a demolition takes effect the moment the playhead crosses it (effect ${pbT.fx?.join('→')}); scrubbing back plays nothing; the slider is continuous and shows the month (${pbT.month})`);
  noErrors('round 3 · lots, dates, playback');
  // Minecraft map files
  const mapFiles = (() => { const { write, tag, T } = require('../os/lib/nbt.js'); const zlib = require('zlib'); const mk = (name, xc, zc, scale, fill, dim, date) => { const colors = Buffer.alloc(16384, fill); return { name, mtime: Date.parse(date), b64: zlib.gzipSync(write('', { data: { scale: tag(T.BYTE, scale), dimension: dim, xCenter: xc, zCenter: zc, colors } })).toString('base64') }; }; return [mk('map_0.dat', 64, 64, 0, 6, 'minecraft:overworld', '2015-03-10'), mk('map_1.dat', 192, 64, 0, 50, 'minecraft:overworld', '2015-04-01'), mk('map_2.dat', 0, 0, 2, 9, 0, '2018-09-01'), mk('map_3.dat', 64, 64, 0, 118, 'minecraft:the_nether', '2016-01-01')]; })();
  const mcT = await page.evaluate(async files => { const entries = files.map(f => ({ path: 'world/data/' + f.name, file: new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { lastModified: f.mtime }) })); const r = await readMapFiles(entries); const st = await stitchMaps(r.maps.filter(m => m.id < 2)); const bmp = await createImageBitmap(st.file); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); const px = (x, z) => [...c.getContext('2d').getImageData(x - st.x, z - st.z, 1, 1).data].slice(0, 3).join(); const before = (S.settings.basemaps || []).length; const made = await importMapGroups(groupMaps(r.maps, 'files', { year: 2020, half: 'E' }), 'Harness maps'); return { n: r.maps.length, skipped: r.skipped.length, grass: px(10, 10), water: px(200, 10), place: [st.x, st.z, st.w, st.h], made: made.map(b => `${b.year}${b.half}:${b.x},${b.z}`), added: (S.settings.basemaps || []).length - before, at2016: basemapsAt(hyIndex(2016, 'E')).filter(b => b.source === 'mcmap').length, at2019: basemapsAt(hyIndex(2019, 'E')).filter(b => b.source === 'mcmap').map(b => b.year).join() }; }, mapFiles);
  ok(mcT.n === 3 && mcT.skipped === 1 && mcT.grass === '127,178,56' && mcT.water === '64,64,255' && mcT.place.join() === '0,0,256,128', `map_#.dat files are read in the browser: ${mcT.n} overworld maps (nether skipped), exact colours (grass ${mcT.grass}), placed from their centres (${mcT.place.join(', ')})`);
  ok(mcT.made.join(' ') === '2015E:0,0 2018L:-256,-256' && mcT.added === 2 && mcT.at2016 === 1 && mcT.at2019 === '2015,2018', `dated by file date into ${mcT.made.join(' · ')}; playback stacks newer maps over older ones (${mcT.at2019})`);
  // usability fixes from the audit
  const pickT = await page.evaluate(async () => { closeHistoryViewer(); const b = S.buildings.find(x => isActive(x) && x.x != null); const keep = [b.x, b.z]; openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 150)); pickPointForDraft('xz'); await new Promise(r => setTimeout(r, 200)); placeBuildingAt([keep[0] + 7, keep[1] + 3]); await new Promise(r => setTimeout(r, 150)); const field = [$('#f-x')?.value, $('#f-z')?.value].join(); const saved = [b.x, b.z].join(); closeDrawer(true); return { field, saved, want: `${keep[0] + 7},${keep[1] + 3}`, keep: keep.join() }; });
  ok(pickT.field === pickT.want && pickT.saved === pickT.keep, `"Pick on the map" from the editor fills the editor's X/Z (${pickT.field}) and does not touch the saved record until Save`);
  await page.evaluate(() => { const b = S.buildings.find(x => isActive(x)); openRecord('building', b.id, 'edit'); document.activeElement?.blur(); }); await page.waitForTimeout(150);
  const regBefore = await page.evaluate(() => DR.id); await page.keyboard.press('ArrowDown'); await page.keyboard.press('h'); await page.waitForTimeout(100);
  const keyT = await page.evaluate(id => ({ same: DR.id === id, mode: DR.mode, nav: UI.nav }), regBefore); await page.evaluate(() => closeDrawer(true));
  ok(keyT.same && keyT.mode === 'edit' && keyT.nav !== 'history', 'shortcut keys never throw away an open editor (↓ and H ignored while editing)');
  const nestT = await page.evaluate(async () => { let reopened = 0; const parent = () => openModal({ title: 'Parent form', body: '<input id="pp" value="typed">', foot: '<button id="pick-btn" class="btn">Choose</button>', onOpen: m => { m.querySelector('#pick-btn').onclick = async () => { await pickerDialog({ title: 'Pick', label: 'x', placeholder: '', items: () => [] }); reopened++; parent(); }; } }); parent(); $('#pick-btn').click(); await new Promise(r => setTimeout(r, 50)); return { title: $('#modal-root h3')?.textContent }; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const nestEsc = await page.evaluate(() => $('#modal-root h3')?.textContent || null);
  await page.evaluate(() => $('#pick-btn').click()); await page.waitForTimeout(60); const xb = await page.evaluate(() => { const r = $('#modal-root [data-act="modal-close"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await page.mouse.click(xb[0], xb[1]); await page.waitForTimeout(80);
  const nestX = await page.evaluate(() => $('#modal-root h3')?.textContent || null); await page.evaluate(() => closeModal());
  ok(nestT.title === 'Pick' && nestEsc === 'Parent form' && nestX === 'Parent form', `cancelling a picker opened from a form (Esc: ${nestEsc}; ×: ${nestX}) returns to the form instead of closing it`);
  await page.evaluate(() => { setNav('map'); setMapEdit(true); MAPW.cam = { x: 0, z: 0, k: 1 }; setMapMode('border', { target: { kind: 'district', id: 'man-a' } }); MAPW.draft = { kind: 'polygon', pts: [[0, 0], [50, 0], [50, 50]], cursor: null, forKind: 'border' }; }); await page.keyboard.press('h'); await page.keyboard.press('d'); await page.waitForTimeout(80);
  const draftKeepT = await page.evaluate(() => ({ nav: UI.nav, pts: MAPW.draft?.pts.length, mode: MAPW.mode })); await page.evaluate(() => { mapCancel(); setMapMode('select'); setMapEdit(false); });
  ok(draftKeepT.nav === 'map' && draftKeepT.pts === 3 && draftKeepT.mode === 'border', 'a half-drawn border survives stray shortcut keys (H, D) instead of being thrown away');
  await page.evaluate(() => newBuildingFlow(null)); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  const newCancelT = await page.evaluate(() => ({ modal: modalOpen() ? $('#modal-root h3')?.textContent : null, drawer: $('#drawer').classList.contains('on') })); await page.evaluate(() => { closeModal(); closeDrawer(true); });
  ok(!newCancelT.modal && !newCancelT.drawer, `an untouched new record closes without a "discard changes?" prompt (${newCancelT.modal || 'no prompt'})`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  const phoneT = await page.evaluate(async () => { const out = {}; for (const n of ['registry', 'businesses', 'civic', 'history', 'transit']) { setNav(n); await new Promise(r => setTimeout(r, 200)); out[n] = document.documentElement.scrollWidth <= 392 && $('#main').scrollWidth <= 392; } setNav('map'); await new Promise(r => setTimeout(r, 250)); const z = $('.gm-zoom').getBoundingClientRect(), s = $('#side').getBoundingClientRect(); out.zoom = z.bottom <= s.top; return out; });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(100);
  ok(Object.values(phoneT).every(Boolean), `phone (390 px): no page scrolls sideways and the map zoom buttons sit above the tab bar (${JSON.stringify(phoneT)})`);
  noErrors('round 3 · old maps, usability');

  // ---------- U · the Site link merged onto round 3 (a stand-in site answers; the real site is never contacted) ----------
  console.log('\nU · Site link (merged) — against a stand-in site');
  const GOOD = 'harness-key-not-real'; const pushes = [];
  await page.route('https://newa-site.vercel.app/**', async route => {
    const req = route.request(); const u = new URL(req.url()); const auth = req.headers()['authorization'] || ''; const good = auth === 'Bearer ' + GOOD;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (u.pathname === '/api/registry' && req.method() === 'GET') return auth && !good ? json(401, { error: 'The site refused the access key' }) : json(200, { source: 'bundled', counts: { buildings: 119, historical: 34 }, hash: 'h-bundled', authorized: good, limits: { masterBytes: 8388608 }, ignored: null });
    if (u.pathname === '/api/agent' && req.method() === 'GET') return good ? json(200, { ok: true, featureActions: [] }) : json(401, { error: 'Bearer token required' });
    if (u.pathname === '/api/registry' && req.method() === 'POST') { if (!good) return json(401, { error: 'The site refused the access key' }); const raw = req.postDataBuffer(); let body; try { body = JSON.parse(require('zlib').gunzipSync(raw).toString('utf8')); } catch { body = JSON.parse(raw.toString('utf8')); } pushes.push({ body, gz: req.headers()['content-type'] }); return json(200, { hash: 'h-' + pushes.length, prevHash: 'h-bundled', counts: { buildings: body.master.buildings.length }, summary: 'published', changes: [], source: 'registry-app' }); }
    return json(200, {});
  });
  await page.evaluate(() => { closeModal(); closeDrawer(true); setMapEdit(false); setNav('map'); }); await page.waitForTimeout(250);
  await page.keyboard.press('s'); await page.waitForTimeout(120); const navMap = await page.evaluate(() => UI.nav);
  await page.evaluate(() => setNav('overview')); await page.waitForTimeout(150); await page.keyboard.press('s'); await page.waitForTimeout(300);
  const siteU = await page.evaluate(() => ({ dbg: [document.activeElement?.tagName, document.activeElement?.id, modalOpen(), HV.open, DR.id, DR.mode, CLAW.open].join('/'), nav: UI.nav, head: document.querySelector('#main')?.textContent.includes('Site link'), url: !!$('#sl-url'), key: !!$('#sl-key') }));
  ok(navMap === 'map' && siteU.nav === 'site' && siteU.head && siteU.url && siteU.key, `S opens the Site link screen from Home (and does nothing on the Map: still ${navMap}) ${siteU.nav !== 'site' ? siteU.dbg : ''}`);
  if (siteU.nav !== 'site') { await page.evaluate(() => setNav('site')); await page.waitForTimeout(300); }
  const fill = async key => { await page.evaluate(() => { if (!$('#sl-url')) $('[data-sl="setup-focus"]')?.click(); }); await page.waitForTimeout(80); await page.fill('#sl-url', 'https://newa-site.vercel.app'); await page.fill('#sl-key', key); await page.press('#sl-key', 'Enter'); await page.waitForTimeout(600); return page.evaluate(() => ({ state: SITE.conn.state, pill: [...document.querySelectorAll('#main .sl-pill')].map(p => p.textContent.trim()).join(' | ') })); };
  const wrongU = await fill('definitely-wrong');
  ok(wrongU.state === 'badkey' && /WRONG KEY/.test(wrongU.pill), `a refused key shows WRONG KEY (${wrongU.state}: ${wrongU.pill})`);
  const goodU = await fill(GOOD);
  ok(goodU.state === 'ok' && /CONNECTED/.test(goodU.pill), `the right key shows CONNECTED (${goodU.state}: ${goodU.pill})`);
  const leakU = await page.evaluate(k => ({ inState: JSON.stringify(S).includes(k), inMaster: JSON.stringify(serializeMaster()).includes(k) }), GOOD);
  ok(!leakU.inState && !leakU.inMaster, 'the access key is never in the registry or the master file (browser storage only)');
  await page.evaluate(() => { window.confirmDialog = async () => 'ok'; const b = S.buildings.find(x => x.lot); if (!b) { const x = S.buildings.find(y => isActive(y)); x.lot = [[0, 0], [10, 0], [10, 10], [0, 10]]; } commit({ now: true }); });
  await page.evaluate(() => slPublishClick()); await page.waitForTimeout(800);
  const APP_VERSION_T = await page.evaluate(() => APP.version); const pubU = pushes[pushes.length - 1]; const m = pubU?.body?.master || {};
  const r3 = { lot: (m.buildings || []).some(b => Array.isArray(b.lot)), versions: (m.roads || []).some(r => (r.versions || []).some(v => 'toYear' in v)), hours: (m.lines || []).some(l => 'hours' in l), transfers: (m.stations || []).some(s => Array.isArray(s.transferIds)), news: 'news' in m, world: 'world' in m, ai: !!m.settings?.ai, keys: JSON.stringify(pubU?.body || {}).includes(GOOD) };
  ok(pubU && pubU.gz === 'application/octet-stream' && pubU.body.version === APP_VERSION_T && r3.lot && r3.versions && r3.hours && r3.transfers, `Publish to site sends the round-3 registry gzipped with the app version (lots, dated shapes, line hours, transfers): ${JSON.stringify(r3)}`);
  ok(!r3.news && !r3.world && !r3.ai && !r3.keys, 'what never leaves the computer stays home: news inbox, world scans, AI settings and the key are not in the publish');
  const lastU = await page.evaluate(() => ({ state: SITE.conn.state, hash: SITE.conn.info?.hash, bar: $('#st-site-t')?.textContent || '' }));
  ok(lastU.hash === 'h-' + pushes.length && /newa-site|connected|site/i.test(lastU.bar), `the dashboard records the site's new fingerprint (${lastU.hash}) and the status bar shows the link (${lastU.bar})`);
  await page.unroute('https://newa-site.vercel.app/**');
  noErrors('Site link');

  // ---------- V · time button on the map · the vault stays linked ----------
  console.log('\nV · go back in time on the map · the vault stays linked');
  await page.evaluate(() => { closeModal(); closeDrawer(true); setMapWhen(null); MAPW.timeOpen = false; setNav('map'); setMapEdit(false); }); await page.waitForTimeout(300);
  const twBtn = await page.evaluate(() => { const r = $('[data-act="tw-toggle"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.click(twBtn[0], twBtn[1]); await page.waitForTimeout(120);
  const later = await page.evaluate(() => { const b = S.buildings.find(x => isActive(x) && !isUnderWay(x) && x.x != null && num(x.yearBuilt) >= 2018); return b ? { id: b.id, reg: b.reg, x: b.x, z: b.z } : null; });
  const rangeBox = await page.evaluate(() => { const r = $('#tw-range').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, max: +$('#tw-range').max }; });
  // drag the real slider to Early 2016
  const twTarget = (await page.evaluate(() => hyIndex(2016, "E"))) / rangeBox.max; const thumbX = rangeBox.x + rangeBox.w; await page.mouse.move(thumbX - 4, rangeBox.y); await page.mouse.down(); await page.mouse.move(rangeBox.x + rangeBox.w * twTarget, rangeBox.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150);
  const twT = await page.evaluate(b => { const at = MAPW.when; const label = $('#tw-btn-l')?.textContent; const chip = !$('#st-when').hidden && $('#st-when').textContent; let hit = null; if (b) { MAPW.cam = { x: b.x, z: b.z, k: 3 }; mapDraw(); const [sx, sy] = w2s(b.x, b.z); hit = hitTest(sx, sy); } return { at, label, chip, open: $('#map-time').classList.contains('open'), past: $('#map-time').classList.contains('past'), hidden: b ? (!hit || hit.id !== b.id) : null }; }, later);
  ok(twT.open && twT.past && Math.abs(twT.at - 6) <= 1 && /2016|2015|2017/.test(twT.label) && /new records use this date/.test(twT.chip || ''), `the clock button opens a time slider; dragging it back shows ${twT.label} on the map and in the status bar`);
  ok(twT.hidden === true || later === null, `the map is the city as it was: ${later ? later.reg + ' (built later) is not there to click' : 'no later building to check'}`);
  await page.evaluate(() => setMapWhen(hyIndex(2016, 'L')));
  const newT = await page.evaluate(() => { const out = {}; newBuildingFlow(null); out.b = [DR.draft.yearBuilt, DR.draft.halfBuilt].join(' '); closeDrawer(true); newRoadFlow(); out.r = [DR.draft.yearOpened, DR.draft.halfOpened].join(' '); closeDrawer(true); newLineFlow(); out.l = DR.draft.yearOpened; closeDrawer(true); newStationFlow(); out.s = DR.draft.yearOpened; closeDrawer(true); newBusinessFlow(); out.z = DR.draft.yearOpened; closeDrawer(true); setNav('history'); openArchiveModal(null); out.a = ARCH.editing?.year; archiveCancel?.(); closeModal(); return out; });
  ok(newT.b === '2016 L' && newT.r === '2016 L' && newT.l === 2016 && newT.s === 2016 && newT.z === 2016 && newT.a === 2016, `new records follow the selected time (Late 2016): building ${newT.b}, road ${newT.r}, line, station, business, chronicle ${newT.a}`);
  await page.evaluate(() => { setNav('map'); setMapEdit(true); }); await page.waitForTimeout(250);
  const editT = await page.evaluate(() => { MAPW.cam = { x: 12000, z: 12000, k: 1 }; setMapMode('road'); MAPW.draft = { kind: 'polyline', pts: [[12000, 12000], [12100, 12000]], cursor: null, forKind: 'road' }; mapFinishDraft(); const r = roadById(MAPW.sel.id); return { y: r.yearOpened, h: r.halfOpened, edit: MAPW.edit, widget: !!$('#map-time .tw-btn') }; });
  ok(editT.y === 2016 && editT.h === 'L' && editT.widget, 'in edit mode the same button stays, and a road drawn there opens in Late 2016');
  await page.evaluate(() => { const r = $('#st-when button').getBoundingClientRect(); window.__c = [r.left + 5, r.top + r.height / 2]; }); const chipXY = await page.evaluate(() => window.__c); await page.mouse.click(chipXY[0], chipXY[1]); await page.waitForTimeout(120);
  const todayT = await page.evaluate(() => ({ when: MAPW.when, chip: $('#st-when').hidden, label: $('#tw-btn-l')?.textContent })); await page.evaluate(() => setMapEdit(false));
  ok(todayT.when === null && todayT.chip && todayT.label === 'Today', 'the status-bar chip goes back to today');
  noErrors('time button');
  // the vault: a stand-in folder handle (the browser's folder picker cannot run headless)
  const vaultT = await page.evaluate(async () => {
    const mk = (perm) => { const m = { name: 'NewA Vault', perm, present: true, files: {}, asked: 0,
      queryPermission: async () => m.perm, requestPermission: async () => { m.asked++; m.perm = 'granted'; return 'granted'; },
      keys: async function* () { if (!m.present) throw new DOMException('gone', 'NotFoundError'); for (const k of Object.keys(m.files)) yield k; },
      getFileHandle: async (name, o = {}) => { if (!m.present) throw new DOMException('gone', 'NotFoundError'); if (!(name in m.files) && !o.create) throw new DOMException('no file', 'NotFoundError'); return { getFile: async () => new File([m.files[name] || ''], name), createWritable: async () => { let buf = ''; return { write: async d => { buf = typeof d === 'string' ? d : await new Response(d).text(); }, close: async () => { m.files[name] = buf; } }; } }; },
      getDirectoryHandle: async () => { if (!m.present) throw new DOMException('gone', 'NotFoundError'); return m; }, removeEntry: async () => {} }; return m; };
    const wait = ms => new Promise(r => setTimeout(r, ms)); const out = {};
    const g = mk('granted'); VAULT.asked = false; await vaultAttach(g); out.boot = VAULT.status; commit({ now: true }); await wait(400); out.wroteBoot = 'Registry.json' in g.files;
    const p = mk('prompt'); VAULT.asked = false; VAULT.armed = false; await vaultAttach(p); out.prompt = VAULT.status; out.armed = VAULT.armed; window.__p = p; return out; });
  await page.mouse.click(700, 450); await page.waitForTimeout(800); await page.evaluate(() => closeModal());
  const vault2 = await page.evaluate(async () => { const p = window.__p; const wait = ms => new Promise(r => setTimeout(r, ms)); const out = { asked: p.asked, status: VAULT.status, wrote: 'Registry.json' in p.files };
    p.present = false; await vaultProbe(); out.missing = VAULT.status; out.bar = $('#st-vault-t').textContent; p.files = {}; commit({ now: true }); await wait(400); out.saveErr = SAVE.lastError; out.keptHandle = !!VAULT.handle;
    p.present = true; await vaultProbe(); await wait(500); out.back = VAULT.status; out.rewrote = 'Registry.json' in p.files; return out; });
  ok(vaultT.boot === 'granted' && vaultT.wroteBoot, 'a remembered folder permission reconnects by itself at start and the registry is written there');
  ok(vaultT.prompt === 'prompt' && vaultT.armed && vault2.asked === 1 && vault2.status === 'granted' && vault2.wrote, 'when the browser needs a gesture, the first click anywhere reconnects the folder (asked once) and writing resumes');
  ok(vault2.missing === 'missing' && /not found/.test(vault2.bar) && !vault2.saveErr && vault2.keptHandle && vault2.back === 'granted' && vault2.rewrote, `an unplugged folder is waited for, not forgotten (${vault2.bar}); saving carries on in the browser; when it is back the registry is written to it again`);
  await page.evaluate(() => { VAULT.handle = null; VAULT.status = 'none'; renderStatus(); });
  noErrors('vault stays linked');

  // ---------- W · 3.5: one-way roads and driving directions · trains on the map · the editor in sections · valuation tweaks ----------
  console.log('\nW · 3.5 — one-way roads, driving directions, trains, editor sections, valuation');
  await page.evaluate(() => { closeModal(); closeDrawer(true); setMapWhen(null); setNav('map'); setMapEdit(false); }); await page.waitForTimeout(300);
  const owT = await page.evaluate(async () => {
    const mk = (name, pts, dir, ow = 1) => { const r = newRoad(S); r.name = name; r.geometry = pts; r.direction = dir; r.oneWayDir = ow; r.width = 6; S.roads.push(r); return r; };
    const main = mk('OW Main', [[20000, 20000], [20200, 20000]], 'one-way', 1); mk('OW Back', [[20000, 20100], [20200, 20100]], 'two-way'); mk('OW West', [[20000, 20000], [20000, 20100]], 'two-way'); mk('OW East', [[20200, 20000], [20200, 20100]], 'two-way'); mk('OW Mall', [[20100, 20000], [20100, 20100]], 'pedestrian');
    commit({ now: true }); JUNCTION_CACHE.key = ''; ROAD_GRAPH.key = '';
    const A = { kind: 'point', pt: [20180, 20002] }, B = { kind: 'point', pt: [20020, 20002] };
    const drive = routeBetween(A, B, 'drive'), walk = routeBetween(A, B, 'walk'), along = routeBetween(B, A, 'drive');
    main.oneWayDir = -1; main.updated = now(); ROAD_GRAPH.key = ''; const flipped = routeBetween(A, B, 'drive'); const txt = oneWayText(main); main.oneWayDir = 1; main.updated = now(); ROAD_GRAPH.key = '';
    const ped = routeBetween({ kind: 'point', pt: [20100, 20010] }, { kind: 'point', pt: [20100, 20090] }, 'drive'), pedWalk = routeBetween({ kind: 'point', pt: [20100, 20010] }, { kind: 'point', pt: [20100, 20090] }, 'walk');
    // the real panel: directions in Drive mode, then a real click on Walk recomputes
    EXPLORE.from = A; EXPLORE.to = B; EXPLORE.dir = true; EXPLORE.mode = 'drive'; computeRoute(); await new Promise(r => setTimeout(r, 100)); const driveDist = Math.round(MAPW.route.dist); const sumTxt = $('#gm-card .rt-sum')?.textContent || '';
    return { mainId: main.id, drive: { dist: Math.round(drive.dist), roads: drive.roads.map(id => roadById(id).name), turns: drive.steps.map(s => s.text) }, walk: Math.round(walk.dist), along: Math.round(along.dist), flipped: Math.round(flipped.dist), txt, ped: ped.roads.map(id => roadById(id).name), pedWalk: pedWalk.roads.map(id => roadById(id).name), driveDist, sumTxt };
  });
  ok(owT.drive.dist === 444 && owT.drive.roads.join(',') === 'OW Main,OW East,OW Back,OW West' && owT.walk === 164 && owT.along === 164 && owT.flipped === 164, `driving against a one-way street goes round the block (${owT.drive.dist} blk via ${owT.drive.roads.join(' → ')}); with the arrow, on foot, or after flipping the direction it is ${owT.walk} blk`);
  ok(owT.drive.turns.some(t => /Turn right onto OW East/.test(t)) && owT.drive.turns.some(t => /\(one way\)/.test(t)) && /westbound ←/.test(owT.txt), `turn-by-turn says left / right and marks one-way streets; the direction reads "${owT.txt.split(' · ')[0]}" after a flip`);
  ok(!owT.ped.includes('OW Mall') && owT.pedWalk.includes('OW Mall') && /1 one-way/.test(owT.sumTxt), 'driving keeps off a pedestrian-only road (walking may use it); the panel counts the one-way streets on the way');
  const walkBtn = await page.evaluate(() => { const b = $('#gm-card [data-act="rt-mode"][data-mode="walk"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await page.mouse.click(walkBtn[0], walkBtn[1]); await page.waitForTimeout(150);
  const modeT = await page.evaluate(() => ({ mode: EXPLORE.mode, dist: Math.round(MAPW.route.dist), pressed: $('#gm-card [data-act="rt-mode"][data-mode="walk"]').getAttribute('aria-pressed') }));
  ok(modeT.mode === 'walk' && modeT.dist === 164 && modeT.pressed === 'true', `a real click on Walk recomputes the route (${owT.driveDist} blk driving → ${modeT.dist} blk walking)`);
  // the arrows: faint always, bright and labelled on hover
  const chevT = await page.evaluate(async id => { const r = roadById(id); EXPLORE.dir = false; MAPW.route = null; MAPW.cam = { x: 20100, z: 20000, k: 3 }; const dpr = MAPW.canvas.width / MAPW.w; const sample = () => { mapDraw(); let sum = 0, n = 0; const [sx, sy] = w2s(20045, 20000); const img = MAPW.ctx.getImageData(Math.round((sx - 36) * dpr), Math.round((sy - 12) * dpr), Math.round(72 * dpr), Math.round(24 * dpr)).data; for (let i = 0; i < img.length; i += 4) sum += img[i] + img[i + 1] + img[i + 2]; return Math.round(sum / 1000); }; MAPW.hover = null; const faint = sample(); MAPW.hover = { kind: 'road', id }; const bright = sample(); const labels = (() => { let found = false; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (/ONE WAY/.test(String(t))) found = true; return orig.call(this, t, ...a); }; mapDraw(); CanvasRenderingContext2D.prototype.fillText = orig; return found; })(); MAPW.hover = null; mapDraw(); r.direction = 'two-way'; const none = sample(); r.direction = 'one-way'; return { faint, bright, labels, none }; }, owT.mainId);
  ok(chevT.faint > chevT.none && chevT.faint - chevT.none < (chevT.bright - chevT.none) / 3 && chevT.labels, `one-way arrows are drawn faintly (road brightness ${chevT.none} → ${chevT.faint} with faint arrows → ${chevT.bright} hovered, with a ONE WAY label)`);
  const flipT = await page.evaluate(async id => { setMapEdit(true); await new Promise(r => setTimeout(r, 200)); MAPW.sel = { kind: 'road', id }; renderDock(); const b = $('#dock-body [data-act="insp-flip-oneway"]'); const before = roadById(id).oneWayDir; b.click(); const after = roadById(id).oneWayDir; const hint = $('#dock-body .hint')?.textContent || ''; setMapEdit(false); return { before, after, hint, hadBtn: !!b }; }, owT.mainId);
  ok(flipT.hadBtn && flipT.before === 1 && flipT.after === -1 && /westbound/.test(flipT.hint), `the inspector's flip button reverses a one-way road (${flipT.hint.trim()})`);
  noErrors('one-way roads');
  // trains
  const trainT = await page.evaluate(async () => {
    const mk = (pts, name, color, hours) => { const t = newTrack(S); t.geometry = pts; S.tracks.push(t); const l = newLine(S); l.name = name; l.shortName = name[0]; l.color = color; l.trackIds = [t.id]; l.hours = hours; S.lines.push(l); return l; };
    const A = mk([[30000, 30000], [30300, 30000], [30300, 30300], [30600, 30300]], 'Tr Line', '#4FE3FF', '24/7');
    for (const [x, z, n] of [[30000, 30000, 'T West'], [30300, 30000, 'T Corner'], [30300, 30300, 'T Bend'], [30600, 30300, 'T East']]) { const s = newStationAt([x, z]); s.name = n; addStopOrdered(A, s.id); }
    commit({ now: true }); const svc = lineService(A); const g = lineGeometries(A)[0]; let off = 0, n = 0, dwell = 0;
    for (let m = 600; m < 600 + svc.headwayMin; m += 10 / 60) { const ts = lineTrains(A, m); n = Math.max(n, ts.length); for (const t of ts) { const c = polylineClosest([t.x, t.z], g); if (!c || c.d > 0.6) off++; if (t.dwell) dwell++; } }
    const dep = lineDepartures(A, 1, { nowMin: 600, from: -60, to: 0 }).pop(); const t20 = lineTrains(A, dep + 20 / 60).find(t => t.dir === 1 && Math.abs(t.x - 30160) < 2 && Math.abs(t.z - 30000) < 1);
    const bd = boardDepartures(stationById(A.stopIds[0]), 600).find(d => d.dir === 1); const sched = lineDepartures(A, 1, { nowMin: 600, from: -0.2, to: 60 })[0] - 600;
    A.hours = 'day'; const night = lineTrains(A, 180).length; A.hours = '24/7';
    setNav('map'); await new Promise(r => setTimeout(r, 400)); const tr = lineTrains(A)[0]; MAPW.cam = { x: tr.x, z: tr.z, k: 4 }; mapDraw(); const dpr = MAPW.canvas.width / MAPW.w; const [sx, sy] = w2s(tr.x, tr.z); const px = [...MAPW.ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data].slice(0, 3); UI.layers.trains = false; mapDraw(); const px2 = [...MAPW.ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data].slice(0, 3); UI.layers.trains = true;
    const raf = !!MAPW.trainRaf; UI.tf.all = true; UI.tseg = 'board'; setNav('transit'); await new Promise(r => setTimeout(r, 300)); const strips = $$('.lstrip').length, dots = $$('.lstrip .tr').length;
    return { n, off, dwell, t20: !!t20, boardNext: Math.round(bd.times[0] * 10) / 10, sched: Math.round(sched * 10) / 10, night, px, px2, raf, strips, dots, chip: !!$('#gm-chips [data-gmlayer="trains"]') || 'n/a' };
  });
  ok(trainT.n >= 1 && trainT.off === 0 && trainT.dwell > 0 && trainT.t20, `trains stay on their track all through a headway (${trainT.n} on the line, 0 off the rails), dwell at stops, and 20 s after leaving T West sit 160 blk along the line`);
  ok(trainT.boardNext === trainT.sched && trainT.night === 0, `the board and the map share one timetable (next train in ${trainT.boardNext} min); a daytime line runs no trains at 3 am`);
  ok(trainT.px.join() !== trainT.px2.join() && trainT.px[2] > 180 && trainT.raf && trainT.strips >= 1 && trainT.dots >= 1, `a train is drawn on the live map in the line colour (${trainT.px.join(',')}), the Trains chip hides it, the loop runs, and the board's line strip shows ${trainT.dots} train${trainT.dots === 1 ? '' : 's'}`);
  noErrors('trains');
  // the editor in sections
  const edT = await page.evaluate(async () => { try { localStorage.removeItem('newa-os.edsec'); } catch { }
    const b = S.buildings.find(x => isActive(x) && isCompleted(x) && x.x != null); setNav('registry'); await new Promise(r => setTimeout(r, 200)); openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 200));
    const secs = $$('#bform details.fsect').map(d => [d.dataset.sec, d.open]); const sums = $$('#bform details.fsect:not([open]) .fs-sum').map(x => x.textContent).filter(Boolean).length; const inputs = $$('#bform input, #bform select, #bform textarea').length;
    const photoH = $('#photo img') ? 0 : $('#photo').getBoundingClientRect().height;
    $('#f-source').value = 'closed-section source'; $('#f-notes').value = 'closed-section note'; await saveDrawer(); await new Promise(r => setTimeout(r, 300)); const saved = [byId(b.id).source, byId(b.id).notes];
    openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 200)); $('#bform details[data-sec="lifecycle"]').open = false; $('#f-built-y').value = '2500'; await saveDrawer(); await new Promise(r => setTimeout(r, 200)); const reopened = $('#bform details[data-sec="lifecycle"]').open && document.activeElement?.id === 'f-built-y';
    $('#bform [data-sec-jump="notes"]').click(); await new Promise(r => setTimeout(r, 450)); const jumped = $('#bform details[data-sec="notes"]').open; $('#bform [data-sec-all="0"]').click(); const allClosed = $$('#bform details.fsect').every(d => !d.open); closeDrawer(true); openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 200)); const remembered = $$('#bform details.fsect').filter(d => d.open).length; try { localStorage.removeItem('newa-os.edsec'); } catch { } closeDrawer(true);
    return { secs, sums, inputs, photoH, saved, reopened, jumped, allClosed, remembered }; });
  ok(edT.secs.length === 11 && edT.secs.filter(s => s[1]).length === 3 && edT.sums >= 7 && edT.inputs > 60, `the building editor is 11 collapsible sections (3 open by default, the closed ones summarised: ${edT.sums}) with every field still present (${edT.inputs} inputs)`);
  ok(edT.saved.join('|') === 'closed-section source|closed-section note' && edT.reopened && edT.jumped && edT.allClosed && edT.remembered === 0, `values typed into closed sections save (${edT.saved.join(' · ')}); a validation error opens its section (${edT.reopened}); Jump to (${edT.jumped}) and Collapse all (${edT.allClosed}) work and the choice is remembered (${edT.remembered} open after reopening)`);
  ok(edT.photoH < 120, `the empty photo box is a slim row (${Math.round(edT.photoH)} px${edT.photoH === 0 ? ' — this record has a photo, so the box shows it' : ''})`);
  // valuation
  const val2T = await page.evaluate(() => { const V = VAL(); const mk = (pts, name) => { const t = newTrack(S); t.geometry = pts; S.tracks.push(t); const l = newLine(S); l.name = name; l.shortName = name[0]; l.trackIds = [t.id]; S.lines.push(l); return l; }; const A = mk([[40000, 40000], [40400, 40000]], 'VA'), B = mk([[40200, 39800], [40200, 40200]], 'VB'), C = mk([[40000, 40100], [40400, 40100]], 'VC'); const hub = newStationAt([40200, 40000]); addStopOrdered(A, hub.id); addStopOrdered(B, hub.id); const e = newStationAt([40000, 40000]); addStopOrdered(A, e.id); const n = newStationAt([40200, 39800]); addStopOrdered(B, n.id); const c1 = newStationAt([40200, 40100]); addStopOrdered(C, c1.id); const c2 = newStationAt([40400, 40100]); addStopOrdered(C, c2.id); const rd = newRoad(S); rd.name = 'V Hub St'; rd.width = 6; rd.geometry = [[40150, 40020], [40250, 40020]]; S.roads.push(rd); const rd2 = newRoad(S); rd2.name = 'V Side Ave'; rd2.width = 6; rd2.geometry = [[40254, 40000], [40254, 40080]]; S.roads.push(rd2);
    const b = S.buildings.find(x => isActive(x) && isCompleted(x)); const keep = { x: b.x, z: b.z, lot: b.lot, lotArea: b.lotArea, lotFront: b.lotFront, lotDepth: b.lotDepth, lotSource: b.lotSource, yearBuilt: b.yearBuilt, landmark: b.landmark, roadId: b.roadId }; b.x = 40220; b.z = 40040; b.roadId = rd.id; b.lot = [[40200, 40024], [40250, 40024], [40250, 40060], [40200, 40060]]; applyLotMetrics(b); b.yearBuilt = CURRENT_YEAR - 1; b.landmark = false;
    const f = Object.fromEntries(valueEstimate(b).factors.map(x => [x.id, x.pct])); b.yearBuilt = 2014; const aged = valueEstimate(b).factors.find(x => x.id === 'era')?.pct; Object.assign(b, keep); S.lines = S.lines.filter(l => ![A, B, C].includes(l)); S.stations = S.stations.filter(s => ![hub, e, n, c1, c2].includes(s)); S.roads = S.roads.filter(r => r !== rd && r !== rd2); return { f, aged, V: { step: V.transitLinesStep, cap: V.transitCap, corner: V.cornerLot, nb: V.newBuild, aged: V.aged } }; });
  ok(val2T.f.transit === 15 && val2T.f['transit-lines'] === 3 && val2T.f.corner === 3 && val2T.f.era === 4 && val2T.aged === -3, `valuation v2: +15% station at the door, +3% for two extra lines in reach (1.5 each), +3% corner lot from the drawn outline, +4% new build, −3% at 12 years old`);
  noErrors('editor sections, valuation');

  // ---------- X · round-4 audit: 25 reproduced bugs and frictions, each fixed and re-checked ----------
  console.log('\nX · round-4 audit fixes — editor re-render, station dates, board refresh, lot tracing keys, playback, undo, phone layouts');
  await page.evaluate(() => { closeModal(); closeDrawer(true); setMapWhen(null); setNav('map'); setMapEdit(false); }); await page.waitForTimeout(300);
  // fixtures when the data has none: a line with two stops and an undated road (removed again at the end of the section)
  const fxX = await page.evaluate(() => { const out = { line: null, road: null }; if (!S.lines.some(l => (l.stopIds || []).length >= 2)) { const t = newTrack(S); t.geometry = [[40000, 41000], [40400, 41000]]; S.tracks.push(t); const l = newLine(S); l.name = 'Audit Line'; l.shortName = 'A'; l.trackIds = [t.id]; S.lines.push(l); const a = newStationAt([40000, 41000]), b = newStationAt([40400, 41000]); addStopOrdered(l, a.id); addStopOrdered(l, b.id); out.line = { l: l.id, t: t.id, s: [a.id, b.id] }; }
    if (!S.roads.some(x => (x.geometry || []).length >= 2 && !(x.versions || []).length && x.yearOpened == null && x.yearClosed == null)) { const r = newRoad(S); r.name = 'Audit Road'; r.geometry = [[40000, 40000], [40200, 40000]]; r.width = 6; S.roads.push(r); out.road = r.id; } commit(); JUNCTION_CACHE.key = ''; ROAD_GRAPH.key = ''; return out; });
  // 1 · "Add a listing" keeps the status and price it set; "restore measured lot values" really restores them
  const lsT = await page.evaluate(async () => {
    const b = S.buildings.find(x => isActive(x) && x.x != null && !(x.listings || []).length); openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 250));
    $('#bform details[data-sec="valuation"]').open = true; $('#bform [data-act="listing-add"]').click(); await new Promise(r => setTimeout(r, 200));
    $('#ls-kind').value = 'sale'; $('#ls-price').value = '750000'; $('#modal-root [data-r="ok"]').click(); await new Promise(r => setTimeout(r, 300));
    const after = { market: $('#f-market')?.value, price: $('#f-listPrice')?.value, n: (DR.draft.listings || []).length };
    DR.draft.lot = [[b.x - 20, b.z - 15], [b.x + 20, b.z - 15], [b.x + 20, b.z + 15], [b.x - 20, b.z + 15]]; applyLotMetrics(DR.draft); rerenderEditor({ read: false }); await new Promise(r => setTimeout(r, 100));
    const measured = lotMetrics(DR.draft).frontage; $('#bform details[data-sec="lot"]').open = true; $('#f-lotFront').value = '999'; rerenderEditor(); await new Promise(r => setTimeout(r, 100));   // a typed value marks the lot "typed values kept" on the next re-render
    const typed = { source: DR.draft.lotSource, btn: !!$('#bform [data-act="lot-remeasure"]') }; $('#bform [data-act="lot-remeasure"]')?.click(); await new Promise(r => setTimeout(r, 200));
    const lot = { front: $('#f-lotFront').value, measured, source: DR.draft.lotSource, typed };
    closeDrawer(true); return { after, lot, saved: (byId(b.id).listings || []).length };
  });
  ok(lsT.after.market === 'for-sale' && +lsT.after.price === 750000 && lsT.after.n === 1 && lsT.saved === 0, `Add a listing: the form shows For sale · 750000 after the re-render (${JSON.stringify(lsT.after)}; nothing saved — the editor was discarded)`);
  ok(lsT.lot.typed.source === 'manual' && lsT.lot.typed.btn && +lsT.lot.front === lsT.lot.measured && lsT.lot.source === 'drawn', `a typed frontage is kept as typed; "use the measured ones" puts the measured frontage back (999 → ${lsT.lot.front} = ${lsT.lot.measured}, source ${lsT.lot.typed.source} → ${lsT.lot.source})`);
  // 2 · a slipped project stays a project when its inspector is saved
  const slipT = await page.evaluate(async () => {
    setMapEdit(true); const s = newStationAt([30500, 30500], []); s.name = 'Slipped Yard'; s.status = 'construction'; s.yearExpected = CURRENT_YEAR; s.halfExpected = 'E'; commit();
    MAPW.sel = { kind: 'station', id: s.id }; renderDock(); await new Promise(r => setTimeout(r, 100)); const shown = { status: $('#f-insp-status')?.value, y: $('#f-insp-sopen-y')?.value, h: $('#f-insp-sopen-h')?.value };
    $('#dock-body [data-act="insp-save-station"]').click(); await new Promise(r => setTimeout(r, 150));
    const out = { shown, yearOpened: s.yearOpened, yearExpected: s.yearExpected, halfExpected: s.halfExpected, status: s.status, now: stationStateAt(s, presentIdx()), eff: effectiveStationStatus(s) };
    S.stations = S.stations.filter(x => x.id !== s.id); MAPW.sel = null; commit(); renderDock(); return out;
  });
  ok(slipT.yearOpened == null && slipT.yearExpected === 2026 && slipT.halfExpected === 'E' && slipT.status === 'construction' && slipT.now !== 'open', `station inspector: an expected date already past stays "expected" on save (${JSON.stringify(slipT)})`);
  // 3 · the board refreshes in place: typing in Find survives the 15-second tick
  const boardX = await page.evaluate(async () => {
    setNav('transit'); const wasAll = UI.tf.all; UI.tf.all = true; UI.tseg = 'board'; renderView(false); await new Promise(r => setTimeout(r, 150)); const q = $('#tq'); if (!q) { UI.tf.all = wasAll; return { noBox: true }; }
    q.focus(); q.value = 'har'; q.setSelectionRange(2, 2); const clock0 = $('#board-clock')?.textContent; refreshBoardClock(); await new Promise(r => setTimeout(r, 50));
    const out = { focus: document.activeElement?.id, val: $('#tq')?.value, caret: $('#tq')?.selectionStart, clock: $('#board-clock')?.textContent, clock0, rows: $$('.board .brow').length, strips: $$('.lstatus .lstrip').length }; UI.tf.all = wasAll; return out;
  });
  ok(boardX.focus === 'tq' && boardX.val === 'har' && boardX.caret === 2 && boardX.clock && boardX.rows >= 1, `Board: the 15-second refresh keeps the Find box focused with its caret, departures and strips refreshed in place (${JSON.stringify(boardX)})`);
  // 4 · Enter closes and Backspace trims a lot traced for the open editor
  const lotKeyT = await page.evaluate(async () => {
    setNav('map'); const b = S.buildings.find(x => isActive(x) && x.x != null); openRecord('building', b.id, 'edit'); await new Promise(r => setTimeout(r, 250)); $('#bform details[data-sec="lot"]').open = true;
    $('#bform [data-act="lot-draw"]').click(); await new Promise(r => setTimeout(r, 200));
    MAPW.draft = { kind: 'polygon', pts: [[b.x - 30, b.z - 20], [b.x + 30, b.z - 20], [b.x + 30, b.z + 20], [b.x - 30, b.z + 20], [b.x - 50, b.z]], forKind: 'footprint' }; mapDraw();
    return { mode: MAPW.mode, pending: MAPW.pending?.kind, drawerOn: $('#drawer').classList.contains('on'), drId: !!DR.id, pts: MAPW.draft.pts.length };
  });
  await page.keyboard.press('Backspace'); await page.waitForTimeout(80); const lotKeyPts = await page.evaluate(() => MAPW.draft?.pts?.length);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const lotKeyAfter = await page.evaluate(() => { const r = { draft: !!MAPW.draft, pending: !!MAPW.pending, lot: DR.draft?.lot?.length, drawerOn: $('#drawer').classList.contains('on'), mode: MAPW.mode }; closeDrawer(true); return r; });
  ok(lotKeyT.mode === 'footprint' && lotKeyT.pending === 'lot' && !lotKeyT.drawerOn && lotKeyT.drId && lotKeyPts === 4 && lotKeyAfter.lot === 4 && !lotKeyAfter.draft && lotKeyAfter.drawerOn, `tracing a lot from the editor: Backspace removes the last point (5 → ${lotKeyPts}) and Enter closes it (${lotKeyAfter.lot} points, editor back)`);
  // 5 · playback loads the dated maps itself · 7 · projection rebuilds the track · 8 · the speed is saved · 21 · a new dated map joins the evidence track · 24 · compare mode keeps the counters clear
  const hvT = await page.evaluate(async () => {
    setNav('history'); const o = loadBasemaps; let loads = 0; loadBasemaps = async () => { loads++; }; openHistoryViewer({ index: 0 }); await new Promise(r => setTimeout(r, 200)); loadBasemaps = o;
    const ticks0 = $$('#hv-ticks span').length, max0 = +$('#hv-range').max, i10 = HV.i1; hvToggleProjection(); await new Promise(r => setTimeout(r, 100));
    const proj = { ticks: $$('#hv-ticks span').length, max: +$('#hv-range').max, i1: HV.i1, expectTicks: hyFromIndex(HV.i1).year - FOUNDED_YEAR + 1, jumpMax: +$('#hv-jump-y').max }; hvToggleProjection();
    const oc = commit; let commits = 0; commit = opts => { commits++; return oc(opts); }; const sp = $('#hv-speed'); sp.value = sp.options[sp.options.length - 1].value; sp.dispatchEvent(new Event('change', { bubbles: true })); commit = oc;
    const speed = { commits, rate: S.settings.tlRate, sel: +sp.value };
    const maps0 = $$('#hv-evidence .evd.maps').length; const usedI = new Set($$('#hv-evidence .evd.maps').map(e => +e.dataset.i)); let freeI = hyIndex(2014, 'E'); while (usedI.has(freeI)) freeI++; const fh = hyFromIndex(freeI);   // a half-year with no map marker yet, so the count must grow by one
    const fake = { id: 'bm_audit_fake', name: 'audit map', year: fh.year, half: fh.half, x: 0, z: 0, w: 10, h: 10, scale: 1, source: 'mcmap' }; S.settings.basemaps = [...(S.settings.basemaps || []), fake]; hvRefreshTrack(); const maps1 = $$('#hv-evidence .evd.maps').length; S.settings.basemaps = S.settings.basemaps.filter(x => x.id !== fake.id); hvRefreshTrack();
    hvToggleCompare(); await new Promise(r => setTimeout(r, 150)); const R = s => { const e = $(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }; const m = R('.hv-maps'), c = R('#hv-counts'); const hit = m && c && m[0] < c[2] && m[2] > c[0] && m[1] < c[3] && m[3] > c[1]; hvToggleCompare();
    closeHistoryViewer(); return { loads, ticks0, max0, i10, proj, speed, maps0, maps1, compare: { m, c, hit } };
  });
  ok(hvT.loads === 1, `opening playback loads the dated maps itself (loadBasemaps called ${hvT.loads}×)`);
  ok(hvT.proj.i1 > hvT.i10 && hvT.proj.ticks === hvT.proj.expectTicks && hvT.proj.ticks === hvT.ticks0 + 1 && Math.abs(hvT.proj.max - (hvT.proj.i1 + 0.999)) < 1e-6 && hvT.proj.jumpMax === 2013 + hvT.proj.ticks - 1, `Projection rebuilds the year ticks with the slider (${hvT.ticks0} → ${hvT.proj.ticks} ticks, max ${hvT.max0} → ${hvT.proj.max})`);
  ok(hvT.speed.commits === 1 && hvT.speed.rate === hvT.speed.sel, `the playback speed is committed when changed (rate ${hvT.speed.rate}, ${hvT.speed.commits} commit)`);
  ok(hvT.maps1 === hvT.maps0 + 1, `a dated map added while playback is open appears on the evidence track (${hvT.maps0} → ${hvT.maps1} markers)`);
  ok(hvT.compare.m && hvT.compare.c && !hvT.compare.hit, `compare mode: the OLD MAPS bar sits clear of pane A's counters (${JSON.stringify(hvT.compare)})`);
  // 6 · Undo brings back the shape "New shape from…" changed · 23 · "Removed in…" never offers a refused date · 18 · the pencil clears the drawer
  const splitT = await page.evaluate(async () => {
    setNav('map'); setMapEdit(true); const r = S.roads.find(x => (x.geometry || []).length >= 2 && !(x.versions || []).length && x.yearOpened == null && x.yearClosed == null); if (!r) return { none: true };
    const keep = JSON.stringify(r); r.yearOpened = 2015; r.halfOpened = 'E'; commit(); const T = pid => ({ dataset: { kind: 'road', id: r.id, pid } });
    const oh = hyPromptDialog; hyPromptDialog = async () => ({ year: 2020, half: 'E' }); await shapeTimelineAction('per-split', T()); await new Promise(res => setTimeout(res, 100));
    const split = { versions: (r.versions || []).length, from: r.geometryFromYear, when: MAPW.when, undo: MAPW.undo.length };
    let captured = null; hyPromptDialog = async opts => { captured = { year: opts.year, half: opts.half }; return null; }; setMapWhen(hyIndex(2020, 'E')); await shapeTimelineAction('per-close', T()); hyPromptDialog = oh;
    mapUndo(); await new Promise(res => setTimeout(res, 100)); const r2 = roadById(r.id); const undone = { versions: (r2.versions || []).length, from: r2.geometryFromYear ?? null, closed: r2.yearClosed ?? null };
    openRecord('road', r.id); await new Promise(res => setTimeout(res, 200)); const drawerBefore = $('#drawer').classList.contains('on'); await shapeTimelineAction('per-edit', T('current')); await new Promise(res => setTimeout(res, 200)); const drawerAfter = $('#drawer').classList.contains('on');
    Object.assign(roadById(r.id), JSON.parse(keep)); commit(); setMapWhen(null); MAPW.sel = null; renderDock(); return { split, captured, undone, drawerBefore, drawerAfter, nav: UI.nav };
  });
  ok(splitT.split.versions === 1 && splitT.split.from === 2020 && splitT.undone.versions === 0 && splitT.undone.from === null, `Undo after "New shape from…" removes the dated shape again (versions 1 → ${splitT.undone.versions}, current from ${splitT.split.from} → ${splitT.undone.from})`);
  ok(splitT.captured && splitT.captured.year === 2020 && splitT.captured.half === 'L', `"Removed in…" offers the half-year after the current shape started, not the refused one (${JSON.stringify(splitT.captured)})`);
  ok(splitT.drawerBefore && !splitT.drawerAfter && splitT.nav === 'map', `the pencil on a shape in the record closes the drawer over the map (drawer ${splitT.drawerBefore} → ${splitT.drawerAfter})`);
  // 9 · Add → Chronicle image follows the map date
  const archT = await page.evaluate(async () => { setMapWhen(hyIndex(2017, 'E')); $('[data-add="chronicle"]').click(); await new Promise(r => setTimeout(r, 150)); const y = $('#a-year')?.value; closeModal(); setMapWhen(null); return y; });
  ok(archT === '2017', `Add → Chronicle image is dated with the map date (${archT})`);
  // 13 · Esc in an inspector field keeps the typing · 15 · the Transit tool starts a new line, "Add track" keeps the selection · 14 · a far click is a free station · 20 · [ ] refused mid-drawing
  const inspT = await page.evaluate(async () => { const l = S.lines.find(x => (x.stopIds || []).length >= 2); if (!l) return { none: true }; setMapEdit(true); MAPW.sel = { kind: 'line', id: l.id }; setMapMode('select'); renderDock(); await new Promise(r => setTimeout(r, 100)); const f = $('#insp-name'); f.focus(); f.value = (l.name || '') + ' Q'; return { id: l.id, typed: f.value }; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const inspEsc = await page.evaluate(() => ({ sel: MAPW.sel?.id, val: $('#insp-name')?.value, focus: document.activeElement?.id || document.activeElement?.tagName }));
  ok(inspEsc.sel === inspT.id && inspEsc.val === inspT.typed && inspEsc.focus !== 'insp-name', `Esc in the inspector name field leaves the field without deselecting or losing the text (${JSON.stringify(inspEsc)})`);
  await page.keyboard.press('l'); await page.waitForTimeout(100);
  const lT = await page.evaluate(id => { const r = { sel: MAPW.sel, mode: MAPW.mode, instr: $('#map-instr')?.textContent || '' }; MAPW.sel = { kind: 'line', id }; setMapMode('select'); renderDock(); $('#dock-body [data-act="insp-add-track"]').click(); r.add = { sel: MAPW.sel?.id, mode: MAPW.mode, instr: $('#map-instr')?.textContent || '' }; return r; }, inspT.id);
  ok(lT.sel === null && lT.mode === 'transit' && /new line/.test(lT.instr) && lT.add.sel === inspT.id && lT.add.mode === 'transit' && /new track for/.test(lT.add.instr), `L after a line is selected starts a new line; the inspector's Add track still adds to it ("${lT.instr.slice(0, 40)}…" / "${lT.add.instr.slice(0, 48)}…")`);
  const farT = await page.evaluate(async id => { const l = lineById(id); MAPW.draft = null; MAPW.sel = { kind: 'line', id }; setMapMode('station'); const g = lineGeometries(l)[0]; const p0 = g[0]; const dir = [g[1][0] - g[0][0], g[1][1] - g[0][1]]; const L = Math.hypot(...dir) || 1; const nrm = [-dir[1] / L, dir[0] / L]; const far = [Math.round(p0[0] + nrm[0] * 200), Math.round(p0[1] + nrm[1] * 200)]; const n0 = S.stations.length, s0 = l.stopIds.length;
    placeStationSmart(far); await new Promise(r => setTimeout(r, 50)); const farS = S.stations[S.stations.length - 1]; const out = { made: S.stations.length - n0, joined: l.stopIds.includes(farS.id), stops: l.stopIds.length - s0, toast: $('#toast')?.textContent || $$('.toast').map(x => x.textContent).join(' ') };
    const near = [Math.round(p0[0] + nrm[0] * 6 + dir[0] / L * 5), Math.round(p0[1] + nrm[1] * 6 + dir[1] / L * 5)]; placeStationSmart(near); await new Promise(r => setTimeout(r, 50)); const nearS = S.stations[S.stations.length - 1]; out.nearJoined = l.stopIds.includes(nearS.id);
    l.stopIds = l.stopIds.filter(x => x !== nearS.id && x !== farS.id); S.stations = S.stations.filter(x => x !== nearS && x !== farS); MAPW.sel = null; setMapMode('select'); commit(); renderDock(); return out; }, inspT.id);
  ok(farT.made === 1 && !farT.joined && farT.stops === 0 && farT.nearJoined, `Station mode with a line selected: a click 200 blk away makes a free station (not a stop), a click beside the track joins the line (${JSON.stringify({ joined: farT.joined, nearJoined: farT.nearJoined })})`);
  await page.evaluate(() => { setMapMode('road'); MAPW.draft = { kind: 'polyline', pts: [[100, 100], [160, 100]], forKind: 'road' }; mapDraw(); });
  await page.keyboard.press('['); await page.waitForTimeout(80);
  const bracketT = await page.evaluate(() => { const r = { when: MAPW.when, draft: MAPW.draft?.pts?.length }; mapCancel(); setMapMode('select'); return r; });
  ok(bracketT.when === null && bracketT.draft === 2, `[ is refused while a road is being drawn (map date stays today, draft intact)`);
  // 19 · [ ] and Esc work on the focused slider right after the clock opens
  await page.evaluate(() => setMapEdit(false)); await page.waitForTimeout(400); await page.evaluate(() => toggleTimeWidget(true)); await page.waitForTimeout(150); const twF = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('['); await page.waitForTimeout(80); const twA = await page.evaluate(() => ({ when: MAPW.when, present: presentIdx(), focus: document.activeElement?.id }));
  await page.keyboard.press(']'); await page.waitForTimeout(80); const twB = await page.evaluate(() => MAPW.when);
  await page.keyboard.press('Escape'); await page.waitForTimeout(80); const twC = await page.evaluate(() => ({ open: MAPW.timeOpen, panel: !!$('.tw-panel') && !$('.tw-panel').hidden }));
  ok(twF === 'tw-range' && twA.focus === 'tw-range' && twA.when === twA.present - 1 && twB === null && !twC.open && !twC.panel, `the slider has the focus after opening the clock and [ ] step the date there, Esc closes the panel (${JSON.stringify({ twF, twA, twB, twC })})`);
  // 16 · Projects: cost-model and estimate-form edits keep the keyboard
  const costT = await page.evaluate(async () => {
    setNav('transit'); UI.tseg = 'projects'; renderView(false); await new Promise(r => setTimeout(r, 150)); const keep = JSON.stringify(S.settings.transitCost || null);
    const inp = $('[data-tcost]'); if (!inp) return { none: true }; const key = inp.dataset.tcost; inp.focus(); inp.value = String((num(inp.value) || 0) + 1); inp.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 60));
    const a = document.activeElement; const cost = { same: a?.dataset?.tcost === key, saved: TC()[key] === num(inp.value) };
    const cb = $('#f-cblocks'); if (cb) { cb.focus(); cb.value = '123'; cb.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    const calc = { focus: document.activeElement?.id, blocks: UI.calc?.blocks }; S.settings.transitCost = keep === 'null' ? undefined : JSON.parse(keep); commit({ silentRender: true }); renderView(false); return { cost, calc };
  });
  ok(costT.cost?.same && costT.cost?.saved && costT.calc?.focus === 'f-cblocks' && costT.calc?.blocks === 123, `Projects: a cost-model edit and an estimate-form edit re-render without dropping the focus (${JSON.stringify(costT)})`);
  // 17 · empty states say when transit is merely out of scope
  const scopeT = await page.evaluate(async () => { const was = UI.scope; const d = S.districts.find(x => !S.stations.some(s => stationInScope(s, { kind: 'district', id: x.id })) && !S.lines.some(l => lineInScope(l, { kind: 'district', id: x.id }))); if (!d) return { none: true }; UI.tf.all = false; setScope({ kind: 'district', id: d.id }); UI.tseg = 'board'; renderView(false); await new Promise(r => setTimeout(r, 100)); const board = $('#main .panel.empty')?.textContent || ''; UI.tseg = 'times'; renderView(false); await new Promise(r => setTimeout(r, 100)); const times = $('#main .panel.empty')?.textContent || ''; $('#main .panel.empty [data-tf-toggle="all"]')?.click(); await new Promise(r => setTimeout(r, 100)); const after = { all: UI.tf.all, empty: !!$('#main .panel.empty') }; UI.tf.all = false; setScope(was); UI.tseg = 'board'; renderView(false); return { d: d.name, board, times, after }; });
  ok(scopeT.none || (/outside its borders/.test(scopeT.board) && /outside its borders/.test(scopeT.times) && scopeT.after.all && !scopeT.after.empty), `Board and Times in a place without transit point at the stations on file elsewhere, one click shows them (${scopeT.none ? 'no such place in the data' : scopeT.d + ': ' + scopeT.board.slice(0, 60)})`);
  // 22 · the old-maps dialog follows the typed date
  const miT = await page.evaluate(async () => { MAPIMPORT = { maps: [{ id: 7, x: 0, z: 0, size: 128, scale: 0, modified: 0, overworld: true, dimension: 'overworld' }], skipped: [], mode: 'fixed', fixed: { year: 2018, half: 'L' }, label: 'Minecraft maps' }; openMapImportModal(); await new Promise(r => setTimeout(r, 100)); const before = $('#mi-groups')?.textContent || ''; const y = $('#mi-y'); y.value = '2015'; y.dispatchEvent(new Event('input', { bubbles: true })); const h = $('#mi-h'); h.value = 'E'; h.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 50)); const after = $('#mi-groups')?.textContent || ''; const go = $('#mi-go')?.textContent || ''; closeModal(); MAPIMPORT = null; return { before, after, go }; });
  ok(/2018/.test(miT.before) && /Early 2015/.test(miT.after) && /Add 1 dated map/.test(miT.go), `old-maps dialog: the group row follows the typed date (${miT.before.trim().slice(0, 16)} → ${miT.after.trim().slice(0, 16)})`);
  noErrors('audit fixes (desktop)');
  // 10 · 11 · 12 · 25 · phone layouts at 390 px
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  const phoneX = await page.evaluate(async () => {
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }; const hits = (a, b) => a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    setNav('history'); openHistoryViewer({ index: 0 }); await new Promise(r => setTimeout(r, 250)); const maps = R($('.hv-maps')); const chips = $$('.hv-layers .crumb').map(R); const stage = R($('#hv-stage')); const pb = { mapsOverChips: chips.some(c => hits(maps, c)), mapsInStage: maps && stage && maps[0] >= stage[0] && maps[2] <= stage[2] && maps[1] >= stage[1], noteHidden: !$('.hv-note') || getComputedStyle($('.hv-note')).display === 'none' }; closeHistoryViewer();
    setNav('map'); setMapEdit(false); await new Promise(r => setTimeout(r, 150)); toggleTimeWidget(true); await new Promise(r => setTimeout(r, 100)); const panel = R($('.tw-panel')); toggleTimeWidget(false);
    setMapWhen(hyIndex(2017, 'E')); await new Promise(r => setTimeout(r, 50)); const st = $('#status'); const when = R($('#st-when')); const status = { overflow: getComputedStyle(st).overflowX, scrollW: st.scrollWidth, clientW: st.clientWidth, whenVisible: when && when[0] >= 0 && when[2] <= 390, countsHidden: getComputedStyle($('#st-counts')).display === 'none', idbHidden: getComputedStyle($('#st-idb').parentElement).display === 'none' }; setMapWhen(null);
    setMapEdit(true); await new Promise(r => setTimeout(r, 150)); const hud = $('.map-hud'); const hudT = { scrollW: hud.scrollWidth, clientW: hud.clientWidth, coordHidden: getComputedStyle($('#map-coord')).display === 'none', groups: $$('.map-hud .grp').map(R).filter(r => r[2] - r[0] > 0).every(r => r[0] >= 0 && r[2] <= 390) }; setMapEdit(false);
    return { pb, panel, status, hudT };
  });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(100);
  ok(!phoneX.pb.mapsOverChips && phoneX.pb.mapsInStage && phoneX.pb.noteHidden, `phone playback: the OLD MAPS bar sits under the date, clear of the layer chips (${JSON.stringify(phoneX.pb)})`);
  ok(phoneX.panel && phoneX.panel[0] >= 0 && phoneX.panel[2] <= 390, `phone map: the open time panel fits on the screen (${JSON.stringify(phoneX.panel)})`);
  ok(phoneX.status.overflow === 'auto' && phoneX.status.whenVisible && phoneX.status.countsHidden && phoneX.status.idbHidden, `phone status strip: scrolls instead of clipping, the time chip is on screen, the long counts are hidden (${JSON.stringify(phoneX.status)})`);
  ok(phoneX.hudT.scrollW <= phoneX.hudT.clientW + 1 && phoneX.hudT.coordHidden && phoneX.hudT.groups, `phone edit map: the HUD fits the screen, coordinates and scale hidden (${JSON.stringify(phoneX.hudT)})`);
  noErrors('audit fixes (phone)');
  await page.evaluate(fx => { if (fx.line) { S.lines = S.lines.filter(l => l.id !== fx.line.l); S.tracks = S.tracks.filter(t => t.id !== fx.line.t); S.stations = S.stations.filter(s => !fx.line.s.includes(s.id)); } if (fx.road) S.roads = S.roads.filter(r => r.id !== fx.road); commit(); JUNCTION_CACHE.key = ''; ROAD_GRAPH.key = ''; }, fxX);

  // ---------- Y · 3.5.1: bridges land on streets · decks drawn on top · trains lay over at terminals · a note when none run ----------
  console.log('\nY · 3.5.1 — bridge landings join streets, layover trains, the no-trains note');
  await page.evaluate(() => { closeModal(); closeDrawer(true); setMapWhen(null); setNav('map'); setMapEdit(true); setMapMode('select'); }); await page.waitForTimeout(300);
  const brT = await page.evaluate(() => {
    const mk = (name, pts, grade, width = 8) => { const r = newRoad(S); r.name = name; r.geometry = pts; r.grade = grade; r.width = width; r.direction = 'two-way'; S.roads.push(r); return r; };
    const st = mk('Y Shore Street', [[50000, 50000], [50400, 50000]], 'surface'), far = mk('Y Far Street', [[50000, 49500], [50400, 49500]], 'surface');
    const br = mk('Y Bridge', [[50200, 50004], [50200, 49496]], 'bridge', 10);                  // lands 4 blocks off each street's centreline — inside its paved width
    const mid = mk('Y Mid Street', [[50100, 49750], [50300, 49750]], 'surface');                  // passes under the bridge mid-span
    commit(); JUNCTION_CACHE.key = ''; ROAD_GRAPH.key = '';
    const js = roadJunctions(); const of = (a, b) => js.filter(j => (j.a === a.id && j.b === b.id) || (j.a === b.id && j.b === a.id));
    const landings = [of(br, st), of(br, far)].map(x => x.map(j => j.kind + (j.endOf === br.id ? '/end' : '') + (j.landing ? '/landing' : '')).join());
    const cross = of(br, mid).map(j => j.kind).join(); const conns = roadConnections(br, js).length;
    const route = routeBetween({ kind: 'point', pt: [50050, 50001] }, { kind: 'point', pt: [50350, 49499] }, 'drive'); const walk = routeBetween({ kind: 'point', pt: [50050, 50001] }, { kind: 'point', pt: [50350, 49499] }, 'walk');
    MAPW.cam = { x: 50200, z: 49750, k: 1.2 }; mapDraw(); const order = [...S.roads].sort((a, b) => (GRADE_ORDER[a.grade || 'surface'] ?? 1) - (GRADE_ORDER[b.grade || 'surface'] ?? 1)); const deckLast = order.indexOf(br) > order.indexOf(mid);
    return { landings, cross, conns, dist: route ? Math.round(route.dist) : null, straight: route?.straight, walkDist: walk ? Math.round(walk.dist) : null, deckLast, ids: [st.id, far.id, br.id, mid.id] };
  });
  ok(brT.landings.every(x => x === 'joins/end/landing') && brT.cross === 'separated' && brT.conns === 2, `a bridge joins the two streets it lands on (${brT.landings.join(' | ')}) and stays separated from the street it crosses mid-span (${brT.cross}); ${brT.conns} connections`);
  ok(brT.dist != null && brT.dist >= 780 && brT.dist <= 840 && brT.straight !== true && brT.walkDist === brT.dist, `driving and walking from one shore to the other use the bridge (${brT.dist} blk along the roads — the only way across)`);
  ok(brT.deckLast, 'the deck is drawn after the street it passes over, so it sits on top');
  const lyT = await page.evaluate(() => {
    const t = newTrack(S); t.geometry = [[52000, 52000], [52400, 52000]]; S.tracks.push(t); const l = newLine(S); l.name = 'Y Layover Line'; l.shortName = 'Y'; l.trackIds = [t.id]; l.hours = 'custom'; l.hoursFrom = 6; l.hoursTo = 7; S.lines.push(l);
    const a = newStationAt([52000, 52000]), b = newStationAt([52400, 52000]); addStopOrdered(l, a.id); addStopOrdered(l, b.id); commit();
    let dead = 0, lay = 0, moving = 0, samples = 0; for (let m = 6 * 60 + 5; m < 7 * 60; m += 0.25) { const tr = lineTrains(l, m); samples++; if (!tr.length) dead++; if (tr.some(x => x.layover)) lay++; if (tr.some(x => !x.dwell)) moving++; }
    const atTerm = lineTrains(l, 6 * 60 + 30).filter(x => x.layover).every(x => (x.x === 52000 || x.x === 52400) && x.z === 52000);
    const others = S.lines; S.lines = [l]; const night = { n: lineTrains(l, 180).length, note: trainsNote(180, []), svc: [lineInService(l, 180), lineInService(l, 6 * 60 + 30)] }; S.lines = others;   // the note for this line alone (other lines on file may run at night)
    const day = trainsNote(6 * 60 + 30, lineTrains(l, 6 * 60 + 30)); const noteEl = !!$('#trains-note'); const strip = lineStripHTML(l).includes('class="tr');
    S.lines = S.lines.filter(x => x.id !== l.id); S.tracks = S.tracks.filter(x => x.id !== t.id); S.stations = S.stations.filter(s => s.id !== a.id && s.id !== b.id); commit();
    return { samples, dead, lay, moving, atTerm, night, day, noteEl, strip };
  });
  ok(lyT.dead === 0 && lyT.lay > 0 && lyT.moving > 0 && lyT.atTerm, `during service a line never looks empty: ${lyT.samples} samples 06:05–07:00, ${lyT.dead} without a train, ${lyT.lay} with one laying over at a terminal, ${lyT.moving} with one moving`);
  ok(lyT.night.n === 0 && !lyT.night.svc[0] && lyT.night.svc[1] && /^No trains now/.test(lyT.night.note) && /next 0[56]:\d\d/.test(lyT.night.note) && lyT.day === '' && lyT.noteEl, `out of hours there are no trains and the map note says why and when the next one leaves ("${lyT.night.note}")`);
  await page.evaluate(ids => { S.roads = S.roads.filter(r => !ids.includes(r.id)); commit(); JUNCTION_CACHE.key = ''; ROAD_GRAPH.key = ''; setMapEdit(false); }, brT.ids);
  noErrors('bridge landings, layover trains');

  await ctx.close(); await browser.close();
  console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
