'use strict';
/* Minimal NBT reader (big-endian, Java edition). Long arrays are returned as
   { hi: Uint32Array, lo: Uint32Array } so block-state bit extraction can stay in
   plain Number maths. Strings are modified-UTF-8 in principle; plain UTF-8
   decoding covers every block name and property value. */
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };
function parse(buf) {
  let o = 0;
  const u8 = () => buf[o++]; const i8 = () => { const v = buf.readInt8(o); o += 1; return v; };
  const i16 = () => { const v = buf.readInt16BE(o); o += 2; return v; }; const u16 = () => { const v = buf.readUInt16BE(o); o += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(o); o += 4; return v; }; const u32 = () => { const v = buf.readUInt32BE(o); o += 4; return v; };
  const f32 = () => { const v = buf.readFloatBE(o); o += 4; return v; }; const f64 = () => { const v = buf.readDoubleBE(o); o += 8; return v; };
  const str = () => { const n = u16(); const s = buf.toString('utf8', o, o + n); o += n; return s; };
  const long = () => { const hi = u32(), lo = u32(); return hi * 4294967296 + lo; };   // exact up to 2^53, fine for timestamps and ids
  function value(type) {
    switch (type) {
      case T.BYTE: return i8(); case T.SHORT: return i16(); case T.INT: return i32(); case T.LONG: return long(); case T.FLOAT: return f32(); case T.DOUBLE: return f64();
      case T.BYTE_ARRAY: { const n = i32(); const v = buf.subarray(o, o + n); o += n; return v; }
      case T.STRING: return str();
      case T.LIST: { const t = u8(); const n = i32(); const arr = new Array(n); for (let i = 0; i < n; i++) arr[i] = value(t); arr.listType = t; return arr; }
      case T.COMPOUND: { const obj = {}; for (;;) { const t = u8(); if (t === T.END) break; const name = str(); obj[name] = value(t); } return obj; }
      case T.INT_ARRAY: { const n = i32(); const v = new Int32Array(n); for (let i = 0; i < n; i++) v[i] = i32(); return v; }
      case T.LONG_ARRAY: { const n = i32(); const hi = new Uint32Array(n), lo = new Uint32Array(n); for (let i = 0; i < n; i++) { hi[i] = u32(); lo[i] = u32(); } return { hi, lo, length: n }; }
      default: throw new Error(`NBT: unknown tag type ${type} at offset ${o - 1}`);
    }
  }
  const type = u8(); if (type !== T.COMPOUND) throw new Error(`NBT: root is tag ${type}, expected a compound`);
  const name = str(); const root = value(T.COMPOUND); return { name, value: root, bytes: o };
}
/* writer — used by the synthetic-world tests (and nothing else: the bridge never writes NBT into a world) */
function write(name, obj) {
  const parts = [];
  const push = b => parts.push(b);
  const u8 = v => push(Buffer.from([v & 255])); const i16 = v => { const b = Buffer.alloc(2); b.writeInt16BE(v); push(b); }; const i32 = v => { const b = Buffer.alloc(4); b.writeInt32BE(v); push(b); };
  const str = s => { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); push(l); push(b); };
  const typeOf = v => v && v.__tag != null ? v.__tag : typeof v === 'string' ? T.STRING : Array.isArray(v) ? T.LIST : v instanceof Int32Array ? T.INT_ARRAY : v && v.hi instanceof Uint32Array ? T.LONG_ARRAY : Buffer.isBuffer(v) ? T.BYTE_ARRAY : typeof v === 'number' ? (Number.isInteger(v) ? T.INT : T.DOUBLE) : T.COMPOUND;
  function value(type, v) {
    const raw = v && v.__tag != null ? v.value : v;
    switch (type) {
      case T.BYTE: u8(raw); break; case T.SHORT: i16(raw); break; case T.INT: i32(raw); break;
      case T.LONG: { const b = Buffer.alloc(8); b.writeUInt32BE(Math.floor(raw / 4294967296)); b.writeUInt32BE(raw >>> 0, 4); push(b); break; }
      case T.FLOAT: { const b = Buffer.alloc(4); b.writeFloatBE(raw); push(b); break; } case T.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleBE(raw); push(b); break; }
      case T.BYTE_ARRAY: i32(raw.length); push(Buffer.from(raw)); break;
      case T.STRING: str(raw); break;
      case T.LIST: { const t = raw.listType ?? (raw.length ? typeOf(raw[0]) : T.END); u8(t); i32(raw.length); for (const x of raw) value(t, x); break; }
      case T.COMPOUND: for (const [k, x] of Object.entries(raw)) { const t = typeOf(x); u8(t); str(k); value(t, x); } u8(T.END); break;
      case T.INT_ARRAY: i32(raw.length); for (const x of raw) i32(x); break;
      case T.LONG_ARRAY: i32(raw.length); for (let i = 0; i < raw.length; i++) { const b = Buffer.alloc(8); b.writeUInt32BE(raw.hi[i]); b.writeUInt32BE(raw.lo[i], 4); push(b); } break;
    }
  }
  u8(T.COMPOUND); str(name); value(T.COMPOUND, obj); return Buffer.concat(parts);
}
const tag = (t, value) => ({ __tag: t, value });
module.exports = { T, parse, write, tag };
