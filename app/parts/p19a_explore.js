/* =====================================================================
   §19a EXPLORE — the Google-Maps-like map: wordmark + search panel, place
       cards, directions along the drawn roads, layer chips, zoom, basemap
       (the rendered city under the registry data). Edit mode keeps every
       2.5 tool exactly as it was; explore mode is read-only.
   ===================================================================== */
const EXPLORE = { q: '', items: [], active: 0, from: null, to: null, mode: 'walk', dir: false, picking: null };
const WALK_BLOCKS_PER_SEC = 4.3;          // Minecraft walking speed (sprinting is ~5.6)
const fmtMins = sec => sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
const WORDMARK = `<span class="gm-word" aria-label="GOOGLE"><b class="g1">G</b><b class="g2">O</b><b class="g3">O</b><b class="g4">G</b><b class="g5">L</b><b class="g6">E</b></span><span class="gm-maps">Maps</span>`;

function exploreChromeHTML() {
  const L = UI.layers; const chip = (k, label, c = '') => `<button class="chip ${c}" data-gmlayer="${k}" aria-pressed="${!!L[k]}" style="${c ? '' : `--c:var(--${{ buildings: 'cyan', roads: 'road', transit: 'transit', districts: 'region', hoods: 'ink-2', historical: 'hist', businesses: 'biz', labels: 'ink-2', grid: 'ink-3', footprints: 'cyan', civic: 'civic' }[k] || 'cyan'})`}"><i></i>${label}</button>`;
  const hasBase = (S.settings.basemaps || []).length;
  return `<div class="gm-panel ${MAPW.sel || EXPLORE.dir ? '' : 'closed'}" id="gm-panel">
      <div class="gm-brandbar">${WORDMARK}<span class="gm-parody">NEW A PARODY<br>NOT GOOGLE LLC</span></div>
      <div class="gm-search"><svg><use href="#i-search"/></svg><input id="map-q" placeholder="Search New A — buildings, streets, stations, places…" autocomplete="off" spellcheck="false" aria-label="Search the map"><button class="x" data-act="gm-clear" title="Clear" ${EXPLORE.q ? '' : 'hidden'}>${icon('x')}</button><button class="dir" data-act="gm-directions" title="Directions along the drawn roads">${icon('route')}</button></div>
      <div id="map-palette" class="palette gm-results" hidden></div>
      <div class="gm-card" id="gm-card"></div>
    </div>
    <div class="gm-chips" id="gm-chips">
      ${chip('buildings', 'Buildings')}${chip('roads', 'Roads')}${chip('transit', 'Transit')}${chip('districts', 'Borders')}${chip('hoods', 'Hoods')}${chip('historical', 'Ghosts')}${chip('businesses', 'Businesses')}${chip('labels', 'Labels')}${chip('grid', 'Grid')}
      <button class="chip sat" data-gmlayer="basemap" aria-pressed="${L.basemap !== false && hasBase}" title="${hasBase ? 'Show the rendered city under the data' : 'No basemap yet — add one under Vault & settings → Basemap'}" ${hasBase ? '' : 'data-act="basemap-open"'}>${icon('sat')} ${hasBase ? 'Satellite' : 'Add basemap'}</button>
      <label class="sel" title="Colour buildings by">${icon('layers')}<select id="gm-color">${[['district', 'By borough'], ['status', 'By status'], ['family', 'By class'], ['era', 'By era built']].map(([v, l]) => `<option value="${v}" ${UI.mapColor === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="gm-zoom"><button data-act="map-zoom" data-dir="1" title="Zoom in">${icon('zoomin')}</button><button data-act="map-zoom" data-dir="-1" title="Zoom out">${icon('zoomout')}</button><div class="sep"></div><button data-act="map-fit" title="Fit ${esc(scopeName())}">${icon('fit')}</button></div>
    <div class="gm-scale" id="gm-scale"><span id="map-scale-t">—</span><i id="map-scale-i"></i></div>
    <div class="gm-coord" id="gm-coord">X <b>—</b> · Z <b>—</b></div>
    <button class="gm-edit" data-act="map-edit-toggle" aria-pressed="${MAPW.edit}" title="${MAPW.edit ? 'Back to exploring' : 'Edit the map: borders, roads, transit, stations, buildings'}">${icon(MAPW.edit ? 'map' : 'edit')} ${MAPW.edit ? 'Explore' : 'Edit map'}</button>`;
}
function setMapEdit(on, { keepMode = false } = {}) {
  MAPW.edit = !!on; if (!on) { MAPW.draft = null; MAPW.pending = null; if (!keepMode) MAPW.mode = 'select'; MAPW.dockOpen = true; }
  else { MAPW.dockOpen = true; MAPW.route = null; EXPLORE.dir = false; }
  if (UI.nav === 'map') { const cam = { ...MAPW.cam }; renderView(false); MAPW.cam = cam; mapDraw(); }
}
/* ---- search inside the map panel: the global index, results listed under the search box ---- */
function wireExplore() {
  const input = $('#map-q'), pal = $('#map-palette'); if (!input || !pal || MAPW.edit) { if (!MAPW.edit) return; }
  if (!input || !pal) return;
  const show = () => {
    const q = input.value; EXPLORE.q = q; $('[data-act="gm-clear"]')?.toggleAttribute('hidden', !q);
    const xy = parseCoords(q);
    if (xy) { EXPLORE.items = [{ kind: 'coords', xy, title: `Go to X ${xy[0]} · Z ${xy[1]}`, sub: placeSuggest(xy[0], xy[1]).districts.map(x => x.d.name).join(', ') || 'outside every drawn border', meta: '', color: 'var(--amber)' }]; EXPLORE.active = 0; pal.hidden = false; pal.innerHTML = `<div class="pg">Coordinates</div><div class="pi act" data-pi="0" style="--c:var(--amber)">${icon('pin')}<span class="t"><b>${esc(EXPLORE.items[0].title)}</b><small>${esc(EXPLORE.items[0].sub)}</small></span><span class="m"></span></div>`; return; }
    if (!q.trim()) { pal.hidden = true; EXPLORE.items = []; $('#gm-panel')?.classList.toggle('closed', !MAPW.sel && !EXPLORE.dir); return; }
    const groups = searchAll(q, { limit: 5 }); EXPLORE.items = flatItems(groups); EXPLORE.active = 0; pal.hidden = false; pal.innerHTML = paletteHTML(groups, 0, q); $('#gm-panel')?.classList.remove('closed');
  };
  const pick = i => { const it = EXPLORE.items[i]; if (!it) return; pal.hidden = true; input.value = ''; EXPLORE.q = ''; $('[data-act="gm-clear"]')?.setAttribute('hidden', '');
    if (EXPLORE.picking) { explorePickAt(it.kind === 'coords' ? { kind: 'point', pt: it.xy } : { kind: it.kind === 'historical' ? 'building' : it.kind, id: it.id }); return; }
    if (it.kind === 'coords') { MAPW.marker = { x: it.xy[0], z: it.xy[1], until: Date.now() + 6000 }; mapFlyTo({ x1: it.xy[0] - 60, z1: it.xy[1] - 60, x2: it.xy[0] + 60, z2: it.xy[1] + 60 }); setTimeout(mapDraw, 6100); return; }
    openSearchHit(it, { map: true }); };
  input.addEventListener('input', debounce(show, 80));
  input.addEventListener('focus', () => { if (input.value.trim()) show(); });
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!EXPLORE.items.length) return; e.preventDefault(); EXPLORE.active = (EXPLORE.active + (e.key === 'ArrowDown' ? 1 : EXPLORE.items.length - 1)) % EXPLORE.items.length; $$('#map-palette .pi').forEach(p => p.classList.toggle('act', +p.dataset.pi === EXPLORE.active)); } else if (e.key === 'Enter') { e.preventDefault(); const exact = findAnyByReg(input.value.trim()); if (exact && !EXPLORE.picking) { pal.hidden = true; input.value = ''; mapLocate(exact); return; } if (!EXPLORE.items.length) show(); pick(EXPLORE.active); } else if (e.key === 'Escape') { pal.hidden = true; input.value = ''; EXPLORE.q = ''; input.blur(); $('#gm-panel')?.classList.toggle('closed', !MAPW.sel && !EXPLORE.dir); e.stopPropagation(); } });
  pal.addEventListener('mousedown', e => { const p = e.target.closest('.pi'); if (p) { e.preventDefault(); pick(+p.dataset.pi); } });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { pal.hidden = true; } }, 160));
  $('#gm-color')?.addEventListener('change', e => { UI.mapColor = e.target.value; mapDraw(); });
  $$('#gm-chips [data-gmlayer]').forEach(b => b.addEventListener('click', () => { if (b.dataset.act === 'basemap-open') return; const k = b.dataset.gmlayer; if (k === 'basemap') { UI.layers.basemap = UI.layers.basemap === false; b.setAttribute('aria-pressed', UI.layers.basemap !== false); } else { UI.layers[k] = !UI.layers[k]; b.setAttribute('aria-pressed', UI.layers[k]); if (k === 'transit') UI.layers.stations = UI.layers.transit; } mapDraw(); }));
  loadBasemaps();
}
/* ---- the place card ---- */
function renderPlaceCard() {
  const el = $('#gm-card'); if (!el) return; const panel = $('#gm-panel');
  if (EXPLORE.dir) { el.innerHTML = routePanelHTML(); panel?.classList.remove('closed'); wirePlaceCard(el); return; }
  const sel = MAPW.sel; if (!sel) { el.innerHTML = ''; panel?.classList.toggle('closed', !EXPLORE.q); return; }
  el.innerHTML = placeCardHTML(sel); panel?.classList.remove('closed'); el.scrollTop = 0; wirePlaceCard(el);
}
function wirePlaceCard(el) { $$('.rt-ends .end', el).forEach(b => b.addEventListener('click', () => startPick(b.dataset.end))); }
const factHTML = (k, v, cls = '') => v == null || v === '' ? '' : `<div><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
function nearbyStationsOf(pt, within = 90, limit = 4) { if (!pt) return []; return S.stations.filter(s => s.x != null).map(s => ({ s, d: dist2(pt, [s.x, s.z]) })).filter(x => x.d <= within).sort((a, b) => a.d - b.d).slice(0, limit); }
function nearbyBuildingsOf(pt, within = 40, limit = 6, excludeId = null) { if (!pt) return []; return S.buildings.filter(b => isActive(b) && b.x != null && b.id !== excludeId).map(b => ({ b, d: dist2(pt, [b.x, b.z]) })).filter(x => x.d <= within).sort((a, b) => a.d - b.d).slice(0, limit); }
function placeCardHTML(sel) {
  const close = `<button class="close" data-act="gm-close" title="Close">${icon('x')}</button>`;
  const acts = (list) => `<div class="pc-acts">${list.map(a => `<button class="${a.primary ? 'primary' : ''}" data-act="${a.act}" ${a.data || ''} title="${esc(a.title || a.label)}">${icon(a.icon)}<span>${esc(a.label)}</span></button>`).join('')}</div>`;
  if (sel.kind === 'building') {
    const b = byId(sel.id); if (!b) return ''; const d = districtById(b.districtId), h = hoodById(b.neighborhoodId); const url = imgUrl(b.id, 'full'); const hist = isHist(b), uw = isUnderWay(b); const ph = physicalOf(b.physical); const road = roadById(b.roadId); const sug = road ? null : roadSuggest(b, { limit: 1 }).items[0]; const near = nearbyStationsOf(b.x != null ? [b.x, b.z] : null); const biz = tenanciesAt(b).filter(t => t.current); const hood = h ? h.name : ''; const c = hist ? 'var(--hist)' : distColor(d);
    const evs = []; if (b.yearStarted != null) evs.push({ i: hyIndex(b.yearStarted, b.halfStarted), t: 'started ' + hyShort(b.yearStarted, b.halfStarted) }); if (b.yearBuilt != null) evs.push({ i: hyIndex(b.yearBuilt, b.halfBuilt), t: 'completed ' + hyShort(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox) }); if (b.yearAltered != null) evs.push({ i: hyIndex(b.yearAltered, b.halfAltered), t: 'altered ' + hyShort(b.yearAltered, b.halfAltered) }); if (b.yearDemolished != null) evs.push({ i: hyIndex(b.yearDemolished, b.halfDemolished), t: 'demolished ' + hyShort(b.yearDemolished, b.halfDemolished), hist: true });
    return `<div class="pc-photo" style="--c:${c}">${url ? `<img src="${url}" alt="">` : `<span class="ph">${esc((b.name || addressOf(b) || b.reg).slice(0, 2).toUpperCase())}</span>`}${close}<span class="kind">${hist ? 'DEMOLISHED' : uw ? 'PROJECT' : esc(ph.label.toUpperCase())}${b.landmark ? ' · LANDMARK' : ''}</span>${b.yearBuilt != null ? `<span class="yr">${esc(b.yearBuilt)}</span>` : ''}</div>
    <div class="pc-body" style="--c:${c}">
      <div class="reg"><i></i>${esc(b.reg)} · ${esc(d?.name || '')}${hood ? ' · ' + esc(hood) : ''}</div>
      <h2>${esc(b.name || addressOf(b) || 'Unnamed lot')}</h2>${b.name && addressOf(b) ? `<div class="sub">${esc(addressOf(b))}</div>` : ''}
      <div class="badges"><span class="status physical ${hist ? 'hist' : ph.tone}"><i>${ph.glyph}</i>${ph.label}</span>${b.market ? `<span class="status ${marketOf(b.market).tone}"><i>${marketOf(b.market).glyph}</i>${marketOf(b.market).label}</span>` : ''}${b.landmark ? '<span class="status gold"><i>✦</i>Landmark</span>' : ''}${b.civic?.type ? `<span class="status warn"><i>▣</i>${esc(civicTypeLabel ? civicTypeLabel(b.civic.type) : b.civic.type)}</span>` : ''}</div>
      ${acts([{ act: 'gm-directions-to', icon: 'route', label: 'Directions', primary: true, title: 'Directions here along the drawn roads' }, { act: 'pc-open', icon: 'expand', label: 'Record', title: 'Open the full record' }, { act: 'pc-history', icon: 'play', label: 'History', data: b.yearBuilt != null || b.yearDemolished != null ? `data-year="${b.yearBuilt ?? b.yearDemolished}"` : '', title: 'Open playback at this building' }, { act: 'pc-edit', icon: 'edit', label: 'Edit', title: 'Edit this building on the map' }])}
      <div class="facts">${factHTML(uw ? 'STARTED' : 'COMPLETED', uw ? (b.yearStarted != null ? esc(startedHTML(b)) : '—') : esc(builtHTML(b)))}${factHTML(hist ? 'DEMOLISHED' : uw ? 'EXPECTED' : 'FLOORS', hist ? esc(demoHTML(b)) : uw ? esc(expectedHTML(b)) : (b.floors ?? '—'), 'num')}${factHTML('HEIGHT', b.height != null ? `${esc(b.height)} blk` : null, 'num')}${factHTML('CLASS', b.bldgClass ? `${esc(b.bldgClass)} · ${esc(truncate(classDesc(b.bldgClass), 22))}` : null)}${factHTML('ASSESSED', num(b.assessTotal) != null ? fmtMoneyCompact(num(b.assessTotal)) : null, 'num money')}${factHTML('COORDINATES', b.x != null ? `X ${esc(b.x)} · Z ${esc(b.z)}` : null, 'num')}${factHTML('ROAD', road ? esc(roadLabel(road)) : sug ? `<span class="muted">suggested</span> ${esc(roadLabel(sug.road))}` : null)}${factHTML('OWNER', esc(b.owner))}</div>
      ${evs.length ? `<div class="pc-hist">${evs.sort((a, b) => a.i - b.i).map(e => `<span class="ev ${e.hist ? 'hist' : ''}" data-act="pc-hv" data-i="${e.i}">${esc(e.t)}</span>`).join('')}</div>` : ''}
      ${biz.length ? `<div class="pc-sect"><div class="h">BUSINESSES HERE</div><div class="pc-list">${biz.slice(0, 5).map(t => { const z = bizById(t.businessId); return z ? `<div class="r" data-open="business:${z.id}"><div><div class="t"><span class="nm">${esc(bizLabel(z))}</span></div><div class="s">${esc(ROLE_LABEL[t.role] || t.role)}${z.category ? ' · ' + esc(z.category) : ''}</div></div><div class="m">${esc(z.reg)}</div></div>` : ''; }).join('')}</div></div>` : ''}
      ${near.length ? `<div class="pc-sect"><div class="h">NEARBY TRANSIT</div><div class="pc-list">${near.map(({ s, d: dd }) => `<div class="r" data-act="pc-select" data-kind="station" data-id="${s.id}"><div><div class="t"><span class="stationdot" style="border-color:${esc(linesAtStation(s)[0]?.color || 'var(--transit)')}"></span><span class="nm">${esc(s.name || s.reg)}</span></div><div class="s">${linesAtStation(s).map(l => esc(l.shortName || l.name)).join(', ') || 'no line yet'}</div></div><div class="m">${Math.round(dd)} blk<small>${fmtMins(dd / WALK_BLOCKS_PER_SEC)} walk</small></div></div>`).join('')}</div></div>` : ''}
      ${b.notes ? `<div class="pc-sect"><div class="h">NOTES</div><div class="pc-note">${esc(truncate(b.notes, 240))}</div></div>` : ''}
    </div>`;
  }
  if (sel.kind === 'road') {
    const r = roadById(sel.id); if (!r) return ''; const bs = buildingsOnRoad(r); const js = roadConnections(r); const L = polyLength(r.geometry); const juris = roadJurisdictions(r);
    return `<div class="pc-photo" style="--c:var(--road);aspect-ratio:16/5"><span class="ph" style="font-size:22px">${esc(ROAD_TYPE_LABEL[r.type] || r.type).toUpperCase()}</span>${close}<span class="kind">${esc(GRADE_LABEL[r.grade] || r.grade).toUpperCase()} · ${esc(r.reg)}</span></div>
    <div class="pc-body" style="--c:var(--road)"><div class="reg"><i></i>${esc(r.reg)} · ${juris.map(d => esc(d.name)).join(' · ') || 'no jurisdiction drawn'}</div><h2>${esc(roadLabel(r))}</h2>${r.aliases?.length || r.formerNames?.length ? `<div class="sub">${r.aliases?.length ? 'also ' + esc(r.aliases.join(', ')) : ''}${r.aliases?.length && r.formerNames?.length ? ' · ' : ''}${r.formerNames?.length ? 'formerly ' + esc(r.formerNames.join(', ')) : ''}</div>` : ''}
      ${acts([{ act: 'pc-open', icon: 'expand', label: 'Record', primary: true }, { act: 'pc-fit', icon: 'fit', label: 'Frame' }, { act: 'pc-edit', icon: 'edit', label: 'Edit' }])}
      <div class="facts">${factHTML('LENGTH', `${fmtInt(L)} blk`, 'num')}${factHTML('WIDTH', r.width != null ? `${esc(r.width)} blk` : null, 'num')}${factHTML('OPENED', r.yearOpened != null ? esc(hyLabel(r.yearOpened, r.halfOpened, r.yearOpenedApprox)) : null)}${factHTML('ACCESS', esc((DIRECTIONS.find(x => x[0] === r.direction) || [])[1] || r.direction))}${factHTML('BUILDINGS', String(bs.length), 'num')}${factHTML('JUNCTIONS', String(js.length), 'num')}</div>
      ${bs.length ? `<div class="pc-sect"><div class="h">ALONG THIS ROAD</div><div class="pc-list">${bs.slice().sort((a, b) => (num(a.number) ?? 1e9) - (num(b.number) ?? 1e9)).slice(0, 8).map(b => `<div class="r" data-act="pc-select" data-kind="building" data-id="${b.id}"><div><div class="t"><span class="nm">${esc(titleOf(b))}</span></div><div class="s">${esc(b.reg)} · ${esc(physicalOf(b.physical).label)}</div></div><div class="m">${b.floors ? b.floors + ' fl' : ''}</div></div>`).join('')}${bs.length > 8 ? `<div class="pc-note" style="padding:6px 0">and ${bs.length - 8} more — open the record</div>` : ''}</div></div>` : ''}
    </div>`;
  }
  if (sel.kind === 'station') {
    const s = stationById(sel.id); if (!s) return ''; const lines = linesAtStation(s); const near = nearbyBuildingsOf(s.x != null ? [s.x, s.z] : null, 60, 6);
    return `<div class="pc-photo" style="--c:${esc(lines[0]?.color || 'var(--transit)')};aspect-ratio:16/5"><span class="ph" style="font-size:22px">${esc((STATION_KINDS.find(k => k[0] === s.kind)?.[1] || 'STATION').toUpperCase())}</span>${close}<span class="kind">${esc(LINE_STATUS[s.status]?.label || s.status).toUpperCase()} · ${esc(s.reg)}</span></div>
    <div class="pc-body" style="--c:${esc(lines[0]?.color || 'var(--transit)')}"><div class="reg"><i></i>${esc(s.reg)}${stationDistrict(s) ? ' · ' + esc(stationDistrict(s).name) : ''}</div><h2>${esc(s.name || 'Unnamed station')}</h2>
      <div class="badges">${lines.map(l => lineBadge(l, 'sm')).join('') || '<span class="mk warn">NO LINE</span>'}${lines.length > 1 ? '<span class="mk transit">TRANSFER</span>' : ''}</div>
      ${acts([{ act: 'gm-directions-to', icon: 'route', label: 'Directions', primary: true }, { act: 'pc-open', icon: 'expand', label: 'Record' }, { act: 'pc-edit', icon: 'edit', label: 'Edit' }])}
      <div class="facts">${factHTML('COORDINATES', s.x != null ? `X ${esc(s.x)} · Z ${esc(s.z)}` : null, 'num')}${factHTML('OPENED', s.yearOpened != null ? esc(hyLabel(s.yearOpened, s.halfOpened)) : null)}${factHTML('LINES', lines.map(l => esc(lineLabel(l))).join(', ') || null)}${factHTML('IN BUILDING', s.buildingId ? esc(titleOf(byId(s.buildingId) || {})) : null)}</div>
      ${near.length ? `<div class="pc-sect"><div class="h">AROUND THE STATION</div><div class="pc-list">${near.map(({ b, d: dd }) => `<div class="r" data-act="pc-select" data-kind="building" data-id="${b.id}"><div><div class="t"><span class="nm">${esc(titleOf(b))}</span></div><div class="s">${esc(b.reg)}</div></div><div class="m">${Math.round(dd)} blk</div></div>`).join('')}</div></div>` : ''}
    </div>`;
  }
  if (sel.kind === 'line') {
    const l = lineById(sel.id); if (!l) return ''; const stops = stationsOf(l); const st = LINE_STATUS[l.status] || LINE_STATUS.open;
    return `<div class="pc-photo" style="--c:${esc(l.color)};aspect-ratio:16/5;background:linear-gradient(135deg, ${hexA(l.color, .35)}, var(--bg-3))"><span class="ph" style="font-size:30px;opacity:.9;color:${esc(l.color)}">${esc(l.shortName || l.name || l.reg)}</span>${close}<span class="kind">${esc(MODE_LABEL[l.mode] || l.mode).toUpperCase()} · ${esc(l.reg)}</span></div>
    <div class="pc-body" style="--c:${esc(l.color)}"><div class="reg"><i></i>${esc(l.reg)}${l.operator ? ' · ' + esc(l.operator) : ''}</div><h2>${esc(lineLabel(l))}</h2>
      <div class="badges"><span class="status ${st.tone}"><i>●</i>${st.label}</span><span class="code">${stops.length} stops</span><span class="code">${fmtInt(lineLength(l))} blk</span></div>
      ${acts([{ act: 'pc-open', icon: 'expand', label: 'Record', primary: true }, { act: 'pc-fit', icon: 'fit', label: 'Frame' }, { act: 'pc-edit', icon: 'edit', label: 'Edit' }])}
      ${stops.length ? `<div class="pc-sect"><div class="h">STOPS</div><div class="pc-stops" style="--c:${esc(l.color)}">${stops.map(s => `<div class="sp ${linesAtStation(s).length > 1 ? 'x' : ''}" data-act="pc-select" data-kind="station" data-id="${s.id}"><span class="dot"></span><span class="t">${esc(s.name || s.reg)}</span><span class="m">${linesAtStation(s).length > 1 ? 'transfer' : ''}</span></div>`).join('')}</div></div>` : '<div class="pc-note" style="margin-top:10px">No stops yet.</div>'}
    </div>`;
  }
  if (sel.kind === 'business') {
    const z = bizById(sel.id); if (!z) return ''; const bs = bizBuildings(z); const url = imgUrl(z.id, 'full'); const st = BIZ_STATUS[z.status] || BIZ_STATUS.open;
    return `<div class="pc-photo" style="--c:var(--biz)">${url ? `<img src="${url}" alt="">` : `<span class="ph">${esc((z.name || '?').slice(0, 2).toUpperCase())}</span>`}${close}<span class="kind">${esc(z.category || 'BUSINESS').toUpperCase()} · ${esc(z.reg)}</span></div>
    <div class="pc-body" style="--c:var(--biz)"><div class="reg"><i></i>${esc(z.reg)}</div><h2>${esc(bizLabel(z))}</h2><div class="badges"><span class="status ${st.tone}"><i>●</i>${st.label}</span>${z.ticker ? `<span class="ticker">${esc(z.ticker)}</span>` : ''}</div>
      ${acts([{ act: 'pc-open', icon: 'expand', label: 'Record', primary: true }])}
      ${bs.length ? `<div class="pc-sect"><div class="h">LOCATIONS</div><div class="pc-list">${bs.map(b => `<div class="r" data-act="pc-select" data-kind="building" data-id="${b.id}"><div><div class="t"><span class="nm">${esc(titleOf(b))}</span></div><div class="s">${esc(b.reg)}</div></div><div class="m">${esc(districtById(b.districtId)?.code || '')}</div></div>`).join('')}</div></div>` : ''}</div>`;
  }
  if (sel.kind === 'junction') { const j = sel.j; if (!j) return ''; const A = roadById(j.a), B = roadById(j.b); return `<div class="pc-body" style="--c:var(--road);padding-top:14px"><div class="reg"><i></i>${j.kind === 'joins' ? 'JOIN' : 'JUNCTION'} · X ${Math.round(j.x)} · Z ${Math.round(j.z)}</div><h2>${esc(roadLabel(A || {}))} × ${esc(roadLabel(B || {}))}</h2>${acts([{ act: 'gm-close', icon: 'x', label: 'Close' }])}</div>`; }
  const node = nodeById(sel.id); if (!node) return ''; const kind = sel.kind; const color = kind === 'region' ? regionColor(node) : kind === 'district' ? distColor(node) : distColor(districtById(node.districtId));
  const rows = kind === 'region' ? scopeBuildings({ kind: 'region', id: node.id }) : kind === 'district' ? buildingsIn(node.id) : S.buildings.filter(b => b.neighborhoodId === node.id); const act = rows.filter(isActive); const tall = act.filter(heightOf).sort((a, b) => heightOf(b) - heightOf(a)).slice(0, 5);
  return `<div class="pc-photo" style="--c:${color};aspect-ratio:16/5;background:linear-gradient(135deg, ${hexA(color, .3)}, var(--bg-3))"><span class="ph" style="font-size:22px">${esc(node.code || node.name.slice(0, 3)).toUpperCase()}</span>${close}<span class="kind">${kind === 'region' ? esc(REGION_TYPE[node.type]?.label || 'REGION').toUpperCase() : kind === 'district' ? (node.type === 'borough' ? 'BOROUGH' : 'DISTRICT') : 'NEIGHBORHOOD'}</span></div>
    <div class="pc-body" style="--c:${color}"><div class="reg"><i></i>${esc(node.code || '')}${node.founded ? ' · founded ' + esc(node.founded) : ''}</div><h2>${esc(node.name)}</h2>${node.tagline ? `<div class="sub">${esc(node.tagline)}</div>` : ''}
      ${acts([{ act: 'pc-look', icon: 'globe', label: 'Look here', primary: true, title: 'Make this the scope everywhere' }, { act: 'pc-fit', icon: 'fit', label: 'Frame' }, { act: 'pc-edit', icon: 'poly', label: (node.polygons || []).length ? 'Border' : 'Draw' }])}
      <div class="facts">${factHTML('STANDING', String(act.length), 'num')}${factHTML('HISTORICAL', String(rows.filter(isHist).length), 'num')}${factHTML('AREA', (node.polygons || []).length ? fmtCompact(polysArea(node.polygons)) + ' blk²' : '<span class="notdrawn">NOT DRAWN YET</span>', 'num')}${factHTML('LANDMARKS', String(act.filter(b => b.landmark).length), 'num')}</div>
      ${tall.length ? `<div class="pc-sect"><div class="h">TALLEST HERE</div><div class="pc-list">${tall.map(b => `<div class="r" data-act="pc-select" data-kind="building" data-id="${b.id}"><div><div class="t"><span class="nm">${esc(b.name || titleOf(b))}</span></div><div class="s">${esc(b.reg)}</div></div><div class="m">${fmtInt(heightOf(b))} blk</div></div>`).join('')}</div></div>` : ''}
    </div>`;
}

/* ---- directions: a graph over the drawn roads (vertices + junctions), Dijkstra, turn-by-turn steps ---- */
let ROAD_GRAPH = { key: '', nodes: null, chains: null };
const nodeKey = p => `${Math.round(p[0])}:${Math.round(p[1])}`;
function roadGraph() {
  const key = S.roads.map(r => r.id + ':' + r.updated + ':' + r.geometry.length + ':' + (r.yearClosed ?? '')).join('|');
  if (ROAD_GRAPH.key === key && ROAD_GRAPH.nodes) return ROAD_GRAPH;
  const nodes = new Map(); const chains = new Map();
  const node = (p, k = nodeKey(p)) => { let n = nodes.get(k); if (!n) { n = { key: k, x: p[0], z: p[1], adj: [] }; nodes.set(k, n); } return n; };
  const link = (a, b, len, road) => { if (a === b) return; a.adj.push({ to: b.key, len, road }); b.adj.push({ to: a.key, len, road }); };
  const roads = S.roads.filter(r => r.geometry?.length >= 2 && r.yearClosed == null);
  const js = cachedJunctions().filter(j => j.kind !== 'separated');
  for (const r of roads) {
    const g = r.geometry; const cum = [0]; for (let i = 1; i < g.length; i++) cum[i] = cum[i - 1] + dist2(g[i - 1], g[i]);
    const marks = g.map((p, i) => ({ s: cum[i], key: nodeKey(p), p }));
    for (const j of js) { if (j.a !== r.id && j.b !== r.id) continue; const c = polylineClosest([j.x, j.z], g); if (!c || c.d > 2) continue; const s = cum[c.i] + c.t * dist2(g[c.i], g[c.i + 1]); const jp = [j.x, j.z]; marks.push({ s, key: nodeKey(jp), p: jp }); }
    marks.sort((a, b) => a.s - b.s);
    const chain = []; for (const m of marks) { if (chain.length && chain[chain.length - 1].key === m.key) continue; chain.push(m); }
    for (let i = 0; i < chain.length; i++) { const n = node(chain[i].p, chain[i].key); if (i) link(node(chain[i - 1].p, chain[i - 1].key), n, chain[i].s - chain[i - 1].s, r.id); }
    chains.set(r.id, { chain, cum, len: cum[cum.length - 1] });
  }
  for (const j of js) { if (j.kind !== 'joins') continue; const jn = nodes.get(nodeKey([j.x, j.z])); if (!jn) continue; for (const rid of [j.a, j.b]) { const r = roadById(rid); if (!r?.geometry?.length) continue; for (const e of [r.geometry[0], r.geometry[r.geometry.length - 1]]) { const d = dist2(e, [j.x, j.z]); if (d > 0 && d <= 2.5) { const en = nodes.get(nodeKey(e)); if (en && en !== jn && !en.adj.some(a => a.to === jn.key)) link(en, jn, d, rid); } } } }
  ROAD_GRAPH = { key, nodes, chains }; return ROAD_GRAPH;
}
function nearestRoadPoint(pt) { let best = null; for (const r of S.roads) { if (!r.geometry || r.geometry.length < 2 || r.yearClosed != null) continue; const c = polylineClosest(pt, r.geometry); if (c && (!best || c.d < best.d)) best = { road: r, q: c.q, i: c.i, t: c.t, d: c.d }; } return best; }
/* attach a free point to the graph: a temporary node joined to the chain nodes on either side of its projection */
function attachPoint(G, pt, tag) {
  const near = nearestRoadPoint(pt); const n = { key: 'tmp:' + tag, x: pt[0], z: pt[1], adj: [], tmp: true }; G.nodes.set(n.key, n);
  if (!near) return { n, near: null };
  const ch = G.chains.get(near.road.id); const g = near.road.geometry; const s = ch.cum[near.i] + near.t * dist2(g[near.i], g[near.i + 1]);
  let prev = null, next = null; for (const m of ch.chain) { if (m.s <= s) prev = m; if (m.s >= s && !next) next = m; }
  for (const m of [prev, next]) { if (!m) continue; const target = G.nodes.get(m.key); if (!target) continue; const len = near.d + Math.abs(m.s - s); n.adj.push({ to: target.key, len, road: near.road.id, off: near.d, q: near.q }); target.adj.push({ to: n.key, len, road: near.road.id, off: near.d, q: near.q }); }
  return { n, near };
}
function detachPoint(G, n) { for (const a of n.adj) { const t = G.nodes.get(a.to); if (t) t.adj = t.adj.filter(x => x.to !== n.key); } G.nodes.delete(n.key); }
function dijkstra(G, from, to) {
  const dist = new Map([[from, 0]]); const prev = new Map(); const done = new Set(); const pq = [[0, from]];
  while (pq.length) { pq.sort((a, b) => a[0] - b[0]); const [d, k] = pq.shift(); if (done.has(k)) continue; done.add(k); if (k === to) break; const n = G.nodes.get(k); if (!n) continue; for (const a of n.adj) { const nd = d + a.len; if (nd < (dist.get(a.to) ?? Infinity)) { dist.set(a.to, nd); prev.set(a.to, { k, a }); pq.push([nd, a.to]); } } }
  if (!dist.has(to)) return null; const path = []; let k = to; while (k !== from) { const p = prev.get(k); path.unshift({ key: k, via: p.a }); k = p.k; } return { dist: dist.get(to), path };
}
/* resolve an endpoint reference to a point and label */
function endpointOf(ref) {
  if (!ref) return null;
  if (ref.kind === 'point') return { pt: ref.pt, label: `X ${Math.round(ref.pt[0])} · Z ${Math.round(ref.pt[1])}`, kind: 'point' };
  if (ref.kind === 'building') { const b = byId(ref.id); return b && b.x != null ? { pt: b.entrance?.x != null ? [b.entrance.x, b.entrance.z] : [b.x, b.z], label: b.name || titleOf(b), kind: 'building', id: b.id } : null; }
  if (ref.kind === 'station') { const s = stationById(ref.id); return s && s.x != null ? { pt: [s.x, s.z], label: s.name || s.reg, kind: 'station', id: s.id } : null; }
  if (ref.kind === 'business') { const z = bizById(ref.id); const b = bizBuildings(z || { id: null }).find(x => x.x != null); return b ? { pt: [b.x, b.z], label: bizLabel(z), kind: 'business', id: z.id } : null; }
  if (['region', 'district', 'hood'].includes(ref.kind)) { const n = nodeById(ref.id); const c = n?.polygons?.length ? centroidOf(n.polygons[0]) : null; return c ? { pt: c, label: n.name, kind: ref.kind, id: n.id } : null; }
  return null;
}
function routeBetween(fromRef, toRef) {
  const A = endpointOf(fromRef), B = endpointOf(toRef); if (!A || !B) return null;
  const straight = dist2(A.pt, B.pt); const G = roadGraph();
  if (!G.nodes.size) return { from: A, to: B, pts: [A.pt, B.pt], dist: straight, straight, legs: [{ kind: 'line', len: straight }], steps: [{ i: 1, text: 'No roads are drawn yet — straight line as the crow flies', d: straight }], roads: [], note: 'No roads drawn: this is a straight line, not a walk.', noRoads: true };
  const a = attachPoint(G, A.pt, 'a'), b = attachPoint(G, B.pt, 'b');
  const MAX_OFFROAD = 200; const far = [a, b].filter(e => !e.near || e.near.d > MAX_OFFROAD);
  if (far.length) { detachPoint(G, b.n); detachPoint(G, a.n); return { from: A, to: B, pts: [A.pt, B.pt], dist: straight, straight, legs: [{ kind: 'line', len: straight }], steps: [{ i: 1, text: `${far.length === 2 ? 'Both ends are' : (far[0] === a ? A.label : B.label) + ' is'} more than ${MAX_OFFROAD} blocks from any drawn road — straight line shown`, d: straight }], roads: [], note: `No road within ${MAX_OFFROAD} blocks of ${far.length === 2 ? 'either end' : 'one end'}: this is a straight line, not a walk. Draw the roads there and the route follows them.`, noRoads: true }; }
  let res = null; try { res = dijkstra(G, a.n.key, b.n.key); } finally { detachPoint(G, b.n); detachPoint(G, a.n); }
  if (!res) return { from: A, to: B, pts: [A.pt, B.pt], dist: straight, straight, legs: [{ kind: 'line', len: straight }], steps: [{ i: 1, text: 'The drawn roads do not connect these two places — straight line shown', d: straight }], roads: [], note: 'No connected road path: the two ends are on separate road networks (or far from any road).', disconnected: true };
  // rebuild the polyline: off-road leg → road nodes → off-road leg
  const pts = [A.pt]; const legs = []; let cur = a.n; let prevRoad = null;
  for (const step of res.path) { const n = G.nodes.get(step.key) || (step.key === b.n.key ? b.n : null); const via = step.via; if (!n) continue;
    if (via.off != null && (cur.tmp || n.tmp)) { const q = via.q; if (cur.tmp) { pts.push(q); legs.push({ kind: 'off', len: via.off, road: via.road }); if (dist2(q, [n.x, n.z]) > 0.5) { pts.push([n.x, n.z]); legs.push({ kind: 'road', len: Math.max(0, via.len - via.off), road: via.road }); } } else { if (dist2([cur.x, cur.z], q) > 0.5) { pts.push(q); legs.push({ kind: 'road', len: Math.max(0, via.len - via.off), road: via.road }); } pts.push([n.x, n.z]); legs.push({ kind: 'off', len: via.off, road: via.road }); } }
    else { pts.push([n.x, n.z]); legs.push({ kind: 'road', len: via.len, road: via.road }); }
    cur = n; prevRoad = via.road; }
  if (dist2(pts[pts.length - 1], B.pt) > 0.5) pts.push(B.pt);
  // steps: merge consecutive legs on the same road
  const steps = []; let i = 0;
  for (const leg of legs) { const r = roadById(leg.road); const name = r ? roadLabel(r) : 'road'; const last = steps[steps.length - 1];
    if (leg.kind === 'off') { if (last && last.kind === 'off' && last.road === leg.road) { last.d += leg.len; continue; } steps.push({ i: ++i, kind: 'off', road: leg.road, text: steps.length ? `Leave ${name} and walk to ${B.label}` : `Walk to ${name}`, d: leg.len }); continue; }
    if (last && last.kind === 'road' && last.road === leg.road) { last.d += leg.len; continue; }
    steps.push({ i: ++i, kind: 'road', road: leg.road, text: `${steps.some(s => s.kind === 'road') ? 'Turn onto' : 'Head along'} ${name}`, d: leg.len }); }
  const dist = legs.reduce((s, l) => s + l.len, 0);
  return { from: A, to: B, pts, legs, steps, dist, straight, roads: [...new Set(legs.filter(l => l.kind === 'road').map(l => l.road))], note: null };
}
function drawRoute(ctx, P, route, k) {
  if (!route?.pts?.length) return; ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const trace = () => { ctx.beginPath(); route.pts.forEach((p, i) => { const [x, y] = P.s(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  trace(); ctx.lineWidth = Math.max(6, 3 * k) + 4; ctx.strokeStyle = 'rgba(5,9,13,.75)'; ctx.setLineDash([]); ctx.stroke();
  trace(); ctx.lineWidth = Math.max(4, 3 * k); ctx.strokeStyle = route.noRoads || route.disconnected ? '#FFB454' : '#4FE3FF'; ctx.setLineDash(route.noRoads || route.disconnected ? [10, 8] : []); ctx.stroke(); ctx.setLineDash([]);
  if (motionOn() && !route.noRoads && !route.disconnected) { trace(); ctx.lineWidth = Math.max(2, 1.2 * k); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([2 * k + 4, 16 * k + 20]); ctx.lineDashOffset = -((Date.now() / 18) % (18 * k + 24)); ctx.stroke(); ctx.setLineDash([]); }
  for (const [p, isEnd] of [[route.pts[0], false], [route.pts[route.pts.length - 1], true]]) { const [x, y] = P.s(p[0], p[1]); ctx.beginPath(); if (isEnd) ctx.rect(x - 6, y - 6, 12, 12); else ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#05090D'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#4FE3FF'; ctx.stroke(); }
  ctx.restore();
}
function routePanelHTML() {
  const A = endpointOf(EXPLORE.from), B = endpointOf(EXPLORE.to); const r = MAPW.route;
  const end = (which, e) => `<button class="end ${EXPLORE.picking === which ? 'picking' : ''}" data-end="${which}" title="Pick on the map or search">${icon(which === 'from' ? 'pin' : 'flag')}<span class="t ${e ? '' : 'empty'}">${e ? esc(e.label) : (which === 'from' ? 'Choose a starting point' : 'Choose a destination')}</span></button>`;
  const time = r ? (EXPLORE.mode === 'sprint' ? r.dist / 5.6 : r.dist / WALK_BLOCKS_PER_SEC) : null;
  return `<div class="rt-head"><span class="k">DIRECTIONS</span><span class="s" style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-3)">along the drawn roads</span><button class="close" data-act="gm-dir-close" title="Close directions">${icon('x')}</button></div>
  <div class="rt-ends"><span class="dot"></span>${end('from', A)}<button class="swap" data-act="rt-swap" title="Swap">${icon('swap')}</button><span class="rail"></span><span></span><span class="dot b"></span>${end('to', B)}</div>
  <div class="rt-modes"><button data-act="rt-mode" data-mode="walk" aria-pressed="${EXPLORE.mode === 'walk'}">${icon('walk')} Walk</button><button data-act="rt-mode" data-mode="sprint" aria-pressed="${EXPLORE.mode === 'sprint'}">${icon('walk')} Sprint</button><button data-act="rt-mode" data-mode="transit" aria-pressed="${EXPLORE.mode === 'transit'}" title="Ride the lines where a journey exists (needs stations and travel times on the transit side)">${icon('transit')} Transit</button></div>
  ${EXPLORE.picking ? `<div class="rt-note" style="color:var(--cyan)">Click a building, station or any point on the map for the ${EXPLORE.picking === 'from' ? 'start' : 'destination'} — or search above.</div>` : ''}
  ${r ? `<div class="rt-sum"><span class="big">${fmtInt(r.dist)}<small>blocks</small></span><span class="big" style="color:var(--ink)">${fmtMins(time)}<small>${EXPLORE.mode}</small></span><span class="mode">${r.noRoads || r.disconnected ? 'straight line' : `${r.roads.length} road${r.roads.length === 1 ? '' : 's'} · ${fmtInt(r.straight)} blk direct`}</span></div>
    ${EXPLORE.mode === 'transit' ? `<div class="rt-note">${transitRouteNote(r)}</div>` : ''}
    <div class="rt-steps">${r.steps.map(s => `<div class="st"><i>${s.i}</i><div><div class="nm">${esc(s.text)}</div></div><span class="d">${fmtInt(s.d)} blk</span></div>`).join('')}<div class="st"><i>●</i><div><div class="nm">Arrive at ${esc(r.to.label)}</div></div><span class="d"></span></div></div>
    ${r.note ? `<div class="rt-note">${esc(r.note)}</div>` : '<div class="rt-note">Distances follow the road centrelines you drew; the first and last legs are straight walks to the nearest road. Walking at 4.3 blocks per second.</div>'}` : (A && B ? '' : '<div class="rt-note">Pick both ends to see the way.</div>')}`;
}
function transitRouteNote(r) { const near = [nearbyStationsOf(r.from.pt, 120, 1)[0], nearbyStationsOf(r.to.pt, 120, 1)[0]]; if (!near[0] || !near[1]) return 'No station within 120 blocks of both ends — walking is the only option on file.'; if (near[0].s.id === near[1].s.id) return `Both ends are closest to ${near[0].s.name || near[0].s.reg} — walking is shorter than riding.`; const shared = linesAtStation(near[0].s).filter(l => linesAtStation(near[1].s).some(x => x.id === l.id)); if (!shared.length) return `Nearest stations ${near[0].s.name} and ${near[1].s.name} share no line; a transfer plan needs the Transit page's service times.`; const jt = typeof lineJourneyTime === 'function' ? lineJourneyTime(shared[0], near[0].s, near[1].s) : null; return `Walk to ${near[0].s.name} (${Math.round(near[0].d)} blk), ride ${lineLabel(shared[0])} to ${near[1].s.name}${jt ? ` (~${fmtMins(jt.sec)} · ${jt.basis})` : ''}, walk ${Math.round(near[1].d)} blk. Times come from the Transit page's service settings.`; }
function startPick(which) { EXPLORE.picking = which; EXPLORE.dir = true; renderPlaceCard(); $('#mapstage')?.classList.add('picking'); setTimeout(() => $('#map-q')?.focus(), 30); toast(`Click the map or search for the ${which === 'from' ? 'start' : 'destination'}`, ''); }
function explorePickAt(hit) {
  if (!EXPLORE.picking) return false; const which = EXPLORE.picking; let ref = null;
  if (hit?.kind === 'point') ref = { kind: 'point', pt: hit.pt }; else if (hit && ['building', 'station', 'business', 'region', 'district', 'hood'].includes(hit.kind)) ref = { kind: hit.kind, id: hit.id }; else if (hit?.kind === 'road' && hit.pt) ref = { kind: 'point', pt: hit.pt };
  if (!ref) return false; EXPLORE[which] = ref; EXPLORE.picking = null; $('#mapstage')?.classList.remove('picking'); computeRoute(); return true;
}
function computeRoute() {
  MAPW.route = EXPLORE.from && EXPLORE.to ? routeBetween(EXPLORE.from, EXPLORE.to) : null; renderPlaceCard();
  if (MAPW.route) { mapFlyTo(bboxOf(MAPW.route.pts), { pad: 90, maxK: 4 }); const tick = () => { if (MAPW.route && UI.nav === 'map' && !MAPW.edit && motionOn()) { mapDraw(); MAPW.routeRaf = requestAnimationFrame(tick); } }; cancelAnimationFrame(MAPW.routeRaf); if (motionOn()) MAPW.routeRaf = requestAnimationFrame(tick); } else mapDraw();
}
function openDirections(toRef = null) { EXPLORE.dir = true; if (toRef) { EXPLORE.to = toRef; if (!EXPLORE.from) EXPLORE.picking = 'from'; } else if (!EXPLORE.from && !EXPLORE.to) EXPLORE.picking = 'from'; if (EXPLORE.picking) $('#mapstage')?.classList.add('picking'); computeRoute(); }
function closeDirections() { EXPLORE.dir = false; EXPLORE.picking = null; MAPW.route = null; cancelAnimationFrame(MAPW.routeRaf); $('#mapstage')?.classList.remove('picking'); renderPlaceCard(); mapDraw(); }

/* ---- basemap: a rendered image of the city under the registry (JourneyMap export, Chronicle render, screenshot) ----
   settings.basemaps[] = { id, name, x, z (world coords of the image's top-left pixel), scale (blocks per pixel), opacity, w, h }
   The image itself lives in the images store under 'basemap:<id>' and in the vault as images/basemap-<id>.<ext>. */
const BASEMAP_IMG = new Map();
async function loadBasemaps() { for (const bm of S.settings.basemaps || []) { if (BASEMAP_IMG.has(bm.id)) continue; try { const rec = await idbGet('images', 'basemap:' + bm.id); if (!rec?.full) continue; const img = new Image(); img.onload = () => { BASEMAP_IMG.set(bm.id, img); if (!bm.w) { bm.w = img.naturalWidth; bm.h = img.naturalHeight; } mapDraw(); }; img.src = URL.createObjectURL(rec.full); BASEMAP_IMG.set(bm.id, img); } catch { } } }
/* which basemaps belong at a moment: in playback only the latest dated render at or before the date (never a newer one
   behind an older one); in the present every undated render plus the latest dated one */
function basemapsAt(hy) {
  const all = (S.settings.basemaps || []).filter(bm => !bm.hidden); const dated = all.filter(bm => bm.year != null).sort((a, b) => hyIndex(b.year, b.half || '') - hyIndex(a.year, a.half || ''));
  if (hy == null) return [...dated.slice(0, 1), ...all.filter(bm => bm.year == null)];
  const pick = dated.find(bm => hyIndex(bm.year, bm.half || '') <= hy); return pick ? [pick] : all.filter(bm => bm.year == null && bm.inPlayback);
}
function drawBasemap(ctx, P, W, H, R) {
  for (const bm of basemapsAt(R.hy ?? null)) { const img = BASEMAP_IMG.get(bm.id); if (!img || !img.complete || !img.naturalWidth) continue; const [sx, sy] = P.s(bm.x, bm.z); const k = R.cam.k * (bm.scale || 1); const w = img.naturalWidth * k, h = img.naturalHeight * k; if (sx > W || sy > H || sx + w < 0 || sy + h < 0) continue; ctx.save(); ctx.globalAlpha = bm.opacity ?? 0.75; ctx.imageSmoothingEnabled = k < 1; ctx.drawImage(img, sx, sy, w, h); ctx.restore(); }
}
async function basemapAdd(file) {
  if (!file || !file.type.startsWith('image/')) { toast('That file is not an image', 'warn'); return null; }
  const id = uid('bm'); const bmp = await createImageBitmap(file); const ext = scopeExtent();
  const bm = { id, name: file.name.replace(/\.[a-z0-9]+$/i, ''), x: ext ? ext.x1 : 0, z: ext ? ext.z1 : 0, scale: ext ? Math.max(0.01, (ext.x2 - ext.x1) / bmp.width) : 1, opacity: 0.75, w: bmp.width, h: bmp.height, hidden: false, added: now() }; bmp.close?.();
  await idbPut('images', 'basemap:' + id, { full: file, thumb: null, updated: now(), basemap: true });
  S.settings.basemaps = [...(S.settings.basemaps || []), bm]; SAVE.dirtyImages.add('basemap:' + id); commit(); BASEMAP_IMG.delete(id); await loadBasemaps(); UI.layers.basemap = true; refreshChips(); mapDraw();
  return bm;
}
async function basemapRemove(id) { S.settings.basemaps = (S.settings.basemaps || []).filter(b => b.id !== id); BASEMAP_IMG.delete(id); await idbDel('images', 'basemap:' + id).catch(() => {}); SAVE.deletedImages.add('basemap:' + id); commit(); refreshChips(); mapDraw(); }
/* the layer chips mirror UI.layers without a full re-render */
function refreshChips() { const row = $('#gm-chips'); if (!row) return; const hasBase = (S.settings.basemaps || []).length; row.querySelectorAll('[data-gmlayer]').forEach(b => { const k = b.dataset.gmlayer; if (k === 'basemap') { b.setAttribute('aria-pressed', UI.layers.basemap !== false && hasBase); b.innerHTML = `${icon('sat')} ${hasBase ? 'Satellite' : 'Add basemap'}`; if (hasBase) delete b.dataset.act; else b.dataset.act = 'basemap-open'; } else b.setAttribute('aria-pressed', !!UI.layers[k]); }); }
function openBasemapModal() {
  const list = S.settings.basemaps || [];
  openModal({ title: 'Basemap — the rendered city under the data', kicker: 'MAP', cls: 'wide',
    body: `<p class="muted" style="font-size:12.5px;margin:12px 0 0">Give a render a year (and half) and playback shows it at that date — only the latest render at or before the date, so a newer map can never sit behind an older one. Drop a north-up image of the world — a JourneyMap export, the Chronicle's block-by-block render, or a screenshot of the in-game map — and tell New A OS where its top-left pixel sits (X, Z) and how many blocks one pixel covers. JourneyMap tiles are 1 block per pixel at zoom 0. The image is kept in this browser and written to the vault's images folder; nothing is traced from it automatically.</p>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="bm-add">${icon('img')} Add image…</button><input type="file" id="bm-file" accept="image/*" hidden></div>
      <div class="list" id="bm-list" style="margin-top:12px">${list.length ? list.map(bm => `<div class="li" style="grid-template-columns:1fr;gap:8px;--c:var(--amber)"><div class="t">${esc(bm.name)} <span class="muted" style="font-family:var(--font-mono);font-size:11px">· ${bm.w || '?'}×${bm.h || '?'} px</span></div>
        <div class="frow c3"><div class="f"><label>Dated render <span class="hint">year · half (for playback)</span></label><div class="hy dock-hy"><select data-bm="${bm.id}" data-k="half">${HALVES.map(h => `<option value="${h.id}" ${(bm.half || '') === h.id ? 'selected' : ''}>${h.short || 'Any half'}</option>`).join('')}</select><input type="number" data-bm="${bm.id}" data-k="year" value="${esc(bm.year ?? '')}" placeholder="present" min="1990" max="2200"></div></div><div class="f"><label>Top-left X</label><input type="number" step="1" data-bm="${bm.id}" data-k="x" value="${esc(bm.x)}"></div><div class="f"><label>Top-left Z</label><input type="number" step="1" data-bm="${bm.id}" data-k="z" value="${esc(bm.z)}"></div><div class="f"><label>Blocks per pixel</label><input type="number" step="0.01" min="0.01" data-bm="${bm.id}" data-k="scale" value="${esc(bm.scale)}"></div><div class="f"><label>Opacity</label><input type="number" step="0.05" min="0.05" max="1" data-bm="${bm.id}" data-k="opacity" value="${esc(bm.opacity ?? 0.75)}"></div><div class="f"><label>Shown</label><label class="switch"><input type="checkbox" data-bm="${bm.id}" data-k="hidden" ${bm.hidden ? '' : 'checked'}></label></div><div class="f" style="align-self:end"><button class="btn sm danger" data-bm-del="${bm.id}">${icon('trash')} Remove</button></div></div>
        <div class="desc-line">Covers X ${esc(bm.x)} → ${esc(Math.round(bm.x + (bm.w || 0) * bm.scale))} · Z ${esc(bm.z)} → ${esc(Math.round(bm.z + (bm.h || 0) * bm.scale))}. Edits apply live on the map behind this dialog.</div></div>`).join('') : `<div class="li empty">No basemap yet.</div>`}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>`,
    onOpen: m => {
      m.querySelector('#bm-add').onclick = () => m.querySelector('#bm-file').click();
      m.querySelector('#bm-file').addEventListener('change', async e => { const f = e.target.files?.[0]; if (!f) return; const bm = await basemapAdd(f); if (bm) { toast(`${bm.name} added — set its X, Z and scale`, 'good'); openBasemapModal(); } });
      m.querySelectorAll('[data-bm]').forEach(inp => inp.addEventListener('input', () => { const bm = (S.settings.basemaps || []).find(b => b.id === inp.dataset.bm); if (!bm) return; const k = inp.dataset.k; if (k === 'hidden') bm.hidden = !inp.checked; else if (k === 'half') bm.half = ['E', 'L'].includes(inp.value) ? inp.value : ''; else if (k === 'year') bm.year = num(inp.value); else { const v = num(inp.value); if (v == null) return; bm[k] = k === 'scale' ? Math.max(0.01, v) : k === 'opacity' ? clamp(v, 0.05, 1) : v; } commit({ silentRender: true }); mapDraw(); if (HV.open) hvDraw(); }));
      m.querySelectorAll('[data-bm-del]').forEach(b => b.onclick = async () => { const r = await confirmDialog({ title: 'Remove this basemap?', body: '<p>The image is removed from the browser store and the vault.</p>', ok: 'Remove', danger: true }); if (r === 'ok') { await basemapRemove(b.dataset.bmDel); openBasemapModal(); } else openBasemapModal(); });
    } });
}
