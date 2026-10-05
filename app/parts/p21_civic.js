/* =====================================================================
   §21 CIVIC — hospitals · police · fire · city halls · government offices ·
       official residences · coverage · the officials and where they live
       Everything here is derived from buildings that carry a `civic` block
       and from the `officials` collection. Nothing is inferred silently.
   ===================================================================== */
UI.cseg = 'facilities'; UI.cq = ''; UI.cf = { type: '', status: '', all: false };
UI.layers.civic = true; UI.layers.sandbox = true;
const CIVIC_COLORS = { hospital: '#FF6B6B', clinic: '#FF9D9D', police: '#5B8CFF', fire: '#FF8A3D', 'city-hall': '#E7C36A', 'white-house': '#F6F6F6', capitol: '#E7C36A', courthouse: '#D9B45A', 'gov-office': '#B99CFF', 'post-office': '#7FB2FF', school: '#5FE38E', university: '#39D98A', library: '#C2DE5A', park: '#2E9E52', 'transit-hub': '#4FE3FF', utility: '#9C8600', prison: '#8E8E8E', embassy: '#CFA7FF', military: '#7A8A2E', residence: '#FF86CF', monument: '#F0BC7A', other: '#A9B8C7' };
const civicColor = type => CIVIC_COLORS[type] || CIVIC_COLORS.other;
/* reach, in straight-line blocks, within which an essential facility counts as covering a building (editable here, documented in the Coverage tab) */
const COVERAGE_RADIUS = { hospital: 250, police: 200, fire: 150, clinic: 150, park: 100, school: 120 };

const civicOf = b => b && b.civic && b.civic.type ? b.civic : null;
const isCivic = b => !!civicOf(b);
const civicOperating = b => { const c = civicOf(b); return !!c && (c.status || 'operating') === 'operating' && (b.physical || 'standing') === 'standing'; };
function civicRows(sc = UI.scope, { all = false } = {}) { const rows = all ? S.buildings : scopeBuildings(sc); return rows.filter(b => isCivic(b) && !isHist(b)); }
function civicFiltered(rows) { let out = rows; const f = UI.cf; const q = norm(UI.cq); if (f.type) out = out.filter(b => civicOf(b).type === f.type); if (f.status) out = out.filter(b => (civicOf(b).status || 'operating') === f.status); if (q) out = out.filter(b => Math.max(fuzzyScore(q, b.name), fuzzyScore(q, addressOf(b)), fuzzyScore(q, b.reg), fuzzyScore(q, civicTypeLabel(civicOf(b).type))) >= 0.3); return out.sort((a, b) => civicTypeLabel(civicOf(a).type).localeCompare(civicTypeLabel(civicOf(b).type)) || titleOf(a).localeCompare(titleOf(b))); }

/* ---- officials ---- */
const officeOf = o => o.officeBuildingId ? byId(o.officeBuildingId) : null;
const residenceOf = o => o.residenceBuildingId ? byId(o.residenceBuildingId) : null;
const officialsOf = b => S.officials.filter(o => o.officeBuildingId === b.id || o.residenceBuildingId === b.id);
const officialStatus = o => { const s = OFFICIAL_STATUSES.find(x => x[0] === o.status) || OFFICIAL_STATUSES[0]; return { id: s[0], label: s[1], tone: s[2] }; };
const officialLabel = o => `${o.office || 'Official'}${o.name ? ' · ' + o.name : ''}`;
function jurisdictionInScope(jid, sc = UI.scope) {
  if (!sc || sc.kind === 'all') return true; const node = nodeById(jid); if (!node) return false;
  if (node.id === sc.id) return true;
  if (sc.kind === 'region') { try { return ancestorsOf(node).some(a => a.id === sc.id) || (node.districtId && ancestorsOf(districtById(node.districtId) || {}).some(a => a.id === sc.id)); } catch { return false; } }
  if (sc.kind === 'district') return node.districtId === sc.id;
  return false;
}
function officialsIn(sc = UI.scope) {
  if (!sc || sc.kind === 'all') return S.officials;
  const ids = scopeDistrictIds(sc);
  return S.officials.filter(o => (o.jurisdictionId && jurisdictionInScope(o.jurisdictionId, sc)) || [officeOf(o), residenceOf(o)].filter(Boolean).some(b => ids.has(b.districtId)));
}
function termLabel(o) { const a = o.termFromYear != null ? hyLabel(o.termFromYear, o.termFromHalf) : null, b = o.termToYear != null ? hyLabel(o.termToYear, o.termToHalf) : null; if (!a && !b) return ''; return `${a || '?'} → ${b || (o.status === 'former' ? '?' : 'present')}`; }

/* ---- coverage: nearest operating facility of each essential type ---- */
function nearestCivic(pt, type, { operating = true, extra = [] } = {}) {
  let best = null;
  for (const b of S.buildings) { const c = civicOf(b); if (!c || c.type !== type || b.x == null || isHist(b)) continue; if (operating && !civicOperating(b)) continue; const d = dist2(pt, [b.x, b.z]); if (!best || d < best.d) best = { b, d }; }
  for (const e of extra) if (e.type === type && e.x != null) { const d = dist2(pt, [e.x, e.z]); if (!best || d < best.d) best = { b: e, d, sandbox: true }; }
  return best;
}
function coverageOf(b, opts = {}) { if (b.x == null || b.z == null) return null; const pt = [b.x, b.z]; const out = {}; for (const t of ESSENTIAL_CIVIC) { const n = nearestCivic(pt, t, opts); out[t] = n ? { d: n.d, b: n.b, within: n.d <= COVERAGE_RADIUS[t] } : { d: null, b: null, within: false }; } return out; }
function coverageReport(sc = UI.scope, opts = {}) {
  const rows = scopeActive(sc); const placed = rows.filter(b => b.x != null && b.z != null);
  const types = {}; for (const t of ESSENTIAL_CIVIC) types[t] = { covered: 0, dists: [], gaps: [] };
  let fully = 0;
  for (const b of placed) { const cov = coverageOf(b, opts); let all = true; for (const t of ESSENTIAL_CIVIC) { const c = cov[t]; if (c.within) types[t].covered++; else { all = false; types[t].gaps.push({ b, d: c.d }); } if (c.d != null) types[t].dists.push(c.d); } if (all) fully++; }
  for (const t of ESSENTIAL_CIVIC) { const T = types[t]; T.pct = pct(T.covered, placed.length); T.avg = T.dists.length ? Math.round(T.dists.reduce((a, x) => a + x, 0) / T.dists.length) : null; T.gaps.sort((a, b) => (b.d ?? 1e9) - (a.d ?? 1e9)); T.facilities = civicRows(sc, { all: true }).filter(b => civicOf(b).type === t && civicOperating(b)).length; }
  const children = scopeChildren(sc);
  const places = children.map(c => { const rs = scopeBuildingsOf(c).filter(b => isActive(b) && b.x != null); let n = 0; const by = {}; for (const t of ESSENTIAL_CIVIC) by[t] = 0; for (const b of rs) { const cov = coverageOf(b, opts); let all = true; for (const t of ESSENTIAL_CIVIC) { if (cov[t].within) by[t]++; else all = false; } if (all) n++; } return { c, name: c.node.name, color: childColor(c), n: rs.length, fully: n, pct: pct(n, rs.length), by }; }).sort((a, b) => b.pct - a.pct);
  const score = placed.length ? Math.round(ESSENTIAL_CIVIC.reduce((a, t) => a + types[t].pct, 0) / ESSENTIAL_CIVIC.length) : 0;
  return { n: rows.length, placed: placed.length, unplaced: rows.length - placed.length, types, places, fully, score };
}

/* ---- issues (joined into allIssues) ---- */
function civicIssues(sc = UI.scope) {
  const out = [];
  for (const b of scopeBuildings(sc)) {
    const c = civicOf(b); if (!c) continue; const base = { kind: 'building', id: b.id, reg: b.reg, title: titleOf(b) };
    if (!CIVIC_BY_ID[c.type]) out.push({ ...base, level: 'warn', text: `Unknown civic type “${c.type}”.` });
    if ((c.status || 'operating') === 'operating' && (b.physical || 'standing') !== 'standing') out.push({ ...base, level: 'warn', text: `Civic facility marked operating but the building is ${physicalOf(b.physical).label.toLowerCase()}.` });
    if (ESSENTIAL_CIVIC.includes(c.type) && b.x == null) out.push({ ...base, level: 'info', text: `${civicTypeLabel(c.type)} without coordinates — left out of coverage.` });
  }
  const nowI = hyIndex(CURRENT_YEAR, CURRENT_HALF);
  for (const o of officialsIn(sc)) {
    const base = { kind: 'official', id: o.id, reg: o.reg, title: officialLabel(o) };
    if (o.officeBuildingId && !byId(o.officeBuildingId)) out.push({ ...base, level: 'warn', text: 'Office building no longer exists in the registry.' });
    if (o.residenceBuildingId && !byId(o.residenceBuildingId)) out.push({ ...base, level: 'warn', text: 'Residence no longer exists in the registry.' });
    if (o.status === 'serving' && o.termToYear != null && hyIndex(o.termToYear, o.termToHalf) < nowI) out.push({ ...base, level: 'warn', text: `Still marked serving but the term ended ${hyLabel(o.termToYear, o.termToHalf)}.` });
    if (o.status === 'serving' && !o.residenceBuildingId) out.push({ ...base, level: 'info', text: 'No official residence recorded.' });
    if (o.status === 'serving' && !o.officeBuildingId) out.push({ ...base, level: 'info', text: 'No office building recorded.' });
  }
  return out;
}

/* ---- the Civic page ---- */
function renderCivic() {
  const sc = UI.scope; const all = civicRows(sc, { all: UI.cf.all }); const rows = civicFiltered(all); const offs = UI.cf.all ? S.officials : officialsIn(sc); const cov = coverageReport(sc); const issues = civicIssues(sc);
  const operating = all.filter(civicOperating); const serving = offs.filter(o => o.status === 'serving'); const homes = serving.filter(o => residenceOf(o)).length;
  const byType = t => all.filter(b => civicOf(b).type === t && civicOperating(b)).length;
  const tile = (lbl, val, sub = '', cls = '') => `<div class="panel tile ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  const seg = UI.cseg;
  return `
  <section class="dhead" style="margin-bottom:14px">
    <div><div class="code civic"><i></i>CIVIC · ${esc(scopeName().toUpperCase())} · ${all.length} FACILITIES · ${serving.length} OFFICIALS SERVING</div><h2>Civic</h2><p>The public fabric of the city: hospitals, police and fire stations, city halls, the White House, courts, schools, parks — with status, capacity and jurisdiction — and the officials who run it, where they work and where they live. Coverage is measured in straight-line blocks to the nearest <b>operating</b> facility; nothing is assumed about staffing or hours.</p></div>
    <div class="stats"><button class="btn sm" data-act="civic-map">${icon('map')} Show on the map</button><button class="btn sm" data-act="official-new">${icon('plus')} New official</button><button class="btn sm primary" data-act="civic-new">${icon('civic')} Mark a building civic</button></div>
  </section>
  <section class="tiles">
    ${tile('FACILITIES', `<span class="count" data-to="${all.length}">0</span>`, `${operating.length} operating · ${all.filter(b => (civicOf(b).status || '') === 'construction' || (civicOf(b).status || '') === 'planned').length} under way`, 'civic')}
    ${tile('HOSPITALS', `<span class="count" data-to="${byType('hospital')}">0</span>`, `${byType('clinic')} clinics · beds ${fmtInt(all.filter(b => civicOf(b).type === 'hospital').reduce((a, b) => a + (num(civicOf(b).capacity) || 0), 0))}`)}
    ${tile('POLICE · FIRE', `<span class="count" data-to="${byType('police') + byType('fire')}">0</span>`, `${byType('police')} police · ${byType('fire')} fire stations`)}
    ${tile('GOVERNMENT', `<span class="count" data-to="${byType('city-hall') + byType('white-house') + byType('capitol') + byType('courthouse') + byType('gov-office')}">0</span>`, `${byType('city-hall')} city hall${byType('city-hall') === 1 ? '' : 's'} · ${byType('white-house')} White House · ${byType('courthouse')} courts`)}
    ${tile('OFFICIALS', `<span class="count" data-to="${serving.length}">0</span>`, `${homes} with a home on file · ${offs.filter(o => o.status === 'former').length} former`)}
    ${tile('ESSENTIAL COVERAGE', `<span class="count" data-to="${cov.score}">0</span><small>%</small>`, cov.placed ? `${cov.fully} of ${cov.placed} placed buildings reach all three` : 'no placed buildings', cov.score >= 70 ? 'good' : cov.score >= 40 ? 'money' : '')}
  </section>
  <div class="toolbar" style="margin:0 0 14px">
    <div class="seg lg" role="group">${[['facilities', 'Facilities', 'civic', all.length], ['officials', 'Officials & homes', 'home', offs.length], ['coverage', 'Coverage', 'shield', `${cov.score}%`], ['checks', 'Checks', 'warn', issues.length]].map(([id, l, ic, n]) => `<button data-cseg="${id}" aria-pressed="${seg === id}" class="${seg === id ? 'civic' : ''}">${icon(ic)} ${l} <span class="cnt" style="font-family:var(--font-mono);font-size:11px;opacity:.8">${n}</span></button>`).join('')}</div>
    ${seg === 'facilities' ? `<label class="field"><span>Find</span><input id="cq" value="${esc(UI.cq)}" placeholder="name, address, type…" style="width:170px"></label>
    <label class="field ${UI.cf.type ? 'on' : ''}"><span>Type</span><select data-cf="type"><option value="">Any</option>${CIVIC_TYPES.map(t => `<option value="${t.id}" ${UI.cf.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
    <label class="field ${UI.cf.status ? 'on' : ''}"><span>Status</span><select data-cf="status"><option value="">Any</option>${CIVIC_STATUSES.map(([id, l]) => `<option value="${id}" ${UI.cf.status === id ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <button class="field ${UI.cf.all ? 'on' : ''}" data-cf-toggle="all" style="cursor:pointer">${icon('globe')} All jurisdictions</button>
  </div>
  ${seg === 'officials' ? renderOfficials(offs) : seg === 'coverage' ? renderCoverage(cov) : seg === 'checks' ? renderCivicChecks(issues) : renderFacilities(rows, all)}`;
}
function renderFacilities(rows, all) {
  if (!rows.length) return `<div class="panel empty"><b>${all.length ? 'No facility matches' : 'No civic facilities yet'}</b>${all.length ? 'Try clearing the filters, or include all jurisdictions.' : 'Open any building and set its civic type under Edit — a hospital, a police station, City Hall, the White House, a school or a park. It then counts towards coverage and valuations.'}<br><button class="btn primary" data-act="civic-new">${icon('civic')} Mark a building civic</button></div>`;
  const groups = []; for (const b of rows) { const t = civicOf(b).type; let g = groups.find(x => x.type === t); if (!g) { g = { type: t, rows: [] }; groups.push(g); } g.rows.push(b); }
  return `<div class="panel hud" style="padding:0"><div class="civlist">${groups.map(g => `<div class="cg"><div class="cgh"><span class="glyph" style="--c:${civicColor(g.type)}">${esc(CIVIC_BY_ID[g.type]?.glyph || '•')}</span>${esc(civicTypeLabel(g.type)).toUpperCase()}<span class="cnt">${g.rows.length}</span>${CIVIC_BY_ID[g.type]?.unit ? `<span class="unit">${esc(CIVIC_BY_ID[g.type].unit)} ${fmtInt(g.rows.reduce((a, b) => a + (num(civicOf(b).capacity) || 0), 0))}</span>` : ''}</div>
    ${g.rows.map(b => { const c = civicOf(b); const st = CIVIC_STATUS[c.status] || CIVIC_STATUS.operating; const d = districtById(b.districtId); const offs = officialsOf(b); const j = c.jurisdictionId ? nodeById(c.jurisdictionId) : null; return `<div class="cr" data-open="${b.id}" data-hover="${b.id}"><div><div class="t">${esc(b.name || titleOf(b))}${b.name && addressOf(b) ? `<small>${esc(addressOf(b))}</small>` : ''}</div><div class="s"><i style="--c:${distColor(d)}"></i>${esc(d?.name || '')}${hoodById(b.neighborhoodId) ? ' · ' + esc(hoodById(b.neighborhoodId).name) : ''}${j ? ' · serves ' + esc(j.name) : ''}${offs.length ? ` · ${offs.length} official${offs.length === 1 ? '' : 's'}` : ''}${b.x == null ? ' · <span style="color:var(--warn)">no coordinates</span>' : ''}</div></div><span class="cap">${num(c.capacity) != null ? `${fmtInt(c.capacity)}<small>${esc(CIVIC_BY_ID[c.type]?.unit || '')}</small>` : ''}</span><span class="status ${st.tone}"><i>●</i>${st.label}</span><span class="reg">${esc(b.reg)}</span></div>`; }).join('')}</div>`).join('')}</div></div>`;
}
function renderOfficials(offs) {
  const list = offs.slice().sort((a, b) => (a.status === 'serving' ? 0 : a.status === 'elect' ? 1 : 2) - (b.status === 'serving' ? 0 : b.status === 'elect' ? 1 : 2) || (a.office || '').localeCompare(b.office || ''));
  if (!list.length) return `<div class="panel empty"><b>No officials on file</b>Record the Mayor, the Governor, the President, council members and commissioners — each with an office building and a home. Homes show on the map and in the building record.<br><button class="btn primary" data-act="official-new">${icon('plus')} Add an official</button></div>`;
  return `<div class="offgrid">${list.map(o => { const st = officialStatus(o); const off = officeOf(o), home = residenceOf(o); const j = o.jurisdictionId ? nodeById(o.jurisdictionId) : null; return `<div class="offcard ${st.id}" data-act="official-edit" data-id="${o.id}" role="button"><div class="k"><span>${esc((o.office || 'OFFICIAL').toUpperCase())}</span><span class="status ${st.tone}"><i>●</i>${st.label}</span></div><div class="n">${esc(o.name || '— unnamed —')}</div><div class="j">${j ? esc(j.name) : 'jurisdiction not set'}${o.party ? ' · ' + esc(o.party) : ''}${termLabel(o) ? ' · ' + esc(termLabel(o)) : ''}</div>
    <div class="places"><div class="pl ${off ? '' : 'none'}" ${off ? `data-open="${off.id}" data-hover="${off.id}"` : ''}><span class="lbl">OFFICE</span><span>${off ? esc(off.name || titleOf(off)) : 'not recorded'}</span></div><div class="pl ${home ? '' : 'none'}" ${home ? `data-open="${home.id}" data-hover="${home.id}"` : ''}><span class="lbl">HOME</span><span>${home ? esc(home.name || titleOf(home)) : 'not recorded'}</span></div></div><span class="reg">${esc(o.reg)}</span></div>`; }).join('')}</div>`;
}
function renderCoverage(cov) {
  if (!cov.placed) return `<div class="panel empty"><b>Nothing to measure</b>Coverage needs buildings with coordinates and at least one operating hospital, police or fire station.</div>`;
  const typeRow = t => { const T = cov.types[t]; return `<div class="covrow"><div class="h"><span class="glyph" style="--c:${civicColor(t)}">${esc(CIVIC_BY_ID[t].glyph)}</span><b>${esc(civicTypeLabel(t))}</b><span class="muted">${T.facilities} operating · reach ${COVERAGE_RADIUS[t]} blk${T.avg != null ? ` · average ${T.avg} blk to the nearest` : ''}</span><span class="pct ${T.pct >= 70 ? 'good' : T.pct >= 40 ? 'warn' : 'bad'}">${T.pct}%</span></div><div class="trk"><div class="fill" style="width:${T.pct}%;background:${civicColor(t)}"></div></div>${T.gaps.length ? `<div class="gaps">Farthest: ${T.gaps.slice(0, 5).map(g => `<span class="rowlink" data-open="${g.b.id}" data-hover="${g.b.id}">${esc(g.b.reg)}${g.d != null ? ` <small>${Math.round(g.d)} blk</small>` : ' <small>no facility</small>'}</span>`).join(' · ')}${T.gaps.length > 5 ? ` · +${T.gaps.length - 5}` : ''}</div>` : '<div class="gaps good">Every placed building is within reach.</div>'}</div>`; };
  return `<section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud" style="grid-column:span 2"><div class="panel-head"><h3>ESSENTIAL SERVICES · ${cov.placed} PLACED BUILDINGS</h3><span class="note">${cov.unplaced ? `${cov.unplaced} without coordinates left out` : 'all buildings placed'}</span></div>${ESSENTIAL_CIVIC.map(typeRow).join('')}</div>
    <div class="panel hud"><div class="panel-head"><h3>BY PLACE</h3><span class="note">share reaching all three</span></div>${cov.places.length ? `<div class="hbars">${cov.places.map(p => `<div class="hbar" style="--c:${p.color};grid-template-columns:120px 1fr 44px" data-scope-kind="${p.c.kind}" data-scope-id="${esc(p.c.node.id)}" role="button"><span class="nm"><i></i>${esc(p.name)}</span><div class="trk"><div class="fill" style="width:${p.pct}%"></div></div><span class="v">${p.pct}%</span></div>`).join('')}</div>` : `<div class="chart-empty">No places under this scope.</div>`}<div class="desc-line" style="margin-top:10px">Straight-line blocks, operating facilities only. Reach: hospital ${COVERAGE_RADIUS.hospital} · police ${COVERAGE_RADIUS.police} · fire ${COVERAGE_RADIUS.fire}.</div></div>
  </section>`;
}
function renderCivicChecks(issues) {
  if (!issues.length) return `<div class="panel empty"><b>Nothing flagged</b>Every civic facility has a sensible status and every official has an office and a home — or the gaps are already recorded as such.</div>`;
  return `<div class="panel hud"><div class="panel-head"><h3>CHECKS</h3><span class="note">${issues.length} · nothing changed automatically</span></div><div class="issues-wrap" style="margin:0">${issues.map(i => `<div class="issue ${i.level}">${icon(i.level === 'info' ? 'flag' : 'warn')}<span><span class="where" data-open="${i.kind === 'official' ? 'official:' + i.id : i.id}" role="button">${esc(i.reg || '')}</span>${esc(i.text)}</span></div>`).join('')}</div></div>`;
}

/* ---- officials modal ---- */
function jurisdictionOptions(selected) { const items = [...S.regions.map(r => [r.id, `${r.name} (${REGION_TYPE[r.type]?.label || r.type})`]), ...S.districts.map(d => [d.id, `${d.name} (${d.type === 'borough' ? 'borough' : 'district'})`])]; return `<option value="">— none —</option>` + items.map(([id, l]) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(l)}</option>`).join(''); }
function openOfficialModal(id = null) {
  const o = id ? officialById(id) : null; const d = o ? JSON.parse(JSON.stringify(o)) : newOfficial({ meta: { gseq: {} } }); if (!o) { d.reg = ''; }
  const bLabel = bid => { const b = bid ? byId(bid) : null; return b ? `${esc(b.reg)} · ${esc(b.name || titleOf(b))}` : '<span class="muted">not set</span>'; };
  openModal({ title: o ? `${o.office || 'Official'} · ${o.name || o.reg}` : 'New official', kicker: o ? o.reg : 'GV-#### · issued on save', cls: 'wide',
    body: `<form class="form" id="oform" autocomplete="off" onsubmit="return false">
      <div class="frow c3">
        ${fld('oname', 'Name', inpF('oname', d.name, 'placeholder="Full name"'))}
        ${fld('ooffice', 'Office', `<input id="f-ooffice" list="office-kinds" value="${esc(d.office)}" placeholder="Mayor"><datalist id="office-kinds">${OFFICE_KINDS.map(k => `<option value="${esc(k)}">`).join('')}</datalist>`)}
        ${fld('ojur', 'Jurisdiction', `<select id="f-ojur">${jurisdictionOptions(d.jurisdictionId)}</select>`)}
        ${fld('ostatus', 'Status', selF('ostatus', OFFICIAL_STATUSES.map(([i, l]) => [i, l]), d.status))}
        ${fld('oparty', 'Party / affiliation', inpF('oparty', d.party, ''))}
        <div class="f"><label>Term</label><div class="inline">${hyControl('otfrom', d.termFromYear, d.termFromHalf, false, { yearPh: '2024', withApprox: false })}<span class="muted">→</span>${hyControl('otto', d.termToYear, d.termToHalf, false, { yearPh: '—', withApprox: false })}</div></div>
      </div>
      <div class="frow" style="margin-top:12px">
        <div class="f"><label>Office building <span class="hint">where they work</span></label><div class="pickrow"><span id="o-office-lbl">${bLabel(d.officeBuildingId)}</span><button type="button" class="btn sm" data-opick="office">${icon('bldg')} Choose</button>${d.officeBuildingId ? `<button type="button" class="btn sm ghost" data-oclear="office">Clear</button>` : ''}</div></div>
        <div class="f"><label>Residence <span class="hint">where they live — shown on the map as a home</span></label><div class="pickrow"><span id="o-home-lbl">${bLabel(d.residenceBuildingId)}</span><button type="button" class="btn sm" data-opick="home">${icon('home')} Choose</button>${d.residenceBuildingId ? `<button type="button" class="btn sm ghost" data-oclear="home">Clear</button>` : ''}</div></div>
      </div>
      <div class="frow" style="margin-top:12px">
        <div class="f span"><label for="f-osource">Source</label>${inpF('osource', d.source, 'placeholder="article URL, election notice, who told you"')}</div>
        <div class="f span"><label for="f-onotes">Notes</label><textarea id="f-onotes">${esc(d.notes || '')}</textarea></div>
      </div></form>`,
    foot: `${o ? `<button class="btn danger sm" data-act="official-delete" data-id="${o.id}">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" id="o-save">${icon('check')} ${o ? 'Save' : 'Add official'}</button>`,
    onOpen: m => {
      const read = () => { const g = k => m.querySelector('#f-' + k)?.value ?? ''; d.name = g('oname').trim(); d.office = g('ooffice').trim(); d.jurisdictionId = g('ojur') || null; d.status = g('ostatus') || 'serving'; d.party = g('oparty').trim(); const a = readHY('otfrom'), b = readHY('otto'); d.termFromYear = a.year; d.termFromHalf = a.year != null ? a.half : ''; d.termToYear = b.year; d.termToHalf = b.year != null ? b.half : ''; d.source = g('osource').trim(); d.notes = g('onotes'); };
      m.querySelectorAll('[data-opick]').forEach(btn => btn.onclick = async () => { read(); const which = btn.dataset.opick; const bid = await buildingPickDialog([], which === 'office' ? 'Office building' : 'Residence', 'Choose'); if (!bid) { reopen(); return; } if (which === 'office') d.officeBuildingId = bid; else d.residenceBuildingId = bid; reopen(); });
      m.querySelectorAll('[data-oclear]').forEach(btn => btn.onclick = () => { read(); if (btn.dataset.oclear === 'office') d.officeBuildingId = null; else d.residenceBuildingId = null; reopen(); });
      const reopen = () => { closeModal(); openOfficialModalDraft(d, o); };
      m.querySelector('#o-save').onclick = () => { read(); if (!d.name && !d.office) { toast('Give the official a name or an office', 'warn'); return; } if (d.termFromYear != null && d.termToYear != null && hyIndex(d.termToYear, d.termToHalf) < hyIndex(d.termFromYear, d.termFromHalf)) { toast('The term ends before it starts', 'warn'); return; } saveOfficial(d, o); };
    } });
}
/* reopen the modal with a draft after a picker (pickers replace the modal) */
function openOfficialModalDraft(d, o) { const keep = JSON.parse(JSON.stringify(d)); openOfficialModal(o ? o.id : null); const m = $('#modal-root .modal'); if (!m) return; const set = (k, v) => { const el = m.querySelector('#f-' + k); if (el) el.value = v ?? ''; }; set('oname', keep.name); set('ooffice', keep.office); set('ojur', keep.jurisdictionId || ''); set('ostatus', keep.status); set('oparty', keep.party); set('otfrom-y', keep.termFromYear); set('otfrom-h', keep.termFromHalf); set('otto-y', keep.termToYear); set('otto-h', keep.termToHalf); set('osource', keep.source); set('onotes', keep.notes);
  const lbl = bid => { const b = bid ? byId(bid) : null; return b ? `${esc(b.reg)} · ${esc(b.name || titleOf(b))}` : '<span class="muted">not set</span>'; };
  m.querySelector('#o-office-lbl').innerHTML = lbl(keep.officeBuildingId); m.querySelector('#o-home-lbl').innerHTML = lbl(keep.residenceBuildingId);
  // carry the picked ids into the save path
  m.querySelector('#o-save').onclick = () => { const g = k => m.querySelector('#f-' + k)?.value ?? ''; keep.name = g('oname').trim(); keep.office = g('ooffice').trim(); keep.jurisdictionId = g('ojur') || null; keep.status = g('ostatus') || 'serving'; keep.party = g('oparty').trim(); const a = readHY('otfrom'), b = readHY('otto'); keep.termFromYear = a.year; keep.termFromHalf = a.year != null ? a.half : ''; keep.termToYear = b.year; keep.termToHalf = b.year != null ? b.half : ''; keep.source = g('osource').trim(); keep.notes = g('onotes'); if (!keep.name && !keep.office) { toast('Give the official a name or an office', 'warn'); return; } saveOfficial(keep, o); };
  m.querySelectorAll('[data-opick]').forEach(btn => btn.onclick = async () => { const which = btn.dataset.opick; const bid = await buildingPickDialog([], which === 'office' ? 'Office building' : 'Residence', 'Choose'); if (bid) { if (which === 'office') keep.officeBuildingId = bid; else keep.residenceBuildingId = bid; } closeModal(); openOfficialModalDraft(keep, o); });
  m.querySelectorAll('[data-oclear]').forEach(btn => btn.onclick = () => { if (btn.dataset.oclear === 'office') keep.officeBuildingId = null; else keep.residenceBuildingId = null; closeModal(); openOfficialModalDraft(keep, o); });
}
function saveOfficial(d, existing) {
  if (existing) { Object.assign(existing, d, { id: existing.id, reg: existing.reg, created: existing.created, updated: now() }); }
  else { const o = newOfficial(S); Object.assign(o, d, { id: o.id, reg: o.reg, created: now(), updated: now() }); S.officials.push(o); }
  commit(); closeModal(); if (UI.nav === 'civic' || UI.nav === 'overview') renderView(false); if (DR.id) renderDrawer(); toast(existing ? 'Official saved' : `${S.officials[S.officials.length - 1].reg} added`, 'good');
}
async function deleteOfficial(id) {
  const o = officialById(id); if (!o) return;
  const r = await confirmDialog({ title: `Delete ${officialLabel(o)}?`, body: '<p>The record is removed from the officials list. Buildings are untouched.</p>', ok: 'Delete', danger: true }); if (r !== 'ok') return;
  await takeSnapshot(`before deleting official ${o.reg}`); S.officials = S.officials.filter(x => x.id !== id); commit(); closeModal(); renderView(false); if (DR.id) renderDrawer(); toast('Official deleted', 'warn');
}

/* ---- building record: civic facility · officials here ---- */
function civicSectionHTML(b) {
  const c = civicOf(b); const offs = officialsOf(b); const kv = kvHTML;
  if (!c && !offs.length) return '';
  const st = c ? (CIVIC_STATUS[c.status] || CIVIC_STATUS.operating) : null; const j = c?.jurisdictionId ? nodeById(c.jurisdictionId) : null;
  return `<div class="secthead">CIVIC${c ? ` <span class="muted" style="letter-spacing:0;font-weight:400">· ${esc(civicTypeLabel(c.type))}</span>` : ''}</div>
  ${c ? `<div class="kv">${kv('FACILITY', `<span class="glyph" style="--c:${civicColor(c.type)}">${esc(CIVIC_BY_ID[c.type]?.glyph || '•')}</span> ${esc(civicTypeLabel(c.type))}`)}${kv('STATUS', `<span class="status ${st.tone}"><i>●</i>${st.label}</span>`)}${kv('CAPACITY', num(c.capacity) != null ? `${fmtInt(c.capacity)}<small>${esc(CIVIC_BY_ID[c.type]?.unit || '')}</small>` : null, 'num')}${kv('SERVES', j ? esc(j.name) : null)}${c.notes ? kv('NOTES', esc(c.notes), '', true) : ''}</div>` : ''}
  ${offs.length ? `<div class="rowlist">${offs.map(o => { const st2 = officialStatus(o); const role = o.officeBuildingId === b.id && o.residenceBuildingId === b.id ? 'OFFICE & HOME' : o.residenceBuildingId === b.id ? 'HOME OF' : 'OFFICE OF'; return `<div class="r link" data-act="official-edit" data-id="${o.id}"><div><div class="t"><span class="mk civic">${role}</span>${esc(o.office || 'Official')}${o.name ? ' · ' + esc(o.name) : ''}</div><div class="s">${st2.label}${termLabel(o) ? ' · ' + esc(termLabel(o)) : ''}${o.jurisdictionId && nodeById(o.jurisdictionId) ? ' · ' + esc(nodeById(o.jurisdictionId).name) : ''}</div></div><div class="v" style="color:var(--ink-2)">${esc(o.reg)}</div></div>`; }).join('')}</div>` : ''}`;
}
function civicEditorHTML(b) {
  const c = civicOf(b) || { type: '', status: 'operating', capacity: null, jurisdictionId: null, notes: '' };
  return `<div class="fsect"><h4>CIVIC & CONDITION <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">hospitals · police · fire · government · homes of officials · parks</span></h4>
    <div class="frow c3">
      <div class="f"><label for="f-civicType">Civic type</label><select id="f-civicType"><option value="">— not a civic facility —</option>${CIVIC_TYPES.map(t => `<option value="${t.id}" ${t.id === c.type ? 'selected' : ''}>${esc(t.glyph)} ${esc(t.label)}</option>`).join('')}</select></div>
      <div class="f"><label for="f-civicStatus">Facility status</label><select id="f-civicStatus">${CIVIC_STATUSES.map(([id, l]) => `<option value="${id}" ${id === (c.status || 'operating') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label for="f-civicCapacity">Capacity <span class="hint">${esc(CIVIC_BY_ID[c.type]?.unit || 'beds · officers · seats')}</span></label><input id="f-civicCapacity" class="num" type="number" min="0" value="${esc(c.capacity ?? '')}"></div>
      <div class="f"><label for="f-civicJur">Serves <span class="hint">jurisdiction</span></label><select id="f-civicJur">${jurisdictionOptions(c.jurisdictionId)}</select></div>
      <div class="f"><label for="f-condition">Condition</label><select id="f-condition">${CONDITIONS.map(([id, l]) => `<option value="${id}" ${id === (b.condition || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label>Public</label><label class="switch"><input type="checkbox" id="f-public" ${b.public !== false ? 'checked' : ''}> <span class="muted" style="font-size:12px">listed in the public guide</span></label></div>
      <div class="f span"><label for="f-civicNotes">Civic notes</label><input id="f-civicNotes" value="${esc(c.notes || '')}" placeholder="wards, precinct number, who runs it…"></div>
    </div></div>`;
}
function readCivicForm(b) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#f-civicType')) return;
  const type = g('civicType'); b.civic = type ? { type, status: g('civicStatus') || 'operating', capacity: num(g('civicCapacity')), jurisdictionId: g('civicJur') || null, notes: g('civicNotes').trim() } : null;
  b.condition = g('condition') || ''; b.public = !!$('#f-public')?.checked;
}
/* ---- map glyph: a small badge next to the dot ---- */
function drawCivicGlyph(ctx, x, y, r, b, alpha = 1) {
  const c = civicOf(b); const homes = S.officials.some(o => o.residenceBuildingId === b.id && o.status !== 'former');
  if (!c && !homes) return;
  const type = c ? c.type : 'residence'; const col = civicColor(type); const glyph = c ? (CIVIC_BY_ID[type]?.glyph || '•') : 'R'; const size = Math.max(9, Math.min(14, r * 1.6));
  const bx = x + r + 3, by = y - r - 3;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - size / 2, by - size / 2, size, size, 2) : ctx.rect(bx - size / 2, by - size / 2, size, size); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#05090D'; ctx.stroke();
  ctx.fillStyle = type === 'white-house' || type === 'city-hall' || type === 'capitol' || type === 'school' ? '#05090D' : '#05090D'; ctx.font = `700 ${Math.round(size * .72)}px Silkscreen, JetBrains Mono, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, bx, by + 0.5); ctx.restore();
}
