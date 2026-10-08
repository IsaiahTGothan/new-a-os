/* =====================================================================
   §7  ENGINES — site history · roads & junctions · transit · businesses ·
       half-year counting · data-quality issues
   ===================================================================== */
/* ---- relationships: every relation normalised to one canonical edge { pred, succ, kind, holder, rel } ---- */
function relEdges() {
  const edges = new Map();
  for (const a of S.buildings) for (const r of (a.relations || [])) {
    const t = RELATION_BY_ID[r.type]; const b = byId(r.id); if (!t || !b || b.id === a.id) continue;
    let pred = a.id, succ = b.id; if (t.dir === 'back') { pred = b.id; succ = a.id; } if (t.dir === 'both' && pred > succ) [pred, succ] = [succ, pred];
    const key = `${pred}|${succ}|${t.kind}`; if (!edges.has(key)) edges.set(key, { pred, succ, kind: t.kind, holder: a.id, rel: r });
  }
  return [...edges.values()];
}
function relIndex() {
  const idx = new Map(); const get = id => idx.get(id) || (idx.set(id, { succ: [], pred: [], same: [] }), idx.get(id));
  for (const e of relEdges()) {
    if (e.kind === 'same') { get(e.pred).same.push({ ...e, b: byId(e.succ) }); get(e.succ).same.push({ ...e, b: byId(e.pred) }); }
    else { get(e.pred).succ.push({ ...e, b: byId(e.succ) }); get(e.succ).pred.push({ ...e, b: byId(e.pred) }); }
  }
  return idx;
}
const predecessorsOf = (b, idx = relIndex()) => (idx.get(b.id)?.pred || []).map(e => e.b);
const successorsOf = (b, idx = relIndex()) => (idx.get(b.id)?.succ || []).map(e => e.b);
/* everything connected to a building through relations (bounded walk) */
function siteComponent(b, idx = relIndex()) {
  const seen = new Set([b.id]); const q = [b.id];
  while (q.length && seen.size < 80) {
    const id = q.shift(); const r = idx.get(id); if (!r) continue;
    for (const e of [...r.succ, ...r.pred, ...r.same]) if (!seen.has(e.b.id)) { seen.add(e.b.id); q.push(e.b.id); }
  }
  return [...seen].map(byId).filter(Boolean);
}
/* a set of buildings in time order, with the vacant gaps between one demolition and the next construction */
function chronology(list) {
  const sorted = list.slice().sort((a, b) => ((num(a.yearBuilt) ?? num(a.yearStarted) ?? 9999) - (num(b.yearBuilt) ?? num(b.yearStarted) ?? 9999)) || ((num(a.yearDemolished) ?? 9999) - (num(b.yearDemolished) ?? 9999)) || a.reg.localeCompare(b.reg));
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (i) { const p = sorted[i - 1]; const yd = num(p.yearDemolished), yb = num(b.yearBuilt) ?? num(b.yearStarted); if (isHist(p) && yd != null && yb != null && yb > yd) out.push({ vacant: true, from: yd, to: yb }); }
    out.push({ b });
  }
  const last = sorted[sorted.length - 1];
  if (last && isHist(last) && num(last.yearDemolished) != null && !sorted.some(isActive)) out.push({ vacant: true, from: num(last.yearDemolished), to: null });
  return out;
}
/* flags links whose dates contradict each other — the successor built before the predecessor fell */
function chronologyWarning(e) {
  if (e.kind === 'same') return null; const p = byId(e.pred), s = byId(e.succ); if (!p || !s) return null;
  const yd = num(p.yearDemolished), yb = num(s.yearBuilt) ?? num(s.yearStarted);
  if (yd != null && yb != null && yb < yd) return `Chronology: ${s.reg} is dated ${yb}, before ${p.reg} was demolished (${yd})`;
  if (!isHist(p)) return `${p.reg} is not marked demolished but has a successor`;
  return null;
}
function removeRelation(holderId, type, targetId) {
  const h = byId(holderId); if (!h) return;
  h.relations = (h.relations || []).filter(r => !(r.type === type && r.id === targetId)); h.updated = now(); commit();
}

/* ---- roads ---- */
const buildingsOnRoad = r => S.buildings.filter(b => b.roadId === r.id);
const roadLabel = r => r.name || r.reg || 'Unnamed road';
function roadJurisdictions(r) {
  const ds = new Set();
  for (const p of r.geometry || []) for (const d of S.districts) if (d.polygons?.length && pointInPolys(p, d.polygons) !== 'out') ds.add(d.id);
  if (!ds.size) for (const b of buildingsOnRoad(r)) ds.add(b.districtId);
  return [...ds].map(districtById).filter(Boolean);
}
function roadRegions(r) { const rs = new Set(); for (const p of r.geometry || []) for (const x of S.regions) if (x.polygons?.length && pointInPolys(p, x.polygons) !== 'out') rs.add(x.id); for (const d of roadJurisdictions(r)) if (d.parentId) rs.add(d.parentId); return [...rs].map(regionById).filter(Boolean); }
const roadInScope = (r, sc = UI.scope) => { if (!sc || sc.kind === 'all') return true; const ids = scopeDistrictIds(sc); if (roadJurisdictions(r).some(d => ids.has(d.id))) return true; if (sc.kind === 'region') { const reg = regionById(sc.id); if (reg?.polygons?.length && (r.geometry || []).some(p => pointInPolys(p, reg.polygons) !== 'out')) return true; } return !r.geometry?.length && !roadJurisdictions(r).length && (sc.kind === 'region'); };
/* junctions: shared ends always connect, and a road that ends on another road joins it there (a bridge's landing, a ramp)
   whatever the grades; mid-segment crossings connect only at the same grade — a bridge or tunnel passing over or under a
   street is 'separated'. An end counts as touching when it lies inside the other road's paved width (never less than 1.5 blocks). */
function roadJunctions(roads = S.roads) {
  const out = []; const bb = roads.map(r => r.geometry?.length ? bboxOf(r.geometry) : null); const halfW = r => (num(r.width) || 5) / 2;
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const A = roads[i], B = roads[j]; const ba = bb[i], bbj = bb[j]; if (!ba || !bbj) continue;
    const tol = Math.max(1.5, halfW(A) + halfW(B)); const near = (a, b) => dist2(a, b) <= tol;
    if (ba.x2 < bbj.x1 - tol || bbj.x2 < ba.x1 - tol || ba.z2 < bbj.z1 - tol || bbj.z2 < ba.z1 - tol) continue;
    const ga = A.grade || 'surface', gb = B.grade || 'surface';
    const endsA = [A.geometry[0], A.geometry[A.geometry.length - 1]], endsB = [B.geometry[0], B.geometry[B.geometry.length - 1]];
    for (const ea of endsA) for (const eb of endsB) if (near(ea, eb)) out.push({ x: (ea[0] + eb[0]) / 2, z: (ea[1] + eb[1]) / 2, a: A.id, b: B.id, kind: 'joins', ends: true });
    for (const ea of endsA) { const c = polylineClosest(ea, B.geometry); if (c && c.d <= tol && !endsB.some(eb => near(ea, eb))) out.push({ x: c.q[0], z: c.q[1], a: A.id, b: B.id, kind: 'joins', endOf: A.id, landing: ga !== gb }); }
    for (const eb of endsB) { const c = polylineClosest(eb, A.geometry); if (c && c.d <= tol && !endsA.some(ea => near(ea, eb))) out.push({ x: c.q[0], z: c.q[1], a: A.id, b: B.id, kind: 'joins', endOf: B.id, landing: ga !== gb }); }
    for (let s = 1; s < A.geometry.length; s++) for (let t = 1; t < B.geometry.length; t++) {
      const p = segIntersect(A.geometry[s - 1], A.geometry[s], B.geometry[t - 1], B.geometry[t], true); if (!p) continue;
      if ([...endsA, ...endsB].some(e => near(e, p))) continue;
      out.push({ x: p[0], z: p[1], a: A.id, b: B.id, kind: ga === gb ? 'junction' : 'separated' });
    }
  }
  return out;
}
const roadConnections = (r, js = roadJunctions()) => js.filter(j => (j.a === r.id || j.b === r.id) && j.kind !== 'separated');
/* ---- street names: a building whose street text names a road is served by that road (name beats proximity) ---- */
const STREET_ABBR = { st: 'street', str: 'street', ave: 'avenue', av: 'avenue', blvd: 'boulevard', bld: 'boulevard', pkwy: 'parkway', pky: 'parkway', rd: 'road', dr: 'drive', ln: 'lane', pl: 'place', sq: 'square', ter: 'terrace', terr: 'terrace', ct: 'court', hwy: 'highway', expy: 'expressway', brg: 'bridge', w: 'west', e: 'east', n: 'north', s: 'south', mt: 'mount', ft: 'fort', '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth' };
function normStreet(s) { return norm(String(s || '').replace(/\./g, ' ')).split(' ').filter(Boolean).map(w => STREET_ABBR[w] || w).join(' '); }
const roadNamesOf = r => [r.name, ...(r.aliases || []), ...(r.formerNames || [])].map(normStreet).filter(Boolean);
/* the street a building says it is on: the street field, or the street part of an address-shaped name ("1493 Mill Street") */
function buildingStreetText(b) { if (b.street && b.street.trim()) return b.street.trim(); const m = /^\s*\d+[a-z]?\s+(.+)$/i.exec(b.name || ''); return m ? m[1].trim() : ''; }
function roadMatchesStreet(r, streetText) { const q = normStreet(streetText); if (!q) return false; return roadNamesOf(r).includes(q); }
const roadsNamedLike = streetText => S.roads.filter(r => roadMatchesStreet(r, streetText));
/* buildings that name this road and could be linked to it: unlinked ones, and ones whose current link was itself automatic (never a link set by hand) */
function nameLinkCandidates(r) {
  const out = { link: [], manualElsewhere: [], already: [] };
  for (const b of S.buildings) { if (!isActive(b)) continue; const st = buildingStreetText(b); if (!st || !roadMatchesStreet(r, st)) continue; if (b.roadId === r.id) { out.already.push(b); continue; } if (b.roadId && roadById(b.roadId) && (b.roadIdSource || 'manual') === 'manual') { out.manualElsewhere.push(b); continue; } out.link.push(b); }
  return out;
}
/* link every candidate of a road by name; returns an undo function and what changed */
function linkByName(r, buildings = nameLinkCandidates(r).link) {
  const prev = buildings.map(b => ({ id: b.id, roadId: b.roadId ?? null, src: b.roadIdSource ?? null }));
  for (const b of buildings) { b.roadId = r.id; b.roadIdSource = 'name'; b.updated = now(); }
  const undo = () => { for (const p of prev) { const b = byId(p.id); if (!b) continue; b.roadId = p.roadId; b.roadIdSource = p.src; b.updated = now(); } };
  return { linked: buildings.length, undo };
}
/* every road at once: the bulk action in the Streets panel */
function linkAllByName() {
  const changes = []; const undos = []; let total = 0;
  for (const r of S.roads) { const c = nameLinkCandidates(r); if (!c.link.length) continue; const res = linkByName(r, c.link); undos.push(res.undo); total += res.linked; changes.push({ road: r, n: res.linked }); }
  return { total, changes, undo: () => { for (const u of undos.reverse()) u(); } };
}
/* nearest roads to a building, with the reasons — never equates proximity with an entrance; a street-name match outranks distance */
function roadSuggest(b, { limit = 4 } = {}) {
  const ent = b.entrance && b.entrance.x != null && b.entrance.z != null ? [b.entrance.x, b.entrance.z] : null;
  const pt = ent || (b.x != null && b.z != null ? [b.x, b.z] : null);
  const streetText = buildingStreetText(b); const named = streetText ? roadsNamedLike(streetText) : [];
  if (!pt) { const items = named.filter(r => r.geometry?.length >= 2).slice(0, limit).map((r, i) => ({ road: r, d: Infinity, edgeD: Infinity, q: null, flags: [], penalty: 0, current: b.roadId === r.id, nameMatch: true, kind: i === 0 ? 'best' : 'alt', corner: false })); return { pt: null, basis: 'name', items, checked: S.roads.length, streetText }; }
  const basis = ent ? 'entrance' : 'center'; const items = [];
  for (const r of S.roads) {
    if (!r.geometry || r.geometry.length < 2) continue; const c = polylineClosest(pt, r.geometry); if (!c) continue;
    const flags = []; let penalty = 0; const g = r.grade || 'surface'; const nameMatch = named.includes(r); if (nameMatch) flags.push(`named on the record (“${streetText}”)`);
    if (g === 'tunnel') { flags.push('tunnel — not reachable from the surface here'); penalty += 10000; }
    if (g === 'elevated' || g === 'bridge') { flags.push(`${(GRADE_LABEL[g] || g).toLowerCase()} — grade-separated, reachable only at its ramps or ends`); penalty += 250; }
    if (r.direction === 'restricted') { flags.push('restricted access'); penalty += 120; }
    if (r.direction === 'pedestrian') flags.push('pedestrian only');
    if (r.yearClosed != null) { flags.push(`closed ${hyLabel(r.yearClosed, r.halfClosed)}`); penalty += 600; }
    const edgeD = Math.max(0, c.d - (num(r.width) || 5) / 2);
    items.push({ road: r, d: c.d, edgeD, q: c.q, flags, penalty, current: b.roadId === r.id, nameMatch });
  }
  items.sort((a, b) => (b.nameMatch - a.nameMatch) || ((a.d + a.penalty) - (b.d + b.penalty)));
  const best = items[0]; const out = items.slice(0, limit);
  for (const it of out) { it.kind = it === best ? 'best' : 'alt'; it.corner = !!best && it !== best && it.d < best.d * 1.6 + 6 && !it.penalty && !best.nameMatch; }
  return { pt, basis: best?.nameMatch ? 'name' : basis, items: out, checked: S.roads.length, streetText };
}
function roadSuggestReason(it, basis) {
  if (it.d === Infinity) return `The record names this street (“${it.flags[0] || 'name match'}”); the building has no coordinates, so distance is unknown.`;
  const parts = [`${Math.round(it.d)} block${Math.round(it.d) === 1 ? '' : 's'} from the building ${basis === 'entrance' ? 'entrance' : 'centre'} to the centreline (${Math.round(it.edgeD)} to its edge)`];
  if (it.nameMatch) parts.unshift('the street name on the record matches this road — a name match outranks distance');
  if (basis === 'center' && !it.nameMatch) parts.push('proximity only — no entrance is recorded, so the closest point is not necessarily a usable entrance');
  if (it.corner) parts.push('corner building — this road is almost as close as the first');
  if (it.flags.length) parts.push(it.flags.join(' · '));
  return parts.join('. ') + '.';
}
/* what was checked and what was found for one road; unknown obstacles are never assumed clear */
function roadIssues(r, { roads = S.roads } = {}) {
  const out = []; const g = r.geometry || [];
  if (g.length < 2) { out.push({ level: 'bad', text: 'Needs at least two points to be a road.' }); return out; }
  if (polyDuplicateVertices(g)) out.push({ level: 'warn', text: 'Two consecutive vertices sit on the same block — a zero-length segment.' });
  for (let i = 1; i < g.length; i++) for (let j = i + 2; j < g.length; j++) if (segIntersect(g[i - 1], g[i], g[j - 1], g[j], true)) { out.push({ level: 'warn', text: `The road crosses itself (segments ${i} and ${j}).` }); i = g.length; break; }
  const others = roads.filter(o => o.id !== r.id && o.geometry?.length >= 2);
  const dup = []; for (const o of others) { let shared = 0; for (let i = 1; i < g.length; i++) { const a = polylineClosest(g[i - 1], o.geometry), b = polylineClosest(g[i], o.geometry); if (a && b && a.d <= 1 && b.d <= 1) shared++; } if (shared) dup.push(`${roadLabel(o)} (${shared} segment${shared === 1 ? '' : 's'})`); }
  if (dup.length) out.push({ level: 'warn', text: `Runs on top of ${dup.join(', ')} — duplicate geometry?` });
  const ends = [g[0], g[g.length - 1]]; let free = 0;
  for (const e of ends) { let touching = false, nearest = null; for (const o of others) { const c = polylineClosest(e, o.geometry); if (!c) continue; if (c.d <= 1.5) touching = true; if (!nearest || c.d < nearest.d) nearest = { d: c.d, o }; } if (!touching) { free++; if (nearest && nearest.d <= 6) out.push({ level: 'info', text: `An end stops ${nearest.d.toFixed(1)} blocks short of ${roadLabel(nearest.o)} — an unintended gap, or a deliberate dead end?` }); } }
  if (free) out.push({ level: 'info', text: `${free === 2 ? 'Both ends are' : 'One end is'} not connected to another mapped road.` });
  const hw = (num(r.width) || 5) / 2; const hits = [];
  for (const b of S.buildings) { if (!isActive(b)) continue; const pts = b.footprint || (b.x != null && b.z != null ? [[b.x, b.z]] : null); if (!pts) continue; let d = Infinity; for (const p of pts) { const c = polylineClosest(p, g); if (c && c.d < d) d = c.d; } if (d < hw) hits.push(`${b.reg} (${d.toFixed(1)} blk)`); }
  if (hits.length) out.push({ level: 'warn', text: `Passes within its own width of ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? '…' : ''} — judged from recorded points${S.buildings.some(b => b.footprint) ? ' and footprints' : ' only (no footprints drawn)'}.` });
  out.push({ level: 'info', text: `Checked: self-crossing, duplicate segments against ${others.length} other road${others.length === 1 ? '' : 's'}, loose ends, and ${S.buildings.filter(b => isActive(b) && b.x != null).length} buildings with coordinates. Not checked: terrain, water, or anything not on the map.`, summary: true });
  return out;
}

/* ---- transit ---- */
const lineTracks = l => (l.trackIds || []).map(trackById).filter(Boolean);
const lineRoads = l => (l.roadIds || []).map(roadById).filter(Boolean);
const lineGeometries = l => [...lineTracks(l).map(t => t.geometry), ...lineRoads(l).map(r => r.geometry)].filter(g => g && g.length >= 2);
const lineLength = l => lineGeometries(l).reduce((a, g) => a + polyLength(g), 0);
const linesAtStation = s => S.lines.filter(l => (l.stopIds || []).includes(s.id) || (s.parentId && (l.stopIds || []).includes(s.parentId)));
const stationsOf = l => (l.stopIds || []).map(stationById).filter(Boolean);
const linesOnTrack = t => S.lines.filter(l => (l.trackIds || []).includes(t.id));
const lineLabel = l => l.name || l.shortName || l.reg || 'Unnamed line';
function stationDistanceToLine(s, l) { if (s.x == null) return null; let d = Infinity; for (const g of lineGeometries(l)) { const c = polylineClosest([s.x, s.z], g); if (c && c.d < d) d = c.d; } return d === Infinity ? null : d; }
function stationDistrict(s) { if (s.districtId) return districtById(s.districtId); if (s.x == null) return null; const p = placeSuggest(s.x, s.z); return p.districts[0]?.d || null; }
const lineInScope = (l, sc = UI.scope) => { if (!sc || sc.kind === 'all') return true; const ids = scopeDistrictIds(sc); if (stationsOf(l).some(s => { const d = stationDistrict(s); return d && ids.has(d.id); })) return true; const ds = new Set(); for (const g of lineGeometries(l)) for (const p of g) for (const d of S.districts) if (d.polygons?.length && pointInPolys(p, d.polygons) !== 'out') ds.add(d.id); if ([...ds].some(id => ids.has(id))) return true; return !lineGeometries(l).length && !stationsOf(l).length; };
const stationInScope = (s, sc = UI.scope) => { if (!sc || sc.kind === 'all') return true; const d = stationDistrict(s); if (d) return scopeDistrictIds(sc).has(d.id); return linesAtStation(s).some(l => lineInScope(l, sc)) || s.x == null; };
function transitIssues() {
  const out = [];
  for (const l of S.lines) {
    if (!lineGeometries(l).length) out.push({ level: 'warn', kind: 'line', id: l.id, text: `${lineLabel(l)} has no track or road geometry — it cannot be drawn.` });
    if ((l.stopIds || []).length < 2) out.push({ level: 'info', kind: 'line', id: l.id, text: `${lineLabel(l)} has ${(l.stopIds || []).length} stop${(l.stopIds || []).length === 1 ? '' : 's'} — a service needs at least two.` });
    if (l.status === 'open' && l.yearOpened == null) out.push({ level: 'info', kind: 'line', id: l.id, text: `${lineLabel(l)} is open but has no opening date — it only appears in playback as a present-day reference.` });
    if (l.status === 'planned' && l.yearOpened != null && l.yearOpened < CURRENT_YEAR) out.push({ level: 'warn', kind: 'line', id: l.id, text: `${lineLabel(l)} is marked planned but its opening date (${l.yearOpened}) is in the past.` });
    for (const s of stationsOf(l)) { const d = stationDistanceToLine(s, l); if (d != null && d > 30) out.push({ level: 'warn', kind: 'station', id: s.id, text: `${s.name || s.reg} is ${Math.round(d)} blocks from the ${lineLabel(l)} alignment.` }); }
  }
  for (const s of S.stations) {
    if (!linesAtStation(s).length) out.push({ level: 'info', kind: 'station', id: s.id, text: `${s.name || s.reg} serves no line yet — a missing connection?` });
    if (s.x == null) out.push({ level: 'info', kind: 'station', id: s.id, text: `${s.name || s.reg} has no coordinates.` });
  }
  return out;
}
/* when a dated thing is in service at half-year i: 'open' | 'future' | 'closed' | 'undated' */
function serviceStateAt(o, i) {
  const oi = o.yearOpened != null ? hyIndex(num(o.yearOpened), o.halfOpened) : null, ci = o.yearClosed != null ? hyIndex(num(o.yearClosed), o.halfClosed) : null;
  if (oi == null) return ci != null && ci <= i ? 'closed' : 'undated';
  if (oi > i) return 'future'; if (ci != null && ci <= i) return 'closed'; return 'open';
}

/* ---- businesses ---- */
const tenancyOrder = (a, b) => (b.current - a.current) || ((num(b.yearFrom) ?? -1) - (num(a.yearFrom) ?? -1));
const tenanciesOf = z => S.tenancies.filter(t => t.businessId === z.id).sort(tenancyOrder);
const tenanciesAt = b => S.tenancies.filter(t => t.buildingId === b.id).sort(tenancyOrder);
const currentTenanciesAt = b => tenanciesAt(b).filter(t => t.current);
const bizLabel = z => z.name || z.reg || 'Unnamed business';
const periodIndex = (y, h) => y == null ? -1 : y * 2 + (h === 'L' ? 1 : 0);
const basisRank = { recorded: 0, estimated: 1, simulated: 2 };
function revenueSeries(z) { return (z.revenue || []).slice().sort((a, b) => periodIndex(a.year, a.half) - periodIndex(b.year, b.half) || (basisRank[a.basis] ?? 3) - (basisRank[b.basis] ?? 3)); }
function latestRevenue(z) { const s = revenueSeries(z); if (!s.length) return null; const last = s[s.length - 1]; const same = s.filter(r => r.year === last.year && (r.half || '') === (last.half || '')); return same.sort((a, b) => (basisRank[a.basis] ?? 3) - (basisRank[b.basis] ?? 3))[0]; }
function revenueFor(z, year, half) { return (z.revenue || []).filter(r => r.year === year && (half == null || (r.half || '') === (half || ''))).sort((a, b) => (basisRank[a.basis] ?? 3) - (basisRank[b.basis] ?? 3))[0] || null; }
const bizBuildings = z => [...new Set(tenanciesOf(z).map(t => t.buildingId))].map(byId).filter(Boolean);
function bizDistrictIds(z) { const ids = new Set(); for (const b of bizBuildings(z)) ids.add(b.districtId); for (const l of z.locations || []) if (l.districtId) ids.add(l.districtId); return ids; }
const bizInScope = (z, sc = UI.scope) => { if (!sc || sc.kind === 'all') return true; const ids = scopeDistrictIds(sc); const mine = bizDistrictIds(z); if (!mine.size) return sc.kind === 'region'; return [...mine].some(id => ids.has(id)); };
const childBusinesses = z => S.businesses.filter(x => x.parentId === z.id);
/* revenue totals for a set of businesses in one period — a branch is skipped when its parent reports the same period */
function revenueTotals(list, year, half) {
  const ids = new Set(list.map(z => z.id)); let total = 0, counted = 0, skipped = 0; const byBasis = { recorded: 0, estimated: 0, simulated: 0 };
  for (const z of list) { const r = revenueFor(z, year, half); if (!r || r.amount == null) continue; if (z.parentId && ids.has(z.parentId) && revenueFor(bizById(z.parentId), year, half)) { skipped++; continue; } total += num(r.amount) || 0; counted++; byBasis[r.basis || 'recorded'] = (byBasis[r.basis || 'recorded'] || 0) + (num(r.amount) || 0); }
  return { total, counted, skipped, byBasis };
}
const bizPeriods = list => [...new Set(list.flatMap(z => (z.revenue || []).map(r => `${r.year}|${r.half || ''}`)))].map(k => { const [y, h] = k.split('|'); return { year: +y, half: h }; }).sort((a, b) => periodIndex(b.year, b.half) - periodIndex(a.year, a.half));

/* ---- half-year counting for playback: strict, never swaps in the live registry ---- */
function hyRange(rows, { projection = false } = {}) {
  let i1 = hyIndex(CURRENT_YEAR, CURRENT_HALF);
  for (const b of rows) for (const i of [builtIndex(b), demolishedIndex(b), startedIndex(b), projection ? expectedIndex(b) : null]) if (i != null && i > i1 && i < 200) i1 = i;
  return { i0: 0, i1 };
}
function hyCounts(rows, i, opts = {}) {
  const c = { standing: 0, construction: 0, planned: 0, vacant: 0, gone: 0, undated: 0, future: 0, landmark: 0, floors: 0 };
  for (const b of rows) {
    const st = stateAtHY(b, i, opts);
    if (st === 'standing') { if (b.physical === 'vacant-lot' && isActive(b)) c.vacant++; else { c.standing++; c.floors += num(b.floors) || 0; if (b.landmark) c.landmark++; } }
    else if (st === 'construction') { if (b.physical === 'planned' && isActive(b)) c.planned++; else c.construction++; }
    else c[st]++;
  }
  return c;
}
function hyEvents(rows, i, { projection = false, scopeDistrictSet = null } = {}) {
  const ev = [];
  for (const b of rows) {
    const bi = builtIndex(b), di = demolishedIndex(b), si = startedIndex(b), ei = expectedIndex(b);
    if (si === i && (bi == null || bi > i)) ev.push({ kind: 'started', b });
    if (bi === i) ev.push({ kind: b.physical === 'vacant-lot' && isActive(b) ? 'lot' : 'built', b });
    if (di === i && isHist(b)) ev.push({ kind: 'demolished', b });
    if (projection && ei === i && bi == null && isUnderWay(b)) ev.push({ kind: 'projected', b });
  }
  const inScope = o => true;
  const SK = { opened: 'open', removed: 'close', reshaped: 'change', rebuilt: 'rebuilt' };
  for (const r of S.roads) for (const e of shapeEvents(r, 'road')) if (e.at === i) ev.push({ kind: 'road-' + SK[e.kind.split('-')[1]], o: r, note: e.note || '' });
  for (const l of S.lines) { const oi = l.yearOpened != null ? hyIndex(num(l.yearOpened), l.halfOpened) : null, ci = l.yearClosed != null ? hyIndex(num(l.yearClosed), l.halfClosed) : null, si = hyOf(l.yearStarted, l.halfStarted); if (si === i) ev.push({ kind: 'line-started', o: l }); if (oi === i) ev.push({ kind: 'line-open', o: l }); if (ci === i) ev.push({ kind: 'line-close', o: l }); for (const t of lineTracks(l)) for (const e of shapeEvents(t, 'track')) if (e.at === i && !/opened/.test(e.kind) && !(/removed/.test(e.kind) && ci === i)) ev.push({ kind: /removed/.test(e.kind) ? 'line-cut' : /rebuilt/.test(e.kind) ? 'line-rebuilt' : 'line-change', o: l, note: e.note || '' }); }
  for (const s of S.stations) { const oi = s.yearOpened != null ? hyIndex(num(s.yearOpened), s.halfOpened) : null, ci = hyOf(s.yearClosed, s.halfClosed), si = hyOf(s.yearStarted, s.halfStarted); if (si === i) ev.push({ kind: 'station-started', o: s }); if (oi === i) ev.push({ kind: 'station-open', o: s }); if (ci === i) ev.push({ kind: 'station-close', o: s }); }
  for (const z of S.businesses) { const oi = z.yearOpened != null ? hyIndex(num(z.yearOpened), z.halfOpened) : null, ci = z.yearClosed != null ? hyIndex(num(z.yearClosed), z.halfClosed) : null; if (oi === i) ev.push({ kind: 'biz-open', o: z }); if (ci === i) ev.push({ kind: 'biz-close', o: z }); }
  for (const r of S.regions) if (r.effectiveYear != null && hyIndex(num(r.effectiveYear), r.effectiveHalf) === i) ev.push({ kind: 'region', o: r });
  return ev;
}
const HY_EVENT_LABEL = { started: ['Construction started', 's'], built: ['Completed', '+'], lot: ['Lot registered', '·'], demolished: ['Demolished', '−'], projected: ['Expected completion (projection)', '?'], 'road-open': ['Road opened', 'i'], 'road-close': ['Road removed', 'i'], 'road-change': ['Road reshaped', 'i'], 'road-rebuilt': ['Road rebuilt', 'i'], 'line-started': ['Line construction started', 'i'], 'line-change': ['Line realigned', 'i'], 'line-cut': ['Line section removed', 'i'], 'line-rebuilt': ['Line section rebuilt', 'i'], 'station-started': ['Station construction started', 'i'], 'station-close': ['Station closed', 'i'], 'line-open': ['Line opened', 'i'], 'line-close': ['Line closed', 'i'], 'station-open': ['Station opened', 'i'], 'biz-open': ['Business opened', 'b'], 'biz-close': ['Business closed', 'b'], region: ['Jurisdiction change', 'i'] };

/* ---- geography validation ---- */
function polygonIssues(polys) {
  const out = [];
  (polys || []).forEach((p, i) => {
    const tag = polys.length > 1 ? ` (part ${i + 1})` : '';
    if (p.length < 3) out.push({ level: 'bad', text: `Fewer than three points${tag}.` });
    if (polyDuplicateVertices(p)) out.push({ level: 'warn', text: `Duplicate consecutive vertices${tag}.` });
    if (p.length >= 4 && polySelfIntersects(p)) out.push({ level: 'warn', text: `The border crosses itself${tag}.` });
  });
  return out;
}
/* peers that overlap: siblings under the same parent (nested parent/child borders are fine) */
function peerOverlaps(node, kind) {
  const peers = kind === 'region' ? S.regions.filter(r => r.id !== node.id && (r.parentId || null) === (node.parentId || null)) : kind === 'district' ? S.districts.filter(d => d.id !== node.id && (d.parentId || null) === (node.parentId || null)) : S.neighborhoods.filter(h => h.id !== node.id && h.districtId === node.districtId);
  const out = [];
  for (const p of peers) for (const A of node.polygons || []) for (const B of p.polygons || []) { if (A.length < 3 || B.length < 3) continue; const o = polysOverlap(A, B); if (o) { out.push({ node: p, how: o === 'cross' ? 'crosses' : o === 'A-in-B' ? 'lies inside' : 'contains' }); break; } }
  return out;
}

/* ---- data-quality issues ---- */
function buildingIssues(b) {
  const out = []; const push = (level, text, code) => out.push({ level, text, code });
  const d = districtById(b.districtId); if (!d) push('bad', 'Not attached to any borough or district.', 'district');
  const al = num(b.assessLand), at = num(b.assessTotal), ab = num(b.assessBuilding);
  if (al != null && at != null && al > at) push('bad', `Assessed land (${fmtMoneyCompact(al)}) exceeds the recorded total (${fmtMoneyCompact(at)}) — one of the two is in the wrong field. Not corrected automatically.`, 'assess');
  if (ab != null && al != null && at != null && Math.abs(ab + al - at) > Math.max(1000, at * 0.02)) push('info', `Land + building (${fmtMoneyCompact(al + ab)}) does not add up to the total (${fmtMoneyCompact(at)}).`, 'assess-sum');
  const yb = num(b.yearBuilt), yd = num(b.yearDemolished), ys = num(b.yearStarted), ye = num(b.yearExpected);
  if (isHist(b) && yd == null) push('warn', 'Demolished, but the demolition date is unknown — it cannot be placed on the timeline.', 'demo-date');
  if (yd != null && yb != null && yd < yb) push('bad', `Demolished (${yd}) before it was built (${yb}).`, 'chron');
  if (ys != null && yb != null && ys > yb) push('bad', `Construction started (${ys}) after completion (${yb}).`, 'chron');
  if (ys != null && ye != null && ye < ys) push('bad', `Expected completion (${ye}) is before the start (${ys}).`, 'chron');
  if (!isUnderWay(b) && !isHist(b) && yb != null && yb > CURRENT_YEAR) push('bad', `Marked ${physicalOf(b.physical).label.toLowerCase()} with a completion year in the future (${yb}).`, 'future');
  if (isUnderWay(b) && yb != null) push('warn', `Under way, yet it carries a completion year (${yb}). If it is finished, set the physical status to Standing; if ${yb} is the start, move it to “Started”.`, 'uw-built');
  if (isUnderWay(b) && ys == null && yb == null && ye == null) push('info', 'Project without any date — invisible in playback until a start or expected date is entered.', 'uw-undated');
  if (isActive(b) && !isUnderWay(b) && yb == null) push('info', 'No completion year — counted as undated in playback and growth charts.', 'undated');
  if (b.x == null || b.z == null) push('info', 'No coordinates — not on the map.', 'coords');
  else if (d?.polygons?.length) { const s = pointInPolys([b.x, b.z], d.polygons); if (s === 'out') { const sug = placeSuggest(b.x, b.z).districts.filter(x => x.d.id !== d.id); push('warn', `Its coordinates fall outside the ${d.name} border${sug.length ? ` — inside ${sug.map(x => x.d.name).join(' / ')}` : ''}. Nothing is moved automatically.`, 'outside'); } }
  if (b.neighborhoodId) { const h = hoodById(b.neighborhoodId); if (!h) push('warn', 'Points at a neighborhood that no longer exists.', 'hood'); else if (h.districtId !== b.districtId) push('warn', `Its neighborhood (${h.name}) belongs to another district.`, 'hood'); else if (h.polygons?.length && b.x != null && pointInPolys([b.x, b.z], h.polygons) === 'out') push('info', `Coordinates fall outside the ${h.name} border.`, 'hood-out'); }
  const lot = lotAreaOf(b); const fp = footprintAreaOf(b);
  if (num(b.lotArea) != null && num(b.lotFront) && num(b.lotDepth) && Math.abs(num(b.lotFront) * num(b.lotDepth) - num(b.lotArea)) > num(b.lotArea) * 0.1) push('info', `Lot area (${fmtInt(b.lotArea)}) does not match frontage × depth (${fmtInt(num(b.lotFront) * num(b.lotDepth))}).`, 'lot');
  if (fp != null && lot != null && fp > lot * 1.02) push('warn', `Measured footprint (${fmtInt(fp)} blk²) is larger than the lot (${fmtInt(lot)} blk²).`, 'footprint');
  if (num(b.floorArea) != null && fp != null && num(b.floors) && num(b.floorArea) > fp * num(b.floors) * 1.05) push('info', `Floor area (${fmtInt(b.floorArea)}) exceeds floors × footprint (${fmtInt(fp * num(b.floors))}).`, 'floor-area');
  if ((b.tags || []).includes('seeded') || /placeholder/i.test(b.notes || '')) push('info', 'Measurements flagged as placeholders — replace them with figures from the world.', 'placeholder');
  if ((b.market === 'for-sale' || b.market === 'for-lease') && num(b.listPrice) == null && !(b.listings || []).some(l => l.status !== 'closed')) push('info', `${marketOf(b.market).label}, but no asking price or listing is recorded.`, 'listing');
  if (b.roadId && !roadById(b.roadId)) push('bad', 'Associated with a road that no longer exists.', 'road');
  for (const r of b.relations || []) { if (!RELATION_BY_ID[r.type]) push('warn', `Unknown relation type “${r.type}”.`, 'rel'); else if (!byId(r.id)) push('warn', `A relation points at a record that no longer exists (${r.type}).`, 'rel'); }
  return out;
}
function geographyIssues() {
  const out = [];
  for (const r of S.regions) {
    if (r.placement === 'conflict') out.push({ level: 'warn', kind: 'region', id: r.id, text: `${r.name}: sources disagree about its place in the hierarchy — ${r.typeNote || 'review'}` });
    for (const i of polygonIssues(r.polygons)) out.push({ level: i.level, kind: 'region', id: r.id, text: `${r.name}: ${i.text}` });
    for (const o of peerOverlaps(r, 'region')) out.push({ level: 'warn', kind: 'region', id: r.id, text: `${r.name}'s border ${o.how} ${o.node.name} — peer regions should not overlap (a child inside its parent is fine).` });
  }
  for (const d of S.districts) {
    if (!d.parentId) out.push({ level: 'info', kind: 'district', id: d.id, text: `${d.name} is not placed under any state, city or region.` });
    for (const i of polygonIssues(d.polygons)) out.push({ level: i.level, kind: 'district', id: d.id, text: `${d.name}: ${i.text}` });
    for (const o of peerOverlaps(d, 'district')) out.push({ level: 'warn', kind: 'district', id: d.id, text: `${d.name}'s border ${o.how} ${o.node.name}.` });
    const parent = d.parentId ? regionById(d.parentId) : null;
    if (parent?.polygons?.length && d.polygons?.length) { const outside = d.polygons.flat().filter(p => pointInPolys(p, parent.polygons) === 'out').length; if (outside) out.push({ level: 'info', kind: 'district', id: d.id, text: `${outside} border vertex${outside === 1 ? '' : 'es'} of ${d.name} lie outside ${parent.name}.` }); }
  }
  for (const h of S.neighborhoods) for (const i of polygonIssues(h.polygons)) out.push({ level: i.level, kind: 'hood', id: h.id, text: `${h.name}: ${i.text}` });
  return out;
}
const LEVEL_RANK = { bad: 0, warn: 1, info: 2 };
function allIssues(sc = UI.scope) {
  const out = [];
  for (const b of scopeBuildings(sc)) for (const i of buildingIssues(b)) out.push({ ...i, kind: 'building', id: b.id, reg: b.reg, title: titleOf(b) });
  for (const r of S.roads) if (roadInScope(r, sc)) for (const i of roadIssues(r)) if (!i.summary && i.level !== 'info') out.push({ ...i, kind: 'road', id: r.id, reg: r.reg, title: roadLabel(r) });
  for (const i of transitIssues()) { const o = i.kind === 'line' ? lineById(i.id) : stationById(i.id); if (!o) continue; if (i.kind === 'line' ? !lineInScope(o, sc) : !stationInScope(o, sc)) continue; out.push({ ...i, reg: o.reg, title: i.kind === 'line' ? lineLabel(o) : (o.name || o.reg) }); }
  for (const i of geographyIssues()) { const node = i.kind === 'region' ? regionById(i.id) : i.kind === 'district' ? districtById(i.id) : hoodById(i.id); out.push({ ...i, reg: node?.code || '', title: node?.name || '' }); }
  if (typeof civicIssues === 'function') for (const i of civicIssues(sc)) out.push(i);
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

/* ---- lots: frontage runs along X unless the lot is rotated; snapping to the serving road sets the side and the orientation ---- */
function lotRect(b) { const fr = num(b.lotFront), dp = num(b.lotDepth); if (!fr || !dp || b.x == null || b.z == null) return null; const w = b.lotRotated ? dp : fr, h = b.lotRotated ? fr : dp; return { x1: b.x - w / 2, z1: b.z - h / 2, x2: b.x + w / 2, z2: b.z + h / 2, w, h }; }
function snapToStreet(b, road = null) {
  const r = road || roadById(b.roadId) || roadSuggest(b).items.find(it => it.road.geometry?.length >= 2)?.road; if (!r || !r.geometry || r.geometry.length < 2 || b.x == null || b.z == null) return null;
  const c = polylineClosest([b.x, b.z], r.geometry); if (!c) return null; const a = r.geometry[c.i], e = r.geometry[c.i + 1]; const dx = e[0] - a[0], dz = e[1] - a[1]; const len = Math.hypot(dx, dz) || 1; const ux = dx / len, uz = dz / len;
  const alongX = Math.abs(ux) >= Math.abs(uz); const dp = num(b.lotDepth) || num(b.lotFront) || 20;
  const side = Math.sign((b.x - c.q[0]) * -uz + (b.z - c.q[1]) * ux) || 1; const off = (num(r.width) || 5) / 2 + 1 + dp / 2;
  return { x: Math.round(c.q[0] - uz * side * off), z: Math.round(c.q[1] + ux * side * off), lotRotated: !alongX, road: r, d: c.d };
}
