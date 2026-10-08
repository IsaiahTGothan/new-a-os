/* =====================================================================
   §26 SHAPE PERIODS — a road or a track is a list of dated shapes:
       2013 E – 2018 E one shape, 2018 E – 2020 L another, a gap when it was
       removed, a rebuilt shape later. The current shape is `geometry`
       (from geometryFrom… to yearClosed); earlier shapes live in `versions`
       with an optional explicit end (toYear/toHalf). Nothing is renumbered
       and the stored fields stay plain JSON.
   ===================================================================== */
const hyOf = (y, h) => y == null || y === '' ? null : hyIndex(num(y), h || '');
const hyText = i => i == null ? 'undated' : hyLabel(hyFromIndex(i).year, hyFromIndex(i).half);
const hyShortText = i => i == null ? '—' : hyShort(hyFromIndex(i).year, hyFromIndex(i).half);
/* normalised periods, oldest first: { id, from, to (exclusive, null = open), geometry, width, v (version | null = current), current } */
function shapePeriods(o) {
  const vs = (o.versions || []).filter(v => Array.isArray(v.geometry) && v.geometry.length >= 2 && v.year != null)
    .map(v => ({ id: v.id, from: hyOf(v.year, v.half), to: v.toYear != null ? hyOf(v.toYear, v.toHalf) : null, explicitTo: v.toYear != null, geometry: v.geometry, width: v.width ?? o.width, v, current: false }))
    .sort((a, b) => a.from - b.from);
  const openIdx = hyOf(o.yearOpened, o.halfOpened), closeIdx = hyOf(o.yearClosed, o.halfClosed);
  if (vs.length && openIdx != null && openIdx < vs[0].from) vs[0].from = openIdx;     // the first shape reaches back to the opening
  for (let i = 0; i < vs.length; i++) { const next = vs[i + 1]; if (next) vs[i].to = vs[i].to == null ? next.from : Math.min(vs[i].to, next.from); }
  let curFrom = hyOf(o.geometryFromYear, o.geometryFromHalf);
  if (vs.length) { const last = vs[vs.length - 1]; const lastEnd = last.to ?? (curFrom != null ? curFrom : last.from + 1); curFrom = curFrom == null ? lastEnd : Math.max(curFrom, last.from + 1); if (last.to == null) last.to = curFrom; else last.to = Math.min(last.to, curFrom); }
  else if (curFrom == null) curFrom = openIdx;
  const cur = { id: 'current', from: curFrom, to: closeIdx, geometry: o.geometry || [], width: o.width, v: null, current: true };
  return [...vs, ...((o.geometry || []).length >= 2 || !vs.length ? [cur] : [])];
}
/* where a road or track stands at half-year hy: 'open' | 'future' | 'gap' | 'closed' | 'undated', with the shape in force */
function shapeStateAt(o, hy) {
  const ps = shapePeriods(o); if (!ps.length) return { state: 'undated', period: null };
  if (ps.every(p => p.from == null)) { const ci = hyOf(o.yearClosed, o.halfClosed); return { state: ci != null && ci <= hy ? 'closed' : 'undated', period: ps[ps.length - 1] }; }
  const hit = ps.find(p => p.from != null && p.from <= hy && (p.to == null || hy < p.to)); if (hit) return { state: 'open', period: hit };
  const first = ps.find(p => p.from != null); if (hy < first.from) return { state: 'future', period: first };
  const later = ps.find(p => p.from != null && p.from > hy); return later ? { state: 'gap', period: later } : { state: 'closed', period: ps[ps.length - 1] };
}
function geometryAt(o, hy) {
  if (hy == null) return { geometry: o.geometry, width: o.width, version: null, state: 'open' };
  const { state, period } = shapeStateAt(o, hy); const p = period || { geometry: o.geometry, width: o.width, v: null };
  return { geometry: p.geometry, width: p.width ?? o.width, version: p.v, state, period: p };
}
/* "this shape was true in year/half": kept as a dated shape; the current shape applies from the half-year after */
function saveShapeVersion(o, year, half, note = '') {
  const v = { id: uid('gv'), year, half: half || '', toYear: null, toHalf: '', geometry: JSON.parse(JSON.stringify(o.geometry || [])), width: o.width ?? null, note, saved: now() };
  o.versions = [...(o.versions || []), v].sort((a, b) => hyIndex(a.year, a.half || '') - hyIndex(b.year, b.half || ''));
  const vi = hyIndex(year, half || 'E'); if (o.geometryFromYear == null || hyIndex(o.geometryFromYear, o.geometryFromHalf || '') <= vi) { const n = hyFromIndex(vi + 1); o.geometryFromYear = n.year; o.geometryFromHalf = n.half; }
  o.updated = now(); return v;
}
/* start a new shape at half-year idx: the shape in force then ends there and a copy of it begins (edit the copy) */
function shapeSplitAt(o, idx, { firstFrom = null } = {}) {
  const ps = shapePeriods(o); const hit = ps.find(p => p.from != null && p.from <= idx && (p.to == null || idx < p.to)) || (ps.length === 1 && ps[0].from == null ? ps[0] : null);
  if (!hit) return { ok: false, why: `${o.name || o.reg} is not in place in ${hyText(idx)} — pick a date inside one of its shapes, or use “Rebuilt from…”` };
  if (hit.from === idx) return { ok: false, why: `A shape already starts in ${hyText(idx)} — edit that one` };
  const { year, half } = hyFromIndex(idx);
  if (hit.current) {
    const from = hit.from ?? firstFrom; if (from == null || from >= idx) return { ok: false, why: 'Give the date the earlier shape started' };
    const f = hyFromIndex(from); o.versions = [...(o.versions || []), { id: uid('gv'), year: f.year, half: f.half, toYear: year, toHalf: half, geometry: JSON.parse(JSON.stringify(o.geometry || [])), width: o.width ?? null, note: '', saved: now() }];
    if (o.yearOpened == null) { o.yearOpened = f.year; o.halfOpened = f.half; }
    o.geometryFromYear = year; o.geometryFromHalf = half; sortVersions(o); o.updated = now(); return { ok: true, id: 'current' };
  }
  const v = hit.v; const nv = { id: uid('gv'), year, half, toYear: v.toYear ?? null, toHalf: v.toHalf || '', geometry: JSON.parse(JSON.stringify(v.geometry)), width: v.width ?? null, note: '', saved: now() };
  v.toYear = year; v.toHalf = half; o.versions = [...o.versions, nv]; sortVersions(o); o.updated = now(); return { ok: true, id: nv.id };
}
/* rebuilt after a gap (or after closing): the current shape is kept as dated, a new current shape starts at idx */
function shapeRebuildAt(o, idx) {
  const st = shapeStateAt(o, idx); if (st.state === 'open') return shapeSplitAt(o, idx);
  const { year, half } = hyFromIndex(idx); const ps = shapePeriods(o); const cur = ps.find(p => p.current);
  if (st.state === 'closed' && cur && (o.geometry || []).length >= 2) {
    const f = hyFromIndex(cur.from ?? hyOf(o.yearOpened, o.halfOpened) ?? 0);
    o.versions = [...(o.versions || []), { id: uid('gv'), year: f.year, half: f.half, toYear: o.yearClosed, toHalf: o.halfClosed || '', geometry: JSON.parse(JSON.stringify(o.geometry)), width: o.width ?? null, note: '', saved: now() }];
    o.yearClosed = null; o.halfClosed = ''; o.geometryFromYear = year; o.geometryFromHalf = half; sortVersions(o); o.updated = now(); return { ok: true, id: 'current' };
  }
  if (st.state === 'gap' || st.state === 'future') return { ok: false, why: `In ${hyText(idx)} the next shape is already on file (from ${hyText(st.period.from)}) — move its start instead` };
  return { ok: false, why: 'Date the existing shape first' };
}
function sortVersions(o) { o.versions = (o.versions || []).slice().sort((a, b) => hyIndex(a.year, a.half || '') - hyIndex(b.year, b.half || '')); }
/* set the dates of one period; from/to are half-year indexes (to null = until the next shape / still open) */
function shapeSetDates(o, pid, from, to) {
  if (from != null && to != null && to <= from) return { ok: false, why: 'The end must come after the start' };
  const f = from != null ? hyFromIndex(from) : null, t = to != null ? hyFromIndex(to) : null;
  if (pid === 'current') {
    const vs = shapePeriods(o).filter(p => !p.current); const prev = vs[vs.length - 1];
    if (prev && from != null && from <= prev.from) return { ok: false, why: `The current shape must start after the ${hyText(prev.from)} shape` };
    if (vs.length) { o.geometryFromYear = f ? f.year : null; o.geometryFromHalf = f ? f.half : ''; } else { o.yearOpened = f ? f.year : null; o.halfOpened = f ? f.half : ''; o.geometryFromYear = null; o.geometryFromHalf = ''; }
    o.yearClosed = t ? t.year : null; o.halfClosed = t ? t.half : '';
  } else {
    const v = (o.versions || []).find(x => x.id === pid); if (!v) return { ok: false, why: 'That shape is gone' }; if (from == null) return { ok: false, why: 'A dated shape needs a start' };
    v.year = f.year; v.half = f.half; v.toYear = t ? t.year : null; v.toHalf = t ? t.half : ''; sortVersions(o);
    const first = shapePeriods(o)[0]; if (first && first.v === v && o.yearOpened != null && hyOf(o.yearOpened, o.halfOpened) < from) { o.yearOpened = f.year; o.halfOpened = f.half; }
  }
  const first = shapePeriods(o).find(p => p.from != null); if (first && (o.yearOpened == null || hyOf(o.yearOpened, o.halfOpened) > first.from)) { const ff = hyFromIndex(first.from); o.yearOpened = ff.year; o.halfOpened = ff.half; }
  o.updated = now(); return { ok: true };
}
/* remove one period: a dated shape is dropped; the current shape is replaced by the latest dated one */
function shapeRemove(o, pid) {
  if (pid !== 'current') { o.versions = (o.versions || []).filter(v => v.id !== pid); o.updated = now(); return { ok: true }; }
  const vs = (o.versions || []).slice(); if (!vs.length) return { ok: false, why: 'This is the only shape — delete the whole record instead, or date its removal' };
  sortVersions(o); const last = o.versions[o.versions.length - 1]; o.versions = o.versions.slice(0, -1);
  o.geometry = JSON.parse(JSON.stringify(last.geometry)); if (last.width) o.width = last.width; o.geometryFromYear = last.year; o.geometryFromHalf = last.half || '';
  if (last.toYear != null) { o.yearClosed = last.toYear; o.halfClosed = last.toHalf || ''; } o.updated = now(); return { ok: true };
}
/* swap a dated shape in as the current one: the current shape is kept, dated from when it applied */
function swapShapeVersion(o, v) {
  const vs = (o.versions || []).filter(x => x.id !== v.id); const curIdx = o.geometryFromYear != null ? hyIndex(o.geometryFromYear, o.geometryFromHalf || '') : hyIndex(CURRENT_YEAR, CURRENT_HALF); const cf = hyFromIndex(Math.max(curIdx, hyIndex(v.year, v.half || 'E') + 1));
  vs.push({ id: uid('gv'), year: cf.year, half: cf.half, toYear: null, toHalf: '', geometry: JSON.parse(JSON.stringify(o.geometry || [])), width: o.width ?? null, note: 'previous current shape', saved: now() });
  o.versions = vs.sort((a, b) => hyIndex(a.year, a.half || '') - hyIndex(b.year, b.half || '')); o.geometry = JSON.parse(JSON.stringify(v.geometry)); if (v.width) o.width = v.width; o.geometryFromYear = v.year; o.geometryFromHalf = v.half || ''; o.updated = now();
}
/* what changed between consecutive shapes: longer · shorter · rerouted (for playback events and the timeline) */
function shapeChange(a, b) {
  if (!a || !b) return ''; const la = polyLength(a.geometry), lb = polyLength(b.geometry); const d = Math.round(lb - la);
  const sameStart = a.geometry.length && b.geometry.length && dist2(a.geometry[0], b.geometry[0]) < 1.5, sameEnd = dist2(a.geometry[a.geometry.length - 1], b.geometry[b.geometry.length - 1]) < 1.5;
  if (d > 2 && (sameStart || sameEnd || dist2(a.geometry[0], b.geometry[b.geometry.length - 1]) < 1.5)) return `extended +${d} blk`;
  if (d < -2 && (sameStart || sameEnd)) return `cut back ${d} blk`;
  return Math.abs(d) <= 2 ? 'reshaped' : `rerouted ${d > 0 ? '+' : ''}${d} blk`;
}
/* events for playback: opened, extended/rerouted, removed, rebuilt — derived from the periods */
function shapeEvents(o, kindPrefix = 'road') {
  const ps = shapePeriods(o).filter(p => p.from != null); const out = [];
  ps.forEach((p, i) => { const prev = ps[i - 1]; if (!prev) out.push({ at: p.from, kind: `${kindPrefix}-opened`, o }); else if (prev.to != null && prev.to < p.from) { out.push({ at: prev.to, kind: `${kindPrefix}-removed`, o }); out.push({ at: p.from, kind: `${kindPrefix}-rebuilt`, o, note: shapeChange(prev, p) }); } else out.push({ at: p.from, kind: `${kindPrefix}-reshaped`, o, note: shapeChange(prev, p) }); });
  const last = ps[ps.length - 1]; if (last && last.to != null) out.push({ at: last.to, kind: `${kindPrefix}-removed`, o });
  return out;
}
/* draw a polyline only up to a fraction of its length (growth animation); fromEnd grows from the last point backwards */
function clipPath(pts, frac, fromEnd = false) {
  if (frac >= 1 || pts.length < 2) return pts; if (frac <= 0) return [pts[fromEnd ? pts.length - 1 : 0]];
  const P = fromEnd ? pts.slice().reverse() : pts; const total = polyLength(P); let want = total * frac; const out = [P[0]];
  for (let i = 1; i < P.length; i++) { const l = dist2(P[i - 1], P[i]); if (l >= want) { const t = l ? want / l : 0; out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t]); break; } out.push(P[i]); want -= l; }
  return fromEnd ? out.reverse() : out;
}
/* the geometry to draw while the playhead crosses a change: fx = { from, to, t } (t 0→1 over a fixed short time, set when
   the playhead moves forward across a half-year boundary). New shapes grow in from where the old one ended; removed ones fade. */
function animatedGeometry(o, hy, fx) {
  const G = geometryAt(o, hy); const inWin = i => fx && i != null && i > fx.from && i <= fx.to;
  if (G.state !== 'open') { if (fx) { const prev = geometryAt(o, fx.from); if (prev.state === 'open') return { geometry: prev.geometry, width: prev.width, alpha: 1 - fx.t, state: 'leaving' }; } return { ...G, alpha: 0 }; }
  const p = G.period; if (!p || !inWin(p.from)) return { ...G, alpha: 1 };
  const t = easeOut(fx.t); const before = geometryAt(o, p.from - 1);
  if (before.state !== 'open') return { ...G, geometry: clipPath(p.geometry, t), alpha: 1, growing: true };
  const a = before.geometry, b = p.geometry; const la = polyLength(a), lb = polyLength(b);
  if (lb > la && dist2(a[0], b[0]) < 1.5) return { ...G, geometry: clipPath(b, (la + (lb - la) * t) / lb), alpha: 1, growing: true };
  if (lb > la && dist2(a[a.length - 1], b[b.length - 1]) < 1.5) return { ...G, geometry: clipPath(b, (la + (lb - la) * t) / lb, true), alpha: 1, growing: true };
  return { ...G, alpha: 1, ghost: { geometry: a, alpha: 1 - t } };
}

/* ---- the time you are in: one date for the map (explore and edit) and for every new record ----
   An expandable clock button on the map holds a slider from Early 2013 to today. Sliding back shows the city as it
   was (dated shapes, buildings standing then, the old maps for that date); everything stays editable, and new
   buildings, roads, lines, stations, businesses and chronicle entries take that date. Session only — a reload is today. */
MAPW.when = null; MAPW.timeOpen = false;
const mapWhen = () => MAPW.when;
const presentIdx = () => hyIndex(CURRENT_YEAR, CURRENT_HALF);
const travelDate = () => MAPW.when == null ? null : hyFromIndex(MAPW.when);
function setMapWhen(idx, { fromSlider = false } = {}) {
  MAPW.when = idx == null || idx >= presentIdx() ? null : clamp(Math.round(idx), 0, presentIdx() - 1);
  if (MAPW.sel?.vertex != null) MAPW.sel = { kind: MAPW.sel.kind, id: MAPW.sel.id };
  if (fromSlider) paintTimeWidget(); else renderTimeWidget();
  $('#mapstage')?.classList.toggle('dated', MAPW.when != null); renderWhenChip();
  if (UI.nav === 'map') { if (MAPW.edit) { renderDock(); refreshTools(); } else renderPlaceCard?.(); mapDraw(); }
}
const timeLabel = () => MAPW.when == null ? 'Today' : hyLabel(hyFromIndex(MAPW.when).year, hyFromIndex(MAPW.when).half);
function timeWidgetHTML() {
  const w = MAPW.when, p = presentIdx(); const ys = []; for (let y = FOUNDED_YEAR; y <= CURRENT_YEAR; y++) ys.push(y);
  const step = ys.length > 9 ? 2 : 1;
  return `<div class="tw ${MAPW.timeOpen ? 'open' : ''} ${w != null ? 'past' : ''}" id="map-time">
    <div class="tw-panel" ${MAPW.timeOpen ? '' : 'hidden'}>
      <div class="tw-top"><span class="k">GO BACK IN TIME</span><b id="tw-label">${esc(timeLabel())}</b></div>
      <div class="tw-row"><button data-act="map-when-step" data-dir="-1" title="Half a year earlier ([)">‹</button><input type="range" id="tw-range" min="0" max="${p}" step="1" value="${w ?? p}" aria-label="Date on the map"><button data-act="map-when-step" data-dir="1" title="Half a year later (])">›</button></div>
      <div class="tw-years">${ys.map(y => `<span style="left:${((hyIndex(y, 'E')) / Math.max(1, p) * 100).toFixed(2)}%">${(y - FOUNDED_YEAR) % step ? '' : `'${String(y).slice(2)}`}</span>`).join('')}</div>
      <div class="tw-foot" id="tw-note">${w != null ? `The city as it was. Everything stays editable; new buildings, roads, lines, stations, businesses and chronicle entries get <b>${esc(timeLabel())}</b>.` : 'Slide back to see the city as it was and edit it there. New records follow the date you pick.'}</div>
      <div class="tw-acts"><button class="btn sm" data-act="map-when-clear" ${w == null ? 'disabled' : ''}>Back to today</button></div>
    </div>
    <button class="tw-btn" data-act="tw-toggle" aria-expanded="${MAPW.timeOpen}" title="Go back in time — see and edit the city as it was ([ ] steps half a year)">${icon('clock')}<span id="tw-btn-l">${esc(timeLabel())}</span><span class="chv">${icon('up')}</span></button>
  </div>`;
}
function renderTimeWidget() { const el = $('#map-time'); if (!el) return; el.outerHTML = timeWidgetHTML(); wireTimeWidget(); }
function paintTimeWidget() { const el = $('#map-time'); if (!el) return; el.classList.toggle('past', MAPW.when != null); const l = $('#tw-label'); if (l) l.textContent = timeLabel(); const b = $('#tw-btn-l'); if (b) b.textContent = timeLabel(); const n = $('#tw-note'); if (n) n.innerHTML = MAPW.when != null ? `The city as it was. Everything stays editable; new buildings, roads, lines, stations, businesses and chronicle entries get <b>${esc(timeLabel())}</b>.` : 'Slide back to see the city as it was and edit it there. New records follow the date you pick.'; const c = $('#map-time [data-act="map-when-clear"]'); if (c) c.disabled = MAPW.when == null; }
function wireTimeWidget() {
  const r = $('#tw-range'); if (!r) return; let raf = 0;
  r.addEventListener('input', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setMapWhen(+r.value, { fromSlider: true })); });
  r.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === '[' || e.key === ']') { e.preventDefault(); setMapWhen((MAPW.when ?? presentIdx()) + (e.key === ']' ? 1 : -1), { fromSlider: true }); r.value = MAPW.when ?? presentIdx(); } else if (e.key === 'Escape') { e.preventDefault(); toggleTimeWidget(false); } });   // the slider keeps the focus after opening, so [ ] and Esc work there (painted in place so the focus stays)
}
function toggleTimeWidget(open = !MAPW.timeOpen) { MAPW.timeOpen = open; renderTimeWidget(); if (open) $('#tw-range')?.focus({ preventScroll: true }); }
/* outside the map the date is still in force: a chip in the status bar says so and goes back to today */
function renderWhenChip() { const el = $('#st-when'); if (!el) return; el.hidden = MAPW.when == null; if (MAPW.when != null) el.innerHTML = `<button data-act="map-when-clear" title="New records take this date — click to go back to today">${icon('clock')} ${esc(timeLabel())}<span class="xl"> · new records use this date</span> · today ✕</button>`; }
/* the shape to edit for a road / track at the viewing date (null when nothing stands then) */
function editableShape(o, kind) {
  const w = mapWhen(); if (w == null) return { pts: o.geometry, target: { kind, id: o.id }, label: '' };
  const { state, period } = shapeStateAt(o, w); if (state !== 'open' && !(state === 'undated' && period)) return null;
  if (!period || period.current) return { pts: o.geometry, target: { kind, id: o.id }, label: 'current shape' };
  return { pts: period.v.geometry, target: { kind: 'shape', id: o.id, owner: kind, vid: period.v.id }, label: `${hyShortText(period.from)} – ${hyShortText(period.to)}` };
}
const roadGeomNow = r => { const w = mapWhen(); if (w == null) return r.geometry; const g = geometryAt(r, w); return g.state === 'open' || g.state === 'undated' ? g.geometry : []; };
const trackGeomNow = t => roadGeomNow(t);
/* stamp a record drawn while viewing a past date */
function stampWhen(o, yk = 'yearOpened', hk = 'halfOpened') { const t = travelDate(); if (!t) return; if (o[yk] == null) { o[yk] = t.year; o[hk] = t.half; } }
const stampedPreset = (preset, yk = 'yearOpened', hk = 'halfOpened') => { const t = travelDate(); return t && preset[yk] == null ? { [yk]: t.year, [hk]: t.half, ...preset } : preset; };

/* ---- the timeline in the inspector and the records ---- */
function shapeTimelineHTML(o, kind, { editable = true, owner = null } = {}) {
  const ps = shapePeriods(o); const span0 = 0, span1 = Math.max(hyIndex(CURRENT_YEAR, 'L') + 1, ...ps.map(p => (p.to ?? 0))); const W = Math.max(1, span1 - span0);
  const w = mapWhen(); const pal = ['#7FB2FF', '#B99CFF', '#39D98A', '#FFD166', '#4FE3FF', '#FF7A59'];
  const bar = ps.map((p, i) => { if (p.from == null) return `<span class="seg undated" style="left:0;width:100%" title="undated shape"></span>`; const a = (p.from - span0) / W * 100, b = ((p.to ?? span1) - span0) / W * 100; return `<span class="seg ${p.current ? 'cur' : ''}" style="left:${a.toFixed(2)}%;width:${Math.max(0.8, b - a).toFixed(2)}%;--c:${pal[i % pal.length]}" title="${esc(hyText(p.from))} – ${p.to != null ? esc(hyText(p.to)) : 'today'} · ${fmtInt(polyLength(p.geometry))} blk"></span>`; }).join('');
  const years = []; for (let y = FOUNDED_YEAR; y <= hyFromIndex(span1 - 1).year; y += Math.max(1, Math.ceil((hyFromIndex(span1 - 1).year - FOUNDED_YEAR) / 7))) years.push(`<span style="left:${((hyIndex(y, 'E') - span0) / W * 100).toFixed(2)}%">${y}</span>`);
  const nowMark = w != null ? `<i class="now" style="left:${((w - span0 + 0.5) / W * 100).toFixed(2)}%" title="map date ${esc(hyText(w))}"></i>` : '';
  const rows = ps.slice().reverse().map((p, ri) => { const i = ps.length - 1 - ri; const prev = ps[i - 1]; const gap = prev && prev.to != null && p.from != null && prev.to < p.from; const ch = prev ? shapeChange(prev, p) : 'first shape';
    const editing = MAPW.shapeEdit && MAPW.shapeEdit.id === o.id && MAPW.shapeEdit.pid === p.id;
    return `${gap ? `<div class="pgap">removed ${esc(hyShortText(prev.to))} → rebuilt ${esc(hyShortText(p.from))}</div>` : ''}<div class="per ${p.current ? 'cur' : ''} ${editing ? 'editing' : ''}" style="--c:${pal[i % pal.length]}">
      <i class="sw"></i><div class="d">${editable ? `<span class="hyin"><select data-per-h="from" data-pid="${esc(p.id)}">${['E', 'L'].map(h => `<option value="${h}" ${p.from != null && hyFromIndex(p.from).half === h ? 'selected' : ''}>${h}</option>`).join('')}</select><input type="number" data-per-y="from" data-pid="${esc(p.id)}" value="${p.from != null ? hyFromIndex(p.from).year : ''}" placeholder="from" min="1990" max="2200"></span><span class="to">–</span><span class="hyin"><select data-per-h="to" data-pid="${esc(p.id)}">${['E', 'L'].map(h => `<option value="${h}" ${p.to != null && hyFromIndex(p.to).half === h ? 'selected' : ''}>${h}</option>`).join('')}</select><input type="number" data-per-y="to" data-pid="${esc(p.id)}" value="${p.to != null && (p.current || p.v?.toYear != null) ? hyFromIndex(p.to).year : ''}" placeholder="${p.current ? 'today' : esc(hyShortText(p.to))}" min="1990" max="2200"></span>` : `<b>${esc(hyShortText(p.from))}</b> – <b>${p.to != null ? esc(hyShortText(p.to)) : 'today'}</b>`}</div>
      <div class="m">${fmtInt(polyLength(p.geometry))} blk · ${esc(ch)}${p.current ? ' · <b>CURRENT</b>' : ''}</div>
      ${editable ? `<div class="a"><button class="btn sm ghost" data-act="per-edit" data-kind="${kind}" data-id="${esc(o.id)}" data-pid="${esc(p.id)}" title="Show and edit this shape on the map">${icon('edit')}</button><button class="btn sm ghost" data-act="per-remove" data-kind="${kind}" data-id="${esc(o.id)}" data-pid="${esc(p.id)}" title="${p.current ? 'Drop the current shape: the latest dated shape becomes current' : 'Remove this dated shape'}">${icon('x')}</button></div>` : ''}
    </div>`; }).join('');
  const closed = hyOf(o.yearClosed, o.halfClosed);
  return `<div class="shapetl" data-owner="${esc(owner || kind)}" data-oid="${esc(o.id)}">
    <div class="bar">${bar}${nowMark}</div><div class="yrs">${years.join('')}</div>
    <div class="pers">${rows}</div>
    ${editable ? `<div class="acts"><button class="btn sm" data-act="per-split" data-kind="${kind}" data-id="${esc(o.id)}" title="The shape in force on that date ends there; a copy starts, ready to redraw">${icon('plus')} New shape from…</button>${closed == null ? `<button class="btn sm" data-act="per-close" data-kind="${kind}" data-id="${esc(o.id)}" title="Date when it was demolished / taken out of service">${icon('x')} Removed in…</button>` : `<button class="btn sm" data-act="per-rebuild" data-kind="${kind}" data-id="${esc(o.id)}" title="It came back later: keep the old shape dated, start a new one">${icon('redo')} Rebuilt in…</button>`}</div>
    <div class="desc-line">Each shape has its own dates. Leave an end blank to run until the next shape; an end before the next start leaves a gap — removed, then rebuilt. Playback draws exactly this, growing extensions in.</div>` : ''}
  </div>`;
}
function shapeOwner(kind, id) { return kind === 'road' ? roadById(id) : trackById(id); }
async function shapeTimelineAction(act, t) {
  const o = shapeOwner(t.dataset.kind, t.dataset.id); if (!o) return; const tgtKind = t.dataset.kind;
  const after = () => { if (tgtKind === 'road') JUNCTION_CACHE.key = ''; commit(); if (UI.nav === 'map') { renderDock(); mapDraw(); } if (DR.id) renderDrawer(); };
  if (act === 'per-edit') {
    const p = shapePeriods(o).find(x => x.id === t.dataset.pid); if (!p) return;
    closeDrawer?.(true); if (UI.nav !== 'map') setNav('map');   // the drawer would sit over the shape to drag
    const go = () => { if (!MAPW.edit) setMapEdit(true, { keepMode: true }); const mid = p.from != null ? (p.to != null ? Math.max(p.from, p.to - 1) : p.from) : null; MAPW.sel = { kind: tgtKind === 'road' ? 'road' : 'line', id: tgtKind === 'road' ? o.id : (linesOnTrack(o)[0]?.id || o.id) }; if (MAPW.sel.kind === 'line' && !lineById(MAPW.sel.id)) MAPW.sel = null; setMapWhen(p.current && p.to == null ? null : mid); setMapMode('select'); const ext = bboxOf(p.geometry); if (ext) mapFlyTo(ext); toast(`Editing the ${hyShortText(p.from)} – ${p.to != null ? hyShortText(p.to) : 'today'} shape · map date ${MAPW.when != null ? hyText(MAPW.when) : 'today'} — drag its vertices`, ''); };
    if (MAPW.mounted) go(); else setTimeout(go, 40); return;
  }
  if (act === 'per-remove') { const r = await confirmDialog({ title: t.dataset.pid === 'current' ? 'Drop the current shape?' : 'Remove this dated shape?', body: t.dataset.pid === 'current' ? '<p>The latest dated shape becomes the current one again.</p>' : '<p>The shape and its dates are removed from the history. Undo with ⌘/Ctrl+Z on the map.</p>', ok: 'Remove', danger: true }); if (r !== 'ok') return; mapPushUndo(); const res = shapeRemove(o, t.dataset.pid); if (!res.ok) { MAPW.undo.pop(); toast(res.why, 'warn'); return; } after(); toast('Shape removed', 'good'); return; }
  const w = mapWhen(); const dflt = w != null ? hyFromIndex(w) : { year: CURRENT_YEAR, half: CURRENT_HALF };
  if (act === 'per-split') {
    const r = await hyPromptDialog({ title: `New shape for ${o.name || o.reg}`, kicker: 'DATED SHAPE', body: '<p>The shape in force on this date ends here and a copy starts — redraw the copy. Earlier years keep the old shape.</p>', ok: 'Start new shape', label: 'New shape starts', year: dflt.year, half: dflt.half }); if (!r || r.year == null) return;
    const idx = hyIndex(r.year, r.half || 'E'); mapPushUndo(); let res = shapeSplitAt(o, idx);   // the snapshot goes in before the shape changes, so Undo brings it back
    if (!res.ok && /Give the date/.test(res.why)) { const f = await hyPromptDialog({ title: 'When did the earlier shape start?', kicker: 'DATED SHAPE', body: `<p>${esc(o.name || o.reg)} has no opening date yet.</p>`, ok: 'Use this date', label: 'Earlier shape started', year: FOUNDED_YEAR, half: 'E' }); if (!f || f.year == null) { MAPW.undo.pop(); return; } res = shapeSplitAt(o, idx, { firstFrom: hyIndex(f.year, f.half || 'E') }); }
    if (!res.ok) { MAPW.undo.pop(); toast(res.why, 'warn'); return; } after(); toast(`New shape from ${hyLabel(r.year, r.half || 'E')} — drag its vertices; earlier years keep the old shape`, 'good');
    if (UI.nav === 'map') { setMapWhen(idx); } return;
  }
  if (act === 'per-close') { const cur = shapePeriods(o).find(p => p.current); const d2 = cur?.from != null && hyIndex(dflt.year, dflt.half || 'E') <= cur.from ? hyFromIndex(cur.from + 1) : dflt;   // never offer a date the check below refuses
    const r = await hyPromptDialog({ title: `When was ${o.name || o.reg} removed?`, kicker: 'REMOVED', body: '<p>From this half-year it no longer appears in playback. Nothing is deleted; it can be rebuilt later.</p>', ok: 'Date the removal', label: 'Removed in', year: d2.year, half: d2.half }); if (!r || r.year == null) return; const idx = hyIndex(r.year, r.half || 'E'); if (cur?.from != null && idx <= cur.from) { toast('The removal must come after the current shape started', 'warn'); return; } mapPushUndo(); o.yearClosed = r.year; o.halfClosed = r.half || ''; o.updated = now(); after(); toast(`Removed from ${hyLabel(r.year, r.half)} — still on file`, 'good'); return; }
  if (act === 'per-rebuild') { const r = await hyPromptDialog({ title: `When was ${o.name || o.reg} rebuilt?`, kicker: 'REBUILT', body: '<p>The old shape keeps its dates; a new current shape starts here — redraw it.</p>', ok: 'Start rebuilt shape', label: 'Rebuilt in', year: dflt.year, half: dflt.half }); if (!r || r.year == null) return; const idx = hyIndex(r.year, r.half || 'E'); mapPushUndo(); const res = shapeRebuildAt(o, idx); if (!res.ok) { MAPW.undo.pop(); toast(res.why, 'warn'); return; } after(); toast(`Rebuilt from ${hyLabel(r.year, r.half || 'E')}`, 'good'); return; }
}
/* date edits typed into the timeline */
function wireShapeTimelines(root) {
  $$('.shapetl', root).forEach(tl => {
    const o = shapeOwner(tl.dataset.owner === 'track' ? 'track' : tl.dataset.owner, tl.dataset.oid) || roadById(tl.dataset.oid) || trackById(tl.dataset.oid); if (!o) return;
    const read = pid => { const g = (which, k) => tl.querySelector(`[data-per-${k}="${which}"][data-pid="${CSS.escape(pid)}"]`)?.value; const fy = num(g('from', 'y')), ty = num(g('to', 'y')); return { from: fy != null ? hyIndex(fy, g('from', 'h') || 'E') : null, to: ty != null ? hyIndex(ty, g('to', 'h') || 'E') : null }; };
    $$('[data-per-y], [data-per-h]', tl).forEach(inp => inp.addEventListener('change', () => { const pid = inp.dataset.pid; const { from, to } = read(pid); if (inp.dataset.perH && (inp.dataset.perH === 'from' ? from : to) == null) return; if (UI.nav === 'map') mapPushUndo(); const res = shapeSetDates(o, pid, from, to); if (!res.ok) { if (UI.nav === 'map') MAPW.undo.pop(); toast(res.why, 'warn'); } else { JUNCTION_CACHE.key = ''; commit(); toast('Dates saved', 'good'); } if (UI.nav === 'map') { renderDock(); mapDraw(); } if (DR.id) renderDrawer(); }));
    $$('[data-per-y]', tl).forEach(inp => inp.addEventListener('keydown', e => e.stopPropagation()));
  });
}
/* after a road / track is removed (or between shapes): the last shape, fading out like a building's ghost */
function shapeRemnant(o, hy, pos, L) {
  if (!L?.historical) return null; const ps = shapePeriods(o).filter(p => p.to != null && p.to <= hy); if (!ps.length) return null;
  const last = ps.reduce((a, p) => p.to > a.to ? p : a); const g = ghostAlpha((pos ?? hy) - last.to, !!L.ghostsAll) * .4; return g > .02 ? { geometry: last.geometry, alpha: g } : null;
}
