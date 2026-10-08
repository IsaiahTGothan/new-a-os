/* =====================================================================
   §14 HISTORY — playback (animated half-year viewer) · demolished records ·
       chronicle · statistics. Counting is strict: undated records are
       reported, never shown as new construction.
   ===================================================================== */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const histRowsAll = () => scopeBuildings();
const histFiltersActive = () => { const f = UI.hf; return !!(f.district || f.hood || f.builtMin || f.builtMax || f.demoMin || f.demoMax || f.conf || UI.q.trim()); };
function histFiltered() {
  const f = UI.hf, q = UI.q.trim().toLowerCase(); const idx = relIndex();
  let out = histRowsAll().filter(isHist).filter(b => {
    if (f.district && b.districtId !== f.district) return false;
    if (f.hood && b.neighborhoodId !== f.hood) return false;
    if (f.builtMin && (num(b.yearBuilt) ?? -Infinity) < +f.builtMin) return false;
    if (f.builtMax && (num(b.yearBuilt) ?? Infinity) > +f.builtMax) return false;
    if (f.demoMin && (num(b.yearDemolished) ?? -Infinity) < +f.demoMin) return false;
    if (f.demoMax && (num(b.yearDemolished) ?? Infinity) > +f.demoMax) return false;
    if (f.conf && (b.confidence || '') !== f.conf) return false;
    if (q && !matchesQ(haystack(b, idx), q)) return false;
    return true;
  });
  const { key, dir } = UI.hsort;
  out.sort((a, b) => { const va = sortValue(a, key), vb = sortValue(b, key); return (va < vb ? -1 : va > vb ? 1 : 0) * dir || a.reg.localeCompare(b.reg); });
  return out;
}
function renderHistory() {
  const rows = histRowsAll(); const hist = rows.filter(isHist); const arch = scopeArchive(); const und = undatedOf(rows);
  const segs = [['playback', 'Playback', 'play'], ['records', `Demolished records`, 'hist'], ['chronicle', 'Chronicle', 'img'], ['stats', 'Statistics', 'db']];
  return `
  <section class="dhead" style="margin-bottom:14px">
    <div><div class="code hist"><i></i>HISTORY · ${esc(scopeName().toUpperCase())} · ${hist.length} DEMOLISHED · ${arch.length} CHRONICLE IMAGES · ${FOUNDED_YEAR} → ${CURRENT_YEAR}</div><h2>History</h2><p>Every half-year since the founding, animated: what rose, what fell, what opened. Plus the buildings that no longer stand, the pictures that prove it, and the statistics behind the change. Nothing undated is ever shown as new.</p></div>
    <div class="stats"><button class="btn sm" data-act="export-hist-csv">${icon('down')} Historical CSV</button><button class="btn sm primary" data-act="new-hist">${icon('plus')} Add demolished building</button></div>
  </section>
  <div class="toolbar" style="margin:0 0 16px">
    <div class="seg lg" role="group" aria-label="Section">${segs.map(([id, l, ic]) => `<button data-hseg="${id}" aria-pressed="${UI.hseg === id}" class="${UI.hseg === id ? 'hist' : ''}">${icon(ic)} ${l}${id === 'records' ? ` <span class="cnt" style="font-family:var(--font-mono);font-size:11px;opacity:.8">${hist.length}</span>` : id === 'chronicle' ? ` <span class="cnt" style="font-family:var(--font-mono);font-size:11px;opacity:.8">${arch.length}</span>` : ''}</button>`).join('')}</div>
    <span class="spacer"></span>
    ${und.built || und.demolished || und.construction ? `<span class="undated">${[und.built ? `${und.built} undated building${und.built === 1 ? '' : 's'}` : '', und.construction ? `${und.construction} undated project${und.construction === 1 ? '' : 's'}` : '', und.demolished ? `${und.demolished} demolition${und.demolished === 1 ? '' : 's'} missing a date` : ''].filter(Boolean).join(' · ')} — kept out of playback</span>` : ''}
  </div>
  ${UI.hseg === 'records' ? renderHistRecords(hist) : UI.hseg === 'chronicle' ? renderChronicleSection() : UI.hseg === 'stats' ? renderHistStats(rows) : renderPlaybackSection(rows)}`;
}
function historyAfterRender() { const c = $('#play-preview'); if (c) drawPreview(c); }
function drawPreview(c) {
  const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); c.width = r.width * dpr; c.height = r.height * dpr; const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ext = scopeExtent(); const cam = { x: 0, z: 0, k: 1 }; if (ext) { const pad = 30; cam.k = clamp(Math.min((r.width - pad * 2) / Math.max(120, ext.x2 - ext.x1), (r.height - pad * 2) / Math.max(120, ext.z2 - ext.z1)), 0.02, 10); cam.x = (ext.x1 + ext.x2) / 2; cam.z = (ext.z1 + ext.z2) / 2; }
  drawScene({ ctx, W: r.width, H: r.height, cam, layers: { ...UI.layers, grid: false, labels: false, businesses: false }, hy: hyIndex(CURRENT_YEAR, CURRENT_HALF), buildings: scopeBuildings().filter(b => b.x != null), districts: visibleDistricts(), hoods: visibleHoods(), handles: false, showJunctions: false, refOverlay: true });
}
function renderPlaybackSection(rows) {
  const { i1 } = hyRange(rows); const now_ = hyCounts(rows, i1); const start = hyCounts(rows, 0); const und = undatedOf(rows);
  const events = []; for (let i = 0; i <= i1; i++) for (const e of hyEvents(rows, i)) if (e.b) events.push({ i, ...e });
  const kpi = (lbl, val, cls = '') => `<div class="kpi"><span class="lbl">${lbl}</span><span class="val ${cls}">${val}</span></div>`;
  const recent = []; for (let i = i1; i >= Math.max(0, i1 - 11); i--) { const c = hyCounts(rows, i); const ev = hyEvents(rows, i); recent.push({ i, c, built: ev.filter(e => e.kind === 'built').length, started: ev.filter(e => e.kind === 'started').length, demolished: ev.filter(e => e.kind === 'demolished').length, infra: ev.filter(e => e.o).length }); }
  return `
  <section class="panel hud playhero" style="margin-bottom:16px">
    <div class="pv" data-act="open-playback"><canvas id="play-preview"></canvas><span class="badge">${esc(hyLabel(...Object.values(hyFromIndex(i1))).toUpperCase())} · ${esc(scopeName().toUpperCase())}</span><div class="go"><button class="btn primary">${icon('play')} Open playback</button></div></div>
    <div class="side">
      <h3>PLAYBACK · ${(i1 + 1)} HALF-YEARS</h3>
      <p>Early 2013, Late 2013, Early 2014… each step animates what changed in that half-year, with the camera held still. Scrub, jump to a date, or let it run.</p>
      ${kpi('STANDING TODAY', `${now_.standing}<small>completed · from ${start.standing} in Early ${FOUNDED_YEAR}</small>`)}
      ${kpi('UNDER WAY TODAY', `${now_.construction + now_.planned}<small>${now_.planned} planned</small>`, 'warn')}
      ${kpi('DEMOLISHED', `${now_.gone}<small>dated demolitions</small>`, 'hist')}
      ${kpi('DATED EVENTS', `${events.length}<small>completions, starts, demolitions</small>`)}
      ${kpi('KEPT OUT · UNDATED', `${now_.undated}<small>${und.built} buildings · ${und.construction} projects · ${und.demolished} demolitions</small>`)}
      <div class="acts"><button class="btn primary" data-act="open-playback">${icon('play')} Play from ${FOUNDED_YEAR}</button><button class="btn" data-act="open-playback-now">${icon('clock')} Open at today</button><button class="btn" data-act="export-timeline-csv">${icon('down')} Year-by-year CSV</button></div>
    </div>
  </section>
  <section class="grid cols-2" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>CONSTRUCTION VS DEMOLITION</h3><span class="note">click a year to open playback there</span></div>${renderBuildDemoChart(rows, { W: 640, H: 210 })}</div>
    <div class="panel hud"><div class="panel-head"><h3>LAST TWELVE HALF-YEARS</h3><span class="note">strict counts · click to open</span></div>
      <div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics" style="min-width:0"><thead><tr><th>HALF-YEAR</th><th class="r">COMPLETED</th><th class="r">STARTED</th><th class="r">DEMOLISHED</th><th class="r">INFRA</th><th class="r">STANDING</th><th class="r">UNDER WAY</th></tr></thead><tbody>
      ${recent.map(r => { const { year, half } = hyFromIndex(r.i); return `<tr data-act="hv-open-at" data-i="${r.i}" style="cursor:pointer"><td class="mname">${esc(hyLabel(year, half))}</td><td class="num r">${r.built || '—'}</td><td class="num r" style="color:var(--warn)">${r.started || '—'}</td><td class="num r hist">${r.demolished || '—'}</td><td class="num r" style="color:var(--transit)">${r.infra || '—'}</td><td class="num r hi">${r.c.standing}</td><td class="num r">${r.c.construction + r.c.planned}</td></tr>`; }).join('')}
      </tbody></table></div></div>
  </section>
  ${renderChronicleStrip()}`;
}

/* ============ the animated viewer ============ */
const HV = { open: false, i: 0, from: 0, to: 0, t: 1, playing: false, speed: 1, lastTick: 0, raf: null, cam: { x: 0, z: 0, k: 1 }, w: 0, h: 0, canvas: null, ctx: null, canvasB: null, ctxB: null, projection: false, refOverlay: false, follow: false, full: false, list: true, layers: null, rows: [], i1: 0, drag: null, dockFit: true, lastEventsKey: '', compare: false, b: 0, loop: false, filter: { district: '', kinds: { buildings: true, roads: true, transit: true, biz: true } } };
/* playback rate in half-years per second; the playhead moves continuously and effects fire as it crosses each change */
const HV_RATES = [[0.1, '1 year / 20 s'], [0.25, '1 year / 8 s'], [0.5, '1 year / 4 s'], [1, '1 year / 2 s'], [2, '1 year / s'], [4, '2 years / s']];
const HV_FX_MS = 650; HV.rate = 0.5; HV.pos = 0; HV.fx = null;
const hvMonth = pos => { const i = Math.floor(pos); const f = clamp(pos - i, 0, 0.999); return (i % 2 ? 6 : 0) + Math.floor(f * 6); };
/* the records the viewer shows after the Place filter */
const hvRows = () => HV.filter.district ? HV.rows.filter(b => b.districtId === HV.filter.district) : HV.rows;
/* layers with the kind filters applied */
const hvLayers = () => { const K = HV.filter.kinds; return { ...HV.layers, stations: HV.layers.transit && K.transit, transit: HV.layers.transit && K.transit, roads: HV.layers.roads && K.roads, buildings: HV.layers.buildings !== false && K.buildings, businesses: !!K.biz && !!HV.layers.businesses }; };
/* events at a half-year, after the filters */
function hvEventsAt(i) { const K = HV.filter.kinds; return hyEvents(hvRows(), i, { projection: HV.projection }).filter(e => e.b ? K.buildings : /^road/.test(e.kind) ? K.roads : /^(line|station)/.test(e.kind) ? K.transit : /^biz/.test(e.kind) ? K.biz : true); }
/* a building's state at i is inferred when the date that puts it there is approximate or has no half */
function inferredAt(b, i, st) { if (st === 'standing') return !!(b.yearBuiltApprox || !b.halfBuilt); if (st === 'gone') return !!(b.yearDemolishedApprox || !b.halfDemolished); if (st === 'construction') return !!((b.yearStarted != null ? (b.yearStartedApprox || !b.halfStarted) : (b.yearBuiltApprox || !b.halfBuilt))); return false; }
const hyIndexOfArchive = a => hyIndex(a.year, a.month ? (a.month <= 6 ? 'E' : 'L') : '');
/* half-years that carry evidence: chronicle images, dated basemaps, world snapshots */
function hvEvidence() { const out = new Map(); const add = (i, kind) => { if (i == null || i < 0 || i > HV.i1) return; const e = out.get(i) || out.set(i, { chron: 0, maps: 0, world: 0 }).get(i); e[kind]++; }; for (const a of scopeArchive()) add(hyIndexOfArchive(a), 'chron'); for (const bm of S.settings.basemaps || []) if (bm.year != null) add(hyIndex(bm.year, bm.half || ''), 'maps'); for (const w of (S.world?.snapshots || [])) if (w.year != null) add(hyIndex(w.year, w.half || ''), 'world'); return out; }
function hvNextChange(dir) { let i = HV.to + dir; while (i >= 0 && i <= HV.i1) { if (hvEventsAt(i).length) return i; i += dir; } return null; }
function openHistoryViewer({ index = 0, year = null, half = null } = {}) {
  HV.rows = scopeBuildings(); HV.layers = HV.layers || { regions: true, districts: true, hoods: false, roads: true, transit: true, stations: true, buildings: true, footprints: true, businesses: false, labels: false, grid: false, historical: true, ghostsAll: false, evidence: true, basemap: true };
  if (HV.filter.district && !scopeDistricts().some(d => d.id === HV.filter.district)) HV.filter.district = '';
  const { i1 } = hyRange(HV.rows, { projection: HV.projection }); HV.i1 = i1;
  let i = year != null ? clamp(hyIndex(year, half || 'E'), 0, i1) : clamp(index, 0, i1);
  HV.rate = S.settings.tlRate ?? HV.rate ?? 0.5; HV.i = HV.from = HV.to = i; HV.pos = i; HV.fx = null; HV.b = clamp(HV.b || i1, 0, i1); HV.t = 1; HV.playing = false; HV.open = true; document.body.classList.add('hv-open');
  const root = $('#hv-root'); root.hidden = false; root.classList.toggle('full', HV.full);
  root.innerHTML = hvHTML(); HV.canvas = $('#hv-canvas'); HV.ctx = HV.canvas.getContext('2d'); HV.canvasB = $('#hv-canvas-b'); HV.ctxB = HV.canvasB ? HV.canvasB.getContext('2d') : null;
  hvResize(); const ext = scopeExtent(); if (ext) { const pad = 50; HV.cam.k = clamp(Math.min((HV.w - pad * 2) / Math.max(120, ext.x2 - ext.x1), (HV.h - pad * 2) / Math.max(120, ext.z2 - ext.z1)), 0.02, 10); HV.cam.x = (ext.x1 + ext.x2) / 2; HV.cam.z = (ext.z1 + ext.z2) / 2; }
  if (HV.camHint) { HV.cam.x = HV.camHint.x; HV.cam.z = HV.camHint.z; HV.cam.k = Math.max(HV.cam.k, 3); HV.camHint = null; }
  loadBasemaps(); hvWire(); hvUpdateChrome(); hvDraw();   // the dated maps may not be loaded yet when playback opens before the Map page
  if (!HV.resizeBound) { window.addEventListener('resize', () => { if (HV.open) { hvResize(); hvDraw(); } }); HV.resizeBound = true; }
}
function closeHistoryViewer() { hvPause(); hideHover(); HV.open = false; document.body.classList.remove('hv-open'); const root = $('#hv-root'); root.hidden = true; root.innerHTML = ''; }
/* the eras, year ticks and evidence markers under the slider — rebuilt whenever the range changes (projection) or dated maps are added */
function hvTrackParts() {
  const i1 = HV.i1; const eras = ERAS.filter(e => hyIndex(e.from, 'E') <= i1).map(e => { const a = hyIndex(e.from, 'E'), b = Math.min(i1 + 1, hyIndex(e.to, 'E')); return `<span data-era="${a}" style="flex:${Math.max(1, b - a)} 0 0">${esc(e.name.toUpperCase())}</span>`; }).join('');
  const ticks = []; for (let y = FOUNDED_YEAR; y <= hyFromIndex(i1).year; y++) ticks.push(`<span data-i="${hyIndex(y, 'E')}">${(hyFromIndex(i1).year - FOUNDED_YEAR) > 8 && (y - FOUNDED_YEAR) % 2 ? '' : y}</span>`);
  const ev = hvEvidence();
  const evid = [...ev.entries()].map(([i, e]) => `<span class="evd ${e.maps ? 'maps' : ''} ${e.world ? 'world' : ''}" style="left:${(i / Math.max(1, i1) * 100).toFixed(2)}%" title="${esc(hyLabel(...Object.values(hyFromIndex(i))))}: ${[e.chron ? `${e.chron} chronicle image${e.chron === 1 ? '' : 's'}` : '', e.maps ? `${e.maps} dated map${e.maps === 1 ? '' : 's'}` : '', e.world ? `${e.world} world snapshot${e.world === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}" data-i="${i}"></span>`).join('');
  return { eras, ticks: ticks.join(''), evid };
}
function hvRefreshTrack() { if (!HV.open) return; const p = hvTrackParts(); const set = (id, h) => { const el = $(id); if (el) el.innerHTML = h; }; set('#hv-eras', p.eras); set('#hv-ticks', p.ticks); set('#hv-evidence', p.evid); const r = $('#hv-range'); if (r) r.max = HV.i1 + 0.999; const rb = $('#hv-range-b'); if (rb) rb.max = HV.i1; const jy = $('#hv-jump-y'); if (jy) jy.max = hyFromIndex(HV.i1).year; }
function hvHTML() {
  const i1 = HV.i1; const { eras, ticks, evid } = hvTrackParts();
  const L = HV.layers; const K = HV.filter.kinds; const dists = scopeDistricts();
  return `<div class="hv ${HV.list ? '' : 'nolist'} ${HV.compare ? 'compare' : ''}" role="dialog" aria-modal="true" aria-label="Historical playback">
    <div class="hv-hd"><span class="k">PLAYBACK</span><h3>${esc(scopeName())}</h3><span class="sc">${hyLabel(FOUNDED_YEAR, 'E')} → ${esc(hyLabel(...Object.values(hyFromIndex(i1))))} · <span id="hv-nrec">${hvRows().length}</span> records</span>
      <div class="hv-filters">${dists.length > 1 ? `<label class="field" style="height:28px"><span>Place</span><select id="hv-district"><option value="">All</option>${dists.map(d => `<option value="${d.id}" ${HV.filter.district === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}${[['buildings', 'Buildings'], ['roads', 'Roads'], ['transit', 'Transit'], ['biz', 'Businesses']].map(([k, l]) => `<button class="crumb sm" data-hvkind="${k}" aria-pressed="${!!K[k]}">${l}</button>`).join('')}</div>
      <div class="acts"><button class="btn sm ghost" data-act="hv-compare" aria-pressed="${HV.compare}" title="Compare two dates side by side (V)">${icon('grid')} Compare</button><button class="btn sm ghost" data-act="hv-list" aria-pressed="${HV.list}" title="What changed list">${icon('rows')}</button><button class="btn sm ghost" data-act="hv-full" title="Full screen (F)">${icon('expand')}</button><button class="btn ghost icon sm" data-act="hv-close" title="Close (Esc)">${icon('x')}</button></div></div>
    <div class="hv-main">
      <div class="hv-stage ${HV.compare ? 'compare' : ''}" id="hv-stage"><div class="hv-pane"><canvas id="hv-canvas"></canvas><div class="hv-date" id="hv-date"></div><div class="hv-counts" id="hv-counts"></div></div>${HV.compare ? `<div class="hv-pane b"><canvas id="hv-canvas-b"></canvas><div class="hv-date" id="hv-date-b"></div><div class="hv-counts" id="hv-counts-b"></div></div>` : ''}
        <div class="hv-layers">${[['districts', 'Borders'], ['hoods', 'Neighborhoods'], ['roads', 'Roads'], ['transit', 'Transit'], ['historical', 'Ghosts', 'A demolished building lingers as a ghost for about a year, then fades out'], ['ghostsAll', 'All ghosts', 'Keep every ghost on the map after its demolition'], ['evidence', 'Inferred', 'Dashed ring = the date that puts the building here is approximate or has no half — inferred, not recorded'], ['basemap', 'Maps', 'Dated basemap renders: only the latest render at or before the date is shown, never a newer one behind an older one'], ['labels', 'Labels'], ['grid', 'Grid']].map(([k, l, tip]) => `<button class="crumb" data-hvlayer="${k}" aria-pressed="${!!L[k]}" ${tip ? `title="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>
        <div class="hv-maps"><span>OLD MAPS</span><input type="range" id="hv-mapop" min="0" max="1" step="0.05" value="${HV.mapOpacity ?? 1}" title="How strongly the dated maps show under the city"><button class="crumb" data-act="mcmap-import" title="Add Minecraft map files or other dated maps">+ Add</button><span class="n" id="hv-mapname"></span></div>
        <div class="hv-note" id="hv-note"></div>
      </div>
      <aside class="hv-side"><div class="sh"><span id="hv-ev-title">WHAT CHANGED</span><span class="note" id="hv-ev-note"></span></div><div class="evlist" id="hv-events"></div><div class="chron" id="hv-chron"></div></aside>
    </div>
    <div class="hv-ft">
      <div class="tl-ctl"><button class="btn icon" data-act="hv-change" data-dir="-1" title="Previous change ([)">${icon('step')}</button><button class="btn icon" data-act="hv-step" data-dir="-1" title="Previous half-year (←) · Shift for a year">${icon('back')}</button><button class="btn primary play" id="hv-play" data-act="hv-play" title="Play / pause (Space)">${icon('play')}</button><button class="btn icon" data-act="hv-step" data-dir="1" title="Next half-year (→) · Shift for a year" style="transform:scaleX(-1)">${icon('back')}</button><button class="btn icon" data-act="hv-change" data-dir="1" title="Next change (])" style="transform:scaleX(-1)">${icon('step')}</button></div>
      <div class="hv-track"><div class="tl-eras" id="hv-eras">${eras}</div><input type="range" class="tl-range" id="hv-range" min="0" max="${i1 + 0.999}" step="any" value="${HV.pos}" aria-label="Date"><div class="tl-evidence" id="hv-evidence">${evid}</div><div class="tl-ticks" id="hv-ticks">${ticks}</div>${HV.compare ? `<div class="tl-b"><span class="k">B</span><input type="range" class="tl-range b" id="hv-range-b" min="0" max="${i1}" step="1" value="${HV.b}" aria-label="Compare date"><span class="v" id="hv-b-label"></span><button class="btn sm ghost" data-act="hv-swap" title="Swap A and B">${icon('swap')}</button></div>` : ''}</div>
      <div class="hv-opts">
        <label class="field"><span>Speed</span><select id="hv-speed">${HV_RATES.map(([r, l]) => `<option value="${r}" ${HV.rate === r ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Jump</span><select id="hv-jump-h"><option value="E">Early</option><option value="L">Late</option></select><input type="number" id="hv-jump-y" min="${FOUNDED_YEAR}" max="${hyFromIndex(i1).year}" value="${hyFromIndex(HV.to).year}" style="width:64px"><button class="btn sm ghost" data-act="hv-jump">Go</button></label>
        <button class="crumb" data-act="hv-loop" aria-pressed="${HV.loop}" title="Start again from the founding when the end is reached">Loop</button>
        <button class="crumb proj" data-act="hv-projection" aria-pressed="${HV.projection}" title="Show expected completions beyond today as a projection — never mixed into the historical record">Projection</button>
        <button class="crumb" data-act="hv-ref" aria-pressed="${HV.refOverlay}" title="Also draw undated roads and lines faintly, as a present-day reference">Reference</button>
        <button class="crumb" data-act="hv-follow" aria-pressed="${HV.follow}" title="Pan the camera to each interval's events">Follow</button>
      </div>
    </div>
  </div>`;
}
function hvResize() { const c = HV.canvas; if (!c) return; const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); HV.w = Math.max(10, r.width); HV.h = Math.max(10, r.height); c.width = HV.w * dpr; c.height = HV.h * dpr; HV.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (HV.canvasB) { HV.canvasB.width = HV.w * dpr; HV.canvasB.height = HV.h * dpr; HV.ctxB.setTransform(dpr, 0, 0, dpr, 0, 0); } }
function hvWire() {
  for (const [c, which] of [[HV.canvas, 'a'], [HV.canvasB, 'b']]) {
    if (!c) continue; const at = () => which === 'b' ? HV.b : HV.to;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); HV.drag = { sx: e.offsetX, sy: e.offsetY, cx: HV.cam.x, cz: HV.cam.z, moved: false }; $('#hv-stage').classList.add('panning'); });
    c.addEventListener('pointermove', e => {
      if (!HV.drag) { const hit = hvHit(e.offsetX, e.offsetY, at()); c.style.cursor = hit ? 'pointer' : ''; if (hit) { if (HOVER.id !== hit.id || HOVER.hy !== at()) showHover(hit.id, e.clientX, e.clientY, { hy: at(), projection: HV.projection }); else positionHover(e.clientX, e.clientY); } else hideHover(); return; }
      hideHover(); const dx = e.offsetX - HV.drag.sx, dy = e.offsetY - HV.drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) HV.drag.moved = true; HV.cam.x = HV.drag.cx - dx / HV.cam.k; HV.cam.z = HV.drag.cz - dy / HV.cam.k; hvDraw();
    });
    c.addEventListener('pointerleave', hideHover);
    c.addEventListener('pointerup', e => { const d = HV.drag; HV.drag = null; $('#hv-stage').classList.remove('panning'); if (d && !d.moved) { const hit = hvHit(e.offsetX, e.offsetY, at()); if (hit) { hvPause(); openBuilding(hit.id); } } });
    c.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); const P = projFor(HV.cam, HV.w, HV.h); const [wx, wz] = P.w(e.offsetX, e.offsetY); HV.cam.k = clamp(HV.cam.k * f, 0.02, 40); const P2 = projFor(HV.cam, HV.w, HV.h); const [nx, nz] = P2.w(e.offsetX, e.offsetY); HV.cam.x += wx - nx; HV.cam.z += wz - nz; hvDraw(); }, { passive: false });
  }
  $('#hv-range').addEventListener('input', e => { hvPause(); hvScrub(+e.target.value); });
  $('#hv-range-b')?.addEventListener('input', e => { hvPause(); hvSetB(+e.target.value); });
  $('#hv-mapop')?.addEventListener('input', e => { HV.mapOpacity = +e.target.value; hvDraw(); });
  $('#hv-speed').addEventListener('change', e => { HV.rate = +e.target.value; S.settings.tlRate = HV.rate; commit({ silentRender: true }); });
  $('#hv-jump-y')?.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); hvPause(); const y = num(e.target.value); if (y != null) hvSet(hyIndex(y, $('#hv-jump-h')?.value || 'E')); });
  $('#hv-district')?.addEventListener('change', e => { HV.filter.district = e.target.value; hvPause(); const n = $('#hv-nrec'); if (n) n.textContent = hvRows().length; hvUpdateChrome(); hvDraw(); });
  $$('[data-hvkind]').forEach(b => b.addEventListener('click', () => { HV.filter.kinds[b.dataset.hvkind] = !HV.filter.kinds[b.dataset.hvkind]; b.setAttribute('aria-pressed', HV.filter.kinds[b.dataset.hvkind]); hvUpdateChrome(); hvDraw(); }));
  $('#hv-evidence')?.addEventListener('click', e => { const t = e.target.closest('[data-i]'); if (t) { hvPause(); hvSet(+t.dataset.i); } });
  $('#hv-ticks').addEventListener('click', e => { const t = e.target.closest('[data-i]'); if (t) { hvPause(); hvSet(+t.dataset.i); } });
  $('#hv-eras').addEventListener('click', e => { const t = e.target.closest('[data-era]'); if (t) { hvPause(); hvSet(+t.dataset.era); } });
  $$('[data-hvlayer]').forEach(b => b.addEventListener('click', () => { HV.layers[b.dataset.hvlayer] = !HV.layers[b.dataset.hvlayer]; b.setAttribute('aria-pressed', HV.layers[b.dataset.hvlayer]); hvDraw(); }));
}
function hvHit(sx, sy, at = HV.to) { const P = projFor(HV.cam, HV.w, HV.h); let best = null, bd = 10; for (const b of hvRows()) { if (b.x == null) continue; const st = stateAtHY(b, at, { projection: HV.projection }); if (st === 'future' || st === 'undated') continue; const [x, y] = P.s(b.x, b.z); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = b; } } return best; }
/* move the playhead: crossing forward into a new half-year starts the change effects */
function hvMoveTo(pos, { fx = true } = {}) {
  pos = clamp(pos, 0, HV.i1 + 0.999); const prev = HV.to; const next = Math.floor(pos); HV.pos = pos;
  if (next !== prev) { HV.from = prev; HV.to = next; HV.fx = fx && next > prev && motionOn() ? { from: prev, to: next, t0: performance.now(), t: 0 } : null; if (HV.follow && HV.fx) { const ev = []; for (let j = prev + 1; j <= next; j++) ev.push(...hvEventsAt(j).filter(e => e.b && e.b.x != null)); if (ev.length) HV.camTarget = centroidOf(ev.map(e => [e.b.x, e.b.z])); } hvUpdateChrome(); }
  else hvUpdateSlider();
}
function hvScrub(v) { hvMoveTo(v); hvLoop(); }
function hvSet(target, { instant = false } = {}) { target = clamp(Math.round(target), 0, HV.i1); hvMoveTo(target, { fx: !instant }); hvLoop(); }
function hvLoop() {
  if (HV.raf) cancelAnimationFrame(HV.raf); let last = performance.now();
  const step = now_ => {
    if (!HV.open) return; const dt = Math.min(0.25, (now_ - last) / 1000); last = now_; let busy = false;
    if (HV.playing) { let p = HV.pos + dt * HV.rate; if (p >= HV.i1 + 0.999) { if (HV.loop) { HV.to = 0; HV.pos = 0; HV.fx = null; hvUpdateChrome(); p = 0; } else { p = HV.i1 + 0.999; hvPause(); } } hvMoveTo(p); busy = HV.playing; }
    if (HV.fx) { HV.fx.t = Math.min(1, (now_ - HV.fx.t0) / HV_FX_MS); if (HV.fx.t >= 1) HV.fx = null; else busy = true; }
    if (HV.camTarget) { const dx = HV.camTarget[0] - HV.cam.x, dz = HV.camTarget[1] - HV.cam.z; HV.cam.x += dx * 0.08; HV.cam.z += dz * 0.08; if (Math.abs(dx) + Math.abs(dz) < 0.5) HV.camTarget = null; else busy = true; }
    hvDraw();
    HV.raf = busy ? requestAnimationFrame(step) : null;
  };
  HV.raf = requestAnimationFrame(step);
}
/* the slider and the date's month follow the playhead every frame (cheap); the rest updates per half-year */
function hvUpdateSlider() {
  const r = $('#hv-range'); if (r && document.activeElement !== r) r.value = HV.pos; if (r) r.style.setProperty('--p', (HV.pos / Math.max(1, HV.i1 + 0.999) * 100).toFixed(2) + '%');
  const m = $('#hv-month'); if (m) m.textContent = MONTHS[hvMonth(HV.pos)].toUpperCase();
}
function hvPlay() { if (HV.pos >= HV.i1 + 0.99) { HV.to = 0; HV.pos = 0; HV.fx = null; hvUpdateChrome(); } HV.playing = true; const pb = $('#hv-play'); if (pb) pb.innerHTML = icon('pause'); hvLoop(); }
function hvSetB(i) { HV.b = clamp(Math.round(i), 0, HV.i1); hvUpdateChrome(); hvDraw(); }
function hvToggleCompare() { HV.compare = !HV.compare; if (HV.compare && HV.b === HV.to) HV.b = HV.to >= HV.i1 ? 0 : HV.i1; const cam = { ...HV.cam }; const i = HV.to; openHistoryViewer({ index: i }); HV.cam = cam; hvResize(); hvDraw(); }
/* step to the next / previous half-year that has a dated event (after the filters) */
function hvStepChange(dir) { const i = hvNextChange(dir); if (i == null) { toast(dir > 0 ? 'No later dated change' : 'No earlier dated change', ''); return; } hvPause(); hvSet(i); }
function hvPause() { HV.playing = false; const pb = $('#hv-play'); if (pb) pb.innerHTML = icon('play'); }
function hvToggle() { HV.playing ? hvPause() : hvPlay(); }
function hvDraw() {
  if (!HV.ctx) return;
  const rows = hvRows().filter(b => b.x != null); const layers = hvLayers();
  drawScene({ ctx: HV.ctx, W: HV.w, H: HV.h, cam: HV.cam, layers, hy: HV.to, pos: HV.pos, fx: HV.fx, mapOpacity: HV.mapOpacity ?? 1, projection: HV.projection, refOverlay: HV.refOverlay, buildings: rows, districts: visibleDistricts(), hoods: visibleHoods(), handles: false, showJunctions: false, sel: null, hover: null, evidence: HV.layers.evidence !== false });
  if (HV.compare && HV.ctxB) drawScene({ ctx: HV.ctxB, W: HV.w, H: HV.h, cam: HV.cam, layers, hy: HV.b, pos: HV.b, mapOpacity: HV.mapOpacity ?? 1, projection: HV.projection, refOverlay: HV.refOverlay, buildings: rows, districts: visibleDistricts(), hoods: visibleHoods(), handles: false, showJunctions: false, sel: null, hover: null, evidence: HV.layers.evidence !== false });
}
/* the counts and the date for one pane */
function hvPaneChrome(i, dateEl, countsEl) {
  const { year, half } = hyFromIndex(i); const present = hyIndex(CURRENT_YEAR, CURRENT_HALF); const isProj = i > present; const rows = hvRows();
  const c = hyCounts(rows, i, { projection: HV.projection }); let inferred = 0; for (const b of rows) { const st = stateAtHY(b, i, { projection: HV.projection }); if ((st === 'standing' || st === 'construction') && inferredAt(b, i, st)) inferred++; }
  const roadsOpen = S.roads.filter(r => serviceStateAt(r, i) === 'open').length, linesOpen = S.lines.filter(l => serviceStateAt(l, i) === 'open').length;
  const d = $(dateEl); if (d) d.innerHTML = `<div class="y">${year}<small class="${isProj ? 'proj' : ''}">${dateEl === '#hv-date' ? `<b id="hv-month">${MONTHS[hvMonth(HV.pos)].toUpperCase()}</b> · ` : ''}${isProj ? 'PROJECTION · ' : ''}${halfLabel(half).toUpperCase()}${dateEl === '#hv-date' ? '' : ` · ${half === 'E' ? 'JAN–JUN' : 'JUL–DEC'}`}${i === present ? ' · PRESENT' : ''}</small></div><div class="era">${esc(eraOf(year)?.name.toUpperCase() || '')}</div>`;
  const cc = $(countsEl); if (cc) cc.innerHTML = `<div class="c standing"><b>${c.standing}</b>completed</div><div class="c construction"><b>${c.construction + c.planned}</b>under way</div>${c.vacant ? `<div class="c vacant"><b>${c.vacant}</b>vacant lots</div>` : ''}<div class="c gone"><b>${c.gone}</b>demolished so far</div>${inferred ? `<div class="c inferred" title="Dated approximately or without a half — shown with a dashed ring"><b>≈${inferred}</b>inferred</div>` : ''}${c.undated ? `<div class="c undated"><b>${c.undated}</b>undated · not shown</div>` : ''}${(roadsOpen || linesOpen) && (HV.filter.kinds.roads || HV.filter.kinds.transit) ? `<div class="c infra"><b>${roadsOpen}</b>roads · <b>${linesOpen}</b>lines</div>` : ''}`;
  return { year, half, isProj, c, inferred };
}
function hvUpdateChrome() {
  const i = HV.to; const { year, half, isProj } = hvPaneChrome(i, '#hv-date', '#hv-counts');
  if (HV.compare) { hvPaneChrome(HV.b, '#hv-date-b', '#hv-counts-b'); const rb = $('#hv-range-b'); if (rb) { rb.value = HV.b; rb.style.setProperty('--p', (HV.b / Math.max(1, HV.i1) * 100).toFixed(1) + '%'); } const bl = $('#hv-b-label'); if (bl) bl.textContent = hyLabel(...Object.values(hyFromIndex(HV.b))); }
  hvUpdateSlider(); { const mn = $('#hv-mapname'); if (mn) { const ms = basemapsAt(i); mn.textContent = ms.length ? ms.map(bm => bm.name).slice(-2).join(' + ') : 'no map for this date'; } }
  $$('#hv-eras span').forEach(s => { const a = +s.dataset.era; const e = ERAS.find(x => hyIndex(x.from, 'E') === a); s.classList.toggle('on', !!e && year >= e.from && year < e.to); });
  $$('#hv-ticks span').forEach(s => s.classList.toggle('on', +s.dataset.i === hyIndex(year, 'E')));
  const jy = $('#hv-jump-y'); if (jy) jy.value = year; const jh = $('#hv-jump-h'); if (jh) jh.value = half;
  const note = $('#hv-note'); if (note) note.textContent = isProj ? 'Projection: expected completions are shown dashed; nothing here is a recorded fact.' : HV.refOverlay ? 'Reference overlay: undated roads and lines drawn faintly — present-day data, not history.' : HV.layers.evidence !== false ? 'Dashed ring = inferred (approximate date or no half). Half-years with no dated event show no change; undated records never appear.' : 'Half-years with no dated event show no change. Undated records never appear.';
  // what changed — at this half-year, or between A and B in compare mode
  const evRows = []; const title = $('#hv-ev-title');
  if (HV.compare) { const lo = Math.min(HV.to, HV.b), hi = Math.max(HV.to, HV.b); for (let j = lo + 1; j <= hi; j++) for (const e of hvEventsAt(j)) evRows.push({ ...e, at: j }); if (title) title.textContent = `CHANGED ${esc(hyShort(...Object.values(hyFromIndex(lo))))} → ${esc(hyShort(...Object.values(hyFromIndex(hi))))}`; }
  else { for (const e of hvEventsAt(i)) evRows.push({ ...e, at: i }); if (title) title.textContent = 'WHAT CHANGED'; }
  const ev = evRows; const en = $('#hv-ev-note'); if (en) en.textContent = ev.length ? `${ev.length} event${ev.length === 1 ? '' : 's'}` : 'nothing dated';
  const el = $('#hv-events'); if (el) el.innerHTML = ev.length ? ev.map(e => { const [label, glyph] = HY_EVENT_LABEL[e.kind] || [e.kind, '·']; const when = HV.compare ? `<span class="r">${esc(hyShort(...Object.values(hyFromIndex(e.at))))} · </span>` : ''; if (e.b) { const b = e.b; const dd = districtById(b.districtId); const inferred = e.kind === 'built' ? (b.yearBuiltApprox || !b.halfBuilt) : e.kind === 'demolished' ? (b.yearDemolishedApprox || !b.halfDemolished) : e.kind === 'started' ? (b.yearStartedApprox || !b.halfStarted) : false; return `<div class="ev ${e.kind === 'demolished' ? 'demo' : e.kind}" data-open="${b.id}" data-hover="${b.id}"><i class="${glyph === 's' ? 's' : ''}">${glyph === 's' ? '◧' : glyph === '?' ? '◌' : glyph}</i><span class="nm">${when}${esc(b.name || titleOf(b))} <span class="r">${esc(b.reg)} · ${label}${inferred ? ' · <span class="inf" title="approximate date or no half — inferred">≈ inferred</span>' : ' · recorded'}</span></span><span class="r" style="color:${distColor(dd)}">${esc(dd?.code || '')}</span></div>`; } const o = e.o; const kind = e.kind.startsWith('road') ? 'road' : e.kind.startsWith('line') ? 'line' : e.kind.startsWith('station') ? 'station' : e.kind.startsWith('biz') ? 'business' : null; return `<div class="ev" ${kind ? `data-open="${kind}:${o.id}"` : ''}><i class="${kind === 'business' ? 'b' : 'i'}">${kind === 'business' ? '◆' : '▬'}</i><span class="nm">${when}${esc(o.name || o.reg || '')} <span class="r">${label}${e.note ? ' · ' + esc(e.note) : ''}</span></span><span class="r"></span></div>`; }).join('') : `<div class="chart-empty" style="padding:16px 8px">${HV.compare ? 'No dated event between the two dates.' : `No dated event in ${esc(hyLabel(year, half))}.`}</div>`;
  // the chronicle card: the latest image at or before this half-year — never a newer one
  const ch = $('#hv-chron'); if (ch) { const items = scopeArchive().map(a => ({ a, i: hyIndexOfArchive(a) })).filter(x => x.i <= i).sort((p, q) => (q.i - p.i) || ((q.a.created || '').localeCompare(p.a.created || ''))); const pick = items[0]?.a; const same = pick && items[0].i === i; ch.innerHTML = pick ? `<div class="img" data-arch="${pick.id}">${imgUrl(pick.id, 'full') ? `<img src="${imgUrl(pick.id, 'full')}" alt="">` : ''}</div><div data-arch="${pick.id}"><div class="y">${esc(pick.year)}${pick.month ? ' · ' + MONTHS[pick.month - 1] : ''} · ${same ? 'this half-year' : 'latest before'}${pick.confidence ? ' · ' + esc(confOf(pick.confidence)?.label || '') : ''}</div><div class="t">${esc(pick.title || 'Untitled')}</div><div class="s">${esc(pick.description || '')}</div></div>` : `<div class="desc-line">No chronicle image for ${hyLabel(year, half)} or earlier.</div>`; }
  $$('[data-act="hv-projection"]').forEach(b => b.setAttribute('aria-pressed', HV.projection)); $$('[data-act="hv-ref"]').forEach(b => b.setAttribute('aria-pressed', HV.refOverlay)); $$('[data-act="hv-follow"]').forEach(b => b.setAttribute('aria-pressed', HV.follow)); $$('[data-act="hv-loop"]').forEach(b => b.setAttribute('aria-pressed', HV.loop)); $$('[data-act="hv-compare"]').forEach(b => b.setAttribute('aria-pressed', HV.compare));
}
function hvToggleProjection() { HV.projection = !HV.projection; const { i1 } = hyRange(HV.rows, { projection: HV.projection }); HV.i1 = i1; hvRefreshTrack(); HV.pos = Math.min(HV.pos, i1 + 0.999); HV.to = Math.min(HV.to, i1); HV.b = Math.min(HV.b, i1); hvUpdateChrome(); hvDraw(); }

/* ============ demolished records ============ */
const HCOLS = [
  { key: 'thumb', label: '', sortable: false, w: 52 }, { key: 'reg', label: 'HIST №' }, { key: 'address', label: 'BUILDING' }, { key: 'district', label: 'PLACE' }, { key: 'hood', label: 'NEIGHBORHOOD' },
  { key: 'yearBuilt', label: 'BUILT', r: true }, { key: 'yearDemolished', label: 'DEMOLISHED', r: true }, { key: 'lifespan', label: 'LIFESPAN', r: true }, { key: 'floors', label: 'FLOORS', r: true },
  { key: 'succ', label: 'REPLACED BY', sortable: false }, { key: 'conf', label: 'CONFIDENCE' }, { key: 'demolitionReason', label: 'REASON' },
];
function renderHistRecords(hist) {
  const f = UI.hf; const shown = histFiltered(); const idx = relIndex(); const dists = scopeDistricts(); const distSel = dists.length > 1;
  const hoodDistrict = f.district || (!distSel ? dists[0]?.id : '');
  const hoods = hoodDistrict ? hoodsIn(hoodDistrict) : [];
  const th = HCOLS.map(c => { const sorted = UI.hsort.key === c.key; const arrow = sorted ? `<span class="arr">${UI.hsort.dir > 0 ? '▲' : '▼'}</span>` : ''; return `<th ${c.sortable === false ? '' : `data-hsort="${c.key}"`} ${sorted ? `aria-sort="${UI.hsort.dir > 0 ? 'ascending' : 'descending'}"` : ''} class="${c.r ? 'r' : ''}" ${c.w ? `style="width:${c.w}px"` : ''}>${c.label}${arrow}</th>`; }).join('');
  const tr = shown.map((b, i) => { const d = districtById(b.districtId), h = hoodById(b.neighborhoodId); const succ = successorsOf(b, idx);
    return `<tr class="hist ${UI.selected === b.id ? 'sel' : ''}" data-open="${b.id}" data-hover="${b.id}" style="--i:${Math.min(i, 30)};--c:${distColor(d)}">
      <td>${thumbHTML(b)}</td><td>${regHTML(b)}</td>
      <td><span class="addr">${esc(b.name || addressOf(b) || '—')}</span>${b.name && addressOf(b) ? `<span class="nm">${esc(addressOf(b))}</span>` : ''}</td>
      <td><span class="dist" style="--c:${distColor(d)}"><i></i>${esc(d?.name || '—')}</span></td><td class="dim">${esc(h?.name || '—')}</td>
      <td class="num r">${esc(builtHTML(b))}</td><td class="num r reg-h">${esc(demoHTML(b))}</td><td class="num r">${lifespanOf(b) != null ? lifespanOf(b) + ' yrs' : '—'}</td><td class="num r">${b.floors ?? '—'}</td>
      <td>${succ.length ? `<span class="succ">${succ.map(s => `<span title="${esc(s.name || titleOf(s))}">${esc(s.reg)}</span>`).join('')}</span>` : '<span class="muted">—</span>'}</td>
      <td>${confHTML(b.confidence, b.verified)}</td><td class="dim">${esc(truncate(b.demolitionReason || '', 28)) || '<span class="muted">—</span>'}</td></tr>`; }).join('');
  return `
  <div class="toolbar" id="htoolbar">
    ${distSel ? `<label class="field ${f.district ? 'on' : ''}"><span>Place</span><select data-hf="district"><option value="">Any</option>${dists.map(d => `<option value="${d.id}" ${f.district === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field ${f.hood ? 'on' : ''}"><span>Neighborhood</span><select data-hf="hood" ${hoods.length ? '' : 'disabled'}><option value="">${hoods.length ? 'Any' : (distSel ? 'pick a place' : 'none')}</option>${hoods.map(h => `<option value="${h.id}" ${f.hood === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
    <label class="field ${f.builtMin || f.builtMax ? 'on' : ''}"><span>Built</span><input type="number" data-hf="builtMin" placeholder="from" value="${esc(f.builtMin)}"><span class="muted">–</span><input type="number" data-hf="builtMax" placeholder="to" value="${esc(f.builtMax)}"></label>
    <label class="field ${f.demoMin || f.demoMax ? 'on' : ''}" style="${f.demoMin || f.demoMax ? 'border-color:var(--hist-2);color:var(--hist)' : ''}"><span>Demolished</span><input type="number" data-hf="demoMin" placeholder="from" value="${esc(f.demoMin)}"><span class="muted">–</span><input type="number" data-hf="demoMax" placeholder="to" value="${esc(f.demoMax)}"></label>
    <label class="field ${f.conf ? 'on' : ''}"><span>Confidence</span><select data-hf="conf"><option value="">Any</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${f.conf === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
    ${histFiltersActive() ? `<button class="btn ghost sm" data-act="hclear">${icon('x')} Clear</button>` : ''}
    <span class="spacer"></span>
    <span class="count">${shown.length}${shown.length !== hist.length ? ` of ${hist.length}` : ''} records · search finds names, H-№s, former №s and successor №s</span>
    <button class="btn sm" data-act="export-hist-csv">${icon('down')} CSV</button>
  </div>
  <div id="registry">${shown.length ? `<div class="tablewrap"><table class="reg"><thead><tr>${th}</tr></thead><tbody class="${UI.animateRows && motionOn() ? 'anim' : ''}">${tr}</tbody></table></div>` : emptyBlock({ hist: true })}</div>`;
}

/* ============ chronicle: dated screenshots with written descriptions ============ */
function renderChronicleSection() {
  const items = scopeArchive().sort((a, b) => (a.year - b.year) || ((a.month || 0) - (b.month || 0)) || (a.created || '').localeCompare(b.created || ''));
  const byYear = new Map(); for (const a of items) (byYear.get(a.year) || byYear.set(a.year, []).get(a.year)).push(a);
  return `${renderChronicleStrip()}
  ${items.length ? [...byYear.entries()].map(([y, list]) => `<section class="panel hud" style="margin-bottom:16px" id="chron-year-${y}"><div class="panel-head"><h3>${y} · ${esc(eraOf(y)?.name.toUpperCase() || '')}</h3><span class="note">${list.length} image${list.length === 1 ? '' : 's'}</span></div><div class="gallery">${list.map(a => chronCardHTML(a, 'card')).join('')}</div></section>`).join('') : ''}`;
}
function renderChronicleStrip() {
  const items = scopeArchive().sort((a, b) => (a.year - b.year) || ((a.month || 0) - (b.month || 0)) || (a.created || '').localeCompare(b.created || '')); const years = [...new Set(items.map(a => a.year))];
  return `
  <section class="panel hud" style="margin-bottom:16px;padding-bottom:10px">
    <div class="panel-head" style="margin-bottom:10px"><h3>CHRONICLE · ${esc(scopeName().toUpperCase())} THROUGH THE YEARS</h3><span class="note" style="display:flex;gap:10px;align-items:center">${items.length ? `${items.length} image${items.length === 1 ? '' : 's'} · ${years[0]} → ${years[years.length - 1]} · scroll →` : 'no images yet'}<button class="btn sm primary" data-act="arch-new">${icon('img')} Add image</button></span></div>
    ${years.length > 1 ? `<div class="chron-years">${years.map(y => `<button class="chip" data-arch-year="${y}" style="height:26px;font-family:var(--font-mono);font-size:11.5px"><i style="background:var(--cyan)"></i>${y} <span class="cnt">${items.filter(a => a.year === y).length}</span></button>`).join('')}</div>` : ''}
    ${items.length ? `<div class="chron-strip" id="chron-strip">${items.map(a => chronCardHTML(a)).join('')}</div>`
      : `<div class="chron-empty">${icon('img')}<div><b>Drop the screenshots that show how the city changed.</b>What Man A looked like in 2016, 2020, 2023 and 2026 — one image per moment, each with a written description of what it shows. Descriptions are saved in the JSON next to the image path, so anything reading the file (including an AI) can read the picture.</div><button class="btn" data-act="arch-new">${icon('plus')} Add the first image</button></div>`}
  </section>`;
}
function chronCardHTML(a, cls = 'chron-card') {
  const d = districtById(a.districtId), h = hoodById(a.neighborhoodId); const url = imgUrl(a.id, 'full');
  return `<div class="${cls === 'card' ? 'card' : 'chron-card'}" data-arch="${a.id}" data-year="${a.year}" style="--c:${d ? distColor(d) : 'var(--cyan)'}">
    <div class="img" style="position:relative">${url ? `<img src="${url}" alt="${esc(a.title || '')}" loading="lazy">` : `<div class="ph">${icon('img')}no image</div>`}<span class="yr" style="position:absolute;left:10px;bottom:8px;font-size:${cls === 'card' ? 26 : 34}px;font-weight:700;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.8);line-height:1">${esc(a.year)}${a.month ? `<small style="display:block;font-size:10px;letter-spacing:.2em;font-family:var(--font-mono)">${MONTHS[a.month - 1]}</small>` : ''}</span></div>
    <div class="body"><div class="t" style="font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title || 'Untitled')}</div><div class="d" style="display:flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:11px;color:var(--ink-3);margin-top:3px"><i style="width:7px;height:7px;border-radius:2px;background:var(--c)"></i>${esc(d ? d.name : 'City-wide')}${h ? ' · ' + esc(h.name) : ''}${a.confidence ? ' · ' + esc(confOf(a.confidence)?.label || '') : ''}</div><div class="desc" style="margin-top:7px;font-size:12px;color:var(--ink-2);line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(a.description || 'No description yet — add one so the record can be read.')}</div></div></div>`;
}
const ARCH = { editing: null, viewing: null };
function archivePhotoHTML(a) {
  const url = imgUrl(a.id, 'full');
  return `<div class="photo" id="arch-photo" tabindex="0" style="border:1px solid var(--line-2);border-radius:var(--r-2);margin-top:12px" title="Drop or paste a screenshot here">${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('img')}Drop a screenshot here, paste one (⌘/Ctrl+V), or click to choose</div>`}<div class="acts"><button type="button" class="btn sm" data-act="arch-photo">${icon('img')} ${url ? 'Replace' : 'Add image'}</button></div></div>`;
}
function openArchiveModal(id = null, preset = {}) {
  if (!id && preset.year == null && travelDate()) preset = { ...preset, year: travelDate().year };
  const src = id ? archiveById(id) : null;
  const a = src ? JSON.parse(JSON.stringify(src)) : Object.assign(newArchiveEntry(preset.year, preset.districtId ?? (UI.scope.kind === 'district' ? UI.scope.id : UI.scope.kind === 'hood' ? hoodById(UI.scope.id)?.districtId : null)), preset);
  ARCH.editing = a; ARCH.viewing = null;
  const hoods = a.districtId ? hoodsIn(a.districtId) : [];
  const f = (id, label, input, hint = '') => `<div class="f"><label for="a-${id}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>${input}</div>`;
  openModal({
    title: src ? `Edit chronicle image · ${a.year}` : 'Add a chronicle image', kicker: 'CHRONICLE', cls: 'wide',
    body: `
      <div id="arch-photo-wrap">${archivePhotoHTML(a)}</div>
      <div class="frow c3" style="margin-top:14px">
        ${f('year', 'Year', `<input id="a-year" class="num" type="number" value="${esc(a.year)}" min="2000" max="2100">`, 'when it was taken / what it shows')}
        ${f('month', 'Month', `<select id="a-month"><option value="">— unknown —</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${a.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}
        ${f('district', 'Borough / district', `<select id="a-district"><option value="">City-wide</option>${S.districts.map(x => `<option value="${x.id}" ${x.id === a.districtId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
        ${f('hood', 'Neighborhood', `<select id="a-hood"><option value="">— any —</option>${hoods.map(h => `<option value="${h.id}" ${h.id === a.neighborhoodId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`)}
        <div class="f" style="grid-column:span 2"><label for="a-title">Title</label><input id="a-title" value="${esc(a.title)}" placeholder="Lower Man A from the harbor, summer 2016"></div>
        <div class="f span"><label for="a-desc">Description <span class="hint">what the picture shows, for the record — landmarks, streets, what is missing, what is under construction</span></label><textarea id="a-desc" style="min-height:110px" placeholder="Looking north up Park Ave. 432 Park is topped out; the lot at 270 Park is still the old 12-storey block. No towers yet east of 3rd Ave…">${esc(a.description)}</textarea></div>
        ${f('sourceType', 'Source type', `<select id="a-sourceType"><option value="">— none —</option>${SOURCE_TYPES.map(([id, l]) => `<option value="${id}" ${id === a.sourceType ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
        ${f('confidence', 'Date confidence', `<select id="a-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === a.confidence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
        ${f('source', 'Source', `<input id="a-source" value="${esc(a.source)}" placeholder="IMG_2231.png · Discord #screenshots 2016-07-04">`)}
        <div class="f span"><label for="a-tags">Tags <span class="hint">space separated</span></label><input id="a-tags" value="${esc((a.tags || []).join(' '))}" placeholder="skyline harbor construction"></div>
      </div>`,
    foot: `${src ? `<button class="btn danger" data-act="arch-delete" data-id="${src.id}">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="arch-cancel">Cancel</button><button class="btn primary" data-act="arch-save">${icon('check')} ${src ? 'Save' : 'Add to chronicle'}</button>`,
    onOpen: m => {
      m.querySelector('#a-district').addEventListener('change', e => { const hs = e.target.value ? hoodsIn(e.target.value) : []; m.querySelector('#a-hood').innerHTML = `<option value="">— any —</option>${hs.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}`; });
      wireArchivePhoto(m);
      m.querySelector('[data-act=modal-close]').onclick = () => archiveCancel(); m.parentElement.querySelector('.shade').onclick = () => archiveCancel();
      if (!src) setTimeout(() => m.querySelector('#a-title')?.focus(), 60);
    },
  });
}
function wireArchivePhoto(m) {
  const photo = m.querySelector('#arch-photo'); if (!photo) return;
  photo.addEventListener('dragover', e => { e.preventDefault(); photo.classList.add('drag'); });
  photo.addEventListener('dragleave', () => photo.classList.remove('drag'));
  photo.addEventListener('drop', e => { e.preventDefault(); photo.classList.remove('drag'); const f = e.dataTransfer.files?.[0]; if (f) archiveAttachPhoto(f); });
  photo.addEventListener('click', e => { if (!e.target.closest('.acts')) $('#file-img').click(); });
}
async function archiveAttachPhoto(file) {
  const a = ARCH.editing; if (!a) return;
  await setBuildingImage(a, file);   // same pipeline as building photos: IndexedDB now, vault/images on the next write
  const wrap = $('#arch-photo-wrap'); if (wrap) { wrap.innerHTML = archivePhotoHTML(a); wireArchivePhoto($('#modal-root')); }
}
function readArchiveForm(a) {
  const g = id => $('#a-' + id)?.value ?? '';
  a.year = num(g('year')); a.month = num(g('month')); a.districtId = g('district') || null; a.neighborhoodId = g('hood') || null;
  a.title = g('title').trim(); a.description = g('desc'); a.sourceType = g('sourceType'); a.confidence = g('confidence'); a.source = g('source').trim();
  a.tags = g('tags').split(/[\s,]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
  if (a.year == null || a.year < 1990 || a.year > 2100) return 'Give the image a year.';
  return null;
}
function archiveSave() {
  const a = ARCH.editing; if (!a) return; const err = readArchiveForm(a); if (err) { toast(err, 'warn'); return; }
  a.updated = now(); const i = S.archive.findIndex(x => x.id === a.id);
  if (i === -1) { a.created = now(); S.archive.push(a); toast(`${a.year} added to the chronicle`, 'good'); } else { S.archive[i] = a; toast('Chronicle image saved', 'good'); }
  ARCH.editing = null; closeModal(); commit(); renderView(false);
  requestAnimationFrame(() => $(`.chron-card[data-arch="${a.id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }));
}
function archiveCancel() {
  const a = ARCH.editing; ARCH.editing = null;
  if (a && !archiveById(a.id) && a.image) removeBuildingImage(a);   // abandoned new entry: drop its photo
  closeModal();
}
async function archiveDelete(id) {
  const a = archiveById(id); if (!a) return;
  const r = await confirmDialog({ title: `Delete this ${a.year} image?`, body: `<p><b>${esc(a.title || 'Untitled')}</b> and its description will be removed from the chronicle.</p>`, ok: 'Delete', danger: true });
  if (r !== 'ok') { if (ARCH.viewing) openArchiveViewer(id); return; }
  if (a.image) await removeBuildingImage(a);
  S.archive = S.archive.filter(x => x.id !== id); ARCH.editing = null; ARCH.viewing = null; closeModal(); commit(); renderView(false); toast('Chronicle image deleted', 'warn');
}
function openArchiveViewer(id) {
  const items = scopeArchive().sort((a, b) => (a.year - b.year) || ((a.month || 0) - (b.month || 0)) || (a.created || '').localeCompare(b.created || '')); const i = items.findIndex(x => x.id === id); const a = items[i] || archiveById(id); if (!a) return;
  ARCH.viewing = a.id; ARCH.editing = null;
  const d = districtById(a.districtId), h = hoodById(a.neighborhoodId); const url = imgUrl(a.id, 'full');
  const prev = items[i - 1], next = items[i + 1];
  openModal({
    title: `${a.year}${a.month ? ' · ' + MONTHS[a.month - 1] : ''} — ${a.title || 'Untitled'}`, kicker: 'CHRONICLE', cls: 'wide',
    body: `
      <div class="viewer-img">${url ? `<img src="${url}" alt="${esc(a.title || '')}">` : `<div class="ph">${icon('img')}no image attached</div>`}</div>
      <div class="viewer-meta">
        <div class="yrbig">${esc(a.year)}<small>${esc(eraOf(a.year)?.name || '')}</small></div>
        <div>
          <div class="badges" style="margin:0 0 8px"><span class="status info"><i>▣</i>${esc(d ? d.name : 'City-wide')}${h ? ' · ' + esc(h.name) : ''}</span>${a.sourceType ? `<span class="code">${esc(SOURCE_LABEL[a.sourceType] || a.sourceType)}</span>` : ''}${confHTML(a.confidence)}${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div class="notes" style="margin:0">${a.description ? esc(a.description) : '<span class="muted">No description yet.</span>'}</div>
          ${a.source ? `<div class="desc-line" style="margin-top:8px">source · ${esc(a.source)}</div>` : ''}
          <div class="desc-line" style="margin-top:8px"><button class="rowlink" data-act="hv-open-year" data-year="${a.year}" style="font:inherit">${icon('play')} Open playback in ${a.year}</button></div>
        </div>
      </div>`,
    foot: `<button class="btn ghost" data-act="arch-prev" data-id="${prev?.id || ''}" ${prev ? '' : 'disabled'}>${icon('back')} ${prev ? prev.year : ''}</button><button class="btn ghost" data-act="arch-next" data-id="${next?.id || ''}" ${next ? '' : 'disabled'}>${next ? next.year : ''} <span style="display:inline-block;transform:scaleX(-1)">${icon('back')}</span></button><span class="spacer"></span><button class="btn" data-act="arch-edit" data-id="${a.id}">${icon('edit')} Edit</button><button class="btn" data-act="modal-close">Close</button>`,
    onOpen: m => { m.querySelector('[data-act=modal-close]').onclick = () => { ARCH.viewing = null; closeModal(); }; },
  });
}

/* ============ statistics ============ */
function renderHistStats(rows) {
  const hist = rows.filter(isHist), active = rows.filter(isActive); const idx = relIndex();
  const series = yearSeries(rows); const fabric = fabricStats(rows);
  const lifespans = hist.map(lifespanOf).filter(v => v != null);
  const cell = (v, cls = 'num r') => `<td class="${cls}">${v}</td>`;
  const y1 = series[series.length - 1].y;
  const eras = ERAS.filter(e => e.from <= y1).map((e, i) => {
    const built = rows.filter(b => num(b.yearBuilt) != null && num(b.yearBuilt) >= e.from && num(b.yearBuilt) < e.to && !isUnderWay(b));
    const demolished = hist.filter(b => num(b.yearDemolished) != null && num(b.yearDemolished) >= e.from && num(b.yearDemolished) < e.to);
    const endY = Math.min(e.to - 1, y1); const standing = rows.filter(b => completedAt(b, endY)).length;
    return { i, e, built: built.length, demolished: demolished.length, standing, survive: built.length ? pct(built.filter(isActive).length, built.length) : null, floors: stats(built.map(b => num(b.floors))) };
  });
  const hoodGroups = (() => {
    const g = new Map();
    for (const b of rows) { const k = b.neighborhoodId && hoodById(b.neighborhoodId) ? b.neighborhoodId : '__none'; (g.get(k) || g.set(k, []).get(k)).push(b); }
    return [...g.entries()].map(([k, list]) => { const h = hoodById(k); const d = h ? districtById(h.districtId) : null; const dem = list.filter(isHist); const fab = fabricStats(list); const lf = stats(dem.map(lifespanOf)); const last = Math.max(-1, ...dem.map(b => num(b.yearDemolished) ?? -1)); return { name: h ? h.name : 'Unassigned', d, list, dem, fab, lf, last: last > 0 ? last : null }; }).filter(x => x.list.length).sort((a, b) => b.dem.length - a.dem.length || b.list.length - a.list.length);
  })();
  const oldest = active.filter(b => num(b.yearBuilt) != null && isCompleted(b)).sort((a, b) => num(a.yearBuilt) - num(b.yearBuilt) || a.reg.localeCompare(b.reg)).slice(0, 8);
  const longest = hist.filter(b => lifespanOf(b) != null).sort((a, b) => lifespanOf(b) - lifespanOf(a)).slice(0, 8);
  const shortest = hist.filter(b => lifespanOf(b) != null).sort((a, b) => lifespanOf(a) - lifespanOf(b)).slice(0, 8);
  const redev = active.map(b => ({ b, preds: predecessorsOf(b, idx) })).filter(x => x.preds.length).sort((a, b) => b.preds.length - a.preds.length || (num(b.b.yearBuilt) || 0) - (num(a.b.yearBuilt) || 0)).slice(0, 8);
  const sites = (() => { const seen = new Set(); const out = []; for (const b of rows) { if (seen.has(b.id)) continue; const comp = siteComponent(b, idx); for (const c of comp) seen.add(c.id); if (comp.length > 1) out.push({ comp, chron: chronology(comp) }); } return out.sort((a, b) => b.comp.length - a.comp.length).slice(0, 8); })();
  const reasons = topCounts(hist, b => b.demolitionReason, 8);
  const byEraDemo = ERAS.map(e => ({ label: e.name, n: hist.filter(b => num(b.yearDemolished) >= e.from && num(b.yearDemolished) < e.to).length })).filter(x => x.n);
  const byEraBuiltLost = ERAS.map(e => ({ label: e.name, n: hist.filter(b => num(b.yearBuilt) >= e.from && num(b.yearBuilt) < e.to).length })).filter(x => x.n);
  const confItems = [...CONFIDENCE.map(c => ({ label: c.label, n: hist.filter(b => b.confidence === c.id).length, c: { confirmed: '#39D98A', high: '#7FB2FF', approximate: '#FFD166', uncertain: '#FF4D6D' }[c.id] })), { label: 'Not assessed', n: hist.filter(b => !b.confidence).length, c: PALETTE.neutral }].filter(x => x.n);
  const srcItems = topCounts(hist, b => SOURCE_LABEL[b.sourceType] || (b.sourceType ? b.sourceType : ''), 8);
  const verified = hist.filter(b => b.verified).length;
  const lost = hist.filter(heightOf).sort((a, b) => heightOf(b) - heightOf(a)).slice(0, 40);
  const hFields = [['Year built', b => num(b.yearBuilt) != null], ['Year demolished', b => num(b.yearDemolished) != null], ['Half-year known', b => b.halfDemolished], ['Reason', b => b.demolitionReason], ['Successor linked', b => successorsOf(b, idx).length], ['Coordinates', b => b.x != null && b.z != null], ['Floors or height', b => b.floors || b.height], ['Source', b => b.source], ['Confidence', b => b.confidence], ['Photo', b => b.image]];
  const hItems = hFields.map(([label, f]) => ({ label, n: hist.filter(f).length }));
  const overall = hist.length ? Math.round(hItems.reduce((a, i) => a + i.n, 0) / (hItems.length * hist.length) * 100) : 0;
  const lifeHist = (() => { if (lifespans.length < 2) return `<div class="chart-empty">Date at least two demolitions to see how long buildings last.</div>`; const max = Math.max(...lifespans); const bins = Math.min(12, max + 1); const size = Math.ceil((max + 1) / bins); const counts = new Array(bins).fill(0); for (const v of lifespans) counts[Math.min(bins - 1, Math.floor(v / size))]++; return hbarsHTML(counts.map((n, i) => ({ label: size === 1 ? `${i} yr${i === 1 ? '' : 's'}` : `${i * size}–${i * size + size - 1} yrs`, n })).filter(x => x.n), { color: '#B84A2E', labelW: 90 }); })();
  const totalB = series.reduce((a, p) => a + p.built, 0), totalD = series.reduce((a, p) => a + p.demolished, 0);
  const life = stats(lifespans);
  const tile = (lbl, val, sub = '', cls = '') => `<div class="panel tile ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  return `
  <section class="tiles">
    ${tile('DEMOLISHED', `<span class="count" data-to="${hist.length}">0</span>`, `${rows.filter(isActive).length} standing · ${rows.length ? pct(hist.length, rows.length) : 0}% of all records`, 'hist')}
    ${tile('AVERAGE LIFESPAN', life.n ? `${Math.round(life.avg * 10) / 10}<small>years</small>` : '—', life.n ? `median ${life.med} · shortest ${life.min} · longest ${life.max}` : 'no dated demolitions yet')}
    ${tile('ORIGINAL FABRIC', fabric.total ? `${pct(fabric.standing, fabric.total)}<small>% remains</small>` : '—', fabric.total ? `${fabric.standing} of ${fabric.total} built ≤ ${fabric.year} still stand · ${fabric.lost} lost` : 'nothing dated ≤ ' + fabric.year + ' yet', fabric.total && pct(fabric.standing, fabric.total) < 50 ? 'hist' : '')}
    ${tile('SITES WITH HISTORY', `<span class="count" data-to="${sites.length}">0</span>`, 'two or more linked generations')}
    ${tile('SITES REDEVELOPED', `<span class="count" data-to="${redev.length}">0</span>`, 'current buildings with a linked predecessor')}
    ${tile('FLOORS LOST', `<span class="count" data-to="${sum(hist, b => b.floors)}">0</span>`, hist.filter(heightOf).length ? `${fmtInt(sum(hist, heightOf))} blocks of height demolished` : 'add floors to demolished records')}
  </section>
  <section class="panel hud" style="margin-bottom:16px">
    <div class="panel-head"><h3>CONSTRUCTION VS DEMOLITION · ${series[0].y} → ${y1}</h3><span class="note">${totalB} completed · ${totalD} demolished · click a year to open playback · <button class="rowlink" data-act="export-timeline-csv" style="font:inherit">year-by-year CSV</button></span></div>
    ${renderBuildDemoChart(rows, { W: 1100, H: 240 })}
  </section>
  <section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>STANDING OVER TIME</h3><span class="note">completed · net of demolitions</span></div>${renderGrowthLine(rows, { W: 420, H: 190 })}</div>
    <div class="panel hud"><div class="panel-head"><h3>LIFESPAN OF LOST BUILDINGS</h3><span class="note">${lifespans.length} dated</span></div>${lifeHist}</div>
    <div class="panel hud"><div class="panel-head"><h3>DEMOLITIONS BY ERA</h3><span class="note">when they fell</span></div>${hbarsHTML(byEraDemo, { color: '#B84A2E', labelW: 130 })}${byEraBuiltLost.length ? `<div class="desc-line" style="margin-top:12px;margin-bottom:6px">WHEN THE LOST BUILDINGS WERE BUILT</div>${hbarsHTML(byEraBuiltLost, { color: PALETTE.marks[0], labelW: 130 })}` : ''}</div>
  </section>
  <section class="panel hud" style="margin-bottom:16px">
    <div class="panel-head"><h3>ERA LEDGER</h3><span class="note">what each era added, what it lost, what survives of it</span></div>
    <div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>ERA</th><th class="r">YEARS</th><th class="r">COMPLETED</th><th class="r">DEMOLISHED</th><th class="r">NET</th><th class="r">STANDING AT END</th><th class="r">OF ITS BUILDINGS SURVIVING</th><th style="width:180px">BUILT · LOST</th><th class="r">AVG FLOORS BUILT</th></tr></thead><tbody>
      ${eras.map(x => `<tr><td class="mname"><span class="era-n">${x.i + 1}</span>${esc(x.e.name)}</td>${cell(Math.min(x.e.to - 1, y1) > x.e.from ? `${x.e.from}–${Math.min(x.e.to - 1, y1)}` : String(x.e.from))}${cell(x.built)}${cell(x.demolished, 'num r hist')}${cell((x.built - x.demolished >= 0 ? '+' : '') + (x.built - x.demolished))}${cell(x.standing)}${cell(x.survive == null ? '—' : x.survive + '%')}<td><div class="bar2"><i class="a" style="width:${(x.built + x.demolished) ? x.built / (x.built + x.demolished) * 100 : 0}%"></i><i class="b" style="width:${(x.built + x.demolished) ? x.demolished / (x.built + x.demolished) * 100 : 0}%"></i></div></td>${cell(x.floors.n ? Math.round(x.floors.avg * 10) / 10 : '—')}</tr>`).join('')}
    </tbody></table></div>
  </section>
  <section class="panel hud" style="margin-bottom:16px">
    <div class="panel-head"><h3>NEIGHBORHOOD TURNOVER</h3><span class="note">demolished share · original fabric (≤ ${fabric.year}) still standing · lifespan</span></div>
    ${hoodGroups.length ? `<div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>NEIGHBORHOOD</th><th class="r">EVER BUILT</th><th class="r">STANDING</th><th class="r">DEMOLISHED</th><th class="r">TURNOVER</th><th style="width:150px"></th><th class="r">FABRIC ≤ ${fabric.year}</th><th class="r">AVG LIFESPAN</th><th class="r">LAST DEMOLITION</th></tr></thead><tbody>
      ${hoodGroups.map(g => `<tr><td><span class="dist" style="--c:${g.d ? distColor(g.d) : PALETTE.neutralBright}"><i></i>${esc(g.name)}${g.d && scopeDistricts().length > 1 ? ` <span class="muted">· ${esc(g.d.code)}</span>` : ''}</span></td>${cell(g.list.length)}${cell(g.list.length - g.dem.length)}${cell(g.dem.length, 'num r hist')}${cell(pct(g.dem.length, g.list.length) + '%')}<td><div class="bar2"><i class="a" style="width:${100 - pct(g.dem.length, g.list.length)}%"></i><i class="b" style="width:${pct(g.dem.length, g.list.length)}%"></i></div></td>${cell(g.fab.total ? `${pct(g.fab.standing, g.fab.total)}% <span class="muted">of ${g.fab.total}</span>` : '—')}${cell(g.lf.n ? Math.round(g.lf.avg * 10) / 10 + ' yrs' : '—')}${cell(g.last ?? '—')}</tr>`).join('')}
    </tbody></table></div>` : `<div class="chart-empty">No records in scope.</div>`}
  </section>
  <section class="grid cols-3" style="margin-bottom:16px">
    ${rankPanel('OLDEST SURVIVING', 'still standing, by year completed', oldest, b => `${builtHTML(b)} <span class="muted">· ${ageOf(b)} yrs</span>`, 'Date your current buildings to see the survivors of early New A.')}
    ${rankPanel('LONGEST-LIVED · LOST', 'demolished, by lifespan', longest, b => `${yearsLabel(lifespanOf(b))} <span class="muted">· ${builtHTML(b)}–${demoHTML(b)}</span>`, 'Date demolished buildings (built + demolished) to rank them.')}
    ${rankPanel('SHORTEST-LIVED · LOST', 'demolished, by lifespan', shortest, b => `${yearsLabel(lifespanOf(b))} <span class="muted">· ${builtHTML(b)}–${demoHTML(b)}</span>`, 'Date demolished buildings (built + demolished) to rank them.')}
  </section>
  <section class="grid cols-2" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>MOST GENERATIONS</h3><span class="note">sites rebuilt the most times (linked records)</span></div>
      ${sites.length ? `<div class="rank">${sites.map((x, i) => { const cur = x.comp.find(isActive) || x.comp[0]; return `<div class="row" data-open="${cur.id}" data-hover="${cur.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><div class="nm">${esc(cur.name || titleOf(cur))}</div><div class="meta">${x.chron.filter(e => !e.vacant).map(e => `<span class="${isHist(e.b) ? 'reg-h' : ''}">${esc(e.b.reg)}</span>`).join(' → ')}</div></div><div class="h">${x.comp.length} gen</div></div>`; }).join('')}</div>` : `<div class="chart-empty">Link two or more buildings on the same site (Relationships) and it ranks here.</div>`}</div>
    <div class="panel hud"><div class="panel-head"><h3>REDEVELOPED SITES</h3><span class="note">current buildings that replaced something</span></div>
      ${redev.length ? `<div class="rank">${redev.map((x, i) => { const d = districtById(x.b.districtId); return `<div class="row" data-open="${x.b.id}" data-hover="${x.b.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><div class="nm">${esc(x.b.name || titleOf(x.b))} <span class="dim" style="font-weight:400">· ${esc(x.b.reg)}</span></div><div class="meta"><i style="--c:${distColor(d)}"></i>replaced ${x.preds.map(p => `<span class="reg-h">${esc(p.reg)}</span>`).join(', ')} · built ${esc(builtHTML(x.b))}</div></div><div class="h">${x.preds.length} predecessor${x.preds.length === 1 ? '' : 's'}</div></div>`; }).join('')}</div>` : `<div class="chart-empty">Link a current building to what it replaced and it shows up here.</div>`}</div>
  </section>
  <section class="panel hud skyline-wrap" style="margin-bottom:16px;min-height:220px">
    <div class="panel-head"><h3>THE LOST SKYLINE · TALLEST ${Math.min(lost.length, 40)} DEMOLISHED</h3><span class="note">${lost.length ? 'ghosts of what stood — hover a tower · click to open' : ''}</span></div>
    ${renderSkyline(lost, { cls: 'lost', label: 'Lost skyline of demolished buildings', empty: 'No lost skyline yet', emptySub: 'Give demolished records a floor count or height and the buildings that are gone rise here as ghosts.' })}
  </section>
  <section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>DEMOLITION REASONS</h3><span class="note">${hist.filter(b => b.demolitionReason).length} with a reason</span></div>${hbarsHTML(reasons.map(x => ({ label: x.k, n: x.n })), { color: '#B84A2E', labelW: 150 })}</div>
    <div class="panel hud"><div class="panel-head"><h3>EVIDENCE QUALITY</h3><span class="note">${verified} of ${hist.length} verified</span></div>${hbarsHTML(confItems, { labelW: 120 })}${srcItems.length ? `<div class="desc-line" style="margin-top:12px;margin-bottom:6px">SOURCE TYPES</div>${hbarsHTML(srcItems.map(x => ({ label: x.k, n: x.n })), { color: PALETTE.marks[2], labelW: 120 })}` : ''}</div>
    <div class="panel hud"><div class="panel-head"><h3>HISTORICAL RECORD HEALTH</h3><span class="note">how complete the lost buildings are</span></div>${hist.length ? `<div class="hbars">${hItems.map(i => `<div class="hbar" style="--c:#B84A2E;grid-template-columns:120px 1fr 70px"><span class="nm">${esc(i.label)}</span><div class="trk"><div class="fill" style="width:${(i.n / hist.length * 100).toFixed(1)}%"></div></div><span class="v">${pct(i.n, hist.length)}%</span></div>`).join('')}</div><div class="desc-line" style="margin-top:12px">Overall completeness <b>${overall}%</b> across ${hist.length} historical record${hist.length === 1 ? '' : 's'}</div>` : `<div class="chart-empty">No historical records in scope.</div>`}</div>
  </section>`;
}
