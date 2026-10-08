/* =====================================================================
   §29 OLD MAPS — Minecraft's own item maps (world/data/map_#.dat) as dated
       basemaps. Each file stores its centre (xCenter, zCenter), its scale
       (0–4: one pixel = 2^scale blocks, 128 px across) and 16,384 colour ids,
       so it is placed exactly — nothing is calibrated. Files are read in the
       browser; nothing is uploaded and the world is never written.
   ===================================================================== */
/* Java Edition map base colours (MapColor ids 0–61); id 0 is transparent */
const MC_MAP_BASE = [null, [127, 178, 56], [247, 233, 163], [199, 199, 199], [255, 0, 0], [160, 160, 255], [167, 167, 167], [0, 124, 0], [255, 255, 255], [164, 168, 184], [151, 109, 77], [112, 112, 112], [64, 64, 255], [143, 119, 72], [255, 252, 245], [216, 127, 51], [178, 76, 216], [102, 153, 216], [229, 229, 51], [127, 204, 25], [242, 127, 165], [76, 76, 76], [153, 153, 153], [76, 127, 153], [127, 63, 178], [51, 76, 178], [102, 76, 51], [102, 127, 51], [153, 51, 51], [25, 25, 25], [250, 238, 77], [92, 219, 213], [74, 128, 255], [0, 217, 58], [129, 86, 49], [112, 2, 0], [209, 177, 161], [159, 82, 36], [149, 87, 108], [112, 108, 138], [186, 133, 36], [103, 117, 53], [160, 77, 78], [57, 41, 35], [135, 107, 98], [87, 92, 92], [122, 73, 88], [76, 62, 92], [76, 50, 35], [76, 82, 42], [142, 60, 46], [37, 22, 16], [189, 48, 49], [148, 63, 97], [92, 25, 29], [22, 126, 134], [58, 142, 140], [86, 44, 62], [20, 180, 133], [100, 100, 100], [216, 175, 147], [127, 167, 150]];
const MC_MAP_SHADE = [180, 220, 255, 135];
function mcMapRGBA(colors) {
  const out = new Uint8ClampedArray(128 * 128 * 4);
  for (let i = 0; i < 16384; i++) { const id = colors[i] & 255; const base = MC_MAP_BASE[id >> 2]; if (!base) continue; const m = MC_MAP_SHADE[id & 3]; const o = i * 4; out[o] = base[0] * m / 255; out[o + 1] = base[1] * m / 255; out[o + 2] = base[2] * m / 255; out[o + 3] = 255; }
  return out;
}
/* tiny NBT reader for the browser (big-endian); byte arrays come back as Uint8Array views */
function nbtParse(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let o = 0; const td = new TextDecoder();
  const str = () => { const n = dv.getUint16(o); o += 2; const s = td.decode(u8.subarray(o, o + n)); o += n; return s; };
  const val = t => { switch (t) {
    case 1: return dv.getInt8(o++); case 2: { const v = dv.getInt16(o); o += 2; return v; } case 3: { const v = dv.getInt32(o); o += 4; return v; } case 4: { const v = Number(dv.getBigInt64(o)); o += 8; return v; }
    case 5: { const v = dv.getFloat32(o); o += 4; return v; } case 6: { const v = dv.getFloat64(o); o += 8; return v; }
    case 7: { const n = dv.getInt32(o); o += 4; const v = u8.subarray(o, o + n); o += n; return v; } case 8: return str();
    case 9: { const lt = dv.getUint8(o++); const n = dv.getInt32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(val(lt)); return a; }
    case 10: { const obj = {}; for (;;) { const ct = dv.getUint8(o++); if (ct === 0) break; const name = str(); obj[name] = val(ct); } return obj; }
    case 11: { const n = dv.getInt32(o); o += 4; const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(o); o += 4; } return a; }
    case 12: { const n = dv.getInt32(o); o += 4; o += n * 8; return { length: n }; }
    default: throw new Error('NBT tag ' + t + ' at ' + (o - 1)); } };
  const t = dv.getUint8(o++); if (t !== 10) throw new Error('not an NBT compound'); str(); return val(10);
}
async function gunzipMaybe(buf) { const u8 = new Uint8Array(buf); if (u8[0] === 0x1f && u8[1] === 0x8b) return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); return u8; }
const MAP_DAT = /(?:^|[\\/])map_(\d+)\.dat$/i;
/* one map file → { id, scale, x, z (top-left), size (blocks), overworld, colors, modified } or null */
async function readMapDat(file, path = file.name) {
  const m = MAP_DAT.exec(path || file.name); if (!m) return null;
  const root = nbtParse(await gunzipMaybe(await file.arrayBuffer())); const d = root.data || root.Data || root; if (!d || !d.colors || d.colors.length < 16384) return { id: +m[1], bad: 'no colour data' };
  const dim = d.dimension; const overworld = dim == null || dim === 0 || dim === 'minecraft:overworld' || dim === 'overworld';
  const scale = clamp(num(d.scale) ?? 0, 0, 4); const size = 128 << scale; const xc = num(d.xCenter) ?? 0, zc = num(d.zCenter) ?? 0;
  return { id: +m[1], path, scale, size, x: xc - size / 2, z: zc - size / 2, xCenter: xc, zCenter: zc, overworld, dimension: dim, locked: !!d.locked, colors: d.colors, modified: file.lastModified || null, dataVersion: root.DataVersion ?? null };
}
/* stitch maps into one image: coarse scales first, then finer ones; same scale older first, so newer detail wins */
async function stitchMaps(maps, { maxSide = 8192, name = 'Minecraft maps' } = {}) {
  const x1 = Math.min(...maps.map(m => m.x)), z1 = Math.min(...maps.map(m => m.z)), x2 = Math.max(...maps.map(m => m.x + m.size)), z2 = Math.max(...maps.map(m => m.z + m.size));
  let bpp = 1; while ((x2 - x1) / bpp > maxSide || (z2 - z1) / bpp > maxSide) bpp *= 2;   // blocks per output pixel
  const c = document.createElement('canvas'); c.width = Math.ceil((x2 - x1) / bpp); c.height = Math.ceil((z2 - z1) / bpp); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const tile = document.createElement('canvas'); tile.width = tile.height = 128; const tg = tile.getContext('2d');
  const order = maps.slice().sort((a, b) => b.scale - a.scale || (a.modified || 0) - (b.modified || 0) || a.id - b.id);
  for (const m of order) { tg.putImageData(new ImageData(mcMapRGBA(m.colors), 128, 128), 0, 0); g.drawImage(tile, (m.x - x1) / bpp, (m.z - z1) / bpp, m.size / bpp, m.size / bpp); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); return { file: new File([blob], `${name}.png`, { type: 'image/png' }), x: x1, z: z1, scale: bpp, w: c.width, h: c.height };
}
const hyOfTime = ms => { const d = new Date(ms); return { year: d.getFullYear(), half: d.getMonth() < 6 ? 'E' : 'L' }; };
/* group maps into dated basemaps: one group for all, or one per half-year of each file's modified date */
function groupMaps(maps, mode, fixed) {
  if (mode === 'fixed') return [{ ...fixed, maps }];
  const by = new Map(); for (const m of maps) { const h = m.modified ? hyOfTime(m.modified) : fixed; const k = `${h.year}|${h.half}`; (by.get(k) || by.set(k, { year: h.year, half: h.half, maps: [] }).get(k)).maps.push(m); }
  return [...by.values()].sort((a, b) => hyIndex(a.year, a.half) - hyIndex(b.year, b.half));
}
async function importMapGroups(groups, label) {
  const made = [];
  for (const gp of groups) { const st = await stitchMaps(gp.maps, { name: `${label} ${hyShort(gp.year, gp.half)}` }); const bm = await basemapAdd(st.file); if (!bm) continue; Object.assign(bm, { name: `${label} · ${hyLabel(gp.year, gp.half)}`, x: st.x, z: st.z, scale: st.scale, w: st.w, h: st.h, opacity: 0.85, source: 'mcmap', year: gp.year, half: gp.half || '', maps: gp.maps.length, mapIds: gp.maps.map(m => m.id).sort((a, b) => a - b).slice(0, 400) }); made.push(bm); }
  commit({ silentRender: true }); if (UI.nav === 'map') { refreshChips(); mapDraw(); } if (HV.open) { hvRefreshTrack(); hvUpdateChrome(); hvDraw(); }
  return made;
}
/* the import dialog: pick files or the world's data folder, check what was found, choose how to date them */
let MAPIMPORT = null;
async function readMapFiles(entries) {
  const out = [], skipped = []; for (const e of entries) { if (!MAP_DAT.test(e.path || e.file.name)) continue; try { const m = await readMapDat(e.file, e.path); if (!m) continue; if (m.bad) skipped.push(`map_${m.id}: ${m.bad}`); else if (!m.overworld) skipped.push(`map_${m.id}: ${m.dimension}`); else out.push(m); } catch (err) { skipped.push(`${e.path || e.file.name}: ${err.message}`); } }
  return { maps: out, skipped };
}
const mapGroupRowsHTML = groups => `${groups.map(gp => `<div class="r"><div><div class="t"><span class="mk">${esc(hyLabel(gp.year, gp.half))}</span>${gp.maps.length} map${gp.maps.length === 1 ? '' : 's'}</div><div class="s">ids ${esc(gp.maps.map(m => m.id).sort((a, b) => a - b).slice(0, 12).join(', '))}${gp.maps.length > 12 ? '…' : ''}</div></div></div>`).join('')}`;
function openMapImportModal() {
  const M = MAPIMPORT; const maps = M?.maps || []; const groups = maps.length ? groupMaps(maps, M.mode, M.fixed) : [];
  const ext = maps.length ? { x1: Math.min(...maps.map(m => m.x)), z1: Math.min(...maps.map(m => m.z)), x2: Math.max(...maps.map(m => m.x + m.size)), z2: Math.max(...maps.map(m => m.z + m.size)) } : null;
  openModal({ title: 'Old maps — Minecraft map files', kicker: 'PLAYBACK · BASEMAPS', cls: 'wide',
    body: `<p class="muted" style="font-size:12.5px;margin:12px 0 0">Every map you ever made in-game is saved as <code>map_#.dat</code> in the world's <code>data</code> folder — including in old backups. Each file knows exactly where it sits, so the stitched image is placed to the block. Give the maps a date (early or late in a year) and playback shows them under the city at that time; newer maps always sit on top of older ones, and unexplored corners stay see-through.</p>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="mi-dir">${icon('folder')} World or data folder…</button><input type="file" id="mi-dirin" webkitdirectory multiple hidden><button class="btn" id="mi-files">${icon('up')} map_#.dat files…</button><input type="file" id="mi-filein" multiple accept=".dat" hidden></div>
      ${M ? `<div class="callout ${maps.length ? 'info' : 'warn'}" style="margin-top:12px"><b>${maps.length} overworld map${maps.length === 1 ? '' : 's'}</b>${M.skipped.length ? ` · ${M.skipped.length} skipped (${esc(M.skipped.slice(0, 3).join('; '))}${M.skipped.length > 3 ? '…' : ''})` : ''}${ext ? ` · covers X ${ext.x1} → ${ext.x2} · Z ${ext.z1} → ${ext.z2} · scales ${[...new Set(maps.map(m => m.scale))].sort().join(', ')}` : ''}${maps.length && maps.some(m => m.modified) ? ` · files dated ${esc(new Date(Math.min(...maps.map(m => m.modified || Infinity))).toISOString().slice(0, 10))} → ${esc(new Date(Math.max(...maps.map(m => m.modified || 0))).toISOString().slice(0, 10))}` : ''}</div>
      ${maps.length ? `<div class="frow" style="margin-top:12px"><div class="f"><label>Date the maps by</label><select id="mi-mode"><option value="fixed" ${M.mode === 'fixed' ? 'selected' : ''}>One date for all of them</option><option value="files" ${M.mode === 'files' ? 'selected' : ''}>Each file's modified date (grouped by half-year)</option></select></div><div class="f"><label>${M.mode === 'files' ? 'Fallback date (files without one)' : 'They show the city in'}</label><div class="hy"><select id="mi-h"><option value="E" ${M.fixed.half === 'E' ? 'selected' : ''}>Early (Jan–Jun)</option><option value="L" ${M.fixed.half === 'L' ? 'selected' : ''}>Late (Jul–Dec)</option></select><input id="mi-y" type="number" min="${FOUNDED_YEAR}" max="2200" value="${esc(M.fixed.year)}"></div></div><div class="f"><label>Name</label><input id="mi-name" value="${esc(M.label)}"></div></div>
      <div class="rowlist" id="mi-groups" style="margin-top:10px">${mapGroupRowsHTML(groups)}</div>
      <div class="desc-line" style="margin-top:6px">Tip: copy each old backup's <code>data</code> folder in turn and import it with that backup's date. A file's modified date is when the map was last updated in-game — good for backups, unreliable for copies that lost their dates.</div>` : ''}` : ''}`,
    foot: `<button class="btn ghost" data-act="modal-close">Close</button><span class="spacer"></span><button class="btn" data-act="basemap-open">${icon('img')} All basemaps</button>${maps.length ? `<button class="btn primary" id="mi-go">${icon('check')} Add ${groups.length} dated map${groups.length === 1 ? '' : 's'}</button>` : ''}`,
    onOpen: m => {
      const load = async entries => { toast('Reading map files…'); const r = await readMapFiles(entries); const last = r.maps.reduce((a, x) => Math.max(a, x.modified || 0), 0); MAPIMPORT = { ...r, mode: 'fixed', fixed: last ? hyOfTime(last) : { year: CURRENT_YEAR, half: CURRENT_HALF }, label: 'Minecraft maps' }; openMapImportModal(); };
      m.querySelector('#mi-dir').onclick = () => m.querySelector('#mi-dirin').click(); m.querySelector('#mi-files').onclick = () => m.querySelector('#mi-filein').click();
      m.querySelector('#mi-dirin').addEventListener('change', e => load([...(e.target.files || [])].map(f => ({ path: f.webkitRelativePath || f.name, file: f }))));
      m.querySelector('#mi-filein').addEventListener('change', e => load([...(e.target.files || [])].map(f => ({ path: f.name, file: f }))));
      const sync = () => { if (!MAPIMPORT) return; MAPIMPORT.mode = m.querySelector('#mi-mode')?.value || 'fixed'; MAPIMPORT.fixed = { year: num(m.querySelector('#mi-y')?.value) ?? CURRENT_YEAR, half: m.querySelector('#mi-h')?.value || 'E' }; MAPIMPORT.label = m.querySelector('#mi-name')?.value.trim() || 'Minecraft maps'; };
      m.querySelector('#mi-mode')?.addEventListener('change', () => { sync(); openMapImportModal(); });
      const refresh = () => { sync(); if (!MAPIMPORT?.maps?.length) return; const groups = groupMaps(MAPIMPORT.maps, MAPIMPORT.mode, MAPIMPORT.fixed); const rows = m.querySelector('#mi-groups'); if (rows) rows.innerHTML = mapGroupRowsHTML(groups); const go = $('#mi-go'); if (go) go.innerHTML = `${icon('check')} Add ${groups.length} dated map${groups.length === 1 ? '' : 's'}`; };   // the group row and the button follow the typed date
      m.querySelector('#mi-y')?.addEventListener('input', refresh); m.querySelector('#mi-h')?.addEventListener('change', refresh);
      m.querySelector('#mi-go')?.addEventListener('click', async () => { sync(); const made = await importMapGroups(groupMaps(MAPIMPORT.maps, MAPIMPORT.mode, MAPIMPORT.fixed), MAPIMPORT.label); MAPIMPORT = null; closeModal(); toast(`${made.length} dated map${made.length === 1 ? '' : 's'} added — playback shows each from its date`, 'good'); });
    } });
}
