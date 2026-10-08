/* =====================================================================
   §27 TRANSIT 2 — status at a date, service hours, lines drawn with their
       stops, stations that attach themselves to every line on the track,
       transfers, departure board (simulated), projects and cost estimates.
       Simulated figures are always labelled as simulated.
   ===================================================================== */
const lineWidthPx = (l, k) => clamp((num(l.width) || 4) * 1.6 * Math.pow(k, 0.35), 4, 18);
/* a line at half-year hy: 'open' | 'construction' | 'future' | 'closed' | 'undated' (undated lines borrow their tracks' dates) */
function lineStateAt(l, hy) {
  const st = serviceStateAt(l, hy);
  if (st === 'future') { const si = hyOf(l.yearStarted, l.halfStarted); return si != null && si <= hy ? 'construction' : 'future'; }
  if (st === 'undated') {
    const si = hyOf(l.yearStarted, l.halfStarted); const ts = lineTracks(l).map(t => shapeStateAt(t, hy).state);
    if (ts.includes('open')) return 'open'; if (si != null && si <= hy) return 'construction'; if (ts.length && ts.every(s => s === 'future')) return 'future'; if (ts.length && ts.every(s => s === 'closed' || s === 'gap' || s === 'future') && ts.some(s => s !== 'future')) return 'closed'; return 'undated';
  }
  return st;
}
/* a station at hy: dates first; an undated station follows its lines */
function stationStateAt(s, hy) {
  const st = serviceStateAt(s, hy);
  if (st === 'future') { const si = hyOf(s.yearStarted, s.halfStarted); return si != null && si <= hy ? 'construction' : 'future'; }
  if (st === 'undated') { const si = hyOf(s.yearStarted, s.halfStarted); const ls = linesAtStation(s).map(l => lineStateAt(l, hy)); if (ls.includes('open')) return s.status === 'partial' ? 'partial' : 'open'; if (si != null && si <= hy) return 'construction'; if (ls.includes('construction')) return 'construction'; if (ls.length && ls.every(x => x === 'future')) return 'future'; return 'undated'; }
  if (st === 'open' && s.status === 'partial') return 'partial';
  return st;
}
/* today's status: the record's own status, but a station on no open line is not "open" in practice */
function stationStatusNow(s) { return s.status || 'open'; }
/* service hours: the station's own setting, else the widest of its open lines */
const HOURS_RANK = { '24/7': 4, '': 3, day: 2, custom: 1, peak: 0 };
function stationHours(s) { if (s.hours) return s.hours; const ls = linesAtStation(s).filter(l => ['open', 'partial'].includes(l.status)); if (!ls.length) return ''; return ls.map(l => l.hours || '').sort((a, b) => (HOURS_RANK[b] ?? 0) - (HOURS_RANK[a] ?? 0))[0]; }
/* open windows in hours [from, to) on a 24 h clock (to may exceed 24 = past midnight) */
function hoursWindows(h, o = {}) { if (h === '24/7') return [[0, 24]]; if (h === 'day') return [[6, 24]]; if (h === 'peak') return [[6, 10], [16, 20]]; if (h === 'custom' && num(o.hoursFrom) != null && num(o.hoursTo) != null) { const a = num(o.hoursFrom), b = num(o.hoursTo); return b > a ? [[a, b]] : [[a, 24], [0, b]]; } return [[5, 24], [0, 1]]; }
const hoursPerDay = (h, o) => hoursWindows(h, o).reduce((a, [x, y]) => a + (y - x), 0);
function inService(h, o, hourFloat) { return hoursWindows(h, o).some(([a, b]) => hourFloat >= a && hourFloat < b); }
const hoursLabel = (h, o = {}) => h === 'custom' && num(o.hoursFrom) != null ? `${String(o.hoursFrom).padStart(2, '0')}:00–${String(o.hoursTo).padStart(2, '0')}:00` : (SERVICE_HOURS.find(x => x[0] === (h || ''))?.[1] || 'Regular hours').split(' (')[0].split(' — ')[0];

/* ---- stops in order: every stop is placed by where it sits along the line's tracks ---- */
function stopAlong(l, s) {
  if (s.x == null) return null; let acc = 0, best = null;
  for (const t of lineTracks(l)) { const g = t.geometry || []; if (g.length >= 2) { const p = arcPosition([s.x, s.z], g); if (p && (!best || p.d < best.d)) best = { d: p.d, along: acc + p.along }; acc += polyLength(g); } }
  return best && best.d <= 40 ? best.along : null;
}
/* re-order a line's stops along its tracks; stops that cannot be placed keep their place relative to their neighbours; the first stop stays first */
function sortStopsAlong(l) {
  const ids = (l.stopIds || []).slice(); const pos = ids.map(id => { const s = stationById(id); return s ? stopAlong(l, s) : null; });
  if (pos.filter(x => x != null).length < 2) return false;
  let last = -Infinity; const keyed = ids.map((id, i) => { if (pos[i] != null) last = pos[i]; return { id, k: pos[i] ?? last + 1e-6 * i }; });
  const sorted = keyed.slice().sort((a, b) => a.k - b.k).map(x => x.id);
  if (ids.length > 1 && sorted[sorted.length - 1] === ids[0] && sorted[0] !== ids[0]) sorted.reverse();
  const changed = sorted.join() !== ids.join(); l.stopIds = sorted; return changed;
}
/* add a station to a line at the right place along the track (never just appended to the end) */
function addStopOrdered(l, sid) { if ((l.stopIds || []).includes(sid)) return false; l.stopIds = [...(l.stopIds || []), sid]; sortStopsAlong(l); l.updated = now(); return true; }
/* the lines whose drawn track (or bus road) passes within tol blocks of a point */
function linesNear(pt, tol) { const out = []; for (const l of S.lines) { let d = Infinity; for (const g of lineGeometries(l)) { const c = polylineClosest(pt, g); if (c && c.d < d) d = c.d; } if (d <= tol) out.push({ l, d }); } return out.sort((a, b) => a.d - b.d); }
const stationAtPoint = (pt, tol = 0.6) => S.stations.find(s => s.x != null && dist2([s.x, s.z], pt) <= tol);
function stationStatusFor(lines) { if (lines.some(l => l.status === 'open')) return 'open'; if (lines.some(l => l.status === 'partial')) return 'partial'; if (lines.some(l => l.status === 'construction')) return 'construction'; if (lines.some(l => l.status === 'planned')) return 'planned'; return 'open'; }
function newStationAt(p, lines = []) { const s = newStation(S); s.x = p[0]; s.z = p[1]; s.name = ''; s.districtId = placeSuggest(s.x, s.z).districts[0]?.d.id || null; s.status = stationStatusFor(lines); stampWhen(s); S.stations.push(s); return s; }
function linkTransfer(a, b) { if (!a || !b || a.id === b.id) return; a.transferIds = [...new Set([...(a.transferIds || []), b.id])]; b.transferIds = [...new Set([...(b.transferIds || []), a.id])]; a.updated = b.updated = now(); }
function unlinkTransfer(a, b) { if (!a || !b) return; a.transferIds = (a.transferIds || []).filter(x => x !== b.id); b.transferIds = (b.transferIds || []).filter(x => x !== a.id); a.updated = b.updated = now(); }
/* every station reachable on foot as part of the same complex (shared stop or transfer link) */
function transferGroup(s) { const seen = new Set([s.id]); const q = [s]; while (q.length) { const x = q.shift(); for (const id of x.transferIds || []) if (!seen.has(id)) { seen.add(id); const y = stationById(id); if (y) q.push(y); } } return [...seen].map(stationById).filter(Boolean); }
const linesAtComplex = s => [...new Map(transferGroup(s).flatMap(linesAtStation).map(l => [l.id, l])).values()];

/* ---- drawing a line with its stops ---- */
MAPW.stopMode = false;
function transitDraftStop(raw, snap, e) {
  const d = MAPW.draft; if (!d || d.forKind !== 'transit') return; d.stops ??= [];
  const i = d.pts.length - 1; const at = d.pts[i]; const existing = snap?.snapped === 'station' ? stationAtPoint(at, 1) : null;
  if (existing) { if (!d.stops.some(x => x.sid === existing.id)) d.stops.push({ i, sid: existing.id }); return; }
  if (MAPW.stopMode || e?.altKey) d.stops.push({ i, sid: null });
}
function toggleDraftStop(i) { const d = MAPW.draft; if (!d) return; d.stops ??= []; const k = d.stops.findIndex(x => x.i === i); if (k >= 0) d.stops.splice(k, 1); else d.stops.push({ i, sid: null }); renderMapInstr(); mapDraw(); }
function finishTransitDraft(d) {
  mapPushUndo();
  const editingLine = d.lineId ? lineById(d.lineId) : MAPW.sel?.kind === 'line' ? lineById(MAPW.sel.id) : null;
  let l = editingLine, t;
  if (d.extend) { t = trackById(d.extend.id); if (!t) return; const e = editableShape(t, 'track'); const arr = e?.target.kind === 'shape' ? geomArray(e.target, 0) : t.geometry; const next = d.prepend ? [...d.pts.slice(1).reverse(), ...arr] : [...arr, ...d.pts.slice(1)]; arr.splice(0, arr.length, ...next); t.updated = now(); }
  else {
    t = newTrack(S, l?.mode || 'subway'); t.geometry = d.pts.slice(); S.tracks.push(t);
    if (l) { l.trackIds = [...l.trackIds, t.id]; t.name = `${lineLabel(l)} track ${l.trackIds.length}`; t.mode = l.mode; }
    else { l = newLine(S); l.trackIds = [t.id]; l.name = ''; t.name = `${l.reg} track`; stampWhen(l); S.lines.push(l); }
    if (mapWhen() != null && editingLine) stampWhen(t);
  }
  // stops: clicked existing stations, new stops, and stations already sitting on the new alignment
  const offset = d.extend ? 0 : 0; let created = 0, joined = 0; const touched = [];
  for (const st of (d.stops || []).slice().sort((a, b) => a.i - b.i)) {
    const p = d.pts[st.i + offset]; if (!p) continue; let s = st.sid ? stationById(st.sid) : null;
    if (!s) { s = stationAtPoint(p, 1) || newStationAt(p, [l]); if (!st.sid) created++; }
    if (!l.stopIds.includes(s.id)) { l.stopIds = [...l.stopIds, s.id]; if (linesAtStation(s).length > 1) joined++; } touched.push(s);
  }
  const onTrack = S.stations.filter(s => s.x != null && !l.stopIds.includes(s.id) && (() => { const c = polylineClosest([s.x, s.z], d.pts); return c && c.d <= 3; })());
  for (const s of onTrack) { l.stopIds = [...l.stopIds, s.id]; joined++; }
  sortStopsAlong(l); l.updated = now();
  const near = S.stations.filter(s => s.x != null && !l.stopIds.includes(s.id) && (() => { const c = polylineClosest([s.x, s.z], d.pts); return c && c.d > 3 && c.d <= 14; })());
  MAPW.draft = null; MAPW.sel = { kind: 'line', id: l.id }; setMapMode('select'); commit(); renderDock(); refreshTools(); mapDraw();
  const bits = [`${d.extend ? 'Extended' : editingLine ? 'Track added to' : 'Drew'} ${lineLabel(l)} · ${fmtInt(polyLength(d.pts))} blk`]; if (created) bits.push(`${created} new stop${created === 1 ? '' : 's'}`); if (joined) bits.push(`${joined} existing station${joined === 1 ? '' : 's'} joined${S.lines.length > 1 ? ' (transfers)' : ''}`);
  toast(bits.join(' · ') + (l.name ? '' : ' — name the line and its stops in the inspector'), 'good', near.length ? { label: `ADD ${near.length} NEARBY`, fn: () => { mapPushUndo(); for (const s of near) l.stopIds = [...l.stopIds, s.id]; sortStopsAlong(l); l.updated = now(); commit(); renderDock(); mapDraw(); toast(`${near.length} nearby station${near.length === 1 ? '' : 's'} added as stops`, 'good'); } } : null);
  if (!l.name) setTimeout(() => $('#insp-name')?.focus(), 60);
}
/* station mode: on a track → a stop of every line there (a transfer when there are several); on an existing station → join the selected line */
function placeStationSmart(raw) {
  const { p: sp, snapped } = snapPoint(raw); const p = roundPt(sp); const sel = MAPW.sel?.kind === 'line' ? lineById(MAPW.sel.id) : null;
  const existing = stationAtPoint(p, Math.max(1, 6 / MAPW.cam.k)) || (snapped === 'station' ? stationAtPoint(p, 1) : null);
  if (existing) {
    if (sel && !sel.stopIds.includes(existing.id)) { mapPushUndo(); addStopOrdered(sel, existing.id); commit(); MAPW.sel = { kind: 'line', id: sel.id }; renderDock(); mapDraw(); toast(`${existing.name || existing.reg} is now a stop of ${lineLabel(sel)}${linesAtStation(existing).length > 1 ? ' — transfer with ' + linesAtStation(existing).filter(x => x.id !== sel.id).map(lineLabel).join(', ') : ''}`, 'good'); return; }
    MAPW.sel = { kind: 'station', id: existing.id }; setMapMode('select'); renderDock(); mapDraw(); toast(`${existing.name || existing.reg} is already here — selected`, ''); return;
  }
  const tol = Math.max(4, 10 / MAPW.cam.k); const lines = [...new Map([...(sel ? [{ l: sel }] : []), ...linesNear(p, tol)].map(x => [x.l.id, x.l])).values()];
  mapPushUndo(); const s = newStationAt(p, lines); for (const l of lines) addStopOrdered(l, s.id);
  commit(); MAPW.sel = sel ? { kind: 'line', id: sel.id } : { kind: 'station', id: s.id }; if (!sel) setMapMode('select'); renderDock(); refreshTools(); mapDraw();
  toast(`${s.reg} placed${lines.length ? ` on ${lines.map(lineLabel).join(' · ')}${lines.length > 1 ? ' — a transfer' : ''}` : ' — not on any line yet (click it with a line selected, or draw a line through it)'}${sel ? ' · keep clicking to add more stops' : ''}`, 'good');
  if (!sel) setTimeout(() => $('#insp-name')?.focus(), 60);
}

/* ---- inspectors ---- */
const statusChip = st => { const s = LINE_STATUS[st] || LINE_STATUS.open; return `<span class="mk ${s.tone === 'good' ? 'good' : s.tone === 'warn' ? 'warn' : s.tone === 'bad' ? 'bad' : s.tone === 'info' ? 'info' : 'muted'}">${esc(s.label).toUpperCase()}</span>`; };
const hyMini = (id, y, h) => `<div class="hy dock-hy"><select id="f-${id}-h" title="Half of the year">${HALVES.map(x => `<option value="${x.id}" ${(h || '') === x.id ? 'selected' : ''}>${x.short || '—'}</option>`).join('')}</select><input id="f-${id}-y" type="number" value="${esc(y ?? '')}" placeholder="year" min="1990" max="2200"></div>`;
function lineInspectorHTML(l, sel) {
  const stops = stationsOf(l); const svc = lineService(l);
  return `<div class="dock-hd" style="--c:${esc(l.color)}"><div><div class="kind">${esc(l.reg)} · ${esc(MODE_LABEL[l.mode] || l.mode).toUpperCase()}</div><div class="f" style="margin-top:4px"><input id="insp-name" value="${esc(l.name)}" placeholder="Name this line…" style="font-size:16px;font-weight:600;height:36px"></div><div class="sub">${esc(LINE_STATUS[l.status]?.label || l.status)} · ${esc(hoursLabel(l.hours, l))} · ${stops.length} stops · ${fmtInt(lineLength(l))} blk · every ${svc.headwayMin} min</div></div><div class="acts"><button class="btn sm icon" data-act="insp-open" title="Open the full record">${icon('expand')}</button></div></div>
    <div class="frow c3" style="margin-top:10px"><div class="f"><label>Short</label>${inpF('insp-short', l.shortName, 'maxlength="6"')}</div><div class="f"><label>Mode</label>${selF('insp-mode', TRANSIT_MODES, l.mode)}</div><div class="f"><label>Status</label>${selF('insp-status', LINE_STATUSES.map(([id, lb]) => [id, lb]), l.status)}</div></div>
    <div class="frow c3" style="margin-top:8px"><div class="f"><label>Service hours</label>${selF('insp-hours', SERVICE_HOURS, l.hours || '')}</div><div class="f"><label>Width <span class="hint">map px</span></label>${numF('insp-width', l.width ?? 4, 'min="2" max="10" step="1"')}</div><div class="f"><label>Opened</label>${hyMini('insp-lopened', l.yearOpened, l.halfOpened)}</div></div>
    <div class="frow c3 hours-custom" style="margin-top:8px" ${l.hours === 'custom' ? '' : 'hidden'}><div class="f"><label>From (hour)</label>${numF('insp-hfrom', l.hoursFrom, 'min="0" max="24" step="1"')}</div><div class="f"><label>To (hour)</label>${numF('insp-hto', l.hoursTo, 'min="0" max="24" step="1"')}</div></div>
    <div class="f" style="margin-top:8px"><label>Colour <span class="hint">updates the map, legend, badges and dashboard</span></label><div class="swatchrow" id="insp-swatches">${TRANSIT_COLORS.map(c => `<button type="button" data-color="${c}" aria-pressed="${(l.color || '').toLowerCase() === c.toLowerCase()}" style="--c:${c}"></button>`).join('')}<input type="color" id="insp-color" value="${esc(/^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : TRANSIT_COLORS[0])}"></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm primary" data-act="insp-save-line">${icon('check')} Save</button><button class="btn sm" data-act="insp-station-mode" title="Click along the line to add stops in order (X)">${icon('station')} Add stops</button><button class="btn sm" data-act="insp-extend" data-end="end">${icon('draw')} Extend end</button><button class="btn sm" data-act="insp-extend" data-end="start">${icon('draw')} Extend start</button><button class="btn sm" data-act="insp-add-track">${icon('transit')} Add track</button><button class="btn sm danger" data-act="insp-delete">${icon('trash')}</button></div>
    <div class="secthead">STOPS <span class="muted" style="letter-spacing:0;font-weight:400">· ${stops.length} · type to rename</span>${stops.length > 1 ? `<span class="acts"><button class="btn sm ghost" data-act="line-sort-stops" data-id="${l.id}" title="Put the stops in order along the track">${icon('rows')} Order along track</button></span>` : ''}</div>
    ${stops.length ? `<div class="stoplist edit" style="--c:${esc(l.color)}">${stops.map((s, i) => { const others = linesAtComplex(s).filter(x => x.id !== l.id); const st = stationStatusNow(s); return `<div class="sp ${others.length ? 'x' : ''}"><span class="dot"></span><div><input class="stopname" data-stopname="${s.id}" value="${esc(s.name)}" placeholder="${esc(s.reg)} — name this stop"><div class="s">${st !== 'open' ? statusChip(st) + ' ' : ''}${others.map(lineBullet).join('')}${others.length ? ' transfer · ' : ''}<button class="rowlink" data-act="insp-select" data-kind="station" data-id="${s.id}" style="font:inherit">${s.x != null ? `X ${s.x} Z ${s.z}` : 'no coordinates'}</button></div></div><span class="mv"><button data-act="stop-move" data-line="${l.id}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button data-act="stop-move" data-line="${l.id}" data-i="${i}" data-dir="1" ${i === stops.length - 1 ? 'disabled' : ''}>${icon('down')}</button></span><button class="x2" data-act="stop-remove" data-line="${l.id}" data-id="${s.id}" title="Remove from this line (the station stays)">×</button></div>`; }).join('')}</div>` : `<div class="dock-empty">No stops yet — press <b>Add stops</b> and click along the line, or redraw with <kbd>Alt</kbd>-clicks.</div>`}
    ${lineTracks(l).length ? `<div class="secthead">ALIGNMENT HISTORY <span class="muted" style="letter-spacing:0;font-weight:400">· ${mapWhen() != null ? `map date ${esc(hyText(mapWhen()))}` : 'map date today'}</span></div>${lineTracks(l).map(t => `${lineTracks(l).length > 1 ? `<div class="desc-line" style="margin-top:6px">${esc(t.name || t.reg)}</div>` : ''}${shapeTimelineHTML(t, 'track')}`).join('')}` : ''}
    ${vertexEditorHTML(sel)}`;
}
function stationInspectorHTML(s) {
  const lines = linesAtStation(s); const near = S.stations.filter(o => o.id !== s.id && o.x != null && s.x != null && dist2([o.x, o.z], [s.x, s.z]) <= 80 && !(s.transferIds || []).includes(o.id)).sort((a, b) => dist2([a.x, a.z], [s.x, s.z]) - dist2([b.x, b.z], [s.x, s.z])).slice(0, 5);
  const xfers = (s.transferIds || []).map(stationById).filter(Boolean); const others = S.lines.filter(l => !l.stopIds.includes(s.id));
  return `<div class="dock-hd" style="--c:${esc(lines[0]?.color || 'var(--transit)')}"><div><div class="kind">${esc(s.reg)} · ${esc(STATION_KINDS.find(k => k[0] === s.kind)?.[1] || 'STATION').toUpperCase()}</div><div class="f" style="margin-top:4px"><input id="insp-name" value="${esc(s.name)}" placeholder="Name this station…" style="font-size:16px;font-weight:600;height:36px"></div><div class="sub">${s.x != null ? `X ${s.x} · Z ${s.z}` : 'no coordinates'} · ${esc(hoursLabel(stationHours(s), s.hours ? s : (lines[0] || {})))}${stationDistrict(s) ? ' · ' + esc(stationDistrict(s).name) : ''}</div></div><div class="acts"><button class="btn sm icon" data-act="insp-open" title="Open the full record">${icon('expand')}</button></div></div>
    <div class="secthead">LINES HERE <span class="muted" style="letter-spacing:0;font-weight:400">· ${lines.length || 'none yet'}</span></div>
    ${lines.length ? `<div class="rowlist">${lines.map(l => { const i = l.stopIds.indexOf(s.id); return `<div class="r"><div><div class="t">${lineBadge(l, 'sm')} ${esc(lineLabel(l))}</div><div class="s">stop ${i + 1} of ${l.stopIds.length}${l.stopIds[i - 1] ? ' · after ' + esc(stationById(l.stopIds[i - 1])?.name || stationById(l.stopIds[i - 1])?.reg || '') : ''}${l.stopIds[i + 1] ? ' · before ' + esc(stationById(l.stopIds[i + 1])?.name || stationById(l.stopIds[i + 1])?.reg || '') : ''}</div></div><button class="x" data-act="stop-remove" data-line="${l.id}" data-id="${s.id}" title="Take this station off ${esc(lineLabel(l))}">×</button></div>`; }).join('')}</div>` : `<div class="dock-empty">Not a stop of any line. Pick one below, or select a line and click this station in Station mode.</div>`}
    ${others.length ? `<div class="f" style="margin-top:8px"><label>Add to line <span class="hint">slots in at the right place along the track</span></label><select id="insp-addline"><option value="">—</option>${others.map(l => `<option value="${l.id}">${esc(lineLabel(l))}${stationDistanceToLine(s, l) != null ? ` · ${Math.round(stationDistanceToLine(s, l))} blk from its track` : ''}</option>`).join('')}</select></div>` : ''}
    <div class="secthead">TRANSFERS <span class="muted" style="letter-spacing:0;font-weight:400">· walking links to other stations</span></div>
    ${xfers.length ? `<div class="chips" style="margin:8px 0 0">${xfers.map(o => `<span class="rchip"><span class="k" data-act="insp-select" data-kind="station" data-id="${o.id}" role="button">${Math.round(dist2([o.x, o.z], [s.x, s.z]))} BLK</span><span class="t" data-act="insp-select" data-kind="station" data-id="${o.id}" role="button">${esc(o.name || o.reg)}</span><button class="x" data-act="xfer-unlink" data-a="${s.id}" data-b="${o.id}" title="Remove the transfer">×</button></span>`).join('')}</div>` : ''}
    ${near.length ? `<div class="rowlist" style="margin-top:6px">${near.map(o => `<div class="r"><div><div class="t">${esc(o.name || o.reg)}</div><div class="s">${Math.round(dist2([o.x, o.z], [s.x, s.z]))} blk · ${linesAtStation(o).map(l => esc(l.shortName || l.name || l.reg)).join(', ') || 'no line'}</div></div><button class="btn sm" data-act="xfer-link" data-a="${s.id}" data-b="${o.id}">${icon('link')} Transfer</button></div>`).join('')}</div>` : (!xfers.length ? `<div class="desc-line">No other station within 80 blocks.</div>` : '')}
    <div class="secthead">STATUS &amp; SERVICE</div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>Kind</label>${selF('insp-kind', STATION_KINDS, s.kind)}</div><div class="f"><label>Status</label>${selF('insp-status', LINE_STATUSES.map(([id, lb]) => [id, lb]), s.status)}</div></div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>Hours <span class="hint">blank = the lines' hours</span></label>${selF('insp-hours', [['', `Same as its lines (${hoursLabel(stationHours({ ...s, hours: '' }), lines[0] || {})})`], ...SERVICE_HOURS.slice(1)], s.hours || '')}</div><div class="f"><label>Grade</label>${selF('insp-grade', STATION_GRADES, s.grade || '')}</div></div>
    <div class="frow hours-custom" style="margin-top:8px" ${s.hours === 'custom' ? '' : 'hidden'}><div class="f"><label>From (hour)</label>${numF('insp-hfrom', s.hoursFrom, 'min="0" max="24" step="1"')}</div><div class="f"><label>To (hour)</label>${numF('insp-hto', s.hoursTo, 'min="0" max="24" step="1"')}</div></div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>Construction started</label>${hyMini('insp-sstart', s.yearStarted, s.halfStarted)}</div><div class="f"><label>Opened <span class="hint">or expected</span></label>${hyMini('insp-sopen', s.yearOpened ?? s.yearExpected, s.yearOpened != null ? s.halfOpened : s.halfExpected)}</div></div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>Closed</label>${hyMini('insp-sclose', s.yearClosed, s.halfClosed)}</div><div class="f"><label>Cost <span class="hint">$ recorded</span></label>${numF('insp-cost', s.costActual, 'min="0" step="1000000" placeholder="' + (stationCostEstimate(s)?.total ? Math.round(stationCostEstimate(s).total) : '') + '"')}</div></div>
    <div class="frow" style="margin-top:8px"><div class="f"><label>X</label>${numF('insp-x', s.x, 'step="1"')}</div><div class="f"><label>Z</label>${numF('insp-z', s.z, 'step="1"')}</div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm primary" data-act="insp-save-station">${icon('check')} Save</button><button class="btn sm" data-act="insp-move">${icon('pin')} Move</button><button class="btn sm danger" data-act="insp-delete">${icon('trash')}</button></div>`;
}
/* save the station inspector: status, hours, dates; an opening date in the future is stored as expected */
function saveStationInspector(s) {
  const g = id => $('#f-' + id)?.value ?? ''; const hy = id => { const y = num($(`#f-${id}-y`)?.value); const h = $(`#f-${id}-h`)?.value; return { y, h: y != null && ['E', 'L'].includes(h) ? h : '' }; };
  s.name = $('#insp-name').value.trim(); s.kind = g('insp-kind') || 'station'; s.status = g('insp-status') || 'open'; s.hours = g('insp-hours'); s.grade = g('insp-grade'); s.hoursFrom = num(g('insp-hfrom')); s.hoursTo = num(g('insp-hto'));
  const st = hy('insp-sstart'), op = hy('insp-sopen'), cl = hy('insp-sclose'); s.yearStarted = st.y; s.halfStarted = st.h; s.yearClosed = cl.y; s.halfClosed = cl.h;
  const future = op.y != null && hyIndex(op.y, op.h) > hyIndex(CURRENT_YEAR, CURRENT_HALF) && ['construction', 'planned'].includes(s.status);
  if (future) { s.yearExpected = op.y; s.halfExpected = op.h; s.yearOpened = null; s.halfOpened = ''; } else { s.yearOpened = op.y; s.halfOpened = op.h; }
  s.costActual = num(g('insp-cost')); const x = num(g('insp-x')), z = num(g('insp-z')); if (x != null && z != null && (x !== s.x || z !== s.z)) { s.x = x; s.z = z; s.districtId = placeSuggest(x, z).districts[0]?.d.id || null; for (const l of linesAtStation(s)) sortStopsAlong(l); }
  s.updated = now();
}
function saveLineInspector(l) {
  const g = id => $('#f-' + id)?.value ?? '';
  l.name = $('#insp-name').value.trim(); l.shortName = g('insp-short').trim(); l.mode = g('insp-mode'); l.status = g('insp-status'); l.hours = g('insp-hours'); l.hoursFrom = num(g('insp-hfrom')); l.hoursTo = num(g('insp-hto')); l.width = clamp(num(g('insp-width')) || 4, 2, 10);
  const y = num($('#f-insp-lopened-y')?.value); l.yearOpened = y; l.halfOpened = y != null && ['E', 'L'].includes($('#f-insp-lopened-h')?.value) ? $('#f-insp-lopened-h').value : '';
  for (const tr of lineTracks(l)) tr.mode = l.mode;
  $$('[data-stopname]').forEach(inp => { const s = stationById(inp.dataset.stopname); if (s && s.name !== inp.value.trim()) { s.name = inp.value.trim(); s.updated = now(); } });
  l.updated = now();
}

/* ---- what a station really offers today: its own status, else what its lines offer ---- */
function effectiveStationStatus(s) {
  const st = s.status || 'open'; if (['closed', 'construction', 'planned', 'partial'].includes(st)) return st;
  const ls = linesAtStation(s).map(l => l.status || 'open'); if (!ls.length) return 'none';
  if (ls.includes('open')) return 'open'; if (ls.includes('partial')) return 'partial'; if (ls.includes('construction')) return 'construction'; if (ls.includes('planned')) return 'planned'; return 'none';
}
const STATUS_WEIGHT = V => ({ open: 1, partial: V.transitPartial, construction: V.transitConstruction, planned: V.transitPlanned });
/* valuation factors from transit: the best station by distance × status weight; 24/7 service is a bonus on top */
function transitValueFactors(b, V) {
  if (b.x == null || b.z == null) return [['transit', 'Transit', V.transitNone, 'no coordinates — no station reachable on file']];
  const pt = [b.x, b.z]; const W = STATUS_WEIGHT(V); const tier = d => d <= SERVICE_WALK_FULL ? V.transitNear : d <= SERVICE_REACH ? V.transitMid : d <= SERVICE_WALK_ZERO ? V.transitFar : null;
  let best = null, open247 = null;
  for (const s of S.stations) { if (s.x == null) continue; const eff = effectiveStationStatus(s); const w = W[eff]; if (!w) continue; const d = dist2(pt, [s.x, s.z]); const t = tier(d); if (t == null) continue; const pct = Math.round(t * w * 10) / 10; if (!best || pct > best.pct || (pct === best.pct && d < best.d)) best = { s, d, pct, eff, w }; if (eff === 'open' && d <= SERVICE_REACH && stationHours(s) === '24/7' && (!open247 || d < open247.d)) open247 = { s, d }; }
  if (!best) return [['transit', 'Transit', V.transitNone, `no open, building or planned station within ${SERVICE_WALK_ZERO} blk`]];
  const nm = best.s.name || best.s.reg; const lbl = { open: '', partial: 'part-time service', construction: 'under construction', planned: 'planned' }[best.eff];
  const out = [['transit', 'Transit', best.pct, `${nm} ${Math.round(best.d)} blk away (${fmtMins(best.d / WALK_BLOCKS_PER_SEC)} walk)${lbl ? ` · ${lbl} — ${Math.round(best.w * 100)}% of an open station's lift` : ''}`]];
  if (open247 && V.transit247) out.push(['transit247', '24/7 service', V.transit247, `${open247.s.name || open247.s.reg} runs round the clock`]);
  return out;
}

/* ---- construction cost model: transparent, editable, always labelled an estimate ---- */
const TC = () => ({ ...TRANSIT_COST_DEFAULTS, ...(S.settings.transitCost || {}) });
const modeMult = (mode, C = TC()) => ({ subway: C.modeSubway, rail: C.modeRail, tram: C.modeTram, bus: C.modeBus }[mode] ?? C.modeOther);
function stationGradeOf(s) { if (s.grade) return { grade: s.grade, assumed: false }; const ls = linesAtStation(s); const tg = ls.flatMap(lineTracks).map(t => t.grade).find(g => g && g !== 'surface'); if (tg) return { grade: tg === 'tunnel' ? 'underground' : tg === 'elevated' || tg === 'bridge' ? 'elevated' : 'surface', assumed: true }; return { grade: ls.some(l => l.mode === 'subway') || !ls.length ? 'underground' : 'surface', assumed: true }; }
function stationCostEstimate(s) {
  const C = TC(); const { grade, assumed } = stationGradeOf(s); const base = grade === 'underground' ? C.stationUnderground : grade === 'elevated' ? C.stationElevated : C.stationSurface;
  const ls = linesAtStation(s); const mode = ls[0]?.mode || 'subway'; const mult = ls.length ? Math.max(...ls.map(l => modeMult(l.mode, C))) : modeMult('subway', C);
  const total = base * mult * (1 + (C.contingency || 0) / 100); return { total, grade, assumed, mode, basis: `${grade}${assumed ? ' (assumed)' : ''} station · ${MODE_LABEL[mode] || mode} ×${mult} · +${C.contingency}% contingency` };
}
function trackGradeOf(t, mode) { const g = t.grade || 'surface'; if (g === 'surface' && mode === 'subway') return { grade: 'tunnel', assumed: true }; return { grade: g, assumed: false }; }
function trackCostEstimate(t, mode = t.mode) { const C = TC(); const { grade, assumed } = trackGradeOf(t, mode); const per = { tunnel: C.blockTunnel, elevated: C.blockElevated, bridge: C.blockBridge, surface: C.blockSurface }[grade] || C.blockSurface; const len = polyLength(t.geometry || []); return { total: per * len * modeMult(mode, C) * (1 + (C.contingency || 0) / 100), len, grade, assumed, per }; }
function lineCostEstimate(l) { const tr = lineTracks(l).map(t => trackCostEstimate(t, l.mode)); const st = stationsOf(l).map(stationCostEstimate); return { total: tr.reduce((a, x) => a + x.total, 0) + st.reduce((a, x) => a + x.total, 0), track: tr.reduce((a, x) => a + x.total, 0), stations: st.reduce((a, x) => a + x.total, 0), len: tr.reduce((a, x) => a + x.len, 0), nStations: st.length, assumed: tr.some(x => x.assumed) || st.some(x => x.assumed) }; }
function quickCostEstimate({ mode = 'subway', grade = 'tunnel', blocks = 0, stations = 0, stationGrade = 'underground' }) { const C = TC(); const per = { tunnel: C.blockTunnel, elevated: C.blockElevated, bridge: C.blockBridge, surface: C.blockSurface }[grade] || C.blockSurface; const sc = stationGrade === 'underground' ? C.stationUnderground : stationGrade === 'elevated' ? C.stationElevated : C.stationSurface; const m = modeMult(mode, C), k = 1 + (C.contingency || 0) / 100; const track = per * blocks * m * k, st = sc * stations * m * k; return { track, stations: st, total: track + st }; }
/* how many placed buildings a station would lift, and by how much in total (today's model) */
function stationUplift(s) { if (s.x == null) return null; const V = VAL(); const rows = S.buildings.filter(b => isActive(b) && b.x != null && dist2([b.x, b.z], [s.x, s.z]) <= SERVICE_WALK_ZERO); let open = 0, now_ = 0; for (const b of rows) { const d = dist2([b.x, b.z], [s.x, s.z]); const t = d <= SERVICE_WALK_FULL ? V.transitNear : d <= SERVICE_REACH ? V.transitMid : V.transitFar; open += t; } const w = STATUS_WEIGHT(V)[effectiveStationStatus(s)] || 0; return { n: rows.length, pctOpen: open, pctNow: open * w }; }

/* ---- the departure board: simulated from headway, hours and the line's own timetable ---- */
UI.boardStation = null; UI.boardClock = 0;
function hashNum(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
/* next departures from station s, for every line and direction, from minute-of-day m (simulated) */
function boardDepartures(s, m = null, count = 3) {
  const d = new Date(); const nowMin = m ?? d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; const out = [];
  for (const l of linesAtStation(s)) {
    const status = l.status || 'open'; if (!['open', 'partial'].includes(status) || ['closed', 'construction', 'planned'].includes(s.status)) { out.push({ l, dir: null, status: status === 'open' ? s.status : status, times: [] }); continue; }
    const stops = stationsOf(l); const i = stops.findIndex(x => x.id === s.id); if (i < 0 || stops.length < 2) continue;
    const tt = lineTimetable(l); const svc = lineService(l); const hw = svc.headwayMin * (status === 'partial' ? 2 : 1); const total = tt[tt.length - 1]?.t ?? 0; const here = tt[i]?.t ?? 0;
    const hours = s.hours || l.hours || ''; const win = hoursWindows(hours, s.hours ? s : l);
    for (const dir of [1, -1]) {
      const dest = dir === 1 ? stops[stops.length - 1] : stops[0]; if (dest.id === s.id) continue;
      const travel = (dir === 1 ? here : total - here) / 60; const phase = (hashNum(l.id + dir) % Math.max(1, Math.round(hw * 10))) / 10;
      const times = lineDepartures(l, dir, { hours, o: s.hours ? s : l, nowMin, from: -travel - 0.2, to: 1440 }).map(t => t + travel).filter(at => at >= nowMin - 0.2); const next = times.slice(0, count); void phase; void win;
      const late = (hashNum(l.id + dir + Math.floor(nowMin / 30)) % 7) === 0 ? 1 + (hashNum(s.id + l.id) % 3) : 0;
      out.push({ l, dir, dest, status, times: next.map(t => t - nowMin), late, hours, basis: svc.basis, inService: inService(hours, s.hours ? s : l, (nowMin / 60) % 24) });
    }
  }
  return out.sort((a, b) => (a.times[0] ?? 1e9) - (b.times[0] ?? 1e9));
}
const minsText = m => m < 0.75 ? 'due' : `${Math.round(m)} min`;
function renderBoardTab() {
  const all = S.stations.filter(s => UI.tf.all || stationInScope(s)).filter(s => s.x != null || linesAtStation(s).length);
  if (!all.length) return `<div class="panel empty"><b>No stations yet</b>Draw a line on the map and drop stops along it — the board fills in from the line's headway and hours.<br><button class="btn primary" data-act="draw-line">${icon('draw')} Draw a line</button></div>`;
  const s = stationById(UI.boardStation) && all.some(x => x.id === UI.boardStation) ? stationById(UI.boardStation) : all.slice().sort((a, b) => linesAtComplex(b).length - linesAtComplex(a).length || (a.name || a.reg).localeCompare(b.name || b.reg))[0]; UI.boardStation = s.id;
  const deps = boardDepartures(s); const clock = new Date(); const lines = S.lines.filter(l => UI.tf.all || lineInScope(l));
  const uc = all.filter(x => ['construction', 'planned'].includes(effectiveStationStatus(x))); const xg = transferGroup(s).filter(x => x.id !== s.id);
  return `<section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud board" style="grid-column:span 2">
      <div class="panel-head"><h3>DEPARTURES</h3><span class="note">simulated from each line's headway, hours and stop times — not live data</span></div>
      <div class="toolbar" style="margin:0 0 10px"><label class="field on"><span>Station</span><select data-board-station>${all.slice().sort((a, b) => (a.name || a.reg).localeCompare(b.name || b.reg)).map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name || x.reg)}${linesAtStation(x).length > 1 ? ' ⇄' : ''}</option>`).join('')}</select></label><span class="spacer"></span><span class="bclock" id="board-clock">${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}</span><button class="btn sm" data-open="station:${s.id}">${icon('expand')} Station</button></div>
      <div class="bhead"><div class="nm">${esc(s.name || s.reg)}</div><div class="sub">${linesAtComplex(s).map(lineBullet).join('')} ${statusChip(effectiveStationStatus(s) === 'none' ? 'planned' : effectiveStationStatus(s))} <span class="muted">${esc(hoursLabel(stationHours(s), s.hours ? s : (linesAtStation(s)[0] || {})))}</span>${xg.length ? ` · transfer to ${xg.map(x => esc(x.name || x.reg)).join(', ')}` : ''}</div></div>
      <div class="brows">${deps.length ? deps.map(dp => dp.dir == null ? `<div class="brow off"><span>${lineBullet(dp.l)}</span><span class="to">${esc(lineLabel(dp.l))}</span><span class="t">${statusChip(dp.status)}</span><span class="m">no trains</span></div>` : `<div class="brow ${dp.inService ? '' : 'off'}"><span>${lineBullet(dp.l)}</span><span class="to">to <b>${esc(dp.dest.name || dp.dest.reg)}</b>${dp.status === 'partial' ? ' <span class="mk info">PART-TIME</span>' : ''}</span><span class="t">${dp.times.length ? `<b>${minsText(dp.times[0] + (dp.late || 0))}</b>${dp.times.slice(1).map(t => ` · ${minsText(t)}`).join('')}` : '—'}</span><span class="m">${!dp.inService ? `no service now · ${esc(hoursLabel(dp.hours, dp.l))}` : dp.late ? `<span style="color:var(--warn)">+${dp.late} min</span>` : 'on time'}</span></div>`).join('') : `<div class="chart-empty">No line stops here yet.</div>`}</div>
      <div class="desc-line" style="margin-top:8px">Board refreshes every 15 s while open. Times use each line's headway (Service tab), dwell and speed; measured segment times replace estimates where recorded. Delays are simulated flavour.</div>
    </div>
    <div class="stack">
      <div class="panel hud"><div class="panel-head"><h3>LINE STATUS</h3><span class="note">today</span></div>${lines.length ? `<div class="lstatus">${lines.map(l => { const st = l.status || 'open'; const txt = st === 'open' ? (l.hours === '24/7' ? 'Good service · 24/7' : 'Good service') : st === 'partial' ? `Part-time · ${esc(hoursLabel(l.hours, l))}` : st === 'construction' ? `Under construction${l.yearExpected ? ' · opens ' + esc(hyLabel(l.yearExpected, l.halfExpected)) : ''}` : st === 'planned' ? 'Planned' : 'Closed'; return `<div class="ls ${st}" data-open="line:${l.id}" role="button">${lineBullet(l)}<span class="nm">${esc(lineLabel(l))}</span><span class="st">${txt}</span>${lineStripHTML(l)}</div>`; }).join('')}</div><div class="desc-line">The strips show where each train is right now (▸ outbound, ◂ inbound); the map draws them moving.</div>` : `<div class="chart-empty">No lines.</div>`}</div>
      <div class="panel hud"><div class="panel-head"><h3>PLAN A TRIP</h3><span class="note">transfers included · estimated</span></div>
        <div class="f" style="margin-bottom:6px"><label>From</label><select data-jfrom><option value="">—</option>${all.slice().sort((a, b) => (a.name || a.reg).localeCompare(b.name || b.reg)).map(x => `<option value="${x.id}" ${x.id === UI.jfrom ? 'selected' : ''}>${esc(x.name || x.reg)}</option>`).join('')}</select></div>
        <div class="f" style="margin-bottom:6px"><label>To</label><select data-jto><option value="">—</option>${all.slice().sort((a, b) => (a.name || a.reg).localeCompare(b.name || b.reg)).map(x => `<option value="${x.id}" ${x.id === UI.jto ? 'selected' : ''}>${esc(x.name || x.reg)}</option>`).join('')}</select></div>
        ${(() => { if (!UI.jfrom || !UI.jto) return '<div class="desc-line">Pick two stations.</div>'; const j = transitJourney(UI.jfrom, UI.jto); if (!j) return '<div class="chart-empty">No open connection on file — a missing stop or transfer link?</div>'; const rides = j.legs.filter(x => x.kind === 'ride').length; return `<div class="kv" style="margin:0;border:0">${kvHTML('DOOR TO DOOR', `${fmtMins(j.sec)}<small>${rides} ride${rides === 1 ? '' : 's'} · ${Math.max(0, rides - 1)} transfer${rides - 1 === 1 ? '' : 's'}</small>`, 'num')}</div><div class="jlegs">${j.legs.map(x => x.kind === 'walk' ? `<div class="jl walk">${icon('walk')} walk to <b>${esc(stationById(x.to)?.name || '')}</b></div>` : `<div class="jl">${lineBullet(lineById(x.line))} ${x.stops} stop${x.stops === 1 ? '' : 's'} to <b>${esc(stationById(x.to)?.name || stationById(x.to)?.reg || '')}</b></div>`).join('')}</div>`; })()}
      </div>
      <div class="panel hud"><div class="panel-head"><h3>COMING SOON</h3><span class="note">${uc.length} station${uc.length === 1 ? '' : 's'} building or planned</span></div>${uc.length ? `<div class="rowlist">${uc.slice(0, 8).map(x => `<div class="r link" data-open="station:${x.id}"><div><div class="t">${statusChip(effectiveStationStatus(x))} ${esc(x.name || x.reg)}</div><div class="s">${x.yearExpected ? 'expected ' + esc(hyLabel(x.yearExpected, x.halfExpected)) + ' · ' : ''}est. ${fmtMoneyCompact(num(x.costActual) || stationCostEstimate(x).total)}</div></div></div>`).join('')}</div><button class="btn sm" data-tseg="projects" style="margin-top:8px">${icon('route')} All projects &amp; costs</button>` : `<div class="chart-empty">Nothing under construction or planned.</div>`}</div>
    </div>
  </section>`;
}
function refreshBoardClock() { if (UI.nav !== 'transit' || UI.tseg !== 'board' || document.hidden) return; const el = $('#board-clock'); if (!el) return; const sc = window.scrollY; renderView(false); window.scrollTo(0, sc); }
setInterval(refreshBoardClock, 15000);

/* ---- projects: stations and lines under construction or planned, sandbox ideas, and a calculator ---- */
UI.calc = { mode: 'subway', grade: 'tunnel', blocks: 500, stations: 3, stationGrade: 'underground' };
function renderProjectsTab() {
  const sts = S.stations.filter(s => UI.tf.all || stationInScope(s)).filter(s => ['construction', 'planned'].includes(effectiveStationStatus(s)));
  const lns = S.lines.filter(l => UI.tf.all || lineInScope(l)).filter(l => ['construction', 'planned'].includes(l.status));
  const sb = S.sandbox?.stations || []; const C = TC(); const q = quickCostEstimate(UI.calc);
  const prog = o => { const a = hyOf(o.yearStarted, o.halfStarted), b = hyOf(o.yearExpected ?? o.yearOpened, o.yearExpected != null ? o.halfExpected : o.halfOpened); const n = hyIndex(CURRENT_YEAR, CURRENT_HALF); return a != null && b != null && b > a ? clamp((n - a) / (b - a), 0, 1) : null; };
  const pipeline = sts.reduce((a, s) => a + (num(s.costActual) || stationCostEstimate(s).total), 0) + lns.reduce((a, l) => a + (num(l.costActual) || lineCostEstimate(l).track), 0);
  const row = (o, kind, est, extra) => { const p = prog(o); return `<tr data-open="${kind}:${o.id}" style="cursor:pointer"><td>${kind === 'line' ? lineBadge(o, 'sm') + ' ' : ''}<b>${esc(kind === 'line' ? lineLabel(o) : (o.name || o.reg))}</b> <span class="muted">${esc(o.reg)}</span></td><td>${statusChip(kind === 'line' ? o.status : effectiveStationStatus(o))}</td><td>${o.yearStarted ? esc(hyLabel(o.yearStarted, o.halfStarted)) : '—'}</td><td>${o.yearExpected || o.yearOpened ? esc(hyLabel(o.yearExpected ?? o.yearOpened, o.yearExpected != null ? o.halfExpected : o.halfOpened)) : '—'}</td><td>${p != null ? `<div class="pbar"><i style="width:${Math.round(p * 100)}%"></i></div><small>${Math.round(p * 100)}% of the time</small>` : '<span class="muted">add start + expected</span>'}</td><td class="num r">${num(o.costActual) ? fmtMoneyCompact(num(o.costActual)) + ' <span class="mk good">RECORDED</span>' : fmtMoneyCompact(est) + ' <span class="mk muted">EST.</span>'}</td><td class="r">${extra}</td></tr>`; };
  return `<section class="tiles" style="margin-bottom:14px">
    <div class="panel tile"><div class="lbl">STATIONS IN THE WORKS</div><div class="val">${sts.length}</div><div class="sub">${sts.filter(s => effectiveStationStatus(s) === 'construction').length} building · ${sts.filter(s => effectiveStationStatus(s) === 'planned').length} planned</div></div>
    <div class="panel tile"><div class="lbl">LINES IN THE WORKS</div><div class="val">${lns.length}</div><div class="sub">${fmtInt(lns.reduce((a, l) => a + lineLength(l), 0))} blk of alignment</div></div>
    <div class="panel tile money"><div class="lbl">PIPELINE</div><div class="val">${fmtMoneyCompact(pipeline)}</div><div class="sub">recorded costs where set, otherwise the model</div></div>
    <div class="panel tile"><div class="lbl">SANDBOX IDEAS</div><div class="val">${sb.length}</div><div class="sub">not in the registry</div></div>
  </section>
  <div class="panel hud" style="margin-bottom:16px"><div class="panel-head"><h3>PROJECTS</h3><span class="note">a station under construction already lifts nearby values a little (${Math.round(VAL().transitConstruction * 100)}% of an open one); planned ${Math.round(VAL().transitPlanned * 100)}%</span></div>
    ${sts.length || lns.length ? `<div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>PROJECT</th><th>STATUS</th><th>STARTED</th><th>OPENS</th><th>PROGRESS</th><th class="r">COST</th><th class="r">LIFT</th></tr></thead><tbody>${lns.map(l => row(l, 'line', lineCostEstimate(l).total, `${fmtInt(lineLength(l))} blk · ${stationsOf(l).length} stops`)).join('')}${sts.map(s => { const u = stationUplift(s); return row(s, 'station', stationCostEstimate(s).total, u ? `${u.n} bldg · +${Math.round(u.pctNow / Math.max(1, u.n) * 10) / 10}% now → +${Math.round(u.pctOpen / Math.max(1, u.n) * 10) / 10}% open` : '—'); }).join('')}</tbody></table></div>` : `<div class="chart-empty">No station or line is under construction or planned. Set a station's status to <b>Under construction</b> or <b>Planned</b> (with start and expected dates) and it appears here.</div>`}
  </div>
  <section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>NEW PROJECT ESTIMATE</h3><span class="note">model · not a quote</span></div>
      <form class="form" id="calcform" onsubmit="return false"><div class="frow">
        ${fld('cmode', 'Mode', selF('cmode', TRANSIT_MODES, UI.calc.mode))}${fld('cgrade', 'Track', selF('cgrade', [['tunnel', 'Tunnel'], ['elevated', 'Elevated'], ['bridge', 'Bridge'], ['surface', 'Surface']], UI.calc.grade))}
        ${fld('cblocks', 'Length', numF('cblocks', UI.calc.blocks, 'min="0" step="10"'), 'blocks')}${fld('cstations', 'Stations', numF('cstations', UI.calc.stations, 'min="0" step="1"'))}
        ${fld('csgrade', 'Station type', selF('csgrade', STATION_GRADES.slice(1), UI.calc.stationGrade))}
      </div></form>
      <div class="kv" style="margin-top:10px">${kvHTML('TRACK', fmtMoneyCompact(q.track), 'num')}${kvHTML('STATIONS', fmtMoneyCompact(q.stations), 'num')}${kvHTML('TOTAL', `${fmtMoneyCompact(q.total)}<small>incl. ${C.contingency}% contingency</small>`, 'num money')}</div>
    </div>
    <div class="panel hud" style="grid-column:span 2"><div class="panel-head"><h3>COST MODEL</h3><span class="note">edit to match New A — saved with the registry</span></div>
      <div class="costgrid">${[['stationUnderground', 'Underground station'], ['stationElevated', 'Elevated station'], ['stationSurface', 'At-grade station'], ['blockTunnel', 'Tunnel · per block'], ['blockElevated', 'Elevated · per block'], ['blockBridge', 'Bridge · per block'], ['blockSurface', 'Surface · per block'], ['contingency', 'Contingency %']].map(([k, l]) => `<label class="f"><span>${l}</span><input class="num" type="number" min="0" step="${k === 'contingency' ? 1 : 10000}" data-tcost="${k}" value="${esc(C[k])}"></label>`).join('')}</div>
      <div class="desc-line" style="margin-top:8px">Defaults are scaled from real-world figures: underground metro stations commonly run hundreds of millions of dollars each, and tunnelled metro track roughly $200–400M per km outside New York (Eno Center / Transit Costs Project). One block = one metre, so a tunnel block ≈ $1.1M. Mode multipliers: subway ×${C.modeSubway}, rail ×${C.modeRail}, tram ×${C.modeTram}, bus ×${C.modeBus}.</div>
      ${sb.length ? `<div class="secthead">SANDBOX IDEAS, COSTED</div><div class="rowlist">${sb.map(x => `<div class="r"><div><div class="t"><span class="mk warn">SANDBOX</span>${esc(x.name || 'Unnamed')}</div><div class="s">X ${esc(x.x)} · Z ${esc(x.z)}</div></div><div class="v">${fmtMoneyCompact(quickCostEstimate({ stations: 1, stationGrade: 'underground', mode: x.lineId && lineById(x.lineId) ? lineById(x.lineId).mode : 'subway' }).total)}</div></div>`).join('')}</div>` : ''}
    </div>
  </section>`;
}
/* a round line bullet, like a subway sign: the short name in the line colour */
const lineBullet = l => `<span class="lbullet" style="--c:${esc(l.color || TRANSIT_COLORS[0])}" title="${esc(lineLabel(l))} · ${esc(MODE_LABEL[l.mode] || l.mode)}">${esc((l.shortName || l.name || l.reg || '?').slice(0, 3))}</span>`;

/* ---- journeys with transfers: fastest path over open lines (average wait = half the headway), walking transfer links ---- */
function transitJourney(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return null; const key = (s, l) => s + '|' + (l || '');
  const dist = new Map([[key(fromId, null), 0]]); const prev = new Map(); const done = new Set(); const pq = [[0, fromId, null]];
  const segCache = new Map(); const segs = l => segCache.get(l.id) || segCache.set(l.id, lineSegments(l)).get(l.id);
  const push = (d, s, l, from, how) => { const k = key(s, l); if (d < (dist.get(k) ?? Infinity)) { dist.set(k, d); prev.set(k, { from, how }); pq.push([d, s, l]); } };
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]); const [d, s, l] = pq.shift(); const k = key(s, l); if (done.has(k)) continue; done.add(k);
    if (s === toId && !l) { const legs = []; let c = k; while (prev.has(c)) { const p = prev.get(c); legs.unshift({ ...p.how, at: c.split('|')[0] }); c = p.from; } return { sec: d, legs: compactLegs(legs) }; }
    const st = stationById(s); if (!st) continue;
    if (!l) { for (const line of linesAtStation(st).filter(x => ['open', 'partial'].includes(x.status))) push(d + lineService(line).headwayMin * 30 * (line.status === 'partial' ? 2 : 1), s, line.id, k, { kind: 'board', line: line.id }); for (const oid of st.transferIds || []) { const o = stationById(oid); if (o?.x != null && st.x != null) push(d + dist2([o.x, o.z], [st.x, st.z]) / WALK_BLOCKS_PER_SEC, oid, null, k, { kind: 'walk' }); } }
    else { const line = lineById(l); push(d, s, null, k, { kind: 'alight', line: l }); for (const sg of segs(line)) { if (sg.sec == null) continue; if (sg.from.id === s) push(d + sg.sec, sg.to.id, l, k, { kind: 'ride', line: l }); if (sg.to.id === s) push(d + sg.sec, sg.from.id, l, k, { kind: 'ride', line: l }); } }
  }
  return null;
}
function compactLegs(raw) { const out = []; for (const x of raw) { if (x.kind === 'board') out.push({ kind: 'ride', line: x.line, from: null, to: null, stops: 0 }); else if (x.kind === 'ride') { const c = out[out.length - 1]; if (c) { c.stops++; c.to = x.at; } } else if (x.kind === 'walk') out.push({ kind: 'walk', to: x.at }); } let from = null; for (const x of raw) { if (x.kind === 'board') from = x.at; } return out.filter(x => x.kind !== 'ride' || x.stops > 0); }
function journeyText(j) { if (!j) return ''; return j.legs.map(x => x.kind === 'walk' ? `walk to ${stationById(x.to)?.name || 'the transfer'}` : `${lineLabel(lineById(x.line))} ${x.stops} stop${x.stops === 1 ? '' : 's'} to ${stationById(x.to)?.name || stationById(x.to)?.reg || ''}`).join(' → '); }
const placeStationAt = raw => placeStationSmart(raw);   // older name, kept for scripts
