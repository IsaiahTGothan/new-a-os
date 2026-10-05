/* =====================================================================
   §15 TRANSIT DASHBOARD — lines, stations, status, missing connections
   ===================================================================== */
UI.tq = ''; UI.tf = { mode: '', status: '', all: false };
function transitLines() { let ls = S.lines.filter(l => UI.tf.all || lineInScope(l)); const q = norm(UI.tq); if (UI.tf.mode) ls = ls.filter(l => l.mode === UI.tf.mode); if (UI.tf.status) ls = ls.filter(l => l.status === UI.tf.status); if (q) ls = ls.filter(l => Math.max(fuzzyScore(q, l.name), fuzzyScore(q, l.shortName), fuzzyScore(q, l.reg), fuzzyScore(q, l.operator), ...stationsOf(l).map(s => fuzzyScore(q, s.name))) >= 0.3); return ls.sort((a, b) => lineLabel(a).localeCompare(lineLabel(b))); }
function transitStations() { let ss = S.stations.filter(s => UI.tf.all || stationInScope(s)); const q = norm(UI.tq); if (UI.tf.status) ss = ss.filter(s => s.status === UI.tf.status); if (q) ss = ss.filter(s => Math.max(fuzzyScore(q, s.name), fuzzyScore(q, s.reg), ...(s.aliases || []).map(a => fuzzyScore(q, a)), ...linesAtStation(s).map(l => fuzzyScore(q, l.name))) >= 0.3); return ss.sort((a, b) => (a.name || a.reg).localeCompare(b.name || b.reg)); }
function renderTransit() {
  const lines = transitLines(), stations = transitStations(); const allLines = S.lines.filter(l => UI.tf.all || lineInScope(l)), allSt = S.stations.filter(s => UI.tf.all || stationInScope(s));
  const open = allLines.filter(l => l.status === 'open'), uc = allLines.filter(l => l.status === 'construction' || l.status === 'planned');
  const transfers = allSt.filter(s => linesAtStation(s).length > 1).length; const trackLen = S.tracks.reduce((a, t) => a + polyLength(t.geometry), 0);
  const issues = transitIssues().filter(i => { const o = i.kind === 'line' ? lineById(i.id) : stationById(i.id); return o && (UI.tf.all || (i.kind === 'line' ? lineInScope(o) : stationInScope(o))); });
  const tile = (lbl, val, sub = '', cls = '') => `<div class="panel tile ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  const seg = UI.tseg;
  return `
  <section class="dhead" style="margin-bottom:14px">
    <div><div class="code transit"><i></i>TRANSIT · ${esc(scopeName().toUpperCase())} · ${allLines.length} LINES · ${allSt.length} STATIONS</div><h2>Transit</h2><p>Every line and station on file, with status, opening dates and what still needs connecting. Alignments are drawn in the Map workspace; shared track and shared stations are stored once. No ridership, schedules or travel times are invented.</p></div>
    <div class="stats"><button class="btn sm" data-act="export-transit-csv">${icon('down')} Transit CSV</button><button class="btn sm" data-act="draw-line">${icon('draw')} Draw a line</button><button class="btn sm primary" data-act="new-line">${icon('plus')} New line</button></div>
  </section>
  <section class="tiles">
    ${tile('LINES OPEN', `<span class="count" data-to="${open.length}">0</span>`, `${allLines.filter(l => l.status === 'closed').length} closed`, 'transit')}
    ${tile('UNDER WAY', `<span class="count" data-to="${uc.length}">0</span>`, `${allLines.filter(l => l.status === 'construction').length} under construction · ${allLines.filter(l => l.status === 'planned').length} planned`)}
    ${tile('STATIONS', `<span class="count" data-to="${allSt.length}">0</span>`, `${allSt.filter(s => s.kind === 'complex').length} complexes · ${allSt.filter(s => s.kind === 'entrance').length} entrances`)}
    ${tile('TRANSFERS', `<span class="count" data-to="${transfers}">0</span>`, 'stations with two or more lines')}
    ${tile('TRACK', `<span class="count" data-to="${Math.round(trackLen)}" data-fmt="compact">0</span><small>blocks</small>`, `${S.tracks.length} physical tracks · ${S.tracks.filter(t => linesOnTrack(t).length > 1).length} shared`)}
    ${tile('TO CONNECT', `<span class="count" data-to="${issues.length}">0</span>`, issues.length ? 'see Checks below' : 'nothing flagged', issues.length ? 'money' : '')}
  </section>
  <div class="toolbar" style="margin:0 0 14px">
    <div class="seg lg" role="group">${[['lines', 'Lines', 'transit', allLines.length], ['stations', 'Stations', 'station', allSt.length], ['checks', 'Checks', 'warn', issues.length]].map(([id, l, ic, n]) => `<button data-tseg="${id}" aria-pressed="${seg === id}" class="${seg === id ? 'transit' : ''}">${icon(ic)} ${l} <span class="cnt" style="font-family:var(--font-mono);font-size:11px;opacity:.8">${n}</span></button>`).join('')}</div>
    <label class="field"><span>Find</span><input id="tq" value="${esc(UI.tq)}" placeholder="line, stop, operator…" style="width:170px"></label>
    <label class="field ${UI.tf.mode ? 'on' : ''}"><span>Mode</span><select data-tf="mode"><option value="">Any</option>${TRANSIT_MODES.map(([id, l]) => `<option value="${id}" ${UI.tf.mode === id ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field ${UI.tf.status ? 'on' : ''}"><span>Status</span><select data-tf="status"><option value="">Any</option>${LINE_STATUSES.map(([id, l]) => `<option value="${id}" ${UI.tf.status === id ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="field ${UI.tf.all ? 'on' : ''}" data-tf-toggle="all" style="cursor:pointer">${icon('globe')} All jurisdictions</button>
    <span class="spacer"></span><button class="btn sm" data-act="map-transit">${icon('map')} Show on the map</button>
  </div>
  ${seg === 'stations' ? renderStationList(stations) : seg === 'checks' ? renderTransitChecks(issues) : renderLineList(lines)}`;
}
function renderLineList(lines) {
  if (!lines.length) return `<div class="panel empty"><b>${S.lines.length ? 'No line matches' : 'No transit lines yet'}</b>${S.lines.length ? 'Try clearing the filters, or include all jurisdictions.' : 'Draw the first alignment in the Map workspace (L), then name the line, pick its colour and add stations along it.'}<br><button class="btn primary" data-act="draw-line">${icon('draw')} Draw a line on the map</button></div>`;
  return `<div class="panel hud" style="padding:0"><div class="tlines">${lines.map(l => { const st = LINE_STATUS[l.status] || LINE_STATUS.open; const stops = stationsOf(l); return `<div class="tl" data-open="line:${l.id}" data-hover="line:${l.id}"><div>${lineBadge(l)}</div><div><div class="nm">${esc(l.name || l.reg)}<small>${esc(l.reg)}${l.operator ? ' · ' + esc(l.operator) : ''}</small></div><div class="s"><span><b>${stops.length}</b> stops</span><span><b>${fmtInt(lineLength(l))}</b> blk</span><span>${l.yearOpened != null ? `opened <b>${esc(hyLabel(l.yearOpened, l.halfOpened, l.yearOpenedApprox))}</b>` : '<span style="color:var(--warn)">no opening date</span>'}</span>${l.yearClosed != null ? `<span>closed <b>${esc(hyLabel(l.yearClosed, l.halfClosed))}</b></span>` : ''}${lineTracks(l).some(t => linesOnTrack(t).length > 1) ? '<span>shares track</span>' : ''}</div></div><div class="stops" style="--c:${esc(l.color)}">${stops.slice(0, 24).map(s => `<i class="${linesAtStation(s).length > 1 ? 'x' : ''}" title="${esc(s.name || s.reg)}"></i>`).join('')}${stops.length > 24 ? '<span class="muted">…</span>' : ''}</div><span class="status ${st.tone}"><i>●</i>${st.label}</span></div>`; }).join('')}</div></div>`;
}
function renderStationList(stations) {
  if (!stations.length) return `<div class="panel empty"><b>${S.stations.length ? 'No station matches' : 'No stations yet'}</b>${S.stations.length ? 'Try clearing the filters.' : 'Place stations in the Map workspace (X) along a line.'}<br><button class="btn primary" data-act="draw-station">${icon('station')} Place a station on the map</button></div>`;
  return `<div class="panel hud" style="padding:0"><div class="stationlist">${stations.map(s => { const lines = linesAtStation(s); const d = stationDistrict(s); return `<div class="st" data-open="station:${s.id}" data-hover="station:${s.id}"><span class="stationdot" style="border-color:${esc(lines[0]?.color || 'var(--transit)')}"></span><div><div class="nm">${esc(s.name || s.reg)}${lines.length > 1 ? '<span class="mk transit">TRANSFER</span>' : ''}${s.kind !== 'station' ? `<span class="mk">${esc(STATION_KINDS.find(k => k[0] === s.kind)?.[1] || s.kind).toUpperCase()}</span>` : ''}</div><div class="s">${esc(s.reg)} · ${esc(LINE_STATUS[s.status]?.label || s.status)}${d ? ' · ' + esc(d.name) : ''}${s.x != null ? ` · X ${s.x} Z ${s.z}` : ' · no coordinates'}${s.yearOpened != null ? ' · opened ' + esc(hyLabel(s.yearOpened, s.halfOpened)) : ''}</div></div><div class="ln">${lines.map(l => lineBadge(l, 'sm')).join('') || '<span class="mk warn">NO LINE</span>'}</div></div>`; }).join('')}</div></div>`;
}
function renderTransitChecks(issues) {
  if (!issues.length) return `<div class="panel empty"><b>Nothing to connect</b>Every line has geometry and at least two stops; every station serves a line.</div>`;
  return `<div class="panel hud"><div class="panel-head"><h3>CHECKS</h3><span class="note">${issues.length} · nothing changed automatically</span></div><div class="issues-wrap" style="margin:0">${issues.map(i => `<div class="issue ${i.level}">${icon(i.level === 'info' ? 'flag' : 'warn')}<span><span class="where" data-open="${i.kind}:${i.id}" role="button">${esc((i.kind === 'line' ? lineById(i.id)?.reg : stationById(i.id)?.reg) || '')}</span>${esc(i.text)}</span></div>`).join('')}</div></div>`;
}
/* stop ordering from the line record or the inspector */
function moveStop(lineId, i, dir) { const l = lineById(lineId); if (!l) return; const j = i + dir; if (j < 0 || j >= l.stopIds.length) return; [l.stopIds[i], l.stopIds[j]] = [l.stopIds[j], l.stopIds[i]]; l.updated = now(); commit(); }
function removeStop(lineId, stationId) { const l = lineById(lineId); if (!l) return; l.stopIds = l.stopIds.filter(x => x !== stationId); l.updated = now(); commit(); }
async function addStopDialog(l) {
  const r = await pickerDialog({ title: `Add a stop to ${lineLabel(l)}`, kicker: 'STATION', label: 'Search stations', placeholder: 'City Hall, ST-0003…', okLabel: 'Add', items: q => genericSearch(S.stations.filter(s => !l.stopIds.includes(s.id)), q, s => [s.reg, s.name, ...(s.aliases || [])]).map(s => ({ id: s.id, html: `<div class="optrow"><b style="color:var(--transit)">${esc(s.reg)}</b><span class="t">${esc(s.name || '')}</span><span class="m">${linesAtStation(s).map(x => esc(x.shortName || x.name)).join(', ') || 'no line'}</span></div>` })), allowCreate: '+ New station' });
  if (!r) return; if (r.create) { const name = (r.q || '').trim() || await promptDialog({ title: 'New station', label: 'Station name' }); if (!name) return; const s = newStation(S); s.name = name; S.stations.push(s); l.stopIds = [...l.stopIds, s.id]; commit(); renderDrawer(); toast(`${s.reg} ${name} created without coordinates — place it from the map`, 'good'); return; }
  l.stopIds = [...l.stopIds, r.id]; l.updated = now(); commit(); renderDrawer(); toast('Stop added', 'good');
}
