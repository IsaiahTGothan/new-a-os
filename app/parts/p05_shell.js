/* =====================================================================
   §5  SHELL — navigation · scope selector · global search · status ·
       toasts · modals · hovercards · chart tips
   ===================================================================== */
function renderAll() { renderChrome(); renderView(true); renderStatus(); }

function setNav(id) {
  if (!NAV.some(n => n.id === id)) return;
  if (UI.nav === 'map' && id !== 'map') mapLeave();
  const same = UI.nav === id;
  UI.nav = id; UI.selected = null; UI.animateRows = true;
  S.settings.lastNav = id; commit({ silentRender: true });
  renderChrome(); renderView(!same); if (!same) $('#main').scrollTop = 0;
}
/* the one geography selector: everything scoped follows it */
function setScope(sc) {
  if (!sc) return;
  UI.scope = sc; UI.filters.hood = ''; UI.filters.district = ''; UI.hf.district = ''; UI.hf.hood = ''; UI.bf.district = '';
  S.settings.lastScope = sc; commit({ silentRender: true }); closeScopePop(); MAPW.fitPending = true;
  renderChrome(); renderView(false);
}

function renderChrome() {
  const sc = UI.scope; const node = scopeNode(sc); const color = scopeColor(sc);
  // nav rail
  const counts = { registry: scopeActive().length, transit: S.lines.length, civic: civicRows().length, businesses: S.businesses.length, history: scopeBuildings().filter(isHist).length };
  $('#tabs').innerHTML = NAV.map(n => `<button class="tab nav ${n.id}" role="tab" data-nav="${n.id}" aria-selected="${UI.nav === n.id}" title="${esc(n.title)}">${icon(n.icon)}<span class="lbl">${esc(n.label)}</span>${counts[n.id] != null && counts[n.id] ? `<span class="cnt">${counts[n.id]}</span>` : ''}<kbd>${n.key}</kbd></button>`).join('');
  const hist = scopeBuildings().filter(isHist).length;
  $('#rail-end').innerHTML = `<div class="rinfo" style="--c:${color}"><i class="sw"></i><span><b>${esc(scopeName(sc))}</b></span><span title="Active records: standing, under construction, planned and vacant lots">${scopeActive().length} on file</span><span>·</span><span style="color:var(--hist)">${hist} historical</span>${node && (node.polygons || []).length === 0 && sc.kind !== 'all' ? `<span class="notdrawn" title="This place has no border drawn yet — draw one on the map (Edit)">NOT DRAWN YET</span>` : ''}</div>`;
  const se = $('#side-end'); if (se) se.innerHTML = `<button class="clawson" data-act="clawson-toggle" aria-pressed="${typeof CLAW !== 'undefined' && CLAW.open}" title="Clawson — ask about the city, get proposals, draft a newsletter (K)">${icon('chat')}<span>Clawson</span></button>${typeof OS !== 'undefined' ? OS.tileHTML() : ''}`;
  // scope button
  const btn = $('#scope-btn'); btn.style.setProperty('--c', color);
  const crumbs = sc.kind === 'all' ? [] : sc.kind === 'region' ? ancestorsOf(node) : sc.kind === 'district' ? [...ancestorsOf(node)] : [...ancestorsOf(districtById(node?.districtId)), districtById(node?.districtId)].filter(Boolean);
  const parentOfDistrict = sc.kind === 'district' && node?.parentId ? regionById(node.parentId) : null;
  const crumbList = sc.kind === 'district' ? [...crumbs, parentOfDistrict].filter(Boolean) : crumbs;
  $('#scope-crumbs').textContent = crumbList.map(r => r.code || r.name).join(' › ');
  $('#scope-name').textContent = scopeName(sc);
  btn.title = `Looking at ${scopeName(sc)} — choose another place (G)`;
  // add button
  const nb = $('#btn-new'); if (nb) nb.title = UI.nav === 'history' ? 'Add a demolished (historical) building (N)' : UI.nav === 'businesses' ? 'Add a business' : 'Add a building (N) · Shift+N for a demolished one';
}

function renderView(enter = false) {
  hideHover(); closePalette(); const main = $('#main');
  const html = UI.nav === 'overview' ? renderOverview() : UI.nav === 'registry' ? renderRegistryTab() : UI.nav === 'map' ? renderMapWorkspace() : UI.nav === 'transit' ? renderTransit() : UI.nav === 'civic' ? renderCivic() : UI.nav === 'businesses' ? renderBusinesses() : renderHistory();
  main.innerHTML = `<div class="view ${enter && motionOn() && UI.nav !== 'map' ? 'enter' : ''}">${html}</div>`;
  afterRender();
}
function afterRender() {
  if (['overview', 'history', 'transit', 'businesses', 'civic'].includes(UI.nav)) runCountUps();
  if (UI.nav === 'map') mapMount();
  if (UI.nav === 'history') historyAfterRender();
  UI.animateRows = false;
}

function renderStatus() {
  const idb = $('#st-idb'); if (!idb) return;
  idb.className = SAVE.lastError ? 'warn' : SAVE.dirty ? 'warn' : ''; $('#st-idb-t').textContent = SAVE.lastError ? 'browser store · SAVE FAILED' : SAVE.dirty ? 'browser store · unsaved' : 'browser store · ok';
  const v = $('#st-vault'), vt = $('#st-vault-t');
  if (VAULT.status === 'granted') { v.className = ''; vt.textContent = `vault · ${VAULT.name}${VAULT.lastWrite ? ' · ' + fmtTime(VAULT.lastWrite) : ''}`; }
  else if (typeof OS !== 'undefined' && OS.online && OS.status?.vaultOk) { if (OS.vaultHold) { v.className = 'warn'; vt.innerHTML = `vault · <button data-act="os-open" style="color:var(--warn)">newer copy in the folder (${OS.vaultHold.buildings} buildings) — load or overwrite</button>`; } else if (OS.vaultError) { v.className = 'warn'; vt.innerHTML = `vault · <button data-act="os-open" style="color:var(--warn)">bridge write failed — ${esc(truncate(OS.vaultError, 40))}</button>`; } else { v.className = ''; vt.textContent = `vault · via OS bridge${OS.lastVaultWrite ? ' · ' + fmtTime(OS.lastVaultWrite) : ''}`; } }
  else if (VAULT.status === 'prompt') { v.className = 'warn'; vt.innerHTML = `vault · <button data-act="vault-reconnect" style="color:var(--warn)">reconnect ${esc(VAULT.name)}</button>`; }
  else if (VAULT.status === 'unsupported') { v.className = 'off'; vt.textContent = 'vault · unsupported browser (use backups)'; }
  else { v.className = 'off'; vt.innerHTML = `vault · <button data-act="vault-link">link a folder</button>`; }
  const photos = imageOwners().filter(b => b.image).length;
  $('#st-counts').textContent = `${activeBuildings().length} active · ${histBuildings().length} historical · ${S.regions.length} regions · ${S.districts.length} districts · ${S.roads.length} roads · ${S.lines.length} lines · ${S.businesses.length} businesses · ${S.archive.length} chronicle · ${photos} photos`;
  const iss = $('#st-issues'); if (iss) { const n = allIssues().length; iss.textContent = n ? `◆ ${n} issue${n === 1 ? '' : 's'}` : '◆ no issues'; iss.style.color = n ? 'var(--warn)' : ''; }
  const nb = $('#news-badge'); if (nb) { const n = newsPendingCount(); nb.hidden = !n; nb.textContent = n > 99 ? '99+' : n; }
}
setInterval(() => { const c = $('#clock'); if (c) c.textContent = fmtTime(new Date()); }, 1000);

/* ---- count-up numbers ---- */
function runCountUps() {
  $$('.count[data-to]').forEach(el => {
    const to = +el.dataset.to, fmt = el.dataset.fmt || 'int';
    const f = v => fmt === 'money' ? fmtMoneyCompact(v) : fmt === 'compact' ? fmtCompact(v) : fmtInt(v);
    if (!motionOn() || to === 0) { el.textContent = f(to); return; }
    const t0 = performance.now(), dur = 700;
    const step = t => { const p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3); el.textContent = f(to * e); if (p < 1) requestAnimationFrame(step); else el.textContent = f(to); };
    requestAnimationFrame(step);
  });
}

/* ---- toasts ---- */
function toast(msg, tone = '', action) {
  const root = $('#toasts'); if (!root) return; const el = document.createElement('div'); el.className = 'toast ' + tone;
  el.innerHTML = `<span class="ic"></span><span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); kill(); };
  root.appendChild(el);
  let t = setTimeout(kill, action ? 9000 : 3400);
  function kill() { clearTimeout(t); el.classList.add('out'); setTimeout(() => el.remove(), 260); }
}

/* ---- modal system ---- */
const MODAL = { ctx: null };
function openModal({ title, body, foot = '', cls = '', onOpen, kicker = '' }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="shade"></div><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mhd">${kicker ? `<span class="k">${esc(kicker)}</span>` : ''}<h3>${esc(title)}</h3><button class="btn ghost icon sm" data-act="modal-close" title="Close (Esc)">${icon('x')}</button></div>
    <div class="mbody">${body}</div>${foot ? `<div class="mfoot">${foot}</div>` : ''}</div>`;
  root.classList.add('on');
  root.querySelector('.shade').onclick = closeModal;
  onOpen?.(root.querySelector('.modal'));
  const first = root.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea,button:not([data-act=modal-close])'); first?.focus();
}
function closeModal() { const root = $('#modal-root'); root.classList.remove('on'); root.innerHTML = ''; MODAL.ctx = null; MODAL.onCancel = null; }
const modalOpen = () => $('#modal-root').classList.contains('on');
/* Promise-based confirm: resolves 'ok' | 'alt' | 'cancel' */
function confirmDialog({ title, body, ok = 'Confirm', alt, cancel = 'Cancel', danger = false, cls = 'narrow' }) {
  return new Promise(res => {
    openModal({ title, body, cls,
      foot: `<button class="btn ghost" data-r="cancel">${esc(cancel)}</button><span class="spacer"></span>${alt ? `<button class="btn" data-r="alt">${esc(alt)}</button>` : ''}<button class="btn ${danger ? 'danger' : 'primary'}" data-r="ok">${esc(ok)}</button>`,
      onOpen: m => { m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { closeModal(); res(b.dataset.r); }); m.querySelector('[data-act=modal-close]').onclick = () => { closeModal(); res('cancel'); }; m.parentElement.querySelector('.shade').onclick = () => { closeModal(); res('cancel'); }; MODAL.onCancel = () => { closeModal(); res('cancel'); }; },
    });
  });
}
function promptDialog({ title, label, placeholder = '', value = '', kicker = '' }) {
  return new Promise(res => {
    openModal({ title, kicker, cls: 'narrow', body: `<div class="f" style="margin-top:10px"><label>${esc(label)}</label><input id="prompt-input" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">OK</button>`,
      onOpen: m => {
        const done = r => { const v = m.querySelector('#prompt-input').value.trim(); closeModal(); res(r === 'ok' && v ? v : null); };
        m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r));
        m.querySelector('#prompt-input').addEventListener('keydown', e => { if (e.key === 'Enter') done('ok'); });
        m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel'); MODAL.onCancel = () => done('cancel');
      } });
  });
}

/* ---- scope popover: the world as a tree ---- */
const SCOPE_POP = { open: false, q: '' };
function nodeCounts(kind, id) { const rows = scopeBuildings({ kind, id }); return { active: rows.filter(isActive).length, hist: rows.filter(isHist).length }; }
function scopeRows(q) {
  const rows = []; const qn = norm(q);
  const push = (kind, node, depth, extra = {}) => {
    if (qn && fuzzyScore(qn, node.name) < 0.3 && !(node.code && norm(node.code) === qn)) return;
    rows.push({ kind, node, depth: qn ? 0 : depth, ...extra });
  };
  const walkRegion = (r, depth) => {
    push('region', r, depth, { type: REGION_TYPE[r.type]?.label || r.type });
    for (const c of childRegions(r.id)) walkRegion(c, depth + 1);
    for (const d of regionDistricts(r.id)) walkDistrict(d, depth + 1);
  };
  const inPath = did => UI.scope.kind === 'district' ? UI.scope.id === did : UI.scope.kind === 'hood' ? hoodById(UI.scope.id)?.districtId === did : false;
  const walkDistrict = (d, depth) => {
    push('district', d, depth, { type: d.type === 'borough' ? 'Borough' : 'District' });
    if (inPath(d.id) || qn) for (const h of hoodsIn(d.id)) push('hood', h, depth + 1, { type: 'Neighborhood' });
  };
  for (const r of childRegions(null)) walkRegion(r, 0);
  for (const d of S.districts.filter(d => !d.parentId)) walkDistrict(d, 0);
  return rows;
}
function openScopePop() {
  const pop = $('#scope-pop'); const btn = $('#scope-btn'); const r = btn.getBoundingClientRect();
  pop.hidden = false; pop.style.left = Math.max(12, Math.min(r.left, innerWidth - 580)) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
  SCOPE_POP.open = true; btn.setAttribute('aria-expanded', 'true'); renderScopePop(); setTimeout(() => $('#sp-q')?.focus(), 30);
}
function closeScopePop() { const pop = $('#scope-pop'); if (!pop) return; pop.hidden = true; SCOPE_POP.open = false; SCOPE_POP.q = ''; $('#scope-btn').setAttribute('aria-expanded', 'false'); }
function toggleScopePop() { SCOPE_POP.open ? closeScopePop() : openScopePop(); }
function renderScopePop() {
  const pop = $('#scope-pop'); const rows = scopeRows(SCOPE_POP.q); const cur = UI.scope;
  const isCur = (kind, id) => cur.kind === kind && cur.id === id;
  const row = (kind, node, depth, type, color, countsNode) => {
    const c = nodeCounts(kind, node.id); const pl = kind === 'region' || kind === 'district' ? node.placement : null;
    return `<button class="sp-row" data-scope-kind="${kind}" data-scope-id="${esc(node.id)}" data-depth="${depth}" aria-current="${isCur(kind, node.id)}" style="--c:${color}"><i class="sw ${kind === 'region' ? 'region' : ''}"></i><span class="nm"><b>${esc(node.name)}</b><small>${esc(type)}${node.code && kind !== 'hood' ? ' · ' + esc(node.code) : ''}</small>${pl && pl !== 'verified' ? `<span class="placement ${PLACEMENTS[pl]?.[1] || ''}" title="${esc(node.typeNote || PLACEMENTS[pl]?.[0] || '')}">${esc(PLACEMENTS[pl]?.[0] || pl)}</span>` : ''}${(node.polygons || []).length ? '' : '<span class="notdrawn">NOT DRAWN YET</span>'}</span><span class="cnt">${c.active}${c.hist ? ` <span style="color:var(--hist)">+${c.hist}</span>` : ''}</span></button>`;
  };
  pop.innerHTML = `
    <div class="sp-head"><div class="search" style="flex:1">${icon('search')}<input id="sp-q" placeholder="Find a state, city, borough or neighborhood…" value="${esc(SCOPE_POP.q)}" autocomplete="off"></div><button class="btn ghost icon sm" data-act="scope-close" title="Close">${icon('x')}</button></div>
    <div class="sp-body">
      <button class="sp-row" data-scope-kind="all" data-scope-id="" data-depth="0" aria-current="${cur.kind === 'all'}" style="--c:${PALETTE.neutralBright}"><i class="sw region"></i><span class="nm"><b>Everything on file</b><small>World</small></span><span class="cnt">${activeBuildings().length}${histBuildings().length ? ` <span style="color:var(--hist)">+${histBuildings().length}</span>` : ''}</span></button>
      ${rows.map(x => row(x.kind, x.node, x.depth, x.type, x.kind === 'region' ? regionColor(x.node) : x.kind === 'district' ? distColor(x.node) : distColor(districtById(x.node.districtId)))).join('')}
      ${!rows.length ? `<div class="pempty" style="padding:18px;color:var(--ink-3);font-size:12.5px;text-align:center">Nothing matches “${esc(SCOPE_POP.q)}”.</div>` : ''}
    </div>
    <div class="sp-foot"><span>Counts: standing <span style="color:var(--hist)">+historical</span></span><span class="spacer"></span><button class="btn sm" data-act="add-region">${icon('globe')} State / region</button><button class="btn sm" data-act="add-district">${icon('pin')} Borough / district</button>${cur.kind === 'region' || cur.kind === 'district' ? `<button class="btn sm" data-act="edit-scope">${icon('edit')} Edit ${esc(truncate(scopeName(cur), 16))}</button>` : ''}</div>`;
  const q = $('#sp-q'); q.addEventListener('input', () => { SCOPE_POP.q = q.value; const sel = q.selectionStart; renderScopePop(); const nq = $('#sp-q'); nq.focus(); nq.setSelectionRange(sel, sel); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#scope-pop .sp-row[data-scope-kind]:not([data-scope-kind="all"])'); if (first) first.click(); } });
  requestAnimationFrame(() => $('#scope-pop .sp-row[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }));
}
document.addEventListener('pointerdown', e => {
  if (SCOPE_POP.open && !e.target.closest('#scope-pop, #scope-btn')) closeScopePop();
  if (!$('#addmenu').hidden && !e.target.closest('.addwrap')) $('#addmenu').hidden = true;
  if (UI.palette.open && !e.target.closest('.search')) closePalette();
});

/* ---- global search: one index across the world, grouped by type, typo tolerant ---- */
const SEARCH_GROUPS = [['building', 'Buildings'], ['historical', 'Historical buildings'], ['road', 'Streets & roads'], ['business', 'Businesses'], ['station', 'Stations'], ['line', 'Transit lines'], ['place', 'Places'], ['event', 'Chronicle & events']];
function searchAll(q, { limit = 7 } = {}) {
  const qn = norm(q); if (!qn) return [];
  const scopeIds = scopeDistrictIds(); const out = [];
  const add = (kind, id, title, sub, meta, fields, color, boost = 0) => {
    let s = 0; for (const [f, w] of fields) { if (f == null || f === '') continue; const sc = fuzzyScore(qn, String(f)) * w; if (sc > s) s = sc; }
    if (s < 0.3) return; out.push({ kind, id, title, sub, meta, score: s + boost, color });
  };
  for (const b of S.buildings) {
    const d = districtById(b.districtId); const regHit = norm(b.reg) === qn || (b.formerRegs || []).some(r => norm(r) === qn);
    add(isHist(b) ? 'historical' : 'building', b.id, titleOf(b) + (b.name && addressOf(b) ? ` · ${b.name}` : ''), `${d?.name || ''}${hoodById(b.neighborhoodId) ? ' · ' + hoodById(b.neighborhoodId).name : ''} · ${spanHTML(b)}`, b.reg,
      [[b.reg, 1], ...(b.formerRegs || []).map(r => [r, 1]), [b.name, 1], [addressOf(b), 1], [b.street, 0.8], [b.owner, 0.6], [(b.tags || []).join(' '), 0.6], [b.notes, 0.4], [b.significance, 0.5]], isHist(b) ? 'var(--hist)' : distColor(d), (regHit ? 0.5 : 0) + (scopeIds.has(b.districtId) ? 0.05 : 0));
  }
  for (const r of S.roads) add('road', r.id, r.name || r.reg, `${ROAD_TYPE_LABEL[r.type] || r.type} · ${Math.round(polyLength(r.geometry))} blocks · ${buildingsOnRoad(r).length} buildings${r.formerNames?.length ? ' · formerly ' + r.formerNames.join(', ') : ''}`, r.reg, [[r.reg, 1], [r.name, 1], ...(r.aliases || []).map(a => [a, 0.95]), ...(r.formerNames || []).map(a => [a, 0.9])], 'var(--road)');
  for (const z of S.businesses) add('business', z.id, z.name || z.reg, `${z.category || 'business'} · ${BIZ_STATUS[z.status]?.label || z.status} · ${tenanciesOf(z).length} location${tenanciesOf(z).length === 1 ? '' : 's'}`, z.reg, [[z.reg, 1], [z.name, 1], ...(z.aliases || []).map(a => [a, 0.95]), [z.ticker, 0.9], [z.category, 0.5]], 'var(--biz)');
  for (const s of S.stations) add('station', s.id, s.name || s.reg, `${STATION_KINDS.find(k => k[0] === s.kind)?.[1] || 'Station'} · ${linesAtStation(s).map(l => l.shortName || l.name).join(', ') || 'no lines'}`, s.reg, [[s.reg, 1], [s.name, 1], ...(s.aliases || []).map(a => [a, 0.95])], 'var(--transit)');
  for (const l of S.lines) add('line', l.id, l.name || l.reg, `${MODE_LABEL[l.mode] || l.mode} · ${LINE_STATUS[l.status]?.label || l.status} · ${l.stopIds.length} stops`, l.reg, [[l.reg, 1], [l.name, 1], [l.shortName, 1], [l.operator, 0.5]], l.color);
  for (const r of S.regions) add('place', 'region:' + r.id, r.name, `${REGION_TYPE[r.type]?.label || r.type}${r.parentId ? ' in ' + (regionById(r.parentId)?.name || '') : ''} · ${nodeCounts('region', r.id).active} buildings`, r.code, [[r.name, 1], [r.code, 0.9]], regionColor(r));
  for (const d of S.districts) add('place', 'district:' + d.id, d.name, `${d.type === 'borough' ? 'Borough' : 'District'}${d.parentId ? ' of ' + (regionById(d.parentId)?.name || '') : ''} · ${activeIn(d.id).length} buildings`, d.code, [[d.name, 1], [d.code, 0.9]], distColor(d));
  for (const h of S.neighborhoods) add('place', 'hood:' + h.id, h.name, `Neighborhood · ${districtById(h.districtId)?.name || ''}`, '', [[h.name, 1]], distColor(districtById(h.districtId)));
  for (const a of S.archive) add('event', a.id, a.title || `${a.year} image`, `${a.year}${a.month ? ' · ' + MONTHS[a.month - 1] : ''} · ${districtById(a.districtId)?.name || 'City-wide'}`, String(a.year), [[a.title, 1], [a.description, 0.5], [String(a.year), 0.7], [(a.tags || []).join(' '), 0.6]], 'var(--cyan)');
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const grouped = []; for (const [kind] of SEARCH_GROUPS) { const items = out.filter(x => x.kind === kind); if (items.length) grouped.push({ kind, items: items.slice(0, limit), total: items.length }); }
  return grouped;
}
const KIND_ICON = { building: 'bldg', historical: 'hist', road: 'road', business: 'biz', station: 'station', line: 'transit', place: 'globe', event: 'img' };
function paletteHTML(groups, active, q) {
  if (!groups.length) return `<div class="pempty"><b>Nothing matches “${esc(q)}”</b>Try a registration number (MA-0019, H-MA-0003, RD-0002), a street, a business or a place. Search tolerates typos.</div>`;
  let i = 0;
  const hi = s => { const t = esc(s); const n = norm(q); if (!n) return t; const re = new RegExp('(' + n.split(' ').filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig'); return t.replace(re, '<mark>$1</mark>'); };
  return groups.map(g => `<div class="pg">${SEARCH_GROUPS.find(x => x[0] === g.kind)[1]}<span class="cnt">${g.total > g.items.length ? `${g.items.length} of ${g.total}` : g.total}</span></div>${g.items.map(it => `<div class="pi ${i === active ? 'act' : ''}" data-pi="${i++}" style="--c:${it.color}">${it.kind === 'place' || it.kind === 'line' ? '<i class="sw"></i>' : icon(KIND_ICON[it.kind])}<span class="t"><b>${hi(it.title)}</b><small>${esc(it.sub)}</small></span><span class="m">${it.meta ? `<span class="reg ${it.kind === 'historical' ? 'h' : ''}">${esc(it.meta)}</span>` : ''}</span></div>`).join('')}`).join('') + `<div class="phint"><span><kbd>↑↓</kbd>move</span><span><kbd>↵</kbd>open${UI.nav === 'map' ? ' on the map' : ''}</span><span><kbd>esc</kbd>close</span></div>`;
}
function flatItems(groups) { return groups.flatMap(g => g.items); }
function openPalette() {
  const q = $('#q').value; UI.palette.q = q; const groups = searchAll(q); UI.palette.items = flatItems(groups); UI.palette.active = 0; UI.palette.open = true;
  const el = $('#palette'); el.hidden = false; el.innerHTML = paletteHTML(groups, 0, q);
}
function closePalette() { const el = $('#palette'); if (el) el.hidden = true; UI.palette.open = false; UI.palette.items = []; }
function paletteMove(d) { if (!UI.palette.open || !UI.palette.items.length) return; UI.palette.active = (UI.palette.active + d + UI.palette.items.length) % UI.palette.items.length; $$('#palette .pi').forEach(p => p.classList.toggle('act', +p.dataset.pi === UI.palette.active)); $(`#palette .pi.act`)?.scrollIntoView({ block: 'nearest' }); }
/* open whatever a search hit points at — on the Map page the hit is located on the map instead of opened in the drawer */
function openSearchHit(hit, { map = UI.nav === 'map' } = {}) {
  closePalette(); if (!hit) return;
  if (hit.kind === 'place') { const [kind, id] = hit.id.split(':'); if (map) { mapLocate({ kind, id }); return; } setScope({ kind, id }); return; }
  if (hit.kind === 'event') { openArchiveViewer(hit.id); return; }
  const kind = hit.kind === 'historical' ? 'building' : hit.kind;
  if (map) { mapLocate({ kind, id: hit.id }); return; }
  openRecord(kind, hit.id);
}

/* ---- hovercards for anything with data-hover="<buildingId>" or data-hover="kind:id" ---- */
const HOVER = { id: null, timer: null, hy: null };
function showHover(key, x, y, opts = {}) {
  const el = $('#hover'); let html = null; HOVER.hy = opts.hy ?? null;
  if (key.includes(':')) {
    const [kind, id] = key.split(':');
    if (kind === 'road') { const r = roadById(id); if (!r) return; html = `<div class="b"><div class="reg" style="color:var(--road)">${esc(r.reg)} · ${esc(ROAD_TYPE_LABEL[r.type] || r.type).toUpperCase()}</div><div class="addr">${esc(r.name || 'Unnamed road')}</div>${r.aliases?.length ? `<div class="nm">also ${esc(r.aliases.join(', '))}</div>` : ''}<div class="meta"><span>Length <b>${fmtInt(polyLength(r.geometry))} blk</b></span><span>Width <b>${esc(r.width ?? '—')}</b></span><span>Grade <b>${esc(GRADE_LABEL[r.grade] || r.grade)}</b></span><span>Buildings <b>${buildingsOnRoad(r).length}</b></span></div></div>`; }
    else if (kind === 'business') { const z = bizById(id); if (!z) return; const u = imgUrl(id, 'full'); html = `${u ? `<div class="img"><img src="${u}" alt=""></div>` : ''}<div class="b"><div class="reg" style="color:var(--biz)">${esc(z.reg)} · ${esc(z.category || 'BUSINESS').toUpperCase()}</div><div class="addr">${esc(z.name)}</div><div class="meta"><span>Status <b>${esc(BIZ_STATUS[z.status]?.label || z.status)}</b></span><span>Locations <b>${tenanciesOf(z).length}</b></span><span>Opened <b>${esc(hyLabel(z.yearOpened, z.halfOpened, z.yearOpenedApprox))}</b></span>${z.ticker ? `<span>Ticker <b>${esc(z.ticker)}</b></span>` : ''}</div></div>`; }
    else if (kind === 'station') { const s = stationById(id); if (!s) return; html = `<div class="b"><div class="reg" style="color:var(--transit)">${esc(s.reg)} · STATION</div><div class="addr">${esc(s.name || 'Unnamed station')}</div><div class="meta"><span>Lines <b>${linesAtStation(s).map(l => l.shortName || l.name).join(', ') || '—'}</b></span><span>Status <b>${esc(LINE_STATUS[s.status]?.label || s.status)}</b></span><span>At <b>${s.x != null ? `X ${s.x} · Z ${s.z}` : '—'}</b></span></div></div>`; }
    else if (kind === 'line') { const l = lineById(id); if (!l) return; html = `<div class="b"><div class="reg" style="color:${esc(l.color)}">${esc(l.reg)} · ${esc(MODE_LABEL[l.mode] || l.mode).toUpperCase()}</div><div class="addr">${esc(l.name)}</div><div class="meta"><span>Status <b>${esc(LINE_STATUS[l.status]?.label || l.status)}</b></span><span>Stops <b>${l.stopIds.length}</b></span><span>Length <b>${fmtInt(lineLength(l))} blk</b></span><span>Opened <b>${esc(hyLabel(l.yearOpened, l.halfOpened, l.yearOpenedApprox))}</b></span></div></div>`; }
    if (!html) return;
  } else {
    const b = byId(key); if (!b) return; const d = districtById(b.districtId); const url = imgUrl(key, 'full'); const h = isHist(b); const ph = physicalOf(b.physical);
    const at = opts.hy != null ? (() => { const st = stateAtHY(b, opts.hy, { projection: !!opts.projection }); const { year, half } = hyFromIndex(opts.hy); const lbl = { standing: b.physical === 'vacant-lot' && isActive(b) ? 'vacant lot' : 'standing', construction: b.physical === 'planned' && isActive(b) ? 'planned' : 'under construction', gone: 'demolished' + (b.yearDemolished != null ? ' ' + hyLabel(b.yearDemolished, b.halfDemolished) : ''), future: 'not yet built', undated: 'undated' }[st] || st; return `<div class="at ${st}">AT ${esc(hyLabel(year, half).toUpperCase())} · ${esc(lbl.toUpperCase())}</div>`; })() : '';
    html = `<div class="img">${url ? `<img src="${url}" alt="">` : icon(h ? 'hist' : 'img')}</div><div class="b">${at}
      <div class="reg ${h ? 'reg-h' : ''}">${esc(b.reg)} · <span style="color:${distColor(d)}">${esc(d?.name || '')}</span>${h ? ' · <span class="reg-h">DEMOLISHED</span>' : ''}</div>
      <div class="addr">${esc(titleOf(b))}</div>${b.name && addressOf(b) ? `<div class="nm">${esc(b.name)}</div>` : ''}
      <div class="meta">
        <span>Status <b>${esc(ph.label)}${b.landmark ? ' ✦' : ''}</b></span><span>Class <b>${esc(b.bldgClass || '—')}</b></span>
        <span>${isUnderWay(b) ? 'Started' : 'Built'} <b>${esc(isUnderWay(b) && b.yearBuilt == null ? startedHTML(b) : builtHTML(b))}</b></span>${h ? `<span>Demolished <b>${esc(demoHTML(b))}</b></span>` : isUnderWay(b) ? `<span>Expected <b>${esc(expectedHTML(b))}</b></span>` : `<span>Floors <b>${esc(b.floors ?? '—')}</b></span>`}
        ${h ? `<span>Lifespan <b>${esc(yearsLabel(lifespanOf(b)))}</b></span><span>Floors <b>${esc(b.floors ?? '—')}</b></span>` : `<span>Assessed <b>${fmtMoneyCompact(num(b.assessTotal))}</b></span><span>${b.market ? marketOf(b.market).label : 'Road'} <b>${b.market ? fmtMoneyCompact(num(b.listPrice)) : esc(roadById(b.roadId)?.name || '—')}</b></span>`}
      </div></div>`;
  }
  el.innerHTML = html; positionHover(x, y); el.classList.add('on'); HOVER.id = key;
}
function positionHover(x, y) {
  const el = $('#hover'); const w = 280, h = el.offsetHeight || 260;
  let left = x + 18, top = y + 14;
  if (left + w > innerWidth - 12) left = x - w - 18; if (top + h > innerHeight - 12) top = innerHeight - h - 12;
  el.style.left = left + 'px'; el.style.top = Math.max(8, top) + 'px';
}
function hideHover() { clearTimeout(HOVER.timer); HOVER.id = null; HOVER.hy = null; $('#hover')?.classList.remove('on'); }
document.addEventListener('pointerover', e => {
  const t = e.target.closest?.('[data-hover]'); if (!t) return;
  const id = t.dataset.hover; if (HOVER.id === id) return;
  clearTimeout(HOVER.timer); HOVER.timer = setTimeout(() => showHover(id, e.clientX, e.clientY), 160);
});
document.addEventListener('pointermove', e => { if (HOVER.id && e.target.closest?.('[data-hover]')) positionHover(e.clientX, e.clientY); });
document.addEventListener('pointerout', e => { const t = e.target.closest?.('[data-hover]'); if (t && !t.contains(e.relatedTarget)) hideHover(); });
document.addEventListener('scroll', hideHover, true);

/* horizontal strips scroll sideways with a plain mouse wheel */
document.addEventListener('wheel', e => {
  const strip = e.target.closest?.('#tabs, .chron-strip'); if (!strip || !e.deltaY || e.deltaX || strip.scrollWidth <= strip.clientWidth) return;
  e.preventDefault(); strip.scrollLeft += e.deltaY;
}, { passive: false });

/* chart tooltips — one floating tip for any [data-tip] mark */
const TIP = document.createElement('div');
TIP.style.cssText = 'position:fixed;z-index:115;pointer-events:none;background:var(--bg-2);border:1px solid var(--line-3);color:var(--ink);font:11.5px var(--font-mono);padding:6px 9px;border-radius:5px;box-shadow:var(--shadow-1);opacity:0;transition:opacity .12s;white-space:nowrap';
document.body.appendChild(TIP);
document.addEventListener('pointermove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { TIP.style.opacity = 0; $$('.chart .cross').forEach(c => c.style.display = 'none'); return; }
  TIP.textContent = t.dataset.tip; TIP.style.opacity = 1;
  let x = e.clientX + 14, y = e.clientY + 14; if (x + TIP.offsetWidth > innerWidth - 10) x = e.clientX - TIP.offsetWidth - 14; TIP.style.left = x + 'px'; TIP.style.top = y + 'px';
  if (t.classList.contains('hit')) { const svg = t.closest('svg'); const cr = svg.querySelector('.cross'); if (cr) { cr.style.display = ''; cr.querySelector('line').setAttribute('x1', t.dataset.cx); cr.querySelector('line').setAttribute('x2', t.dataset.cx); cr.querySelector('circle').setAttribute('cx', t.dataset.cx); cr.querySelector('circle').setAttribute('cy', t.dataset.cy); } }
});
