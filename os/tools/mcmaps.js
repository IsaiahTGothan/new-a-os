#!/usr/bin/env node
'use strict';
/* Stitch Minecraft item maps (map_#.dat) into one PNG, placed from each map's own centre and scale.
   Read-only: the world or backup folder is never written.
     node os/tools/mcmaps.js <world-or-data-folder> [--out maps.png] [--max 8192] [--since 2018-01-01] [--until 2019-01-01]
   Writes <out>.png and <out>.json ({ x, z, scale, w, h, maps }) — in New A OS use Vault → Basemap → Single image and
   type x, z and scale from the JSON, or use the browser's "Minecraft map files…" importer instead. */
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const { parse } = require('../lib/nbt'); const { encode } = require('../lib/png');
const BASE = [null, [127, 178, 56], [247, 233, 163], [199, 199, 199], [255, 0, 0], [160, 160, 255], [167, 167, 167], [0, 124, 0], [255, 255, 255], [164, 168, 184], [151, 109, 77], [112, 112, 112], [64, 64, 255], [143, 119, 72], [255, 252, 245], [216, 127, 51], [178, 76, 216], [102, 153, 216], [229, 229, 51], [127, 204, 25], [242, 127, 165], [76, 76, 76], [153, 153, 153], [76, 127, 153], [127, 63, 178], [51, 76, 178], [102, 76, 51], [102, 127, 51], [153, 51, 51], [25, 25, 25], [250, 238, 77], [92, 219, 213], [74, 128, 255], [0, 217, 58], [129, 86, 49], [112, 2, 0], [209, 177, 161], [159, 82, 36], [149, 87, 108], [112, 108, 138], [186, 133, 36], [103, 117, 53], [160, 77, 78], [57, 41, 35], [135, 107, 98], [87, 92, 92], [122, 73, 88], [76, 62, 92], [76, 50, 35], [76, 82, 42], [142, 60, 46], [37, 22, 16], [189, 48, 49], [148, 63, 97], [92, 25, 29], [22, 126, 134], [58, 142, 140], [86, 44, 62], [20, 180, 133], [100, 100, 100], [216, 175, 147], [127, 167, 150]];
const SHADE = [180, 220, 255, 135];
function readMaps(dir) {
  const d = fs.existsSync(path.join(dir, 'data')) ? path.join(dir, 'data') : dir; const out = [];
  for (const n of fs.readdirSync(d)) { const m = /^map_(\d+)\.dat$/i.exec(n); if (!m) continue; const p = path.join(d, n); let buf = fs.readFileSync(p); if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf); const root = parse(buf).value; const x = root.data || root; if (!x.colors || x.colors.length < 16384) continue; const dim = x.dimension; if (!(dim == null || dim === 0 || dim === 'minecraft:overworld')) continue; const scale = Math.max(0, Math.min(4, x.scale | 0)); const size = 128 << scale; out.push({ id: +m[1], scale, size, x: x.xCenter - size / 2, z: x.zCenter - size / 2, colors: x.colors, mtime: fs.statSync(p).mtimeMs }); }
  return out;
}
function stitch(maps, maxSide = 8192) {
  const x1 = Math.min(...maps.map(m => m.x)), z1 = Math.min(...maps.map(m => m.z)), x2 = Math.max(...maps.map(m => m.x + m.size)), z2 = Math.max(...maps.map(m => m.z + m.size));
  let bpp = 1; while ((x2 - x1) / bpp > maxSide || (z2 - z1) / bpp > maxSide) bpp *= 2; const w = Math.ceil((x2 - x1) / bpp), h = Math.ceil((z2 - z1) / bpp); const rgba = Buffer.alloc(w * h * 4);
  for (const m of maps.slice().sort((a, b) => b.scale - a.scale || a.mtime - b.mtime || a.id - b.id)) { const px = m.size / 128; for (let oy = 0; oy < m.size / bpp; oy++) for (let ox = 0; ox < m.size / bpp; ox++) { const sx = Math.floor(ox * bpp / px), sy = Math.floor(oy * bpp / px); const id = m.colors[sy * 128 + sx] & 255; const base = BASE[id >> 2]; if (!base) continue; const X = Math.floor((m.x - x1) / bpp) + ox, Y = Math.floor((m.z - z1) / bpp) + oy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const o = (Y * w + X) * 4; const k = SHADE[id & 3] / 255; rgba[o] = base[0] * k; rgba[o + 1] = base[1] * k; rgba[o + 2] = base[2] * k; rgba[o + 3] = 255; } }
  return { x: x1, z: z1, scale: bpp, w, h, rgba };
}
if (require.main === module) {
  const args = process.argv.slice(2); const dir = args.find(a => !a.startsWith('--')); const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
  if (!dir) { console.error('usage: node os/tools/mcmaps.js <world-or-data-folder> [--out maps.png] [--max 8192] [--since YYYY-MM-DD] [--until YYYY-MM-DD]'); process.exit(2); }
  let maps = readMaps(dir); const since = opt('since') ? Date.parse(opt('since')) : null, until = opt('until') ? Date.parse(opt('until')) : null; if (since) maps = maps.filter(m => m.mtime >= since); if (until) maps = maps.filter(m => m.mtime < until);
  if (!maps.length) { console.error('no overworld map_#.dat files found'); process.exit(1); }
  const st = stitch(maps, +(opt('max') || 8192)); const out = opt('out') || 'maps.png'; fs.writeFileSync(out, encode(st.w, st.h, st.rgba)); const meta = { x: st.x, z: st.z, scale: st.scale, w: st.w, h: st.h, maps: maps.length, ids: maps.map(m => m.id).sort((a, b) => a - b), newest: new Date(Math.max(...maps.map(m => m.mtime))).toISOString() };
  fs.writeFileSync(out.replace(/\.png$/i, '') + '.json', JSON.stringify(meta, null, 2)); console.log(`${maps.length} maps → ${out} (${st.w}×${st.h}) · top-left X ${st.x} Z ${st.z} · ${st.scale} block(s) per pixel`);
}
module.exports = { readMaps, stitch };
