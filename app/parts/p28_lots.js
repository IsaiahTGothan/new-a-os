/* =====================================================================
   §28 LOTS — a lot can be any shape: draw its outline on the map and the
       area, frontage and depth are worked out and filled in. Frontage is
       the length of the lot's edges that face its street; depth is the
       mean depth (area ÷ frontage). Typed values still win when marked.
   ===================================================================== */
const LOT_FRONT_TOL = 4;          // an edge counts as street frontage when it runs within road half-width + 4 blocks of the road
/* oriented minimum-area rectangle of a polygon (rotating calipers over hull edges) → { w, h, angle } */
function minAreaRect(poly) {
  const pts = convexHull(poly); if (pts.length < 3) return null; let best = null;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue; const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; let mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity; for (const p of pts) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; mnU = Math.min(mnU, u); mxU = Math.max(mxU, u); mnV = Math.min(mnV, v); mxV = Math.max(mxV, v); } const w = mxU - mnU, h = mxV - mnV; if (!best || w * h < best.w * best.h) best = { w, h, ux, uz }; }
  return best;
}
function convexHull(points) { const p = points.map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const x of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], x) <= 0) lo.pop(); lo.push(x); } for (const x of p.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], x) <= 0) up.pop(); up.push(x); } return [...lo.slice(0, -1), ...up.slice(0, -1)]; }
/* measure a lot outline: area, frontage on its street(s), mean depth, sides, corner lot */
function lotMetrics(b, poly = b.lot) {
  if (!Array.isArray(poly) || poly.length < 3) return null; const area = Math.round(polyArea(poly)); const n = poly.length;
  const roads = (() => { const own = roadById(b.roadId); const cand = S.roads.filter(r => (r.geometry || []).length >= 2); return own ? [own, ...cand.filter(r => r.id !== own.id)] : cand; })();
  const edges = []; for (let i = 0; i < n; i++) { const a = poly[i], c = poly[(i + 1) % n]; const len = dist2(a, c); if (!len) continue; const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; let hit = null; for (const r of roads) { const q = polylineClosest(mid, r.geometry); if (!q) continue; const tol = (num(r.width) || 5) / 2 + LOT_FRONT_TOL; if (q.d > tol) continue; const s0 = r.geometry[q.i], s1 = r.geometry[q.i + 1] || s0; const sl = dist2(s0, s1) || 1; const cos = Math.abs(((c[0] - a[0]) * (s1[0] - s0[0]) + (c[1] - a[1]) * (s1[1] - s0[1])) / (len * sl)); if (cos < 0.7) continue; if (!hit || q.d < hit.d) hit = { road: r, d: q.d }; } edges.push({ i, len, mid, road: hit?.road || null }); }
  const front = edges.filter(e => e.road); const byRoad = new Map(); for (const e of front) byRoad.set(e.road.id, (byRoad.get(e.road.id) || 0) + e.len);
  let frontage, basis, mainRoad = null;
  if (byRoad.size) { const [rid, len] = [...byRoad.entries()].sort((a, b) => b[1] - a[1])[0]; frontage = len; mainRoad = roadById(rid); basis = `edges facing ${roadLabel(mainRoad)}`; }
  else { const nearest = roads.map(r => { const best = edges.map(e => ({ e, q: polylineClosest(e.mid, r.geometry) })).filter(x => x.q).sort((x, y) => x.q.d - y.q.d)[0]; return best ? { r, ...best } : null; }).filter(Boolean).sort((x, y) => x.q.d - y.q.d)[0];
    if (nearest && nearest.q.d <= 60) { frontage = nearest.e.len; mainRoad = nearest.r; basis = `edge nearest ${roadLabel(nearest.r)} (${Math.round(nearest.q.d)} blk away)`; }
    else { const r = minAreaRect(poly); frontage = r ? Math.min(r.w, r.h) : Math.sqrt(area); basis = 'shorter side of the lot (no street nearby)'; } }
  frontage = Math.max(1, Math.round(frontage)); const depth = Math.max(1, Math.round(area / frontage));
  const rect = minAreaRect(poly); const regular = rect ? Math.abs(rect.w * rect.h - area) / area < 0.03 && n === 4 : false;
  return { area, frontage, depth, sides: n, corner: byRoad.size > 1, roads: [...byRoad.keys()].map(roadById).filter(Boolean), mainRoad, basis, shape: regular ? 'rectangular' : n === 3 ? 'triangular' : 'irregular', perimeter: Math.round(edges.reduce((a, e) => a + e.len, 0)) };
}
/* fill the lot fields from the drawn outline; returns the metrics */
function applyLotMetrics(b) { const m = lotMetrics(b); if (!m) return null; b.lotArea = m.area; b.lotFront = m.frontage; b.lotDepth = m.depth; b.lotSource = 'drawn'; b.lotRotated = false; b.updated = now(); return m; }
const lotOutline = b => Array.isArray(b.lot) && b.lot.length >= 3 ? b.lot : null;
/* the lot to draw: the drawn outline, else the frontage × depth rectangle */
function lotShape(b) { const o = lotOutline(b); if (o) return { poly: o, drawn: true }; const r = lotRect(b); return r ? { poly: [[r.x1, r.z1], [r.x2, r.z1], [r.x2, r.z2], [r.x1, r.z2]], drawn: false } : null; }
function lotSectionHTML(b) {
  const m = lotOutline(b) ? lotMetrics(b) : null; if (!m) return '';
  return `<div class="lotinfo"><span class="mk ${m.shape === 'irregular' ? 'info' : 'muted'}">${m.shape.toUpperCase()}</span> ${m.sides} sides · <b>${fmtInt(m.area)}</b> blk² · frontage <b>${m.frontage}</b>${m.corner ? ' <span class="mk road">CORNER</span>' : ''} · depth ≈ <b>${m.depth}</b><div class="desc-line">${esc(m.basis)}${m.roads.length > 1 ? ' · also faces ' + m.roads.slice(1).map(r => esc(roadLabel(r))).join(', ') : ''}</div></div>`;
}
/* draw a lot for a building on the map, then come back */
function startLotDraw(buildingId, { draft = null } = {}) {
  const b = byId(buildingId) || draft; if (!b) return;
  const resume = draft ? (() => { const stack = { ...DR }; return () => { Object.assign(DR, stack); DR.draft = draft; renderDrawer(); showDrawer(); }; })() : () => { MAPW.sel = { kind: 'building', id: buildingId }; renderDock(); };
  if (draft) { $('#drawer').classList.remove('on'); $('#backdrop').classList.remove('on'); }
  if (UI.nav !== 'map') setNav('map');
  const go = () => { if (!MAPW.edit) setMapEdit(true, { keepMode: true }); UI.layers.lots = true; MAPW.pending = { kind: 'lot', buildingId: b.id, label: `Trace the lot of ${b.reg || 'the new building'} — any shape; click the first point or Enter to close`, resume }; setMapMode('footprint', { pending: MAPW.pending }); if (b.x != null) { MAPW.cam.x = b.x; MAPW.cam.z = b.z; if (MAPW.cam.k < 3) MAPW.cam.k = 4; } mapDraw(); };
  if (MAPW.mounted) go(); else setTimeout(go, 40);
}
function finishLotDraft(pts) {
  const pend = MAPW.pending; const editing = DR.draft?.id === pend.buildingId && DR.mode === 'edit'; const b = editing ? DR.draft : (byId(pend.buildingId) || (DR.draft?.id === pend.buildingId ? DR.draft : null)); if (!b) return;
  const live = !editing && !!byId(pend.buildingId); if (live) mapPushUndo(); const was = { lotArea: b.lotArea, lotFront: b.lotFront, lotDepth: b.lotDepth };
  b.lot = pts.slice(); const m = applyLotMetrics(b); if (b.x == null || pointInPoly([b.x, b.z], b.lot) === 'out') { const c = centroidOf(b.lot); b.x = Math.round(c[0]); b.z = Math.round(c[1]); }
  if (live) commit();
  toast(`Lot saved · ${m.shape} · ${fmtInt(m.area)} blk² · frontage ${m.frontage} · depth ≈ ${m.depth}${was.lotArea != null && was.lotArea !== m.area ? ` (was ${fmtInt(was.lotArea)} blk²)` : ''}`, 'good');
}
