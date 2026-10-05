'use strict';
/* Anvil region reader (r.X.Z.mca) — strictly read-only. Supports chunk formats
   from 1.13 to current (palette + packed indices; spanning for < 1.16), the
   1.18+ `sections`/`block_states` layout, and the pre-1.13 numeric `Blocks`
   arrays with a small id→name table. LZ4 chunks (compression type 4, an
   opt-in server setting since 1.20.5) are reported, not decoded. */
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const nbt = require('./nbt');
const SECTOR = 4096;
function readRegionFile(file) {
  const buf = fs.readFileSync(file, { flag: 'r' });           // 'r' — never opened for writing
  if (buf.length < 2 * SECTOR) return { file, chunks: [], note: 'file shorter than the 8 KiB header' };
  const m = /r\.(-?\d+)\.(-?\d+)\.mca$/.exec(path.basename(file)); const rx = m ? +m[1] : 0, rz = m ? +m[2] : 0;
  const chunks = [];
  for (let i = 0; i < 1024; i++) {
    const off = (buf.readUInt32BE(i * 4) >>> 8), sectors = buf[i * 4 + 3]; if (!off || !sectors) continue;
    const ts = buf.readUInt32BE(SECTOR + i * 4); const start = off * SECTOR; if (start + 5 > buf.length) continue;
    const len = buf.readUInt32BE(start); const comp = buf[start + 4]; const data = buf.subarray(start + 5, start + 4 + len);
    chunks.push({ cx: rx * 32 + (i % 32), cz: rz * 32 + Math.floor(i / 32), compression: comp, data, timestamp: ts });
  }
  return { file, rx, rz, chunks };
}
function decodeChunk(entry) {
  let raw;
  if (entry.compression === 1) raw = zlib.gunzipSync(entry.data); else if (entry.compression === 2) raw = zlib.inflateSync(entry.data); else if (entry.compression === 3) raw = entry.data;
  else if (entry.compression === 4) throw new Error('LZ4-compressed chunk (server option) — not supported by this reader');
  else if (entry.compression === 127) throw new Error('custom-compressed chunk — not supported');
  else throw new Error(`unknown chunk compression ${entry.compression}`);
  return nbt.parse(raw).value;
}
/* ---- block palettes ---- */
const LEGACY_IDS = { 0: 'air', 1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks', 6: 'oak_sapling', 7: 'bedrock', 8: 'water', 9: 'water', 10: 'lava', 11: 'lava', 12: 'sand', 13: 'gravel', 14: 'gold_ore', 15: 'iron_ore', 16: 'coal_ore', 17: 'oak_log', 18: 'oak_leaves', 19: 'sponge', 20: 'glass', 21: 'lapis_ore', 22: 'lapis_block', 24: 'sandstone', 31: 'grass', 35: 'white_wool', 37: 'dandelion', 38: 'poppy', 41: 'gold_block', 42: 'iron_block', 43: 'smooth_stone_slab', 44: 'smooth_stone_slab', 45: 'bricks', 47: 'bookshelf', 48: 'mossy_cobblestone', 49: 'obsidian', 53: 'oak_stairs', 56: 'diamond_ore', 57: 'diamond_block', 64: 'oak_door', 65: 'ladder', 67: 'cobblestone_stairs', 78: 'snow', 79: 'ice', 80: 'snow_block', 82: 'clay', 85: 'oak_fence', 87: 'netherrack', 89: 'glowstone', 98: 'stone_bricks', 102: 'glass_pane', 108: 'brick_stairs', 109: 'stone_brick_stairs', 110: 'mycelium', 112: 'nether_bricks', 121: 'end_stone', 125: 'oak_slab', 126: 'oak_slab', 128: 'sandstone_stairs', 133: 'emerald_block', 134: 'spruce_stairs', 135: 'birch_stairs', 136: 'jungle_stairs', 139: 'cobblestone_wall', 152: 'redstone_block', 155: 'quartz_block', 156: 'quartz_stairs', 159: 'white_terracotta', 160: 'white_stained_glass_pane', 162: 'acacia_log', 163: 'acacia_stairs', 164: 'dark_oak_stairs', 168: 'prismarine', 169: 'sea_lantern', 170: 'hay_block', 171: 'white_carpet', 172: 'terracotta', 174: 'packed_ice', 179: 'red_sandstone', 180: 'red_sandstone_stairs', 198: 'end_rod', 201: 'purpur_block', 206: 'end_stone_bricks', 208: 'dirt_path', 212: 'frosted_ice', 213: 'magma_block', 214: 'nether_wart_block', 216: 'bone_block', 235: 'white_glazed_terracotta', 251: 'white_concrete', 252: 'white_concrete_powder' };
const WOOL_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
function legacyName(id, data) {
  if ((id === 35 || id === 159 || id === 251 || id === 252 || id === 171) && data < 16) { const c = WOOL_COLORS[data]; return id === 35 ? `${c}_wool` : id === 159 ? `${c}_terracotta` : id === 251 ? `${c}_concrete` : id === 252 ? `${c}_concrete_powder` : `${c}_carpet`; }
  return LEGACY_IDS[id] || `legacy_${id}`;
}
const strip = n => n.startsWith('minecraft:') ? n.slice(10) : n;
/* packed palette indices → Uint16Array(4096), YZX order (index = y*256 + z*16 + x) */
function unpack(data, paletteSize, spanning) {
  const out = new Uint16Array(4096); if (!data) return out;
  const bits = Math.max(4, Math.ceil(Math.log2(Math.max(2, paletteSize)))); const mask = (1 << bits) - 1; const { hi, lo, length } = data;
  if (!spanning) {
    const per = Math.floor(64 / bits); let n = 0;
    for (let i = 0; i < length && n < 4096; i++) { const h = hi[i], l = lo[i]; for (let j = 0; j < per && n < 4096; j++) { const shift = j * bits; let v; if (shift + bits <= 32) v = (l >>> shift) & mask; else if (shift >= 32) v = (h >>> (shift - 32)) & mask; else v = ((l >>> shift) | (h << (32 - shift))) & mask; out[n++] = v; } }
  } else {
    for (let n = 0; n < 4096; n++) { const bit = n * bits; const i = bit >>> 6; const shift = bit & 63; const h = hi[i], l = lo[i]; let v; if (shift + bits <= 32) v = (l >>> shift) & mask; else if (shift >= 32 && shift + bits <= 64) v = (h >>> (shift - 32)) & mask; else if (shift < 32) v = ((l >>> shift) | (h << (32 - shift))) & mask; else { const rem = 64 - shift; const low = (h >>> (shift - 32)) & ((1 << rem) - 1); const next = lo[i + 1] || 0; v = (low | (next << rem)) & mask; } out[n] = v; }
  }
  return out;
}
/* chunk → sections [{ y, names: string[] (palette), idx: Uint16Array|null (null = all palette[0]) }], bottom-up */
function sections(root) {
  const dv = root.DataVersion || 0; const out = [];
  if (root.sections) {                                       // 1.18+
    for (const s of root.sections) { const bs = s.block_states; if (!bs || !bs.palette) continue; const names = bs.palette.map(p => strip(p.Name || 'air')); out.push({ y: s.Y, names, idx: bs.data ? unpack(bs.data, names.length, false) : null }); }
  } else if (root.Level && root.Level.Sections) {
    for (const s of root.Level.Sections) {
      if (s.Palette && s.BlockStates) { const names = s.Palette.map(p => strip(p.Name || 'air')); out.push({ y: s.Y, names, idx: unpack(s.BlockStates, names.length, dv < 2529) }); }   // spanning before 20w17a
      else if (s.Blocks) {                                  // pre-1.13 numeric ids
        const names = []; const lookup = new Map(); const idx = new Uint16Array(4096); const blocks = s.Blocks, add = s.Add, data = s.Data;
        for (let n = 0; n < 4096; n++) { let id = blocks[n]; if (add) id |= ((n & 1) ? (add[n >> 1] >> 4) : (add[n >> 1] & 15)) << 8; const d = data ? ((n & 1) ? (data[n >> 1] >> 4) : (data[n >> 1] & 15)) : 0; const key = id * 16 + d; let pi = lookup.get(key); if (pi == null) { pi = names.length; names.push(legacyName(id, d)); lookup.set(key, pi); } idx[n] = pi; }
        out.push({ y: s.Y, names, idx });
      }
    }
  }
  return out.sort((a, b) => a.y - b.y);
}
function chunkCoords(root) { if (root.xPos != null) return { x: root.xPos, z: root.zPos }; if (root.Level) return { x: root.Level.xPos, z: root.Level.zPos }; return null; }
function chunkStatus(root) { return strip(String(root.Status || root.Level?.Status || '')); }
module.exports = { readRegionFile, decodeChunk, sections, chunkCoords, chunkStatus, unpack, strip, LEGACY_IDS, legacyName };
