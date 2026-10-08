/* =====================================================================
   §3  STATE — schema 3, factories, migrations, scope, serialisation, import
   ===================================================================== */
let S = null;                 // persisted state
const UI = {                  // transient UI state
  nav: 'overview', scope: { kind: 'region', id: 'new-a-city' }, view: 'table', q: '', sort: { key: 'reg', dir: 1 },
  filters: { physical: '', market: '', landmark: false, family: '', zfam: '', hood: '', district: '', yearMin: '', yearMax: '', photo: false, hist: false },
  selected: null, animateRows: true,
  layers: { regions: true, districts: true, hoods: true, roads: true, transit: true, stations: true, buildings: true, businesses: false, labels: true, grid: false, historical: false, footprints: true, lots: true, trains: true },
  mapColor: 'district',
  hseg: 'playback', hsort: { key: 'yearDemolished', dir: -1 }, hf: { district: '', hood: '', builtMin: '', builtMax: '', demoMin: '', demoMax: '', conf: '' },
  tseg: 'lines', bseg: 'list', bf: { category: '', status: '', district: '' }, bsort: { key: 'name', dir: 1 },
  palette: { open: false, q: '', items: [], active: 0 },
};
const MIGRATION = { pre: null, report: null };

function emptyState() {
  return {
    schema: APP.schema, app: APP.name,
    meta: { created: now(), updated: now(), seq: {}, hseq: {}, pseq: {}, gseq: { RD: 0, TL: 0, ST: 0, BZ: 0, TR: 0, GV: 0, PJ: 0 }, lastSnapshot: 0, migrations: [] },
    regions: [], districts: [], neighborhoods: [], buildings: [], archive: [],
    roads: [], tracks: [], lines: [], stations: [], businesses: [], tenancies: [], officials: [], projects: [],
    sandbox: { stations: [], roads: [] }, world: { snapshots: [], scans: [], proposals: [], backups: { history: [], schedule: { afterSession: true, monthlyFull: true, mirror: '', retain: 30 }, lastVerified: null, lastRestoreTest: null } },
    news: { items: [], decisions: {}, log: [], drafts: [], lastSync: null, lastError: null, rules: { landmark: false, listing: false, groundbreaking: false } },
    legacy: { parcels: [], parcelLinks: [], notes: [] },
    settings: { scanlines: true, boot: true, motion: true, density: 'comfortable', basemaps: [], lastNav: 'overview', lastScope: { kind: 'region', id: 'new-a-city' }, view: 'table', columns: {}, fabricYear: 2016, tlSpeed: 1, compatFile: true, ai: { enabled: false, provider: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-5-5' }, newsAuto: false, newsRefreshMin: 0, valuation: { ...VALUATION_DEFAULTS }, transitCost: { ...TRANSIT_COST_DEFAULTS }, publishing: { autoDraftDigest: false, publicNotes: false } },
  };
}

/* ---- factories ---- */
const codeOf = (st, districtId) => st.districts.find(x => x.id === districtId)?.code || 'XX';
function nextReg(st, districtId) { st.meta.seq[districtId] = (st.meta.seq[districtId] || 0) + 1; return `${codeOf(st, districtId)}-${String(st.meta.seq[districtId]).padStart(4, '0')}`; }
function nextHistReg(st, districtId) { st.meta.hseq ??= {}; st.meta.hseq[districtId] = (st.meta.hseq[districtId] || 0) + 1; return `H-${codeOf(st, districtId)}-${String(st.meta.hseq[districtId]).padStart(4, '0')}`; }
function nextGlobal(st, prefix) { st.meta.gseq ??= {}; st.meta.gseq[prefix] = (st.meta.gseq[prefix] || 0) + 1; return `${prefix}-${String(st.meta.gseq[prefix]).padStart(4, '0')}`; }
function newHood(districtId, name) { return { id: uid('h'), districtId, name, polygons: [], bounds: null, boundaryText: '', notes: '', created: now() }; }
function newDistrict(name, code, parentId, slot) { return { id: slug(name), code, name, slot, type: 'district', parentId: parentId || null, founded: '', tagline: '', polygons: [], bounds: null, placement: 'verified', notes: '', core: false, created: now() }; }
function newRegion(name, type, parentId, code) { return { id: slug(name), type: type || 'region', name, code: code || '', parentId: parentId || null, slot: null, founded: '', tagline: '', polygons: [], placement: 'verified', typeNote: '', source: '', sourceUrl: '', effectiveYear: null, effectiveHalf: '', notes: '', created: now(), updated: now() }; }
function newBuilding(st, districtId) {
  return {
    id: uid('b'), reg: nextReg(st, districtId), districtId, neighborhoodId: null,
    name: '', number: '', street: '', bldgClass: '', taxClass: '', zoning: '', overlay: '', special: '',
    yearBuilt: null, yearAltered: null, lotFront: null, lotDepth: null, lotArea: null, floors: null, height: null,
    unitsRes: null, unitsCom: null, assessLand: null, assessTotal: null, listPrice: null, status: 'standing', owner: '',
    x: null, z: null, tags: [], notes: '', image: false, created: now(), updated: now(),
    // v2 · history & evidence
    yearDemolished: null, yearBuiltApprox: false, yearDemolishedApprox: false, demolitionReason: '', significance: '', historyNotes: '',
    relations: [], formerRegs: [], source: '', sourceType: '', confidence: '', verified: false,
    // v2.5 · lifecycle, statuses, land, value, access
    physical: 'standing', market: '', landmark: false, legacyStatus: null,
    halfBuilt: '', halfDemolished: '', halfAltered: '', yearStarted: null, halfStarted: '', yearStartedApprox: false, yearExpected: null, halfExpected: '', yearExpectedApprox: false,
    dateBuilt: '', dateDemolished: '', dateStarted: '',
    roadId: null, roadIdSource: null, entrance: null, footprint: null, floorArea: null, assessBuilding: null, assessYear: null, valuationBasis: '',
    listings: [], transactions: [], migrationNotes: [],
    // v3 · civic, condition, publishing, valuation
    civic: null, condition: '', public: true, valuation: null, valuations: [], valuationOverride: null, unnamed: false, lotRotated: false,
  };
}
function newOfficial(st) { return { id: uid('g'), reg: nextGlobal(st, 'GV'), name: '', office: '', jurisdictionId: 'new-a-city', party: '', status: 'serving', termFromYear: null, termFromHalf: '', termToYear: null, termToHalf: '', officeBuildingId: null, residenceBuildingId: null, notes: '', source: '', created: now(), updated: now() }; }
function newProject(st) { return { id: uid('p'), reg: nextGlobal(st, 'PJ'), name: '', stage: 'idea', districtId: null, buildingIds: [], roadIds: [], lineIds: [], startedYear: null, startedHalf: '', targetYear: null, targetHalf: '', notes: '', log: [], archiveIds: [], created: now(), updated: now() }; }
function newRoad(st) { return { id: uid('r'), reg: nextGlobal(st, 'RD'), name: '', aliases: [], formerNames: [], type: 'street', grade: 'surface', width: 5, direction: 'two-way', surface: '', yearOpened: null, halfOpened: '', yearOpenedApprox: false, yearClosed: null, halfClosed: '', geometry: [], versions: [], geometryFromYear: null, geometryFromHalf: '', unnamed: false, oneWayDir: 1, notes: '', source: '', sourceType: '', confidence: '', verified: false, created: now(), updated: now() }; }
function newTrack(st, mode = 'subway') { return { id: uid('k'), reg: nextGlobal(st, 'TR'), name: '', mode, grade: 'surface', geometry: [], versions: [], geometryFromYear: null, geometryFromHalf: '', yearOpened: null, halfOpened: '', yearClosed: null, halfClosed: '', notes: '', created: now(), updated: now() }; }
function newLine(st) { return { id: uid('l'), reg: nextGlobal(st, 'TL'), name: '', shortName: '', mode: 'subway', color: TRANSIT_COLORS[(st.lines?.length || 0) % TRANSIT_COLORS.length], width: 4, style: 'solid', status: 'open', operator: '', hours: '', hoursFrom: null, hoursTo: null, yearOpened: null, halfOpened: '', yearOpenedApprox: false, yearClosed: null, halfClosed: '', yearStarted: null, halfStarted: '', yearExpected: null, halfExpected: '', costEstimate: null, costActual: null, trackIds: [], roadIds: [], stopIds: [], service: null, segments: [], unnamed: false, notes: '', source: '', sourceType: '', confidence: '', verified: false, created: now(), updated: now() }; }
function newStation(st) { return { id: uid('s'), reg: nextGlobal(st, 'ST'), name: '', aliases: [], kind: 'station', x: null, z: null, buildingId: null, parentId: null, districtId: null, status: 'open', grade: '', hours: '', hoursFrom: null, hoursTo: null, transferIds: [], yearOpened: null, halfOpened: '', yearClosed: null, halfClosed: '', yearStarted: null, halfStarted: '', yearExpected: null, halfExpected: '', costEstimate: null, costActual: null, notes: '', source: '', confidence: '', created: now(), updated: now() }; }
function newBusiness(st) { return { id: uid('z'), reg: nextGlobal(st, 'BZ'), name: '', aliases: [], category: '', orgType: 'company', parentId: null, status: 'open', yearOpened: null, halfOpened: '', yearOpenedApprox: false, yearClosed: null, halfClosed: '', website: '', ticker: '', exchangeListed: false, exchangeSince: null, sector: '', locations: [], revenue: [], listings: [], marketQuotes: [], notes: '', source: '', sourceType: '', confidence: '', verified: false, tags: [], image: false, created: now(), updated: now() }; }
function newTenancy(businessId, buildingId, role = 'tenant') { return { id: uid('t'), businessId, buildingId, role, unit: '', yearFrom: null, halfFrom: '', yearTo: null, halfTo: '', current: true, notes: '', created: now() }; }
function newArchiveEntry(year, districtId) { return { id: uid('a'), year: year ?? CURRENT_YEAR, month: null, districtId: districtId || null, neighborhoodId: null, title: '', description: '', source: '', sourceType: 'screenshot', confidence: 'confirmed', tags: [], image: false, created: now(), updated: now() }; }

/* ---- fresh install seed (only when no store exists) ---- */
const SEED_BUILDINGS = [
  { name: 'One World Trade Center', district: 'man-a',  hood: 'Lower Man A',    number: '1',   street: 'World Trade Center', cls: 'O4', zoning: 'C5-5', year: 2018, floors: 78, height: 260, landmark: true },
  { name: '111 W 57th',             district: 'man-a',  hood: 'Midtown Man A',  number: '111', street: 'W 57th St',          cls: 'D8', zoning: 'C5-3', year: 2019, floors: 74, height: 248 },
  { name: '432 Park Avenue',        district: 'man-a',  hood: 'Midtown Man A',  number: '432', street: 'Park Ave',           cls: 'R4', zoning: 'C5-3', year: 2019, floors: 72, height: 240 },
  { name: 'Empire State Building',  district: 'man-a',  hood: 'Midtown Man A',  number: '350', street: '5th Ave',            cls: 'O4', zoning: 'C5-3', year: 2020, floors: 70, height: 236, landmark: true },
  { name: '270 Park Avenue',        district: 'man-a',  hood: 'Midtown Man A',  number: '270', street: 'Park Ave',           cls: 'O4', zoning: 'C5-3', year: 2025, floors: 64, height: 214 },
  { name: 'Bank of America Tower',  district: 'man-a',  hood: 'Central Man A',  number: '',    street: '',                   cls: 'O4', zoning: 'C6-6', year: 2018, floors: 60, height: 200 },
  { name: 'H&M Tower',              district: 'man-a',  hood: 'Central Man A',  number: '',    street: '',                   cls: 'O4', zoning: 'C6-6', year: 2018, floors: 56, height: 188 },
  { name: 'Silvernine Tower',       district: 'man-a',  hood: 'Lower Man A',    number: '',    street: '',                   cls: 'O4', zoning: 'C5-5', year: 2018, floors: 52, height: 176 },
  { name: 'New BK Tower',           district: 'new-bk', hood: 'Downtown New BK', number: '',   street: '',                   cls: 'O4', zoning: 'C6-4', year: 2024, floors: 48, height: 162 },
  { name: 'One Man A Square',       district: 'man-a',  hood: 'Two Bridges',    number: '1',   street: 'Man A Square',       cls: 'D8', zoning: 'C6-4', year: 2023, floors: 44, height: 150 },
];
const SEED_HOODS_V = 0;
const SEED_HOODS = { 'man-a': ['Lower Man A', 'Central Man A', 'Midtown Man A', 'Two Bridges'], 'new-bk': ['Downtown New BK'] };
function seedState() {
  const st = emptyState();
  for (const c of SEED_BOROUGHS) st.districts.push({ ...c, type: 'borough', parentId: 'new-a-city', polygons: [], bounds: null, placement: 'verified', core: true, notes: '', created: now() });
  for (const [did, names] of Object.entries(SEED_HOODS)) for (const name of names) st.neighborhoods.push(newHood(did, name));
  for (const s of SEED_BUILDINGS) {
    const hood = st.neighborhoods.find(h => h.districtId === s.district && h.name === s.hood);
    const b = newBuilding(st, s.district);
    Object.assign(b, { name: s.name, number: s.number, street: s.street, neighborhoodId: hood?.id || null, bldgClass: s.cls, taxClass: suggestTaxClass(s.cls), zoning: s.zoning, yearBuilt: s.year, floors: s.floors, height: s.height, landmark: !!s.landmark, tags: ['seeded', 'top-10'], notes: 'Seeded from the Top 10 tallest at zays.us/new-a. Floors and height are placeholders that keep the rank order — replace them with the real figures.' });
    b.status = summaryStatus(b); st.buildings.push(b);
  }
  ensureV3(st); return st;
}

/* ---- migrations ----
   Rules: never rename, renumber or remove anything that exists. Add optional fields with
   empty defaults. Every upgrade is logged in meta.migrations and reported once.       */
function migrate(st) {
  if (!st || typeof st !== 'object') return seedState();
  st.schema ??= 1;
  st.meta ??= { created: now(), updated: now(), seq: {}, lastSnapshot: 0 };
  st.meta.seq ??= {}; st.districts ??= []; st.neighborhoods ??= []; st.buildings ??= [];
  st.settings = { ...emptyState().settings, ...(st.settings || {}) }; st.settings.ai = { ...emptyState().settings.ai, ...(st.settings.ai || {}) };
  for (const b of st.buildings) { b.tags ??= []; b.status ??= 'standing'; b.image = !!b.image; }
  const from = st.schema;
  if (st.schema < 2) {
    st.meta.hseq ??= {}; st.meta.pseq ??= {}; st.parcels ??= []; st.archive ??= [];
    st.meta.migrations = [...(st.meta.migrations || []), { from: 1, to: 2, at: now(), app: APP.version, buildings: st.buildings.length, demolished: st.buildings.filter(b => b.status === 'demolished').length, note: 'ids and registration numbers preserved · optional historical fields added' }];
    st.schema = 2;
  }
  if (st.schema < 3) migrate2to3(st);
  if (st.schema < 4) migrate3to4(st);
  ensureV3(st);
  if (from < 3) MIGRATION.report = Object.assign(MIGRATION.report || {}, { from, to: APP.schema });
  else if (from < 4) MIGRATION.minor = { from, to: 4 };
  return st;
}
/* 3 → 4 (New A OS · V3): only additions — civic fields, condition, publishing flag, valuations on buildings; service and measured
   segments on lines; officials[], projects[], sandbox, world. Nothing renamed, renumbered or removed. */
function migrate3to4(st) {
  st.meta.migrations = [...(st.meta.migrations || []), { from: st.schema, to: 4, at: now(), app: APP.version, buildings: (st.buildings || []).length, note: 'ids and numbers preserved · civic / condition / public / valuation fields added to buildings · service + segments added to lines · officials, projects, sandbox and world added (empty)' }];
  st.schema = 4;
}
function migrate2to3(st) {
  const report = { from: st.schema, to: 3, buildings: st.buildings.length, statusSplit: {}, futureCompletions: [], parcels: (st.parcels || []).length, parcelLinksAdded: 0, parcelsArchived: 0, regionsAdded: [], districtsPlaced: [], districtsUnplaced: [], polygons: 0 };
  // 1 · geography: regions above districts; borders become polygons
  st.regions ??= [];
  for (const r of SEED_REGIONS) if (!st.regions.some(x => x.id === r.id)) { st.regions.push({ ...newRegion(r.name, r.type, r.parentId, r.code), ...r, polygons: [], created: now(), updated: now() }); report.regionsAdded.push(r.name); }
  for (const d of st.districts) {
    const parent = LEGACY_DISTRICT_PARENTS[d.id] || (d.core ? 'new-a-city' : null);
    if (d.parentId === undefined || d.parentId === null) d.parentId = parent;
    d.type ??= d.core ? 'borough' : 'district';
    d.placement ??= parent ? (['new-j', 'north-c', 'v-beach'].includes(d.id) ? 'conflict' : 'verified') : 'unverified';
    if (parent) report.districtsPlaced.push(`${d.name} → ${st.regions.find(r => r.id === parent)?.name || parent}`); else report.districtsUnplaced.push(d.name);
    if (!Array.isArray(d.polygons) || !d.polygons.length) { const p = rectToPoly(d.bounds); d.polygons = p ? [p] : []; if (p) report.polygons++; }
  }
  for (const h of st.neighborhoods) if (!Array.isArray(h.polygons) || !h.polygons.length) { const p = rectToPoly(h.bounds); h.polygons = p ? [p] : []; if (p) report.polygons++; }
  // 2 · one status becomes three independent ones; the old value is kept
  for (const b of st.buildings) {
    if (b.physical) continue;
    const s = b.status || 'standing'; b.legacyStatus = s;
    b.physical = s === 'demolished' ? 'demolished' : s === 'construction' ? 'construction' : s === 'vacant' ? 'vacant-lot' : 'standing';
    b.market = s === 'for-sale' ? 'for-sale' : s === 'sold' ? 'sold' : '';
    b.landmark = s === 'landmark';
    report.statusSplit[s] = (report.statusSplit[s] || 0) + 1;
    b.migrationNotes ??= [];
    // a future completion year on an unfinished project is an EXPECTED date, not a built date
    if (b.physical === 'construction' && num(b.yearBuilt) != null && num(b.yearBuilt) > CURRENT_YEAR) {
      b.yearExpected = num(b.yearBuilt); b.halfExpected = ''; b.yearExpectedApprox = !!b.yearBuiltApprox; b.yearBuilt = null; b.yearBuiltApprox = false;
      b.migrationNotes.push(`2→3: year built ${b.yearExpected} on an unfinished project moved to “expected completion”`); report.futureCompletions.push(`${b.reg} ${b.name || ''} → expected ${b.yearExpected}`);
    }
  }
  // 3 · parcels: fold what is unambiguous into building links, archive the rest (nothing deleted)
  const parcels = st.parcels || []; st.legacy ??= { parcels: [], parcelLinks: [], notes: [] };
  const byId = Object.fromEntries(st.buildings.map(b => [b.id, b]));
  const hasEdge = (a, c) => (a.relations || []).some(r => r.id === c.id) || (c.relations || []).some(r => r.id === a.id);
  for (const p of parcels) {
    const on = st.buildings.filter(b => (b.parcelIds || []).includes(p.id)).sort((a, b) => (num(a.yearBuilt) ?? 9999) - (num(b.yearBuilt) ?? 9999));
    for (let i = 1; i < on.length; i++) { const a = on[i - 1], c = on[i]; if (!hasEdge(a, c)) { a.relations = [...(a.relations || []), { type: 'same_site_as', id: c.id, note: `from parcel ${p.reg}` }]; report.parcelLinksAdded++; } }
    if (p.notes) for (const b of on) b.historyNotes = [b.historyNotes, `Site note (former parcel ${p.reg}${p.name ? ' · ' + p.name : ''}): ${p.notes}`].filter(Boolean).join('\n');
    for (const b of on) st.legacy.parcelLinks.push({ buildingId: b.id, buildingReg: b.reg, parcelId: p.id, parcelReg: p.reg });
    st.legacy.parcels.push({ ...p, buildingRegs: on.map(b => b.reg) }); report.parcelsArchived++;
  }
  for (const b of st.buildings) { delete b.parcelIds; delete b.parcelRegs; }
  delete st.parcels;
  st.legacy.notes.push(`${now()} · schema 2→3: ${parcels.length} parcels archived here; ${report.parcelLinksAdded} same-site links added between buildings that shared a parcel`);
  // 4 · new collections
  st.roads ??= []; st.tracks ??= []; st.lines ??= []; st.stations ??= []; st.businesses ??= []; st.tenancies ??= [];
  st.news ??= emptyState().news; st.meta.gseq ??= { RD: 0, TL: 0, ST: 0, BZ: 0, TR: 0 };
  st.meta.migrations = [...(st.meta.migrations || []), { from: st.schema, to: 3, at: now(), app: APP.version, buildings: st.buildings.length, note: `ids and numbers preserved · geography hierarchy added · borders converted to polygons · status split into physical / market / landmark (legacy status kept in sync) · ${parcels.length} parcels archived under legacy.parcels with ${report.parcelLinksAdded} same-site links carried into relations · roads, transit, businesses, news added` }];
  MIGRATION.report = report;
  st.schema = 3;
}
/* Idempotent schema-3 defaults — also covers records merged in from older files. */
function ensureV3(st) {
  const E = emptyState();
  st.meta.hseq ??= {}; st.meta.pseq ??= {}; st.meta.gseq = { ...E.meta.gseq, ...(st.meta.gseq || {}) }; st.meta.migrations ??= [];
  for (const k of ['regions', 'districts', 'neighborhoods', 'buildings', 'archive', 'roads', 'tracks', 'lines', 'stations', 'businesses', 'tenancies', 'officials', 'projects']) if (!Array.isArray(st[k])) st[k] = [];
  st.sandbox = { ...E.sandbox, ...(st.sandbox || {}) }; st.sandbox.stations ??= []; st.sandbox.roads ??= [];
  st.world = { ...E.world, ...(st.world || {}) }; st.world.snapshots ??= []; st.world.scans ??= []; st.world.proposals ??= []; st.world.backups = { ...E.world.backups, ...(st.world.backups || {}) }; st.world.backups.history ??= []; st.world.backups.schedule = { ...E.world.backups.schedule, ...(st.world.backups.schedule || {}) };
  st.news = { ...E.news, ...(st.news || {}) }; st.news.items ??= []; st.news.decisions ??= {}; st.news.log ??= []; st.news.drafts ??= []; st.news.rules = { ...E.news.rules, ...(st.news.rules || {}) };
  st.legacy = { ...E.legacy, ...(st.legacy || {}) }; st.legacy.parcels ??= []; st.legacy.parcelLinks ??= []; st.legacy.notes ??= [];
  st.settings = { ...E.settings, ...(st.settings || {}) }; st.settings.ai = { ...E.settings.ai, ...(st.settings.ai || {}) }; if (!Array.isArray(st.settings.basemaps)) st.settings.basemaps = []; st.settings.valuation = { ...VALUATION_DEFAULTS, ...(st.settings.valuation || {}) }; st.settings.transitCost = { ...TRANSIT_COST_DEFAULTS, ...(st.settings.transitCost || {}) }; st.settings.publishing = { ...E.settings.publishing, ...(st.settings.publishing || {}) };
  // geography
  for (const r of SEED_REGIONS) if (!st.regions.some(x => x.id === r.id)) st.regions.push({ ...newRegion(r.name, r.type, r.parentId, r.code), ...r, polygons: [] });
  for (const r of st.regions) { r.polygons = Array.isArray(r.polygons) ? r.polygons : []; r.placement ??= 'verified'; r.typeNote ??= ''; r.source ??= ''; r.sourceUrl ??= ''; r.tagline ??= ''; r.founded ??= ''; r.notes ??= ''; r.effectiveYear ??= null; r.effectiveHalf ??= ''; r.created ??= now(); r.updated ??= r.created; if (r.parentId && !st.regions.some(x => x.id === r.parentId)) r.parentId = 'union'; }
  for (const d of st.districts) {
    d.type ??= 'district'; d.parentId = d.parentId === undefined ? (LEGACY_DISTRICT_PARENTS[d.id] || null) : d.parentId; d.placement ??= d.parentId ? 'verified' : 'unverified'; d.notes ??= ''; d.tagline ??= ''; d.founded ??= '';
    if (d.parentId && !st.regions.some(x => x.id === d.parentId)) d.parentId = null;
    d.polygons = Array.isArray(d.polygons) ? d.polygons : (rectToPoly(d.bounds) ? [rectToPoly(d.bounds)] : []);
    d.bounds = d.polygons.length ? bboxOfPolys(d.polygons) : (d.bounds || null);
    d.core = isUnderRegion(st, d, 'new-a-city');    // derived: lives inside New A City
    if (d.slot == null) d.slot = nextFreeSlotIn(st);
  }
  for (const h of st.neighborhoods) { h.polygons = Array.isArray(h.polygons) ? h.polygons : (rectToPoly(h.bounds) ? [rectToPoly(h.bounds)] : []); h.bounds = h.polygons.length ? bboxOfPolys(h.polygons) : (h.bounds || null); h.boundaryText ??= ''; h.notes ??= ''; }
  // buildings
  for (const b of st.buildings) {
    b.yearDemolished ??= null; b.yearBuiltApprox = !!b.yearBuiltApprox; b.yearDemolishedApprox = !!b.yearDemolishedApprox;
    b.demolitionReason ??= ''; b.significance ??= ''; b.historyNotes ??= '';
    if (!Array.isArray(b.relations)) b.relations = []; if (!Array.isArray(b.formerRegs)) b.formerRegs = [];
    b.source ??= ''; b.sourceType ??= ''; b.confidence ??= ''; b.verified = !!b.verified;
    if (!b.physical) { const s = b.status || 'standing'; b.legacyStatus ??= s; b.physical = s === 'demolished' ? 'demolished' : s === 'construction' ? 'construction' : s === 'vacant' ? 'vacant-lot' : 'standing'; b.market ??= s === 'for-sale' ? 'for-sale' : s === 'sold' ? 'sold' : ''; b.landmark = b.landmark ?? (s === 'landmark'); }
    b.market ??= ''; b.landmark = !!b.landmark; b.legacyStatus ??= null;
    for (const k of ['halfBuilt', 'halfDemolished', 'halfAltered', 'halfStarted', 'halfExpected']) if (!['E', 'L'].includes(b[k])) b[k] = '';
    b.yearStarted ??= null; b.yearStartedApprox = !!b.yearStartedApprox; b.yearExpected ??= null; b.yearExpectedApprox = !!b.yearExpectedApprox;
    b.dateBuilt ??= ''; b.dateDemolished ??= ''; b.dateStarted ??= '';
    b.roadId ??= null; if (b.roadId && !b.roadIdSource) b.roadIdSource = 'manual'; if (!b.roadId) b.roadIdSource = null; b.entrance ??= null; b.footprint = Array.isArray(b.footprint) && b.footprint.length >= 3 ? b.footprint : null; b.floorArea ??= null; b.assessBuilding ??= null; b.assessYear ??= null; b.valuationBasis ??= '';
    if (!Array.isArray(b.listings)) b.listings = []; if (!Array.isArray(b.transactions)) b.transactions = []; if (!Array.isArray(b.migrationNotes)) b.migrationNotes = [];
    if (b.parcelIds) { for (const pid of b.parcelIds) st.legacy.parcelLinks.push({ buildingId: b.id, buildingReg: b.reg, parcelId: pid }); delete b.parcelIds; } delete b.parcelRegs;
    // v3 · civic / condition / public / valuation
    if (b.civic && typeof b.civic === 'object') { const c = b.civic; c.type = CIVIC_BY_ID[c.type] ? c.type : (c.type ? 'other' : null); if (!c.type) b.civic = null; else { c.status ??= ''; c.jurisdictionId ??= null; c.capacity ??= null; c.capacityUnit ??= CIVIC_BY_ID[c.type]?.unit || ''; c.openedYear ??= null; c.openedHalf ??= ''; c.closedYear ??= null; c.closedHalf ??= ''; c.replacedById ??= null; c.notes ??= ''; } } else b.civic = null;
    b.condition = CONDITIONS.some(c => c[0] === b.condition) ? b.condition : ''; b.public = b.public !== false; b.valuation ??= null; if (!Array.isArray(b.valuations)) b.valuations = []; b.valuationOverride ??= null;
    b.status = summaryStatus(b);
  }
  if (Array.isArray(st.parcels)) { for (const p of st.parcels) if (!st.legacy.parcels.some(x => x.id === p.id)) st.legacy.parcels.push(p); delete st.parcels; }
  for (const a of st.archive) { a.districtId ??= null; a.neighborhoodId ??= null; a.month ??= null; a.title ??= ''; a.description ??= ''; a.source ??= ''; a.sourceType ??= ''; a.confidence ??= ''; if (!Array.isArray(a.tags)) a.tags = []; a.image = !!a.image; a.created ??= now(); a.updated ??= a.created; }
  for (const b of st.buildings) { b.unnamed ??= false; b.lotRotated ??= false; b.lot = Array.isArray(b.lot) && b.lot.length >= 3 ? b.lot : null; b.lotSource ??= ''; }
  for (const r of st.roads) { const d = newRoad({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (r[k] === undefined) r[k] = k === 'reg' ? '' : d[k]; if (!Array.isArray(r.geometry)) r.geometry = []; r.oneWayDir = r.oneWayDir === -1 ? -1 : 1; }
  for (const t of st.tracks) { const d = newTrack({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (t[k] === undefined) t[k] = k === 'reg' ? '' : d[k]; }
  for (const l of st.lines) { const d = newLine({ meta: { gseq: {} }, lines: [] }); for (const k of Object.keys(d)) if (l[k] === undefined) l[k] = k === 'reg' ? '' : d[k]; for (const k of ['trackIds', 'roadIds', 'stopIds', 'segments']) if (!Array.isArray(l[k])) l[k] = []; if (l.service && typeof l.service !== 'object') l.service = null; }
  for (const o of st.officials) { const d = newOfficial({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (o[k] === undefined) o[k] = k === 'reg' ? '' : d[k]; }
  for (const pj of st.projects) { const d = newProject({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (pj[k] === undefined) pj[k] = k === 'reg' ? '' : d[k]; for (const k of ['buildingIds', 'roadIds', 'lineIds', 'log', 'archiveIds']) if (!Array.isArray(pj[k])) pj[k] = []; }
  for (const s of st.stations) { const d = newStation({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = k === 'reg' ? '' : d[k]; if (!Array.isArray(s.transferIds)) s.transferIds = []; s.transferIds = s.transferIds.filter(id => id !== s.id && st.stations.some(x => x.id === id)); }
  for (const z of st.businesses) { const d = newBusiness({ meta: { gseq: {} } }); for (const k of Object.keys(d)) if (z[k] === undefined) z[k] = k === 'reg' ? '' : d[k]; for (const k of ['aliases', 'locations', 'revenue', 'listings', 'tags', 'marketQuotes']) if (!Array.isArray(z[k])) z[k] = []; }
  for (const t of st.tenancies) { t.role ??= 'tenant'; t.unit ??= ''; t.yearFrom ??= null; t.halfFrom ??= ''; t.yearTo ??= null; t.halfTo ??= ''; t.current = t.current ?? (t.yearTo == null); t.notes ??= ''; }
  syncSequences(st);
  // missing global numbers (records created by older imports)
  for (const [coll, pre] of [['roads', 'RD'], ['lines', 'TL'], ['stations', 'ST'], ['businesses', 'BZ'], ['tracks', 'TR'], ['officials', 'GV'], ['projects', 'PJ']]) for (const r of st[coll]) if (!r.reg) r.reg = nextGlobal(st, pre);
}
function isUnderRegion(st, d, regionId) { let pid = d.parentId; const seen = new Set(); while (pid && !seen.has(pid)) { if (pid === regionId) return true; seen.add(pid); pid = st.regions.find(r => r.id === pid)?.parentId; } return false; }
function nextFreeSlotIn(st) { const used = new Set(st.districts.map(d => d.slot).filter(s => s != null)); for (let i = 0; i < 40; i++) if (!used.has(i)) return i; return st.districts.length; }
/* Every counter must be ≥ the highest number already in use (hand-edited files, merges). */
function syncSequences(st) {
  st.meta.seq ??= {}; st.meta.hseq ??= {}; st.meta.gseq ??= {};
  for (const b of st.buildings) { const r = parseReg(b.reg); if (!r || r.parcel) continue; if (r.series === 'current' || r.series === 'hist') { const k = r.hist ? 'hseq' : 'seq'; st.meta[k][b.districtId] = Math.max(st.meta[k][b.districtId] || 0, r.n); } }
  for (const [coll, pre] of [['roads', 'RD'], ['lines', 'TL'], ['stations', 'ST'], ['businesses', 'BZ'], ['tracks', 'TR'], ['officials', 'GV'], ['projects', 'PJ']]) for (const r of st[coll] || []) { const p = parseReg(r.reg); if (p && p.code === pre) st.meta.gseq[pre] = Math.max(st.meta.gseq[pre] || 0, p.n); }
}

/* ---- lookups ---- */
const regionById = id => S.regions.find(r => r.id === id);
const districtById = id => S.districts.find(d => d.id === id);
const hoodById = id => S.neighborhoods.find(h => h.id === id);
const byId = id => S.buildings.find(b => b.id === id);
const roadById = id => S.roads.find(r => r.id === id);
const trackById = id => S.tracks.find(t => t.id === id);
const lineById = id => S.lines.find(l => l.id === id);
const stationById = id => S.stations.find(s => s.id === id);
const bizById = id => S.businesses.find(z => z.id === id);
const officialById = id => S.officials.find(o => o.id === id);
const projectById = id => S.projects.find(p => p.id === id);
const archiveById = id => S.archive.find(a => a.id === id);
const nodeById = id => regionById(id) || districtById(id) || hoodById(id) || null;
const childRegions = pid => S.regions.filter(r => (r.parentId || null) === (pid || null) && r.id !== pid);
const regionDistricts = rid => S.districts.filter(d => d.parentId === rid);
function descendantDistrictIds(rid) { const out = new Set(); const walk = id => { for (const d of regionDistricts(id)) out.add(d.id); for (const r of childRegions(id)) walk(r.id); }; walk(rid); return out; }
function ancestorsOf(node) { const out = []; let pid = node?.parentId; const seen = new Set(); while (pid && !seen.has(pid)) { const r = regionById(pid); if (!r) break; out.unshift(r); seen.add(pid); pid = r.parentId; } return out; }
const regionColor = r => r?.slot != null ? slotBright(r.slot) : PALETTE.neutralBright;
const regionMark = r => r?.slot != null ? slotMark(r.slot) : PALETTE.neutral;
const distColor = d => d ? slotBright(d.slot) : PALETTE.neutralBright;
const distMark  = d => d ? slotMark(d.slot) : PALETTE.neutral;
const coreDistricts = () => S.districts.filter(d => d.core);
const cityDistrictIds = () => descendantDistrictIds('new-a-city');
const coreIds = cityDistrictIds;      // v2 name — "the New A City file"
const buildingsIn = did => S.buildings.filter(b => b.districtId === did);
const activeIn = did => buildingsIn(did).filter(isActive);
const histIn = did => buildingsIn(did).filter(isHist);
const activeBuildings = () => S.buildings.filter(isActive);
const histBuildings = () => S.buildings.filter(isHist);
const hoodsIn = did => S.neighborhoods.filter(h => h.districtId === did).sort((a, b) => a.name.localeCompare(b.name));
const heightOf = b => num(b.height) ?? (num(b.floors) ? num(b.floors) * 3.5 : null);
const lotAreaOf = b => num(b.lotArea) ?? ((num(b.lotFront) && num(b.lotDepth)) ? num(b.lotFront) * num(b.lotDepth) : null);
const footprintAreaOf = b => b.footprint ? polyArea(b.footprint) : null;
const findByReg = q => { q = String(q || '').trim().toUpperCase(); if (!q) return null; return S.buildings.find(b => (b.reg || '').toUpperCase() === q || (b.formerRegs || []).some(r => String(r).toUpperCase() === q)) || null; };
const findAnyByReg = q => { q = String(q || '').trim().toUpperCase(); if (!q) return null; const b = findByReg(q); if (b) return { kind: 'building', rec: b }; for (const [coll, kind] of [['roads', 'road'], ['lines', 'line'], ['stations', 'station'], ['businesses', 'business']]) { const r = S[coll].find(x => (x.reg || '').toUpperCase() === q); if (r) return { kind, rec: r }; } return null; };
function nextFreeSlot() { return nextFreeSlotIn(S); }

/* ---- scope: the geography the whole app is looking at ---- */
function scopeNode(sc = UI.scope) { if (!sc || sc.kind === 'all') return null; return sc.kind === 'region' ? regionById(sc.id) : sc.kind === 'district' ? districtById(sc.id) : hoodById(sc.id); }
function scopeName(sc = UI.scope) { if (!sc || sc.kind === 'all') return 'Everything on file'; return scopeNode(sc)?.name || 'Everything on file'; }
function scopeDistrictIds(sc = UI.scope) {
  if (!sc || sc.kind === 'all') return new Set(S.districts.map(d => d.id));
  if (sc.kind === 'region') return descendantDistrictIds(sc.id);
  if (sc.kind === 'district') return new Set([sc.id]);
  const h = hoodById(sc.id); return new Set(h ? [h.districtId] : []);
}
function scopeBuildings(sc = UI.scope) { const ids = scopeDistrictIds(sc); let rows = S.buildings.filter(b => ids.has(b.districtId)); if (sc?.kind === 'hood') rows = rows.filter(b => b.neighborhoodId === sc.id); return rows; }
const scopeActive = (sc = UI.scope) => scopeBuildings(sc).filter(isActive);
const scopeDistricts = (sc = UI.scope) => { const ids = scopeDistrictIds(sc); return S.districts.filter(d => ids.has(d.id)); };
const scopeHoods = (sc = UI.scope) => { const ids = scopeDistrictIds(sc); return S.neighborhoods.filter(h => ids.has(h.districtId)); };
const scopeArchive = (sc = UI.scope) => { if (!sc || sc.kind === 'all') return S.archive.slice(); const ids = scopeDistrictIds(sc); const inCity = sc.kind === 'region' && (sc.id === 'new-a-city' || sc.id === 'new-a' || sc.id === 'union'); return S.archive.filter(a => (inCity && !a.districtId) || ids.has(a.districtId)); };
const scopeColor = (sc = UI.scope) => { const n = scopeNode(sc); if (!n) return 'var(--cyan)'; return sc.kind === 'region' ? (n.slot != null ? regionColor(n) : 'var(--cyan)') : sc.kind === 'district' ? distColor(n) : distColor(districtById(n.districtId)); };
/* children of the scope for league tables and chips: regions+districts under a region, hoods under a district */
function scopeChildren(sc = UI.scope) {
  if (!sc || sc.kind === 'all') return [...childRegions(null).map(r => ({ kind: 'region', node: r })), ...S.districts.filter(d => !d.parentId).map(d => ({ kind: 'district', node: d }))];
  if (sc.kind === 'region') return [...childRegions(sc.id).map(r => ({ kind: 'region', node: r })), ...regionDistricts(sc.id).map(d => ({ kind: 'district', node: d }))];
  if (sc.kind === 'district') return hoodsIn(sc.id).map(h => ({ kind: 'hood', node: h }));
  return [];
}
const childScope = c => ({ kind: c.kind, id: c.node.id });
function scopeBuildingsOf(c) { return scopeBuildings(childScope(c)); }
/* which district / neighborhood polygons contain a point → suggestions, never silent moves */
function placeSuggest(x, z) {
  const pt = [x, z]; const out = { districts: [], hoods: [], regions: [] };
  for (const d of S.districts) { const s = pointInPolys(pt, d.polygons); if (s !== 'out') out.districts.push({ d, on: s === 'on' }); }
  for (const h of S.neighborhoods) { const s = pointInPolys(pt, h.polygons); if (s !== 'out') out.hoods.push({ h, on: s === 'on' }); }
  for (const r of S.regions) { const s = pointInPolys(pt, r.polygons); if (s !== 'out') out.regions.push({ r, on: s === 'on' }); }
  return out;
}

/* ---- time: year-level (charts) and half-year-level (playback) existence ----
   Strict everywhere: a record counts in a year only when its own dates put it there.
   The final year is never swapped for the live registry, so undated records, projects
   and vacant lots are reported on their own instead of appearing as new buildings.  */
function completedAt(b, y) {
  const yb = num(b.yearBuilt); if (yb == null || yb > y) return false;
  if (isHist(b)) { const yd = num(b.yearDemolished); return yd != null && yd > y; }
  return ['standing', 'closed'].includes(b.physical || 'standing');
}
function vacantAt(b, y) { const yb = num(b.yearBuilt); return !isHist(b) && b.physical === 'vacant-lot' && yb != null && yb <= y; }
function constructionAt(b, y) { if (!isUnderWay(b)) return false; const ys = num(b.yearStarted), yb = num(b.yearBuilt); const start = ys ?? yb; return start != null && start <= y; }
const existedAt = (b, y) => completedAt(b, y);
/* strict, half-year aware; never substitutes the live registry for the final step */
function builtIndex(b) { const y = num(b.yearBuilt); return y == null ? null : hyIndex(y, b.halfBuilt); }
function demolishedIndex(b) { const y = num(b.yearDemolished); return y == null ? null : hyIndex(y, b.halfDemolished); }
function startedIndex(b) { const y = num(b.yearStarted); return y == null ? null : hyIndex(y, b.halfStarted); }
function expectedIndex(b) { const y = num(b.yearExpected); return y == null ? null : hyIndex(y, b.halfExpected); }
/* 'standing' | 'construction' | 'gone' | 'future' | 'undated' at a half-year index.
   A project (planned / under construction) is never 'standing' unless projection mode is on and its
   expected date has passed; a legacy completion year on a project is read as its start.          */
function stateAtHY(b, i, { projection = false } = {}) {
  const bi = builtIndex(b), di = demolishedIndex(b), si = startedIndex(b), ei = expectedIndex(b);
  if (isUnderWay(b) && isActive(b)) {
    const start = si ?? bi;
    if (start == null) { if (ei == null) return 'undated'; if (projection && ei <= i) return 'standing'; return ei > i ? 'future' : 'construction'; }
    if (start > i) return 'future';
    if (projection && ei != null && ei <= i) return 'standing';
    return 'construction';
  }
  if (bi == null) return isHist(b) ? (di != null && di <= i ? 'gone' : 'undated') : 'undated';
  if (di != null && di <= i) return 'gone';
  if (bi <= i) return 'standing';
  if (si != null && si <= i) return 'construction';
  return 'future';
}
function yearRange(rows) {
  const ys = rows.flatMap(b => [num(b.yearBuilt), num(b.yearDemolished), num(b.yearStarted)]).filter(y => y != null && y >= 1990 && y <= 2100);
  return { y0: Math.min(FOUNDED_YEAR, ...ys), y1: Math.max(CURRENT_YEAR, ...ys) };
}
function yearSeries(rows) {
  const { y0, y1 } = yearRange(rows); const out = [];
  for (let y = y0; y <= y1; y++) out.push({ y, built: rows.filter(b => num(b.yearBuilt) === y && !isUnderWay(b)).length, started: rows.filter(b => num(b.yearStarted) === y).length, demolished: rows.filter(b => isHist(b) && num(b.yearDemolished) === y).length, standing: rows.filter(b => completedAt(b, y)).length, construction: rows.filter(b => constructionAt(b, y)).length, vacant: rows.filter(b => vacantAt(b, y)).length });
  return out;
}
/* records the timeline cannot place: no completion year (standing), no start/built year (projects), no demolition year (gone) */
const undatedOf = rows => ({ built: rows.filter(b => isActive(b) && !isUnderWay(b) && num(b.yearBuilt) == null).length, construction: rows.filter(b => isUnderWay(b) && num(b.yearStarted) == null && num(b.yearBuilt) == null && num(b.yearExpected) == null).length, demolished: rows.filter(b => isHist(b) && (num(b.yearDemolished) == null || num(b.yearBuilt) == null)).length });

/* ---- serialisation ----
   One master file is the lossless record. Export-only conveniences (names, linked
   numbers, photo paths) ride along and are stripped on import.                      */
const cityWide = a => !a.districtId;
const EXPORT_README = 'Registry 2.5 master file. ids are authoritative; every field named *Name, *Reg(s), district, neighborhood, region, imageFile, generations and relations[].reg/name is a read-only convenience derived on export and ignored on import. regions[] (union › state / federal district › city › region) hold districts[] (boroughs) which hold neighborhoods[]; borders are polygons[] of [x,z] Minecraft coordinates. buildings[]: physical (planned · construction · standing · closed · vacant-lot · demolished), market (for-sale · for-lease · sold · leased), landmark; status is the legacy single-value summary kept in sync; dates are year + half (E = Jan–Jun, L = Jul–Dec, empty = half unknown) with *Approx flags; yearStarted / yearExpected / yearBuilt / yearDemolished are distinct; relations[] link what replaced what; roadId is the serving road (roadIdSource says whether it was set by hand, by a street-name match or from a proximity suggestion). roads[], tracks[] (physical rails), lines[] (services over tracks, with stopIds), stations[], businesses[] + tenancies[] (owner · tenant · developer · operator per building and period; marketQuotes[] are simulated prices from the site market, never revenue), archive[] (chronicle: dated screenshots with descriptions), news (fetched articles, market snapshots, decisions, change log), legacy (archived parcels from 2.0). V3: buildings[].civic (type · status · jurisdictionId · capacity · opened/closed) marks civic facilities; condition, public (false = keep out of the public guide), valuation (explainable estimate with factors) and valuations[] (history) are derived and can be overridden (valuationOverride). lines[].service (speed · headwayMin · dwellSec · basis) and segments[] (measured or scheduled times between stops). officials[] (GV-): name, office, jurisdictionId, term, officeBuildingId, residenceBuildingId. projects[] (PJ-): stage, linked records, dates, log. sandbox: hypothetical stations and roads for planning, never part of the record. world: snapshots, scans, proposals and backup history written by New A OS. imageFile is the photo path inside the vault folder.';
function exportBuilding(b) {
  const d = districtById(b.districtId), h = hoodById(b.neighborhoodId), r = b.roadId ? roadById(b.roadId) : null;
  return { ...b, status: summaryStatus(b), district: d?.name || null, neighborhood: h?.name || null, region: d?.parentId ? regionById(d.parentId)?.name || null : null, imageFile: b.image ? `images/${b.id}.jpg` : null, roadName: r?.name || null,
    relations: (b.relations || []).map(x => { const t = byId(x.id); return { ...x, reg: t?.reg || null, name: t ? (t.name || titleOf(t)) : null }; }) };
}
const exportArchive = a => { const d = districtById(a.districtId), h = hoodById(a.neighborhoodId); return { ...a, district: d ? d.name : 'City-wide', neighborhood: h?.name || null, imageFile: a.image ? `images/${a.id}.jpg` : null }; };
const exportDistrict = d => ({ ...d, region: regionById(d.parentId)?.name || null, areaBlocks: d.polygons?.length ? Math.round(polysArea(d.polygons)) : null });
const exportRegion = r => ({ ...r, parentName: regionById(r.parentId)?.name || null, areaBlocks: r.polygons?.length ? Math.round(polysArea(r.polygons)) : null });
const exportRoad = r => ({ ...r, lengthBlocks: Math.round(polyLength(r.geometry)), buildingRegs: buildingsOnRoad(r).map(b => b.reg) });
const exportLine = l => ({ ...l, trackRegs: l.trackIds.map(id => trackById(id)?.reg).filter(Boolean), stopNames: l.stopIds.map(id => stationById(id)?.name).filter(Boolean), lengthBlocks: Math.round(lineLength(l)) });
const exportStation = s => ({ ...s, lineNames: linesAtStation(s).map(l => l.name), buildingReg: s.buildingId ? byId(s.buildingId)?.reg || null : null, district: districtById(s.districtId)?.name || null });
const exportBusiness = z => ({ ...z, parentName: z.parentId ? bizById(z.parentId)?.name || null : null, imageFile: z.image ? `images/${z.id}.jpg` : null, buildingRegs: tenanciesOf(z).map(t => byId(t.buildingId)?.reg).filter(Boolean) });
const exportTenancy = t => ({ ...t, businessName: bizById(t.businessId)?.name || null, buildingReg: byId(t.buildingId)?.reg || null });
function stripDerived(st) {
  const drop = (o, keys) => { for (const k of keys) delete o[k]; };
  for (const b of st.buildings || []) { drop(b, ['imageFile', 'district', 'neighborhood', 'region', 'roadName', 'parcelRegs']); if (Array.isArray(b.relations)) b.relations = b.relations.map(({ reg, name, ...r }) => r); }
  for (const a of st.archive || []) drop(a, ['imageFile', 'district', 'neighborhood']);
  for (const d of st.districts || []) drop(d, ['region', 'areaBlocks']);
  for (const r of st.regions || []) drop(r, ['parentName', 'areaBlocks']);
  for (const r of st.roads || []) drop(r, ['lengthBlocks', 'buildingRegs']);
  for (const l of st.lines || []) drop(l, ['trackRegs', 'stopNames', 'lengthBlocks']);
  for (const s of st.stations || []) drop(s, ['lineNames', 'buildingReg', 'district']);
  for (const z of st.businesses || []) drop(z, ['parentName', 'imageFile', 'buildingRegs']);
  for (const t of st.tenancies || []) drop(t, ['businessName', 'buildingReg']);
  for (const o of st.officials || []) drop(o, ['jurisdiction', 'officeBuildingReg', 'residenceBuildingReg']);
  for (const pj of st.projects || []) drop(pj, ['district', 'buildingRegs']);
  for (const p of st.parcels || []) drop(p, ['district', 'neighborhood', 'buildingRegs', 'generations']);
}
function serializeMaster() {
  return {
    app: APP.name, version: APP.version, schema: S.schema, kind: 'master', exported: now(), readme: EXPORT_README,
    counts: { buildings: S.buildings.length, historical: histBuildings().length, regions: S.regions.length, districts: S.districts.length, neighborhoods: S.neighborhoods.length, roads: S.roads.length, lines: S.lines.length, stations: S.stations.length, businesses: S.businesses.length, officials: S.officials.length, projects: S.projects.length, archive: S.archive.length },
    meta: S.meta, settings: { ...S.settings, ai: { ...S.settings.ai } },
    regions: S.regions.map(exportRegion), districts: S.districts.map(exportDistrict), neighborhoods: S.neighborhoods,
    buildings: S.buildings.map(exportBuilding), roads: S.roads.map(exportRoad), tracks: S.tracks, lines: S.lines.map(exportLine), stations: S.stations.map(exportStation),
    businesses: S.businesses.map(exportBusiness), tenancies: S.tenancies.map(exportTenancy), officials: S.officials.map(exportOfficial), projects: S.projects.map(exportProject), archive: S.archive.map(exportArchive), news: S.news, legacy: S.legacy, sandbox: S.sandbox, world: S.world,
  };
}
const exportOfficial = o => ({ ...o, jurisdiction: (regionById(o.jurisdictionId) || districtById(o.jurisdictionId))?.name || null, officeBuildingReg: o.officeBuildingId ? byId(o.officeBuildingId)?.reg || null : null, residenceBuildingReg: o.residenceBuildingId ? byId(o.residenceBuildingId)?.reg || null : null });
const exportProject = pj => ({ ...pj, district: districtById(pj.districtId)?.name || null, buildingRegs: pj.buildingIds.map(id => byId(id)?.reg).filter(Boolean) });
/* a scoped slice (kind 'scope'): buildings, geography and chronicle of one jurisdiction; shared layers ride along in full */
function serializeScope(sc) {
  const ids = scopeDistrictIds(sc); const rows = scopeBuildings(sc);
  return {
    app: APP.name, version: APP.version, schema: S.schema, kind: 'scope', scope: { ...sc, name: scopeName(sc) }, exported: now(), readme: EXPORT_README,
    counts: { buildings: rows.length, historical: rows.filter(isHist).length, districts: ids.size },
    meta: { seq: S.meta.seq, hseq: S.meta.hseq, gseq: S.meta.gseq },
    regions: S.regions.map(exportRegion), districts: S.districts.filter(d => ids.has(d.id)).map(exportDistrict), neighborhoods: S.neighborhoods.filter(h => ids.has(h.districtId)),
    buildings: rows.map(exportBuilding), archive: scopeArchive(sc).map(exportArchive),
    roads: S.roads.map(exportRoad), tracks: S.tracks, lines: S.lines.map(exportLine), stations: S.stations.map(exportStation), businesses: S.businesses.map(exportBusiness), tenancies: S.tenancies.filter(t => rows.some(b => b.id === t.buildingId)).map(exportTenancy),
  };
}
/* compatibility file for the public site: the New A City slice in the shape v2 wrote (kind 'new-a') */
function serializeCompat() {
  const ids = cityDistrictIds(); const sc = { kind: 'region', id: 'new-a-city' };
  return {
    app: APP.name, version: APP.version, schema: S.schema, kind: 'new-a', exported: now(),
    readme: 'Compatibility export of New A City for readers of the 2.0 NewA.json. The complete record is Registry.json. ' + EXPORT_README,
    meta: S.meta, settings: S.settings,
    districts: S.districts.filter(d => ids.has(d.id)).map(exportDistrict), neighborhoods: S.neighborhoods.filter(h => ids.has(h.districtId)),
    buildings: scopeBuildings(sc).map(exportBuilding), parcels: [], archive: scopeArchive(sc).map(exportArchive),
    roads: S.roads.map(exportRoad), lines: S.lines.map(exportLine), stations: S.stations.map(exportStation), businesses: S.businesses.map(exportBusiness), tenancies: S.tenancies.map(exportTenancy),
  };
}
const serializeCore = serializeCompat;

/* ---- import ----
   kinds: master · scope · new-a · other-districts · backup (schema 1–3). Replace never
   reaches past the file's own scope; a filtered file cannot wipe the world.           */
function payloadScopeDistrictIds(payload) {
  const inc = (payload.districts || []).map(d => d.id);
  if (payload.kind === 'master' || payload.kind === 'backup') return null;                       // everything
  if (payload.kind === 'new-a') return new Set([...inc, ...cityDistrictIds()]);
  if (payload.kind === 'other-districts') return new Set([...inc, ...S.districts.filter(d => !cityDistrictIds().has(d.id)).map(d => d.id)]);
  if (payload.kind === 'scope' && payload.scope) return new Set([...inc, ...scopeDistrictIds(payload.scope)]);
  return new Set(inc);
}
function describePayload(payload) {
  const k = payload.kind || 'backup'; const sch = payload.schema ?? 1;
  const label = { master: 'master file (everything)', scope: `jurisdiction export · ${payload.scope?.name || 'scope'}`, 'new-a': 'New A City file (2.0 format)', 'other-districts': 'other-districts file (2.0 format)', backup: 'full backup' }[k] || 'registry file';
  return { kind: k, schema: sch, label, counts: { buildings: (payload.buildings || []).length, historical: (payload.buildings || []).filter(b => (b.physical || b.status) === 'demolished').length, districts: (payload.districts || []).length, regions: (payload.regions || []).length, neighborhoods: (payload.neighborhoods || []).length, roads: (payload.roads || []).length, lines: (payload.lines || []).length, stations: (payload.stations || []).length, businesses: (payload.businesses || []).length, archive: (payload.archive || []).length, parcels: (payload.parcels || []).length, images: payload.images ? Object.keys(payload.images).length : 0 } };
}
/* what a merge would do, before it does it */
function analyzeImport(payload) {
  const res = { newRecords: 0, updated: 0, unchanged: 0, olderIncoming: [], regClash: [], blanks: 0 };
  const colls = [['buildings', S.buildings], ['districts', S.districts], ['neighborhoods', S.neighborhoods], ['regions', S.regions], ['roads', S.roads], ['tracks', S.tracks], ['lines', S.lines], ['stations', S.stations], ['businesses', S.businesses], ['tenancies', S.tenancies], ['officials', S.officials], ['projects', S.projects], ['archive', S.archive]];
  for (const [k, ours] of colls) for (const it of payload[k] || []) {
    const cur = ours.find(x => x.id === it.id);
    if (!cur) { res.newRecords++; if (k === 'buildings' && it.reg && ours.some(x => x.reg === it.reg)) res.regClash.push(it.reg); continue; }
    const same = JSON.stringify(cleanForCompare(cur)) === JSON.stringify(cleanForCompare({ ...cur, ...it }));
    if (same) res.unchanged++; else res.updated++;
    if (it.updated && cur.updated && new Date(it.updated) < new Date(cur.updated) && !same) res.olderIncoming.push(it.reg || it.name || it.id);
    for (const [f, v] of Object.entries(it)) if ((v === null || v === '') && cur[f] != null && cur[f] !== '') res.blanks++;
  }
  return res;
}
const cleanForCompare = o => { const c = { ...o }; for (const k of ['updated', 'imageFile', 'district', 'neighborhood', 'region', 'roadName', 'parcelRegs', 'areaBlocks', 'parentName', 'lengthBlocks', 'buildingRegs', 'trackRegs', 'stopNames', 'lineNames', 'buildingReg', 'businessName', 'jurisdiction', 'officeBuildingReg', 'residenceBuildingReg']) delete c[k]; return c; };
/* mode 'merge' (update matching ids, add new; blanks never overwrite values unless opts.blanks) | 'replace' (within the file's scope) */
function mergePayload(payload, mode, opts = {}) {
  if (typeof OS !== 'undefined') OS.fresh = false;   // an import makes this profile the real one
  if (!payload || typeof payload !== 'object') throw new Error('Not a registry file');
  if (payload.filter && mode === 'replace') mode = 'merge';          // a filtered extract can only add or update — never wipe what it left out
  const incoming = {}; for (const k of ['regions', 'districts', 'neighborhoods', 'buildings', 'roads', 'tracks', 'lines', 'stations', 'businesses', 'tenancies', 'officials', 'projects', 'archive', 'parcels']) incoming[k] = Array.isArray(payload[k]) ? payload[k].map(x => ({ ...x })) : [];
  stripDerived(incoming);
  // an older file is upgraded exactly like an older store: statuses split, future completion years moved to
  // "expected", parcels folded into same-site links and archived — so import and in-place upgrade agree
  if ((payload.schema ?? 1) < 3) {
    const keepReport = MIGRATION.report;
    const tmp = migrate({ schema: payload.schema ?? 1, meta: { ...(payload.meta || {}), seq: { ...(payload.meta?.seq || {}) }, hseq: { ...(payload.meta?.hseq || {}) }, pseq: { ...(payload.meta?.pseq || {}) } }, settings: {}, districts: incoming.districts, neighborhoods: incoming.neighborhoods, buildings: incoming.buildings, parcels: incoming.parcels, archive: incoming.archive });
    MIGRATION.report = keepReport;
    incoming.districts = tmp.districts; incoming.neighborhoods = tmp.neighborhoods; incoming.buildings = tmp.buildings; incoming.archive = tmp.archive; incoming.parcels = tmp.legacy.parcels; incoming.regions = incoming.regions.length ? incoming.regions : [];
    if (tmp.legacy.parcelLinks.length) S.legacy.parcelLinks = [...S.legacy.parcelLinks.filter(l => !tmp.legacy.parcelLinks.some(x => x.buildingId === l.buildingId && x.parcelId === l.parcelId)), ...tmp.legacy.parcelLinks];
    if (tmp.legacy.notes.length) S.legacy.notes.push(...tmp.legacy.notes.map(n => n + ' (on import)'));
  }
  const scopeIds = payloadScopeDistrictIds(payload);      // null = whole world
  const whole = scopeIds === null;
  const inScope = (did) => whole || scopeIds.has(did);
  const inScopeArchive = a => whole || (a.districtId ? scopeIds.has(a.districtId) : (payload.kind === 'new-a' || (payload.kind === 'scope' && ['new-a-city', 'new-a', 'union'].includes(payload.scope?.id))));
  if (mode === 'replace') {
    S.districts = S.districts.filter(d => !inScope(d.id)).concat(incoming.districts);
    S.neighborhoods = S.neighborhoods.filter(h => !inScope(h.districtId)).concat(incoming.neighborhoods);
    S.buildings = S.buildings.filter(b => !inScope(b.districtId)).concat(incoming.buildings);
    S.archive = S.archive.filter(a => !inScopeArchive(a)).concat(incoming.archive);
    if (whole) { for (const k of ['regions', 'roads', 'tracks', 'lines', 'stations', 'businesses', 'tenancies', 'officials', 'projects']) S[k] = incoming[k]; if (payload.news) S.news = payload.news; if (payload.legacy) S.legacy = payload.legacy; if (payload.sandbox) S.sandbox = payload.sandbox; if (payload.world) S.world = payload.world; if (payload.meta) S.meta = { ...S.meta, ...payload.meta }; if (payload.settings) S.settings = { ...S.settings, ...payload.settings }; }
    else { for (const k of ['regions', 'roads', 'tracks', 'lines', 'stations', 'businesses', 'tenancies', 'officials', 'projects']) upsert(S[k], incoming[k], true); }
    if (incoming.parcels.length) { S.legacy.parcels = S.legacy.parcels.filter(p => !incoming.parcels.some(q => q.id === p.id)).concat(incoming.parcels); }
  } else {
    const keepBlanks = !opts.blanks;
    for (const k of ['regions', 'districts', 'neighborhoods', 'buildings', 'roads', 'tracks', 'lines', 'stations', 'businesses', 'tenancies', 'officials', 'projects', 'archive']) upsert(S[k], incoming[k], keepBlanks);
    if (incoming.parcels.length) upsert(S.legacy.parcels, incoming.parcels, true);
    if (payload.news?.items && whole) { for (const it of payload.news.items) if (!S.news.items.some(x => x.guid === it.guid)) S.news.items.push(it); Object.assign(S.news.decisions, payload.news.decisions || {}); }
  }
  // counters never go backwards
  S.meta.seq ??= {}; S.meta.hseq ??= {}; S.meta.gseq ??= {};
  for (const k of ['seq', 'hseq', 'gseq']) if (payload.meta?.[k]) for (const [d, v] of Object.entries(payload.meta[k])) S.meta[k][d] = Math.max(S.meta[k][d] || 0, +v || 0);
  syncSequences(S);
  const seen = new Set();
  for (const b of S.buildings) { if (seen.has(b.reg)) b.reg = parseReg(b.reg)?.hist ? nextHistReg(S, b.districtId) : nextReg(S, b.districtId); seen.add(b.reg); }
  S = migrate(S);
}
function upsert(arr, items, keepBlanks) {
  for (const it of items) { const i = arr.findIndex(x => x.id === it.id); if (i === -1) { arr.push(it); continue; } const cur = arr[i]; const merged = { ...cur }; for (const [k, v] of Object.entries(it)) { if (keepBlanks && (v === null || v === '' || (Array.isArray(v) && !v.length)) && cur[k] != null && cur[k] !== '' && !(Array.isArray(cur[k]) && !cur[k].length)) continue; merged[k] = v; } arr[i] = merged; }
}

/* ---- CSV extracts in, matched by id or registration number; blank cells never erase values ---- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.trim()); return rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
const CSV_NUMERIC = new Set(['yearBuilt', 'yearAltered', 'yearDemolished', 'yearStarted', 'yearExpected', 'floors', 'height', 'lotFront', 'lotDepth', 'lotArea', 'unitsRes', 'unitsCom', 'assessLand', 'assessTotal', 'assessBuilding', 'listPrice', 'x', 'z', 'floorArea']);
const CSV_TEXT = new Set(['name', 'number', 'street', 'bldgClass', 'taxClass', 'zoning', 'overlay', 'special', 'owner', 'notes', 'demolitionReason', 'significance', 'historyNotes', 'confidence', 'source', 'sourceType', 'physical', 'market', 'halfBuilt', 'halfDemolished', 'halfStarted', 'halfExpected']);
function analyzeCSV(rows) {
  const out = { matched: [], unmatched: [], fields: new Set(), changes: 0 };
  for (const r of rows) {
    const b = (r.id && byId(r.id)) || (r.reg && findByReg(r.reg)); if (!b) { out.unmatched.push(r.reg || r.id || r.name || '?'); continue; }
    const patch = {};
    for (const [k, v] of Object.entries(r)) { if (v === '' || v == null) continue; if (CSV_NUMERIC.has(k)) { const n = num(v); if (n != null && n !== num(b[k])) patch[k] = n; } else if (CSV_TEXT.has(k)) { if (String(v) !== String(b[k] ?? '')) patch[k] = String(v); } else if (k === 'landmark' || k === 'verified') { const bv = /^(yes|true|1)$/i.test(v); if (bv !== !!b[k]) patch[k] = bv; } else if (k === 'tags') { const t = v.split(/[\s]+/).filter(Boolean); if (JSON.stringify(t) !== JSON.stringify(b.tags)) patch[k] = t; } }
    for (const k of Object.keys(patch)) out.fields.add(k);
    if (Object.keys(patch).length) { out.matched.push({ b, patch }); out.changes += Object.keys(patch).length; }
  }
  return out;
}
function applyCSV(analysis) { for (const { b, patch } of analysis.matched) { Object.assign(b, patch); b.updated = now(); if (patch.physical || patch.market || 'landmark' in patch) b.status = summaryStatus(b); } }
