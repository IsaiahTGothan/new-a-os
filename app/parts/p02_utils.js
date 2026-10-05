/* =====================================================================
   §2  UTILITIES — dom · format · dates (half-years) · geometry · fuzzy
   ===================================================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const now = () => new Date().toISOString();
const uid = (p = 'b') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const sum = (arr, f) => arr.reduce((a, x) => a + (num(f(x)) || 0), 0);
const median = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || uid('d');
const fmtInt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const fmtMoney = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const fmtCompact = n => {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(0) + 'K';
  return Math.round(n).toLocaleString('en-US');
};
const fmtMoneyCompact = n => n == null ? '—' : '$' + fmtCompact(n);
const fmtCur = (n, cur = 'USD') => n == null ? '—' : (cur === 'EMR' ? '◆' : '$') + Math.round(n).toLocaleString('en-US');
const fmtCurCompact = (n, cur = 'USD') => n == null ? '—' : (cur === 'EMR' ? '◆' : '$') + fmtCompact(n);
const fmtDate = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
const fmtDay = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; } };
const fmtTime = d => d.toLocaleTimeString('en-US', { hour12: false });
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOn = () => S?.settings?.motion !== false && !prefersReducedMotion();
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const addressOf = b => [b.number, b.street].filter(Boolean).join(' ').trim();
const titleOf = b => addressOf(b) || b.name || b.reg;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const truncate = (s, n) => s && s.length > n ? s.slice(0, n - 1) + '…' : s || '';
const hexA = (hex, a) => { if (!hex || hex[0] !== '#') return hex; const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1); const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

/* ---- lifecycle helpers (physical status is authoritative; `status` is the legacy summary) ---- */
const isHist = b => (b.physical || b.status) === 'demolished';           // a historical record
const isActive = b => !isHist(b);                                        // part of the present-day city
const isCompleted = b => ['standing', 'closed'].includes(b.physical || 'standing') && !isHist(b);
const isUnderWay = b => ['construction', 'planned'].includes(b.physical);
const isHistReg = reg => /^H-/i.test(reg || '');
const lifespanOf = b => { const yb = num(b.yearBuilt), yd = num(b.yearDemolished); return yb != null && yd != null && yd >= yb ? yd - yb : null; };
const ageOf = b => { const yb = num(b.yearBuilt); return yb != null ? Math.max(0, CURRENT_YEAR - yb) : null; };
const fmtYr = (y, approx) => y == null || y === '' ? '—' : (approx ? 'c. ' : '') + y;
/* half-year dates: year + 'E' | 'L' | '' (unknown half) */
const halfLabel = h => h === 'E' ? 'Early' : h === 'L' ? 'Late' : '';
const hyLabel = (y, h, approx) => y == null || y === '' ? '—' : `${approx ? 'c. ' : ''}${h ? halfLabel(h) + ' ' : ''}${y}`;
const hyShort = (y, h, approx) => y == null || y === '' ? '—' : `${approx ? '~' : ''}${h ? h + ' ' : ''}${y}`;
const hyIndex = (y, h) => y == null ? null : (y - FOUNDED_YEAR) * 2 + (h === 'L' ? 1 : 0);   // unknown half renders at the start of the year (not stored)
const hyFromIndex = i => ({ year: FOUNDED_YEAR + Math.floor(i / 2), half: i % 2 ? 'L' : 'E' });
const hyKey = (y, h) => `${y}${h || ''}`;
const builtHTML = b => hyLabel(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox);
const demoHTML = b => hyLabel(b.yearDemolished, b.halfDemolished, b.yearDemolishedApprox);
const startedHTML = b => hyLabel(b.yearStarted, b.halfStarted, b.yearStartedApprox);
const expectedHTML = b => hyLabel(b.yearExpected, b.halfExpected, b.yearExpectedApprox);
const spanHTML = b => `${isUnderWay(b) && b.yearBuilt == null ? (b.yearStarted != null ? 'started ' + startedHTML(b) : (b.yearExpected != null ? 'expected ' + expectedHTML(b) : 'undated')) : builtHTML(b)} – ${isHist(b) ? demoHTML(b) : 'present'}`;
const yearsLabel = n => n == null ? '—' : n === 1 ? '1 year' : `${n} years`;
const confOf = id => CONFIDENCE.find(c => c.id === id) || null;
const confHTML = (id, verified) => { const c = confOf(id); return `${c ? `<span class="conf ${c.id}" title="${esc(c.hint)}"><i></i>${c.label}</span>` : `<span class="conf" title="No confidence level set"><i></i>unassessed</span>`}${verified ? ` <span class="conf verified" title="Marked verified">✓ verified</span>` : ''}`; };
/* Parse any registration number → { code, n, hist?, parcel?, series } or null */
function parseReg(reg) {
  let m; reg = String(reg || '').trim();
  if ((m = /^H-([A-Z0-9]+)-(\d+)$/i.exec(reg))) return { code: m[1].toUpperCase(), n: +m[2], hist: true, series: 'hist' };
  if ((m = /^([A-Z0-9]+)-P-(\d+)$/i.exec(reg))) return { code: m[1].toUpperCase(), n: +m[2], parcel: true, series: 'parcel' };
  if ((m = /^(RD|TL|ST|BZ|TR)-(\d+)$/i.exec(reg))) return { code: m[1].toUpperCase(), n: +m[2], series: m[1].toLowerCase() };
  if ((m = /^([A-Z0-9]+)-(\d+)$/i.exec(reg))) return { code: m[1].toUpperCase(), n: +m[2], series: 'current' };
  return null;
}
/* legacy single-status summary derived from the three independent statuses */
function summaryStatus(b) {
  const p = b.physical || 'standing';
  if (p === 'demolished') return 'demolished';
  if (p === 'construction' || p === 'planned') return 'construction';
  if (p === 'vacant-lot') return 'vacant';
  if (b.market === 'for-sale' || b.market === 'for-lease') return 'for-sale';
  if (b.market === 'sold' || b.market === 'leased') return 'sold';
  if (b.landmark) return 'landmark';
  return 'standing';
}

/* ---- geometry (Minecraft X/Z world units; arrays are [x, z]) ---- */
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyLength = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist2(pts[i - 1], pts[i]); return L; };
/* blocks a staircase path would need (Chebyshev steps): diagonals cost one block per step */
const blockSteps = pts => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.max(Math.abs(pts[i][0] - pts[i - 1][0]), Math.abs(pts[i][1] - pts[i - 1][1])); return Math.round(n); };
const bboxOf = pts => { let x1 = Infinity, z1 = Infinity, x2 = -Infinity, z2 = -Infinity; for (const [x, z] of pts) { if (x < x1) x1 = x; if (z < z1) z1 = z; if (x > x2) x2 = x; if (z > z2) z2 = z; } return x1 === Infinity ? null : { x1, z1, x2, z2 }; };
const bboxOfPolys = polys => bboxOf(polys.flat());
const polyArea = pts => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; };
const polysArea = polys => polys.reduce((a, p) => a + polyArea(p), 0);
const centroidOf = pts => { if (!pts.length) return null; let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
/* a point-in-polygon with an explicit "on the boundary" answer: 'in' | 'on' | 'out' */
function pointInPoly(pt, poly) {
  const [x, z] = pt; let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (segDist(pt, poly[i], poly[j]) < 1e-6) return 'on';
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside ? 'in' : 'out';
}
const pointInPolys = (pt, polys) => { let r = 'out'; for (const p of polys || []) { if (p.length < 3) continue; const s = pointInPoly(pt, p); if (s === 'in') return 'in'; if (s === 'on') r = 'on'; } return r; };
/* distance from a point to a segment, plus the closest point and its parameter t */
function segClosest(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz;
  const t = L2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2, 0, 1) : 0;
  const q = [a[0] + t * dx, a[1] + t * dz]; return { q, t, d: dist2(p, q) };
}
const segDist = (p, a, b) => segClosest(p, a, b).d;
/* closest point along a polyline: { d, q, i (segment index), t } */
function polylineClosest(p, pts) {
  let best = null; for (let i = 1; i < pts.length; i++) { const c = segClosest(p, pts[i - 1], pts[i]); if (!best || c.d < best.d) best = { ...c, i: i - 1 }; } return best;
}
/* proper segment intersection (excluding shared endpoints when `strict`) → point or null */
function segIntersect(a, b, c, d, strict = false) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  const eps = strict ? 1e-6 : -1e-9;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) { if (strict) return null; if (t < 0 || t > 1 || u < 0 || u > 1) return null; }
  return [a[0] + t * r[0], a[1] + t * r[1]];
}
/* does a polygon cross itself? (ignores adjacent edges) */
function polySelfIntersects(pts) {
  const n = pts.length; if (n < 4) return false;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n], true)) return true; }
  return false;
}
const polyDuplicateVertices = pts => pts.some((p, i) => i && dist2(p, pts[i - 1]) < 0.5);
/* do two polygons overlap (edge crossing or containment)? */
function polysOverlap(A, B) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segIntersect(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length], true)) return 'cross';
  if (pointInPoly(A[0], B) === 'in') return 'A-in-B'; if (pointInPoly(B[0], A) === 'in') return 'B-in-A'; return null;
}
/* Douglas–Peucker simplification for freehand strokes */
function simplifyPath(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [a, b] = stack.pop(); let maxD = 0, idx = -1; for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > maxD) { maxD = d; idx = i; } } if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const roundPt = p => [Math.round(p[0]), Math.round(p[1])];
const rectToPoly = b => b && [b.x1, b.z1, b.x2, b.z2].every(v => v != null) ? [[b.x1, b.z1], [b.x2, b.z1], [b.x2, b.z2], [b.x1, b.z2]] : null;
/* constrain a segment end to 45° increments from its start (shift-drawing) */
function snap45(a, p) { const dx = p[0] - a[0], dz = p[1] - a[1]; const ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4); const L = Math.hypot(dx, dz); return [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L]; }

/* ---- fuzzy text (search with typo tolerance) ---- */
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i); let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) { cur[0] = i; let rowMin = cur[0]; for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); rowMin = Math.min(rowMin, cur[j]); } if (rowMin > max) return max + 1; [prev[0], cur[0]] = [cur[0], prev[0]]; for (let j = 0; j <= b.length; j++) prev[j] = cur[j]; }
  return prev[b.length];
}
/* score 0..1 of how well `q` matches `text` (exact > prefix > token prefix > fuzzy) */
function fuzzyScore(q, text) {
  q = norm(q); const t = norm(text); if (!q || !t) return 0;
  if (t === q) return 1; if (t.startsWith(q)) return 0.9; if (t.includes(q)) return 0.75;
  const qt = q.split(' '), tt = t.split(' '); let hit = 0;
  for (const a of qt) { if (tt.some(w => w.startsWith(a))) { hit++; continue; } if (a.length >= 4 && tt.some(w => editDistance(a, w, a.length >= 7 ? 2 : 1) <= (a.length >= 7 ? 2 : 1))) hit += 0.7; }
  return hit ? 0.3 + 0.4 * (hit / qt.length) : 0;
}
