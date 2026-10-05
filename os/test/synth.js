'use strict';
/* Synthetic worlds for the tests: a tiny region writer in three chunk formats.
   Only the tests write region files — the bridge itself never does. */
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const nbt = require('../lib/nbt'); const { T, tag } = nbt;
function pack(indices, paletteSize) { const bits = Math.max(4, Math.ceil(Math.log2(Math.max(2, paletteSize)))); const per = Math.floor(64 / bits); const n = Math.ceil(4096 / per); const hi = new Uint32Array(n), lo = new Uint32Array(n); let k = 0; for (let i = 0; i < n; i++) { let h = 0, l = 0; for (let j = 0; j < per && k < 4096; j++, k++) { const v = indices[k]; const shift = j * bits; if (shift + bits <= 32) l |= v << shift; else if (shift >= 32) h |= v << (shift - 32); else { l |= v << shift; h |= v >>> (32 - shift); } } hi[i] = h >>> 0; lo[i] = l >>> 0; } return { hi, lo, length: n }; }
function packSpanning(indices, paletteSize) { const bits = Math.max(4, Math.ceil(Math.log2(Math.max(2, paletteSize)))); const n = Math.ceil(4096 * bits / 64); const hi = new Uint32Array(n), lo = new Uint32Array(n); const setBit = (b, v) => { const i = b >>> 6, s = b & 63; if (!v) return; if (s < 32) lo[i] |= (1 << s) >>> 0; else hi[i] |= (1 << (s - 32)) >>> 0; }; for (let k = 0; k < 4096; k++) for (let b = 0; b < bits; b++) setBit(k * bits + b, (indices[k] >> b) & 1); return { hi, lo, length: n }; }
/* world: a function (x, y, z) → block name or null for air; ySpan: [yMin, yMax] inclusive */
function sectionBlocks(block, cx, cz, sy) { const names = ['air']; const map = new Map([['air', 0]]); const idx = new Uint16Array(4096); for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const n = block(cx * 16 + x, sy * 16 + y, cz * 16 + z) || 'air'; let i = map.get(n); if (i == null) { i = names.length; names.push(n); map.set(n, i); } idx[y * 256 + z * 16 + x] = i; } return { names, idx }; }
function chunkNBT(block, cx, cz, ySections, format) {
  if (format === '1.18') { const sections = ySections.map(sy => { const { names, idx } = sectionBlocks(block, cx, cz, sy); const bs = { palette: names.map(n => ({ Name: 'minecraft:' + n })) }; if (names.length > 1) bs.data = pack(idx, names.length); return { Y: tag(T.BYTE, sy), block_states: bs }; }); return nbt.write('', { DataVersion: 3465, xPos: cx, zPos: cz, yPos: Math.min(...ySections), Status: 'minecraft:full', sections }); }
  if (format === '1.16' || format === '1.13') { const Sections = ySections.map(sy => { const { names, idx } = sectionBlocks(block, cx, cz, sy); return { Y: tag(T.BYTE, sy), Palette: names.map(n => ({ Name: 'minecraft:' + n })), BlockStates: format === '1.16' ? pack(idx, names.length) : packSpanning(idx, names.length) }; }); return nbt.write('', { DataVersion: format === '1.16' ? 2586 : 1976, Level: { xPos: cx, zPos: cz, Status: 'full', Sections } }); }
  // legacy 1.12: numeric ids
  const ID = { air: 0, stone: 1, grass_block: 2, dirt: 3, cobblestone: 4, oak_planks: 5, water: 9, sand: 12, oak_log: 17, oak_leaves: 18, glass: 20, stone_bricks: 98, quartz_block: 155, bricks: 45 };
  const Sections = ySections.map(sy => { const Blocks = Buffer.alloc(4096), Data = Buffer.alloc(2048); for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const n = block(cx * 16 + x, sy * 16 + y, cz * 16 + z) || 'air'; let id = ID[n]; let d = 0; if (id == null) { if (n === 'gray_concrete') { id = 251; d = 7; } else if (n === 'white_wool') { id = 35; d = 0; } else id = 1; } Blocks[y * 256 + z * 16 + x] = id; const i = y * 256 + z * 16 + x; if (i & 1) Data[i >> 1] |= d << 4; else Data[i >> 1] |= d; } return { Y: tag(T.BYTE, sy), Blocks, Data }; });
  return nbt.write('', { DataVersion: 1343, Level: { xPos: cx, zPos: cz, Sections } });
}
function writeRegion(dir, rx, rz, block, { format = '1.18', ySections = [3, 4, 5], chunks = null } = {}) {
  fs.mkdirSync(dir, { recursive: true }); const header = Buffer.alloc(8192); const bodies = []; let sector = 2;
  for (let i = 0; i < 1024; i++) { const cx = rx * 32 + (i % 32), cz = rz * 32 + Math.floor(i / 32); if (chunks && !chunks.some(([a, b]) => a === cx && b === cz)) continue; const raw = chunkNBT(block, cx, cz, ySections, format); const comp = zlib.deflateSync(raw); const len = comp.length + 1; const sectors = Math.ceil((len + 4) / 4096); const buf = Buffer.alloc(sectors * 4096); buf.writeUInt32BE(len, 0); buf[4] = 2; comp.copy(buf, 5); header.writeUInt32BE((sector << 8) | sectors, i * 4); header.writeUInt32BE(Math.floor(Date.now() / 1000), 4096 + i * 4); bodies.push(buf); sector += sectors; }
  fs.writeFileSync(path.join(dir, `r.${rx}.${rz}.mca`), Buffer.concat([header, ...bodies]));
}
/* the standard test town: flat grass at y=64 (stone below, dirt at 63), an east-west stone-brick road
   (z 100..104, x 10..79), a gray-concrete tower 10×8×12 at x 30..39 z 110..117, a small brick house 6×6×4
   at x 60..65 z 112..117, an oak tree at (70,120), a pond at x 20..27 z 130..137 */
function town(x, y, z) {
  if (y < 63) return 'stone'; if (y === 63) return 'dirt';
  if (y === 64) { if (x >= 20 && x <= 27 && z >= 130 && z <= 137) return 'water'; if (z >= 100 && z <= 104 && x >= 10 && x <= 79) return 'stone_bricks'; return 'grass_block'; }
  if (x >= 30 && x <= 39 && z >= 110 && z <= 117 && y <= 76) return 'gray_concrete';
  if (x >= 60 && x <= 65 && z >= 112 && z <= 117 && y <= 68) return (x === 60 || x === 65 || z === 112 || z === 117 || y === 68) ? 'bricks' : null;
  if (x === 70 && z === 120 && y <= 69) return 'oak_log'; if (Math.abs(x - 70) <= 2 && Math.abs(z - 120) <= 2 && y >= 68 && y <= 71) return 'oak_leaves';
  return null;
}
function makeWorld(dir, format = '1.18') { writeRegion(path.join(dir, 'region'), 0, 0, town, { format, chunks: Array.from({ length: 11 * 11 }, (_, i) => [i % 11, Math.floor(i / 11)]) }); fs.writeFileSync(path.join(dir, 'level.dat'), Buffer.from([0])); return dir; }
module.exports = { writeRegion, town, makeWorld, pack, packSpanning, chunkNBT };
