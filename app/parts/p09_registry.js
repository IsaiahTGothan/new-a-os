/* =====================================================================
   §9  REGISTRY — every building in the scope: filters · table · gallery
   ===================================================================== */
const COLUMNS = [
  { key: 'thumb', label: '', sortable: false, w: 52 },
  { key: 'reg', label: 'REG №' },
  { key: 'address', label: 'ADDRESS' },
  { key: 'district', label: 'PLACE', multi: true },
  { key: 'hood', label: 'NEIGHBORHOOD' },
  { key: 'bldgClass', label: 'CLASS' },
  { key: 'zoning', label: 'ZONING' },
  { key: 'yearBuilt', label: 'DATES', r: true },
  { key: 'floors', label: 'FLOORS', r: true },
  { key: 'lotArea', label: 'LOT BLK²', r: true },
  { key: 'assessTotal', label: 'ASSESSED', r: true },
  { key: 'listPrice', label: 'ASKING', r: true },
  { key: 'status', label: 'STATUS' },
  { key: 'road', label: 'ROAD' },
];
function sortValue(b, key) {
  switch (key) {
    case 'address': return (b.street + ' ' + String(b.number).padStart(6, '0')).toLowerCase();
    case 'district': return districtById(b.districtId)?.name || '';
    case 'hood': return hoodById(b.neighborhoodId)?.name || '';
    case 'road': return roadById(b.roadId)?.name || '';
    case 'lotArea': return lotAreaOf(b) ?? -1;
    case 'lifespan': return lifespanOf(b) ?? -1;
    case 'conf': return b.confidence ? CONF_ORDER[b.confidence] : 9;
    case 'yearBuilt': return (num(b.yearBuilt) ?? num(b.yearStarted) ?? num(b.yearExpected) ?? -1) * 2 + ((b.yearBuilt != null ? b.halfBuilt : b.halfStarted) === 'L' ? 1 : 0);
    case 'yearDemolished': case 'floors': case 'assessTotal': case 'listPrice': return num(b[key]) ?? -1;
    case 'status': return PHYSICAL.findIndex(s => s.id === (b.physical || 'standing')) * 10 + (b.landmark ? 0 : 5);
    default: return (b[key] ?? '').toString().toLowerCase();
  }
}
/* everything searchable about a building, including the numbers of what it replaced / was replaced by */
function haystack(b, idx) {
  const r = idx?.get(b.id);
  return [b.reg, ...(b.formerRegs || []), b.name, b.number, b.street, b.bldgClass, classDesc(b.bldgClass), b.zoning, b.overlay, b.special, b.owner, b.notes, (b.tags || []).join(' '), hoodById(b.neighborhoodId)?.name, districtById(b.districtId)?.name, districtById(b.districtId)?.code, b.yearBuilt, b.yearDemolished, b.yearStarted, b.yearExpected, b.demolitionReason, b.significance, b.historyNotes, b.source, b.confidence, isHist(b) ? 'demolished historical' : '', physicalOf(b.physical).label, b.market ? marketOf(b.market).label : '', b.landmark ? 'landmark' : '',
    roadById(b.roadId)?.name, ...(roadById(b.roadId)?.aliases || []), ...tenanciesAt(b).map(t => bizById(t.businessId)?.name || ''),
    ...(r ? [...r.pred, ...r.succ, ...r.same].map(e => e.b.reg + ' ' + (e.b.name || '')) : [])].join(' ').toLowerCase();
}
const matchesQ = (hay, q) => q.split(/\s+/).every(t => hay.includes(t));
function applyFilters(rows) {
  const f = UI.filters, q = UI.q.trim().toLowerCase(); const idx = q ? relIndex() : null;
  let out = rows.filter(b => {
    if (isHist(b) && !f.hist && f.physical !== 'demolished' && !q) return false;   // historical records stay out while browsing — a search always finds them
    if (f.physical && (b.physical || 'standing') !== f.physical) return false;
    if (f.market && (b.market || '') !== f.market) return false;
    if (f.landmark && !b.landmark) return false;
    if (f.family && classFamily(b.bldgClass) !== f.family) return false;
    if (f.zfam && zoningFamily(b.zoning) !== f.zfam) return false;
    if (f.district && b.districtId !== f.district) return false;
    if (f.hood === '__none' ? (b.neighborhoodId && hoodById(b.neighborhoodId)) : (f.hood && b.neighborhoodId !== f.hood)) return false;
    if (f.yearMin && (num(b.yearBuilt) ?? -Infinity) < +f.yearMin) return false;
    if (f.yearMax && (num(b.yearBuilt) ?? Infinity) > +f.yearMax) return false;
    if (f.photo && !b.image) return false;
    if (q && !matchesQ(haystack(b, idx), q)) return false;
    return true;
  });
  const { key, dir } = UI.sort;
  out.sort((a, b) => { const va = sortValue(a, key), vb = sortValue(b, key); return (va < vb ? -1 : va > vb ? 1 : 0) * dir || a.reg.localeCompare(b.reg); });
  return out;
}
const filtersActive = () => { const f = UI.filters; return !!(f.physical || f.market || f.landmark || f.family || f.zfam || f.yearMin || f.yearMax || f.photo || f.hist || UI.q.trim()); };

function renderRegistryTab() {
  const sc = UI.scope; const node = scopeNode(sc); const all = scopeBuildings(sc); const rows = all.filter(isActive); const hist = all.filter(isHist);
  const dists = scopeDistricts(sc); const multi = dists.length > 1;
  const hoods = sc.kind === 'district' ? hoodsIn(sc.id) : [];
  const unassigned = sc.kind === 'district' ? rows.filter(b => !b.neighborhoodId || !hoodById(b.neighborhoodId)).length : 0;
  const assessed = sum(rows, b => b.assessTotal), listed = rows.filter(b => b.market === 'for-sale' || b.market === 'for-lease').length, lot = sum(rows, b => lotAreaOf(b));
  const color = scopeColor(sc);
  return `
  <section class="dhead" style="--c:${color}">
    <div>
      <div class="code"><i></i>REGISTRY · ${scopeKicker(sc)}${node?.founded ? ` · FOUNDED ${esc(node.founded)}` : ''}</div>
      <h2>${esc(scopeName(sc))}${placementHTML(node) ? ' ' + placementHTML(node) : ''}</h2>
      <p>${esc(node?.tagline || (sc.kind === 'all' ? 'Every building in every jurisdiction on file.' : ''))}${node && !(node.polygons || []).length ? ' <span class="notdrawn">BORDER NOT DRAWN YET</span>' : ''}</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="lbl">STANDING</div><div class="val">${rows.filter(isCompleted).length}</div></div>
      <div class="stat"><div class="lbl">UNDER WAY</div><div class="val">${rows.filter(isUnderWay).length}</div></div>
      <div class="stat"><div class="lbl">DEMOLISHED</div><div class="val hist">${hist.length}</div></div>
      <div class="stat"><div class="lbl">ASSESSED</div><div class="val money">${fmtMoneyCompact(assessed)}</div></div>
      <div class="stat"><div class="lbl">LISTED</div><div class="val">${listed}</div></div>
      <div class="stat"><div class="lbl">LOT AREA</div><div class="val">${fmtCompact(lot)}<small class="dim" style="font-size:12px"> blk²</small></div></div>
      ${node && sc.kind !== 'hood' ? `<div class="stat" style="align-self:center"><button class="btn sm" data-act="edit-scope">${icon('edit')} ${sc.kind === 'region' ? REGION_TYPE[node.type]?.label || 'Region' : 'District'}</button></div>` : ''}
    </div>
  </section>
  ${multi ? `<div class="hoods distchips"><button class="chip" aria-pressed="${!UI.filters.district}" data-fdistrict="">All places <span class="cnt">${rows.length}</span></button>${dists.map(d => `<button class="chip ${activeIn(d.id).length ? '' : 'dim'}" aria-pressed="${UI.filters.district === d.id}" data-fdistrict="${d.id}" style="--c:${distColor(d)}"><i></i>${esc(d.name)} <span class="cnt">${activeIn(d.id).length}</span></button>`).join('')}</div>` : ''}
  ${sc.kind === 'district' ? `<div class="hoods">
    <button class="chip" aria-pressed="${!UI.filters.hood}" data-hood="">All neighborhoods <span class="cnt">${rows.length}</span></button>
    ${hoods.map(h => `<button class="chip" aria-pressed="${UI.filters.hood === h.id}" data-hood="${h.id}" style="--c:${color}"><i></i>${esc(h.name)} <span class="cnt">${rows.filter(b => b.neighborhoodId === h.id).length}</span></button>`).join('')}
    ${unassigned && hoods.length ? `<button class="chip" aria-pressed="${UI.filters.hood === '__none'}" data-hood="__none">Unassigned <span class="cnt">${unassigned}</span></button>` : ''}
    <button class="chip add" data-act="manage-hoods" data-id="${sc.id}">${icon('plus')} Neighborhoods</button>
  </div>` : ''}
  <div class="hstrip">${icon('hist')}<span><b>${hist.length}</b> demolished here</span><span>·</span><span>${rows.filter(b => b.landmark).length} landmarks</span><span>·</span><span>${rows.filter(b => b.physical === 'vacant-lot').length} vacant lots</span><span>·</span><button data-act="open-history-records">open in History →</button><button data-act="new-hist">${icon('plus')} add a demolished building</button></div>
  ${renderRegistry(all, { showDistrict: multi, label: scopeName(sc).toUpperCase() + ' REGISTRY' })}`;
}

/* ---- shared registry block: toolbar + table or gallery ---- */
function renderRegistry(rows, opts) {
  const shown = applyFilters(rows);
  const f = UI.filters; const nHist = rows.filter(isHist).length; const base = (f.hist || f.physical === 'demolished') ? rows.length : rows.length - nHist;
  return `
  <div class="toolbar" id="toolbar">
    <div class="seg" role="group" aria-label="View">
      <button data-view="table" aria-pressed="${UI.view === 'table'}" title="Table (V toggles)">${icon('rows')} Table</button>
      <button data-view="gallery" aria-pressed="${UI.view === 'gallery'}" title="Gallery with photos (V toggles)">${icon('grid')} Gallery</button>
    </div>
    <label class="field ${f.physical ? 'on' : ''}"><span>Physical</span><select data-f="physical"><option value="">Any</option>${PHYSICAL.map(s => `<option value="${s.id}" ${f.physical === s.id ? 'selected' : ''}>${s.glyph} ${s.label}</option>`).join('')}</select></label>
    <label class="field ${f.market ? 'on' : ''}"><span>Market</span><select data-f="market"><option value="">Any</option>${MARKET.filter(m => m.id).map(m => `<option value="${m.id}" ${f.market === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
    <button class="field ${f.landmark ? 'on' : ''}" data-f-toggle="landmark" style="cursor:pointer;${f.landmark ? 'color:var(--gold);border-color:rgba(231,195,106,.5)' : ''}" title="Only landmarks">✦ Landmarks</button>
    <label class="field ${f.family ? 'on' : ''}"><span>Class</span><select data-f="family"><option value="">Any</option>${CLASS_FAMILIES.map(c => `<option ${f.family === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field ${f.zfam ? 'on' : ''}"><span>Zoning</span><select data-f="zfam"><option value="">Any</option>${Object.entries(ZONING_FAMILY_NAMES).map(([k, v]) => `<option value="${k}" ${f.zfam === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="field ${f.yearMin || f.yearMax ? 'on' : ''}"><span>Built</span><input type="number" data-f="yearMin" placeholder="from" value="${esc(f.yearMin)}"><span class="muted">–</span><input type="number" data-f="yearMax" placeholder="to" value="${esc(f.yearMax)}"></label>
    <button class="field ${f.photo ? 'on' : ''}" data-f-toggle="photo" style="cursor:pointer">${icon('img')} Photo</button>
    <button class="field ${f.hist ? 'on' : ''}" data-f-toggle="hist" style="cursor:pointer;${f.hist ? 'border-color:var(--hist-2);color:var(--hist)' : ''}" title="Include demolished (historical) records in this list">${icon('hist')} Historical <span class="cnt" style="font-family:var(--font-mono);font-size:11px;color:${f.hist ? 'var(--hist)' : 'var(--ink-3)'}">${nHist}</span></button>
    ${filtersActive() ? `<button class="btn ghost sm" data-act="clear-filters">${icon('x')} Clear</button>` : ''}
    <span class="spacer"></span>
    <span class="count">${shown.length}${shown.length !== base ? ` of ${base}` : ''} records</span>
    <button class="btn sm" data-act="export-csv" title="Download the visible rows as CSV">${icon('down')} CSV</button>
    <button class="btn sm primary" data-act="new">${icon('plus')} Add</button>
  </div>
  <div id="registry">${UI.view === 'gallery' ? renderGallery(shown, opts) : renderTable(shown, opts)}</div>`;
}
function currentRowsAndOpts() { return { rows: scopeBuildings(), opts: { showDistrict: scopeDistricts().length > 1, label: scopeName().toUpperCase() + ' REGISTRY' } }; }
function refreshRegistry() {   // filters/search/sort changed: re-render toolbar + rows without view animation
  hideHover();
  if (UI.nav === 'history') { renderView(false); return; }
  if (UI.nav !== 'registry') return;
  const { rows, opts } = currentRowsAndOpts();
  const tb = $('#toolbar'); if (!tb) return;
  const wrap = document.createElement('div'); wrap.innerHTML = renderRegistry(rows, opts);
  tb.replaceWith(wrap.querySelector('#toolbar')); $('#registry').replaceWith(wrap.querySelector('#registry'));
}
function thumbHTML(b, cls = 'thumb') { const u = imgUrl(b.id); return u ? `<img class="${cls}" src="${u}" alt="" loading="lazy">` : `<span class="${cls} ph">${icon('bldg')}</span>`; }
function statusHTML(b) { return lifecycleBadge(b); }
const regHTML = b => `<span class="reg ${isHist(b) ? 'reg-h' : ''}">${esc(b.reg)}</span>${isHist(b) && !isHistReg(b.reg) ? `<span class="legacy" title="Demolished record still carrying a current-series number — reissue it as H-${esc(districtById(b.districtId)?.code || '')}-#### from the record">LEGACY №</span>` : ''}`;
/* dates cell: started → built (→ demolished); projects show their start / expected date */
function datesCell(b) {
  if (isHist(b)) return `${esc(hyShort(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox))}<span class="muted"> – </span><span class="reg-h">${esc(hyShort(b.yearDemolished, b.halfDemolished, b.yearDemolishedApprox))}</span>`;
  if (isUnderWay(b)) return `<span class="muted">${b.yearStarted != null ? 'from ' : ''}</span>${esc(hyShort(b.yearStarted, b.halfStarted, b.yearStartedApprox))}${b.yearExpected != null ? `<span class="muted"> → </span><span style="color:var(--warn)">${esc(hyShort(b.yearExpected, b.halfExpected, b.yearExpectedApprox))}</span>` : ''}`;
  return esc(hyShort(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox)) + (b.yearAltered ? `<span class="muted" title="altered"> · alt ${esc(b.yearAltered)}</span>` : '');
}
function renderTable(rows, opts) {
  const cols = COLUMNS.filter(c => !c.multi || opts.showDistrict);
  if (!rows.length) return emptyBlock(opts);
  const th = cols.map(c => {
    const sorted = UI.sort.key === c.key; const arrow = sorted ? `<span class="arr">${UI.sort.dir > 0 ? '▲' : '▼'}</span>` : '';
    return `<th ${c.sortable === false ? '' : `data-sort="${c.key}"`} ${sorted ? `aria-sort="${UI.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''} class="${c.r ? 'r' : ''}" ${c.w ? `style="width:${c.w}px"` : ''}>${c.label}${arrow}</th>`;
  }).join('');
  const tr = rows.map((b, i) => {
    const d = districtById(b.districtId), h = hoodById(b.neighborhoodId);
    const cells = cols.map(c => {
      switch (c.key) {
        case 'thumb': return `<td>${thumbHTML(b)}</td>`;
        case 'reg': return `<td>${regHTML(b)}</td>`;
        case 'address': return `<td><span class="addr">${esc(addressOf(b) || b.name || '—')}</span>${addressOf(b) && b.name ? `<span class="nm">${esc(b.name)}</span>` : ''}</td>`;
        case 'district': return `<td><span class="dist" style="--c:${distColor(d)}"><i></i>${esc(d?.name || '—')}</span></td>`;
        case 'hood': return `<td class="dim">${esc(h?.name || '—')}</td>`;
        case 'bldgClass': return `<td>${b.bldgClass ? `<span class="code">${esc(b.bldgClass)}</span><small title="${esc(classDesc(b.bldgClass))}">${esc(truncate(classDesc(b.bldgClass), 26))}</small>` : '<span class="muted">—</span>'}</td>`;
        case 'zoning': return `<td>${b.zoning ? `<span class="code">${esc(b.zoning)}</span>${b.overlay ? `<small>${esc(b.overlay)}</small>` : ''}` : '<span class="muted">—</span>'}</td>`;
        case 'yearBuilt': return `<td class="num r">${datesCell(b)}</td>`;
        case 'lotArea': return `<td class="num r">${fmtInt(lotAreaOf(b))}</td>`;
        case 'floors': return `<td class="num r">${b.floors ?? '—'}</td>`;
        case 'assessTotal': return `<td class="num r" style="color:${num(b.assessTotal) != null ? 'var(--amber)' : 'inherit'}">${fmtMoney(num(b.assessTotal))}</td>`;
        case 'listPrice': return `<td class="num r">${fmtMoney(num(b.listPrice))}</td>`;
        case 'status': return `<td>${statusHTML(b)}</td>`;
        case 'road': { const r = roadById(b.roadId); return `<td class="dim">${r ? `<span data-hover="road:${r.id}">${esc(r.name || r.reg)}</span>` : '—'}</td>`; }
      }
    }).join('');
    return `<tr data-open="${b.id}" data-hover="${b.id}" style="--i:${Math.min(i, 30)};--c:${distColor(d)}" class="${UI.selected === b.id ? 'sel' : ''} ${isHist(b) ? 'hist' : ''}">${cells}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="reg"><thead><tr>${th}</tr></thead><tbody class="${UI.animateRows && motionOn() ? 'anim' : ''}">${tr}</tbody></table></div>`;
}
function renderGallery(rows, opts) {
  if (!rows.length) return emptyBlock(opts);
  return `<div class="gallery ${UI.animateRows && motionOn() ? 'anim' : ''}">${rows.map((b, i) => {
    const d = districtById(b.districtId); const u = imgUrl(b.id, 'full');
    return `<div class="card" data-open="${b.id}" style="--i:${Math.min(i, 30)};--c:${isHist(b) ? 'var(--hist)' : distColor(d)}">
      <div class="img">${u ? `<img src="${u}" alt="" loading="lazy"${isHist(b) ? ' style="filter:saturate(.6)"' : ''}>` : icon(isHist(b) ? 'hist' : 'bldg')}<span class="tag">${statusHTML(b)}</span></div>
      <div class="body">
        <div class="addr"><span>${esc(addressOf(b) || b.name || '—')}</span><span class="reg ${isHist(b) ? 'reg-h' : ''}">${esc(b.reg)}</span></div>
        <div class="nm">${esc(addressOf(b) && b.name ? b.name : (hoodById(b.neighborhoodId)?.name || d?.name || ''))}</div>
        <div class="row2">${b.bldgClass ? `<span class="code" title="${esc(classDesc(b.bldgClass))}">${esc(b.bldgClass)}</span>` : ''}${b.zoning ? `<span class="code">${esc(b.zoning)}</span>` : ''}<span class="code">${esc(isHist(b) ? spanHTML(b) : isUnderWay(b) ? (b.yearExpected != null ? 'expected ' + expectedHTML(b) : b.yearStarted != null ? 'since ' + startedHTML(b) : 'undated project') : builtHTML(b))}</span>${b.floors ? `<span class="code">${esc(b.floors)} fl</span>` : ''}</div>
        <div class="row3"><span>${num(b.assessTotal) != null ? 'Assessed <b>' + fmtMoneyCompact(num(b.assessTotal)) + '</b>' : '<span class="muted">not assessed</span>'}</span><span>${num(b.listPrice) != null ? 'Asking <b>' + fmtMoneyCompact(num(b.listPrice)) + '</b>' : ''}</span></div>
      </div></div>`;
  }).join('')}</div>`;
}
function emptyBlock(opts) {
  if (opts.hist) return `<div class="panel empty">${histFiltersActive() ? `<b>No historical records match</b>Try clearing the filters or the search.<br><button class="btn" data-act="hclear">Clear filters</button>` : `<b>No demolished buildings on record here</b>Start from the present: open a current building, link what stood there before it, or add the lost building directly.<br><button class="btn primary" data-act="new-hist">${icon('plus')} Add a demolished building</button></div>`}</div>`;
  const filtered = filtersActive() || UI.filters.hood || UI.filters.district;
  return `<div class="panel empty">${filtered ? `<b>No records match</b>Try clearing the filters or the search.<br><button class="btn" data-act="clear-filters">Clear filters</button>` : `<b>Nothing registered here yet</b>Add the first building and it will show up in the table, the gallery and the map.<br><button class="btn primary" data-act="new">${icon('plus')} Add building</button>`}</div>`;
}
