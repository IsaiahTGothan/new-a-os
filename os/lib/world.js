'use strict';
/* World reader: surface model → building clusters, road bands, registry matching,
   a top-down render. Every file is opened read-only; nothing under the world
   folder is ever created, modified or deleted. */
const fs = require('fs'); const path = require('path');
const anvil = require('./anvil'); const png = require('./png');
const NATURAL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'stone', 'deepslate', 'tuff', 'granite', 'diorite', 'andesite', 'sand', 'red_sand', 'gravel', 'water', 'lava', 'ice', 'packed_ice', 'blue_ice', 'frosted_ice', 'snow_block', 'powder_snow', 'clay', 'sandstone', 'red_sandstone', 'bedrock', 'moss_block', 'mud', 'calcite', 'dripstone_block', 'pointed_dripstone', 'coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'netherrack', 'end_stone', 'dirt_path', 'farmland', 'terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta', 'red_terracotta', 'light_gray_terracotta', 'white_terracotta', 'magma_block', 'obsidian', 'amethyst_block', 'budding_amethyst', 'smooth_basalt', 'basalt', 'blackstone', 'soul_sand', 'soul_soil', 'sculk', 'suspicious_sand', 'suspicious_gravel', 'mossy_cobblestone', 'infested_stone', 'snow']);
const AIR = new Set(['air', 'cave_air', 'void_air']);
const VEG = /_leaves$|_log$|_wood$|^stripped_|_sapling$|^grass$|^short_grass$|^tall_grass$|^fern$|^large_fern$|^dead_bush$|^seagrass$|^tall_seagrass$|^kelp|^vine$|^weeping_vines|^twisting_vines|_flower$|^dandelion$|^poppy$|^blue_orchid$|^allium$|^azure_bluet$|_tulip$|^oxeye_daisy$|^cornflower$|^lily_of_the_valley$|^wither_rose$|^torchflower$|^sunflower$|^lilac$|^rose_bush$|^peony$|^lily_pad$|^sugar_cane$|^bamboo|^cactus$|_mushroom$|^mushroom_stem$|^moss_carpet$|^pink_petals$|^pumpkin_stem$|^melon_stem$|^attached_|^wheat$|^carrots$|^potatoes$|^beetroots$|^sweet_berry_bush$|^cave_vines|^glow_lichen$|^hanging_roots$|^spore_blossom$|^big_dripleaf|^small_dripleaf$|^azalea$|^flowering_azalea$|^mangrove_propagule$|^mangrove_roots$|^muddy_mangrove_roots$|^cherry_|^nether_sprouts$|^crimson_roots$|^warped_roots$|^crimson_fungus$|^warped_fungus$|^torch$|^wall_torch$|_torch$|^lantern$|^soul_lantern$|^rail$|_rail$|^snow$|^fire$|^soul_fire$|^cobweb$|^ladder$|^tripwire|^string$|^scaffolding$|_sign$|^lever$|_button$|_pressure_plate$|^redstone_wire$|^repeater$|^comparator$|^light$|^structure_void$|^barrier$|^end_rod$|^chain$|_banner$|_carpet$|^candle|_candle$|^flower_pot$|^potted_/;
const DEFAULT_ROAD = ['gray_concrete', 'light_gray_concrete', 'black_concrete', 'smooth_stone', 'stone_bricks', 'cracked_stone_bricks', 'polished_andesite', 'cobblestone', 'gray_wool', 'black_wool', 'light_gray_wool', 'gray_terracotta', 'cyan_terracotta', 'stone_slab', 'smooth_stone_slab', 'stone_brick_slab', 'polished_andesite_slab', 'gray_concrete_powder', 'black_concrete_powder', 'polished_deepslate', 'deepslate_tiles', 'deepslate_bricks', 'polished_blackstone', 'polished_blackstone_bricks', 'gray_stained_glass'];
const COLORS = { grass_block: [96, 150, 62], dirt: [134, 96, 67], coarse_dirt: [119, 85, 59], podzol: [91, 63, 24], stone: [125, 125, 125], deepslate: [80, 80, 83], sand: [219, 207, 163], red_sand: [190, 102, 33], gravel: [131, 127, 126], water: [58, 95, 188], lava: [214, 100, 20], ice: [160, 192, 255], snow_block: [245, 250, 250], snow: [245, 250, 250], clay: [160, 166, 179], sandstone: [220, 208, 160], mycelium: [111, 99, 105], moss_block: [89, 109, 45], mud: [60, 57, 60], andesite: [136, 136, 136], diorite: [188, 188, 188], granite: [153, 114, 99], gray_concrete: [54, 57, 61], light_gray_concrete: [125, 125, 115], black_concrete: [8, 10, 15], white_concrete: [207, 213, 214], smooth_stone: [160, 160, 160], stone_bricks: [122, 122, 122], cobblestone: [127, 127, 127], polished_andesite: [132, 134, 133], oak_planks: [162, 130, 78], spruce_planks: [114, 84, 48], birch_planks: [192, 175, 121], bricks: [150, 97, 83], quartz_block: [235, 229, 222], glass: [200, 230, 240], white_wool: [233, 236, 236], red_concrete: [142, 32, 32], blue_concrete: [44, 46, 143], yellow_concrete: [240, 175, 21], terracotta: [152, 94, 67], iron_block: [220, 220, 220], gold_block: [246, 208, 61], oak_leaves: [60, 110, 40], oak_log: [109, 85, 50] };
const tone = name => COLORS[name] || (NATURAL.has(name) ? [110, 120, 100] : VEG.test(name) ? [70, 120, 50] : /concrete|terracotta|wool|stained/.test(name) ? [150, 120, 110] : /glass/.test(name) ? [170, 210, 230] : /planks|log|wood/.test(name) ? [150, 115, 70] : /brick|stone|quartz|andesite|diorite|granite|deepslate|basalt|blackstone/.test(name) ? [150, 150, 150] : [170, 140, 120]);

/* ---- surface model over a block rectangle ---- */
function scanSurface(worldDir, bounds, { roadBlocks = DEFAULT_ROAD, roadMaxRise = 1, onProgress = null } = {}) {
  const regionDir = path.join(worldDir, 'region'); if (!fs.existsSync(regionDir)) throw new Error(`no region folder under ${worldDir}`);
  const x1 = Math.floor(bounds.x1), z1 = Math.floor(bounds.z1), x2 = Math.floor(bounds.x2), z2 = Math.floor(bounds.z2); const W = x2 - x1 + 1, H = z2 - z1 + 1; if (W <= 0 || H <= 0 || W * H > 64e6) throw new Error('bad bounds');
  const top = new Int16Array(W * H).fill(-32768), ground = new Int16Array(W * H).fill(-32768), topName = new Uint16Array(W * H), cls = new Uint8Array(W * H);
  const names = ['unknown']; const nameId = new Map([['unknown', 0]]); const idOf = n => { let i = nameId.get(n); if (i == null) { i = names.length; names.push(n); nameId.set(n, i); } return i; };
  const ROAD = new Set(roadBlocks); const summary = { regions: 0, chunks: 0, skipped: 0, columns: 0, errors: [], lz4: 0, formats: {} };
  const rx1 = Math.floor(x1 / 512), rx2 = Math.floor(x2 / 512), rz1 = Math.floor(z1 / 512), rz2 = Math.floor(z2 / 512);
  for (let rz = rz1; rz <= rz2; rz++) for (let rx = rx1; rx <= rx2; rx++) {
    const file = path.join(regionDir, `r.${rx}.${rz}.mca`); if (!fs.existsSync(file)) continue;
    let region; try { region = anvil.readRegionFile(file); } catch (e) { summary.errors.push(`${path.basename(file)}: ${e.message}`); continue; } summary.regions++;
    for (const ch of region.chunks) {
      const bx = ch.cx * 16, bz = ch.cz * 16; if (bx + 15 < x1 || bx > x2 || bz + 15 < z1 || bz > z2) continue;
      let root; try { root = anvil.decodeChunk(ch); } catch (e) { if (/LZ4/.test(e.message)) summary.lz4++; else summary.errors.push(`chunk ${ch.cx},${ch.cz}: ${e.message}`); summary.skipped++; continue; }
      const st = anvil.chunkStatus(root); if (st && !/full|heightmaps|spawn|light|features|surface|liquid_carvers|carvers/.test(st) && st !== '') { summary.skipped++; continue; }
      const secs = anvil.sections(root); if (!secs.length) { summary.skipped++; continue; } summary.chunks++; summary.formats[root.sections ? '1.18+' : root.Level?.Sections?.[0]?.Palette ? '1.13-1.17' : 'pre-1.13'] = (summary.formats[root.sections ? '1.18+' : root.Level?.Sections?.[0]?.Palette ? '1.13-1.17' : 'pre-1.13'] || 0) + 1;
      // palette classes per section, computed once
      const secInfo = secs.map(s => ({ s, air: s.names.map(n => AIR.has(n)), veg: s.names.map(n => VEG.test(n)), nat: s.names.map(n => NATURAL.has(n)), allAir: s.names.every(n => AIR.has(n)) && (s.idx == null || true) }));
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const wx = bx + lx, wz = bz + lz; if (wx < x1 || wx > x2 || wz < z1 || wz > z2) continue; const o = (wz - z1) * W + (wx - x1);
        let tY = null, tN = 0, gY = null;
        for (let si = secInfo.length - 1; si >= 0 && gY == null; si--) {
          const I = secInfo[si]; if (I.allAir && I.s.idx == null) continue; const s = I.s;
          for (let y = 15; y >= 0; y--) { const pi = s.idx ? s.idx[y * 256 + lz * 16 + lx] : 0; if (I.air[pi]) continue; if (I.veg[pi]) continue; const wy = s.y * 16 + y; if (tY == null) { tY = wy; tN = idOf(s.names[pi]); } if (I.nat[pi]) { gY = wy; break; } }
        }
        if (tY == null) continue; summary.columns++;
        top[o] = tY; ground[o] = gY == null ? tY : gY; topName[o] = tN; const nm = names[tN]; const rise = tY - ground[o];
        cls[o] = NATURAL.has(nm) ? 1 : (ROAD.has(nm) && rise <= roadMaxRise) ? 3 : 4;
      }
      if (onProgress) onProgress(summary);
    }
  }
  return { x1, z1, x2, z2, W, H, top, ground, topName, cls, names, summary };
}
/* ---- building clusters: 8-connected built columns ---- */
function clusters(S, { minFootprint = 9, minRise = 3 } = {}) {
  const { W, H, cls, top, ground, topName, names } = S; const seen = new Uint8Array(W * H); const out = [];
  const stack = new Int32Array(W * H);
  for (let o0 = 0; o0 < W * H; o0++) {
    if (cls[o0] !== 4 || seen[o0]) continue; let sp = 0; stack[sp++] = o0; seen[o0] = 1; const cols = [];
    while (sp) { const o = stack[--sp]; cols.push(o); const x = o % W, z = (o - x) / W; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const n = nz * W + nx; if (cls[n] === 4 && !seen[n]) { seen[n] = 1; stack[sp++] = n; } } }
    if (cols.length < minFootprint) continue;
    let bx1 = Infinity, bz1 = Infinity, bx2 = -Infinity, bz2 = -Infinity, sx = 0, sz = 0, peak = -Infinity, rise = 0; const gr = []; const mat = new Map();
    for (const o of cols) { const x = o % W, z = (o - x) / W; bx1 = Math.min(bx1, x); bx2 = Math.max(bx2, x); bz1 = Math.min(bz1, z); bz2 = Math.max(bz2, z); sx += x; sz += z; peak = Math.max(peak, top[o]); gr.push(ground[o]); rise = Math.max(rise, top[o] - ground[o]); mat.set(topName[o], (mat.get(topName[o]) || 0) + 1); }
    if (rise < minRise && cols.length < 40) continue;
    gr.sort((a, b) => a - b); const base = gr[gr.length >> 1]; const fill = cols.length / ((bx2 - bx1 + 1) * (bz2 - bz1 + 1)); const material = names[[...mat.entries()].sort((a, b) => b[1] - a[1])[0][0]];
    const cx = sx / cols.length + S.x1, cz = sz / cols.length + S.z1;
    out.push({ x: Math.round(cx), z: Math.round(cz), cx: Math.round(cx * 10) / 10, cz: Math.round(cz * 10) / 10, bbox: { x1: bx1 + S.x1, z1: bz1 + S.z1, x2: bx2 + S.x1, z2: bz2 + S.z1 }, size: cols.length, fill: Math.round(fill * 100) / 100, peak, base, height: peak - base, rise, floorsEstimate: Math.max(1, Math.round((peak - base) / 4)), material, footprint: fill >= 0.75 ? [[bx1 + S.x1, bz1 + S.z1], [bx2 + S.x1 + 1, bz1 + S.z1], [bx2 + S.x1 + 1, bz2 + S.z1 + 1], [bx1 + S.x1, bz2 + S.z1 + 1]] : null });
  }
  return out.sort((a, b) => b.size - a.size);
}
/* ---- road bands: runs of road columns merged across neighbouring rows (grid cities) ---- */
function roads(S, { minLen = 16, maxWidth = 16 } = {}) {
  const { W, H, cls } = S; const out = [];
  const pass = (horizontal) => {
    const bands = []; const rows = horizontal ? H : W, cols = horizontal ? W : H;
    for (let r = 0; r < rows; r++) {
      const runs = []; let start = -1;
      for (let c = 0; c <= cols; c++) { const on = c < cols && cls[horizontal ? r * W + c : c * W + r] === 3; if (on && start < 0) start = c; if (!on && start >= 0) { if (c - start >= minLen) runs.push([start, c - 1]); start = -1; } }
      for (const [a, b] of runs) { let band = bands.find(B => B.open && B.last === r - 1 && Math.abs(B.a - a) <= 3 && Math.abs(B.b - b) <= 3); if (!band) { band = { a, b, first: r, last: r, rows: [], open: true, as: [], bs: [] }; bands.push(band); } band.last = r; band.rows.push(r); band.as.push(a); band.bs.push(b); }
      for (const B of bands) if (B.open && B.last < r) B.open = false;
    }
    for (const B of bands) { const width = B.rows.length; if (width < 2 || width > maxWidth) continue; const med = arr => arr.slice().sort((x, y) => x - y)[arr.length >> 1]; const a = med(B.as), b = med(B.bs); const centre = (B.first + B.last) / 2; const p1 = horizontal ? [a + S.x1, centre + S.z1] : [centre + S.x1, a + S.z1], p2 = horizontal ? [b + S.x1 + 1, centre + S.z1] : [centre + S.x1, b + S.z1 + 1]; out.push({ geometry: [p1.map(v => Math.round(v * 10) / 10), p2.map(v => Math.round(v * 10) / 10)], width, length: b - a + 1, orientation: horizontal ? 'east-west' : 'north-south' }); }
  };
  pass(true); pass(false); return out.sort((a, b) => b.length - a.length);
}
/* ---- registry matching → proposals (nothing is written anywhere) ---- */
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz; let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return d2(p, [a[0] + dx * t, a[1] + dz * t]); }
const polyDist = (p, g) => { let d = Infinity; for (let i = 0; i < g.length - 1; i++) d = Math.min(d, segDist(p, g[i], g[i + 1])); return g.length === 1 ? d2(p, g[0]) : d; };
function match(S, cl, rd, registry = { buildings: [], roads: [] }, { stamp = new Date().toISOString() } = {}) {
  const inB = b => b.x != null && b.z != null && b.x >= S.x1 && b.x <= S.x2 && b.z >= S.z1 && b.z <= S.z2;
  const standing = registry.buildings.filter(b => inB(b) && !['demolished', 'vacant-lot', 'planned'].includes(b.physical || 'standing'));
  const used = new Set(); const proposals = [];
  for (const c of cl) {
    const cands = standing.filter(b => !used.has(b.id) && ((b.x >= c.bbox.x1 - 3 && b.x <= c.bbox.x2 + 3 && b.z >= c.bbox.z1 - 3 && b.z <= c.bbox.z2 + 3) || d2([b.x, b.z], [c.cx, c.cz]) <= 10)).sort((a, b) => d2([a.x, a.z], [c.cx, c.cz]) - d2([b.x, b.z], [c.cx, c.cz]));
    const b = cands[0];
    if (!b) { proposals.push({ kind: 'world-new', label: `Possible building at X ${c.x} · Z ${c.z}`, cluster: c, create: { x: c.x, z: c.z, height: c.height, lotArea: c.size, footprint: c.footprint, notes: `Detected in the world scan of ${stamp.slice(0, 10)}: ${c.size} columns, ${c.height} blocks high, mostly ${c.material.replace(/_/g, ' ')}; about ${c.floorsEstimate} floors at 4 blocks each. Middle coordinates X ${c.x} · Z ${c.z}.`, source: `world scan ${stamp.slice(0, 10)}`, sourceType: 'world', confidence: 'likely' }, why: `${c.size} built columns, ${c.height} blocks above ground, footprint ${c.bbox.x2 - c.bbox.x1 + 1}×${c.bbox.z2 - c.bbox.z1 + 1}${c.footprint ? ' (rectangular)' : ''}, mostly ${c.material.replace(/_/g, ' ')}. No registry building has coordinates here.` }); continue; }
    used.add(b.id); c.matched = b.reg; const after = {}; const why = [];
    const moved = d2([b.x, b.z], [c.cx, c.cz]); if (moved > 6) { after.x = c.x; after.z = c.z; why.push(`recorded coordinates are ${Math.round(moved)} blocks from the detected middle (X ${c.x} · Z ${c.z})`); }
    const hRec = b.height != null ? b.height : b.floors != null ? b.floors * 3.5 : null; if (hRec == null) { after.height = c.height; why.push(`no height on file; the scan measures ${c.height} blocks above ground (about ${c.floorsEstimate} floors)`); } else if (Math.abs(hRec - c.height) > 6) { after.height = c.height; why.push(`height on file ${Math.round(hRec)} vs ${c.height} measured`); }
    if (c.footprint && !b.footprint) { after.footprint = c.footprint; why.push(`rectangular footprint ${c.bbox.x2 - c.bbox.x1 + 1}×${c.bbox.z2 - c.bbox.z1 + 1} detected, none drawn`); }
    if (Object.keys(after).length) proposals.push({ kind: 'world-update', buildingId: b.id, reg: b.reg, label: `${b.reg} · ${b.name || ''}`.trim(), after, cluster: c, why: why.join('; ') + '.' });
    else proposals.push({ kind: 'world-confirm', buildingId: b.id, reg: b.reg, label: `${b.reg} · ${b.name || ''}`.trim(), cluster: c, why: `Found where recorded: ${c.size} columns, ${c.height} blocks high.` });
  }
  for (const b of standing) if (!used.has(b.id)) proposals.push({ kind: 'world-missing', buildingId: b.id, reg: b.reg, label: `${b.reg} · ${b.name || ''}`.trim(), x: b.x, z: b.z, why: `Nothing built was detected around X ${b.x} · Z ${b.z} in this scan — demolished, moved, not yet built, or the coordinates are off.` });
  const usedRoads = new Set();
  for (const r of rd) { const hit = registry.roads.filter(x => !usedRoads.has(x.id) && (x.geometry || []).length >= 2 && polyDist(r.geometry[0], x.geometry) <= 8 && polyDist(r.geometry[1], x.geometry) <= 8)[0]; if (hit) { usedRoads.add(hit.id); r.matched = hit.reg; proposals.push({ kind: 'world-road-confirm', roadId: hit.id, reg: hit.reg, label: hit.name || hit.reg, road: r, why: `Road surface found along the drawn alignment (${r.length} blocks long, ${r.width} wide).` }); } else proposals.push({ kind: 'world-road', label: `Possible road · ${r.length} blocks ${r.orientation}`, road: r, create: { geometry: r.geometry, width: r.width, type: r.width >= 9 ? 'avenue' : 'street', source: `world scan ${stamp.slice(0, 10)}`, sourceType: 'world', confidence: 'likely' }, why: `${r.length} blocks of road material, ${r.width} wide, ${r.orientation}; no drawn road follows it.` }); }
  return proposals;
}
/* ---- top-down render at one block per pixel ---- */
function render(S, file) {
  const { W, H, top, topName, names, cls } = S; let lo = Infinity, hi = -Infinity; for (let i = 0; i < W * H; i++) if (top[i] !== -32768) { lo = Math.min(lo, top[i]); hi = Math.max(hi, top[i]); } const range = Math.max(1, hi - lo);
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { if (top[i] === -32768) continue; const [r, g, b] = tone(names[topName[i]]); const sh = 0.72 + 0.56 * ((top[i] - lo) / range); const o = i * 4; rgba[o] = Math.min(255, r * sh); rgba[o + 1] = Math.min(255, g * sh); rgba[o + 2] = Math.min(255, b * sh); rgba[o + 3] = 255; if (cls[i] === 3) { rgba[o] = Math.min(255, rgba[o] * .9); rgba[o + 1] = Math.min(255, rgba[o + 1] * .9); rgba[o + 2] = Math.min(255, rgba[o + 2] * .95); } }
  const buf = png.encode(W, H, rgba); fs.writeFileSync(file, buf); return { file, x: S.x1, z: S.z1, scale: 1, width: W, height: H, bytes: buf.length };
}
function scan(worldDir, { bounds, registry = { buildings: [], roads: [] }, roadBlocks, renderFile = null, stamp = new Date().toISOString() } = {}) {
  const t0 = Date.now(); const S = scanSurface(worldDir, bounds, { roadBlocks: roadBlocks || DEFAULT_ROAD });
  const cl = clusters(S), rd = roads(S); const proposals = match(S, cl, rd, registry, { stamp });
  const out = { at: stamp, bounds: { x1: S.x1, z1: S.z1, x2: S.x2, z2: S.z2 }, summary: { ...S.summary, ms: Date.now() - t0, clusters: cl.length, roads: rd.length, proposals: proposals.length, byKind: proposals.reduce((a, p) => { a[p.kind] = (a[p.kind] || 0) + 1; return a; }, {}) }, clusters: cl, roads: rd, proposals, render: null };
  if (renderFile) out.render = render(S, renderFile);
  return out;
}
module.exports = { scanSurface, clusters, roads, match, render, scan, DEFAULT_ROAD, NATURAL, VEG };
