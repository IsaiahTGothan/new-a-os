/* =====================================================================
   §11 RECORDS — roads · transit lines · stations · businesses
       (record cards, editors, saving, deleting, mini-maps)
   ===================================================================== */
const openBadge = o => { const st = o.yearClosed != null ? 'closed' : o.yearOpened != null && o.yearOpened > CURRENT_YEAR ? 'planned' : 'open'; return `<span class="mk ${st === 'open' ? 'good' : st === 'closed' ? 'bad' : 'warn'}">${st.toUpperCase()}${o.yearOpened != null ? ' · ' + esc(hyLabel(o.yearOpened, o.halfOpened, o.yearOpenedApprox)) : ''}${o.yearClosed != null ? ' → ' + esc(hyLabel(o.yearClosed, o.halfClosed)) : ''}</span>`; };
const recordFoot = (kind, isNew) => `<div class="dfoot">${isNew ? '' : `<button class="btn danger sm" data-act="dr-delete">${icon('trash')} Delete</button>`}<span class="spacer"></span><button class="btn sm ghost" data-act="dr-cancel">Cancel</button><button class="btn primary sm" data-act="dr-save">${icon('check')} ${isNew ? 'Create' : 'Save changes'}</button></div>`;
const viewFoot = (editLabel) => `<div class="dfoot"><button class="btn danger sm" data-act="dr-delete">${icon('trash')} Delete</button><span class="spacer"></span><button class="btn primary sm" data-act="dr-edit">${icon('edit')} ${editLabel}</button></div>`;
const hdr = (kindLabel, reg, color, extra = '') => `<div class="dhd">${backBtn()}<span class="t">${kindLabel} · <span style="color:${color}">${esc(reg)}</span></span>${extra}<button class="btn sm ghost" data-act="dr-map" title="Show on the map">${icon('map')}</button><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>`;
const fld = (id, label, input, hint = '') => `<div class="f"><label for="f-${id}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>${input}</div>`;
const inpF = (id, val, attrs = '') => `<input id="f-${id}" value="${esc(val ?? '')}" ${attrs}>`;
const numF = (id, val, attrs = '') => `<input id="f-${id}" class="num" type="number" value="${esc(val ?? '')}" ${attrs}>`;
const selF = (id, opts, val) => `<select id="f-${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const vertexListHTML = (pts, prefix = 'v') => `<div class="vlist" id="${prefix}-list">${(pts || []).map((p, i) => `<div class="vr"><span>${i + 1}</span><input data-vi="${i}" data-vk="0" value="${esc(p[0])}" type="number" step="1" aria-label="X"><input data-vi="${i}" data-vk="1" value="${esc(p[1])}" type="number" step="1" aria-label="Z"><button type="button" data-act="vx-del" data-i="${i}" title="Remove vertex">${icon('x')}</button></div>`).join('') || '<div class="desc-line">No points yet — draw on the map or add a point.</div>'}</div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-act="vx-add">${icon('plus')} Point</button><button type="button" class="btn sm" data-act="geom-map">${icon('draw')} ${pts?.length ? 'Edit on the map' : 'Draw on the map'}</button></div>`;
function readVertexList(prefix = 'v') { const rows = $$(`#${prefix}-list .vr`); const pts = rows.map(r => { const x = num(r.querySelector('[data-vk="0"]').value), z = num(r.querySelector('[data-vk="1"]').value); return x != null && z != null ? [x, z] : null; }).filter(Boolean); return pts; }

/* ============ ROADS ============ */
function renderRoadRecord(r) {
  const bs = buildingsOnRoad(r); const js = roadConnections(r); const issues = roadIssues(r); const juris = roadJurisdictions(r); const regs = roadRegions(r);
  const kv = kvHTML; const L = polyLength(r.geometry), steps = blockSteps(r.geometry); const lines = S.lines.filter(l => (l.roadIds || []).includes(r.id));
  return `${hdr('ROAD', r.reg, 'var(--road)', `<button class="btn sm" data-act="dr-edit">${icon('edit')} Edit</button>`)}
  <div class="dbody">
    <div class="rec" style="padding-top:22px">
      <div class="reg road">${esc(r.reg)} <span class="dist" style="--c:var(--road)"><i></i>${juris.map(d => esc(d.name)).join(' · ') || (regs.length ? regs.map(x => esc(x.name)).join(' · ') : 'no jurisdiction on the map yet')}</span></div>
      <h2>${esc(roadLabel(r))}</h2>
      ${r.aliases?.length || r.formerNames?.length ? `<div class="nm">${r.aliases?.length ? 'also ' + esc(r.aliases.join(', ')) : ''}${r.aliases?.length && r.formerNames?.length ? ' · ' : ''}${r.formerNames?.length ? 'formerly ' + esc(r.formerNames.join(', ')) : ''}</div>` : ''}
      <div class="badges"><span class="mk road">${esc(ROAD_TYPE_LABEL[r.type] || r.type).toUpperCase()}</span><span class="mk">${esc(GRADE_LABEL[r.grade] || r.grade).toUpperCase()}</span><span class="mk ${r.direction === 'one-way' ? 'warn' : ''}" title="${r.direction === 'one-way' ? esc(oneWayText(r)) : ''}">${esc((DIRECTIONS.find(x => x[0] === r.direction) || [])[1] || r.direction).toUpperCase()}${r.direction === 'one-way' ? ' ' + oneWayArrow(r) : ''}</span>${openBadge(r)}${confHTML(r.confidence, r.verified)}</div>
    </div>
    <div class="secthead">GEOMETRY</div>
    <div class="kv">
      ${kv('LENGTH', r.geometry.length >= 2 ? `${fmtInt(L)}<small>blocks · straight-line geometry</small>` : null, 'num')}${kv('STAIRCASE BLOCKS', r.geometry.length >= 2 ? `${fmtInt(steps)}<small>blocks to lay a diagonal as steps</small>` : null, 'num')}
      ${kv('WIDTH', r.width != null ? `${esc(r.width)}<small>blocks</small>` : null, 'num')}${kv('POINTS', `${r.geometry.length}<small>vertices</small>`, 'num')}
      ${kv('FROM', r.geometry[0] ? `X ${esc(r.geometry[0][0])} · Z ${esc(r.geometry[0][1])}` : null, 'num')}${kv('TO', r.geometry.length > 1 ? `X ${esc(r.geometry[r.geometry.length - 1][0])} · Z ${esc(r.geometry[r.geometry.length - 1][1])}` : null, 'num')}
      ${kv('SURFACE', esc(r.surface))}${kv('JURISDICTIONS', juris.map(d => esc(d.name)).join(', ') || null)}
    </div>
    <div class="secthead">SHAPE HISTORY <span class="muted" style="letter-spacing:0;font-weight:400">· ${shapePeriods(r).length} shape${shapePeriods(r).length === 1 ? '' : 's'} · playback draws each in its years</span></div>${shapeTimelineHTML(r, 'road')}
    ${r.geometry.length ? `<div class="minimap tall"><canvas id="minimap"></canvas><span class="coord">${fmtInt(L)} blocks</span></div>` : ''}
    <div class="secthead">CHECKS <span class="muted" style="letter-spacing:0;font-weight:400">· what was looked at, nothing changed</span></div>
    ${issuesHTML(issues.filter(i => !i.summary), { max: 6 })}<div class="notes" style="font-size:11.5px;color:var(--ink-3)">${esc(issues.find(i => i.summary)?.text || '')}</div>
    <div class="secthead">CONNECTIONS <span class="muted" style="letter-spacing:0;font-weight:400">· ${js.length} junction${js.length === 1 ? '' : 's'}</span></div>
    ${js.length ? `<div class="rowlist">${js.map(j => { const o = roadById(j.a === r.id ? j.b : j.a); return o ? `<div class="r link" data-open="road:${o.id}" data-hover="road:${o.id}"><div><div class="t">${esc(roadLabel(o))}</div><div class="s">${j.kind === 'joins' ? 'end joins' : 'crossing junction'} · X ${Math.round(j.x)} · Z ${Math.round(j.z)} · ${esc(GRADE_LABEL[o.grade] || o.grade)}</div></div><div class="v" style="color:var(--ink-2)">${esc(o.reg)}</div></div>` : ''; }).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">Not connected to another mapped road. Two roads crossing at different grades (a bridge over a street) are shown on the map but are not junctions.</div>`}
    ${roadJunctions().filter(j => (j.a === r.id || j.b === r.id) && j.kind === 'separated').length ? `<div class="desc-line" style="margin:8px 20px 0">${roadJunctions().filter(j => (j.a === r.id || j.b === r.id) && j.kind === 'separated').length} grade-separated crossing(s) — not connected.</div>` : ''}
    <div class="secthead">BUILDINGS SERVED <span class="muted" style="letter-spacing:0;font-weight:400">· ${bs.length}</span></div>
    ${bs.length ? `<div class="rowlist">${bs.sort((a, b) => (num(a.number) ?? 1e9) - (num(b.number) ?? 1e9) || titleOf(a).localeCompare(titleOf(b))).map(b => `<div class="r link" data-open="${b.id}" data-hover="${b.id}"><div><div class="t"><span class="reg ${isHist(b) ? 'reg-h' : ''}" style="font-family:var(--font-mono);font-size:11px">${esc(b.reg)}</span>${esc(titleOf(b))}</div><div class="s">${esc(physicalOf(b.physical).label)}${b.x != null ? ` · ${Math.round(polylineClosest([b.x, b.z], r.geometry)?.d ?? 0)} blk from centreline` : ''}</div></div><div class="v" style="color:var(--ink-2)">${esc(districtById(b.districtId)?.code || '')}</div></div>`).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No building is associated with this road yet — open a building and choose it under Road & access.</div>`}
    ${lines.length ? `<div class="secthead">TRANSIT USING THIS ROAD</div><div class="chips">${lines.map(l => `<span class="linebadge" style="--c:${esc(l.color)}" data-open="line:${l.id}" role="button">${esc(l.shortName || l.name)}</span>`).join('')}</div>` : ''}
    <div class="secthead">PROVENANCE</div>
    <div class="kv">${kv('CONFIDENCE', confHTML(r.confidence, r.verified))}${kv('SOURCE TYPE', esc(SOURCE_LABEL[r.sourceType] || r.sourceType))}${kv('SOURCE', esc(r.source), '', true)}</div>
    ${r.notes ? `<div class="secthead">NOTES</div><div class="notes">${esc(r.notes)}</div>` : ''}
    <div class="secthead">RECORD</div>
    <div class="kv"><div><div class="k">CREATED</div><div class="v num" style="font-size:12px">${fmtDate(r.created)}</div></div><div><div class="k">UPDATED</div><div class="v num" style="font-size:12px">${fmtDate(r.updated)}</div></div><div class="span"><div class="k">INTERNAL ID</div><div class="v num" style="font-size:11px;color:var(--ink-3)">${esc(r.id)} <span class="muted">· buildings and bus routes point at this; renaming never breaks the link</span></div></div></div>
  </div>${viewFoot('Edit road')}`;
}
function renderRoadEditor(r) {
  return `<div class="dhd"><span class="t">${DR.isNew ? 'NEW ROAD' : 'EDIT · ' + esc(r.reg)}</span><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody"><form class="form" id="rform" autocomplete="off" onsubmit="return false">
    <div class="fsect"><h4>NAME</h4><div class="frow">
      <div class="f span"><label for="f-name">Name <span class="hint">renaming keeps the old name as a former name</span></label>${inpF('name', r.name, 'placeholder="Mill Street"')}</div>
      ${fld('aliases', 'Aliases', inpF('aliases', (r.aliases || []).join(', '), 'placeholder="Route 9, The Boulevard"'), 'comma separated')}
      ${fld('formerNames', 'Former names', inpF('formerNames', (r.formerNames || []).join(', '), 'placeholder=""'), 'comma separated')}
      <div class="f"><label>Unnamed</label><label class="switch"><input type="checkbox" id="f-unnamed" ${r.unnamed ? 'checked' : ''}> <span class="muted" style="font-size:12px">shown by number</span></label></div>
    </div></div>
    <div class="fsect"><h4>KIND</h4><div class="frow c3">
      ${fld('type', 'Type', selF('type', ROAD_TYPES, r.type))}${fld('grade', 'Grade', selF('grade', GRADES, r.grade), 'bridges & tunnels never form junctions with surface roads')}${fld('direction', 'Access', selF('direction', DIRECTIONS, r.direction))}
      ${fld('oneWayDir', 'One-way runs', selF('oneWayDir', ONEWAY_DIRS, r.oneWayDir === -1 ? -1 : 1), 'only for one-way roads · the map shows faint arrows')}
      ${fld('width', 'Width', numF('width', r.width, 'min="1" step="1"'), 'blocks')}${fld('surface', 'Surface', inpF('surface', r.surface, 'placeholder="stone bricks, asphalt…"'))}
    </div></div>
    <div class="fsect"><h4>SHAPE HISTORY <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">dates and shapes are edited on the record page or in the map inspector</span></h4>${shapeTimelineHTML(r, 'road', { editable: false })}</div>
    <div class="fsect"><h4>LIFECYCLE</h4><div class="frow">
      <div class="f"><label>Opened</label>${hyControl('opened', r.yearOpened, r.halfOpened, r.yearOpenedApprox, { yearPh: '2015' })}</div>
      <div class="f"><label>Closed <span class="hint">leave empty while in use</span></label>${hyControl('closed', r.yearClosed, r.halfClosed, false, { yearPh: '—', withApprox: false })}</div>
    </div></div>
    <div class="fsect"><h4>GEOMETRY <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">Minecraft X · Z, in order</span></h4>${vertexListHTML(r.geometry)}</div>
    <div class="fsect"><h4>PROVENANCE & NOTES</h4><div class="frow c3">
      ${fld('confidence', 'Confidence', `<select id="f-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === r.confidence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
      ${fld('sourceType', 'Source type', `<select id="f-sourceType"><option value="">— none —</option>${SOURCE_TYPES.map(([id, l]) => `<option value="${id}" ${id === r.sourceType ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      <div class="f"><label>Verified</label><label class="switch"><input type="checkbox" id="f-verified" ${r.verified ? 'checked' : ''}> <span class="muted" style="font-size:12px">checked in the world</span></label></div>
      <div class="f span"><label for="f-source">Source</label>${inpF('source', r.source, 'placeholder="world save 2024-03-01 · screenshot…"')}</div>
      <div class="f span"><label for="f-notes">Notes</label><textarea id="f-notes">${esc(r.notes || '')}</textarea></div>
    </div></div>
  </form></div>${recordFoot('road', DR.isNew)}`;
}
function readRoadFormInto(r, strict) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#rform')) return null;
  const newName = g('name').trim();
  if (!DR.isNew && r.name && newName && newName !== r.name) { const prev = recordById('road', r.id); if (prev && prev.name === r.name && !(r.formerNames || []).includes(r.name)) r.formerNames = [...(r.formerNames || []), r.name]; }
  r.name = newName; r.aliases = g('aliases').split(',').map(s => s.trim()).filter(Boolean); r.formerNames = [...new Set([...(g('formerNames').split(',').map(s => s.trim()).filter(Boolean)), ...(r.formerNames || []).filter(n => n !== r.name)])].filter(n => n !== r.name);
  r.type = g('type') || 'street'; r.grade = g('grade') || 'surface'; r.direction = g('direction') || 'two-way'; r.oneWayDir = +g('oneWayDir') === -1 ? -1 : 1; r.width = num(g('width')); r.surface = g('surface').trim();
  const op = readHY('opened'), cl = readHY('closed'); r.yearOpened = op.year; r.halfOpened = op.year != null ? op.half : ''; r.yearOpenedApprox = op.year != null && op.approx; r.yearClosed = cl.year; r.halfClosed = cl.year != null ? cl.half : '';
  r.geometry = readVertexList('v'); r.unnamed = !!$('#f-unnamed')?.checked; r.confidence = g('confidence'); r.sourceType = g('sourceType'); r.verified = !!$('#f-verified')?.checked; r.source = g('source').trim(); r.notes = g('notes');
  if (strict) { if (!r.name && !r.unnamed) return 'Give the road a name, or tick Unnamed.'; if (r.geometry.length < 2 && !DR.isNew) return 'A road needs at least two points — draw it on the map.'; if (r.yearClosed != null && r.yearOpened != null && hyIndex(r.yearClosed, r.halfClosed) < hyIndex(r.yearOpened, r.halfOpened)) return 'Closed before it opened — check the dates.'; }
  return null;
}

/* ============ TRANSIT LINES ============ */
const lineBadge = (l, cls = '') => `<span class="linebadge ${l.style || ''} ${cls}" style="--c:${esc(l.color || TRANSIT_COLORS[0])}" title="${esc(lineLabel(l))}">${esc(l.shortName || l.name || l.reg)}<span class="md">${esc(MODE_LABEL[l.mode] || l.mode)}</span></span>`;
function renderLineRecord(l) {
  const kv = kvHTML; const stops = stationsOf(l); const tracks = lineTracks(l); const roads = lineRoads(l); const issues = transitIssues().filter(i => i.kind === 'line' && i.id === l.id);
  const st = LINE_STATUS[l.status] || LINE_STATUS.open; const news = relatedNews(lineLabel(l));
  return `${hdr('TRANSIT LINE', l.reg, l.color, `<button class="btn sm" data-act="dr-edit">${icon('edit')} Edit</button>`)}
  <div class="dbody">
    <div class="rec" style="padding-top:22px">
      <div class="reg transit">${esc(l.reg)} <span class="dist" style="--c:${esc(l.color)}"><i></i>${esc(MODE_LABEL[l.mode] || l.mode)}${l.operator ? ' · ' + esc(l.operator) : ''}</span></div>
      <h2>${lineBadge(l)} ${esc(l.name)}</h2>
      <div class="badges"><span class="status ${st.tone}"><i>●</i>${st.label}</span>${openBadge(l)}<span class="code">${stops.length} stops</span><span class="code">${fmtInt(lineLength(l))} blk</span><span class="code">${esc((LINE_STYLES.find(x => x[0] === l.style) || [])[1] || 'Solid')} · ${esc(l.width)}px</span>${confHTML(l.confidence, l.verified)}</div>
    </div>
    ${issues.length ? `<div class="secthead">CHECKS</div>${issuesHTML(issues)}` : ''}
    ${lineTracks(l).length ? `<div class="secthead">ALIGNMENT HISTORY <span class="muted" style="letter-spacing:0;font-weight:400">· per track · opened, extended, removed, rebuilt</span></div>${lineTracks(l).map(t => `${lineTracks(l).length > 1 ? `<div class="desc-line" style="margin-top:8px">${esc(t.name || t.reg)}</div>` : ''}${shapeTimelineHTML(t, 'track')}`).join('')}` : ''}
    ${lineGeometries(l).length ? `<div class="minimap tall"><canvas id="minimap"></canvas><span class="coord">${fmtInt(lineLength(l))} blocks</span></div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No alignment drawn yet — <button class="rowlink" data-act="geom-map" style="font:inherit">draw it on the map</button>.</div>`}
    <div class="secthead">STOPS IN ORDER <span class="acts"><button class="btn sm" data-act="stop-add">${icon('station')} Add stop</button><button class="btn sm" data-act="stop-new-map" title="Place a new station on the map">${icon('pin')} New on map</button></span></div>
    ${stops.length ? `<div class="stoplist" style="--c:${esc(l.color)}">${stops.map((s, i) => `<div class="sp ${linesAtStation(s).length > 1 ? 'x' : ''}"><span class="dot"></span><div><div class="t" data-open="station:${s.id}" data-hover="station:${s.id}">${esc(s.name || s.reg)}</div><div class="s">${esc(STATION_KINDS.find(k => k[0] === s.kind)?.[1] || 'Station')}${linesAtStation(s).length > 1 ? ' · transfer: ' + linesAtStation(s).filter(x => x.id !== l.id).map(x => esc(x.shortName || x.name)).join(', ') : ''}${s.x != null ? ` · X ${s.x} Z ${s.z}` : ' · no coordinates'}</div></div><span class="mv"><button data-act="stop-move" data-i="${i}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button data-act="stop-move" data-i="${i}" data-dir="1" title="Move down" ${i === stops.length - 1 ? 'disabled' : ''}>${icon('down')}</button></span><button class="x2" data-act="stop-remove" data-id="${s.id}" title="Remove from this line (the station stays)">×</button></div>`).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No stops yet. Add existing stations, or place new ones on the map.</div>`}
    ${lineServiceSectionHTML(l)}
    <div class="secthead">INFRASTRUCTURE <span class="muted" style="letter-spacing:0;font-weight:400">· shared track is stored once</span></div>
    ${tracks.length || roads.length ? `<div class="rowlist">${tracks.map(t => { const sh = linesOnTrack(t).filter(x => x.id !== l.id); return `<div class="r"><div><div class="t"><span class="mk transit">TRACK</span>${esc(t.name || t.reg)}</div><div class="s">${esc(MODE_LABEL[t.mode] || t.mode)} · ${esc(GRADE_LABEL[t.grade] || t.grade)} · ${fmtInt(polyLength(t.geometry))} blk${sh.length ? ' · shared with ' + sh.map(x => esc(x.shortName || x.name)).join(', ') : ''}${t.yearOpened != null ? ' · opened ' + esc(hyLabel(t.yearOpened, t.halfOpened)) : ''}</div></div><div class="v" style="color:var(--ink-2)">${esc(t.reg)}</div></div>`; }).join('')}${roads.map(r => `<div class="r link" data-open="road:${r.id}"><div><div class="t"><span class="mk road">ROAD</span>${esc(roadLabel(r))}</div><div class="s">bus route follows this road · ${fmtInt(polyLength(r.geometry))} blk</div></div><div class="v" style="color:var(--ink-2)">${esc(r.reg)}</div></div>`).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No track or road assigned.</div>`}
    ${news.length ? `<div class="secthead">RELATED NEWS</div><div class="rowlist">${news.slice(0, 4).map(n => `<div class="r"><div><div class="t"><a href="${esc(n.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(n.title)}</a></div><div class="s">${n.published ? fmtDay(n.published) : ''}</div></div></div>`).join('')}</div>` : ''}
    <div class="secthead">PROVENANCE</div>
    <div class="kv">${kv('CONFIDENCE', confHTML(l.confidence, l.verified))}${kv('SOURCE TYPE', esc(SOURCE_LABEL[l.sourceType] || l.sourceType))}${kv('SOURCE', esc(l.source), '', true)}</div>
    ${l.notes ? `<div class="secthead">NOTES</div><div class="notes">${esc(l.notes)}</div>` : ''}
    <div class="secthead">RECORD</div>
    <div class="kv"><div><div class="k">CREATED</div><div class="v num" style="font-size:12px">${fmtDate(l.created)}</div></div><div><div class="k">UPDATED</div><div class="v num" style="font-size:12px">${fmtDate(l.updated)}</div></div><div class="span"><div class="k">INTERNAL ID</div><div class="v num" style="font-size:11px;color:var(--ink-3)">${esc(l.id)}</div></div></div>
  </div>${viewFoot('Edit line')}`;
}
function renderLineEditor(l) {
  return `<div class="dhd"><span class="t">${DR.isNew ? 'NEW TRANSIT LINE' : 'EDIT · ' + esc(l.reg)}</span><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody"><form class="form" id="lform" autocomplete="off" onsubmit="return false">
    <div class="fsect"><h4>SERVICE</h4><div class="frow c3">
      <div class="f" style="grid-column:span 2"><label for="f-name">Name</label>${inpF('name', l.name, 'placeholder="Red Line"')}</div>
      ${fld('shortName', 'Short name', inpF('shortName', l.shortName, 'placeholder="R" maxlength="6"'), 'badge label')}
      ${fld('mode', 'Mode', selF('mode', TRANSIT_MODES, l.mode))}${fld('status', 'Status', selF('status', LINE_STATUSES.map(([id, label]) => [id, label]), l.status))}${fld('operator', 'Operator', inpF('operator', l.operator, 'placeholder="New A Metro"'))}
      <div class="f"><label>Unnamed</label><label class="switch"><input type="checkbox" id="f-unnamed" ${l.unnamed ? 'checked' : ''}> <span class="muted" style="font-size:12px">shown by number</span></label></div>
    </div></div>
    <div class="fsect"><h4>APPEARANCE <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">colour · pattern · width — the label is always shown too</span></h4>
      <div class="swatchrow" id="line-swatches">${TRANSIT_COLORS.map(c => `<button type="button" data-color="${c}" aria-pressed="${(l.color || '').toLowerCase() === c.toLowerCase()}" style="--c:${c}" title="${c}"></button>`).join('')}<input type="color" id="f-color" value="${esc(/^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : TRANSIT_COLORS[0])}" title="Custom colour"></div>
      <div class="frow" style="margin-top:10px">${fld('style', 'Pattern', selF('style', LINE_STYLES, l.style))}${fld('width', 'Width', numF('width', l.width, 'min="1" max="12" step="1"'), 'pixels on the map')}</div>
    </div>
    <div class="fsect"><h4>LIFECYCLE</h4><div class="frow">
      <div class="f"><label>Opened</label>${hyControl('opened', l.yearOpened, l.halfOpened, l.yearOpenedApprox, { yearPh: '2016' })}</div>
      <div class="f"><label>Closed</label>${hyControl('closed', l.yearClosed, l.halfClosed, false, { yearPh: '—', withApprox: false })}</div>
      <div class="f"><label>Construction started</label>${hyControl('lstarted', l.yearStarted, l.halfStarted, false, { yearPh: '—', withApprox: false })}</div>
      <div class="f"><label>Expected to open <span class="hint">for lines under construction or planned</span></label>${hyControl('lexpected', l.yearExpected, l.halfExpected, false, { yearPh: '—', withApprox: false })}</div>
      ${fld('hours', 'Service hours', selF('hours', SERVICE_HOURS, l.hours || ''), '24/7 lifts nearby values the most')}${fld('hoursFrom', 'Custom from', numF('hoursFrom', l.hoursFrom, 'min="0" max="24" step="1" placeholder="hour"'))}${fld('hoursTo', 'Custom to', numF('hoursTo', l.hoursTo, 'min="0" max="24" step="1" placeholder="hour"'))}
      ${fld('costActual', 'Recorded cost', numF('costActual', l.costActual, `min="0" step="1000000" placeholder="model: ${Math.round(lineCostEstimate(l).total)}"`), '$ · blank = cost model')}
    </div></div>
    ${lineServiceEditorHTML(l)}
    <div class="fsect"><h4>INFRASTRUCTURE <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">tracks can be shared between lines · bus routes follow roads</span></h4>
      <div class="layer-rows">${S.tracks.length ? S.tracks.map(t => `<label class="lr"><span>${esc(t.name || t.reg)} <span class="d">${esc(MODE_LABEL[t.mode] || t.mode)} · ${fmtInt(polyLength(t.geometry))} blk${linesOnTrack(t).filter(x => x.id !== l.id).length ? ' · also ' + linesOnTrack(t).filter(x => x.id !== l.id).map(x => esc(x.shortName || x.name)).join(', ') : ''}</span></span><span class="switch"><input type="checkbox" data-track="${t.id}" ${(l.trackIds || []).includes(t.id) ? 'checked' : ''}></span></label>`).join('') : '<div class="desc-line">No tracks yet — draw the alignment on the map after saving.</div>'}</div>
      ${S.roads.length ? `<div class="desc-line" style="margin-top:10px">ROADS FOLLOWED (BUS / TRAM)</div><div class="layer-rows">${S.roads.map(r => `<label class="lr sub"><span>${esc(roadLabel(r))} <span class="d">${fmtInt(polyLength(r.geometry))} blk</span></span><span class="switch"><input type="checkbox" data-road="${r.id}" ${(l.roadIds || []).includes(r.id) ? 'checked' : ''}></span></label>`).join('')}</div>` : ''}
    </div>
    <div class="fsect"><h4>PROVENANCE & NOTES</h4><div class="frow c3">
      ${fld('confidence', 'Confidence', `<select id="f-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === l.confidence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
      ${fld('sourceType', 'Source type', `<select id="f-sourceType"><option value="">— none —</option>${SOURCE_TYPES.map(([id, lb]) => `<option value="${id}" ${id === l.sourceType ? 'selected' : ''}>${esc(lb)}</option>`).join('')}</select>`)}
      <div class="f"><label>Verified</label><label class="switch"><input type="checkbox" id="f-verified" ${l.verified ? 'checked' : ''}></label></div>
      <div class="f span"><label for="f-source">Source</label>${inpF('source', l.source, '')}</div>
      <div class="f span"><label for="f-notes">Notes</label><textarea id="f-notes">${esc(l.notes || '')}</textarea></div>
    </div></div>
  </form></div>${recordFoot('line', DR.isNew)}`;
}
function readLineFormInto(l, strict) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#lform')) return null;
  l.name = g('name').trim(); l.shortName = g('shortName').trim(); l.mode = g('mode') || 'subway'; l.status = g('status') || 'open'; l.operator = g('operator').trim();
  const pressed = $('#line-swatches [aria-pressed="true"]'); l.color = pressed ? pressed.dataset.color : (g('color') || TRANSIT_COLORS[0]); l.style = g('style') || 'solid'; l.width = num(g('width')) ?? 4;
  const op = readHY('opened'), cl = readHY('closed'); l.yearOpened = op.year; l.halfOpened = op.year != null ? op.half : ''; l.yearOpenedApprox = op.year != null && op.approx; l.yearClosed = cl.year; l.halfClosed = cl.year != null ? cl.half : '';
  const ls = readHY('lstarted'), le = readHY('lexpected'); l.yearStarted = ls.year; l.halfStarted = ls.year != null ? ls.half : ''; l.yearExpected = le.year; l.halfExpected = le.year != null ? le.half : ''; l.hours = g('hours'); l.hoursFrom = num(g('hoursFrom')); l.hoursTo = num(g('hoursTo')); l.costActual = num(g('costActual'));
  l.trackIds = $$('#lform [data-track]:checked').map(x => x.dataset.track); l.roadIds = $$('#lform [data-road]:checked').map(x => x.dataset.road);
  l.confidence = g('confidence'); l.sourceType = g('sourceType'); l.verified = !!$('#f-verified')?.checked; l.source = g('source').trim(); l.notes = g('notes'); l.unnamed = !!$('#f-unnamed')?.checked; readLineServiceForm(l);
  if (strict) { if (!l.name && !l.unnamed) return 'Give the line a name, or tick Unnamed.'; if (l.yearClosed != null && l.yearOpened != null && hyIndex(l.yearClosed, l.halfClosed) < hyIndex(l.yearOpened, l.halfOpened)) return 'Closed before it opened — check the dates.'; }
  return null;
}

/* ============ STATIONS ============ */
function renderStationRecord(s) {
  const kv = kvHTML; const lines = linesAtStation(s); const b = s.buildingId ? byId(s.buildingId) : null; const parent = s.parentId ? stationById(s.parentId) : null; const kids = S.stations.filter(x => x.parentId === s.id); const d = stationDistrict(s);
  return `${hdr('STATION', s.reg, 'var(--transit)', `<button class="btn sm" data-act="dr-edit">${icon('edit')} Edit</button>`)}
  <div class="dbody">
    <div class="rec" style="padding-top:22px">
      <div class="reg transit">${esc(s.reg)} <span class="dist" style="--c:var(--transit)"><i></i>${esc(STATION_KINDS.find(k => k[0] === s.kind)?.[1] || 'Station')}${d ? ' · ' + esc(d.name) : ''}</span></div>
      <h2>${esc(s.name || 'Unnamed station')}</h2>
      ${s.aliases?.length ? `<div class="nm">also ${esc(s.aliases.join(', '))}</div>` : ''}
      <div class="badges"><span class="status ${LINE_STATUS[s.status]?.tone || 'good'}"><i>●</i>${esc(LINE_STATUS[s.status]?.label || s.status)}</span>${openBadge(s)}${lines.map(l => lineBadge(l, 'sm')).join('')}${confHTML(s.confidence)}</div>
    </div>
    <div class="kv">${kv('COORDINATES', s.x != null ? `X ${esc(s.x)} · Z ${esc(s.z)}` : null, 'num')}${kv('LINES', lines.length ? lines.map(l => esc(lineLabel(l))).join(', ') : null)}
      ${kv('HOURS', esc(hoursLabel(stationHours(s), s.hours ? s : (lines[0] || {}))))}${kv('GRADE', esc(STATION_GRADES.find(g => g[0] === (s.grade || ''))?.[1] || ''))}
      ${kv('CONSTRUCTION', s.yearStarted != null || s.yearExpected != null ? `${s.yearStarted != null ? 'started ' + esc(hyLabel(s.yearStarted, s.halfStarted)) : ''}${s.yearExpected != null ? ' · expected ' + esc(hyLabel(s.yearExpected, s.halfExpected)) : ''}` : null)}${kv('COST', num(s.costActual) ? `${fmtMoney(num(s.costActual))}<small>recorded</small>` : `${fmtMoneyCompact(stationCostEstimate(s).total)}<small>model · ${esc(stationCostEstimate(s).basis)}</small>`, 'num')}
      ${kv('TRANSFERS', (s.transferIds || []).length ? s.transferIds.map(stationById).filter(Boolean).map(o => `<span class="rowlink" data-open="station:${o.id}" style="cursor:pointer">${esc(o.name || o.reg)}</span>`).join(', ') : null)}
      ${kv('IN BUILDING', b ? `<span class="rowlink" data-open="${b.id}" style="cursor:pointer">${esc(b.reg)} · ${esc(titleOf(b))}</span>` : null)}${kv('PART OF', parent ? `<span class="rowlink" data-open="station:${parent.id}" style="cursor:pointer">${esc(parent.name || parent.reg)}</span>` : null)}
    </div>
    ${s.x != null ? `<div class="minimap"><canvas id="minimap"></canvas><span class="coord">X ${esc(s.x)} · Z ${esc(s.z)}</span></div>` : ''}
    ${kids.length ? `<div class="secthead">ENTRANCES & STOPS IN THIS COMPLEX</div><div class="rowlist">${kids.map(k => `<div class="r link" data-open="station:${k.id}"><div><div class="t">${esc(k.name || k.reg)}</div><div class="s">${esc(STATION_KINDS.find(x => x[0] === k.kind)?.[1] || '')}</div></div><div class="v" style="color:var(--ink-2)">${esc(k.reg)}</div></div>`).join('')}</div>` : ''}
    ${lines.length > 1 ? `<div class="notes" style="font-size:12.5px;color:var(--ink-2)">Transfer station — ${lines.length} lines call here.</div>` : ''}
    ${s.notes ? `<div class="secthead">NOTES</div><div class="notes">${esc(s.notes)}</div>` : ''}
    <div class="secthead">RECORD</div>
    <div class="kv"><div><div class="k">CREATED</div><div class="v num" style="font-size:12px">${fmtDate(s.created)}</div></div><div><div class="k">UPDATED</div><div class="v num" style="font-size:12px">${fmtDate(s.updated)}</div></div><div class="span"><div class="k">INTERNAL ID</div><div class="v num" style="font-size:11px;color:var(--ink-3)">${esc(s.id)}</div></div></div>
  </div>${viewFoot('Edit station')}`;
}
function renderStationEditor(s) {
  return `<div class="dhd"><span class="t">${DR.isNew ? 'NEW STATION' : 'EDIT · ' + esc(s.reg)}</span><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody"><form class="form" id="sform" autocomplete="off" onsubmit="return false">
    <div class="fsect"><h4>STATION</h4><div class="frow c3">
      <div class="f" style="grid-column:span 2"><label for="f-name">Name</label>${inpF('name', s.name, 'placeholder="City Hall"')}</div>
      ${fld('kind', 'Kind', selF('kind', STATION_KINDS, s.kind))}
      ${fld('aliases', 'Aliases', inpF('aliases', (s.aliases || []).join(', '), ''), 'comma separated')}${fld('status', 'Status', selF('status', LINE_STATUSES.map(([id, label]) => [id, label]), s.status))}
      ${fld('parent', 'Part of complex', `<select id="f-parent"><option value="">— none —</option>${S.stations.filter(x => x.id !== s.id && x.kind !== 'entrance').map(x => `<option value="${x.id}" ${x.id === s.parentId ? 'selected' : ''}>${esc(x.name || x.reg)}</option>`).join('')}</select>`)}
    </div></div>
    <div class="fsect"><h4>PLACE</h4><div class="frow c3">
      ${fld('x', 'X', numF('x', s.x, 'step="1"'))}${fld('z', 'Z', numF('z', s.z, 'step="1"'))}<div class="f" style="align-self:end"><button type="button" class="btn sm" data-act="geom-map">${icon('pin')} Pick on the map</button></div>
      <div class="f span"><label for="f-building">Station building <span class="hint">optional · the registered building that houses it</span></label><select id="f-building"><option value="">— none —</option>${S.buildings.filter(isActive).slice().sort((a, b) => titleOf(a).localeCompare(titleOf(b))).map(b => `<option value="${b.id}" ${b.id === s.buildingId ? 'selected' : ''}>${esc(b.reg)} · ${esc(titleOf(b))}</option>`).join('')}</select></div>
    </div></div>
    <div class="fsect"><h4>LIFECYCLE</h4><div class="frow">
      <div class="f"><label>Opened</label>${hyControl('opened', s.yearOpened, s.halfOpened, false, { yearPh: '2016', withApprox: false })}</div>
      <div class="f"><label>Closed</label>${hyControl('closed', s.yearClosed, s.halfClosed, false, { yearPh: '—', withApprox: false })}</div>
      <div class="f"><label>Construction started</label>${hyControl('sstarted', s.yearStarted, s.halfStarted, false, { yearPh: '—', withApprox: false })}</div>
      <div class="f"><label>Expected to open</label>${hyControl('sexpected', s.yearExpected, s.halfExpected, false, { yearPh: '—', withApprox: false })}</div>
    </div><div class="frow c3" style="margin-top:8px">
      ${fld('hours', 'Service hours', selF('hours', [['', 'Same as its lines'], ...SERVICE_HOURS.slice(1)], s.hours || ''))}${fld('hoursFrom', 'Custom from', numF('hoursFrom', s.hoursFrom, 'min="0" max="24" step="1" placeholder="hour"'))}${fld('hoursTo', 'Custom to', numF('hoursTo', s.hoursTo, 'min="0" max="24" step="1" placeholder="hour"'))}
      ${fld('grade', 'Grade', selF('grade', STATION_GRADES, s.grade || ''), 'drives the cost estimate')}${fld('costActual', 'Recorded cost', numF('costActual', s.costActual, `min="0" step="1000000" placeholder="model: ${Math.round(stationCostEstimate(s).total)}"`), '$ · blank = cost model')}
    </div></div>
    <div class="fsect"><h4>PROVENANCE & NOTES</h4><div class="frow">
      ${fld('confidence', 'Confidence', `<select id="f-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === s.confidence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
      ${fld('source', 'Source', inpF('source', s.source, ''))}
      <div class="f span"><label for="f-notes">Notes</label><textarea id="f-notes">${esc(s.notes || '')}</textarea></div>
    </div></div>
  </form></div>${recordFoot('station', DR.isNew)}`;
}
function readStationFormInto(s, strict) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#sform')) return null;
  s.name = g('name').trim(); s.kind = g('kind') || 'station'; s.aliases = g('aliases').split(',').map(x => x.trim()).filter(Boolean); s.status = g('status') || 'open'; s.parentId = g('parent') || null;
  s.x = num(g('x')); s.z = num(g('z')); s.buildingId = g('building') || null; s.districtId = s.x != null ? (placeSuggest(s.x, s.z).districts[0]?.d.id || null) : null;
  const op = readHY('opened'), cl = readHY('closed'); s.yearOpened = op.year; s.halfOpened = op.year != null ? op.half : ''; s.yearClosed = cl.year; s.halfClosed = cl.year != null ? cl.half : '';
  const ss = readHY('sstarted'), se = readHY('sexpected'); s.yearStarted = ss.year; s.halfStarted = ss.year != null ? ss.half : ''; s.yearExpected = se.year; s.halfExpected = se.year != null ? se.half : ''; s.hours = g('hours'); s.hoursFrom = num(g('hoursFrom')); s.hoursTo = num(g('hoursTo')); s.grade = g('grade'); s.costActual = num(g('costActual'));
  s.confidence = g('confidence'); s.source = g('source').trim(); s.notes = g('notes');
  if (strict) { if (!s.name) return 'Give the station a name.'; if ((s.x == null) !== (s.z == null)) return 'Give both X and Z, or neither.'; }
  return null;
}

/* ============ BUSINESSES ============ */
function renderBizRecord(z) {
  const kv = kvHTML; const ts = tenanciesOf(z); const parent = z.parentId ? bizById(z.parentId) : null; const kids = childBusinesses(z); const rv = revenueSeries(z); const latest = latestRevenue(z); const url = imgUrl(z.id, 'full');
  const bs = bizBuildings(z); const near = nearbyStations(bs); const news = relatedNews(z.name, z.aliases);
  const st = BIZ_STATUS[z.status] || BIZ_STATUS.open;
  const byBuilding = new Map(); for (const t of ts) (byBuilding.get(t.buildingId) || byBuilding.set(t.buildingId, []).get(t.buildingId)).push(t);
  return `${hdr('BUSINESS', z.reg, 'var(--biz)', `<button class="btn sm" data-act="dr-edit">${icon('edit')} Edit</button>`)}
  <div class="dbody">
    <div class="photo" id="photo" tabindex="0" style="aspect-ratio:21/9" title="Drop or paste a logo or photo here">${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('biz')}No image — drop a logo or storefront screenshot here</div>`}<div class="acts"><button class="btn sm" data-act="dr-photo">${icon('img')} ${url ? 'Replace' : 'Add image'}</button>${url ? `<button class="btn sm danger" data-act="dr-photo-remove">${icon('trash')}</button>` : ''}</div></div>
    <div class="rec">
      <div class="reg biz">${esc(z.reg)} <span class="dist" style="--c:var(--biz)"><i></i>${esc(z.category || 'uncategorised')} · ${esc((ORG_TYPES.find(o => o[0] === z.orgType) || [])[1] || z.orgType)}</span></div>
      <h2>${esc(bizLabel(z))}</h2>
      ${z.aliases?.length ? `<div class="nm">also ${esc(z.aliases.join(', '))}</div>` : ''}
      <div class="badges"><span class="status ${st.tone}"><i>●</i>${st.label}</span>${z.yearOpened != null || z.yearClosed != null ? `<span class="code">${esc(hyLabel(z.yearOpened, z.halfOpened, z.yearOpenedApprox))} – ${z.yearClosed != null ? esc(hyLabel(z.yearClosed, z.halfClosed)) : 'present'}</span>` : ''}${z.ticker ? `<span class="ticker" title="${z.exchangeListed ? 'Listed on the exchange' : 'Ticker on file'}">${esc(z.ticker)}${z.exchangeListed ? ' · LISTED' : ''}${z.exchangeSince ? ' since ' + esc(z.exchangeSince) : ''}</span>` : ''}${parent ? `<span class="code" data-open="business:${parent.id}" role="button" style="cursor:pointer">part of ${esc(bizLabel(parent))}</span>` : ''}${confHTML(z.confidence, z.verified)}</div>
    </div>
    <div class="secthead">LOCATIONS <span class="acts"><button class="btn sm" data-act="biz-add-location" title="Link a building with a role">${icon('bldg')} Link building</button></span></div>
    ${byBuilding.size || (z.locations || []).length ? `<div class="rowlist">${[...byBuilding.entries()].map(([bid, list]) => { const b = byId(bid); if (!b) return ''; const d = districtById(b.districtId); return `<div class="r link" data-open="${b.id}" data-hover="${b.id}"><div><div class="t"><span class="reg ${isHist(b) ? 'reg-h' : ''}" style="font-family:var(--font-mono);font-size:11px">${esc(b.reg)}</span>${esc(titleOf(b))}${list.every(t => !t.current) ? '<span class="mk">FORMER</span>' : ''}</div><div class="s">${esc(d?.name || '')}${roadById(b.roadId) ? ' · ' + esc(roadLabel(roadById(b.roadId))) : (b.street ? ' · ' + esc(b.street) : '')} · ${list.map(t => `${ROLE_LABEL[t.role] || t.role}${t.current ? '' : ` ${t.yearFrom != null ? hyLabel(t.yearFrom, t.halfFrom) : '?'}–${t.yearTo != null ? hyLabel(t.yearTo, t.halfTo) : '?'}`}`).join(', ')}</div></div><div class="v" style="color:var(--ink-2)">${esc(d?.code || '')}</div></div>`; }).join('')}${(z.locations || []).map((loc, i) => `<div class="r"><div><div class="t"><span class="mk">PLACE</span>${esc(loc.label || '')}</div><div class="s">${esc(districtById(loc.districtId)?.name || 'district unknown')}${loc.note ? ' · ' + esc(loc.note) : ''}</div></div><span></span></div>`).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No location linked. Link the building it occupies and say in which role — owner, tenant, developer or operator — so ownership and occupancy stay separate.</div>`}
    ${kids.length ? `<div class="secthead">BRANCHES & SUBSIDIARIES <span class="muted" style="letter-spacing:0;font-weight:400">· revenue is not double-counted when the parent reports</span></div><div class="rowlist">${kids.map(k => `<div class="r link" data-open="business:${k.id}" data-hover="business:${k.id}"><div><div class="t">${esc(bizLabel(k))}</div><div class="s">${esc(BIZ_STATUS[k.status]?.label || k.status)} · ${tenanciesOf(k).length} location${tenanciesOf(k).length === 1 ? '' : 's'}</div></div><div class="v" style="color:var(--ink-2)">${esc(k.reg)}</div></div>`).join('')}</div>` : ''}
    <div class="secthead">REVENUE <span class="acts"><button class="btn sm" data-act="rev-add">${icon('plus')} Add period</button></span></div>
    ${rv.length ? `<div style="margin:10px 20px 0">${sparklineHTML(rv)}</div><div class="rowlist">${rv.slice().reverse().map(r => `<div class="r inform"><div><div class="t">${esc(hyLabel(r.year, r.half))} <span class="mk ${BASIS[r.basis]?.tone || ''}">${esc(BASIS[r.basis]?.label || r.basis || 'recorded').toUpperCase()}</span></div><div class="s">${r.source ? esc(r.source) : 'no source'}${r.note ? ' · ' + esc(truncate(r.note, 60)) : ''}</div></div><div class="v">${fmtCur(num(r.amount), r.currency)}<small>${r.currency === 'EMR' ? 'emeralds' : 'USD'}</small></div><button class="x" data-act="rev-remove" data-id="${r.id}" title="Remove">×</button></div>`).join('')}</div>${latest ? `<div class="desc-line" style="margin:8px 20px 0">Latest: ${fmtCur(num(latest.amount), latest.currency)} for ${esc(hyLabel(latest.year, latest.half))} (${esc(BASIS[latest.basis]?.label || 'recorded')}). Revenue is never inferred from property assessments or the site's simulated share prices.</div>` : ''}` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">Revenue unknown. Record a period when you have a figure, and say whether it is recorded, estimated or simulated — nothing here is inferred from assessments or share prices.</div>`}
    ${(z.marketQuotes || []).length ? (() => { const q = z.marketQuotes[z.marketQuotes.length - 1]; return `<div class="secthead">MARKET QUOTE <span class="muted" style="letter-spacing:0;font-weight:400">· simulated by the site · not revenue</span></div><div class="rowlist"><div class="r"><div><div class="t"><span class="mk">SIMULATED</span>${esc(z.ticker || bizLabel(z))}</div><div class="s">${fmtDate(q.at)}${q.source ? ' · ' + esc(q.source) : ''} · ${z.marketQuotes.length} quote${z.marketQuotes.length === 1 ? '' : 's'} on file</div></div><div class="v">${fmtCur(num(q.price), q.currency)}${q.change != null ? `<small>${q.change >= 0 ? '+' : ''}${esc(q.change)}</small>` : ''}</div></div></div>`; })() : ''}
    <div class="secthead">LISTINGS <span class="acts"><button class="btn sm" data-act="bizlisting-add">${icon('plus')} Add listing</button></span></div>
    ${(z.listings || []).length ? `<div class="rowlist">${z.listings.map(l => `<div class="r inform"><div><div class="t"><span class="mk good">${l.kind === 'lease' ? 'FOR LEASE' : 'FOR SALE'}</span>${esc(l.what || 'the business')}${l.status ? `<span class="muted">· ${esc(l.status)}</span>` : ''}</div><div class="s">${l.year != null ? 'listed ' + esc(hyLabel(l.year, l.half)) : 'undated'}${l.available ? ' · available ' + esc(l.available) : ''}${l.note ? ' · ' + esc(truncate(l.note, 60)) : ''}</div></div><div class="v">${fmtCur(num(l.price), l.currency)}</div><button class="x" data-act="bizlisting-remove" data-id="${l.id}">×</button></div>`).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No sale or lease listing. Exchange listing status is separate (ticker above).</div>`}
    ${near.length ? `<div class="secthead">NEARBY TRANSIT</div><div class="chips">${near.map(({ s, d }) => `<span class="rchip" data-open="station:${s.id}" data-hover="station:${s.id}"><span class="k">${Math.round(d)} BLK</span><b style="color:var(--transit)">${esc(s.name || s.reg)}</b><span class="t">${linesAtStation(s).map(l => esc(l.shortName || l.name)).join(', ')}</span></span>`).join('')}</div>` : ''}
    ${news.length ? `<div class="secthead">RELATED NEWS</div><div class="rowlist">${news.slice(0, 5).map(n => `<div class="r"><div><div class="t"><a href="${esc(n.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(n.title)}</a></div><div class="s">${n.published ? fmtDay(n.published) : ''} · ${esc(truncate(n.excerpt || '', 90))}</div></div></div>`).join('')}</div>` : ''}
    <div class="secthead">DETAILS</div>
    <div class="kv">${kv('WEBSITE', z.website ? `<a href="${esc(z.website)}" target="_blank" rel="noopener">${esc(z.website)}</a>` : null)}${kv('PARENT', parent ? esc(bizLabel(parent)) : null)}${kv('OPENED', z.yearOpened != null ? esc(hyLabel(z.yearOpened, z.halfOpened, z.yearOpenedApprox)) : null)}${kv('CLOSED', z.yearClosed != null ? esc(hyLabel(z.yearClosed, z.halfClosed)) : null)}${kv('CONFIDENCE', confHTML(z.confidence, z.verified))}${kv('SOURCE', esc(z.source), '', false)}</div>
    ${(z.tags || []).length ? `<div class="secthead">TAGS</div><div class="tags">${z.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${z.notes ? `<div class="secthead">NOTES</div><div class="notes">${esc(z.notes)}</div>` : ''}
    <div class="secthead">RECORD</div>
    <div class="kv"><div><div class="k">CREATED</div><div class="v num" style="font-size:12px">${fmtDate(z.created)}</div></div><div><div class="k">UPDATED</div><div class="v num" style="font-size:12px">${fmtDate(z.updated)}</div></div><div class="span"><div class="k">INTERNAL ID</div><div class="v num" style="font-size:11px;color:var(--ink-3)">${esc(z.id)}</div></div></div>
  </div>${viewFoot('Edit business')}`;
}
function renderBizEditor(z) {
  const url = imgUrl(z.id, 'full');
  return `<div class="dhd"><span class="t">${DR.isNew ? 'NEW BUSINESS' : 'EDIT · ' + esc(z.reg)}</span><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody">
    <div class="photo" id="photo" tabindex="0" style="aspect-ratio:21/9" title="Drop or paste a logo or photo here">${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('biz')}Drop a logo or storefront screenshot here</div>`}<div class="acts"><button class="btn sm" data-act="dr-photo">${icon('img')} ${url ? 'Replace' : 'Add image'}</button>${url ? `<button class="btn sm danger" data-act="dr-photo-remove">${icon('trash')}</button>` : ''}</div></div>
    <form class="form" id="zform" autocomplete="off" onsubmit="return false">
    <div class="fsect"><h4>IDENTITY</h4><div class="frow c3">
      <div class="f" style="grid-column:span 2"><label for="f-name">Name</label>${inpF('name', z.name, 'placeholder="Silvernine Properties"')}</div>
      ${fld('orgType', 'Type', selF('orgType', ORG_TYPES, z.orgType))}
      ${fld('aliases', 'Aliases', inpF('aliases', (z.aliases || []).join(', '), 'placeholder="Silvernine, SNP"'), 'comma separated')}
      ${fld('category', 'Category', `<input id="f-category" list="biz-cats" value="${esc(z.category || '')}" placeholder="Real estate"><datalist id="biz-cats">${BIZ_CATEGORIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${fld('parent', 'Parent company', `<select id="f-parent"><option value="">— none —</option>${S.businesses.filter(x => x.id !== z.id).sort((a, b) => bizLabel(a).localeCompare(bizLabel(b))).map(x => `<option value="${x.id}" ${x.id === z.parentId ? 'selected' : ''}>${esc(bizLabel(x))}</option>`).join('')}</select>`, 'where known')}
    </div></div>
    <div class="fsect"><h4>STATUS & DATES</h4><div class="frow c3">
      ${fld('status', 'Operating status', selF('status', BIZ_STATUSES.map(([id, label]) => [id, label]), z.status))}
      <div class="f" style="grid-column:span 2"><label>Opened</label>${hyControl('opened', z.yearOpened, z.halfOpened, z.yearOpenedApprox, { yearPh: '2019' })}</div>
      <div class="f span"><label>Closed <span class="hint">leave empty while operating</span></label>${hyControl('closed', z.yearClosed, z.halfClosed, false, { yearPh: '—', withApprox: false })}</div>
    </div></div>
    <div class="fsect"><h4>MARKET <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">exchange listing is separate from sale / lease listings</span></h4><div class="frow c3">
      ${fld('ticker', 'Ticker', inpF('ticker', z.ticker, 'placeholder="SNP" style="text-transform:uppercase;font-family:var(--font-mono)"'))}
      <div class="f"><label>Listed on the exchange</label><label class="switch"><input type="checkbox" id="f-exchangeListed" ${z.exchangeListed ? 'checked' : ''}></label></div>
      ${fld('exchangeSince', 'Listed since', numF('exchangeSince', z.exchangeSince, 'placeholder="2025" min="1990" max="2200"'))}
      ${fld('website', 'Website', inpF('website', z.website, 'placeholder="https://…"'))}
    </div></div>
    <div class="fsect"><h4>OTHER LOCATIONS <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">places without a registered building · buildings are linked from the record view</span></h4>
      <div id="f-locs">${(z.locations || []).map((l, i) => `<div class="frow c3" style="margin-bottom:6px"><input data-loc="${i}" data-lk="label" value="${esc(l.label || '')}" placeholder="Stall at the market…" class="f-loc"><select data-loc="${i}" data-lk="districtId" class="f-loc"><option value="">— district —</option>${S.districts.map(d => `<option value="${d.id}" ${d.id === l.districtId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><div style="display:flex;gap:6px"><input data-loc="${i}" data-lk="note" value="${esc(l.note || '')}" placeholder="note" class="f-loc" style="flex:1"><button type="button" class="btn sm ghost" data-act="loc-remove" data-i="${i}">${icon('x')}</button></div></div>`).join('')}</div>
      <button type="button" class="btn sm" data-act="loc-add">${icon('plus')} Location</button>
    </div>
    <div class="fsect"><h4>PROVENANCE & NOTES</h4><div class="frow c3">
      ${fld('confidence', 'Confidence', `<select id="f-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === z.confidence ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
      ${fld('sourceType', 'Source type', `<select id="f-sourceType"><option value="">— none —</option>${SOURCE_TYPES.map(([id, lb]) => `<option value="${id}" ${id === z.sourceType ? 'selected' : ''}>${esc(lb)}</option>`).join('')}</select>`)}
      <div class="f"><label>Verified</label><label class="switch"><input type="checkbox" id="f-verified" ${z.verified ? 'checked' : ''}></label></div>
      <div class="f span"><label for="f-source">Source</label>${inpF('source', z.source, 'placeholder="in-game sign · article URL · Discord"')}</div>
      <div class="f span"><label for="f-tags">Tags <span class="hint">space separated</span></label>${inpF('tags', (z.tags || []).join(' '), '')}</div>
      <div class="f span"><label for="f-notes">Notes</label><textarea id="f-notes">${esc(z.notes || '')}</textarea></div>
    </div></div>
  </form></div>${recordFoot('business', DR.isNew)}`;
}
function readBizFormInto(z, strict) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#zform')) return null;
  z.name = g('name').trim(); z.orgType = g('orgType') || 'company'; z.aliases = g('aliases').split(',').map(s => s.trim()).filter(Boolean); z.category = g('category').trim(); z.parentId = g('parent') || null;
  z.status = g('status') || 'open'; const op = readHY('opened'), cl = readHY('closed'); z.yearOpened = op.year; z.halfOpened = op.year != null ? op.half : ''; z.yearOpenedApprox = op.year != null && op.approx; z.yearClosed = cl.year; z.halfClosed = cl.year != null ? cl.half : '';
  z.ticker = g('ticker').trim().toUpperCase(); z.exchangeListed = !!$('#f-exchangeListed')?.checked; z.exchangeSince = num(g('exchangeSince')); z.website = g('website').trim();
  const locs = []; const n = $$('#f-locs [data-loc][data-lk="label"]').length; for (let i = 0; i < n; i++) { const v = k => $(`#f-locs [data-loc="${i}"][data-lk="${k}"]`)?.value ?? ''; if (v('label').trim() || v('districtId')) locs.push({ label: v('label').trim(), districtId: v('districtId') || null, note: v('note').trim() }); } z.locations = locs;
  z.confidence = g('confidence'); z.sourceType = g('sourceType'); z.verified = !!$('#f-verified')?.checked; z.source = g('source').trim(); z.tags = g('tags').split(/[\s,]+/).map(t => t.trim().toLowerCase()).filter(Boolean); z.notes = g('notes');
  if (strict) { if (!z.name) return 'Give the business a name.'; if (z.parentId === z.id) return 'A business cannot be its own parent.'; if (z.yearClosed != null && z.yearOpened != null && hyIndex(z.yearClosed, z.halfClosed) < hyIndex(z.yearOpened, z.halfOpened)) return 'Closed before it opened — check the dates.'; if (z.yearClosed != null && z.status === 'open') return 'A closed date needs the status Closed or Relocated.'; }
  return null;
}
function sparklineHTML(series) {
  const pts = series.filter(r => num(r.amount) != null); if (pts.length < 2) return '';
  const W = 300, H = 48, max = Math.max(...pts.map(r => num(r.amount))), min = Math.min(0, ...pts.map(r => num(r.amount)));
  const X = i => 6 + i * (W - 12) / (pts.length - 1), Y = v => 4 + (H - 10) * (1 - (v - min) / ((max - min) || 1));
  const d = pts.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(num(r.amount)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Revenue trend"><path class="a" d="${d}L${X(pts.length - 1)} ${H - 4}L${X(0)} ${H - 4}Z"/><path d="${d}"/>${pts.map((r, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(num(r.amount)).toFixed(1)}" r="3" class="${r.basis === 'estimated' ? 'est' : r.basis === 'simulated' ? 'sim' : ''}" data-tip="${esc(hyLabel(r.year, r.half))}: ${fmtCur(num(r.amount), r.currency)} · ${esc(BASIS[r.basis]?.label || 'recorded')}"/>`).join('')}</svg>`;
}
function nearbyStations(buildings, within = 60) {
  const out = new Map();
  for (const b of buildings) { if (b.x == null) continue; for (const s of S.stations) { if (s.x == null) continue; const d = dist2([b.x, b.z], [s.x, s.z]); if (d <= within && (!out.has(s.id) || out.get(s.id).d > d)) out.set(s.id, { s, d }); } }
  return [...out.values()].sort((a, b) => a.d - b.d).slice(0, 6);
}
function relatedNews(name, aliases = []) {
  const names = [name, ...(aliases || [])].map(norm).filter(n => n && n.length >= 3);
  if (!names.length) return [];
  return (S.news.items || []).filter(it => { const hay = norm(it.title + ' ' + (it.excerpt || '') + ' ' + (it.content || '')); return names.some(n => hay.includes(n)); }).sort((a, b) => (b.published || '').localeCompare(a.published || ''));
}
/* revenue / listing sub-dialogs (record view; saved at once) */
async function revenueDialog(z) {
  return new Promise(res => {
    openModal({ title: `Revenue · ${bizLabel(z)}`, kicker: 'ONE PERIOD', cls: 'narrow',
      body: `<div class="frow" style="margin-top:12px">
        <div class="f span"><label>Period</label><div class="hy"><select id="rv-h">${HALVES.map(h => `<option value="${h.id}" ${h.id === '' ? 'selected' : ''}>${h.id ? h.label : 'Whole year'}</option>`).join('')}</select><input id="rv-y" type="number" value="${CURRENT_YEAR}" min="1990" max="2200"></div></div>
        <div class="f"><label>Amount</label><input id="rv-amt" type="number" min="0" step="1" placeholder="0" class="num"></div>
        <div class="f"><label>Currency</label><select id="rv-cur">${CURRENCIES.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></div>
        <div class="f span"><label>Basis <span class="hint">how this number was obtained</span></label><select id="rv-basis">${REVENUE_BASIS.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></div>
        <div class="f span"><label>Source</label><input id="rv-src" placeholder="ledger screenshot 2026-06 · article URL · own estimate"></div>
        <div class="f span"><label>Note</label><input id="rv-note" placeholder="optional"></div></div>
        <div class="callout info" style="margin-top:12px">Recorded = seen in a ledger or receipt · Estimated = your reasoned guess · Simulated = produced by the site's market simulation. Simulated values never roll into totals as fact.</div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">Add</button>`,
      onOpen: m => { const done = r => { const v = { id: uid('rv'), year: num(m.querySelector('#rv-y').value), half: m.querySelector('#rv-h').value, amount: num(m.querySelector('#rv-amt').value), currency: m.querySelector('#rv-cur').value, basis: m.querySelector('#rv-basis').value, source: m.querySelector('#rv-src').value.trim(), note: m.querySelector('#rv-note').value.trim(), added: now() }; closeModal(); if (r !== 'ok') return res(null); if (v.year == null || v.amount == null) { toast('A period and an amount are needed', 'warn'); return res(null); } res(v); }; m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r)); m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel'); } });
  });
}
async function listingDialog({ title, forBusiness = false, kind = 'sale', tx = false }) {
  return new Promise(res => {
    openModal({ title, kicker: tx ? 'TRANSACTION' : 'LISTING', cls: 'narrow',
      body: `<div class="frow" style="margin-top:12px">
        <div class="f"><label>Kind</label><select id="ls-kind">${LISTING_KINDS.map(([id, l]) => `<option value="${id}" ${id === kind ? 'selected' : ''}>${tx ? (id === 'sale' ? 'Sold' : 'Leased') : esc(l)}</option>`).join('')}</select></div>
        <div class="f"><label>${tx ? 'Agreed price' : 'Asking price'}</label><input id="ls-price" type="number" min="0" step="1" class="num" placeholder="0"></div>
        <div class="f"><label>Currency</label><select id="ls-cur">${CURRENCIES.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></div>
        <div class="f"><label>${tx ? 'When' : 'Listed'}</label><div class="hy"><select id="ls-h">${HALVES.map(h => `<option value="${h.id}">${h.label}</option>`).join('')}</select><input id="ls-y" type="number" value="${CURRENT_YEAR}" min="1990" max="2200"></div></div>
        ${forBusiness ? `<div class="f span"><label>What is offered</label><input id="ls-what" placeholder="the business · the lease · 40% stake"></div>` : ''}
        ${tx ? `<div class="f span"><label>Other party</label><input id="ls-party" placeholder="buyer / tenant"></div>` : `<div class="f"><label>Status</label><select id="ls-status"><option value="active">Active</option><option value="under-offer">Under offer</option><option value="withdrawn">Withdrawn</option><option value="closed">Closed</option></select></div><div class="f"><label>Available</label><input id="ls-avail" placeholder="now · Late 2026"></div>`}
        <div class="f span"><label>Note</label><input id="ls-note" placeholder="optional"></div></div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">Add</button>`,
      onOpen: m => { const q = s => m.querySelector(s); const done = r => { const v = { id: uid('ls'), kind: q('#ls-kind').value, price: num(q('#ls-price').value), currency: q('#ls-cur').value, year: num(q('#ls-y').value), half: ['E', 'L'].includes(q('#ls-h').value) ? q('#ls-h').value : '', what: q('#ls-what')?.value.trim(), party: q('#ls-party')?.value.trim(), status: q('#ls-status')?.value, available: q('#ls-avail')?.value.trim(), note: q('#ls-note').value.trim(), added: now() }; closeModal(); res(r === 'ok' ? v : null); }; m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r)); m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel'); } });
  });
}

/* ============ new-record flows, saving, deleting ============ */
function newBusinessFlow(preset = {}) {
  preset = stampedPreset(preset);
  const z = newBusiness({ meta: { gseq: { ...S.meta.gseq } } }); z.reg = ''; Object.assign(z, preset);
  DR.id = z.id; DR.kind = 'business'; DR.mode = 'edit'; DR.isNew = true; DR.draft = z; DR.stack = []; UI.selected = null;
  renderDrawer(); showDrawer(); setTimeout(() => $('#f-name')?.focus(), 80);
}
function newLineFlow(preset = {}) {
  preset = stampedPreset(preset);
  const l = newLine({ meta: { gseq: { ...S.meta.gseq } }, lines: S.lines }); l.reg = ''; Object.assign(l, preset);
  DR.id = l.id; DR.kind = 'line'; DR.mode = 'edit'; DR.isNew = true; DR.draft = l; DR.stack = []; UI.selected = null;
  renderDrawer(); showDrawer(); setTimeout(() => $('#f-name')?.focus(), 80);
}
function newStationFlow(preset = {}) {
  preset = stampedPreset(preset);
  const s = newStation({ meta: { gseq: { ...S.meta.gseq } } }); s.reg = ''; Object.assign(s, preset);
  DR.id = s.id; DR.kind = 'station'; DR.mode = 'edit'; DR.isNew = true; DR.draft = s; DR.stack = []; UI.selected = null;
  renderDrawer(); showDrawer(); setTimeout(() => $('#f-name')?.focus(), 80);
}
function newRoadFlow(preset = {}) {
  preset = stampedPreset(preset);
  const r = newRoad({ meta: { gseq: { ...S.meta.gseq } } }); r.reg = ''; Object.assign(r, preset);
  DR.id = r.id; DR.kind = 'road'; DR.mode = 'edit'; DR.isNew = true; DR.draft = r; DR.stack = []; UI.selected = null;
  renderDrawer(); showDrawer(); setTimeout(() => $('#f-name')?.focus(), 80);
}
function saveOtherDrawer() {
  const err = readAnyFormInto(DR.draft, true); if (err) { toast(err, 'warn'); focusFieldFor(err); return; }
  const d = DR.draft; d.updated = now(); const coll = S[COLL_OF[DR.kind]]; const prefix = { road: 'RD', line: 'TL', station: 'ST', business: 'BZ' }[DR.kind];
  if (DR.isNew) { d.reg = nextGlobal(S, prefix); d.created = now(); coll.push(d); toast(`${d.reg} created`, 'good'); }
  else { const i = coll.findIndex(x => x.id === d.id); const prev = coll[i]; if (DR.kind === 'road' && prev.name !== d.name && prev.name) toast(`Renamed — “${prev.name}” kept as a former name`, 'good'); else toast('Saved', 'good'); coll[i] = d; }
  commit(); DR.mode = 'view'; DR.isNew = false; DR.draft = null; UI.selected = d.id;
  renderView(false); renderDrawer();
  if (DR.kind === 'road') offerNameLinks(d);
}
async function deleteOther(kind, id) {
  const rec = recordById(kind, id); if (!rec) return; const label = kind === 'road' ? roadLabel(rec) : kind === 'line' ? lineLabel(rec) : kind === 'business' ? bizLabel(rec) : (rec.name || rec.reg);
  const refs = kind === 'road' ? `${buildingsOnRoad(rec).length} buildings lose their road association; bus routes stop following it.` : kind === 'station' ? `It is removed from ${linesAtStation(rec).length} line(s); entrances under it become standalone.` : kind === 'business' ? `${tenanciesOf(rec).length} tenancy record(s) are removed; branches lose their parent.` : `Its tracks stay on file for other lines.`;
  const r = await confirmDialog({ title: `Delete ${esc(label)}?`, body: `<p>${refs} You can undo for a few seconds.</p>`, ok: 'Delete', danger: true });
  if (r !== 'ok') return;
  const coll = S[COLL_OF[kind]]; const idx = coll.indexOf(rec); const undo = [];
  if (kind === 'road') { for (const b of S.buildings) if (b.roadId === id) { undo.push(() => b.roadId = id); b.roadId = null; } for (const l of S.lines) if ((l.roadIds || []).includes(id)) { const old = l.roadIds.slice(); undo.push(() => l.roadIds = old); l.roadIds = l.roadIds.filter(x => x !== id); } }
  if (kind === 'station') { for (const l of S.lines) if ((l.stopIds || []).includes(id)) { const old = l.stopIds.slice(); undo.push(() => l.stopIds = old); l.stopIds = l.stopIds.filter(x => x !== id); } for (const s of S.stations) if (s.parentId === id) { undo.push(() => s.parentId = id); s.parentId = null; } for (const s of S.stations) if ((s.transferIds || []).includes(id)) { const old = s.transferIds.slice(); undo.push(() => s.transferIds = old); s.transferIds = s.transferIds.filter(x => x !== id); } }
  if (kind === 'business') { const tens = S.tenancies.filter(t => t.businessId === id); undo.push(() => S.tenancies.push(...tens)); S.tenancies = S.tenancies.filter(t => t.businessId !== id); for (const z of S.businesses) if (z.parentId === id) { undo.push(() => z.parentId = id); z.parentId = null; } }
  const imgRec = rec.image ? await idbGet('images', rec.id) : null;
  coll.splice(idx, 1); if (rec.image) await removeBuildingImage({ ...rec });
  closeDrawer(true); commit(); renderView(false);
  toast(`${label} deleted`, 'warn', { label: 'UNDO', fn: async () => { coll.splice(Math.min(idx, coll.length), 0, rec); for (const u of undo) u(); if (imgRec) { await idbPut('images', rec.id, imgRec); setImgUrls(rec.id, imgRec); rec.image = true; SAVE.dirtyImages.add(rec.id); SAVE.deletedImages.delete(rec.id); } commit(); renderView(false); } });
}

/* ---- mini-maps inside record cards ---- */
function miniCanvas(c, { polylines = [], points = [], polys = [] }) {
  const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); c.width = r.width * dpr; c.height = r.height * dpr;
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const W = r.width, H = r.height;
  const all = [...polylines.flatMap(p => p.pts), ...points.map(p => [p.x, p.z]), ...polys.flatMap(p => p.pts)]; const ext = bboxOf(all); if (!ext) return;
  const span = Math.max(60, ext.x2 - ext.x1, ext.z2 - ext.z1) * 1.25; const k = Math.min(W, H) / span; const cx = (ext.x1 + ext.x2) / 2, cz = (ext.z1 + ext.z2) / 2;
  const P = (x, z) => [(x - cx) * k + W / 2, (z - cz) * k + H / 2];
  ctx.fillStyle = '#05090D'; ctx.fillRect(0, 0, W, H);
  for (const p of polys) { ctx.beginPath(); p.pts.forEach((pt, i) => { const [x, y] = P(pt[0], pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = hexA(p.color, .08); ctx.fill(); ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.stroke(); }
  for (const o of S.buildings) { if (o.x == null) continue; const [x, y] = P(o.x, o.z); if (x < 0 || y < 0 || x > W || y > H) continue; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(147,169,184,.45)'; ctx.fill(); }
  for (const pl of polylines) { if (pl.pts.length < 2) continue; ctx.beginPath(); pl.pts.forEach((pt, i) => { const [x, y] = P(pt[0], pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = pl.color; ctx.lineWidth = pl.width || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(pl.dash || []); ctx.stroke(); ctx.setLineDash([]); }
  for (const p of points) { const [x, y] = P(p.x, p.z); ctx.beginPath(); ctx.arc(x, y, p.r || 5, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, (p.r || 5) + 5, 0, Math.PI * 2); ctx.strokeStyle = hexA(p.color, .5); ctx.lineWidth = 1; ctx.stroke(); }
}
function drawMiniMap(b) {
  const c = $('#minimap'); if (!c || b.x == null) return;
  const d = districtById(b.districtId), h = hoodById(b.neighborhoodId);
  const polys = []; if (h?.polygons?.length) for (const p of h.polygons) polys.push({ pts: p, color: distColor(d) }); else if (d?.polygons?.length) for (const p of d.polygons) polys.push({ pts: p, color: distColor(d) });
  const polylines = []; const r = roadById(b.roadId); if (r?.geometry?.length) polylines.push({ pts: r.geometry, color: '#8AA4B8', width: 2 });
  if (b.footprint) polys.push({ pts: b.footprint, color: '#4FE3FF' });
  miniCanvas(c, { polys, polylines, points: [{ x: b.x, z: b.z, color: '#4FE3FF' }, ...(b.entrance?.x != null ? [{ x: b.entrance.x, z: b.entrance.z, color: '#FFB454', r: 3 }] : [])] });
}
function drawMiniMapFor(kind, rec) {
  const c = $('#minimap'); if (!c) return;
  if (kind === 'road') miniCanvas(c, { polylines: [{ pts: rec.geometry, color: ROAD_COLORS[rec.type] || '#8AA4B8', width: Math.max(2, Math.min(6, (rec.width || 5) / 2)) }], points: buildingsOnRoad(rec).filter(b => b.x != null).map(b => ({ x: b.x, z: b.z, color: '#4FE3FF', r: 3 })) });
  else if (kind === 'line') miniCanvas(c, { polylines: lineGeometries(rec).map(g => ({ pts: g, color: rec.color, width: 3, dash: rec.style === 'dashed' ? [8, 6] : rec.style === 'dotted' ? [2, 5] : [] })), points: stationsOf(rec).filter(s => s.x != null).map(s => ({ x: s.x, z: s.z, color: '#F6F6F6', r: 3 })) });
  else if (kind === 'station') miniCanvas(c, { polylines: linesAtStation(rec).flatMap(l => lineGeometries(l).map(g => ({ pts: g, color: l.color, width: 2 }))), points: [{ x: rec.x, z: rec.z, color: '#B99CFF' }] });
}
