/* =====================================================================
   §10 DRAWER — building record card (view) and editor (edit / new);
       the generic record opener for roads, lines, stations and businesses
   ===================================================================== */
/* DR.kind: 'building' | 'road' | 'line' | 'station' | 'business' · DR.stack: where "back" goes when a record was opened from another record */
const DR = { id: null, kind: 'building', mode: null, draft: null, isNew: false, stack: [] };
const COLL_OF = { building: 'buildings', road: 'roads', line: 'lines', station: 'stations', business: 'businesses' };
const recordById = (kind, id) => (S[COLL_OF[kind]] || []).find(x => x.id === id) || null;

function openRecord(kind, id, mode = 'view', opts = {}) {
  if (kind === 'building') return openBuilding(id, mode, opts);
  const rec = recordById(kind, id); if (!rec) return;
  if (opts.push && DR.id && DR.id !== id) DR.stack.push({ kind: DR.kind, id: DR.id }); else if (!opts.push && !opts.keepStack) DR.stack = [];
  DR.id = id; DR.kind = kind; DR.mode = mode; DR.isNew = false; DR.draft = mode === 'edit' ? JSON.parse(JSON.stringify(rec)) : null; UI.selected = id;
  renderDrawer(); showDrawer();
}
function openBuilding(id, mode = 'view', opts = {}) {
  const b = byId(id); if (!b) return;
  if (opts.push && DR.id && DR.id !== id) DR.stack.push({ kind: DR.kind, id: DR.id }); else if (!opts.push && !opts.keepStack) DR.stack = [];
  DR.id = id; DR.kind = 'building'; DR.mode = mode; DR.isNew = false; DR.draft = mode === 'edit' ? JSON.parse(JSON.stringify(b)) : null; UI.selected = id;
  renderDrawer(); showDrawer();
  $$('table.reg tbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.open === id));
}
/* opts.historical → a demolished (historical) record, numbered H-XX-#### on save */
function newBuildingFlow(districtId, opts = {}) {
  const scopeIds = [...scopeDistrictIds()]; const did = districtId || (UI.filters.district && districtById(UI.filters.district) ? UI.filters.district : scopeIds.length === 1 ? scopeIds[0] : (UI.scope.kind === 'district' ? UI.scope.id : null)) || (scopeIds.includes('man-a') ? 'man-a' : scopeIds[0]) || S.districts[0]?.id;
  if (!did) { toast('Create a borough or district first (Add → Borough / district)', 'warn'); return; }
  const draft = newBuilding({ districts: S.districts, meta: { seq: { ...S.meta.seq } } }, did);   // reg is provisional; re-issued on save
  draft.reg = ''; draft.neighborhoodId = UI.scope.kind === 'hood' ? UI.scope.id : (UI.filters.hood && UI.filters.hood !== '__none' ? UI.filters.hood : null);
  if (opts.historical) { draft.physical = 'demolished'; draft.status = 'demolished'; draft.confidence = 'approximate'; }
  if (opts.preset) Object.assign(draft, opts.preset);
  DR.id = draft.id; DR.kind = 'building'; DR.mode = 'edit'; DR.isNew = true; DR.draft = draft; DR.stack = opts.stack || []; UI.selected = null;
  renderDrawer(); showDrawer(); setTimeout(() => $('#f-number')?.focus(), 80);
}
function showDrawer() { $('#drawer').classList.add('on'); $('#backdrop').classList.add('on'); hideHover(); }
function closeDrawer(force = false) {
  if (!force && DR.mode === 'edit' && formDirty()) { confirmDialog({ title: 'Discard changes?', body: '<p>This record has unsaved edits.</p>', ok: 'Discard', cancel: 'Keep editing', danger: true }).then(r => { if (r === 'ok') closeDrawer(true); }); return; }
  if (DR.isNew && DR.draft?.image) removeBuildingImage(DR.draft);   // discard the photo of an abandoned new record
  $('#drawer').classList.remove('on'); $('#backdrop').classList.remove('on');
  DR.id = null; DR.kind = 'building'; DR.mode = null; DR.draft = null; DR.isNew = false; DR.stack = []; UI.selected = null;
  $$('table.reg tbody tr.sel').forEach(tr => tr.classList.remove('sel'));
}
async function leaveEditor() {
  if (DR.mode !== 'edit' || !DR.draft || !formDirty()) return true;
  const r = await confirmDialog({ title: 'Discard changes?', body: '<p>The record you are editing has unsaved edits.</p>', ok: 'Discard', cancel: 'Keep editing', danger: true });
  if (r === 'ok' && DR.isNew && DR.draft?.image) removeBuildingImage(DR.draft);
  return r === 'ok';
}
function drawerBack() { const prev = DR.stack.pop(); if (!prev) return; openRecord(prev.kind, prev.id, 'view', { keepStack: true }); }
function formDirty() {
  if (!DR.draft) return false;
  const cur = recordById(DR.kind, DR.id); if (!cur) return true;
  readAnyFormInto(DR.draft, false); return JSON.stringify(cleanRecord(DR.draft)) !== JSON.stringify(cleanRecord(cur));
}
const cleanRecord = b => { const { updated, ...rest } = b; return rest; };
function readAnyFormInto(d, strict) { return DR.kind === 'building' ? readFormInto(d, strict) : DR.kind === 'road' ? readRoadFormInto(d, strict) : DR.kind === 'line' ? readLineFormInto(d, strict) : DR.kind === 'station' ? readStationFormInto(d, strict) : readBizFormInto(d, strict); }

function renderDrawer() {
  const el = $('#drawer');
  if (DR.kind === 'building') {
    if (DR.mode === 'edit') el.innerHTML = renderEditor(DR.draft);
    else { const b = byId(DR.id); if (!b) { closeDrawer(true); return; } el.innerHTML = renderRecord(b); drawMiniMap(b); }
  } else {
    const rec = DR.mode === 'edit' ? DR.draft : recordById(DR.kind, DR.id); if (!rec) { closeDrawer(true); return; }
    el.innerHTML = DR.kind === 'road' ? (DR.mode === 'edit' ? renderRoadEditor(rec) : renderRoadRecord(rec)) : DR.kind === 'line' ? (DR.mode === 'edit' ? renderLineEditor(rec) : renderLineRecord(rec)) : DR.kind === 'station' ? (DR.mode === 'edit' ? renderStationEditor(rec) : renderStationRecord(rec)) : (DR.mode === 'edit' ? renderBizEditor(rec) : renderBizRecord(rec));
    if (DR.mode !== 'edit') drawMiniMapFor(DR.kind, rec);
  }
  wireDrawer();
}
const backBtn = () => DR.stack.length ? `<button class="btn sm ghost" data-act="dr-back" title="Back to the previous record">${icon('back')} Back</button>` : '';
const placePath = (d, h) => { const parts = []; if (d) { for (const r of ancestorsOf(d)) if (r.id !== 'union') parts.push(r.name); parts.push(d.name); } if (h) parts.push(h.name); return parts; };

/* ---- record card ---- */
const kvHTML = (k, v, cls = '', span = false) => `<div class="${span ? 'span' : ''}"><div class="k">${k}</div><div class="v ${cls} ${v == null || v === '' || v === '—' ? 'empty-v' : ''}">${v == null || v === '' ? '—' : v}</div></div>`;
function lifelineHTML(b) {
  const hist = isHist(b), uw = isUnderWay(b);
  const pts = [
    { k: 'STARTED', v: b.yearStarted != null ? hyLabel(b.yearStarted, b.halfStarted, b.yearStartedApprox) : (b.dateStarted ? fmtDay(b.dateStarted) : '—'), on: b.yearStarted != null || !!b.dateStarted },
    uw && b.yearBuilt == null ? { k: 'EXPECTED', v: b.yearExpected != null ? hyLabel(b.yearExpected, b.halfExpected, b.yearExpectedApprox) : '—', on: b.yearExpected != null, cls: 'exp' } : { k: 'COMPLETED', v: b.yearBuilt != null ? hyLabel(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox) : '—', on: b.yearBuilt != null },
    { k: 'ALTERED', v: b.yearAltered != null ? hyLabel(b.yearAltered, b.halfAltered) : '—', on: b.yearAltered != null },
    hist ? { k: 'DEMOLISHED', v: b.yearDemolished != null ? hyLabel(b.yearDemolished, b.halfDemolished, b.yearDemolishedApprox) : 'date unknown', on: true, cls: 'hist' } : { k: 'TODAY', v: physicalOf(b.physical).label, on: true },
  ];
  return `<div class="lifeline">${pts.map(p => `<div class="lp ${p.on ? 'on' : ''} ${p.cls || ''}"><div class="k">${p.k}</div><div class="v">${esc(p.v)}</div></div>`).join('')}</div>`;
}
function issuesHTML(list, { max = 5 } = {}) {
  if (!list.length) return '';
  const shown = list.slice(0, max);
  return `<div class="issues-wrap">${shown.map(i => `<div class="issue ${i.level}">${icon(i.level === 'info' ? 'flag' : 'warn')}<span>${esc(i.text)}</span></div>`).join('')}${list.length > max ? `<div class="desc-line" style="margin-top:6px">and ${list.length - max} more — see Issues in the status bar</div>` : ''}</div>`;
}
function renderRecord(b) {
  const d = districtById(b.districtId), h = hoodById(b.neighborhoodId), era = eraOf(num(b.yearBuilt)), hist = isHist(b), uw = isUnderWay(b);
  const url = imgUrl(b.id, 'full'); const kv = kvHTML; const lot = lotAreaOf(b); const fp = footprintAreaOf(b); const series = parseReg(b.reg);
  const mismatch = hist ? !series?.hist : !!series?.hist; const issues = buildingIssues(b); const ph = physicalOf(b.physical); const mk = marketOf(b.market);
  const road = roadById(b.roadId);
  return `
  <div class="dhd">${backBtn()}<span class="t">${hist ? 'HISTORICAL RECORD' : uw ? 'PROJECT' : 'RECORD'} · <span class="${hist ? 'reg-h' : ''}">${esc(b.reg)}</span></span>
    <button class="btn sm" data-act="dr-edit">${icon('edit')} Edit</button>
    <button class="btn sm ghost" data-act="dr-map" title="Show on the map">${icon('map')}</button>
    <button class="btn sm ghost" data-act="dr-copy" title="Copy a text summary">${icon('copy')}</button>
    <button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody">
    <div class="photo" id="photo" tabindex="0" title="Drop or paste a screenshot here">${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('img')}No photo yet — drop a screenshot here, paste one, or click Add photo</div>`}
      <div class="acts"><button class="btn sm" data-act="dr-photo">${icon('img')} ${url ? 'Replace' : 'Add photo'}</button>${url ? `<button class="btn sm danger" data-act="dr-photo-remove">${icon('trash')}</button>` : ''}</div></div>
    <div class="rec">
      <div class="reg ${hist ? 'hist' : ''}">${esc(b.reg)} <span class="dist" style="--c:${distColor(d)}"><i></i>${placePath(d, h).map(esc).join(' › ') || '—'}</span>${(b.formerRegs || []).length ? `<span class="muted" style="letter-spacing:.04em" title="Former numbers of this record">formerly ${b.formerRegs.map(esc).join(', ')}</span>` : ''}</div>
      <h2>${esc(addressOf(b) || b.name || 'Unnamed lot')}</h2>
      ${addressOf(b) && b.name ? `<div class="nm">${esc(b.name)}</div>` : ''}
      <div class="badges"><span class="status physical ${hist ? 'hist' : ph.tone}"><i>${ph.glyph}</i>${ph.label}</span>${b.market ? `<span class="status ${mk.tone}"><i>${mk.glyph}</i>${mk.label}</span>` : ''}${b.landmark ? `<span class="status gold"><i>✦</i>Landmark</span>` : ''}${hist ? `<span class="code" style="color:var(--hist)">${esc(spanHTML(b))}${lifespanOf(b) != null ? ' · ' + yearsLabel(lifespanOf(b)) : ''}</span>` : ''}${era && !hist ? `<span class="code">${esc(era.name)}</span>` : ''}${b.bldgClass ? `<span class="code" title="${esc(classDesc(b.bldgClass))}">${esc(b.bldgClass)} · ${esc(truncate(classDesc(b.bldgClass), 28))}</span>` : ''}${b.zoning ? `<span class="code" title="${esc(zoningDesc(b.zoning))}">${esc(b.zoning)}${b.overlay ? ' / ' + esc(b.overlay) : ''}</span>` : ''}${confHTML(b.confidence, b.verified)}</div>
      ${mismatch ? `<div class="callout" style="margin-top:12px">${hist ? `<b>Legacy number.</b> This demolished record still carries a current-series number. Historical records are numbered <code>H-${esc(d?.code || 'XX')}-####</code>; reissuing keeps <code>${esc(b.reg)}</code> on file as a former number so old references and searches still resolve.` : `<b>Series mismatch.</b> This standing building carries a historical number. Reissue it in the current series; <code>${esc(b.reg)}</code> stays on file as a former number.`} <button class="btn sm" data-act="reissue-reg" style="margin-left:8px">${icon('flag')} Reissue as ${hist ? `H-${esc(d?.code || 'XX')}-…` : `${esc(d?.code || 'XX')}-…`}</button></div>` : ''}
    </div>
    ${lifelineHTML(b)}
    ${issues.length ? `<div class="secthead">ISSUES <span class="muted" style="letter-spacing:0;font-weight:400">· ${issues.length} flagged, nothing changed automatically</span></div>${issuesHTML(issues)}` : ''}
    ${siteHistoryHTML(b)}
    ${relationsHTML(b)}
    ${businessesHereHTML(b)}
    ${civicSectionHTML(b)}
    ${roadSectionHTML(b)}
    ${hist ? `<div class="secthead">DEMOLITION</div>
    <div class="kv">
      ${kv('DEMOLISHED', b.yearDemolished != null ? `${esc(demoHTML(b))}<small>${esc(eraOf(num(b.yearDemolished))?.name || '')}</small>` : (b.dateDemolished ? fmtDay(b.dateDemolished) : null), 'num')}${kv('LIFESPAN', lifespanOf(b) != null ? `${lifespanOf(b)}<small>years</small>` : null, 'num')}
      ${kv('REASON', esc(b.demolitionReason))}${kv('SIGNIFICANCE', esc(b.significance))}
    </div>` : (b.significance ? `<div class="secthead">SIGNIFICANCE</div><div class="notes">${esc(b.significance)}</div>` : '')}
    ${b.historyNotes ? `<div class="secthead">SITE HISTORY NOTES</div><div class="notes">${esc(b.historyNotes)}</div>` : ''}
    ${(b.migrationNotes || []).length ? `<div class="secthead">MIGRATION NOTES</div><div class="notes" style="font-size:12px;color:var(--ink-3)">${b.migrationNotes.map(esc).join('\n')}</div>` : ''}
    <div class="secthead">LOCATION${hist ? ' <span class="muted" style="letter-spacing:0;font-weight:400">· as it stood</span>' : ''}</div>
    <div class="kv">
      ${kv(hist ? 'ORIGINAL NEIGHBORHOOD' : 'NEIGHBORHOOD', esc(h?.name))}${kv('BOROUGH / DISTRICT', d ? `${esc(d.name)}<small>${esc(regionById(d.parentId)?.name || 'unplaced')}</small>` : null)}
      ${kv(hist ? 'ORIGINAL COORDINATES' : 'COORDINATES', b.x != null && b.z != null ? `X ${esc(b.x)} · Z ${esc(b.z)}${b.entrance?.x != null ? `<small>entrance X ${esc(b.entrance.x)} · Z ${esc(b.entrance.z)}</small>` : ''}` : null, 'num')}${kv('OWNER', esc(b.owner))}
      ${fp != null ? kv('FOOTPRINT · MEASURED', `${fmtInt(fp)}<small>blocks² · ${b.footprint.length} vertices</small>`, 'num') : ''}
    </div>
    ${b.x != null && b.z != null ? `<div class="minimap"><canvas id="minimap"></canvas><span class="coord">X ${esc(b.x)} · Z ${esc(b.z)}</span></div>` : ''}
    <div class="secthead">CLASSIFICATION & ZONING</div>
    <div class="kv">
      ${kv('BUILDING CLASS', b.bldgClass ? `${esc(b.bldgClass)}<small>${esc(classDesc(b.bldgClass))}</small>` : null)}${kv('TAX CLASS', b.taxClass ? `Class ${esc(b.taxClass)}<small>${esc(TAX_CLASSES.find(t => t.id === b.taxClass)?.label.split('—')[1] || '')}</small>` : null)}
      ${kv('ZONING DISTRICT', b.zoning ? `${esc(b.zoning)}<small>${esc(zoningDesc(b.zoning))}</small>` : null)}${kv('OVERLAY / SPECIAL', [b.overlay, b.special].filter(Boolean).map(esc).join(' · ') || null)}
    </div>
    <div class="secthead">BUILDING & LOT${hist ? ' <span class="muted" style="letter-spacing:0;font-weight:400">· original</span>' : ''}</div>
    <div class="kv">
      ${kv(uw ? 'STARTED' : 'COMPLETED', uw ? (b.yearStarted != null ? esc(startedHTML(b)) : null) : (b.yearBuilt != null ? `${esc(builtHTML(b))}<small>${esc(era?.name || '')}</small>` : null), 'num')}${kv(hist ? 'AGE AT DEMOLITION' : uw ? 'EXPECTED' : 'AGE', hist ? (lifespanOf(b) != null ? `${lifespanOf(b)}<small>years</small>` : null) : uw ? (b.yearExpected != null ? esc(expectedHTML(b)) : null) : (ageOf(b) != null ? `${ageOf(b)}<small>years</small>` : null), 'num')}
      ${kv('ALTERED', b.yearAltered != null ? esc(hyLabel(b.yearAltered, b.halfAltered)) : null, 'num')}${kv('ERA', esc(era?.name))}
      ${kv('FLOORS', esc(b.floors), 'num')}${kv('HEIGHT', b.height != null ? `${esc(b.height)}<small>blocks</small>` : null, 'num')}
      ${kv('LOT AREA', lot != null ? `${fmtInt(lot)}<small>blocks²${b.lotArea == null ? ' (front × depth)' : ''}</small>` : null, 'num')}${kv('FRONTAGE × DEPTH', b.lotFront || b.lotDepth ? `${esc(b.lotFront ?? '?')} × ${esc(b.lotDepth ?? '?')}<small>blocks</small>` : null, 'num')}
      ${kv('FLOOR AREA', num(b.floorArea) != null ? `${fmtInt(b.floorArea)}<small>blocks² · measured, not floors × lot</small>` : null, 'num')}${kv('UNITS', b.unitsRes != null || b.unitsCom != null ? `${esc(b.unitsRes ?? 0)} res · ${esc(b.unitsCom ?? 0)} com` : null, 'num')}
    </div>
    ${hist && num(b.assessTotal) == null && num(b.listPrice) == null && !(b.listings || []).length ? '' : `<div class="secthead">VALUATION${hist ? ' <span class="muted" style="letter-spacing:0;font-weight:400">· last known</span>' : ''}</div>
    <div class="kv">
      ${kv('ASSESSED LAND', fmtMoney(num(b.assessLand)), 'num money')}${kv('ASSESSED BUILDING', fmtMoney(num(b.assessBuilding)), 'num money')}
      ${kv('ASSESSED TOTAL', num(b.assessTotal) != null ? `${fmtMoney(num(b.assessTotal))}${b.assessYear ? `<small>${esc(b.assessYear)}${b.valuationBasis ? ' · ' + esc(b.valuationBasis) : ''}</small>` : (b.valuationBasis ? `<small>${esc(b.valuationBasis)}</small>` : '')}` : null, 'num money')}${kv(b.market === 'for-lease' ? 'ASKING RENT' : 'ASKING PRICE', fmtMoney(num(b.listPrice)), 'num money')}
      ${kv('$ / BLOCK² (ASKING)', num(b.listPrice) && lot ? fmtMoney(num(b.listPrice) / lot) : null, 'num')}${kv('$ / BLOCK² (ASSESSED)', num(b.assessTotal) && lot ? fmtMoney(num(b.assessTotal) / lot) : null, 'num')}
    </div>
    ${valuationSectionHTML(b)}
    ${listingsHTML(b)}`}
    <div class="secthead">PROVENANCE</div>
    <div class="kv">
      ${kv('CONFIDENCE', confHTML(b.confidence, b.verified))}${kv('SOURCE TYPE', esc(SOURCE_LABEL[b.sourceType] || b.sourceType))}
      ${kv('SOURCE', esc(b.source), '', true)}
    </div>
    ${(b.tags || []).length ? `<div class="secthead">TAGS</div><div class="tags">${b.tags.map(t => `<span class="tag ${t === 'seeded' ? 'seed' : ''}">${esc(t)}</span>`).join('')}</div>` : ''}
    ${b.notes ? `<div class="secthead">NOTES</div><div class="notes">${esc(b.notes)}</div>` : ''}
    <div class="secthead">RECORD</div>
    <div class="kv"><div><div class="k">CREATED</div><div class="v num" style="font-size:12px">${fmtDate(b.created)}</div></div><div><div class="k">UPDATED</div><div class="v num" style="font-size:12px">${fmtDate(b.updated)}</div></div><div class="span"><div class="k">INTERNAL ID</div><div class="v num" style="font-size:11px;color:var(--ink-3)">${esc(b.id)} <span class="muted">· relationships, tenancies and stations point at this, never at the number</span></div></div>${b.legacyStatus ? `<div class="span"><div class="k">LEGACY STATUS (2.0)</div><div class="v num" style="font-size:12px">${esc(b.legacyStatus)} → ${esc(summaryStatus(b))} <span class="muted">· the public site reads this summary</span></div></div>` : ''}</div>
  </div>
  <div class="dfoot"><button class="btn danger sm" data-act="dr-delete">${icon('trash')} Delete</button><span class="spacer"></span>
    <button class="btn sm ghost" data-act="dr-prev" title="Previous record (↑)">${icon('back')}</button><button class="btn sm ghost" data-act="dr-next" title="Next record (↓)" style="transform:scaleX(-1)">${icon('back')}</button>
    <button class="btn primary sm" data-act="dr-edit">${icon('edit')} Edit record</button></div>`;
}

/* ---- record card sections: site history · relationships · businesses · road ---- */
function relLabelBetween(me, x, idx) {
  const r = idx.get(me.id); if (!r) return null;
  const s = r.succ.find(e => e.b.id === x.id); if (s) return KIND_LABELS[s.kind][0];
  const p = r.pred.find(e => e.b.id === x.id); if (p) return KIND_LABELS[p.kind][1];
  if (r.same.some(e => e.b.id === x.id)) return 'Same site as';
  return null;
}
function genHTML(x, me, idx, { link = 'data-open-h' } = {}) {
  const d = districtById(x.districtId); const rel = me && x.id !== me.id ? relLabelBetween(me, x, idx) : null;
  return `<div class="gen ${isHist(x) ? 'hist' : ''} ${me && x.id === me.id ? 'me' : ''}" ${link}="${x.id}" data-hover="${x.id}" style="--c:${distColor(d)}"><span class="dot"></span><div><div class="t"><span class="reg">${esc(x.reg)}</span>${esc(x.name || titleOf(x))}${me && x.id === me.id ? ' <span class="muted" style="font-weight:400">· this record</span>' : ''}</div><div class="s">${rel ? esc(rel) + ' · ' : ''}${esc(physicalOf(x.physical).label)}${x.floors ? ' · ' + esc(x.floors) + ' fl' : ''}${x.bldgClass ? ' · ' + esc(x.bldgClass) : ''}</div></div><span class="yrs">${esc(spanHTML(x))}</span></div>`;
}
const vacantHTML = e => `<div class="gen vacant"><span class="dot"></span><div><div class="t">Vacant${e.to == null ? ' since ' + e.from : ''}</div><div class="s">${e.to == null ? 'nothing recorded here after the demolition' : `${e.to - e.from} year${e.to - e.from === 1 ? '' : 's'} between demolition and the next building`}</div></div><span class="yrs">${e.from} – ${e.to ?? 'present'}</span></div>`;
function siteHistoryHTML(b) {
  const idx = relIndex(); const comp = siteComponent(b, idx);
  if (comp.length < 2) return `<div class="secthead">SITE HISTORY</div><div class="notes" style="font-size:12.5px;color:var(--ink-3)">Nothing linked yet. Use <b style="color:var(--ink-2)">Relationships</b> to link what stood here before or after this building — search by registration number, e.g. <code style="font-family:var(--font-mono)">MA-0019</code> — and every generation on this site lines up here.</div>`;
  const chron = chronology(comp);
  return `<div class="secthead">SITE HISTORY <span class="muted" style="letter-spacing:0;font-weight:400">· ${comp.length} records on this site</span></div><div class="histline">${chron.map(e => e.vacant ? vacantHTML(e) : genHTML(e.b, b, idx)).join('')}</div>`;
}
function relChip(e, meId, { editable = true, holderId = null } = {}) {
  const x = e.b; const fromSucc = e.pred === meId; const label = e.kind === 'same' ? 'SAME SITE AS' : fromSucc ? KIND_LABELS[e.kind][0].toUpperCase() : KIND_LABELS[e.kind][1].toUpperCase();
  const warn = chronologyWarning(e); const own = holderId ? e.holder === holderId : true;
  return `<span class="rchip ${isHist(x) ? 'hist' : ''} ${own ? '' : 'ro'}" data-open-h="${x.id}" title="${esc(x.name || titleOf(x))} · ${esc(spanHTML(x))}${e.rel?.note ? ' · ' + esc(e.rel.note) : ''}${own ? '' : ' · linked from the other record'}"><span class="k">${label}</span><b>${esc(x.reg)}</b><span class="t">${esc(x.name || titleOf(x))}</span>${warn ? `<span class="wn" title="${esc(warn)}">⚠</span>` : ''}${editable && own ? `<button class="x" data-act="rel-remove" data-holder="${e.holder}" data-type="${esc(e.rel.type)}" data-target="${esc(e.rel.id)}" title="Remove this link">×</button>` : ''}</span>`;
}
function relationsHTML(b) {
  const idx = relIndex(); const r = idx.get(b.id) || { succ: [], pred: [], same: [] };
  const edges = [...r.pred, ...r.succ, ...r.same];
  return `<div class="secthead">RELATIONSHIPS <span class="acts"><button class="btn sm" data-act="rel-add" title="Link another building by registration number">${icon('link')} Link building</button></span></div>
  ${edges.length ? `<div class="chips">${edges.map(e => relChip(e, b.id)).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">${isHist(b) ? 'What replaced this building? Link its successor by registration number.' : 'What stood here before? Link the demolished building this one replaced.'}</div>`}`;
}
function businessesHereHTML(b) {
  const ts = tenanciesAt(b);
  return `<div class="secthead">BUSINESSES HERE <span class="acts"><button class="btn sm" data-act="ten-add" title="Link a business as owner, tenant, developer or operator">${icon('biz')} Link business</button></span></div>
  ${ts.length ? `<div class="rowlist">${ts.map(t => { const z = bizById(t.businessId); if (!z) return ''; return `<div class="r inform ${t.current ? '' : 'dim'}"><div><div class="t"><span class="mk biz">${esc(ROLE_LABEL[t.role] || t.role).toUpperCase()}</span><span class="rowlink" data-open="business:${z.id}" data-hover="business:${z.id}" style="cursor:pointer">${esc(bizLabel(z))}</span>${t.unit ? `<span class="muted">· ${esc(t.unit)}</span>` : ''}</div><div class="s">${t.current ? 'current' : 'former'} · ${t.yearFrom != null ? hyLabel(t.yearFrom, t.halfFrom) : '?'} – ${t.current ? 'present' : (t.yearTo != null ? hyLabel(t.yearTo, t.halfTo) : '?')}${t.notes ? ' · ' + esc(truncate(t.notes, 60)) : ''}</div></div>${t.current ? `<button class="btn sm ghost" data-act="ten-end" data-id="${t.id}" title="End this tenancy but keep it in the history">End</button>` : '<span></span>'}<button class="x" data-act="ten-remove" data-id="${t.id}" title="Remove this record entirely">×</button></div>`; }).join('')}</div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">No owner, tenant, developer or operator linked. ${b.owner ? `The owner field says “${esc(b.owner)}” — link it as a business record to connect it everywhere.` : ''}</div>`}`;
}
function roadSectionHTML(b) {
  const road = roadById(b.roadId); const sug = roadSuggest(b);
  const alts = sug.items.filter(it => it.road.id !== b.roadId);
  return `<div class="secthead">ROAD & ACCESS <span class="acts">${S.roads.length ? `<button class="btn sm" data-act="road-pick" title="Choose any road">${icon('road')} Choose</button>` : ''}<button class="btn sm" data-act="entrance-set" title="Mark the entrance on the map">${icon('pin')} Entrance</button></span></div>
  ${road ? `<div class="rowlist"><div class="r link" data-open="road:${road.id}" data-hover="road:${road.id}"><div><div class="t"><span class="mk road">${esc(ROAD_TYPE_LABEL[road.type] || road.type).toUpperCase()}</span>${esc(roadLabel(road))}</div><div class="s">${(() => { const it = sug.items.find(x => x.road.id === road.id); return it ? roadSuggestReason(it, sug.basis) : 'association recorded · distance unknown (no coordinates)'; })()}</div></div><div class="v" style="color:var(--ink-2)">${esc(road.reg)}<small>${Math.round(polyLength(road.geometry))} blk long</small></div></div></div>` : `<div class="notes" style="font-size:12.5px;color:var(--ink-3)">${S.roads.length ? 'No road associated yet.' : 'No roads drawn yet — draw one in the Map workspace and it can serve buildings.'}${sug.pt && S.roads.length ? ` Suggestions below are based on the building ${sug.basis === 'entrance' ? 'entrance' : 'centre'} and ${sug.checked} road${sug.checked === 1 ? '' : 's'} on the map.` : ''}</div>`}
  ${alts.length ? `<div class="suggest">${alts.map(it => `<div class="sg ${it.kind === 'best' && !road ? 'best' : ''}"><div><div class="t">${esc(roadLabel(it.road))} <span class="mk ${it.penalty ? 'warn' : 'road'}">${it.kind === 'best' && !road ? 'SUGGESTED' : it.corner ? 'CORNER ALTERNATIVE' : 'ALTERNATIVE'}</span>${sug.basis === 'center' ? '<span class="mk">PROXIMITY</span>' : ''}</div><div class="why">${esc(roadSuggestReason(it, sug.basis))}</div></div><div><div class="d">${Math.round(it.d)} blk<small>to centreline</small></div><button class="btn sm" style="margin-top:6px" data-act="road-apply" data-id="${it.road.id}">Use</button></div></div>`).join('')}${road ? `<div class="desc-line">The current association is kept until you choose otherwise; <button class="rowlink" data-act="road-clear" style="font:inherit">remove association</button>.</div>` : ''}</div>` : (road ? `<div class="desc-line" style="margin:8px 20px 0"><button class="rowlink" data-act="road-clear" style="font:inherit">Remove association</button></div>` : '')}`;
}
function listingsHTML(b) {
  const ls = b.listings || [], tx = b.transactions || [];
  if (!ls.length && !tx.length) return '';
  const row = (l, kind) => `<div class="r"><div><div class="t"><span class="mk ${kind === 'tx' ? 'info' : 'good'}">${kind === 'tx' ? (l.kind === 'lease' ? 'LEASED' : 'SOLD') : (l.kind === 'lease' ? 'FOR LEASE' : 'FOR SALE')}</span>${l.party ? esc(l.party) : ''}${l.status && kind !== 'tx' ? `<span class="muted">· ${esc(l.status)}</span>` : ''}</div><div class="s">${l.year != null ? hyLabel(l.year, l.half) : 'undated'}${l.note ? ' · ' + esc(truncate(l.note, 70)) : ''}${l.basis ? ' · ' + esc(l.basis) : ''}</div></div><div class="v">${fmtCur(num(l.price), l.currency)}${l.currency === 'EMR' ? '<small>emeralds</small>' : ''}</div></div>`;
  return `<div class="secthead">LISTINGS & TRANSACTIONS <span class="muted" style="letter-spacing:0;font-weight:400">· asking and agreed prices stay separate</span></div><div class="rowlist">${ls.map(l => row(l, 'ls')).join('')}${tx.map(t => row(t, 'tx')).join('')}</div>`;
}

/* ---- editor ---- */
const hyControl = (id, year, half, approx, { yearPh = '2019', approxLabel = 'approx.', withApprox = true } = {}) => `<div class="hy ${withApprox ? 'c3' : ''}"><select id="f-${id}-h" aria-label="Half of the year">${HALVES.map(h => `<option value="${h.id}" ${(half || '') === h.id ? 'selected' : ''}>${h.label}</option>`).join('')}</select><input id="f-${id}-y" class="num" type="number" value="${esc(year ?? '')}" placeholder="${yearPh}" min="1990" max="2200" aria-label="Year">${withApprox ? `<label class="approx" title="Roughly placed in time"><input type="checkbox" id="f-${id}-a" ${approx ? 'checked' : ''}>${approxLabel}</label>` : ''}</div>`;
const districtOptions = (selectedId) => { const groups = new Map(); for (const d of S.districts) { const k = d.parentId ? (regionById(d.parentId)?.name || 'Unplaced') : 'Unplaced'; (groups.get(k) || groups.set(k, []).get(k)).push(d); } return [...groups.entries()].map(([g, ds]) => `<optgroup label="${esc(g)}">${ds.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`).join(''); };
function renderEditor(b) {
  const d = districtById(b.districtId); const hoods = hoodsIn(b.districtId);
  const f = (id, label, input, hint = '') => `<div class="f"><label for="f-${id}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>${input}</div>`;
  const inp = (id, val, attrs = '') => `<input id="f-${id}" value="${esc(val ?? '')}" ${attrs}>`;
  const numI = (id, val, attrs = '') => `<input id="f-${id}" class="num" type="number" value="${esc(val ?? '')}" ${attrs}>`;
  const url = imgUrl(b.id, 'full'); const hist = isHist(b); const uw = isUnderWay(b);
  const regPreview = DR.isNew ? `${hist ? 'H-' : ''}${esc(d?.code || 'XX')}-#### · issued on save` : esc(b.reg);
  const streets = [...new Set([...S.roads.map(r => r.name), ...S.buildings.map(x => x.street)].filter(Boolean))].sort();
  const sug = roadSuggest(b);
  return `
  <div class="dhd"><span class="t">${DR.isNew ? (hist ? 'NEW HISTORICAL RECORD' : 'NEW RECORD') : 'EDIT · ' + esc(b.reg)} <span class="${hist ? 'reg-h' : ''}" style="font-weight:400;letter-spacing:.04em" id="reg-preview">${DR.isNew ? '· ' + regPreview : ''}</span></span><button class="btn ghost icon sm" data-act="dr-close" title="Close (Esc)">${icon('x')}</button></div>
  <div class="dbody">
    <div class="photo" id="photo" tabindex="0" title="Drop or paste a screenshot here">${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('img')}Drop a screenshot here, paste one, or click Add photo</div>`}
      <div class="acts"><button class="btn sm" data-act="dr-photo">${icon('img')} ${url ? 'Replace' : 'Add photo'}</button>${url ? `<button class="btn sm danger" data-act="dr-photo-remove">${icon('trash')}</button>` : ''}</div></div>
    <form class="form" id="bform" autocomplete="off" onsubmit="return false">
      <div class="fsect"><h4>LOCATION</h4>
        <div class="frow">
          ${f('district', 'Borough / district', `<select id="f-district">${districtOptions(b.districtId)}</select>`, DR.isNew ? '' : 'move → new reg №')}
          ${f('hood', 'Neighborhood', `<select id="f-hood"><option value="">— none —</option>${hoods.map(h => `<option value="${h.id}" ${h.id === b.neighborhoodId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}<option value="__new">+ New neighborhood…</option></select>`)}
        </div>
        <div class="frow c3">
          ${f('number', 'Building №', inp('number', b.number, 'placeholder="432"'))}
          <div class="f" style="grid-column:span 2"><label for="f-street">Street <span class="hint">text · the road link is below</span></label>${inp('street', b.street, 'placeholder="Park Ave" list="streets"')}<datalist id="streets">${streets.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
        </div>
        <div class="frow c3">
          <div class="f"><label for="f-name">Building name <span class="hint">optional</span></label>${inp('name', b.name, 'placeholder="New BK Tower"')}</div>
          ${f('x', 'X coordinate', numI('x', b.x, 'placeholder="0" step="1"'), 'Minecraft X')}
          ${f('z', 'Z coordinate', numI('z', b.z, 'placeholder="0" step="1"'), 'Minecraft Z')}
        </div>
        <div class="frow c3">
          <div class="f" style="align-self:end"><button type="button" class="btn sm" data-act="place-on-map">${icon('pin')} Pick coordinates on the map</button></div>
          ${f('ex', 'Entrance X', numI('ex', b.entrance?.x, 'placeholder="—" step="1"'), 'optional · where you walk in')}
          ${f('ez', 'Entrance Z', numI('ez', b.entrance?.z, 'placeholder="—" step="1"'))}
        </div>
        <div id="f-place-hint" class="fieldnote">${placeHintHTML(b)}</div>
        <div class="frow" style="margin-top:10px">
          <div class="f span"><label for="f-road">Serving road <span class="hint">association only — coordinates never move</span></label><select id="f-road"><option value="">— none —</option>${S.roads.slice().sort((a, c) => roadLabel(a).localeCompare(roadLabel(c))).map(r => { const it = sug.items.find(x => x.road.id === r.id); return `<option value="${r.id}" ${r.id === b.roadId ? 'selected' : ''}>${esc(roadLabel(r))}${it ? ` — ${Math.round(it.d)} blk${it.kind === 'best' ? ' · suggested' : ''}${it.penalty ? ' · ' + it.flags[0] : ''}` : ''}</option>`; }).join('')}</select>${sug.items.length ? `<div class="fieldnote">${esc(roadSuggestReason(sug.items[0], sug.basis))}</div>` : ''}</div>
        </div>
      </div>
      <div class="fsect"><h4>LIFECYCLE <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">physical · market · heritage are independent</span></h4>
        <div class="frow c3">
          ${f('physical', 'Physical status', `<select id="f-physical">${PHYSICAL.map(s => `<option value="${s.id}" ${s.id === (b.physical || 'standing') ? 'selected' : ''}>${s.glyph} ${s.label}</option>`).join('')}</select>`, 'demolished = historical')}
          ${f('market', 'Market status', `<select id="f-market">${MARKET.map(m => `<option value="${m.id}" ${m.id === (b.market || '') ? 'selected' : ''}>${m.glyph} ${m.label}</option>`).join('')}</select>`)}
          <div class="f"><label>Landmark</label><label class="switch"><input type="checkbox" id="f-landmark" ${b.landmark ? 'checked' : ''}> <span class="muted" style="font-size:12px">✦ designated</span></label></div>
        </div>
        <div class="frow" style="margin-top:10px">
          <div class="f span"><label>Construction started <span class="hint">Early = Jan–Jun · Late = Jul–Dec · leave the half unknown if you only know the year</span></label>${hyControl('started', b.yearStarted, b.halfStarted, b.yearStartedApprox, { yearPh: '2020' })}</div>
          <div class="f span" id="fs-expected"><label>Expected completion <span class="hint">projects only — a future year here never counts the building as finished</span></label>${hyControl('expected', b.yearExpected, b.halfExpected, b.yearExpectedApprox, { yearPh: '2027' })}</div>
          <div class="f span" id="fs-built"><label>Completed / opened <span class="hint">the year it stood finished</span></label>${hyControl('built', b.yearBuilt, b.halfBuilt, b.yearBuiltApprox, { yearPh: '2021' })}</div>
          <div class="f span"><label>Major alteration</label>${hyControl('altered', b.yearAltered, b.halfAltered, false, { yearPh: '—', withApprox: false })}</div>
        </div>
        <div class="frow c3" style="margin-top:10px">
          ${f('dateStarted', 'Exact start date', `<input id="f-dateStarted" type="date" value="${esc(b.dateStarted || '')}">`, 'optional')}
          ${f('dateBuilt', 'Exact completion date', `<input id="f-dateBuilt" type="date" value="${esc(b.dateBuilt || '')}">`, 'optional')}
          ${f('dateDemolished', 'Exact demolition date', `<input id="f-dateDemolished" type="date" value="${esc(b.dateDemolished || '')}">`, 'optional')}
        </div>
      </div>
      <div class="fsect ${hist ? '' : 'dimmed'}" id="fs-demo"><h4>DEMOLITION <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">${hist ? 'historical record' : 'fill in only if the building is gone — the physical status switches to Demolished'}</span></h4>
        <div class="frow">
          <div class="f span"><label>Demolished</label>${hyControl('demolished', b.yearDemolished, b.halfDemolished, b.yearDemolishedApprox, { yearPh: '2022' })}</div>
          ${f('reason', 'Reason', inp('reason', b.demolitionReason, 'placeholder="Redevelopment…" list="reasons"') + `<datalist id="reasons">${DEMOLITION_REASONS.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`)}
          <div class="f span"><label for="f-significance">Historical significance <span class="hint">one line · why this building matters to the record</span></label>${inp('significance', b.significance, 'placeholder="First tower in Lower Man A; set the C5-5 skyline scale…"')}</div>
          <div class="f span"><label for="f-historyNotes">Site history notes <span class="hint">what you found, where, and what it proves</span></label><textarea id="f-historyNotes" placeholder="Seen in the 2015-06-22 world save at X 120 Z -40. Screenshot IMG_2231 shows it half-demolished in mid 2022…">${esc(b.historyNotes || '')}</textarea></div>
        </div>
      </div>
      <div class="fsect"><h4>CLASSIFICATION & ZONING</h4>
        <div class="frow">
          <div class="f"><label for="f-class">Building class</label>${comboHTML('class', b.bldgClass, 'placeholder="O4, D8, A5…"')}<div class="desc-line" id="class-desc">${b.bldgClass ? `<b>${esc(b.bldgClass)}</b> ${esc(classDesc(b.bldgClass))}` : 'letter = family, digit = construction / use'}</div></div>
          ${f('tax', 'Tax class', `<select id="f-tax"><option value="">— auto —</option>${TAX_CLASSES.map(t => `<option value="${t.id}" ${t.id === b.taxClass ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>`, 'suggested from class')}
        </div>
        <div class="frow c3" style="margin-top:10px">
          <div class="f"><label for="f-zoning">Zoning district</label>${comboHTML('zoning', b.zoning, 'placeholder="R6A, C5-3, M1-2…"')}</div>
          ${f('overlay', 'Commercial overlay', `<select id="f-overlay">${OVERLAYS.map(o => `<option value="${o}" ${o === (b.overlay || '') ? 'selected' : ''}>${o || '— none —'}</option>`).join('')}</select>`)}
          ${f('special', 'Special district', inp('special', b.special, 'placeholder="Midtown, Two Bridges…"'))}
        </div>
        <div class="desc-line" id="zoning-desc" style="margin-top:6px">${b.zoning ? `<b>${esc(b.zoning)}</b> ${esc(zoningDesc(b.zoning))}` : 'R residential · C commercial · M manufacturing'}</div>
      </div>
      <div class="fsect"><h4>BUILDING & LOT</h4>
        <div class="frow c3">
          ${f('floors', 'Floors', numI('floors', b.floors, 'placeholder="48" min="0"'))}
          ${f('height', 'Height', numI('height', b.height, 'placeholder="162" min="0"'), 'blocks')}
          ${f('owner', 'Owner (text)', inp('owner', b.owner, 'placeholder="City of New A"'), 'link a business below for the record')}
          ${f('unitsRes', 'Residential units', numI('unitsRes', b.unitsRes, 'min="0"'))}
          ${f('unitsCom', 'Commercial units', numI('unitsCom', b.unitsCom, 'min="0"'))}
          ${f('floorArea', 'Floor area', numI('floorArea', b.floorArea, 'placeholder="measured" min="0"'), 'blocks² · measured, not assumed')}
          ${f('lotFront', 'Frontage', numI('lotFront', b.lotFront, 'placeholder="20" min="0"'), 'blocks')}
          ${f('lotDepth', 'Depth', numI('lotDepth', b.lotDepth, 'placeholder="30" min="0"'), 'blocks')}
          ${f('lotArea', 'Total lot size', numI('lotArea', b.lotArea, 'placeholder="auto" min="0"'), 'blocks² · auto = front × depth')}
        </div>
        <div class="fieldnote" style="margin-top:8px">Footprint: ${b.footprint ? `<b>${fmtInt(footprintAreaOf(b))} blk²</b> measured from ${b.footprint.length} vertices` : 'not drawn'} · <button type="button" class="rowlink" data-act="footprint-draw" style="font:inherit">${b.footprint ? 'redraw on the map' : 'draw on the map'}</button>${b.footprint ? ` · <button type="button" class="rowlink" data-act="footprint-clear" style="font:inherit">clear</button>` : ''}</div>
      </div>
      ${civicEditorHTML(b)}
      <div class="fsect"><h4>VALUATION <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">assessment · asking · agreed prices stay distinct</span></h4>
        <div class="frow c3">
          ${f('assessLand', 'Assessed land', `<div class="pre"><span>$</span>${numI('assessLand', b.assessLand, 'placeholder="0" min="0" step="1000"')}</div>`)}
          ${f('assessBuilding', 'Assessed building', `<div class="pre"><span>$</span>${numI('assessBuilding', b.assessBuilding, 'placeholder="0" min="0" step="1000"')}</div>`, 'improvements')}
          ${f('assessTotal', 'Assessed total', `<div class="pre"><span>$</span>${numI('assessTotal', b.assessTotal, 'placeholder="0" min="0" step="1000"')}</div>`, 'tax assessment')}
          ${f('assessYear', 'Assessment year', numI('assessYear', b.assessYear, 'placeholder="2026" min="1990" max="2200"'))}
          ${f('valuationBasis', 'Basis', `<select id="f-valuationBasis">${['', 'as-is', 'completed', 'land only', 'estimate'].map(v => `<option value="${v}" ${v === (b.valuationBasis || '') ? 'selected' : ''}>${v || '— unspecified —'}</option>`).join('')}</select>`)}
          ${f('listPrice', 'Asking price / rent', `<div class="pre"><span>$</span>${numI('listPrice', b.listPrice, 'placeholder="0" min="0" step="1000"')}</div>`, 'current listing')}
        </div>
        <div id="f-listings">${editorListingsHTML(b)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn sm" data-act="listing-add">${icon('plus')} Listing</button><button type="button" class="btn sm" data-act="tx-add">${icon('plus')} Transaction</button></div>
      </div>
      ${valuationEditorHTML(b)}
      <div class="fsect"><h4>PROVENANCE <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">evidence behind this record</span></h4>
        <div class="frow c3">
          ${f('confidence', 'Confidence', `<select id="f-confidence"><option value="">— not assessed —</option>${CONFIDENCE.map(c => `<option value="${c.id}" ${c.id === b.confidence ? 'selected' : ''}>${esc(c.label)} — ${esc(c.hint)}</option>`).join('')}</select>`)}
          ${f('sourceType', 'Source type', `<select id="f-sourceType"><option value="">— none —</option>${SOURCE_TYPES.map(([id, l]) => `<option value="${id}" ${id === b.sourceType ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
          <div class="f"><label>Verified</label><label class="switch"><input type="checkbox" id="f-verified" ${b.verified ? 'checked' : ''}> <span class="muted" style="font-size:12px">checked against evidence</span></label></div>
          <div class="f span"><label for="f-source">Source <span class="hint">file name, save date, link, who told you</span></label>${inp('source', b.source, 'placeholder="world save 2015-06-22 · IMG_2231.png · article URL…"')}</div>
        </div>
      </div>
      <div class="fsect"><h4>RELATIONSHIPS <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">what this replaced · what replaced it</span></h4>
        <div id="f-rels">${editorRelationsHTML(b)}</div>
        <button type="button" class="btn sm" data-act="rel-add-draft">${icon('link')} Link a building by reg №</button>
      </div>
      <div class="fsect"><h4>NOTES</h4>
        <div class="frow">
          <div class="f span"><label for="f-tags">Tags <span class="hint">space separated</span></label>${inp('tags', (b.tags || []).join(' '), 'placeholder="supertall glass landmark"')}</div>
          <div class="f span"><label for="f-notes">Notes</label><textarea id="f-notes" placeholder="History, materials, who built it, what it replaced…">${esc(b.notes)}</textarea></div>
        </div>
      </div>
    </form>
  </div>
  <div class="dfoot">${DR.isNew ? '' : `<button class="btn danger sm" data-act="dr-delete">${icon('trash')} Delete</button>`}<span class="spacer"></span>
    <button class="btn sm ghost" data-act="dr-cancel">Cancel</button><button class="btn primary sm" data-act="dr-save">${icon('check')} ${DR.isNew ? 'Add to registry' : 'Save changes'}</button></div>`;
}
/* where the coordinates fall by the drawn borders — a suggestion, never a silent move */
function placeHintHTML(b) {
  if (b.x == null || b.z == null) return 'No coordinates yet — pick them on the map or type them in.';
  const s = placeSuggest(b.x, b.z); const d = districtById(b.districtId); const h = hoodById(b.neighborhoodId);
  const parts = [];
  if (!s.districts.length) parts.push('These coordinates fall inside no drawn border.');
  else { const inside = s.districts.map(x => `<b>${esc(x.d.name)}</b>${x.on ? ' (on its border)' : ''}`).join(', '); parts.push(`By the drawn borders this point lies in ${inside}.`); if (d && !s.districts.some(x => x.d.id === d.id)) parts.push(`<span style="color:var(--warn)">The chosen district (${esc(d.name)}) does not contain it — keep it or switch.</span>`); else if (!d) parts.push(''); }
  if (s.hoods.length) { parts.push(`Neighborhood: ${s.hoods.map(x => `<b>${esc(x.h.name)}</b>${x.on ? ' (on border)' : ''}`).join(', ')}.`); if (h && !s.hoods.some(x => x.h.id === h.id)) parts.push(`<span style="color:var(--warn)">Not inside ${esc(h.name)}.</span>`); }
  const sug = s.districts.find(x => x.d.id !== b.districtId && !x.on);
  if (sug) parts.push(`<button type="button" class="rowlink" data-act="place-accept" data-district="${sug.d.id}" style="font:inherit">Switch to ${esc(sug.d.name)}</button>`);
  return parts.join(' ');
}
function editorRelationsHTML(b) {
  const own = (b.relations || []).map((r, i) => ({ r, i, x: byId(r.id), t: RELATION_BY_ID[r.type] })).filter(o => o.x && o.t);
  const idx = relIndex(); const other = [...(idx.get(b.id)?.pred || []), ...(idx.get(b.id)?.succ || []), ...(idx.get(b.id)?.same || [])].filter(e => e.holder !== b.id);
  if (!own.length && !other.length) return `<div class="desc-line" style="margin-bottom:8px">Nothing linked yet.</div>`;
  return `<div class="chips inform">${own.map(o => `<span class="rchip ${isHist(o.x) ? 'hist' : ''}" title="${esc(o.t.hint)}${o.r.note ? ' · ' + esc(o.r.note) : ''}"><span class="k">${esc(o.t.label.toUpperCase())}</span><b>${esc(o.x.reg)}</b><span class="t">${esc(o.x.name || titleOf(o.x))}</span><button type="button" class="x" data-act="rel-remove-draft" data-i="${o.i}" title="Remove">×</button></span>`).join('')}${other.map(e => relChip(e, b.id, { editable: false, holderId: b.id })).join('')}</div>`;
}
function editorListingsHTML(b) {
  const ls = b.listings || [], tx = b.transactions || [];
  if (!ls.length && !tx.length) return `<div class="desc-line" style="margin-top:8px">No listings or transactions recorded.</div>`;
  const row = (l, kind, i) => `<div class="r inform"><div><div class="t"><span class="mk ${kind === 'tx' ? 'info' : 'good'}">${kind === 'tx' ? (l.kind === 'lease' ? 'LEASED' : 'SOLD') : (l.kind === 'lease' ? 'FOR LEASE' : 'FOR SALE')}</span>${esc(l.party || '')}${kind !== 'tx' && l.status ? `<span class="muted">· ${esc(l.status)}</span>` : ''}</div><div class="s">${l.year != null ? hyLabel(l.year, l.half) : 'undated'}${l.note ? ' · ' + esc(truncate(l.note, 60)) : ''}</div></div><div class="v">${fmtCur(num(l.price), l.currency)}</div><button type="button" class="x" data-act="${kind === 'tx' ? 'tx-remove' : 'listing-remove'}" data-i="${i}">×</button></div>`;
  return `<div class="rowlist" style="margin:8px 0 0">${ls.map((l, i) => row(l, 'ls', i)).join('')}${tx.map((t, i) => row(t, 'tx', i)).join('')}</div>`;
}
/* re-render the editor without losing what has been typed */
function rerenderEditor() { if (DR.mode !== 'edit') return; readAnyFormInto(DR.draft, false); const top = $('#drawer .dbody')?.scrollTop || 0; renderDrawer(); const body = $('#drawer .dbody'); if (body) body.scrollTop = top; }

/* searchable code picker for class / zoning */
function comboHTML(kind, value, attrs) { return `<div class="combo" data-combo="${kind}"><input id="f-${kind}" value="${esc(value || '')}" ${attrs} autocomplete="off" spellcheck="false"><div class="list" role="listbox"></div></div>`; }
function comboOptions(kind, q) {
  q = (q || '').trim().toUpperCase();
  if (kind === 'class') {
    const items = BUILDING_CLASSES.filter(c => !q || c.code.startsWith(q) || c.desc.toUpperCase().includes(q) || (CLASS_CATS[c.cat] || '').toUpperCase().includes(q));
    const groups = {}; for (const c of items.slice(0, 80)) (groups[c.cat] ||= []).push(c);
    let html = Object.entries(groups).map(([cat, list]) => `<div class="grp">${cat} · ${esc(CLASS_CATS[cat] || '')}</div>${list.map(c => `<div class="opt" data-v="${c.code}"><b>${c.code}</b><span>${esc(c.desc)}</span></div>`).join('')}`).join('');
    if (q && !CLASS_BY_CODE[q]) html += `<div class="opt custom" data-v="${esc(q)}">Use “${esc(q)}” as a custom class</div>`;
    return html || `<div class="grp">no matches</div>`;
  }
  const items = ZONING.filter(z => !q || z.code.startsWith(q) || z.desc.toUpperCase().includes(q));
  const groups = {}; for (const z of items) (groups[z.family] ||= []).push(z);
  let html = Object.entries(groups).map(([fam, list]) => `<div class="grp">${esc(ZONING_FAMILY_NAMES[fam])}</div>${list.map(z => `<div class="opt" data-v="${z.code}"><b>${z.code}</b><span>${esc(z.desc)}</span></div>`).join('')}`).join('');
  if (q && !ZONING_BY_CODE[q]) html += `<div class="opt custom" data-v="${esc(q)}">Use “${esc(q)}” as a custom zoning district</div>`;
  return html || `<div class="grp">no matches</div>`;
}
function wireCombo(root) {
  const kind = root.dataset.combo, input = root.querySelector('input'), list = root.querySelector('.list');
  const open = () => { list.innerHTML = comboOptions(kind, input.value); root.classList.add('open'); };
  const close = () => root.classList.remove('open');
  const describe = () => {
    const v = input.value.trim().toUpperCase();
    if (kind === 'class') { const el = $('#class-desc'); if (el) el.innerHTML = v ? `<b>${esc(v)}</b> ${esc(classDesc(v) || 'custom class')}` : 'letter = family, digit = construction / use'; const tax = $('#f-tax'); if (tax && !tax.dataset.touched) tax.value = suggestTaxClass(v); }
    else { const el = $('#zoning-desc'); if (el) el.innerHTML = v ? `<b>${esc(v)}</b> ${esc(zoningDesc(v) || 'custom zoning district')}` : 'R residential · C commercial · M manufacturing'; }
  };
  input.addEventListener('focus', open); input.addEventListener('input', () => { open(); describe(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    const opts = [...list.querySelectorAll('.opt')]; let i = opts.findIndex(o => o.classList.contains('act'));
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[i]?.classList.remove('act'); opts[Math.min(opts.length - 1, i + 1)]?.classList.add('act'); opts[Math.min(opts.length - 1, i + 1)]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts[i]?.classList.remove('act'); opts[Math.max(0, i - 1)]?.classList.add('act'); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opts[i] || opts[0]; if (o && root.classList.contains('open')) { input.value = o.dataset.v; describe(); close(); } }
    else if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });
  list.addEventListener('mousedown', e => { const o = e.target.closest('.opt'); if (!o) return; e.preventDefault(); input.value = o.dataset.v; describe(); close(); });
}
const readHY = id => ({ year: num($(`#f-${id}-y`)?.value), half: ['E', 'L'].includes($(`#f-${id}-h`)?.value) ? $(`#f-${id}-h`).value : '', approx: !!$(`#f-${id}-a`)?.checked });
function readFormInto(b, strict = true) {
  const g = id => $('#f-' + id)?.value ?? '';
  if (!$('#bform')) return null;
  b.districtId = g('district') || b.districtId;
  b.neighborhoodId = g('hood') && g('hood') !== '__new' ? g('hood') : null;
  b.number = g('number').trim(); b.street = g('street').trim(); b.name = g('name').trim();
  b.x = num(g('x')); b.z = num(g('z'));
  const ex = num(g('ex')), ez = num(g('ez')); b.entrance = ex != null && ez != null ? { x: ex, z: ez } : null;
  { const rid = g('road') || null; if (rid !== (b.roadId || null)) b.roadIdSource = rid ? 'manual' : null; b.roadId = rid; }
  b.bldgClass = g('class').trim().toUpperCase(); b.taxClass = g('tax') || suggestTaxClass(b.bldgClass);
  b.zoning = g('zoning').trim().toUpperCase(); b.overlay = g('overlay'); b.special = g('special').trim();
  b.physical = g('physical') || 'standing'; b.market = g('market') || ''; b.landmark = !!$('#f-landmark')?.checked;
  const st = readHY('started'), ex2 = readHY('expected'), bu = readHY('built'), al = readHY('altered'), de = readHY('demolished');
  b.yearStarted = st.year; b.halfStarted = st.year != null ? st.half : ''; b.yearStartedApprox = st.year != null && st.approx;
  b.yearExpected = ex2.year; b.halfExpected = ex2.year != null ? ex2.half : ''; b.yearExpectedApprox = ex2.year != null && ex2.approx;
  b.yearBuilt = bu.year; b.halfBuilt = bu.year != null ? bu.half : ''; b.yearBuiltApprox = bu.year != null && bu.approx;
  b.yearAltered = al.year; b.halfAltered = al.year != null ? al.half : '';
  b.yearDemolished = de.year; b.halfDemolished = de.year != null ? de.half : ''; b.yearDemolishedApprox = de.year != null && de.approx;
  b.dateStarted = g('dateStarted'); b.dateBuilt = g('dateBuilt'); b.dateDemolished = g('dateDemolished');
  b.floors = num(g('floors')); b.height = num(g('height')); b.owner = g('owner').trim();
  b.unitsRes = num(g('unitsRes')); b.unitsCom = num(g('unitsCom')); b.floorArea = num(g('floorArea'));
  b.lotFront = num(g('lotFront')); b.lotDepth = num(g('lotDepth')); b.lotArea = num(g('lotArea'));
  b.assessLand = num(g('assessLand')); b.assessBuilding = num(g('assessBuilding')); b.assessTotal = num(g('assessTotal')); b.assessYear = num(g('assessYear')); b.valuationBasis = g('valuationBasis'); b.listPrice = num(g('listPrice'));
  b.tags = g('tags').split(/[\s,]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
  b.notes = g('notes'); readCivicForm(b); readValuationForm(b);
  b.demolitionReason = g('reason').trim(); b.significance = g('significance').trim(); b.historyNotes = g('historyNotes');
  b.confidence = g('confidence'); b.sourceType = g('sourceType'); b.verified = !!$('#f-verified')?.checked; b.source = g('source').trim();
  b.status = summaryStatus(b);
  if (strict) {
    if (!b.number && !b.street && !b.name) return 'Give the record at least a street, a building number or a name.';
    for (const [k, v] of [['Started', b.yearStarted], ['Expected', b.yearExpected], ['Completed', b.yearBuilt], ['Demolished', b.yearDemolished]]) if (v != null && (v < 1900 || v > 2200)) return `${k} year looks off.`;
    if (b.yearDemolished != null && b.physical !== 'demolished') return 'A demolition date needs the physical status “Demolished” — or clear the date.';
    if (b.yearDemolished != null && b.yearBuilt != null && hyIndex(b.yearDemolished, b.halfDemolished) < hyIndex(b.yearBuilt, b.halfBuilt)) return 'Demolished before it was completed — check the dates.';
    if (b.yearStarted != null && b.yearBuilt != null && hyIndex(b.yearStarted, b.halfStarted) > hyIndex(b.yearBuilt, b.halfBuilt)) return 'Construction started after completion — check the dates.';
    if (b.yearStarted != null && b.yearExpected != null && hyIndex(b.yearExpected, b.halfExpected) < hyIndex(b.yearStarted, b.halfStarted)) return 'Expected completion is before the start — check the dates.';
    if (!isUnderWay(b) && !isHist(b) && b.yearBuilt != null && b.yearBuilt > CURRENT_YEAR) return `A ${physicalOf(b.physical).label.toLowerCase()} building cannot be completed in ${b.yearBuilt} — set it Under construction and use “Expected completion”.`;
    if (b.entrance && (b.x == null || b.z == null)) return 'An entrance needs the building coordinates as well.';
  }
  return null;
}
function saveDrawer() {
  if (DR.kind !== 'building') return saveOtherDrawer();
  const err = readFormInto(DR.draft, true);
  if (err) { toast(err, 'warn'); return; }
  const d = DR.draft; d.updated = now(); const hist = isHist(d);
  let afterSave = null;
  if (DR.isNew) { d.reg = hist ? nextHistReg(S, d.districtId) : nextReg(S, d.districtId); d.created = now(); S.buildings.push(d); UI.selected = d.id; toast(`${d.reg} added to ${districtById(d.districtId)?.name}${hist ? ' as a historical record' : ''}`, 'good'); }
  else {
    const i = S.buildings.findIndex(x => x.id === d.id); const prev = S.buildings[i];
    if (prev.districtId !== d.districtId) { d.formerRegs = [...(d.formerRegs || []), prev.reg]; d.reg = hist ? nextHistReg(S, d.districtId) : nextReg(S, d.districtId); toast(`Moved to ${districtById(d.districtId)?.name} as ${d.reg} (formerly ${prev.reg})`, 'good'); }
    else {
      toast('Saved', 'good');
      const wasHist = isHist(prev);
      if (hist && !wasHist && !isHistReg(d.reg)) afterSave = () => toast(`${d.reg} is now historical — reissue it as H-${districtById(d.districtId)?.code}-…?`, 'warn', { label: 'REISSUE', fn: () => reissueReg(d.id) });
      if (!hist && wasHist && isHistReg(d.reg)) afterSave = () => toast(`${d.reg} is standing again — reissue it in the current series?`, 'warn', { label: 'REISSUE', fn: () => reissueReg(d.id) });
    }
    S.buildings[i] = d;
  }
  commit(); DR.mode = 'view'; DR.isNew = false; DR.draft = null; UI.animateRows = false;
  renderView(false); renderDrawer(); afterSave?.();
}
/* move a record into the number series that matches its status; the old number is kept as a former number */
function reissueReg(id) {
  const b = byId(id); if (!b) return;
  const old = b.reg; b.formerRegs = [...(b.formerRegs || []), old]; b.reg = isHist(b) ? nextHistReg(S, b.districtId) : nextReg(S, b.districtId); b.updated = now();
  commit(); renderView(false); if (DR.id === id) renderDrawer(); toast(`${old} reissued as ${b.reg} — ${old} stays searchable as a former number`, 'good');
}
async function deleteBuilding(id) {
  const b = byId(id); if (!b) return;
  const refs = S.buildings.filter(o => o.id !== id && (o.relations || []).some(r => r.id === id));
  const tens = S.tenancies.filter(t => t.buildingId === id); const stns = S.stations.filter(s => s.buildingId === id);
  const r = await confirmDialog({ title: `Delete ${b.reg}?`, body: `<p><b>${esc(titleOf(b))}</b> will be removed from ${esc(districtById(b.districtId)?.name)}.${refs.length ? ` <b>${refs.length}</b> other record${refs.length === 1 ? ' links' : 's link'} to it — those links are removed too.` : ''}${tens.length ? ` ${tens.length} business tenanc${tens.length === 1 ? 'y' : 'ies'} here are removed.` : ''}${stns.length ? ` ${stns.length} station${stns.length === 1 ? '' : 's'} lose their building link.` : ''} You can undo for a few seconds.</p>`, ok: 'Delete', danger: true });
  if (r !== 'ok') return;
  const idx = S.buildings.indexOf(b); const imgRec = b.image ? await idbGet('images', b.id) : null;
  const removedLinks = refs.map(o => ({ o, rels: o.relations.filter(x => x.id === id) }));
  for (const { o } of removedLinks) o.relations = o.relations.filter(x => x.id !== id);
  S.tenancies = S.tenancies.filter(t => t.buildingId !== id); for (const s of stns) s.buildingId = null;
  S.buildings.splice(idx, 1); if (b.image) await removeBuildingImage({ ...b });
  closeDrawer(true); commit(); renderView(false);
  toast(`${b.reg} deleted`, 'warn', { label: 'UNDO', fn: async () => {
    S.buildings.splice(Math.min(idx, S.buildings.length), 0, b);
    for (const { o, rels } of removedLinks) o.relations.push(...rels);
    S.tenancies.push(...tens); for (const s of stns) s.buildingId = id;
    if (imgRec) { await idbPut('images', b.id, imgRec); setImgUrls(b.id, imgRec); b.image = true; SAVE.dirtyImages.add(b.id); SAVE.deletedImages.delete(b.id); }
    commit(); renderView(false);
  } });
}
function copySummary(b) {
  const d = districtById(b.districtId), h = hoodById(b.neighborhoodId); const idx = relIndex(); const comp = siteComponent(b, idx); const road = roadById(b.roadId);
  const lines = [`${b.reg} · ${titleOf(b)}${b.name && addressOf(b) ? ' (' + b.name + ')' : ''}${isHist(b) ? ' · HISTORICAL' : ''}`, `${placePath(d, h).join(' › ')}`, `Status: ${physicalOf(b.physical).label}${b.market ? ' · ' + marketOf(b.market).label : ''}${b.landmark ? ' · landmark' : ''}`, `Class ${b.bldgClass || '—'} ${classDesc(b.bldgClass)} · Tax class ${b.taxClass || '—'}`, `Zoning ${b.zoning || '—'}${b.overlay ? ' / ' + b.overlay : ''}${b.special ? ' · ' + b.special : ''}`, `Started ${startedHTML(b)} · Completed ${builtHTML(b)}${b.yearExpected != null ? ' · Expected ' + expectedHTML(b) : ''}${isHist(b) ? ` · Demolished ${demoHTML(b)}${lifespanOf(b) != null ? ' · lifespan ' + yearsLabel(lifespanOf(b)) : ''}${b.demolitionReason ? ' · ' + b.demolitionReason : ''}` : ''}`, `${b.floors ?? '—'} floors · ${b.height ?? '—'} blocks tall · lot ${fmtInt(lotAreaOf(b))} blocks²${b.footprint ? ' · footprint ' + fmtInt(footprintAreaOf(b)) + ' blocks²' : ''}`, `Assessed land ${fmtMoney(num(b.assessLand))} · building ${fmtMoney(num(b.assessBuilding))} · total ${fmtMoney(num(b.assessTotal))} · asking ${fmtMoney(num(b.listPrice))}`, `Road: ${road ? roadLabel(road) : '—'}${b.x != null ? ` · X ${b.x} Z ${b.z}` : ''}`, `Confidence ${confOf(b.confidence)?.label || 'not assessed'}${b.verified ? ' · verified' : ''}${b.source ? ' · source: ' + b.source : ''}`];
  const ts = tenanciesAt(b); if (ts.length) lines.push('BUSINESSES: ' + ts.map(t => `${bizById(t.businessId)?.name || '?'} (${t.role}${t.current ? '' : ', former'})`).join('; '));
  if (comp.length > 1) { lines.push('SITE HISTORY'); for (const e of chronology(comp)) lines.push(e.vacant ? `  ${e.from}–${e.to ?? 'present'} — vacant` : `  ${spanHTML(e.b)} — ${e.b.reg} — ${e.b.name || titleOf(e.b)}`); }
  navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Summary copied', 'good'), () => toast('Clipboard blocked', 'warn'));
}
function stepRecord(dir) {
  if (DR.kind !== 'building') return;
  const list = UI.nav === 'history' ? histFiltered() : applyFilters(scopeBuildings()); const i = list.findIndex(b => b.id === DR.id);
  const nxt = list[i + dir]; if (nxt) openBuilding(nxt.id, 'view');
}

/* ---- drawer wiring ---- */
function wireDrawer() {
  const el = $('#drawer');
  $$('.combo', el).forEach(wireCombo);
  const photo = $('#photo', el);
  if (photo) {
    photo.addEventListener('dragover', e => { e.preventDefault(); photo.classList.add('drag'); });
    photo.addEventListener('dragleave', () => photo.classList.remove('drag'));
    photo.addEventListener('drop', e => { e.preventDefault(); photo.classList.remove('drag'); const f = e.dataTransfer.files?.[0]; if (f) attachPhoto(f); });
    photo.addEventListener('click', e => { if (!e.target.closest('.acts')) $('#file-img').click(); });
  }
  const tax = $('#f-tax', el); if (tax) tax.addEventListener('change', () => tax.dataset.touched = '1');
  const dist = $('#f-district', el);
  if (dist) dist.addEventListener('change', () => {
    const hs = hoodsIn(dist.value); const sel = $('#f-hood'); if (sel) sel.innerHTML = `<option value="">— none —</option>${hs.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}<option value="__new">+ New neighborhood…</option>`;
    updatePlaceHint();
  });
  const hood = $('#f-hood', el);
  if (hood) hood.addEventListener('change', async () => {
    if (hood.value !== '__new') return;
    const name = await promptDialog({ title: 'New neighborhood', label: 'Neighborhood name', placeholder: 'e.g. Midtown Man A' });
    if (!name) { hood.value = ''; return; }
    const did = $('#f-district').value; const h = newHood(did, name); S.neighborhoods.push(h); commit({ silentRender: true });
    hood.insertAdjacentHTML('afterbegin', `<option value="${h.id}">${esc(h.name)}</option>`); hood.value = h.id;
    toast(`Neighborhood “${name}” added — draw its border in the Map workspace`, 'good');
  });
  ['x', 'z'].forEach(id => $('#f-' + id, el)?.addEventListener('input', debounce(updatePlaceHint, 200)));
  ['lotFront', 'lotDepth'].forEach(id => $('#f-' + id, el)?.addEventListener('input', () => { const a = $('#f-lotArea'); const fr = num($('#f-lotFront').value), dp = num($('#f-lotDepth').value); if (a && fr && dp) a.placeholder = 'auto ' + fmtInt(fr * dp); }));
  // lifecycle: entering a demolition date switches the physical status (visibly) to Demolished; the expected-completion row follows the status
  const phys = $('#f-physical', el), yd = $('#f-demolished-y', el), fsDemo = $('#fs-demo', el), fsExp = $('#fs-expected', el), fsBuilt = $('#fs-built', el);
  const syncLife = () => {
    if (!phys) return; const hist = phys.value === 'demolished'; const uw = ['construction', 'planned'].includes(phys.value);
    fsDemo?.classList.toggle('dimmed', !hist); fsExp?.classList.toggle('dimmed', !uw); if (fsBuilt) fsBuilt.querySelector('label').innerHTML = uw ? 'Completed / opened <span class="hint">leave empty while the project is under way</span>' : 'Completed / opened <span class="hint">the year it stood finished</span>';
    const pv = $('#reg-preview'); if (pv && DR.isNew) { const code = districtById($('#f-district')?.value)?.code || 'XX'; pv.textContent = `· ${hist ? 'H-' : ''}${code}-#### · issued on save`; pv.classList.toggle('reg-h', hist); }
  };
  if (phys) { phys.addEventListener('change', syncLife); dist?.addEventListener('change', syncLife); syncLife(); }
  if (yd && phys) yd.addEventListener('input', () => { if (yd.value.trim() && phys.value !== 'demolished') { phys.value = 'demolished'; syncLife(); toast('Physical status set to Demolished — this becomes a historical record', 'warn'); } });
}
function updatePlaceHint() { const hint = $('#f-place-hint'); if (!hint || !DR.draft) return; readFormInto(DR.draft, false); hint.innerHTML = placeHintHTML(DR.draft); }
async function attachPhoto(file) {
  if (ARCH.editing) return archiveAttachPhoto(file);      // chronicle image modal is open
  if (DR.kind === 'building' || DR.kind === 'business') {
    if (DR.mode === 'edit') { const b = DR.draft; await setBuildingImage(b, file); if (!DR.isNew) { const real = recordById(DR.kind, b.id); if (real) real.image = true; } renderDrawerPhotoOnly(); }
    else { const b = recordById(DR.kind, DR.id); if (b) { await setBuildingImage(b, file); renderDrawer(); renderView(false); } }
  }
}
function renderDrawerPhotoOnly() {
  const url = imgUrl(DR.id, 'full'); const photo = $('#photo'); if (!photo) return;
  photo.innerHTML = `${url ? `<img src="${url}" alt="">` : `<div class="ph">${icon('img')}Drop a screenshot here, paste one, or click Add photo</div>`}<div class="acts"><button class="btn sm" data-act="dr-photo">${icon('img')} ${url ? 'Replace' : 'Add photo'}</button>${url ? `<button class="btn sm danger" data-act="dr-photo-remove">${icon('trash')}</button>` : ''}</div>`;
}
document.addEventListener('paste', e => {
  if (!DR.id && !ARCH.editing) return; const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (item) { e.preventDefault(); attachPhoto(item.getAsFile()); }
});
$('#file-img').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) attachPhoto(f); e.target.value = ''; });

/* ---- pickers: search buildings / businesses / roads by number or name ---- */
function buildingSearch(q, { exclude = [] } = {}) {
  q = (q || '').trim().toLowerCase(); const ex = new Set(exclude);
  const list = S.buildings.filter(b => !ex.has(b.id));
  if (!q) return list.slice().sort((a, b) => a.reg.localeCompare(b.reg)).slice(0, 40);
  const toks = q.split(/\s+/);
  const scored = list.map(b => { const reg = b.reg.toLowerCase(); const hay = [reg, ...(b.formerRegs || []).map(x => String(x).toLowerCase()), (b.name || '').toLowerCase(), addressOf(b).toLowerCase(), districtById(b.districtId)?.name.toLowerCase() || '', hoodById(b.neighborhoodId)?.name.toLowerCase() || '', String(b.yearBuilt || ''), String(b.yearDemolished || '')].join(' '); if (!toks.every(t => hay.includes(t))) return null; return { b, s: reg === q ? 0 : reg.startsWith(q) ? 1 : (b.formerRegs || []).some(x => String(x).toLowerCase() === q) ? 2 : 3 }; }).filter(Boolean);
  return scored.sort((x, y) => x.s - y.s || x.b.reg.localeCompare(y.b.reg)).map(x => x.b).slice(0, 40);
}
const buildingOptHTML = b => `<div class="optrow"><b class="${isHist(b) ? 'h' : ''}">${esc(b.reg)}</b><span class="t">${esc(b.name || titleOf(b))}${b.name && addressOf(b) ? ` <span class="muted">· ${esc(addressOf(b))}</span>` : ''}</span><span class="m">${esc(districtById(b.districtId)?.code || '')} · ${esc(spanHTML(b))}</span></div>`;
function genericSearch(list, q, fields) { q = (q || '').trim().toLowerCase(); if (!q) return list.slice(0, 40); const toks = q.split(/\s+/); return list.filter(x => { const hay = fields(x).join(' ').toLowerCase(); return toks.every(t => hay.includes(t)); }).slice(0, 40); }
/* Generic modal picker: resolves { id, form } or null. `items(q)` returns [{ id, html }]. */
function pickerDialog({ title, kicker, label, placeholder, items, extra = '', okLabel = 'Choose', hint = 'Type to search · ↑ ↓ to move · Enter to choose', allowCreate = null }) {
  return new Promise(res => {
    let chosen = null;
    openModal({ title, kicker, cls: 'narrow',
      body: `${extra}<div class="f" style="margin-top:12px"><label>${esc(label)}</label><div class="combo static" id="pick"><input id="pick-q" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"><div class="list" role="listbox"></div></div></div><div class="desc-line" style="margin-top:6px">${esc(hint)}</div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button>${allowCreate ? `<button class="btn" data-r="create">${esc(allowCreate)}</button>` : ''}<span class="spacer"></span><button class="btn primary" data-r="ok" id="pick-ok" disabled>${esc(okLabel)}</button>`,
      onOpen: m => {
        const input = m.querySelector('#pick-q'), list = m.querySelector('#pick .list'), ok = m.querySelector('#pick-ok');
        const form = () => { const o = {}; m.querySelectorAll('[data-x]').forEach(el => o[el.dataset.x] = el.type === 'checkbox' ? el.checked : el.value); return o; };
        const done = r => { const q = input.value; closeModal(); res(r === 'ok' && chosen ? { id: chosen, form: form() } : r === 'create' ? { create: true, q, form: form() } : null); };
        const show = () => { const its = items(input.value); chosen = null; ok.disabled = true; list.innerHTML = its.length ? its.map(it => `<div class="opt wide" data-v="${esc(it.id)}">${it.html}</div>`).join('') : '<div class="grp">no matches</div>'; };
        const select = el => { list.querySelectorAll('.opt').forEach(o => o.classList.toggle('act', o === el)); chosen = el?.dataset.v || null; ok.disabled = !chosen; };
        input.addEventListener('input', show);
        input.addEventListener('keydown', e => {
          const opts = [...list.querySelectorAll('.opt')]; let i = opts.findIndex(o => o.classList.contains('act'));
          if (e.key === 'ArrowDown') { e.preventDefault(); select(opts[Math.min(opts.length - 1, i + 1)]); opts[Math.min(opts.length - 1, i + 1)]?.scrollIntoView({ block: 'nearest' }); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); select(opts[Math.max(0, i - 1)]); }
          else if (e.key === 'Enter') { e.preventDefault(); if (!chosen && opts[0]) select(opts[0]); if (chosen) done('ok'); }
        });
        list.addEventListener('mousedown', e => { const o = e.target.closest('.opt'); if (!o) return; e.preventDefault(); select(o); });
        list.addEventListener('dblclick', e => { const o = e.target.closest('.opt'); if (o) { select(o); done('ok'); } });
        m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r));
        m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel');
        show(); input.focus();
      } });
  });
}
/* "Link a building" — pick a relation type and a building (by reg № / name). Returns { type, id } or null. */
async function linkDialog(me, presetType) {
  const t = presetType || (isHist(me) ? 'replaced_by' : 'replaced');
  const r = await pickerDialog({
    title: `Link a building to ${me.reg || 'this record'}`, kicker: 'RELATIONSHIP', label: 'Search by registration number or name', placeholder: 'MA-0019, H-MA-0003, ZAY Building…', okLabel: 'Link',
    extra: `<div class="f" style="margin-top:12px"><label>This record …</label><select data-x="type" id="link-type">${RELATION_TYPES.map(x => `<option value="${x.id}" ${x.id === t ? 'selected' : ''}>${esc(x.label)} — ${esc(x.hint)}</option>`).join('')}</select></div>`,
    items: q => buildingSearch(q, { exclude: [me.id] }).map(b => ({ id: b.id, html: buildingOptHTML(b) })),
  });
  return r && r.id ? { type: r.form.type, id: r.id } : null;
}
async function buildingPickDialog(exclude = [], title = 'Choose a building', okLabel = 'Choose') {
  const r = await pickerDialog({ title, kicker: 'BUILDING', label: 'Search by registration number or name', placeholder: 'MA-0019, H-MA-0003…', okLabel, items: q => buildingSearch(q, { exclude }).map(b => ({ id: b.id, html: buildingOptHTML(b) })) });
  return r && r.id ? r.id : null;
}
const bizOptHTML = z => `<div class="optrow"><b style="color:var(--biz)">${esc(z.reg)}</b><span class="t">${esc(bizLabel(z))}${z.category ? ` <span class="muted">· ${esc(z.category)}</span>` : ''}</span><span class="m">${esc(BIZ_STATUS[z.status]?.label || z.status)}</span></div>`;
async function bizPickDialog({ exclude = [], title = 'Link a business', withRole = true } = {}) {
  const r = await pickerDialog({ title, kicker: 'BUSINESS', label: 'Search businesses by name or number', placeholder: 'Silvernine Properties, BZ-0003…', okLabel: 'Link', allowCreate: '+ New business',
    extra: withRole ? `<div class="frow" style="margin-top:12px"><div class="f"><label>Role</label><select data-x="role">${TENANCY_ROLES.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></div><div class="f"><label>Since (year · optional)</label><div class="hy"><select data-x="half">${HALVES.map(h => `<option value="${h.id}">${h.label}</option>`).join('')}</select><input data-x="year" type="number" placeholder="2024" min="1990" max="2200"></div></div></div>` : '',
    items: q => genericSearch(S.businesses.filter(z => !exclude.includes(z.id)), q, z => [z.reg, z.name, ...(z.aliases || []), z.category]).map(z => ({ id: z.id, html: bizOptHTML(z) })) });
  return r;
}
const roadOptHTML = r => `<div class="optrow"><b style="color:var(--road)">${esc(r.reg)}</b><span class="t">${esc(roadLabel(r))}${r.aliases?.length ? ` <span class="muted">· ${esc(r.aliases.join(', '))}</span>` : ''}</span><span class="m">${esc(ROAD_TYPE_LABEL[r.type] || r.type)} · ${fmtInt(polyLength(r.geometry))} blk</span></div>`;
async function roadPickDialog(title = 'Choose a road') {
  const r = await pickerDialog({ title, kicker: 'ROAD', label: 'Search roads by name, alias or number', placeholder: 'Mill Street, RD-0002…', okLabel: 'Use', items: q => genericSearch(S.roads, q, r => [r.reg, r.name, ...(r.aliases || []), ...(r.formerNames || [])]).map(r => ({ id: r.id, html: roadOptHTML(r) })) });
  return r && r.id ? r.id : null;
}
/* add a tenancy from a picker result (existing or newly created business) */
async function linkBusinessToBuilding(b) {
  const r = await bizPickDialog({ exclude: [] }); if (!r) return;
  let z = r.id ? bizById(r.id) : null;
  if (r.create) { const name = (r.q || '').trim() || await promptDialog({ title: 'New business', label: 'Business name' }); if (!name) return; z = newBusiness(S); z.name = name; S.businesses.push(z); toast(`${z.reg} ${name} created`, 'good'); }
  if (!z) return;
  const t = newTenancy(z.id, b.id, r.form.role || 'tenant'); t.yearFrom = num(r.form.year); t.halfFrom = ['E', 'L'].includes(r.form.half) && t.yearFrom != null ? r.form.half : '';
  S.tenancies.push(t); commit(); renderDrawer(); renderView(false); toast(`${bizLabel(z)} linked as ${ROLE_LABEL[t.role].toLowerCase()}`, 'good');
}
/* a small dialog that asks for a half-year date; resolves { year, half } or null */
function hyPromptDialog({ title, body = '', ok = 'OK', year = CURRENT_YEAR, half = CURRENT_HALF, kicker = '', label = 'Date' }) {
  return new Promise(res => {
    openModal({ title, kicker, cls: 'narrow', body: `${body}<div class="f" style="margin-top:10px"><label>${esc(label)}</label><div class="hy"><select id="hyp-h">${HALVES.map(h => `<option value="${h.id}" ${h.id === (half || '') ? 'selected' : ''}>${h.label}</option>`).join('')}</select><input id="hyp-y" type="number" value="${esc(year ?? '')}" min="1990" max="2200" placeholder="year"></div></div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">${esc(ok)}</button>`,
      onOpen: m => {
        const done = r => { const y = num(m.querySelector('#hyp-y').value); const h = m.querySelector('#hyp-h').value; closeModal(); res(r === 'ok' ? { year: y, half: ['E', 'L'].includes(h) && y != null ? h : '' } : null); };
        m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r));
        m.querySelector('#hyp-y').addEventListener('keydown', e => { if (e.key === 'Enter') done('ok'); });
        m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel');
      } });
  });
}
async function endTenancy(id) {
  const t = S.tenancies.find(x => x.id === id); if (!t) return;
  const r = await hyPromptDialog({ title: 'End this tenancy?', body: `<p>It stays in the occupancy history as a former ${esc(ROLE_LABEL[t.role] || t.role).toLowerCase()}.</p>`, ok: 'End tenancy', label: 'Ended' });
  if (!r) return;
  t.current = false; t.yearTo = r.year ?? CURRENT_YEAR; t.halfTo = r.half;
  commit(); renderDrawer(); renderView(false); toast('Tenancy ended — kept in history', 'good');
}
