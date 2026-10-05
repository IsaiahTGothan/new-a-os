/* =====================================================================
   §4  PERSISTENCE — IndexedDB autosave · vault folder (one master file) ·
       images · snapshots · export / import
   ===================================================================== */
const DB_NAME = 'newa-registry', DB_VER = 1;
let _db = null;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['state', 'images', 'handles']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { autoIncrement: true }); };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction(store, mode); const st = t.objectStore(store); const out = fn(st);
  t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
}));
const idbGet  = (store, key) => tx(store, 'readonly', st => st.get(key));
const idbPut  = (store, key, val) => tx(store, 'readwrite', st => st.put(val, key));
const idbDel  = (store, key) => tx(store, 'readwrite', st => st.delete(key));
const idbKeys = store => tx(store, 'readonly', st => st.getAllKeys());
const idbAllWithKeys = store => db().then(d => new Promise((res, rej) => {
  const out = []; const req = d.transaction(store, 'readonly').objectStore(store).openCursor();
  req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); }; req.onerror = () => rej(req.error);
}));

/* ---- autosave pipeline: the browser store is written atomically; a failed write is shown, never hidden ---- */
const SAVE = { dirty: false, timer: null, dirtyImages: new Set(), deletedImages: new Set(), lastSaved: null, busy: false, lastError: null, write: state => idbPut('state', 'main', state) };
function setSaveState(state, text) {
  const el = $('#savestate'); if (!el) return;
  el.dataset.state = state;
  $('#savetext').textContent = text || ({ saved: 'SAVED', pending: 'SAVING', error: 'SAVE FAILED', idle: 'READY' }[state] || state);
}
/* Call after any change to S. Debounced write to IndexedDB and, if linked, the vault. */
function commit(opts = {}) {
  S.meta.updated = now(); SAVE.dirty = true; setSaveState('pending');
  clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flush, opts.now ? 0 : 500);
  if (!opts.silentRender) { renderChrome(); renderStatus(); }
}
async function flush() {
  if (SAVE.busy) { clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flush, 300); return; }
  SAVE.busy = true;
  try {
    for (const b of S.buildings) b.status = summaryStatus(b);                 // legacy summary always in sync
    await SAVE.write(JSON.parse(JSON.stringify(S)));
    await maybeSnapshot();
    if (VAULT.status === 'granted') await vaultWrite();
    else if (typeof OS !== 'undefined' && OS.online && OS.status?.vaultOk && !OS.vaultHold) { try { await OS.vaultWrite(); } catch (e) { console.warn('bridge vault write failed', e); OS.vaultError = e.message || String(e); } }
    SAVE.dirty = false; SAVE.lastSaved = new Date(); SAVE.lastError = null;
    setSaveState('saved', 'SAVED ' + fmtTime(SAVE.lastSaved));
  } catch (e) {
    console.error('save failed', e); SAVE.lastError = e.message || String(e); setSaveState('error');
    toast('Could not save: ' + SAVE.lastError + ' — your edits are still in memory; export a backup now', 'bad', { label: 'BACKUP', fn: exportBackup });
  } finally { SAVE.busy = false; renderStatus(); }
}
async function maybeSnapshot() {
  const t = Date.now();
  if (t - (S.meta.lastSnapshot || 0) < 10 * 60 * 1000) return;   // at most every 10 minutes
  S.meta.lastSnapshot = t;
  await tx('snapshots', 'readwrite', st => st.add({ ts: t, buildings: S.buildings.length, state: JSON.parse(JSON.stringify(S)) }));
  await pruneSnapshots();
}
async function pruneSnapshots() {
  const all = await idbAllWithKeys('snapshots'); const auto = all.filter(([, v]) => !v.label);
  if (auto.length > 24) for (const [k] of auto.slice(0, auto.length - 24)) await idbDel('snapshots', k);
}
async function takeSnapshot(label) { await tx('snapshots', 'readwrite', st => st.add({ ts: Date.now(), buildings: S.buildings.length, label, state: JSON.parse(JSON.stringify(S)) })); }
window.addEventListener('beforeunload', e => { if (SAVE.dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && SAVE.dirty && S) { clearTimeout(SAVE.timer); flush(); } });

/* ---- images (buildings · chronicle · businesses) ---- */
const imageOwners = () => [...S.buildings, ...(S.archive || []), ...(S.businesses || [])];
const ownerById = id => byId(id) || archiveById(id) || bizById(id) || null;
const IMG = new Map();   // ownerId -> { full: objectURL, thumb: objectURL }
async function loadImages() { const all = await idbAllWithKeys('images'); for (const [id, rec] of all) setImgUrls(id, rec); }
function setImgUrls(id, rec) {
  const old = IMG.get(id); if (old) { URL.revokeObjectURL(old.full); URL.revokeObjectURL(old.thumb); }
  IMG.set(id, { full: URL.createObjectURL(rec.full), thumb: URL.createObjectURL(rec.thumb || rec.full) });
}
const imgUrl = (id, kind = 'thumb') => IMG.get(id)?.[kind] || null;
async function downscale(file, max, quality) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}
async function setBuildingImage(b, file) {
  if (!file || !file.type.startsWith('image/')) { toast('That file is not an image', 'warn'); return; }
  const [full, thumb] = await Promise.all([downscale(file, 1400, 0.86), downscale(file, 240, 0.8)]);
  const rec = { full, thumb, updated: now() };
  await idbPut('images', b.id, rec); setImgUrls(b.id, rec);
  b.image = true; b.updated = now(); SAVE.dirtyImages.add(b.id); SAVE.deletedImages.delete(b.id);
  commit(); toast('Photo saved', 'good');
}
async function removeBuildingImage(b) {
  await idbDel('images', b.id); const u = IMG.get(b.id); if (u) { URL.revokeObjectURL(u.full); URL.revokeObjectURL(u.thumb); IMG.delete(b.id); }
  b.image = false; b.updated = now(); SAVE.deletedImages.add(b.id); SAVE.dirtyImages.delete(b.id); commit();
}
const blobToDataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
const dataURLToBlob = async url => (await fetch(url)).blob();

/* ---- vault: a folder on disk holding Registry.json (the master) · NewA.json (compat, optional) · images/ ---- */
const VAULT = { handle: null, status: 'none', name: '', lastWrite: null, legacyChecked: false };   // none | prompt | granted | unsupported
const fsSupported = () => 'showDirectoryPicker' in window;
async function vaultInit() {
  if (!fsSupported()) { VAULT.status = 'unsupported'; return; }
  try { const h = await idbGet('handles', 'vault'); if (!h) return; VAULT.handle = h; VAULT.name = h.name; const p = await h.queryPermission({ mode: 'readwrite' }); VAULT.status = p === 'granted' ? 'granted' : 'prompt'; }
  catch (e) { console.warn('vault init', e); }
}
const diskIsLegacy = disk => ['master', 'core', 'other'].some(k => disk?.[k] && (disk[k].schema ?? 1) < APP.schema);
function reportFor(disk) {
  const bs = [...(disk.master?.buildings || disk.core?.buildings || []), ...(disk.master ? [] : (disk.other?.buildings || []))];
  return { from: Math.min(...['master', 'core', 'other'].filter(k => disk[k]).map(k => disk[k].schema ?? 1)), to: APP.schema, buildings: bs.length, demolished: bs.filter(b => (b.physical || b.status) === 'demolished').length, fromDisk: true };
}
async function vaultLink() {
  if (!fsSupported()) { toast('This browser cannot link folders — use Chrome, Edge or Brave. Backups still work.', 'warn'); return; }
  let h;
  try { h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'newa-vault', startIn: 'documents' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Could not open folder: ' + e.message, 'bad'); return; }
  VAULT.handle = h; VAULT.name = h.name; VAULT.status = 'granted';
  await idbPut('handles', 'vault', h);
  const existing = await vaultRead().catch(() => null); let upgraded = null;
  if (existing && (existing.master || existing.core || existing.other)) {
    const src = existing.master ? 'Registry.json' : 'NewA.json / OtherDistricts.json';
    const n = existing.master ? (existing.master.buildings || []).length : (existing.core?.buildings?.length || 0) + (existing.other?.buildings?.length || 0);
    const legacy = diskIsLegacy(existing);
    const choice = await confirmDialog({ title: 'This folder already has a registry', body: `<p><b>${esc(h.name)}</b> holds <b>${esc(src)}</b> with <b class="num">${n}</b> building${n === 1 ? '' : 's'}${legacy ? ' (older schema)' : ''}. Load it into this app, or overwrite the folder with what is open here?</p>${legacy ? '<p class="muted" style="font-size:12.5px">Loading upgrades it in memory — nothing renumbered or removed — and the first write keeps untouched copies of the original files in <code>backups/</code>.</p>' : ''}`, ok: 'Load from folder', alt: 'Overwrite folder', cancel: 'Cancel' });
    if (choice === 'cancel') { VAULT.handle = null; VAULT.status = 'none'; await idbDel('handles', 'vault'); renderStatus(); return; }
    if (choice === 'ok') { upgraded = legacy ? reportFor(existing) : null; await vaultLoadInto(existing); toast(`Loaded ${n} buildings from ${h.name}`, 'good'); }
  }
  VAULT.legacyChecked = false;
  SAVE.dirtyImages = new Set(imageOwners().filter(b => b.image).map(b => b.id));
  commit({ now: true }); renderStatus(); renderAll();
  toast(`Vault linked — ${h.name}`, 'good');
  if (upgraded) openUpgradeReport(upgraded);
}
async function vaultReconnect() {
  if (!VAULT.handle) return vaultLink();
  try {
    const p = await VAULT.handle.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') { toast('Folder access was not granted', 'warn'); return; }
    VAULT.status = 'granted';
    const disk = await vaultRead().catch(() => null); const main = disk?.master || disk?.core;
    const diskUpdated = main?.meta?.updated || main?.exported; let upgraded = null;
    if (diskUpdated && S.meta.updated && new Date(diskUpdated).getTime() > new Date(S.meta.updated).getTime() + 2000) {
      const legacy = diskIsLegacy(disk);
      const c = await confirmDialog({ title: 'The folder is newer', body: `<p>The files in <b>${esc(VAULT.name)}</b> were saved after this browser copy${legacy ? ' (older schema)' : ''}. Load the folder version?</p>`, ok: 'Load folder version', alt: 'Keep browser copy', cancel: 'Cancel' });
      if (c === 'ok') { upgraded = legacy ? reportFor(disk) : null; await vaultLoadInto(disk); }
    }
    VAULT.legacyChecked = false;
    SAVE.dirtyImages = new Set(imageOwners().filter(b => b.image).map(b => b.id));
    commit({ now: true }); renderStatus(); renderAll(); toast(`Vault reconnected — ${VAULT.name}`, 'good');
    if (upgraded) openUpgradeReport(upgraded);
  } catch (e) { toast('Could not reconnect: ' + e.message, 'bad'); }
}
async function vaultUnlink() { VAULT.handle = null; VAULT.status = fsSupported() ? 'none' : 'unsupported'; VAULT.name = ''; await idbDel('handles', 'vault'); renderStatus(); toast('Vault unlinked — data stays in this browser', 'warn'); }
async function writeFile(dir, name, data) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); }   // createWritable swaps in atomically on close
async function readJSON(dir, name) { try { const fh = await dir.getFileHandle(name); const f = await fh.getFile(); return JSON.parse(await f.text()); } catch { return null; } }
async function readText(dir, name) { try { const fh = await dir.getFileHandle(name); const f = await fh.getFile(); return await f.text(); } catch { return null; } }
/* Before 2.5 writes over older files the first time, keep untouched copies in <vault>/backups/. */
async function vaultBackupLegacy(h) {
  if (VAULT.legacyChecked) return; VAULT.legacyChecked = true;
  const kept = [];
  for (const name of ['Registry.json', 'NewA.json', 'OtherDistricts.json']) {
    const cur = await readJSON(h, name); if (!cur || (cur.schema ?? 1) >= APP.schema) continue;
    try { const dir = await h.getDirectoryHandle('backups', { create: true }); const f = await (await h.getFileHandle(name)).getFile(); await writeFile(dir, name.replace(/\.json$/i, `.schema${cur.schema ?? 1}.${stamp()}.json`), await f.text()); kept.push(name); }
    catch (e) { console.warn('legacy backup', name, e); }
  }
  if (kept.length) toast(`Kept untouched older copies of ${kept.join(' & ')} in ${VAULT.name}/backups/`, 'good');
}
async function vaultWrite() {
  const h = VAULT.handle; if (!h) return;
  await vaultBackupLegacy(h);
  await writeFile(h, 'Registry.json', JSON.stringify(serializeMaster(), null, 2));
  if (S.settings.compatFile !== false) await writeFile(h, 'NewA.json', JSON.stringify(serializeCompat(), null, 2));
  if (SAVE.dirtyImages.size || SAVE.deletedImages.size) {
    const imgDir = await h.getDirectoryHandle('images', { create: true });
    const fileNameFor = (id, rec) => id.startsWith('basemap:') ? `basemap-${id.slice(8)}.${(rec?.full?.type || 'image/png').split('/')[1].replace('jpeg', 'jpg')}` : id + '.jpg';
    for (const id of [...SAVE.dirtyImages]) { const rec = await idbGet('images', id); if (rec?.full) await writeFile(imgDir, fileNameFor(id, rec), rec.full); SAVE.dirtyImages.delete(id); }
    for (const id of [...SAVE.deletedImages]) { if (id.startsWith('basemap:')) { for (const ext of ['png', 'jpg', 'webp']) await imgDir.removeEntry(`basemap-${id.slice(8)}.${ext}`).catch(() => {}); } else await imgDir.removeEntry(id + '.jpg').catch(() => {}); SAVE.deletedImages.delete(id); }
  }
  VAULT.lastWrite = new Date();
}
async function vaultRead() {
  const h = VAULT.handle; if (!h) return null;
  return { master: await readJSON(h, 'Registry.json'), core: await readJSON(h, 'NewA.json'), other: await readJSON(h, 'OtherDistricts.json') };
}
async function vaultLoadInto(disk) {
  if (disk.master) mergePayload(disk.master, 'replace');
  else { if (disk.core) mergePayload(disk.core, 'replace'); if (disk.other) mergePayload(disk.other, 'replace'); }
  try {
    const imgDir = await VAULT.handle.getDirectoryHandle('images');
    for await (const [name, entry] of imgDir.entries()) {
      if (entry.kind !== 'file' || !/\.(jpe?g|png|webp)$/i.test(name)) continue;
      const bmm = /^basemap-(.+)\.(png|jpe?g|webp)$/i.exec(name); if (bmm) { const bm = (S.settings.basemaps || []).find(x => x.id === bmm[1]); if (bm) { const file = await entry.getFile(); await idbPut('images', 'basemap:' + bm.id, { full: file, thumb: null, updated: now(), basemap: true }); BASEMAP_IMG.delete(bm.id); } continue; }
      const id = name.replace(/\.jpe?g$/i, ''); const b = ownerById(id); if (!b) continue;
      const file = await entry.getFile(); const thumb = await downscale(file, 240, 0.8);
      const rec = { full: file, thumb, updated: now() }; await idbPut('images', id, rec); setImgUrls(id, rec); b.image = true;
    }
  } catch { /* no images folder yet */ }
  normalizeScope();
}
/* feed.xml dropped into the vault folder is a zero-infrastructure news path */
async function vaultReadFeed() { const h = VAULT.handle; if (!h) return null; return await readText(h, 'feed.xml'); }

/* ---- export / import (works in every browser) ---- */
function downloadText(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
async function exportBackup() {
  const images = {};
  for (const b of imageOwners()) if (b.image) { const rec = await idbGet('images', b.id); if (rec?.full) images[b.id] = await blobToDataURL(rec.full); }
  const payload = { ...serializeMaster(), kind: 'backup', images };
  downloadText(`NewA-Registry-backup-${stamp()}.json`, JSON.stringify(payload));
  toast('Full backup downloaded (master file + photos)', 'good');
}
async function exportPreUpgrade() {
  if (!MIGRATION.pre) { toast('No pre-upgrade copy in memory — use the labelled snapshot instead', 'warn'); return; }
  const st = JSON.parse(MIGRATION.pre); const images = {};
  for (const b of [...(st.buildings || []), ...(st.archive || [])]) if (b.image) { const rec = await idbGet('images', b.id).catch(() => null); if (rec?.full) images[b.id] = await blobToDataURL(rec.full); }
  downloadText(`NewA-Registry-PRE-2.5-backup-${stamp()}.json`, JSON.stringify({ ...st, app: APP.name, kind: 'backup', exported: now(), note: `Untouched copy of the schema-${st.schema ?? 1} registry taken before the 2.5 upgrade.`, images }));
  toast('Pre-upgrade backup downloaded', 'good');
}
function exportMaster() { downloadText(`Registry-${stamp()}.json`, JSON.stringify(serializeMaster(), null, 2)); toast('Master file downloaded — every jurisdiction, every era', 'good'); }
function exportScopeFile(sc = UI.scope) { downloadText(`Registry-${slug(scopeName(sc))}-${stamp()}.json`, JSON.stringify(serializeScope(sc), null, 2)); toast(`${scopeName(sc)} exported`, 'good'); }
function exportCompat() { downloadText(`NewA-${stamp()}.json`, JSON.stringify(serializeCompat(), null, 2)); toast('New A City compatibility file downloaded', 'good'); }
function exportFiltered(kind) {
  const rows = kind === 'current' ? activeBuildings() : histBuildings();
  const payload = { ...serializeMaster(), kind: 'scope', scope: { kind: 'all', id: null, name: kind === 'current' ? 'Current buildings' : 'Historical buildings' }, filter: kind, buildings: rows.map(exportBuilding) };
  downloadText(`Registry-${kind}-buildings-${stamp()}.json`, JSON.stringify(payload, null, 2)); toast(`${rows.length} ${kind} buildings exported — a filtered file never replaces the whole world on import`, 'good');
}
const csvQ = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCSV(rows, label) {
  const idx = relIndex();
  const cols = ['reg', 'district', 'neighborhood', 'number', 'street', 'name', 'bldgClass', 'classDesc', 'taxClass', 'zoning', 'overlay', 'special', 'yearBuilt', 'yearAltered', 'floors', 'height', 'lotFront', 'lotDepth', 'lotArea', 'unitsRes', 'unitsCom', 'assessLand', 'assessTotal', 'listPrice', 'status', 'owner', 'x', 'z', 'tags', 'notes',
    'yearDemolished', 'lifespan', 'yearBuiltApprox', 'yearDemolishedApprox', 'demolitionReason', 'significance', 'historyNotes', 'confidence', 'verified', 'source', 'sourceType', 'predecessors', 'successors', 'formerRegs', 'id',
    'physical', 'market', 'landmark', 'halfBuilt', 'halfDemolished', 'yearStarted', 'halfStarted', 'yearExpected', 'halfExpected', 'region', 'road', 'floorArea', 'assessBuilding', 'businesses'];
  const lines = [cols.join(',')];
  for (const b of rows) { const r = idx.get(b.id); const d = districtById(b.districtId); lines.push(cols.map(c => csvQ(
    c === 'district' ? d?.name : c === 'region' ? regionById(d?.parentId)?.name || '' : c === 'neighborhood' ? hoodById(b.neighborhoodId)?.name || '' : c === 'classDesc' ? classDesc(b.bldgClass) :
    c === 'lotArea' ? lotAreaOf(b) : c === 'tags' ? (b.tags || []).join(' ') : c === 'lifespan' ? lifespanOf(b) : c === 'status' ? summaryStatus(b) :
    c === 'predecessors' ? (r?.pred || []).map(e => e.b.reg).join(' ') : c === 'successors' ? (r?.succ || []).map(e => e.b.reg).join(' ') :
    c === 'formerRegs' ? (b.formerRegs || []).join(' ') : c === 'road' ? (roadById(b.roadId)?.name || '') : c === 'businesses' ? tenanciesAt(b).map(t => `${bizById(t.businessId)?.name || '?'} (${t.role})`).join('; ') :
    ['verified', 'yearBuiltApprox', 'yearDemolishedApprox', 'landmark'].includes(c) ? (b[c] ? 'yes' : '') : b[c]
  )).join(',')); }
  downloadText(`${label}-${stamp()}.csv`, lines.join('\n'), 'text/csv'); toast(`${rows.length} rows exported`, 'good');
}
function exportRoadsCSV(rows) {
  const cols = ['reg', 'name', 'aliases', 'formerNames', 'type', 'grade', 'width', 'direction', 'lengthBlocks', 'blockSteps', 'yearOpened', 'halfOpened', 'yearClosed', 'buildings', 'jurisdictions', 'confidence', 'source', 'notes', 'id'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvQ(c === 'aliases' || c === 'formerNames' ? (r[c] || []).join('; ') : c === 'lengthBlocks' ? Math.round(polyLength(r.geometry)) : c === 'blockSteps' ? blockSteps(r.geometry) : c === 'buildings' ? buildingsOnRoad(r).map(b => b.reg).join(' ') : c === 'jurisdictions' ? roadJurisdictions(r).map(d => d.name).join('; ') : r[c])).join(','));
  downloadText(`roads-${stamp()}.csv`, lines.join('\n'), 'text/csv'); toast(`${rows.length} roads exported`, 'good');
}
function exportTransitCSV() {
  const lines = ['kind,reg,name,mode,status,color,stations,lengthBlocks,yearOpened,halfOpened,yearClosed,operator,notes,id'];
  for (const l of S.lines) lines.push(['line', l.reg, l.name, l.mode, l.status, l.color, l.stopIds.length, Math.round(lineLength(l)), l.yearOpened, l.halfOpened, l.yearClosed, l.operator, l.notes, l.id].map(csvQ).join(','));
  for (const s of S.stations) lines.push(['station', s.reg, s.name, s.kind, s.status, '', linesAtStation(s).length, '', s.yearOpened, s.halfOpened, s.yearClosed, '', s.notes, s.id].map(csvQ).join(','));
  downloadText(`transit-${stamp()}.csv`, lines.join('\n'), 'text/csv'); toast('Transit exported', 'good');
}
function exportBusinessesCSV(rows) {
  const cols = ['reg', 'name', 'aliases', 'category', 'orgType', 'parent', 'status', 'yearOpened', 'halfOpened', 'yearClosed', 'ticker', 'exchangeListed', 'buildings', 'latestRevenue', 'revenueBasis', 'confidence', 'notes', 'id'];
  const lines = [cols.join(',')];
  for (const z of rows) { const rv = latestRevenue(z); lines.push(cols.map(c => csvQ(c === 'aliases' ? (z.aliases || []).join('; ') : c === 'parent' ? (bizById(z.parentId)?.name || '') : c === 'exchangeListed' ? (z.exchangeListed ? 'yes' : '') : c === 'buildings' ? tenanciesOf(z).map(t => `${byId(t.buildingId)?.reg || '?'} (${t.role})`).join('; ') : c === 'latestRevenue' ? (rv ? `${rv.amount} ${rv.currency} ${rv.period}` : '') : c === 'revenueBasis' ? (rv?.basis || '') : z[c])).join(',')); }
  downloadText(`businesses-${stamp()}.csv`, lines.join('\n'), 'text/csv'); toast(`${rows.length} businesses exported`, 'good');
}
function exportTimelineCSV(rows, label) {
  const lines = ['year,era,started,built,demolished,net,standing'];
  for (const p of yearSeries(rows)) lines.push([p.y, csvQ(eraOf(p.y)?.name || ''), p.started, p.built, p.demolished, p.built - p.demolished, p.standing].join(','));
  downloadText(`timeline-${label}-${stamp()}.csv`, lines.join('\n'), 'text/csv'); toast('Year-by-year ledger exported', 'good');
}
/* import with a preview: what the file is, what a merge would change, and where a replace is allowed to reach */
async function importFile(file) {
  const text = await file.text();
  if (/\.csv$/i.test(file.name) || (!text.trim().startsWith('{') && text.includes(','))) return importCSVText(text, file.name);
  let payload; try { payload = JSON.parse(text); } catch { toast('That file is not valid JSON', 'bad'); return; }
  if (!payload || !Array.isArray(payload.buildings)) { toast('That file is not a New A registry', 'bad'); return; }
  const info = describePayload(payload); const an = analyzeImport(payload); const scopeIds = payloadScopeDistrictIds(payload);
  const reach = scopeIds === null ? 'the whole world' : `${scopeIds.size} district${scopeIds.size === 1 ? '' : 's'} (${[...scopeIds].map(id => districtById(id)?.name || (payload.districts || []).find(d => d.id === id)?.name || id).slice(0, 6).join(', ')}${scopeIds.size > 6 ? '…' : ''})`;
  const choice = await confirmDialog({
    title: 'Import ' + info.label,
    body: `<p>Schema ${info.schema}${info.schema < APP.schema ? ' — upgraded on import, nothing renumbered' : ''}. <b class="num">${info.counts.buildings}</b> buildings (<b class="num">${info.counts.historical}</b> historical), ${info.counts.districts} districts, ${info.counts.neighborhoods} neighborhoods${info.counts.regions ? `, ${info.counts.regions} regions` : ''}${info.counts.roads ? `, ${info.counts.roads} roads` : ''}${info.counts.lines ? `, ${info.counts.lines} lines` : ''}${info.counts.businesses ? `, ${info.counts.businesses} businesses` : ''}, ${info.counts.archive} chronicle images${info.counts.parcels ? `, ${info.counts.parcels} legacy parcels (archived, not re-created)` : ''}${info.counts.images ? `, ${info.counts.images} photos` : ''}.</p>
      <div class="uplist" style="margin-top:10px"><div><span class="new">+</span><span><b>${an.newRecords}</b> new records · <b>${an.updated}</b> updated · ${an.unchanged} unchanged</span></div>
      ${an.olderIncoming.length ? `<div><span class="hi">!</span><span><b>${an.olderIncoming.length}</b> incoming records are OLDER than your copy (${an.olderIncoming.slice(0, 5).map(esc).join(', ')}${an.olderIncoming.length > 5 ? '…' : ''}) — merge still applies them; review afterwards or choose Cancel.</span></div>` : ''}
      ${an.regClash.length ? `<div><span class="hi">!</span><span>${an.regClash.length} incoming number${an.regClash.length === 1 ? '' : 's'} already in use by a different record (${an.regClash.slice(0, 5).map(esc).join(', ')}) — duplicates are re-issued in their series.</span></div>` : ''}
      ${an.blanks ? `<div><span class="ok">✓</span><span>${an.blanks} blank incoming values would erase data — blanks are <b>kept out</b> on merge.</span></div>` : ''}
      ${payload.filter ? `<div><span class="ok">✓</span><span><b>Filtered extract</b> (${esc(payload.filter)} buildings only) — it can only merge; the records it leaves out are never touched.</span></div>` : `<div><span class="ok">✓</span><span><b>Replace</b> only reaches ${esc(reach)}; everything outside stays as it is.</span></div>`}</div>`,
    ok: 'Merge', alt: payload.filter ? undefined : 'Replace within scope', cancel: 'Cancel',
  });
  if (choice === 'cancel') return;
  await takeSnapshot(`before import · ${file.name}`);
  mergePayload(payload, choice === 'ok' ? 'merge' : 'replace');
  if (payload.images) for (const [id, url] of Object.entries(payload.images)) {
    const b = ownerById(id); if (!b) continue;
    const full = await dataURLToBlob(url); const thumb = await downscale(full, 240, 0.8);
    const rec = { full, thumb, updated: now() }; await idbPut('images', id, rec); setImgUrls(id, rec); b.image = true; SAVE.dirtyImages.add(id);
  }
  normalizeScope(); commit({ now: true }); renderAll(); toast(`Imported ${info.counts.buildings} buildings`, 'good');
}
async function importCSVText(text, name) {
  const rows = parseCSV(text); if (!rows.length) { toast('No rows in that CSV', 'warn'); return; }
  const an = analyzeCSV(rows);
  const choice = await confirmDialog({ title: `Import CSV · ${esc(name)}`, body: `<p><b class="num">${rows.length}</b> rows. <b>${an.matched.length}</b> match a building by id or number (${an.changes} field changes across ${[...an.fields].join(', ') || 'nothing'}); <b>${an.unmatched.length}</b> do not match and are skipped${an.unmatched.length ? ` (${an.unmatched.slice(0, 6).map(esc).join(', ')}${an.unmatched.length > 6 ? '…' : ''})` : ''}.</p><p class="muted" style="font-size:12.5px">Blank cells never erase values. CSV cannot create buildings or change ids and numbers — use a registry JSON for that.</p>`, ok: an.changes ? `Apply ${an.changes} changes` : 'Nothing to apply', cancel: 'Cancel' });
  if (choice !== 'ok' || !an.changes) return;
  await takeSnapshot(`before CSV import · ${name}`); applyCSV(an); commit({ now: true }); renderAll(); toast(`${an.changes} values updated from CSV`, 'good');
}
async function listSnapshots() { return (await idbAllWithKeys('snapshots')).map(([k, v]) => ({ key: k, ts: v.ts, buildings: v.buildings, label: v.label || '', schema: v.state?.schema ?? 1 })).reverse(); }
async function restoreSnapshot(key) { const snap = await idbGet('snapshots', key); if (!snap) return; S = migrate(snap.state); normalizeScope(); commit({ now: true }); renderAll(); toast('Snapshot restored', 'good'); }
/* make sure the current scope still exists after a load/import */
function normalizeScope() { if (!scopeNode(UI.scope) && UI.scope.kind !== 'all') UI.scope = regionById('new-a-city') ? { kind: 'region', id: 'new-a-city' } : { kind: 'all', id: null }; }
