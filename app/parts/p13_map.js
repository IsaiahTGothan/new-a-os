/* =====================================================================
   §13 MAP WORKSPACE — one full page: borders, roads, transit, stations,
       buildings. Minecraft X/Z world units everywhere; the screen is only a view.
       The scene renderer is shared with the history viewer.
   ===================================================================== */
const MAPW = {
  cam: { x: 0, z: 0, k: 1 }, w: 0, h: 0, canvas: null, ctx: null, mounted: false,
  mode: 'select', dock: 'inspector', dockOpen: true, edit: false, route: null, picking: null, anim: null,
  sel: null, hover: null, draft: null, drag: null, pointer: null, shift: false,
  snapGrid: false, snapVertex: true, gridStep: 1, junctions: true, freehand: false,
  undo: [], redo: [], fitted: false, fitPending: true, highlight: null, preview: null, pending: null, borderTarget: null, marker: null, streetsQ: '', streetsAll: false,
};
const GRID_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MODES = [
  { id: 'select', label: 'Select', icon: 'cursor', key: 'S', hint: 'Click anything to inspect it · drag a handle to move a vertex · double-click an edge to insert one' },
  { id: 'pan', label: 'Pan', icon: 'hand', key: 'P', hint: 'Drag to move around · scroll to zoom · double-click to zoom in' },
  { id: 'border', label: 'Border', icon: 'poly', key: 'B', hint: 'Click to add a vertex · click the first vertex or press Enter to close · Backspace removes the last' },
  { id: 'road', label: 'Road', icon: 'road', key: 'D', hint: 'Click to start, click to add corners · double-click or Enter to finish · hold Shift for 45° · Esc cancels' },
  { id: 'transit', label: 'Transit', icon: 'transit', key: 'L', hint: 'Draw the line: click to add points, click existing stations to stop there, Alt-click (or toggle Stop at every click) to drop new stops · Enter to finish' },
  { id: 'station', label: 'Station', icon: 'station', key: 'X', hint: 'Click on a track: the station joins every line running there (a transfer where lines meet) and slots in at the right place along each line' },
  { id: 'place', label: 'Place building', icon: 'bldg', key: 'A', hint: 'Click the building\'s position · its borough and neighborhood are suggested, never assumed' },
];
const MODE_COLOR = { border: 'var(--region)', road: 'var(--road)', transit: 'var(--transit)', station: 'var(--transit)', place: 'var(--amber)', footprint: 'var(--cyan)' };
const projFor = (cam, W, H) => ({ s: (x, z) => [(x - cam.x) * cam.k + W / 2, (z - cam.z) * cam.k + H / 2], w: (sx, sy) => [(sx - W / 2) / cam.k + cam.x, (sy - H / 2) / cam.k + cam.z] });
const w2s = (x, z) => projFor(MAPW.cam, MAPW.w, MAPW.h).s(x, z);
const s2w = (sx, sy) => projFor(MAPW.cam, MAPW.w, MAPW.h).w(sx, sy);

/* ---- page ---- */
function renderMapWorkspace() {
  return `<div class="mapws ${MAPW.edit ? 'edit' : 'explore'} ${MAPW.dockOpen && MAPW.edit ? '' : 'nodock'}">
    <div class="mapstage mode-${MAPW.mode}${MAPW.edit && MAPW.when != null ? ' dated' : ''}" id="mapstage">
      <canvas id="mapcanvas" aria-label="Map of ${esc(scopeName())}" role="img"></canvas>
      ${exploreChromeHTML()}
      <div class="map-tools" role="toolbar" aria-label="Map modes">${MODES.map((m, i) => `${i === 2 ? '<div class="sep"></div>' : ''}<button data-mode="${m.id}" aria-pressed="${MAPW.mode === m.id}" title="${esc(m.label)} (${m.key}) — ${esc(m.hint)}">${icon(m.icon)}<kbd>${m.key}</kbd></button>`).join('')}<div class="sep"></div><button data-act="map-undo" title="Undo (⌘/Ctrl+Z)" ${MAPW.undo.length ? '' : 'disabled'}>${icon('undo')}</button><button data-act="map-redo" title="Redo (⌘/Ctrl+Shift+Z)" ${MAPW.redo.length ? '' : 'disabled'}>${icon('redo')}</button></div>
      <div id="map-instr"></div>
      <div class="map-search"><div class="search" role="search">${icon('search')}<input id="map-q" placeholder="Find anything, or go to X, Z…" autocomplete="off" spellcheck="false" aria-label="Search the map"><div id="map-palette" class="palette" hidden></div></div><button class="btn icon" data-act="map-dock-toggle" title="${MAPW.dockOpen ? 'Hide' : 'Show'} the side panel">${icon('layers')}</button></div>
      <div class="map-hud">
        <div class="grp"><button data-act="map-fit" title="Fit everything in scope">${icon('fit')}</button><button data-act="map-fit-sel" title="Fit the selection" ${MAPW.sel ? '' : 'disabled'}>${icon('expand')}</button><button data-act="map-zoom" data-dir="1" title="Zoom in">${icon('zoomin')}</button><button data-act="map-zoom" data-dir="-1" title="Zoom out">${icon('zoomout')}</button></div>
        <div class="grp"><button data-act="map-snap-grid" aria-pressed="${MAPW.snapGrid}" title="Snap to whole blocks">grid ${MAPW.gridStep}</button><button data-act="map-snap-vertex" aria-pressed="${MAPW.snapVertex}" title="Snap to existing vertices and lines">snap</button><button data-act="map-junctions" aria-pressed="${MAPW.junctions}" title="Show junction markers">junctions</button></div>
        ${whenControlHTML()}<div class="grp coord" id="map-coord"><span>X <b>—</b></span><span>Z <b>—</b></span><span class="muted" id="map-zoom-t"></span></div>
        <span class="spacer"></span>
        <div class="grp" id="map-save-note" style="font-family:var(--font-mono);font-size:11px;color:var(--ink-3);padding:0 10px;height:34px;display:inline-flex;align-items:center;white-space:nowrap;overflow:hidden;min-width:0;flex-shrink:1">edits the registry, not the world</div>
        <div class="grp scale" id="map-scale"><span id="map-scale-t">—</span><i id="map-scale-i"></i></div>
      </div>
    </div>
    ${MAPW.dockOpen && MAPW.edit ? `<aside class="dock" id="dock">
      <div class="dock-tabs" role="tablist">${[['inspector', 'Inspector', 'cursor'], ['layers', 'Layers', 'layers'], ['streets', 'Streets', 'road'], ['assistant', 'Assistant', 'spark']].map(([id, l, ic]) => `<button role="tab" data-dock="${id}" aria-selected="${MAPW.dock === id}">${icon(ic)}${l}${id === 'streets' ? ` <span class="cnt">${S.roads.length}</span>` : ''}</button>`).join('')}</div>
      <div class="dock-body" id="dock-body"></div>
    </aside>` : ''}
  </div>`;
}
function mapMount() {
  const c = $('#mapcanvas'); if (!c) return;
  MAPW.canvas = c; MAPW.ctx = c.getContext('2d'); MAPW.mounted = true;
  mapResize(); if (!MAPW.fitted || MAPW.fitPending) { mapFit(); MAPW.fitted = true; MAPW.fitPending = false; }
  c.addEventListener('pointerdown', mapPointerDown); c.addEventListener('pointermove', mapPointerMove); c.addEventListener('pointerup', mapPointerUp);
  c.addEventListener('pointerleave', () => { MAPW.hover = null; MAPW.pointer = null; hideHover(); mapDraw(); });
  c.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); mapZoomAt(f, e.offsetX, e.offsetY); }, { passive: false });
  c.addEventListener('dblclick', mapDblClick);
  c.addEventListener('contextmenu', e => { e.preventDefault(); if (MAPW.draft) mapFinishDraft(); });
  if (!MAPW.resizeBound) { window.addEventListener('resize', () => { if ($('#mapcanvas') && UI.nav === 'map') { mapResize(); mapDraw(); } }); MAPW.resizeBound = true; }
  wireMapSearch(); wireWhenControl(); $('#mapstage')?.classList.toggle('dated', MAPW.when != null); renderMapInstr(); renderDock(); wireExplore(); renderPlaceCard(); mapDraw();
}
/* smooth camera flight to an extent (respects reduced motion) */
function mapFlyTo(ext, { pad = 70, maxK = 6 } = {}) {
  if (!ext) return; const w = Math.max(60, ext.x2 - ext.x1), h = Math.max(60, ext.z2 - ext.z1);
  const to = { k: clamp(Math.min((MAPW.w - pad * 2) / w, (MAPW.h - pad * 2) / h), 0.02, maxK), x: (ext.x1 + ext.x2) / 2, z: (ext.z1 + ext.z2) / 2 };
  if (!motionOn()) { MAPW.cam = to; mapDraw(); return; }
  const from = { ...MAPW.cam }; const t0 = performance.now(); const dur = 520; MAPW.anim = { from, to };
  const step = t => { if (MAPW.anim?.to !== to) return; const p = easeOut((t - t0) / dur); MAPW.cam = { x: from.x + (to.x - from.x) * p, z: from.z + (to.z - from.z) * p, k: from.k * Math.pow(to.k / from.k, p) }; mapDraw(); if (p < 1) requestAnimationFrame(step); else { MAPW.cam = { ...to }; MAPW.anim = null; mapDraw(); } };
  requestAnimationFrame(step);
}
function mapLeave() { MAPW.draft = null; MAPW.drag = null; MAPW.marker = null; MAPW.mounted = false; if (MAPW.mode === 'footprint') MAPW.mode = 'select'; MAPW.pending = null; }
function mapResize() { const c = MAPW.canvas, r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); MAPW.w = Math.max(10, r.width); MAPW.h = Math.max(10, r.height); c.width = MAPW.w * dpr; c.height = MAPW.h * dpr; MAPW.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
function mapZoomAt(f, sx, sy) { const [wx, wz] = s2w(sx, sy); MAPW.cam.k = clamp(MAPW.cam.k * f, 0.02, 40); const [nx, nz] = s2w(sx, sy); MAPW.cam.x += wx - nx; MAPW.cam.z += wz - nz; mapDraw(); }
/* everything that has a place in the scope, for framing */
function scopeExtent(sc = UI.scope) {
  const node = scopeNode(sc); const pts = [];
  if (node?.polygons?.length) pts.push(...node.polygons.flat());
  for (const d of scopeDistricts(sc)) if (d.polygons?.length) pts.push(...d.polygons.flat());
  for (const b of scopeBuildings(sc)) if (b.x != null && b.z != null) pts.push([b.x, b.z]);
  if (!pts.length) { for (const r of S.roads) pts.push(...r.geometry); for (const s of S.stations) if (s.x != null) pts.push([s.x, s.z]); }
  return bboxOf(pts);
}
function mapFit(ext) {
  ext = ext || scopeExtent();
  if (!ext) { MAPW.cam = { x: 0, z: 0, k: 1 }; mapDraw(); return; }
  const pad = 70; const w = Math.max(120, ext.x2 - ext.x1), h = Math.max(120, ext.z2 - ext.z1);
  MAPW.cam.k = clamp(Math.min((MAPW.w - pad * 2) / w, (MAPW.h - pad * 2) / h), 0.02, 14);
  MAPW.cam.x = (ext.x1 + ext.x2) / 2; MAPW.cam.z = (ext.z1 + ext.z2) / 2; mapDraw();
}
function selExtent(sel) {
  if (!sel) return null;
  if (sel.kind === 'building') { const b = byId(sel.id); return b && b.x != null ? { x1: b.x - 30, z1: b.z - 30, x2: b.x + 30, z2: b.z + 30 } : null; }
  if (sel.kind === 'station') { const s = stationById(sel.id); return s && s.x != null ? { x1: s.x - 30, z1: s.z - 30, x2: s.x + 30, z2: s.z + 30 } : null; }
  if (sel.kind === 'road') { const r = roadById(sel.id); return r ? bboxOf(r.geometry) : null; }
  if (sel.kind === 'line') { const l = lineById(sel.id); return l ? bboxOf([...lineGeometries(l).flat(), ...stationsOf(l).filter(s => s.x != null).map(s => [s.x, s.z])]) : null; }
  const node = nodeById(sel.id); return node?.polygons?.length ? bboxOfPolys(node.polygons) : null;
}

/* ---- snapping ---- */
function snapPoint(p, { exclude = null } = {}) {
  let q = p.slice(); let snapped = null;
  if (MAPW.snapVertex) {
    const tol = 8 / MAPW.cam.k; let best = tol;
    const consider = (pt, what) => { const d = dist2(p, pt); if (d < best) { best = d; q = pt.slice(); snapped = what; } };
    for (const node of [...S.regions, ...S.districts, ...S.neighborhoods]) for (const poly of node.polygons || []) for (const pt of poly) { if (exclude && exclude.id === node.id) continue; consider(pt, 'vertex'); }
    for (const r of S.roads) for (const pt of r.geometry) { if (exclude?.kind === 'road' && exclude.id === r.id) continue; consider(pt, 'vertex'); }
    for (const t of S.tracks) for (const pt of t.geometry) consider(pt, 'vertex');
    for (const s of S.stations) if (s.x != null) consider([s.x, s.z], 'station');
    if (!snapped) { // along a line
      for (const r of S.roads) { if (exclude?.kind === 'road' && exclude.id === r.id) continue; const c = polylineClosest(p, r.geometry); if (c && c.d < best) { best = c.d; q = c.q; snapped = 'road'; } }
      for (const t of S.tracks) { const c = polylineClosest(p, t.geometry); if (c && c.d < best) { best = c.d; q = c.q; snapped = 'track'; } }
    }
    if (MAPW.draft?.pts?.length) for (const pt of MAPW.draft.pts) consider(pt, 'draft');
  }
  if (MAPW.snapGrid || !snapped) { const g = MAPW.snapGrid ? MAPW.gridStep : 1; q = [Math.round(q[0] / g) * g, Math.round(q[1] / g) * g]; }
  return { p: q, snapped };
}

/* ---- undo / redo: whole geometry snapshots ---- */
function geomSnapshot() { return JSON.stringify({ regions: S.regions.map(r => ({ id: r.id, polygons: r.polygons })), districts: S.districts.map(d => ({ id: d.id, polygons: d.polygons })), hoods: S.neighborhoods.map(h => ({ id: h.id, polygons: h.polygons })), roads: S.roads, tracks: S.tracks, lines: S.lines, stations: S.stations, buildings: S.buildings.map(b => ({ id: b.id, x: b.x, z: b.z, entrance: b.entrance, footprint: b.footprint, districtId: b.districtId, neighborhoodId: b.neighborhoodId, lotRotated: b.lotRotated, roadId: b.roadId, roadIdSource: b.roadIdSource, lot: b.lot || null, lotArea: b.lotArea, lotFront: b.lotFront, lotDepth: b.lotDepth, lotSource: b.lotSource || '' })), gseq: S.meta.gseq }); }
function geomRestore(json) {
  const g = JSON.parse(json);
  for (const r of g.regions) { const x = regionById(r.id); if (x) x.polygons = r.polygons; } for (const d of g.districts) { const x = districtById(d.id); if (x) x.polygons = d.polygons; } for (const h of g.hoods) { const x = hoodById(h.id); if (x) x.polygons = h.polygons; }
  S.roads = g.roads; S.tracks = g.tracks; S.lines = g.lines; S.stations = g.stations; S.meta.gseq = g.gseq;
  const map = new Map(g.buildings.map(b => [b.id, b])); for (const b of S.buildings) { const o = map.get(b.id); if (o) { b.x = o.x; b.z = o.z; b.entrance = o.entrance; b.footprint = o.footprint; if ('lotRotated' in o) { b.lotRotated = o.lotRotated; b.roadId = o.roadId; b.roadIdSource = o.roadIdSource; } if ('lot' in o) { b.lot = o.lot; b.lotArea = o.lotArea; b.lotFront = o.lotFront; b.lotDepth = o.lotDepth; b.lotSource = o.lotSource; } } }
  ensureV3(S);
}
function mapPushUndo() { MAPW.undo.push(geomSnapshot()); if (MAPW.undo.length > 40) MAPW.undo.shift(); MAPW.redo = []; }
function mapUndo() { if (!MAPW.undo.length) return; MAPW.redo.push(geomSnapshot()); geomRestore(MAPW.undo.pop()); MAPW.draft = null; if (MAPW.sel && !selExists(MAPW.sel)) MAPW.sel = null; commit(); renderDock(); refreshTools(); mapDraw(); toast('Undone', ''); }
function mapRedo() { if (!MAPW.redo.length) return; MAPW.undo.push(geomSnapshot()); geomRestore(MAPW.redo.pop()); if (MAPW.sel && !selExists(MAPW.sel)) MAPW.sel = null; commit(); renderDock(); refreshTools(); mapDraw(); toast('Redone', ''); }
const selExists = sel => sel.kind === 'building' ? !!byId(sel.id) : sel.kind === 'road' ? !!roadById(sel.id) : sel.kind === 'line' ? !!lineById(sel.id) : sel.kind === 'station' ? !!stationById(sel.id) : sel.kind === 'junction' ? true : !!nodeById(sel.id);
function refreshTools() { $$('.map-tools [data-act="map-undo"]').forEach(b => b.disabled = !MAPW.undo.length); $$('.map-tools [data-act="map-redo"]').forEach(b => b.disabled = !MAPW.redo.length); $$('.map-hud [data-act="map-fit-sel"]').forEach(b => b.disabled = !MAPW.sel); }

/* ---- modes & instructions ---- */
function setMapMode(mode, opts = {}) {
  if (!MAPW.edit && mode !== 'select' && mode !== 'pan') { setMapEdit(true, { keepMode: true }); }
  if (MAPW.draft && mode !== MAPW.mode && !opts.keepDraft) MAPW.draft = null;
  MAPW.mode = mode; if (mode !== 'footprint' && mode !== 'place') MAPW.pending = opts.pending || null; else if (opts.pending) MAPW.pending = opts.pending;
  if (mode === 'border') { MAPW.borderTarget = opts.target || MAPW.borderTarget || (['region', 'district', 'hood'].includes(UI.scope.kind) ? { kind: UI.scope.kind, id: UI.scope.id } : null); }
  $$('.map-tools [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  const st = $('#mapstage'); if (st) st.className = `mapstage mode-${mode}${mapWhen() != null ? ' dated' : ''}`;
  renderMapInstr(); mapDraw();
}
const borderTargetNode = () => MAPW.borderTarget ? nodeById(MAPW.borderTarget.id) : null;
function renderMapInstr() {
  const el = $('#map-instr'); if (!el) return; const m = MODES.find(x => x.id === MAPW.mode);
  const n = MAPW.draft?.pts?.length || 0;
  let html = '';
  if (MAPW.mode === 'select' || MAPW.mode === 'pan') { el.innerHTML = MAPW.pending ? `<div class="map-instr warn"><span class="mode">RETURN</span>${esc(MAPW.pending.label || 'Pick a point')}<div class="acts"><button class="btn sm ghost" data-act="map-cancel-pending">Cancel</button></div></div>` : ''; return; }
  if (MAPW.mode === 'border') { const t = borderTargetNode(); const choices = [...S.regions.map(r => ({ kind: 'region', id: r.id, name: `${r.name} (${REGION_TYPE[r.type]?.label || r.type})` })), ...S.districts.map(d => ({ kind: 'district', id: d.id, name: `${d.name} (${d.type})` })), ...S.neighborhoods.map(h => ({ kind: 'hood', id: h.id, name: `${h.name} (neighborhood of ${districtById(h.districtId)?.name || '?'})` }))]; html = `<span class="mode" style="--c:${MODE_COLOR.border}">BORDER</span><span>for</span><select id="border-target" style="background:var(--bg-2);border:1px solid var(--line-2);color:var(--ink);border-radius:4px;height:26px;max-width:220px"><option value="">— choose a place —</option>${choices.map(c => `<option value="${c.kind}:${c.id}" ${t && MAPW.borderTarget.kind === c.kind && MAPW.borderTarget.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span>${n ? `${n} vert${n === 1 ? 'ex' : 'ices'} · click the first one or <kbd>Enter</kbd> to close` : 'click to add vertices'}</span>${MAPW.shift ? '<kbd>45°</kbd>' : ''}`; }
  else if (MAPW.mode === 'transit') { const ns = MAPW.draft?.stops?.length || 0; const ln = MAPW.draft?.lineId ? lineById(MAPW.draft.lineId) : MAPW.sel?.kind === 'line' ? lineById(MAPW.sel.id) : null; html = `<span class="mode" style="--c:${MODE_COLOR.transit}">TRANSIT</span><span>${ln ? `${MAPW.draft?.extend ? 'extending' : 'new track for'} <b>${esc(lineLabel(ln))}</b> · ` : 'new line · '}${n ? `${n} pt · ${fmtInt(polyLength(MAPW.draft.pts))} blk · <b>${ns}</b> stop${ns === 1 ? '' : 's'}` : 'click to start'} · click a station to stop there · <kbd>Alt</kbd>-click drops a new stop</span><button class="btn sm ${MAPW.stopMode ? 'primary' : 'ghost'}" data-act="map-stopmode" aria-pressed="${MAPW.stopMode}" title="Every click places a stop (T)">${icon('station')} Stop at every click</button>${MAPW.shift ? '<kbd>45°</kbd>' : ''}`; }
  else if (MAPW.mode === 'road') { html = `<span class="mode" style="--c:${MODE_COLOR[MAPW.mode]}">${MAPW.mode === 'road' ? 'ROAD' : 'TRANSIT'}</span><span>${n ? `${n} point${n === 1 ? '' : 's'} · ${fmtInt(polyLength(MAPW.draft.pts))} blk${MAPW.draft.cursor && n ? ' → ' + fmtInt(polyLength([...MAPW.draft.pts, MAPW.draft.cursor])) + ' blk' : ''} · double-click or <kbd>Enter</kbd> to finish` : (MAPW.draft?.extend ? 'extending — click to add points' : 'click to start')}</span><label class="switch" style="font-size:11.5px;gap:6px" title="Drag to sketch, released strokes are simplified"><input type="checkbox" id="freehand" ${MAPW.freehand ? 'checked' : ''}> freehand</label>${MAPW.shift ? '<kbd>45°</kbd>' : ''}`; }
  else if (MAPW.mode === 'station') html = `<span class="mode" style="--c:${MODE_COLOR.station}">STATION</span><span>${MAPW.sel?.kind === 'line' ? `click on or near <b>${esc(lineLabel(lineById(MAPW.sel.id)))}</b> to add stops in order · click an existing station to make it a transfer` : 'click on a track: the station joins every line there · click between two lines for a transfer'}</span>`;
  else if (MAPW.mode === 'place') html = `<span class="mode" style="--c:${MODE_COLOR.place}">PLACE</span><span>${MAPW.pending ? esc(MAPW.pending.label) : 'click to position a new building'}</span>`;
  else if (MAPW.mode === 'footprint') html = `<span class="mode" style="--c:${MODE_COLOR.footprint}">${MAPW.pending?.kind === 'lot' ? 'LOT' : 'FOOTPRINT'}</span><span>${esc(MAPW.pending?.label || 'trace the building outline')} · ${n} vertices · <kbd>Enter</kbd> to close</span>`;
  el.innerHTML = `<div class="map-instr">${html}<div class="acts">${n ? `<button class="btn sm ghost" data-act="map-draft-undo" title="Remove the last vertex (Backspace)">${icon('undo')}</button>` : ''}${n ? `<button class="btn sm primary" data-act="map-finish">${icon('check')} Finish</button>` : ''}<button class="btn sm ghost" data-act="map-cancel">Cancel</button></div></div>`;
  $('#border-target')?.addEventListener('change', e => { const [kind, id] = e.target.value.split(':'); MAPW.borderTarget = kind ? { kind, id } : null; renderMapInstr(); mapDraw(); });
  $('#freehand')?.addEventListener('change', e => { MAPW.freehand = e.target.checked; });
}

/* ---- pointer interaction ---- */
function mapPointerDown(e) {
  const c = MAPW.canvas; c.setPointerCapture(e.pointerId); const raw = s2w(e.offsetX, e.offsetY); MAPW.shift = e.shiftKey;
  if (MAPW.mode === 'pan' || e.button === 1) { MAPW.drag = { kind: 'pan', sx: e.offsetX, sy: e.offsetY, cx: MAPW.cam.x, cz: MAPW.cam.z, moved: false }; $('#mapstage').classList.add('panning'); return; }
  if (e.button !== 0) return;
  if (!MAPW.edit && EXPLORE.picking) { const hit = hitTest(e.offsetX, e.offsetY); MAPW.drag = { kind: 'pan', sx: e.offsetX, sy: e.offsetY, cx: MAPW.cam.x, cz: MAPW.cam.z, moved: false, clickHit: hit || { kind: 'point', pt: roundPt(raw) } }; $('#mapstage').classList.add('panning'); return; }
  if (MAPW.mode === 'select') {
    const vh = hitVertex(e.offsetX, e.offsetY);
    if (vh) { mapPushUndo(); MAPW.drag = { kind: 'vertex', ...vh, moved: false }; MAPW.sel = { ...MAPW.sel, vertex: vh.index, part: vh.part }; return; }
    const hit = hitTest(e.offsetX, e.offsetY);
    MAPW.drag = { kind: 'pan', sx: e.offsetX, sy: e.offsetY, cx: MAPW.cam.x, cz: MAPW.cam.z, moved: false, clickHit: hit }; $('#mapstage').classList.add('panning'); return;
  }
  if ((MAPW.mode === 'road' || MAPW.mode === 'transit') && MAPW.freehand) { const { p } = snapPoint(raw); MAPW.draft = { kind: 'polyline', pts: [p], cursor: null, free: true, forKind: MAPW.mode }; MAPW.drag = { kind: 'free' }; mapDraw(); return; }
  if (['border', 'road', 'transit', 'footprint'].includes(MAPW.mode)) { mapAddVertex(raw, e); return; }
  if (MAPW.mode === 'station') { if (!mapStationClick(raw)) placeStationSmart(raw); return; }
  if (MAPW.mode === 'place') { placeBuildingAt(raw); return; }
}
function mapPointerMove(e) {
  const raw = s2w(e.offsetX, e.offsetY); MAPW.shift = e.shiftKey; MAPW.pointer = raw;
  const co = $('#map-coord'); if (co) co.innerHTML = `<span>X <b>${Math.round(raw[0])}</b></span><span>Z <b>${Math.round(raw[1])}</b></span><span class="muted" id="map-zoom-t">${MAPW.cam.k.toFixed(2)} px/blk</span>`;
  if (MAPW.drag?.kind === 'pan') { const dx = e.offsetX - MAPW.drag.sx, dy = e.offsetY - MAPW.drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) MAPW.drag.moved = true; if (MAPW.drag.moved) { MAPW.cam.x = MAPW.drag.cx - dx / MAPW.cam.k; MAPW.cam.z = MAPW.drag.cz - dy / MAPW.cam.k; mapDraw(); } return; }
  if (MAPW.drag?.kind === 'vertex') { const { p } = snapPoint(raw, { exclude: MAPW.drag.exclude }); setVertex(MAPW.drag, p); MAPW.drag.moved = true; mapDraw(); return; }
  if (MAPW.drag?.kind === 'free' && MAPW.draft) { const last = MAPW.draft.pts[MAPW.draft.pts.length - 1]; if (dist2(last, raw) >= 1.5 / MAPW.cam.k) MAPW.draft.pts.push(roundPt(raw)); mapDraw(); return; }
  if (MAPW.draft) { let p = snapPoint(raw).p; if (MAPW.shift && MAPW.draft.pts.length) p = roundPt(snap45(MAPW.draft.pts[MAPW.draft.pts.length - 1], p)); MAPW.draft.cursor = p; MAPW.draft.snapped = snapPoint(raw).snapped; renderMapInstr(); mapDraw(); return; }
  if (MAPW.mode === 'select') {
    const vh = MAPW.edit ? hitVertex(e.offsetX, e.offsetY) : null; const st = $('#mapstage'); st.classList.toggle('over-handle', !!vh);
    const hit = vh ? null : hitTest(e.offsetX, e.offsetY); st.classList.toggle('over-hit', !!hit);
    st.classList.toggle('explore-hit', !MAPW.edit && !!hit);
    const key = hit ? hit.kind + ':' + hit.id : null, prev = MAPW.hover ? MAPW.hover.kind + ':' + MAPW.hover.id : null;
    if (key !== prev) { MAPW.hover = hit; mapDraw(); if (hit && (hit.kind === 'building' || ['road', 'station', 'line', 'business'].includes(hit.kind))) showHover(hit.kind === 'building' ? hit.id : hit.kind + ':' + hit.id, e.clientX, e.clientY); else hideHover(); } else if (hit) positionHover(e.clientX, e.clientY);
  } else if (['station', 'place'].includes(MAPW.mode)) { mapDraw(); }
}
function mapPointerUp(e) {
  const d = MAPW.drag; MAPW.drag = null; $('#mapstage')?.classList.remove('panning');
  if (!d) return;
  if (d.kind === 'pan') { if (!d.moved && MAPW.mode === 'select') mapSelect(d.clickHit); return; }
  if (d.kind === 'vertex') { if (d.moved) { afterGeometryChange(d.target); commit(); } else MAPW.undo.pop(); renderDock(); mapDraw(); return; }
  if (d.kind === 'free' && MAPW.draft) { const tol = Math.max(1, 2.5 / MAPW.cam.k); MAPW.draft.pts = simplifyPath(MAPW.draft.pts, tol).map(roundPt); MAPW.draft.free = false; if (MAPW.draft.pts.length >= 2) mapFinishDraft(); else { MAPW.draft = null; mapDraw(); } }
}
function mapDblClick(e) {
  if (MAPW.draft && (MAPW.mode === 'road' || MAPW.mode === 'transit')) { e.preventDefault(); if (MAPW.draft.pts.length >= 2 && MAPW.draft.pts.length && dist2(MAPW.draft.pts[MAPW.draft.pts.length - 1], MAPW.draft.pts[MAPW.draft.pts.length - 2] || [1e9, 1e9]) < 0.5) MAPW.draft.pts.pop(); mapFinishDraft(); return; }
  if (MAPW.mode === 'select' && MAPW.sel && ['road', 'line', 'region', 'district', 'hood', 'building'].includes(MAPW.sel.kind)) { const ins = hitSegment(e.offsetX, e.offsetY); if (ins) { mapPushUndo(); insertVertex(ins); afterGeometryChange(ins.target); commit(); renderDock(); mapDraw(); toast('Vertex inserted — drag it into place', ''); return; } }
  if (MAPW.mode === 'pan' || (MAPW.mode === 'select' && !MAPW.sel)) mapZoomAt(1.8, e.offsetX, e.offsetY);
}
/* ---- drafts ---- */
function mapAddVertex(raw, e = null) {
  if (MAPW.mode === 'border' && !MAPW.borderTarget) { toast('Choose which place this border belongs to first', 'warn'); return; }
  const snap = snapPoint(raw); let { p } = snap; if (MAPW.shift && MAPW.draft?.pts.length) p = roundPt(snap45(MAPW.draft.pts[MAPW.draft.pts.length - 1], p)); p = roundPt(p);
  if (!MAPW.draft) MAPW.draft = { kind: MAPW.mode === 'border' || MAPW.mode === 'footprint' ? 'polygon' : 'polyline', pts: [], cursor: p, forKind: MAPW.mode };
  const pts = MAPW.draft.pts;
  if (MAPW.draft.kind === 'polygon' && pts.length >= 3 && dist2(w2s(...p), w2s(...pts[0])) < 10 / 1) { mapFinishDraft(); return; }   // clicked the first vertex → close
  if (pts.length && dist2(pts[pts.length - 1], p) < 0.5) return;   // same block twice (a double-click's first click): ignore quietly
  pts.push(p); if (MAPW.mode === 'transit') transitDraftStop(raw, snap, e); renderMapInstr(); mapDraw();
}
function mapDraftUndo() { if (!MAPW.draft) return; MAPW.draft.pts.pop(); if (MAPW.draft.stops) MAPW.draft.stops = MAPW.draft.stops.filter(x => x.i < MAPW.draft.pts.length); if (!MAPW.draft.pts.length) MAPW.draft = null; renderMapInstr(); mapDraw(); }
function mapCancel() { MAPW.draft = null; const pend = MAPW.pending; MAPW.pending = null; if (MAPW.mode === 'footprint' || MAPW.mode === 'place') setMapMode('select'); else renderMapInstr(); mapDraw(); if (pend?.resume) pend.resume(); }
function mapFinishDraft() {
  const d = MAPW.draft; if (!d) return;
  if (d.kind === 'polygon') {
    if (d.pts.length < 3) { toast('A border needs at least three vertices', 'warn'); return; }
    if (polyDuplicateVertices(d.pts)) { toast('Two consecutive vertices sit on the same block — remove one (Backspace)', 'warn'); return; }
    if (polySelfIntersects(d.pts)) { toast('The shape crosses itself — move the last vertices or undo them (Backspace)', 'warn'); return; }
    if (MAPW.mode === 'footprint' && MAPW.pending?.kind === 'lot') { finishLotDraft(d.pts); const pend = MAPW.pending; MAPW.draft = null; MAPW.pending = null; setMapMode('select'); mapDraw(); pend.resume?.(); return; }
    if (MAPW.mode === 'footprint' && MAPW.pending?.buildingId) { const editing = DR.draft?.id === MAPW.pending.buildingId && DR.mode === 'edit'; const b = editing ? DR.draft : (byId(MAPW.pending.buildingId) || (DR.draft?.id === MAPW.pending.buildingId ? DR.draft : null)); if (b) { if (!editing) mapPushUndo(); b.footprint = d.pts.slice(); b.updated = now(); if (!editing) commit(); toast(`Footprint saved · ${fmtInt(polyArea(d.pts))} blk²`, 'good'); } const pend = MAPW.pending; MAPW.draft = null; MAPW.pending = null; setMapMode('select'); mapDraw(); pend.resume?.(); return; }
    const node = borderTargetNode(); if (!node) { toast('Choose which place this border belongs to', 'warn'); return; }
    mapPushUndo(); node.polygons = [...(node.polygons || []), d.pts.slice()]; if (node.bounds !== undefined) node.bounds = bboxOfPolys(node.polygons); node.updated = now();
    const overlaps = peerOverlaps(node, MAPW.borderTarget.kind);
    commit(); MAPW.draft = null; MAPW.sel = { kind: MAPW.borderTarget.kind, id: node.id }; setMapMode('select'); renderDock(); refreshTools(); mapDraw();
    toast(`Border saved for ${node.name} · ${fmtInt(polyArea(d.pts))} blk²${overlaps.length ? ` · overlaps ${overlaps.map(o => o.node.name).join(', ')}` : ''}`, overlaps.length ? 'warn' : 'good');
    containmentReport(node);
    return;
  }
  if (d.pts.length < 2) { toast('Add at least two points', 'warn'); return; }
  mapPushUndo();
  if (d.forKind === 'transit') { MAPW.undo.pop(); finishTransitDraft(d); return; }
  if (d.extend) { const target = d.extend; const arr = roadById(target.id); if (arr) { const e = editableShape(arr, 'road'); const g = e?.target.kind === 'shape' ? geomArray(e.target, 0) : arr.geometry; const next = d.prepend ? [...d.pts.slice(1).reverse(), ...g] : [...g, ...d.pts.slice(1)]; g.splice(0, g.length, ...next); arr.updated = now(); JUNCTION_CACHE.key = ''; commit(); MAPW.draft = null; MAPW.sel = { kind: 'road', id: arr.id }; setMapMode('select'); renderDock(); mapDraw(); toast(`Extended${e?.label ? ' · ' + e.label : ''} · now ${fmtInt(polyLength(g))} blk`, 'good'); return; } }
  if (d.forKind === 'road') {
    const attach = MAPW.attachRoadId ? roadById(MAPW.attachRoadId) : null; MAPW.attachRoadId = null;
    if (attach && !(attach.geometry || []).length) { attach.geometry = d.pts.slice(); attach.updated = now(); MAPW.draft = null; MAPW.sel = { kind: 'road', id: attach.id }; setMapMode('select'); commit(); renderDock(); refreshTools(); mapDraw(); toast(`${roadLabel(attach)} drawn · ${fmtInt(polyLength(attach.geometry))} blocks`, 'good'); return; }
    const r = newRoad(S); r.geometry = d.pts.slice(); r.name = ''; stampWhen(r); S.roads.push(r);
    MAPW.draft = null; MAPW.sel = { kind: 'road', id: r.id }; setMapMode('select'); commit(); renderDock(); refreshTools(); mapDraw();
    toast(`${r.reg} drawn · ${fmtInt(polyLength(r.geometry))} blocks — name it in the inspector`, 'good'); setTimeout(() => $('#insp-name')?.focus(), 60);
    return;
  }
}
function placeBuildingAt(raw) {
  const p = roundPt(snapPoint(raw).p); const pend = MAPW.pending;
  if (pend?.kind === 'place-building') {
    const editing = DR.draft?.id === pend.buildingId && !!pend.resume && DR.mode === 'edit'; const b = editing ? DR.draft : (byId(pend.buildingId) || (DR.draft?.id === pend.buildingId ? DR.draft : null));
    if (b) { if (!editing && byId(pend.buildingId)) mapPushUndo(); if (pend.field === 'entrance') b.entrance = { x: p[0], z: p[1] }; else { b.x = p[0]; b.z = p[1]; } b.updated = now(); if (!editing && byId(pend.buildingId)) commit(); }
    MAPW.pending = null; setMapMode('select'); mapDraw(); toast(pend.field === 'entrance' ? `Entrance set at X ${p[0]} · Z ${p[1]}` : `Position set at X ${p[0]} · Z ${p[1]}`, 'good'); pend.resume?.(); return;
  }
  const sug = placeSuggest(p[0], p[1]); const did = sug.districts[0]?.d.id || (UI.scope.kind === 'district' ? UI.scope.id : null);
  setMapMode('select'); const wh = mapWhen() != null ? hyFromIndex(mapWhen()) : null; newBuildingFlow(did, { preset: { x: p[0], z: p[1], neighborhoodId: sug.hoods[0]?.h.id || null, ...(wh ? { yearBuilt: wh.year, halfBuilt: wh.half } : {}) } });
  toast(sug.districts.length ? `Inside ${sug.districts.map(x => x.d.name).join(' / ')} by the drawn borders — confirm in the form` : 'Outside every drawn border — choose the district in the form', '');
}
/* after a border changes: report (never move) buildings whose coordinates now fall outside */
function containmentReport(node) {
  const kind = S.regions.includes(node) ? 'region' : S.districts.includes(node) ? 'district' : 'hood';
  const mine = kind === 'region' ? scopeBuildings({ kind: 'region', id: node.id }) : kind === 'district' ? buildingsIn(node.id) : S.buildings.filter(b => b.neighborhoodId === node.id);
  const outside = mine.filter(b => b.x != null && pointInPolys([b.x, b.z], node.polygons) === 'out');
  const strangers = S.buildings.filter(b => !mine.includes(b) && b.x != null && pointInPolys([b.x, b.z], node.polygons) === 'in');
  if (outside.length || strangers.length) toast(`${outside.length ? `${outside.length} of its buildings sit outside the new border` : ''}${outside.length && strangers.length ? ' · ' : ''}${strangers.length ? `${strangers.length} other buildings fall inside it` : ''} — nothing was moved; see the inspector`, 'warn');
}

/* ---- hit testing (screen space) ---- */
function hitVertex(sx, sy) {
  const sel = MAPW.sel; if (!sel) return null; const geoms = selGeometries(sel); if (!geoms) return null;
  for (const g of geoms) for (let i = 0; i < g.pts.length; i++) { const [x, y] = w2s(...g.pts[i]); if (Math.hypot(x - sx, y - sy) < 8) return { target: g.target, part: g.part, index: i, exclude: g.exclude }; }
  return null;
}
function hitSegment(sx, sy) {
  const sel = MAPW.sel; if (!sel) return null; const geoms = selGeometries(sel); if (!geoms) return null; const p = s2w(sx, sy);
  for (const g of geoms) { const pts = g.closed ? [...g.pts, g.pts[0]] : g.pts; const c = polylineClosest(p, pts); if (c && c.d * MAPW.cam.k < 8) return { target: g.target, part: g.part, index: c.i + 1, point: roundPt(c.q) }; }
  return null;
}
/* the editable geometries of a selection: [{ target, part, pts, closed }] */
function selGeometries(sel) {
  if (sel.kind === 'road') { const r = roadById(sel.id); const e = r ? editableShape(r, 'road') : null; return e ? [{ target: e.target, part: 0, pts: e.pts, closed: false, exclude: { kind: 'road', id: r.id } }] : null; }
  if (sel.kind === 'line') { const l = lineById(sel.id); return l ? lineTracks(l).map((t, i) => { const e = editableShape(t, 'track'); return e ? { target: e.target, part: i, pts: e.pts, closed: false } : null; }).filter(Boolean) : null; }
  if (sel.kind === 'building') { const b = byId(sel.id); if (!b) return null; const out = []; if (b.footprint) out.push({ target: { kind: 'footprint', id: b.id }, part: 0, pts: b.footprint, closed: true, label: 'FOOTPRINT' }); if (lotOutline(b)) out.push({ target: { kind: 'lot', id: b.id }, part: 1, pts: b.lot, closed: true, label: 'LOT' }); return out.length ? out : null; }
  if (['region', 'district', 'hood'].includes(sel.kind)) { const n = nodeById(sel.id); return n ? (n.polygons || []).map((p, i) => ({ target: { kind: sel.kind, id: n.id }, part: i, pts: p, closed: true, exclude: { id: n.id } })) : null; }
  return null;
}
function geomArray(target, part) { if (target.kind === 'shape') { const o = target.owner === 'road' ? roadById(target.id) : trackById(target.id); return (o?.versions || []).find(v => v.id === target.vid)?.geometry; } if (target.kind === 'road') return roadById(target.id)?.geometry; if (target.kind === 'track') return trackById(target.id)?.geometry; if (target.kind === 'footprint') return byId(target.id)?.footprint; if (target.kind === 'lot') return byId(target.id)?.lot; return nodeById(target.id)?.polygons?.[part]; }
function setVertex(d, p) { const arr = geomArray(d.target, d.part); if (arr && arr[d.index]) arr[d.index] = roundPt(p); }
function insertVertex(ins) { const arr = geomArray(ins.target, ins.part); if (arr) arr.splice(ins.index, 0, ins.point); }
function deleteSelectedVertex() {
  const sel = MAPW.sel; if (!sel || sel.vertex == null) return; const geoms = selGeometries(sel); const g = geoms?.find(x => x.part === (sel.part || 0)); if (!g) return;
  const min = g.closed ? 3 : 2; if (g.pts.length <= min) { toast(`Needs at least ${min} points — delete the whole ${g.closed ? 'part' : 'road'} instead`, 'warn'); return; }
  mapPushUndo(); g.pts.splice(sel.vertex, 1); afterGeometryChange(g.target); MAPW.sel = { kind: sel.kind, id: sel.id }; commit(); renderDock(); mapDraw();
}
function afterGeometryChange(target) { if (target.kind === 'lot') { const b = byId(target.id); if (b && b.lotSource !== 'manual') applyLotMetrics(b); else if (b) b.updated = now(); return; } if (target.kind === 'shape') { const o = target.owner === 'road' ? roadById(target.id) : trackById(target.id); if (o) o.updated = now(); JUNCTION_CACHE.key = ''; return; } const n = ['region', 'district', 'hood'].includes(target.kind) ? nodeById(target.id) : null; if (n) { if (n.bounds !== undefined) n.bounds = bboxOfPolys(n.polygons || []); n.updated = now(); } else { const o = target.kind === 'road' ? roadById(target.id) : target.kind === 'track' ? trackById(target.id) : byId(target.id); if (o) o.updated = now(); } }
function hitTest(sx, sy) {
  const p = s2w(sx, sy); const L = UI.layers; const tol = 9 / MAPW.cam.k;
  if (L.stations) for (const s of S.stations) if (s.x != null && Math.hypot(...[w2s(s.x, s.z)[0] - sx, w2s(s.x, s.z)[1] - sy]) < 10) return { kind: 'station', id: s.id };
  if (L.buildings) { let best = null, bd = 11; for (const b of mapBuildings()) { const [x, y] = w2s(b.x, b.z); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = b; } } if (best) return { kind: 'building', id: best.id }; }
  if (L.roads && MAPW.junctions && MAPW.cam.k > 1.5) for (const j of cachedJunctions()) if (j.kind !== 'separated' && Math.hypot(w2s(j.x, j.z)[0] - sx, w2s(j.x, j.z)[1] - sy) < 7) return { kind: 'junction', id: `${j.a}|${j.b}|${Math.round(j.x)}|${Math.round(j.z)}`, j };
  if (L.transit) { let best = null, bd = tol; for (const l of visibleLines()) for (const g of [...lineTracks(l).map(trackGeomNow), ...lineRoads(l).map(roadGeomNow)].filter(g => g && g.length >= 2)) { const c = polylineClosest(p, g); if (c && c.d < bd) { bd = c.d; best = l; } } if (best) return { kind: 'line', id: best.id }; }
  if (L.roads) { let best = null, bd = tol, bq = null; for (const r of visibleRoads()) { const g = roadGeomNow(r); if (!g || g.length < 2) continue; const c = polylineClosest(p, g); if (c && c.d < Math.max(bd, (r.width || 5) / 2)) { bd = c.d; best = r; bq = c.q; } } if (best) return { kind: 'road', id: best.id, pt: bq ? roundPt(bq) : null }; }
  if (L.footprints) for (const b of mapBuildings()) if (b.footprint && pointInPoly(p, b.footprint) !== 'out') return { kind: 'building', id: b.id };
  if (L.lots) for (const b of mapBuildings()) if (lotOutline(b) && pointInPoly(p, b.lot) !== 'out') return { kind: 'building', id: b.id };
  const polyHit = (list, kind) => { let best = null, ba = Infinity; for (const n of list) for (const poly of n.polygons || []) if (poly.length >= 3 && pointInPoly(p, poly) !== 'out') { const a = polyArea(poly); if (a < ba) { ba = a; best = n; } } return best ? { kind, id: best.id } : null; };
  if (L.hoods) { const h = polyHit(visibleHoods(), 'hood'); if (h) return h; }
  if (L.districts) { const d = polyHit(visibleDistricts(), 'district'); if (d) return d; }
  if (L.regions) { const r = polyHit(S.regions, 'region'); if (r) return r; }
  return null;
}
function mapSelect(hit) {
  if (!MAPW.edit && EXPLORE.picking) { if (explorePickAt(hit)) return; }
  MAPW.sel = hit ? { kind: hit.kind, id: hit.id, j: hit.j } : null; MAPW.dock = 'inspector';
  if (MAPW.edit) renderDock(); else renderPlaceCard();
  refreshTools(); mapDraw();
}
/* locate anything on the map: select, frame, highlight */
function mapLocate(ref) {
  if (UI.nav !== 'map') { setNav('map'); }
  const run = () => {
    if (ref.kind === 'business') { const z = bizById(ref.id); const bs = bizBuildings(z || { id: null }).filter(b => b.x != null); if (!bs.length) { toast(`${z ? bizLabel(z) : 'That business'} has no located building yet`, 'warn'); openRecord('business', ref.id); return; } MAPW.sel = { kind: 'business', id: z.id }; mapFlyTo(bboxOf(bs.map(b => [b.x, b.z]))); MAPW.highlight = { ids: new Set(bs.map(b => b.id)), until: Date.now() + 2500 }; if (MAPW.edit) { MAPW.sel = { kind: 'building', id: bs[0].id }; renderDock(); } else renderPlaceCard(); mapDraw(); return; }
    MAPW.sel = { kind: ref.kind, id: ref.id }; const ext = selExtent(MAPW.sel);
    if (ext) mapFlyTo(ext); else toast(`${ref.kind === 'building' ? byId(ref.id)?.reg || 'That record' : 'That record'} has no coordinates yet`, 'warn');
    if (['region', 'district', 'hood'].includes(ref.kind) && !ext) { const node = nodeById(ref.id); const bs = ref.kind === 'hood' ? S.buildings.filter(b => b.neighborhoodId === ref.id && b.x != null) : scopeBuildings({ kind: ref.kind, id: ref.id }).filter(b => b.x != null); const bx = bboxOf(bs.map(b => [b.x, b.z])); if (bx) mapFit(bx); if (node) toast(`${node.name}: border not drawn yet — switch to Border mode to draw it`, ''); }
    MAPW.highlight = { ids: new Set([ref.id]), until: Date.now() + 2500 }; MAPW.dock = 'inspector'; if (MAPW.edit) renderDock(); else renderPlaceCard(); refreshTools(); mapDraw();
    const tick = () => { if (MAPW.highlight && Date.now() < MAPW.highlight.until && UI.nav === 'map') { mapDraw(); requestAnimationFrame(tick); } else { MAPW.highlight = null; mapDraw(); } }; if (motionOn()) requestAnimationFrame(tick);
  };
  if (MAPW.mounted) run(); else setTimeout(run, 30);
}
/* coordinate search: "120, -40" · "x 120 z -40" */
function parseCoords(q) { const m = /^\s*(?:x\s*)?(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(?:z\s*)?(-?\d+(?:\.\d+)?)\s*$/i.exec(q); return m ? [+m[1], +m[2]] : null; }
function wireMapSearch() {
  const input = $('#map-q'), pal = $('#map-palette'); if (!input) return; let items = [], active = 0;
  const show = () => { const q = input.value; const xy = parseCoords(q); if (xy) { pal.hidden = false; items = [{ kind: 'coords', xy, title: `Go to X ${xy[0]} · Z ${xy[1]}`, sub: placeSuggest(xy[0], xy[1]).districts.map(x => x.d.name).join(', ') || 'outside every drawn border', meta: '', color: 'var(--amber)' }]; active = 0; pal.innerHTML = `<div class="pg">Coordinates</div><div class="pi act" data-pi="0" style="--c:var(--amber)">${icon('pin')}<span class="t"><b>${esc(items[0].title)}</b><small>${esc(items[0].sub)}</small></span><span class="m"></span></div>`; return; } if (!q.trim()) { pal.hidden = true; items = []; return; } const groups = searchAll(q, { limit: 5 }); items = flatItems(groups); active = 0; pal.hidden = false; pal.innerHTML = paletteHTML(groups, 0, q); };
  const pick = i => { const it = items[i]; if (!it) return; pal.hidden = true; input.value = ''; if (it.kind === 'coords') { MAPW.marker = { x: it.xy[0], z: it.xy[1], until: Date.now() + 6000 }; MAPW.cam.x = it.xy[0]; MAPW.cam.z = it.xy[1]; if (MAPW.cam.k < 1) MAPW.cam.k = 2; mapDraw(); setTimeout(mapDraw, 6100); return; } openSearchHit(it, { map: true }); };
  input.addEventListener('input', debounce(show, 90));
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; $$('#map-palette .pi').forEach(p => p.classList.toggle('act', +p.dataset.pi === active)); } else if (e.key === 'Enter') { e.preventDefault(); if (!items.length) show(); pick(active); } else if (e.key === 'Escape') { pal.hidden = true; input.blur(); e.stopPropagation(); } });
  pal.addEventListener('mousedown', e => { const p = e.target.closest('.pi'); if (p) { e.preventDefault(); pick(+p.dataset.pi); } });
  input.addEventListener('blur', () => setTimeout(() => { pal.hidden = true; }, 150));
}

/* ---- what is drawn: scope-aware lists ---- */
const mapBuildings = () => { const sc = UI.scope; const all = sc.kind === 'all' ? S.buildings : scopeBuildings(sc); return all.filter(b => b.x != null && b.z != null && (isActive(b) || UI.layers.historical)); };
const visibleDistricts = () => { const sc = UI.scope; if (sc.kind === 'all') return S.districts; if (sc.kind === 'region') { const ids = descendantDistrictIds(sc.id); return S.districts.filter(d => ids.has(d.id)); } const d = sc.kind === 'district' ? districtById(sc.id) : districtById(hoodById(sc.id)?.districtId); return d ? S.districts.filter(x => (x.parentId || null) === (d.parentId || null)) : S.districts; };
const visibleHoods = () => { const ids = new Set(visibleDistricts().map(d => d.id)); return S.neighborhoods.filter(h => ids.has(h.districtId)); };
const visibleRoads = () => S.roads;
const visibleLines = () => S.lines;
let JUNCTION_CACHE = { key: '', list: [] };
function cachedJunctions() { const key = S.roads.map(r => r.id + ':' + r.updated + ':' + r.geometry.length).join('|'); if (JUNCTION_CACHE.key !== key) JUNCTION_CACHE = { key, list: roadJunctions() }; return JUNCTION_CACHE.list; }

/* ---- the scene renderer (shared with the history viewer) ---- */
const ERA_COLORS = ['#6F8494', '#8E71D6', '#C35C9B', '#4087DE', '#2E9E52', '#C9690C', '#009CB7'];
function statusColor(id) { return { 'for-sale': '#39D98A', 'for-lease': '#39D98A', sold: '#7FB2FF', leased: '#7FB2FF', construction: '#FFD166', planned: '#9AA7B2', landmark: '#E7C36A', demolished: '#FF7A59', 'vacant-lot': '#6F8494', closed: '#8899AA', standing: '#009CB7' }[id] || '#009CB7'; }
function dotColor(b) {
  if (UI.mapColor === 'status') return b.landmark && b.physical === 'standing' ? statusColor('landmark') : b.market && b.physical === 'standing' ? statusColor(b.market) : statusColor(b.physical || 'standing');
  if (UI.mapColor === 'family') { const f = classFamily(b.bldgClass); return f ? PALETTE.marks[FAMILY_SLOT[f]] : PALETTE.neutral; }
  if (UI.mapColor === 'era') { const y = num(b.yearBuilt); const i = ERAS.findIndex(e => y >= e.from && y < e.to); return i === -1 ? (y >= ERAS[ERAS.length - 1].to ? ERA_COLORS[ERAS.length - 1] : PALETTE.neutral) : ERA_COLORS[i]; }
  if (UI.mapColor === 'service') { const s = buildingService(b); return serviceColor(s ? s.score : null); }
  return distMark(districtById(b.districtId));
}
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
/* a ghost lingers for GHOST_HALF_YEARS after the demolition and fades out over that time; the "all ghosts" variant keeps it faintly */
const GHOST_HALF_YEARS = 2;
function ghostAlpha(ageHalfYears, all = false) { if (ageHalfYears < 0) return 0; if (all) return ageHalfYears <= GHOST_HALF_YEARS ? 1 : 0.55; return clamp(1 - ageHalfYears / GHOST_HALF_YEARS, 0, 1); }
function drawScene(R) {
  const { ctx, W, H, cam } = R; const k = cam.k; const P = projFor(cam, W, H); const L = R.layers; const hy = R.hy; const sel = R.sel, hov = R.hover;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#05090D'; ctx.fillRect(0, 0, W, H);
  if (L.basemap !== false && typeof drawBasemap === 'function') drawBasemap(ctx, P, W, H, R);
  const labels = []; const placed = []; const pushLabel = (x, y, text, font, color, prio, pad = 3, align = '') => labels.push({ x, y, text, font, color, prio, pad, align });
  // grid
  if (L.grid) {
    const step = GRID_STEPS.find(s => s * k >= 56) || 10000; const [x0, z0] = P.w(0, 0), [x1, z1] = P.w(W, H);
    ctx.lineWidth = 1; ctx.font = '10px JetBrains Mono, ui-monospace, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = P.s(x, 0); ctx.strokeStyle = x === 0 ? 'rgba(79,227,255,.35)' : 'rgba(79,227,255,.07)'; ctx.beginPath(); ctx.moveTo(Math.round(sx) + .5, 0); ctx.lineTo(Math.round(sx) + .5, H); ctx.stroke(); ctx.fillStyle = 'rgba(147,169,184,.55)'; ctx.fillText(String(x), sx + 3, 2); }
    for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) { const [, sy] = P.s(0, z); ctx.strokeStyle = z === 0 ? 'rgba(79,227,255,.35)' : 'rgba(79,227,255,.07)'; ctx.beginPath(); ctx.moveTo(0, Math.round(sy) + .5); ctx.lineTo(W, Math.round(sy) + .5); ctx.stroke(); ctx.fillStyle = 'rgba(147,169,184,.55)'; ctx.fillText(String(z), 3, sy + 2); }
  }
  const onScreen = (pts) => { const b = bboxOf(pts); if (!b) return false; const [ax, ay] = P.s(b.x1, b.z1), [bx, by] = P.s(b.x2, b.z2); return !(bx < -40 || ax > W + 40 || by < -40 || ay > H + 40); };
  const tracePoly = pts => { ctx.beginPath(); pts.forEach((pt, i) => { const [x, y] = P.s(pt[0], pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  const tracePath = pts => { ctx.beginPath(); pts.forEach((pt, i) => { const [x, y] = P.s(pt[0], pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  const isSel = (kind, id) => sel && sel.kind === kind && sel.id === id, isHov = (kind, id) => hov && hov.kind === kind && hov.id === id;
  const regionVisibleAt = r => hy == null || r.effectiveYear == null || hyIndex(num(r.effectiveYear), r.effectiveHalf) <= hy;
  // polygons: regions › districts › hoods
  const drawNode = (n, kind, color, mark, fillA, dashed, prio, font) => {
    for (const poly of n.polygons || []) {
      if (poly.length < 3 || !onScreen(poly)) continue;
      const s = isSel(kind, n.id), h = isHov(kind, n.id), hl = R.highlight?.ids?.has(n.id);
      tracePoly(poly); ctx.fillStyle = hexA(mark, s || h ? fillA * 2.2 : fillA); ctx.fill();
      ctx.setLineDash(dashed ? [6, 4] : []); ctx.lineWidth = s || hl ? 2.5 : 1.25; ctx.strokeStyle = s || hl ? '#FFFFFF' : h ? color : hexA(color, .9); ctx.stroke(); ctx.setLineDash([]);
      if (L.labels) { const bb = bboxOf(poly); const [ax] = P.s(bb.x1, 0), [bx] = P.s(bb.x2, 0); const w = bx - ax; const text = n.name.toUpperCase(); if (w > text.length * 6.5 + 10 || s) { const c = centroidOf(poly); const [cx, cy] = P.s(c[0], c[1]); pushLabel(cx, cy, text, font, s ? '#fff' : color, prio); } }
    }
  };
  if (L.regions) for (const r of S.regions) if (regionVisibleAt(r)) drawNode(r, 'region', regionColor(r), regionMark(r), 0.035, r.placement !== 'verified', 1, '600 12px Chakra Petch, sans-serif');
  if (L.districts) for (const d of (R.districts || S.districts)) drawNode(d, 'district', distColor(d), distMark(d), 0.06, d.placement === 'conflict' || d.placement === 'unverified', 2, '600 11px Chakra Petch, sans-serif');
  if (L.hoods) for (const h of (R.hoods || S.neighborhoods)) { const d = districtById(h.districtId); drawNode(h, 'hood', hexA(distColor(d), .85), distMark(d), 0.09, false, 3, '600 10px Chakra Petch, sans-serif'); }
  // footprints (drawn outlines) and, at street zoom, lot-sized blocks for buildings that only have frontage × depth
  if (L.footprints && k > 0.8) for (const b of (R.buildings || mapBuildings())) { if (!b.footprint || !onScreen(b.footprint)) continue; if (hy != null && stateAtHY(b, hy, { projection: R.projection }) !== 'standing') continue; tracePoly(b.footprint); ctx.fillStyle = hexA(dotColor(b), .22); ctx.fill(); ctx.strokeStyle = hexA(dotColor(b), .8); ctx.lineWidth = 1; ctx.stroke(); }
  if (L.lots && k > 0.6) for (const b of (R.buildings || mapBuildings())) { const ls = lotShape(b); if (!ls || (!ls.drawn && (b.footprint || k <= 1.6))) continue; if (!onScreen(ls.poly)) continue; if (hy != null && stateAtHY(b, hy, { projection: R.projection }) !== 'standing') continue; const col = isHist(b) ? '#FF7A59' : dotColor(b); const s = isSel('building', b.id); tracePoly(ls.poly); ctx.fillStyle = hexA(col, ls.drawn ? .16 : .14); ctx.fill(); ctx.strokeStyle = hexA(s ? '#FFFFFF' : col, s ? .9 : .5); ctx.lineWidth = s ? 1.6 : 1; ctx.setLineDash(ls.drawn ? [4, 3] : []); ctx.stroke(); ctx.setLineDash([]);
    if (s && ls.drawn && k > 1) { const m = lotMetrics(b); if (m?.mainRoad) { const n = ls.poly.length; for (let i = 0; i < n; i++) { const a = ls.poly[i], c = ls.poly[(i + 1) % n]; const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; const q = polylineClosest(mid, m.mainRoad.geometry); if (q && q.d <= (num(m.mainRoad.width) || 5) / 2 + LOT_FRONT_TOL) { ctx.beginPath(); ctx.moveTo(...P.s(...a)); ctx.lineTo(...P.s(...c)); ctx.strokeStyle = '#FFB454'; ctx.lineWidth = 3; ctx.stroke(); } } } } }
  // roads — in playback the dated shape in force, extensions growing in; removed roads fade as remnants
  const pos = R.pos ?? null, fx = R.fx && R.fx.t < 1 ? R.fx : null; const inFx = i => fx && i != null && i > fx.from && i <= fx.to;
  if (L.roads) {
    const roads = R.roads || visibleRoads();
    for (const r of roads) {
      let geom = r.geometry, width = r.width, alpha = 1, dashed = false, ghost = null;
      if (hy != null) {
        const A = fx ? animatedGeometry(r, hy, fx) : { ...geometryAt(r, hy), alpha: 1 };
        if (A.state === 'open' || A.state === 'leaving') { geom = A.geometry; width = A.width ?? r.width; alpha = A.alpha ?? 1; ghost = A.ghost || null; if (A.state === 'leaving') dashed = true; }
        else if (A.state === 'undated') { if (!R.refOverlay) continue; alpha = .35; dashed = true; }
        else if (A.state === 'closed' || A.state === 'gap') { const rem = shapeRemnant(r, hy, pos, L); if (!rem) continue; geom = rem.geometry; alpha = rem.alpha; dashed = true; }
        else continue;
      }
      if (!geom || geom.length < 2 || !onScreen(geom)) continue;
      const s = isSel('road', r.id), h = isHov('road', r.id), hl = R.highlight?.ids?.has(r.id);
      const wpx = Math.max(1.5, (num(width) || 5) * k); const col = ROAD_COLORS[r.type] || ROAD_COLORS.other; const g = r.grade || 'surface';
      ctx.lineJoin = 'round'; ctx.lineCap = g === 'bridge' || g === 'elevated' ? 'butt' : 'round';
      if (ghost && ghost.alpha > 0.02) { tracePath(ghost.geometry); ctx.lineWidth = wpx; ctx.strokeStyle = hexA(col, .5 * ghost.alpha); ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); }
      if (g === 'bridge' || g === 'elevated') { tracePath(geom); ctx.lineWidth = wpx + 4; ctx.strokeStyle = hexA('#E0C63A', .55 * alpha); ctx.setLineDash([]); ctx.stroke(); }
      tracePath(geom); ctx.lineWidth = s || hl ? wpx + 3 : wpx; ctx.strokeStyle = s || hl ? '#FFFFFF' : hexA(h ? '#DCE9F0' : col, alpha); ctx.setLineDash(g === 'tunnel' ? [8, 6] : dashed ? [6, 6] : []); ctx.stroke(); ctx.setLineDash([]);
      if (s || hl) { tracePath(geom); ctx.lineWidth = Math.max(1, wpx - 1); ctx.strokeStyle = hexA(col, alpha); ctx.stroke(); }
      if (L.labels && (k > 1.1 || s) && r.name && alpha > .5) { const need = r.name.length * 6.6 + 10; let since = 1e9; for (let i = 1; i < geom.length; i++) { const a = P.s(...geom[i - 1]), b = P.s(...geom[i]); const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < need && !s) { since += l; continue; } const reps = Math.max(1, Math.floor(l / 420)); for (let j = 0; j < reps; j++) { const t = (j + 0.5) / reps; if (since < 260 && j === 0 && !s) { since += l; continue; } labels.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, text: r.name, font: `${s ? '600' : '500'} ${k > 2.5 ? 11 : 10.5}px Bricolage Grotesque, JetBrains Mono, sans-serif`, color: s ? '#fff' : hexA('#D7E3EC', alpha * .92), prio: 5, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), pad: 3 }); since = 0; } since += l; } }
    }
    if (R.showJunctions && k > 1.5 && hy == null) for (const j of cachedJunctions()) { const [x, y] = P.s(j.x, j.z); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; if (j.kind === 'separated') { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(224,198,58,.8)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); } else { ctx.beginPath(); ctx.arc(x, y, j.kind === 'junction' ? 3.2 : 2.6, 0, Math.PI * 2); ctx.fillStyle = sel?.kind === 'junction' && sel.j && Math.round(sel.j.x) === Math.round(j.x) && Math.round(sel.j.z) === Math.round(j.z) ? '#FFFFFF' : 'rgba(220,233,240,.85)'; ctx.fill(); } }
  }
  // transit — cased lines (dark casing, colour core), shared track offset side by side; status styles; then stations
  if (L.transit) {
    const lines = R.lines || visibleLines(); const perTrack = new Map();
    for (const l of lines) for (const t of lineTracks(l)) (perTrack.get(t.id) || perTrack.set(t.id, []).get(t.id)).push(l.id);
    const drawn = [];
    for (const l of lines) {
      let alpha = 1, dashed = false, dotted = false; const ls = hy != null ? lineStateAt(l, hy) : (l.status || 'open'); const oi = hyOf(l.yearOpened, l.halfOpened);
      if (hy != null) { if (ls === 'future') continue; if (ls === 'undated') { if (!R.refOverlay) continue; alpha = .35; dashed = true; } if (ls === 'construction') dashed = true; if (ls === 'closed') { const ci = hyOf(l.yearClosed, l.halfClosed); const g = L.historical ? ghostAlpha((pos ?? hy) - (ci ?? hy), !!L.ghostsAll) * .45 : 0; if (g <= 0.02) continue; alpha = g; dashed = true; } }
      else { if (l.status === 'construction') dashed = true; else if (l.status === 'planned') dotted = true; else if (l.status === 'closed') { alpha = .35; dashed = true; } }
      const s = isSel('line', l.id), h = isHov('line', l.id), hl = R.highlight?.ids?.has(l.id); const wpx = lineWidthPx(l, k);
      const geoms = [];
      for (const t of lineTracks(l)) {
        let pts = t.geometry, a = 1, gh = null;
        if (hy != null) { const A = fx ? animatedGeometry(t, hy, fx) : { ...geometryAt(t, hy), alpha: 1 };
          if (A.state === 'open' || A.state === 'leaving') { pts = A.geometry; a = A.alpha ?? 1; gh = A.ghost || null; }
          else if (A.state === 'undated') { pts = t.geometry; if (ls === 'open' && inFx(oi)) pts = clipPath(pts, easeOut(fx.t)); }
          else if (ls === 'closed') pts = (shapeRemnant(t, hy, pos, { historical: true, ghostsAll: true }) || {}).geometry || t.geometry;
          else continue; }
        else if (mapWhen() != null) pts = trackGeomNow(t);
        const ids = perTrack.get(t.id) || []; const i = ids.indexOf(l.id); geoms.push({ pts, a, gh, offset: (i - (ids.length - 1) / 2) * (wpx + 2.5) });
      }
      for (const r of lineRoads(l)) geoms.push({ pts: hy != null ? geometryAt(r, hy).geometry : roadGeomNow(r), a: 1, offset: 0 });
      const strokeOff = (pts, offset) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { let [x, y] = P.s(...pts[i]); if (offset) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const [ax, ay] = P.s(...a), [bx, by] = P.s(...b); const len = Math.hypot(bx - ax, by - ay) || 1; x += -(by - ay) / len * offset; y += (bx - ax) / len * offset; } i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const g of geoms) {
        if (!g.pts || g.pts.length < 2 || !onScreen(g.pts)) continue; const A = alpha * g.a;
        if (g.gh && g.gh.alpha > .02) { strokeOff(g.gh.geometry, g.offset); ctx.lineWidth = wpx; ctx.strokeStyle = hexA(l.color || '#B99CFF', .35 * g.gh.alpha); ctx.setLineDash([wpx * 1.5, wpx]); ctx.stroke(); ctx.setLineDash([]); }
        strokeOff(g.pts, g.offset);
        if (s || hl) { ctx.lineWidth = wpx + 7; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.setLineDash([]); ctx.stroke(); }
        ctx.lineWidth = wpx + 3; ctx.strokeStyle = hexA('#05090D', .85 * A); ctx.setLineDash(dotted ? [1, wpx * 1.4] : []); ctx.stroke();
        ctx.lineWidth = dotted ? wpx * .55 : wpx; ctx.strokeStyle = hexA(l.color || '#B99CFF', (h ? 1 : .95) * A);
        ctx.setLineDash(l.style === 'dashed' || dashed ? [wpx * 2.2, wpx * 1.4] : l.style === 'dotted' || dotted ? [1, wpx * 1.4] : []); ctx.stroke(); ctx.setLineDash([]);
        if (dashed && !dotted && (ls === 'construction' || l.status === 'construction')) { ctx.lineWidth = Math.max(1, wpx * .3); ctx.strokeStyle = hexA('#FFD166', .8 * A); ctx.setLineDash([2, wpx * 3]); ctx.stroke(); ctx.setLineDash([]); }
        drawn.push({ l, g, wpx });
      }
      if (L.labels && (k > 0.9 || s) && alpha > .5) { const g = geoms.find(x => x.pts?.length >= 2); if (g) { const mid = g.pts[Math.floor(g.pts.length / 2)]; const [x, y] = P.s(...mid); labels.push({ x, y: y - wpx - 8, text: l.shortName || l.name || l.reg, font: '700 10px JetBrains Mono, monospace', color: '#05090D', bg: l.color, prio: 4, pad: 3 }); } }
    }
    if (L.stations) {
      const sts = R.stations || S.stations;
      if (k > 0.9) for (const st of sts) for (const oid of st.transferIds || []) { if (oid < st.id) continue; const o = stationById(oid); if (!o || o.x == null || st.x == null) continue; const [ax, ay] = P.s(st.x, st.z), [bx, by] = P.s(o.x, o.z); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = 'rgba(246,246,246,.7)'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
      for (const st of sts) {
        if (st.x == null) continue; const [x, y] = P.s(st.x, st.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        const status = hy != null ? stationStateAt(st, hy) : stationStatusNow(st); let alpha = 1;
        if (hy != null) { if (status === 'future') continue; if (status === 'undated') { if (!R.refOverlay) continue; alpha = .35; } if (status === 'closed') { const ci = hyOf(st.yearClosed, st.halfClosed); const g = L.historical ? ghostAlpha((pos ?? hy) - (ci ?? hy), !!L.ghostsAll) : 0; if (g <= .02) continue; alpha = g * .6; } }
        const s = isSel('station', st.id), h = isHov('station', st.id), hl = R.highlight?.ids?.has(st.id); const lines = linesAtStation(st); const xfer = lines.length > 1 || (st.transferIds || []).length > 0;
        const lw = lines.length ? Math.max(...lines.map(l => lineWidthPx(l, k))) : lineWidthPx({ width: 4 }, k);
        const r = st.kind === 'entrance' ? 3 : (st.kind === 'complex' || xfer ? lw * .62 + 3.5 : lw * .5 + 2.5);
        let enterA = 1; const oi = hyOf(st.yearOpened, st.halfOpened); if (inFx(oi)) enterA = easeOut(fx.t);
        const R0 = r * (0.4 + 0.6 * enterA);
        ctx.beginPath(); ctx.arc(x, y, R0 + 1.5, 0, Math.PI * 2); ctx.fillStyle = hexA('#05090D', .9 * alpha); ctx.fill();
        if (status === 'construction' || status === 'planned') {
          ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2); ctx.fillStyle = hexA(status === 'construction' ? '#FFD166' : '#9AA7B2', .22 * alpha); ctx.fill(); ctx.setLineDash([3, 2]); ctx.lineWidth = 2; ctx.strokeStyle = hexA(status === 'construction' ? '#FFD166' : '#9AA7B2', alpha); ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2); ctx.fillStyle = hexA(status === 'closed' ? '#8899AA' : st.kind === 'entrance' ? '#B99CFF' : '#F6F6F6', alpha); ctx.fill();
          if (status === 'partial') { ctx.beginPath(); ctx.arc(x, y, R0, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fillStyle = hexA(lines[0]?.color || '#B99CFF', alpha); ctx.fill(); }
          ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2); ctx.lineWidth = xfer ? 2.6 : 2.2; ctx.strokeStyle = s || hl ? '#4FE3FF' : hexA(xfer ? '#05090D' : (lines[0]?.color || '#B99CFF'), alpha); ctx.stroke();
          if (xfer && !(s || hl) && k > 0.7) { lines.slice(0, 4).forEach((l, i, a) => { ctx.beginPath(); ctx.arc(x, y, R0 + 2.2, -Math.PI / 2 + i * 2 * Math.PI / a.length, -Math.PI / 2 + (i + 1) * 2 * Math.PI / a.length); ctx.strokeStyle = hexA(l.color || '#B99CFF', alpha); ctx.lineWidth = 2; ctx.stroke(); }); }
          if (stationHours(st) === '24/7' && k > 1.6 && status !== 'closed') { ctx.beginPath(); ctx.arc(x + R0 * .75, y - R0 * .75, 2.4, 0, Math.PI * 2); ctx.fillStyle = hexA('#5FE38E', alpha); ctx.fill(); }
        }
        if (s || hl) { ctx.beginPath(); ctx.arc(x, y, R0 + 5, 0, Math.PI * 2); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke(); }
        else if (h) { ctx.beginPath(); ctx.arc(x, y, R0 + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(185,156,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (enterA < 1) { ctx.beginPath(); ctx.arc(x, y, r + (1 - enterA) * 14, 0, Math.PI * 2); ctx.strokeStyle = hexA('#4FE3FF', .8 * (1 - enterA)); ctx.lineWidth = 1.5; ctx.stroke(); }
        if (L.labels && (k > 1.4 || s || h) && st.name && st.kind !== 'entrance') pushLabel(x + R0 + 6, y, st.name + (status === 'construction' ? ' · u/c' : status === 'planned' ? ' · planned' : ''), '500 10.5px Chakra Petch, sans-serif', hexA('#E6DDFF', alpha), 4, 2, 'left');
      }
    }
  }
  // buildings
  if (L.sandbox !== false && hy == null && (S.sandbox?.stations || []).length) drawSandbox(ctx, P, k);
  if (L.buildings) {
    const list = R.buildings || mapBuildings();
    for (const b of list) {
      const [x, y] = P.s(b.x, b.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const r0 = clamp(3 + (num(b.floors) || 0) / 12, 3, 9) * Math.min(1.3, Math.max(.75, k * .4 + .6)); let r = r0; const s = isSel('building', b.id), h = isHov('building', b.id), hl = R.highlight?.ids?.has(b.id);
      let state = hy == null ? (isHist(b) ? 'gone' : isUnderWay(b) ? 'construction' : 'standing') : stateAtHY(b, hy, { projection: R.projection });
      let alpha = 1, ring = 0, collapse = 0;
      if (hy != null && fx) {
        // effects start the moment the playhead crosses the date: a building rises when built, falls when demolished
        if (state === 'standing' || state === 'construction') { const at = state === 'standing' ? builtIndex(b) : (startedIndex(b) ?? builtIndex(b)); if (inFx(at)) { const t = easeOut(fx.t); const fromBuild = state === 'standing' && startedIndex(b) != null && startedIndex(b) < at && !inFx(startedIndex(b)); if (fromBuild) ring = (1 - t) * 10; else { r = r0 * t; ring = (1 - t) * 14; } } }
        else if (state === 'gone' && inFx(demolishedIndex(b))) collapse = Math.max(0.001, easeOut(fx.t));
      }
      if (hy != null && (state === 'future' || state === 'undated')) continue;
      if (collapse) { const t = collapse; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r0 * (1 - t)), 0, Math.PI * 2); ctx.fillStyle = hexA('#FF7A59', 1 - t * .6); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, r0 + t * 14, 0, Math.PI * 2); ctx.strokeStyle = hexA('#FF7A59', (1 - t) * .9); ctx.lineWidth = 2; ctx.stroke(); }
      if (state === 'gone') {
        if (!L.historical) continue;
        if (hy != null) { const di = demolishedIndex(b); const cur = pos ?? hy; const g = ghostAlpha(di == null ? 0 : Math.max(0, cur - di), !!L.ghostsAll) * (collapse ? collapse : 1); if (g <= 0.02) continue; alpha *= g; }
        ctx.beginPath(); ctx.arc(x, y, r0 + 1, 0, Math.PI * 2); ctx.setLineDash([2, 2]); ctx.strokeStyle = hexA('#FF7A59', .85 * alpha); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.strokeStyle = hexA('#FF7A59', .8 * alpha); ctx.lineWidth = 1; ctx.stroke(); if (ring) { ctx.beginPath(); ctx.arc(x, y, r0 + ring, 0, Math.PI * 2); ctx.strokeStyle = hexA('#FF7A59', (1 - ring / 12) * .8); ctx.lineWidth = 1.5; ctx.stroke(); } }
      else if (state === 'construction') { ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.fillStyle = hexA('#FFD166', .25 * alpha); ctx.fill(); ctx.setLineDash([3, 2]); ctx.strokeStyle = hexA('#FFD166', .95 * alpha); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fillStyle = hexA(hy != null && b.physical === 'vacant-lot' ? '#6F8494' : dotColor(b), alpha); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#05090D'; ctx.stroke(); if (L.civic !== false && k > 1.2) drawCivicGlyph(ctx, x, y, r0, b, alpha); if (b.landmark && k > 1.2) { ctx.fillStyle = hexA('#E7C36A', alpha); ctx.font = `${Math.max(8, r * 1.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', x, y + 0.5); } }
      if (ring && state !== 'gone') { ctx.beginPath(); ctx.arc(x, y, r0 + ring, 0, Math.PI * 2); ctx.strokeStyle = hexA('#4FE3FF', .9 * (1 - ring / 14)); ctx.lineWidth = 1.5; ctx.stroke(); }
      if (hy != null && R.evidence && (state === 'standing' || state === 'construction') && inferredAt(b, hy, state)) { ctx.beginPath(); ctx.arc(x, y, r0 + 3.5, 0, Math.PI * 2); ctx.setLineDash([2, 3]); ctx.strokeStyle = hexA('#FFD166', .5 * alpha); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
      if (s || hl) { ctx.beginPath(); ctx.arc(x, y, r0 + 7, 0, Math.PI * 2); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke(); if (s && R.halo) { const ph = (Date.now() % 1600) / 1600; ctx.beginPath(); ctx.arc(x, y, r0 + 9 + ph * 16, 0, Math.PI * 2); ctx.strokeStyle = hexA('#4FE3FF', (1 - ph) * .7); ctx.lineWidth = 1.5; ctx.stroke(); } }
      else if (h) { ctx.beginPath(); ctx.arc(x, y, r0 + 6, 0, Math.PI * 2); ctx.strokeStyle = isHist(b) ? '#FF7A59' : '#4FE3FF'; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (L.businesses && currentTenanciesAt(b).length && state === 'standing') { ctx.beginPath(); ctx.moveTo(x + r0 + 2, y - r0 - 2); ctx.lineTo(x + r0 + 6, y - r0 - 6); ctx.lineTo(x + r0 + 2, y - r0 - 10); ctx.lineTo(x + r0 - 2, y - r0 - 6); ctx.closePath(); ctx.fillStyle = '#5FE38E'; ctx.fill(); }
      if (L.labels && (k > 2.5 || s || h || hl) && state !== 'gone') pushLabel(x + r0 + 6, y, b.name || addressOf(b) || b.reg, s || h ? '600 12px Chakra Petch, sans-serif' : '11px JetBrains Mono, monospace', s || h ? '#FFFFFF' : 'rgba(220,233,240,.85)', s || h ? 0 : 6, 2, 'left');
      if (b.entrance?.x != null && (s || k > 3) && state === 'standing') { const [ex, ey] = P.s(b.entrance.x, b.entrance.z); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.strokeStyle = 'rgba(255,180,84,.7)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fillStyle = '#FFB454'; ctx.fill(); }
    }
    if (R.connector) { const c = R.connector; const [ax, ay] = P.s(...c.from), [bx, by] = P.s(...c.to); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = 'rgba(255,180,84,.9)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fillStyle = '#FFB454'; ctx.fill(); }
  }
  // route (explore mode directions)
  if (R.route && typeof drawRoute === 'function') drawRoute(ctx, P, R.route, k);
  // selected geometry handles
  if (R.handles && sel) { const geoms = selGeometries(sel) || []; for (const g of geoms) g.pts.forEach((pt, i) => { const [x, y] = P.s(...pt); const act = sel.vertex === i && (sel.part || 0) === g.part; ctx.beginPath(); ctx.rect(x - (act ? 5 : 4), y - (act ? 5 : 4), act ? 10 : 8, act ? 10 : 8); ctx.fillStyle = act ? '#4FE3FF' : '#05090D'; ctx.fill(); ctx.strokeStyle = act ? '#FFFFFF' : '#4FE3FF'; ctx.lineWidth = 1.5; ctx.stroke(); }); }
  // draft
  if (R.draft) {
    const d = R.draft; const col = d.forKind === 'border' ? '#7FB2FF' : d.forKind === 'road' ? '#8AA4B8' : d.forKind === 'footprint' ? '#4FE3FF' : '#B99CFF';
    const pts = d.cursor && !d.free ? [...d.pts, d.cursor] : d.pts;
    if (pts.length) { ctx.beginPath(); pts.forEach((pt, i) => { const [x, y] = P.s(...pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (d.kind === 'polygon' && pts.length > 2) { ctx.closePath(); ctx.fillStyle = hexA(col, .12); ctx.fill(); } ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
    for (const [i, pt] of d.pts.entries()) { const [x, y] = P.s(...pt); ctx.beginPath(); ctx.arc(x, y, i === 0 && d.kind === 'polygon' && d.pts.length >= 3 ? 7 : 4, 0, Math.PI * 2); ctx.fillStyle = '#05090D'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
    for (const [n, st] of (d.stops || []).slice().sort((a, b) => a.i - b.i).entries()) { const pt = d.pts[st.i]; if (!pt) continue; const [x, y] = P.s(...pt); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = '#F6F6F6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = st.sid ? '#05090D' : col; ctx.stroke(); ctx.fillStyle = '#05090D'; ctx.font = '700 9px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n + 1), x, y + .5); if (st.sid) pushLabel(x + 12, y, stationById(st.sid)?.name || 'existing station', '500 10.5px Chakra Petch, sans-serif', '#E6DDFF', 1, 2, 'left'); }
    if (d.cursor && d.pts.length) { const a = d.pts[d.pts.length - 1], b = d.cursor; const [mx, my] = P.s((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); const L2 = dist2(a, b); pushLabel(mx, my - 12, `${fmtInt(L2)} blk · Δx ${Math.round(b[0] - a[0])} Δz ${Math.round(b[1] - a[1])}${d.snapped ? ' · snap' : ''}`, '10.5px JetBrains Mono, monospace', '#FFB454', 0); }
    if (d.kind === 'polygon' && pts.length >= 3) { const c = centroidOf(pts); const [cx, cy] = P.s(...c); pushLabel(cx, cy, `${fmtCompact(polyArea(pts))} blk²`, '600 11px JetBrains Mono, monospace', col, 0); }
  }
  // assistant preview (amber dashed) and coordinate marker
  if (R.preview) { for (const g of R.preview.geoms || []) { ctx.beginPath(); g.pts.forEach((pt, i) => { const [x, y] = P.s(...pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (g.closed) ctx.closePath(); ctx.strokeStyle = '#FFB454'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); } for (const p of R.preview.points || []) { const [x, y] = P.s(p[0], p[1]); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.strokeStyle = '#FFB454'; ctx.lineWidth = 2; ctx.stroke(); } }
  if (R.marker && Date.now() < R.marker.until) { const [x, y] = P.s(R.marker.x, R.marker.z); ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.strokeStyle = '#FFB454'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.stroke(); pushLabel(x + 14, y - 14, `X ${R.marker.x} · Z ${R.marker.z}`, '10.5px JetBrains Mono, monospace', '#FFB454', 0, 2, 'left'); }
  // station / place cursor
  if (R.cursorMark) { const [x, y] = P.s(...R.cursorMark); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.strokeStyle = MODE_COLOR[MAPW.mode] === 'var(--amber)' ? '#FFB454' : '#B99CFF'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
  // labels: greedy, highest priority first, no overlaps
  labels.sort((a, b) => a.prio - b.prio);
  for (const lb of labels) {
    ctx.font = lb.font; const w = ctx.measureText(lb.text).width + lb.pad * 2, h = parseInt(lb.font.match(/(\d+(\.\d+)?)px/)?.[1] || 11) + lb.pad * 2;
    const x0 = lb.align === 'left' ? lb.x : lb.x - w / 2, y0 = lb.y - h / 2;
    if (placed.some(p => !(x0 + w < p.x || p.x + p.w < x0 || y0 + h < p.y || p.y + p.h < y0))) continue;
    placed.push({ x: x0, y: y0, w, h });
    ctx.save(); if (lb.angle) { ctx.translate(lb.x, lb.y); let a = lb.angle; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; ctx.rotate(a); ctx.translate(-lb.x, -lb.y); }
    if (lb.bg) { ctx.fillStyle = lb.bg; const rr = 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, h, rr) : ctx.rect(x0, y0, w, h); ctx.fill(); } else { ctx.fillStyle = 'rgba(5,9,13,.6)'; ctx.fillRect(x0, y0, w, h); }
    ctx.fillStyle = lb.color; ctx.textBaseline = 'middle'; ctx.textAlign = lb.align === 'left' ? 'left' : 'center'; ctx.fillText(lb.text, lb.align === 'left' ? lb.x + lb.pad : lb.x, lb.y + 0.5); ctx.restore();
  }
}
function mapDraw() {
  if (!MAPW.ctx || UI.nav !== 'map') return;
  drawScene({ ctx: MAPW.ctx, W: MAPW.w, H: MAPW.h, cam: MAPW.cam, layers: UI.layers, hy: mapWhen(), refOverlay: mapWhen() != null, sel: MAPW.sel, hover: MAPW.hover, draft: MAPW.draft, handles: MAPW.edit && MAPW.mode === 'select', highlight: MAPW.highlight, preview: MAPW.preview, marker: MAPW.marker, showJunctions: MAPW.edit && MAPW.junctions, connector: MAPW.edit ? inspectorConnector() : null, cursorMark: ['station', 'place'].includes(MAPW.mode) && MAPW.pointer ? snapPoint(MAPW.pointer).p : null, districts: visibleDistricts(), hoods: visibleHoods(), route: MAPW.route, halo: !MAPW.edit });
  if (!MAPW.edit) { const zt = $('#gm-coord'); if (zt && MAPW.pointer) zt.innerHTML = `X <b>${Math.round(MAPW.pointer[0])}</b> · Z <b>${Math.round(MAPW.pointer[1])}</b>`; }
  const step = GRID_STEPS.find(s => s * MAPW.cam.k >= 70) || 10000; document.querySelectorAll('[id=map-scale-t]').forEach(t => t.textContent = `${step} blocks`); document.querySelectorAll('[id=map-scale-i]').forEach(i => i.style.setProperty('--w', (step * MAPW.cam.k) + 'px'));
  const zt = $('#map-zoom-t'); if (zt) zt.textContent = `${MAPW.cam.k.toFixed(2)} px/blk`;
}
/* the road suggestion connector for the selected building, when its inspector shows one */
function inspectorConnector() { if (MAPW.sel?.kind !== 'building' || MAPW.dock !== 'inspector') return null; const b = byId(MAPW.sel.id); if (!b || b.x == null) return null; const sug = roadSuggest(b, { limit: 1 }); const it = MAPW.connectorRoad ? sug.items.find(x => x.road.id === MAPW.connectorRoad) || null : (sug.items[0] || null); if (!it) return null; return { from: sug.pt, to: it.q }; }

/* ---- dock: inspector · layers · streets · assistant ---- */
function renderDock() {
  const body = $('#dock-body'); if (!body) return; const q0 = $('#asst-q'); const keep = q0 ? { v: q0.value, f: document.activeElement === q0 } : null;
  $$('#dock .dock-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.dock === MAPW.dock));
  body.innerHTML = MAPW.dock === 'inspector' ? renderInspector() : MAPW.dock === 'layers' ? renderLayersPanel() : MAPW.dock === 'streets' ? renderStreetsPanel() : renderAssistantPanel();
  wireDock(); const q1 = $('#asst-q'); if (q1 && keep) { if (keep.v && !q1.value) q1.value = keep.v; if (keep.f && !modalOpen()) q1.focus(); }
}
function vertexEditorHTML(sel) {
  const geoms = selGeometries(sel) || []; if (!geoms.length) return '';
  return geoms.map(g => `<div class="secthead">${g.label || (geoms.length > 1 ? `PART ${g.part + 1}` : 'VERTICES')} <span class="muted" style="letter-spacing:0;font-weight:400">· ${g.pts.length} · exact X / Z</span>${g.closed && geoms.length > 1 ? `<span class="acts"><button class="btn sm ghost" data-act="insp-del-part" data-part="${g.part}" title="Delete this part">${icon('trash')}</button></span>` : ''}</div>
    <div class="vlist">${g.pts.map((p, i) => `<div class="vr ${sel.vertex === i && (sel.part || 0) === g.part ? 'act' : ''}"><span>${i + 1}</span><input type="number" step="1" value="${esc(p[0])}" data-vx="${g.part}:${i}:0" aria-label="X"><input type="number" step="1" value="${esc(p[1])}" data-vx="${g.part}:${i}:1" aria-label="Z"><button data-act="insp-del-vertex" data-part="${g.part}" data-i="${i}" title="Delete vertex">${icon('x')}</button></div>`).join('')}</div>`).join('');
}
function renderInspector() {
  const sel = MAPW.sel;
  if (!sel) {
    const node = scopeNode(UI.scope); const undrawn = [...S.regions, ...S.districts].filter(n => !(n.polygons || []).length);
    return `<div class="dock-empty"><b>Nothing selected.</b> Click a building, road, line, station or border to inspect it. <kbd>S</kbd> select · <kbd>P</kbd> pan · <kbd>B</kbd> border · <kbd>D</kbd> road · <kbd>L</kbd> transit · <kbd>X</kbd> station · <kbd>A</kbd> place a building.</div>
    <div class="secthead">IN VIEW · ${esc(scopeName().toUpperCase())}</div>
    <div class="kv"><div><div class="k">BUILDINGS PLACED</div><div class="v num">${mapBuildings().filter(isActive).length}<small>of ${scopeActive().length}</small></div></div><div><div class="k">WITHOUT COORDINATES</div><div class="v num">${scopeActive().filter(b => b.x == null).length}</div></div><div><div class="k">ROADS</div><div class="v num">${S.roads.length}</div></div><div><div class="k">LINES · STATIONS</div><div class="v num">${S.lines.length} · ${S.stations.length}</div></div></div>
    ${node && !(node.polygons || []).length ? `<div class="callout" style="margin-top:12px"><b>${esc(node.name)} has no border yet.</b> Draw it: Border mode, click the corners, close the shape.<div class="acts"><button class="btn sm primary" data-act="insp-draw-border" data-kind="${UI.scope.kind}" data-id="${esc(node.id)}">${icon('poly')} Draw border for ${esc(node.name)}</button></div></div>` : ''}
    ${undrawn.length ? `<div class="secthead">NOT DRAWN YET <span class="muted" style="letter-spacing:0;font-weight:400">· ${undrawn.length}</span></div><div class="chips" style="margin:8px 0 0">${undrawn.slice(0, 12).map(n => `<span class="rchip" data-act="insp-draw-border" data-kind="${S.regions.includes(n) ? 'region' : 'district'}" data-id="${esc(n.id)}" role="button"><span class="k">${S.regions.includes(n) ? (REGION_TYPE[n.type]?.label || 'REGION').toUpperCase() : 'DISTRICT'}</span><span class="t">${esc(n.name)}</span></span>`).join('')}</div>` : ''}
    ${scopeActive().filter(b => b.x == null).length ? `<div class="desc-line" style="margin-top:12px"><button class="rowlink" data-act="asst-run" data-q="highlight missing coordinates" style="font:inherit">List buildings without coordinates →</button></div>` : ''}`;
  }
  if (sel.kind === 'building') {
    const b = byId(sel.id); if (!b) return '<div class="dock-empty">Gone.</div>'; const d = districtById(b.districtId); const sug = roadSuggest(b); const road = roadById(b.roadId); const ph = physicalOf(b.physical); const iss = buildingIssues(b).filter(i => i.level !== 'info');
    const placeSug = b.x != null ? placeSuggest(b.x, b.z) : null; const outside = placeSug && d?.polygons?.length && !placeSug.districts.some(x => x.d.id === d.id);
    return `<div class="dock-hd" style="--c:${distColor(d)}"><div><div class="kind">${isHist(b) ? 'HISTORICAL · ' : ''}${esc(b.reg)} · ${esc(d?.name || '')}</div><h3>${esc(titleOf(b))}</h3><div class="sub">${b.name && addressOf(b) ? esc(b.name) + ' · ' : ''}${esc(ph.label)}${b.landmark ? ' ✦' : ''} · ${esc(spanHTML(b))}</div></div><div class="acts"><button class="btn sm icon" data-act="insp-open" title="Open the full record">${icon('expand')}</button><button class="btn sm icon" data-act="insp-edit" title="Edit">${icon('edit')}</button></div></div>
    ${iss.length ? issuesHTML(iss, { max: 3 }) : ''}
    ${outside ? `<div class="issue warn">${icon('warn')}<span>Coordinates fall outside the ${esc(d.name)} border${placeSug.districts.length ? ` — inside ${placeSug.districts.map(x => esc(x.d.name)).join(' / ')}` : ''}. ${placeSug.districts[0] ? `<button class="rowlink" data-act="insp-move-district" data-district="${placeSug.districts[0].d.id}" style="font:inherit">Move the record to ${esc(placeSug.districts[0].d.name)}</button> or keep it.` : ''}</span></div>` : ''}
    <div class="kv"><div><div class="k">COORDINATES</div><div class="v num">${b.x != null ? `X ${esc(b.x)} · Z ${esc(b.z)}` : '—'}</div></div><div><div class="k">ENTRANCE</div><div class="v num">${b.entrance?.x != null ? `X ${esc(b.entrance.x)} · Z ${esc(b.entrance.z)}` : '<span class="muted">not marked</span>'}</div></div><div><div class="k">FOOTPRINT</div><div class="v num">${b.footprint ? `${fmtInt(footprintAreaOf(b))}<small>blk² · ${b.footprint.length} pts</small>` : '<span class="muted">not drawn</span>'}</div></div><div><div class="k">NEIGHBORHOOD</div><div class="v">${esc(hoodById(b.neighborhoodId)?.name || '—')}</div></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-act="insp-move">${icon('pin')} Move</button><button class="btn sm" data-act="insp-entrance">${icon('pin')} Entrance</button><button class="btn sm" data-act="insp-footprint">${icon('poly')} ${b.footprint ? 'Redraw' : 'Draw'} footprint</button>${b.footprint ? `<button class="btn sm ghost" data-act="insp-footprint-clear">Clear footprint</button>` : ''}<button class="btn sm" data-act="insp-lot" title="Trace the lot outline — any shape; area, frontage and depth are measured">${icon('poly')} ${lotOutline(b) ? 'Redraw' : 'Draw'} lot</button>${lotOutline(b) ? `<button class="btn sm ghost" data-act="insp-lot-clear">Clear lot</button><button class="btn sm" data-act="insp-center-lot" title="Move the coordinates to the middle of the lot">${icon('fit')} Centre on lot</button>` : ''}${!lotOutline(b) && num(b.lotFront) && num(b.lotDepth) ? `<button class="btn sm" data-act="insp-rotate-lot" title="Swap frontage and depth on the map">${icon('redo')} Rotate lot</button>` : ''}${b.footprint ? `<button class="btn sm" data-act="insp-center-footprint" title="Move the coordinates to the middle of the footprint">${icon('fit')} Centre on footprint</button>` : ''}${b.x != null && S.roads.length ? `<button class="btn sm" data-act="insp-snap-street" title="Sit the lot on its serving road: centre it on the frontage and turn it to face the street">${icon('road')} Snap to street</button>` : ''}</div>
    ${lotOutline(b) ? `<div class="secthead">LOT</div>${lotSectionHTML(b)}` : ''}
    <div class="secthead">SERVING ROAD <span class="muted" style="letter-spacing:0;font-weight:400">· ${sug.basis === 'entrance' ? 'from the entrance' : sug.pt ? 'proximity from the centre' : 'no coordinates'}</span></div>
    ${road ? `<div class="rowlist"><div class="r link" data-act="insp-select" data-kind="road" data-id="${road.id}"><div><div class="t">${esc(roadLabel(road))} <span class="mk road">CURRENT</span></div><div class="s">${(() => { const it = sug.items.find(x => x.road.id === road.id); return it ? esc(roadSuggestReason(it, sug.basis)) : 'association recorded'; })()}</div></div><button class="x" data-act="insp-road-clear" title="Remove association">×</button></div></div>` : ''}
    ${sug.items.filter(it => it.road.id !== b.roadId).length ? `<div class="suggest">${sug.items.filter(it => it.road.id !== b.roadId).map(it => `<div class="sg ${it.kind === 'best' && !road ? 'best' : ''}" data-connector="${it.road.id}"><div><div class="t">${esc(roadLabel(it.road))} <span class="mk ${it.penalty ? 'warn' : 'road'}">${it.kind === 'best' && !road ? 'SUGGESTED' : it.corner ? 'CORNER' : 'ALTERNATIVE'}</span></div><div class="why">${esc(roadSuggestReason(it, sug.basis))}</div></div><div><div class="d">${Math.round(it.d)} blk</div><button class="btn sm" style="margin-top:6px" data-act="insp-road-apply" data-id="${it.road.id}">Use</button></div></div>`).join('')}<div class="desc-line">Hover a suggestion to preview the connector. The association never moves the building.</div></div>` : (S.roads.length ? '' : `<div class="dock-empty">No roads drawn yet.</div>`)}
    ${b.footprint || lotOutline(b) ? vertexEditorHTML(sel) : ''}`;
  }
  if (sel.kind === 'road') {
    const r = roadById(sel.id); if (!r) return ''; const bs = buildingsOnRoad(r); const issues = roadIssues(r); const js = roadConnections(r);
    return `<div class="dock-hd" style="--c:var(--road)"><div><div class="kind">${esc(r.reg)} · ROAD</div><div class="f" style="margin-top:4px"><input id="insp-name" value="${esc(r.name)}" placeholder="Name this road…" style="font-size:16px;font-weight:600;height:36px"></div><div class="sub">${fmtInt(polyLength(r.geometry))} blk · ${fmtInt(blockSteps(r.geometry))} staircase blocks · ${bs.length} building${bs.length === 1 ? '' : 's'} · ${js.length} junction${js.length === 1 ? '' : 's'}</div></div><div class="acts"><button class="btn sm icon" data-act="insp-open" title="Open the full record">${icon('expand')}</button></div></div>
    <div class="frow c3" style="margin-top:10px"><div class="f"><label>Type</label>${selF('insp-type', ROAD_TYPES, r.type)}</div><div class="f"><label>Grade</label>${selF('insp-grade', GRADES, r.grade)}</div><div class="f"><label>Width</label>${numF('insp-width', r.width, 'min="1" step="1"')}</div></div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>Access</label>${selF('insp-direction', DIRECTIONS, r.direction)}</div><div class="f"><label>Opened</label><div class="hy dock-hy">${`<select id="f-insp-opened-h" title="Half of the year">${HALVES.map(h => `<option value="${h.id}" ${(r.halfOpened || '') === h.id ? 'selected' : ''}>${h.short || 'Any half'}</option>`).join('')}</select><input id="f-insp-opened-y" type="number" value="${esc(r.yearOpened ?? '')}" placeholder="year" min="1990" max="2200">`}</div></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm primary" data-act="insp-save-road">${icon('check')} Save</button><button class="btn sm" data-act="insp-extend" data-end="end">${icon('draw')} Extend end</button><button class="btn sm" data-act="insp-extend" data-end="start">${icon('draw')} Extend start</button><button class="btn sm" data-act="insp-split" ${sel.vertex != null && sel.vertex > 0 && sel.vertex < r.geometry.length - 1 ? '' : 'disabled title="Select an inner vertex to split there"'}>Split here</button><button class="btn sm" data-act="insp-join">Join with…</button><button class="btn sm danger" data-act="insp-delete">${icon('trash')}</button></div>
    <div class="secthead">SHAPE HISTORY <span class="muted" style="letter-spacing:0;font-weight:400">· ${mapWhen() != null ? `map date ${esc(hyText(mapWhen()))} — handles edit the shape in force then` : 'map date today'}</span></div>${shapeTimelineHTML(r, 'road')}
    ${nameLinkHTML(r)}
    <div class="secthead">CHECKS</div>${issuesHTML(issues.filter(i => !i.summary), { max: 5 })}<div class="desc-line" style="margin-top:6px">${esc(issues.find(i => i.summary)?.text || '')}</div>
    ${js.length ? `<div class="secthead">CONNECTED TO</div><div class="chips" style="margin:8px 0 0">${[...new Set(js.map(j => j.a === r.id ? j.b : j.a))].map(id => roadById(id)).filter(Boolean).map(o => `<span class="rchip" data-act="insp-select" data-kind="road" data-id="${o.id}" role="button"><span class="k">${js.find(j => j.a === o.id || j.b === o.id)?.kind === 'joins' ? 'JOINS' : 'CROSSES'}</span><span class="t">${esc(roadLabel(o))}</span></span>`).join('')}</div>` : ''}
    ${vertexEditorHTML(sel)}`;
  }
  if (sel.kind === 'line') { const l = lineById(sel.id); return l ? lineInspectorHTML(l, sel) : ''; }
  if (sel.kind === 'station') { const s = stationById(sel.id); return s ? stationInspectorHTML(s) : ''; }
  if (sel.kind === 'junction') {
    const j = sel.j; if (!j) return ''; const A = roadById(j.a), B = roadById(j.b);
    return `<div class="dock-hd" style="--c:var(--road)"><div><div class="kind">${j.kind === 'joins' ? 'JOIN' : 'JUNCTION'}</div><h3>${esc(roadLabel(A || {}))} × ${esc(roadLabel(B || {}))}</h3><div class="sub">X ${Math.round(j.x)} · Z ${Math.round(j.z)} · ${j.kind === 'joins' ? 'an end of one road meets the other' : 'the two roads cross at the same grade'}</div></div></div>
    <div class="chips" style="margin:10px 0 0">${[A, B].filter(Boolean).map(o => `<span class="rchip" data-act="insp-select" data-kind="road" data-id="${o.id}" role="button"><span class="k">${esc(GRADE_LABEL[o.grade] || o.grade).toUpperCase()}</span><span class="t">${esc(roadLabel(o))}</span></span>`).join('')}</div>
    <div class="desc-line" style="margin-top:10px">A crossing between different grades (bridge or tunnel over a surface road) is drawn as a dashed ring and is not a junction.</div>`;
  }
  // region / district / hood
  const node = nodeById(sel.id); if (!node) return ''; const kind = sel.kind; const polys = node.polygons || []; const issues = polygonIssues(polys); const overlaps = peerOverlaps(node, kind);
  const mine = kind === 'region' ? scopeBuildings({ kind: 'region', id: node.id }) : kind === 'district' ? buildingsIn(node.id) : S.buildings.filter(b => b.neighborhoodId === node.id);
  const outside = polys.length ? mine.filter(b => b.x != null && pointInPolys([b.x, b.z], polys) === 'out') : [];
  const strangers = polys.length ? S.buildings.filter(b => isActive(b) && !mine.includes(b) && b.x != null && pointInPolys([b.x, b.z], polys) === 'in') : [];
  const color = kind === 'region' ? regionColor(node) : kind === 'district' ? distColor(node) : distColor(districtById(node.districtId));
  return `<div class="dock-hd" style="--c:${color}"><div><div class="kind">${kind === 'region' ? (REGION_TYPE[node.type]?.label || 'REGION').toUpperCase() : kind === 'district' ? (node.type === 'borough' ? 'BOROUGH' : 'DISTRICT') : 'NEIGHBORHOOD'}${node.code ? ' · ' + esc(node.code) : ''}</div><h3>${esc(node.name)} ${placementHTML(node)}</h3><div class="sub">${polys.length ? `${polys.length} part${polys.length === 1 ? '' : 's'} · ${fmtCompact(polysArea(polys))} blk² · ${mine.filter(isActive).length} buildings` : '<span class="notdrawn">NOT DRAWN YET</span>'}</div></div><div class="acts"><button class="btn sm icon" data-act="insp-look" title="Look at this place everywhere">${icon('globe')}</button><button class="btn sm icon" data-act="insp-edit-node" title="Edit details">${icon('edit')}</button></div></div>
  ${node.typeNote ? `<div class="issue info" style="margin-top:10px">${icon('flag')}<span>${esc(node.typeNote)}${node.source ? ` <span class="muted">· ${esc(node.source)}</span>` : ''}</span></div>` : ''}
  ${issues.length ? issuesHTML(issues) : ''}
  ${overlaps.length ? `<div class="issue warn">${icon('warn')}<span>Border ${overlaps.map(o => `${o.how} <b>${esc(o.node.name)}</b>`).join(', ')} — peers at the same level should not overlap. A child inside its parent is fine.</span></div>` : ''}
  ${outside.length ? `<div class="issue warn">${icon('warn')}<span><b>${outside.length}</b> of its buildings have coordinates outside this border: ${outside.slice(0, 5).map(b => `<span class="where" data-act="insp-select" data-kind="building" data-id="${b.id}">${esc(b.reg)}</span>`).join('')}${outside.length > 5 ? '…' : ''} Nothing is moved automatically — open each one to decide.</span></div>` : ''}
  ${strangers.length ? `<div class="issue info">${icon('flag')}<span><b>${strangers.length}</b> buildings registered elsewhere fall inside this border: ${strangers.slice(0, 5).map(b => `<span class="where" data-act="insp-select" data-kind="building" data-id="${b.id}">${esc(b.reg)}</span>`).join('')}${strangers.length > 5 ? '…' : ''}</span></div>` : ''}
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm primary" data-act="insp-draw-border" data-kind="${kind}" data-id="${esc(node.id)}">${icon('poly')} ${polys.length ? 'Add a part' : 'Draw border'}</button>${polys.length ? `<button class="btn sm" data-act="insp-fit">${icon('fit')} Frame</button>` : ''}</div>
  ${vertexEditorHTML(sel)}`;
}
function renderLayersPanel() {
  const L = UI.layers; const row = (k, label, d, sub = false) => `<label class="lr ${sub ? 'sub' : ''}"><span>${label}<div class="d">${d}</div></span><span class="switch"><input type="checkbox" data-layer="${k}" ${L[k] ? 'checked' : ''}></span></label>`;
  return `<div class="secthead">LAYERS</div><div class="layer-rows">
    ${row('regions', 'States, cities & regions', `${S.regions.filter(r => r.polygons?.length).length} of ${S.regions.length} drawn`)}
    ${row('districts', 'Boroughs & districts', `${S.districts.filter(d => d.polygons?.length).length} of ${S.districts.length} drawn`)}
    ${row('hoods', 'Neighborhoods', `${S.neighborhoods.filter(h => h.polygons?.length).length} of ${S.neighborhoods.length} drawn`)}
    ${row('roads', 'Roads', `${S.roads.length} · junctions ${MAPW.junctions ? 'shown' : 'hidden'}`)}
    ${row('transit', 'Transit lines', `${S.lines.length} lines over ${S.tracks.length} tracks · hiding keeps the data`)}
    ${row('stations', 'Stations', `${S.stations.length}`, true)}
    ${row('buildings', 'Buildings', `${mapBuildings().filter(isActive).length} placed in scope`)}
    ${row('historical', 'Demolished — ghosts', `${scopeBuildings().filter(b => isHist(b) && b.x != null).length} where lost buildings stood`, true)}
    ${row('footprints', 'Footprints', `${S.buildings.filter(b => b.footprint).length} drawn`, true)}
    ${row('lots', 'Lots', `${S.buildings.filter(b => lotOutline(b)).length} outlines drawn · others as frontage × depth boxes`, true)}
    ${row('businesses', 'Businesses', `mark buildings with current tenants`, true)}
    ${row('civic', 'Civic glyphs', `${S.buildings.filter(isCivic).length} facilities · homes of officials`, true)}
    ${row('sandbox', 'Planning sandbox', `${(S.sandbox?.stations || []).length} hypothetical stations`, true)}
    ${row('labels', 'Labels', 'density adapts to zoom')}
    ${row('grid', 'Grid', 'Minecraft block grid, X across · Z down')}
  </div>
  <div class="secthead">COLOUR BUILDINGS BY</div>
  <div class="f" style="margin-top:8px"><select id="map-color">${[['district', 'borough / district'], ['status', 'physical · market · landmark'], ['family', 'class family'], ['era', 'era built'], ['service', 'transit service score']].map(([v, l]) => `<option value="${v}" ${UI.mapColor === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="maplegend" style="margin-top:10px">${mapLegendHTML()}</div>
  <div class="secthead">DRAWING</div>
  <div class="layer-rows">
    <label class="lr"><span>Snap to vertices & lines<div class="d">existing borders, roads, tracks, stations</div></span><span class="switch"><input type="checkbox" data-mapopt="snapVertex" ${MAPW.snapVertex ? 'checked' : ''}></span></label>
    <label class="lr"><span>Snap to grid<div class="d">step <input type="number" id="grid-step" value="${MAPW.gridStep}" min="1" max="64" style="width:52px;height:22px;background:var(--bg);border:1px solid var(--line-2);color:var(--ink);border-radius:3px;padding:0 4px"> blocks</div></span><span class="switch"><input type="checkbox" data-mapopt="snapGrid" ${MAPW.snapGrid ? 'checked' : ''}></span></label>
    <label class="lr"><span>Junction markers<div class="d">dots where roads connect · dashed where they cross at different grades</div></span><span class="switch"><input type="checkbox" data-mapopt="junctions" ${MAPW.junctions ? 'checked' : ''}></span></label>
  </div>`;
}
function mapLegendHTML() {
  const ghost = UI.layers.historical ? `<div><i style="--c:transparent;border:1.5px dashed var(--hist)"></i>Demolished — stood here</div>` : '';
  if (UI.mapColor === 'service') return [[92, 'Best served · 90+'], [70, 'Well served · 70'], [50, 'Average · 50'], [25, 'Poor · 25'], [4, 'Little or none']].map(([s, l]) => `<div><i style="--c:${serviceColor(s)}"></i>${l}</div>`).join('') + ghost;
  if (UI.mapColor === 'status') return PHYSICAL.map(s => `<div><i style="--c:${statusColor(s.id)}"></i>${s.glyph} ${s.label}</div>`).join('') + `<div><i style="--c:${statusColor('for-sale')}"></i>On the market</div><div><i style="--c:${statusColor('landmark')}"></i>Landmark</div>` + ghost;
  if (UI.mapColor === 'family') return CLASS_FAMILIES.map(f => `<div><i style="--c:${PALETTE.marks[FAMILY_SLOT[f]]}"></i>${esc(f)}</div>`).join('') + `<div><i style="--c:${PALETTE.neutral}"></i>Unclassified</div>` + ghost;
  if (UI.mapColor === 'era') return ERAS.map((e, i) => `<div><i style="--c:${ERA_COLORS[i]}"></i>${esc(e.name)} ${String(e.from).slice(2)}–${String(Math.min(e.to, CURRENT_YEAR)).slice(2)}</div>`).join('') + `<div><i style="--c:${PALETTE.neutral}"></i>Undated</div>` + ghost;
  return visibleDistricts().map(d => `<div><i style="--c:${distMark(d)}"></i>${esc(d.name)}</div>`).join('') + ghost + `<div><i style="--c:transparent;border:1.5px solid var(--road);border-radius:1px"></i>Road · <span style="color:var(--gold)">bridge casing</span> · dashed tunnel</div><div><i style="--c:#F6F6F6;border:2px solid var(--transit)"></i>Station</div>`;
}
function renderStreetsPanel() {
  const q = norm(MAPW.streetsQ); let roads = MAPW.streetsAll ? S.roads.slice() : S.roads.filter(r => roadInScope(r));
  if (q) roads = roads.map(r => ({ r, s: Math.max(fuzzyScore(q, r.name), fuzzyScore(q, r.reg), ...(r.aliases || []).map(a => fuzzyScore(q, a)), ...(r.formerNames || []).map(a => fuzzyScore(q, a) * .9)) })).filter(x => x.s >= 0.3).sort((a, b) => b.s - a.s).map(x => x.r); else roads.sort((a, b) => roadLabel(a).localeCompare(roadLabel(b)));
  return `<div class="search" style="height:34px;max-width:none">${icon('search')}<input id="streets-q" placeholder="Search streets, aliases, former names…" value="${esc(MAPW.streetsQ)}" autocomplete="off"></div>
  <div class="toolbar" style="margin:10px 0 6px"><label class="switch" style="font-size:12px"><input type="checkbox" id="streets-all" ${MAPW.streetsAll ? 'checked' : ''}> all jurisdictions</label><span class="spacer"></span><span class="count">${roads.length} road${roads.length === 1 ? '' : 's'}</span><button class="btn sm primary" data-act="insp-new-road">${icon('plus')} New road</button></div>
  ${(() => { const n = S.roads.reduce((a, r) => a + nameLinkCandidates(r).link.length, 0); return n ? `<div class="callout info" style="margin:0 0 8px;padding:8px 10px"><b>${n} building${n === 1 ? '' : 's'}</b> name a street that is on the map but are not linked to it. <div class="acts"><button class="btn sm primary" data-act="link-all-by-name">${icon('link')} Link ${n} by street name</button></div></div>` : ''; })()}
  <div class="streets">${roads.length ? roads.map(r => { const bs = buildingsOnRoad(r).length; const biz = new Set(buildingsOnRoad(r).flatMap(b => currentTenanciesAt(b).map(t => t.businessId))).size; return `<div class="sr ${MAPW.sel?.kind === 'road' && MAPW.sel.id === r.id ? 'sel' : ''}" data-act="insp-select" data-kind="road" data-id="${r.id}" data-hover="road:${r.id}"><div><div class="t">${esc(roadLabel(r))}<span class="reg">${esc(r.reg)}</span>${r.aliases?.length ? `<span class="alias">aka ${esc(r.aliases.join(', '))}</span>` : ''}${r.formerNames?.length ? `<span class="alias">formerly ${esc(r.formerNames.join(', '))}</span>` : ''}</div><div class="s">${esc(ROAD_TYPE_LABEL[r.type] || r.type)} · ${esc(GRADE_LABEL[r.grade] || r.grade)} · ${roadJurisdictions(r).map(d => esc(d.name)).join(', ') || 'no jurisdiction'}</div></div><div class="m">${fmtInt(polyLength(r.geometry))} blk<br>${bs} bldg${biz ? ` · ${biz} biz` : ''}${(() => { const n = nameLinkCandidates(r).link.length; return n ? `<br><button class="rowlink" data-act="link-by-name" data-id="${r.id}" title="Link the ${n} building${n === 1 ? '' : 's'} whose street field names this road" style="font:inherit">+${n} by name</button>` : ''; })()}</div></div>`; }).join('') : `<div class="dock-empty">${S.roads.length ? 'No street matches.' : 'No roads yet — press <kbd>D</kbd> and click along the street to draw the first one.'}</div>`}</div>`;
}
function wireDock() {
  const body = $('#dock-body'); if (!body) return;
  $$('[data-layer]', body).forEach(cb => cb.addEventListener('change', () => { UI.layers[cb.dataset.layer] = cb.checked; renderDock(); mapDraw(); }));
  $$('[data-mapopt]', body).forEach(cb => cb.addEventListener('change', () => { MAPW[cb.dataset.mapopt] = cb.checked; $$(`.map-hud [data-act="map-snap-${cb.dataset.mapopt === 'snapGrid' ? 'grid' : 'vertex'}"], .map-hud [data-act="map-junctions"]`).forEach(b => { if ((b.dataset.act === 'map-snap-grid' && cb.dataset.mapopt === 'snapGrid') || (b.dataset.act === 'map-snap-vertex' && cb.dataset.mapopt === 'snapVertex') || (b.dataset.act === 'map-junctions' && cb.dataset.mapopt === 'junctions')) b.setAttribute('aria-pressed', cb.checked); }); mapDraw(); }));
  $('#grid-step', body)?.addEventListener('change', e => { MAPW.gridStep = clamp(num(e.target.value) || 1, 1, 64); $$('.map-hud [data-act="map-snap-grid"]').forEach(b => b.textContent = `grid ${MAPW.gridStep}`); });
  $('#map-color', body)?.addEventListener('change', e => { UI.mapColor = e.target.value; renderDock(); mapDraw(); });
  $('#streets-q', body)?.addEventListener('input', debounce(e => { MAPW.streetsQ = e.target.value; const pos = e.target.selectionStart; renderDock(); const nq = $('#streets-q'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } }, 120));
  $('#streets-all', body)?.addEventListener('change', e => { MAPW.streetsAll = e.target.checked; renderDock(); });
  $$('[data-vx]', body).forEach(inp => inp.addEventListener('change', () => { const [part, i, k] = inp.dataset.vx.split(':').map(Number); const geoms = selGeometries(MAPW.sel) || []; const g = geoms.find(x => x.part === part); if (!g) return; const v = num(inp.value); if (v == null) return; mapPushUndo(); g.pts[i][k] = Math.round(v); afterGeometryChange(g.target); commit(); refreshTools(); mapDraw(); }));
  $$('.sg[data-connector]', body).forEach(el => { el.addEventListener('pointerenter', () => { MAPW.connectorRoad = el.dataset.connector; mapDraw(); }); el.addEventListener('pointerleave', () => { MAPW.connectorRoad = null; mapDraw(); }); });
  $$('#insp-swatches [data-color]', body).forEach(b => b.onclick = () => { $$('#insp-swatches [data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); const l = lineById(MAPW.sel.id); if (l) { l.color = b.dataset.color; mapDraw(); } });
  $('#insp-color', body)?.addEventListener('input', e => { $$('#insp-swatches [data-color]').forEach(x => x.setAttribute('aria-pressed', 'false')); const l = lineById(MAPW.sel?.id); if (l) { l.color = e.target.value; mapDraw(); } });
  $('#insp-addline', body)?.addEventListener('change', e => { const l = lineById(e.target.value); const s = stationById(MAPW.sel.id); if (l && s) { mapPushUndo(); addStopOrdered(l, s.id); commit(); renderDock(); mapDraw(); toast(`${s.name || s.reg} added to ${lineLabel(l)} as stop ${l.stopIds.indexOf(s.id) + 1}`, 'good'); } });
  $('#f-insp-hours', body)?.addEventListener('change', e => { const c = $('.hours-custom', body); if (c) c.hidden = e.target.value !== 'custom'; });
  $$('[data-stopname]', body).forEach(inp => { inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const all = $$('[data-stopname]', body); const nx = all[all.indexOf(inp) + 1]; inp.dispatchEvent(new Event('change')); if (nx) nx.focus(); } }); inp.addEventListener('change', () => { const s = stationById(inp.dataset.stopname); if (!s || s.name === inp.value.trim()) return; s.name = inp.value.trim(); s.updated = now(); commit({ silentRender: true }); mapDraw(); }); });
  wireShapeTimelines(body);
  $('#insp-name', body)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(`[data-act^="insp-save"]`, body)?.click(); } });
}
/* inspector actions (called from the delegated click handler) */
function inspectorAction(act, t) {
  const sel = MAPW.sel;
  switch (act) {
    case 'insp-lot': if (sel) startLotDraw(sel.id); break;
    case 'insp-lot-clear': { const b = byId(sel.id); if (!b) break; mapPushUndo(); b.lot = null; b.lotSource = ''; b.updated = now(); commit(); renderDock(); mapDraw(); toast('Lot outline cleared — frontage, depth and area stay as they were', ''); break; }
    case 'insp-center-lot': { const b = byId(sel.id); if (!lotOutline(b)) break; const c = centroidOf(b.lot); mapPushUndo(); b.x = Math.round(c[0]); b.z = Math.round(c[1]); b.updated = now(); commit(); renderDock(); mapDraw(); toast(`${b.reg} centred on its lot · X ${b.x} · Z ${b.z}`, 'good'); break; }
    case 'insp-rotate-lot': { const b = byId(sel.id); if (!b) break; mapPushUndo(); b.lotRotated = !b.lotRotated; b.updated = now(); commit(); renderDock(); mapDraw(); toast(`Lot turned — frontage now runs along ${b.lotRotated ? 'Z (north–south)' : 'X (east–west)'}`, 'good'); break; }
    case 'insp-center-footprint': { const b = byId(sel.id); if (!b?.footprint) break; const c = centroidOf(b.footprint); mapPushUndo(); b.x = Math.round(c[0]); b.z = Math.round(c[1]); b.updated = now(); commit(); renderDock(); mapDraw(); toast(`${b.reg} centred on its footprint · X ${b.x} · Z ${b.z}`, 'good'); break; }
    case 'insp-snap-street': { const b = byId(sel.id); if (!b) break; const sn = snapToStreet(b); if (!sn) { toast('No road near this building to snap to', 'warn'); break; } mapPushUndo(); const was = { x: b.x, z: b.z, lotRotated: b.lotRotated, roadId: b.roadId, roadIdSource: b.roadIdSource }; b.x = sn.x; b.z = sn.z; b.lotRotated = sn.lotRotated; if (!b.roadId) { b.roadId = sn.road.id; b.roadIdSource = 'snap'; } b.updated = now(); commit(); renderDock(); mapDraw(); toast(`${b.reg} snapped to ${roadLabel(sn.road)} · X ${b.x} · Z ${b.z}`, 'good', { label: 'UNDO', fn: () => { Object.assign(b, was); b.updated = now(); commit(); renderDock(); mapDraw(); } }); break; }
    case 'insp-version-save': shapeVersionSaveFlow(sel); break;
    case 'insp-version-restore': { const o = sel.kind === 'road' ? roadById(sel.id) : trackById(t.dataset.t); const v = (o?.versions || []).find(x => x.id === t.dataset.v); if (!o || !v) break; mapPushUndo(); swapShapeVersion(o, v); afterGeometryChange({ kind: sel.kind === 'road' ? 'road' : 'track', id: o.id }); commit(); renderDock(); mapDraw(); toast(`The ${hyLabel(v.year, v.half)} shape is now the current one; the previous current shape is kept, dated ${hyLabel(o.versions[o.versions.length - 1]?.year, o.versions[o.versions.length - 1]?.half)}`, 'good'); break; }
    case 'insp-version-remove': { const o = sel.kind === 'road' ? roadById(sel.id) : trackById(t.dataset.t); if (!o) break; mapPushUndo(); o.versions = (o.versions || []).filter(x => x.id !== t.dataset.v); o.updated = now(); commit(); renderDock(); break; }
    case 'insp-select': MAPW.sel = { kind: t.dataset.kind, id: t.dataset.id }; MAPW.dock = 'inspector'; renderDock(); refreshTools(); const ext = selExtent(MAPW.sel); if (ext && t.closest('.streets, .chips, .issue')) mapFit(ext); else mapDraw(); break;
    case 'insp-open': if (sel) openRecord(sel.kind, sel.id); break;
    case 'insp-edit': if (sel) openRecord(sel.kind, sel.id, 'edit'); break;
    case 'insp-look': if (sel) setScope({ kind: sel.kind, id: sel.id }); break;
    case 'insp-edit-node': if (sel?.kind === 'region') openRegionModal(sel.id); else if (sel?.kind === 'district') openDistrictModal(sel.id); else if (sel?.kind === 'hood') { const h = hoodById(sel.id); openHoodsModal(h.districtId, h.id); } break;
    case 'insp-fit': { const e = selExtent(sel); if (e) mapFit(e); break; }
    case 'insp-draw-border': setMapMode('border', { target: { kind: t.dataset.kind, id: t.dataset.id } }); MAPW.sel = { kind: t.dataset.kind, id: t.dataset.id }; renderDock(); break;
    case 'insp-move': { if (!sel) break; if (sel.kind === 'station') { MAPW.pending = { kind: 'move-station', id: sel.id, label: `Click the new position for ${stationById(sel.id)?.name || 'the station'}` }; setMapMode('station', { pending: MAPW.pending }); } else { MAPW.pending = { kind: 'place-building', buildingId: sel.id, field: 'xz', label: `Click the new position for ${byId(sel.id)?.reg || 'the building'}`, resume: () => { MAPW.sel = sel; renderDock(); } }; setMapMode('place', { pending: MAPW.pending }); } break; }
    case 'insp-entrance': { if (!sel) break; MAPW.pending = { kind: 'place-building', buildingId: sel.id, field: 'entrance', label: `Click where you walk into ${byId(sel.id)?.reg || 'the building'}`, resume: () => { MAPW.sel = sel; renderDock(); } }; setMapMode('place', { pending: MAPW.pending }); break; }
    case 'insp-footprint': { if (!sel) break; MAPW.pending = { kind: 'footprint', buildingId: sel.id, label: `Trace the outline of ${byId(sel.id)?.reg || 'the building'}`, resume: () => { MAPW.sel = sel; renderDock(); } }; setMapMode('footprint', { pending: MAPW.pending }); break; }
    case 'insp-footprint-clear': { const b = byId(sel.id); if (b) { mapPushUndo(); b.footprint = null; b.updated = now(); commit(); renderDock(); mapDraw(); } break; }
    case 'insp-move-district': { const b = byId(sel.id); const d = districtById(t.dataset.district); if (b && d) { confirmDialog({ title: `Move ${b.reg} to ${d.name}?`, body: `<p>The record moves to <b>${esc(d.name)}</b> and receives a new number in that series; <code>${esc(b.reg)}</code> stays on file as a former number. Coordinates are not changed.</p>`, ok: 'Move record' }).then(r => { if (r !== 'ok') return; b.formerRegs = [...(b.formerRegs || []), b.reg]; b.districtId = d.id; b.neighborhoodId = null; b.reg = isHist(b) ? nextHistReg(S, d.id) : nextReg(S, d.id); b.updated = now(); commit(); renderDock(); mapDraw(); toast(`Moved to ${d.name} as ${b.reg}`, 'good'); }); } break; }
    case 'insp-road-apply': { const b = byId(sel.id); if (b) { b.roadId = t.dataset.id; b.roadIdSource = 'manual'; b.updated = now(); commit(); renderDock(); mapDraw(); toast(`${b.reg} now served by ${roadLabel(roadById(t.dataset.id))}`, 'good'); } break; }
    case 'insp-road-clear': { const b = byId(sel.id); if (b) { b.roadId = null; b.roadIdSource = null; b.updated = now(); commit(); renderDock(); mapDraw(); } break; }
    case 'insp-save-road': { const r = roadById(sel.id); if (!r) break; const name = $('#insp-name').value.trim(); if (r.name && name && name !== r.name && !(r.formerNames || []).includes(r.name)) r.formerNames = [...(r.formerNames || []), r.name]; r.name = name; r.type = $('#f-insp-type').value; r.grade = $('#f-insp-grade').value; r.width = num($('#f-insp-width').value); r.direction = $('#f-insp-direction').value; const y = num($('#f-insp-opened-y').value); r.yearOpened = y; r.halfOpened = y != null && ['E', 'L'].includes($('#f-insp-opened-h').value) ? $('#f-insp-opened-h').value : ''; r.updated = now(); JUNCTION_CACHE.key = ''; commit(); renderDock(); mapDraw(); toast('Road saved', 'good'); offerNameLinks(r); break; }
    case 'insp-save-line': { const l = lineById(sel.id); if (!l) break; saveLineInspector(l); commit(); renderDock(); mapDraw(); toast('Line saved', 'good'); break; }
    case 'insp-save-station': { const s = stationById(sel.id); if (!s) break; mapPushUndo(); saveStationInspector(s); commit(); renderDock(); mapDraw(); toast('Station saved', 'good'); break; }
    case 'insp-extend': { if (sel?.kind === 'road') { const r = roadById(sel.id); const fromStart = t.dataset.end === 'start'; const eg = (editableShape(r, 'road') || { pts: r.geometry }).pts; MAPW.draft = { kind: 'polyline', pts: [fromStart ? eg[0] : eg[eg.length - 1]], cursor: null, forKind: 'road', extend: { kind: 'road', id: r.id }, prepend: fromStart }; setMapMode('road', { keepDraft: true }); } else if (sel?.kind === 'line') { const l = lineById(sel.id); const tr = lineTracks(l)[0]; if (!tr) { toast('This line has no track yet — draw one with Add track', 'warn'); break; } const fromStart = t.dataset.end === 'start'; const eg = (editableShape(tr, 'track') || { pts: tr.geometry }).pts; MAPW.draft = { kind: 'polyline', pts: [fromStart ? eg[0] : eg[eg.length - 1]], cursor: null, forKind: 'transit', extend: { kind: 'track', id: tr.id }, prepend: fromStart, lineId: l.id, stops: [] }; setMapMode('transit', { keepDraft: true }); } break; }
    case 'insp-add-track': setMapMode('transit'); toast('Draw the new track — it is added to the selected line', ''); break;
    case 'insp-station-mode': setMapMode('station'); break;
    case 'insp-split': { const r = roadById(sel.id); const i = sel.vertex; if (!r || i == null || i <= 0 || i >= r.geometry.length - 1) break; mapPushUndo(); const r2 = newRoad(S); Object.assign(r2, { name: r.name, aliases: r.aliases.slice(), type: r.type, grade: r.grade, width: r.width, direction: r.direction, surface: r.surface, yearOpened: r.yearOpened, halfOpened: r.halfOpened, geometry: r.geometry.slice(i), notes: `Split from ${r.reg}` }); r.geometry = r.geometry.slice(0, i + 1); r.updated = now(); S.roads.push(r2); for (const b of buildingsOnRoad(r)) { if (b.x != null) { const a = polylineClosest([b.x, b.z], r.geometry), c = polylineClosest([b.x, b.z], r2.geometry); if (c && a && c.d < a.d) b.roadId = r2.id; } } JUNCTION_CACHE.key = ''; commit(); MAPW.sel = { kind: 'road', id: r.id }; renderDock(); mapDraw(); toast(`Split — ${r2.reg} continues from here (same name)`, 'good'); break; }
    case 'insp-join': { const r = roadById(sel.id); if (!r) break; roadPickDialog(`Join ${roadLabel(r)} with…`).then(id => { const o = roadById(id); if (!o || o.id === r.id) return; mapPushUndo(); const ends = { a0: r.geometry[0], a1: r.geometry[r.geometry.length - 1], b0: o.geometry[0], b1: o.geometry[o.geometry.length - 1] }; const combos = [[dist2(ends.a1, ends.b0), () => [...r.geometry, ...o.geometry]], [dist2(ends.a1, ends.b1), () => [...r.geometry, ...o.geometry.slice().reverse()]], [dist2(ends.a0, ends.b1), () => [...o.geometry, ...r.geometry]], [dist2(ends.a0, ends.b0), () => [...o.geometry.slice().reverse(), ...r.geometry]]].sort((x, y) => x[0] - y[0]); r.geometry = combos[0][1](); if (dist2(r.geometry[0], r.geometry[1]) < 0.5) r.geometry.splice(1, 1); r.aliases = [...new Set([...r.aliases, ...(o.aliases || []), ...(o.name && o.name !== r.name ? [o.name] : [])])]; r.updated = now(); for (const b of buildingsOnRoad(o)) b.roadId = r.id; for (const l of S.lines) if ((l.roadIds || []).includes(o.id)) l.roadIds = [...new Set(l.roadIds.map(x => x === o.id ? r.id : x))]; S.roads = S.roads.filter(x => x.id !== o.id); JUNCTION_CACHE.key = ''; commit(); renderDock(); mapDraw(); toast(`${roadLabel(o)} joined into ${roadLabel(r)} — its name kept as an alias`, 'good'); }); break; }
    case 'insp-del-vertex': { const geoms = selGeometries(sel) || []; const g = geoms.find(x => x.part === +t.dataset.part); if (!g) break; const min = g.closed ? 3 : 2; if (g.pts.length <= min) { toast(`Needs at least ${min} points`, 'warn'); break; } mapPushUndo(); g.pts.splice(+t.dataset.i, 1); afterGeometryChange(g.target); commit(); renderDock(); mapDraw(); break; }
    case 'insp-del-part': { const node = nodeById(sel.id); if (!node) break; mapPushUndo(); node.polygons.splice(+t.dataset.part, 1); afterGeometryChange({ kind: sel.kind, id: sel.id }); commit(); renderDock(); mapDraw(); break; }
    case 'insp-delete': if (sel) deleteOther(sel.kind, sel.id).then(() => { MAPW.sel = null; renderDock(); mapDraw(); }); break;
    case 'insp-new-road': setMapMode('road'); break;
  }
}
/* ---- street-name links: bulk action, offers after naming a road, undo ---- */
function nameLinkHTML(r) {
  const c = nameLinkCandidates(r); if (!c.link.length && !c.manualElsewhere.length && !c.already.length) return '';
  return `<div class="secthead">BY STREET NAME <span class="muted" style="letter-spacing:0;font-weight:400">· ${esc(roadLabel(r))}</span></div>
  ${c.link.length ? `<div class="callout info" style="margin-top:8px;padding:8px 10px"><b>${c.link.length}</b> building${c.link.length === 1 ? '' : 's'} name this street but ${c.link.length === 1 ? 'is' : 'are'} not linked to it: ${c.link.slice(0, 6).map(b => `<span class="where" data-act="insp-select" data-kind="building" data-id="${b.id}">${esc(b.reg)}</span>`).join('')}${c.link.length > 6 ? '…' : ''}<div class="acts"><button class="btn sm primary" data-act="link-by-name" data-id="${r.id}">${icon('link')} Link ${c.link.length} building${c.link.length === 1 ? '' : 's'} on ${esc(roadLabel(r))}</button></div></div>` : ''}
  ${c.manualElsewhere.length ? `<div class="desc-line" style="margin-top:6px">${c.manualElsewhere.length} name${c.manualElsewhere.length === 1 ? 's' : ''} this street but ${c.manualElsewhere.length === 1 ? 'was' : 'were'} linked to another road by hand — left as set: ${c.manualElsewhere.slice(0, 4).map(b => `<span class="where" data-act="insp-select" data-kind="building" data-id="${b.id}">${esc(b.reg)}</span>`).join('')}</div>` : ''}
  ${c.already.length && !c.link.length ? `<div class="desc-line" style="margin-top:6px">${c.already.length} building${c.already.length === 1 ? '' : 's'} linked by name.</div>` : ''}`;
}
function linkRoadByNameFlow(r) {
  const c = nameLinkCandidates(r); if (!c.link.length) { toast('Nothing to link by name', ''); return; }
  const res = linkByName(r, c.link); commit(); renderDock(); mapDraw(); if (DR.id) renderDrawer();
  toast(`${res.linked} building${res.linked === 1 ? '' : 's'} linked to ${roadLabel(r)} by street name${c.manualElsewhere.length ? ` · ${c.manualElsewhere.length} hand-set link${c.manualElsewhere.length === 1 ? '' : 's'} left alone` : ''}`, 'good', { label: 'UNDO', fn: () => { res.undo(); commit(); renderDock(); mapDraw(); if (DR.id) renderDrawer(); toast('Street-name links undone', 'warn'); } });
}
function linkAllByNameFlow() {
  const res = linkAllByName(); if (!res.total) { toast('Every building that names a mapped street is already linked', ''); return; }
  commit(); renderDock(); mapDraw(); if (DR.id) renderDrawer();
  toast(`${res.total} building${res.total === 1 ? '' : 's'} linked by street name across ${res.changes.length} road${res.changes.length === 1 ? '' : 's'}`, 'good', { label: 'UNDO', fn: () => { res.undo(); commit(); renderDock(); mapDraw(); if (DR.id) renderDrawer(); toast('Street-name links undone', 'warn'); } });
}
/* after a road is created or renamed: offer the matching unlinked buildings, never link silently */
function offerNameLinks(r) { if (!r?.name) return; const n = nameLinkCandidates(r).link.length; if (n) toast(`${n} building${n === 1 ? '' : 's'} name${n === 1 ? 's' : ''} ${r.name} — link ${n === 1 ? 'it' : 'them'}?`, '', { label: `LINK ${n}`, fn: () => linkRoadByNameFlow(r) }); }
/* station move via pending */
function mapStationClick(raw) { const pend = MAPW.pending; if (pend?.kind === 'move-station') { const s = stationById(pend.id); if (s) { mapPushUndo(); const p = roundPt(snapPoint(raw).p); s.x = p[0]; s.z = p[1]; s.districtId = placeSuggest(p[0], p[1]).districts[0]?.d.id || null; s.updated = now(); commit(); } MAPW.pending = null; MAPW.sel = { kind: 'station', id: pend.id }; setMapMode('select'); renderDock(); mapDraw(); toast('Station moved', 'good'); return true; } return false; }
/* flows that come from elsewhere (drawer buttons, modals, add menu) */
function startBorderDraw(kind, id) { closeModal(); if ($('#drawer').classList.contains('on')) closeDrawer(true); if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = { kind, id }; setMapMode('border', { target: { kind, id } }); const ext = selExtent(MAPW.sel) || scopeExtent({ kind, id }); if (ext) mapFit(ext); renderDock(); }; if (MAPW.mounted) go(); else setTimeout(go, 40); toast(`Draw the border of ${nodeById(id)?.name || 'the place'} — click the corners, close the shape to finish`, ''); }
function startDrawFlow(kind) { if ($('#drawer').classList.contains('on')) closeDrawer(true); if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = null; setMapMode(kind); renderDock(); }; if (MAPW.mounted) go(); else setTimeout(go, 40); }
/* pick a point for the building drawer (coordinates or entrance), then come back to the editor */
function pickPointForDraft(field) {
  if (!DR.draft) return; readFormInto(DR.draft, false); const draft = DR.draft; const stackState = { ...DR };
  $('#drawer').classList.remove('on'); $('#backdrop').classList.remove('on');
  if (UI.nav !== 'map') setNav('map');
  const resume = () => { Object.assign(DR, stackState); DR.draft = draft; renderDrawer(); showDrawer(); };
  const go = () => { MAPW.pending = { kind: 'place-building', buildingId: draft.id, field, label: field === 'entrance' ? `Click where you walk into ${draft.reg || 'the new building'}` : `Click the position of ${draft.reg || 'the new building'}`, resume }; setMapMode('place', { pending: MAPW.pending }); if (draft.x != null) { MAPW.cam.x = draft.x; MAPW.cam.z = draft.z; if (MAPW.cam.k < 1.5) MAPW.cam.k = 2; mapDraw(); } };
  if (MAPW.mounted) go(); else setTimeout(go, 40);
}
function drawFootprintForDraft() {
  if (!DR.draft) return; readFormInto(DR.draft, false); const draft = DR.draft; const stackState = { ...DR };
  $('#drawer').classList.remove('on'); $('#backdrop').classList.remove('on'); if (UI.nav !== 'map') setNav('map');
  const resume = () => { Object.assign(DR, stackState); DR.draft = draft; renderDrawer(); showDrawer(); };
  const go = () => { MAPW.pending = { kind: 'footprint', buildingId: draft.id, label: `Trace the outline of ${draft.reg || 'the new building'}`, resume }; setMapMode('footprint', { pending: MAPW.pending }); if (draft.x != null) { MAPW.cam.x = draft.x; MAPW.cam.z = draft.z; if (MAPW.cam.k < 3) MAPW.cam.k = 4; mapDraw(); } };
  if (MAPW.mounted) go(); else setTimeout(go, 40);
}

/* ---- dated shapes in the inspector (roads directly; lines through their tracks) ---- */
async function shapeVersionSaveFlow(sel) {
  const objs = sel?.kind === 'road' ? [roadById(sel.id)].filter(Boolean) : sel?.kind === 'line' ? lineTracks(lineById(sel.id) || { trackIds: [] }) : []; if (!objs.length) { toast('Nothing with a shape is selected', 'warn'); return; }
  const r = await hyPromptDialog({ title: 'Save the current shape as a dated version', body: '<p>The shape as drawn now is kept for the date you give; playback shows it from that half-year until the next dated shape. Then redraw the current shape for later years.</p>', ok: 'Save dated shape', kicker: 'DATED SHAPE', label: 'This shape was true in', year: FOUNDED_YEAR, half: 'E' });
  if (!r || r.year == null) return; mapPushUndo(); for (const o of objs) saveShapeVersion(o, r.year, r.half); commit(); renderDock(); toast(`Shape saved as ${hyLabel(r.year, r.half)} — now redraw the current one`, 'good');
}
