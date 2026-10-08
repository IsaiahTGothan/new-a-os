'use strict';
/* =====================================================================
   NEW A LAND REGISTRY 2.5 — a connected record of the whole world:
   buildings · history · states · boroughs · borders · roads · transit ·
   businesses · chronicle · news. One master file. Minecraft X/Z geometry.
   ===================================================================== */
/* =====================================================================
   §0  CONFIG
   ===================================================================== */
const APP = { name: 'New A OS', version: '3.5.1', schema: 4, site: 'zays.us/new-a', newsSite: 'https://newa-site.vercel.app', feedUrl: 'https://newa-site.vercel.app/feed.xml', marketsUrl: 'https://newa-site.vercel.app/api/markets' };
const FOUNDED_YEAR = 2013;                       // Jan 27, 2013 — the timeline starts here
const CURRENT_YEAR = new Date().getFullYear();   // the "present" end of the timeline
const CURRENT_HALF = new Date().getMonth() < 6 ? 'E' : 'L';

/*  Colour slots. `marks` is the chart palette for the dark surface; `bright` the
    matching HUD accent for glows, swatches and lines. Slot 12+ folds into neutral.  */
const PALETTE = {
  marks:  ['#009CB7', '#C9690C', '#8E71D6', '#2E9E52', '#C35C9B', '#4087DE', '#9C8600', '#C44E3B', '#2F9E9E', '#7A8A2E', '#9B5DE5', '#B07A3A'],
  bright: ['#4FE3FF', '#FFB454', '#B99CFF', '#5FE38E', '#FF86CF', '#7FB2FF', '#E0C63A', '#FF8A75', '#5FE0E0', '#C2DE5A', '#CFA7FF', '#F0BC7A'],
  neutral: '#6F8494', neutralBright: '#A9B8C7',
};
const slotMark   = s => (s == null ? null : PALETTE.marks[s]) ?? PALETTE.neutral;
const slotBright = s => (s == null ? null : PALETTE.bright[s]) ?? PALETTE.neutralBright;

/*  New A eras — from the timeline at zays.us/new-a. */
const ERAS = [
  { from: 2013, to: 2014, name: 'Founding Year' },
  { from: 2014, to: 2016, name: 'Silent Growth' },
  { from: 2016, to: 2018, name: 'Terror & Downfall' },
  { from: 2018, to: 2020, name: 'Extreme Growth' },
  { from: 2020, to: 2022, name: 'Gentrification' },
  { from: 2022, to: 2024, name: 'Solidification' },
  { from: 2024, to: 2027, name: 'Modernization' },
];
const eraOf = y => { if (!y) return null; if (y < 2013) return { name: 'Pre-founding' }; return ERAS.find(e => y >= e.from && y < e.to) || ERAS[ERAS.length - 1]; };

/* ---- geography ---- */
const REGION_TYPES = [
  { id: 'union', label: 'Union', plural: 'Unions' }, { id: 'state', label: 'State', plural: 'States' }, { id: 'federal-district', label: 'Federal district', plural: 'Federal districts' },
  { id: 'city', label: 'City', plural: 'Cities' }, { id: 'region', label: 'Region', plural: 'Regions' },
];
const REGION_TYPE = Object.fromEntries(REGION_TYPES.map(t => [t.id, t]));
const DISTRICT_TYPES = [{ id: 'borough', label: 'Borough' }, { id: 'district', label: 'District' }];
const PLACEMENTS = { verified: ['Verified', 'good'], source: ['Source-supported', 'info'], unverified: ['Placement unverified', 'warn'], conflict: ['Sources conflict', 'bad'] };
/* The hierarchy the sources support. Regions without borders show "Not drawn yet"; conflicting canon is flagged, never resolved silently. */
const HOW_IT_WORKS = 'https://newa-site.vercel.app/how-it-works';
const PENN_A_ARTICLE = 'https://newa-site.vercel.app/news/penn-a-joins-the-union-after-years-of-isolation-as-new-transit-ll5h';
const SEED_REGIONS = [
  { id: 'union', type: 'union', name: 'United States', code: 'US', parentId: null, slot: null, founded: '', tagline: 'The Union — every state and territory on file.', placement: 'verified', source: 'How New A works', sourceUrl: HOW_IT_WORKS },
  { id: 'new-a', type: 'state', name: 'New A', code: 'NA', parentId: 'union', slot: 0, founded: '2013', tagline: 'The State of New A — the Governor’s jurisdiction; owns the Metro.', placement: 'verified', source: 'How New A works', sourceUrl: HOW_IT_WORKS },
  { id: 'new-a-city', type: 'city', name: 'New A City', code: 'NAC', parentId: 'new-a', slot: 0, founded: '2013', tagline: 'Five boroughs governed by the Mayor from City Hall.', placement: 'verified', source: 'How New A works', sourceUrl: HOW_IT_WORKS },
  { id: 'new-j-state', type: 'state', name: 'New J', code: 'NJ', parentId: 'union', slot: 7, founded: '2014', tagline: 'The Garden State.', placement: 'conflict', typeNote: '“How New A works” (Aug 2026) lists New J as a district beyond New A City; the Oct 2 2026 Penn A article lists it as a Union member in its own right.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
  { id: 'north-c-region', type: 'region', name: 'North C', code: 'NC', parentId: 'union', slot: 5, founded: '2014–2016', tagline: 'Reached by the early rail lines; its GDP rose after the Chicago addition.', placement: 'conflict', typeNote: '“How New A works” lists North C as a district beyond the city (under the State of New A); the Oct 2 2026 article lists it as a Union member. Administrative type not confirmed.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
  { id: 'penn-a', type: 'state', name: 'Penn A', code: 'PA', parentId: 'union', slot: 8, founded: '2026', tagline: 'Admitted to the Union in 2026 after years of isolation; a new bridge links it to Long Island.', placement: 'source', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE, effectiveYear: 2026, effectiveHalf: 'L' },
  { id: 'south-c', type: 'region', name: 'South C', code: 'SC', parentId: 'union', slot: 9, founded: '', tagline: '', placement: 'unverified', typeNote: 'Named as a Union member in the Oct 2 2026 article; administrative type not confirmed.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
  { id: 'v-beach', type: 'region', name: 'V Beach', code: 'VB', parentId: 'union', slot: 6, founded: '2014–2016', tagline: 'The beach getaway — slow to reach, worth the trip.', placement: 'unverified', typeNote: 'Named as a Union member in the Oct 2 2026 article; administrative type not confirmed.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
  { id: 'chicago', type: 'region', name: 'Chicago', code: 'CHI', parentId: 'union', slot: 10, founded: '', tagline: '', placement: 'unverified', typeNote: 'Named as a Union member in the Oct 2 2026 article; whether it is a city inside a state is not confirmed.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
  { id: 'washington-dc', type: 'federal-district', name: 'Washington D.C.', code: 'DC', parentId: 'union', slot: 11, founded: '', tagline: 'Where the White House is finally under construction.', placement: 'unverified', typeNote: 'Named as a Union member in the Oct 2 2026 article; federal-district type inferred from the name — confirm.', source: 'Penn A joins the Union (Oct 2 2026)', sourceUrl: PENN_A_ARTICLE },
];
/* legacy district ids → the region each hangs under after the upgrade */
const LEGACY_DISTRICT_PARENTS = { 'man-a': 'new-a-city', 'new-bk': 'new-a-city', 'new-s': 'new-a-city', 'new-b': 'new-a-city', 'long-island': 'new-a-city', 'new-j': 'new-j-state', 'north-c': 'north-c-region', 'v-beach': 'v-beach' };
/* the five boroughs as seeded by v1/v2 (used only when a fresh store is seeded) */
const SEED_BOROUGHS = [
  { id: 'man-a',       code: 'MA', name: 'Man A',       slot: 0, founded: '2013',      tagline: 'The central business district — Lower, Central and Midtown; home of the supertalls.' },
  { id: 'new-bk',      code: 'BK', name: 'New BK',      slot: 1, founded: '2013',      tagline: 'The first borough. Downtown was rebuilt in 2023 around New BK Tower.' },
  { id: 'new-s',       code: 'NS', name: 'New S',       slot: 2, founded: '2014–2016', tagline: 'Founded in the Silent Growth years, reached by the first redstone rail lines.' },
  { id: 'new-b',       code: 'NB', name: 'New B',       slot: 3, founded: '2026',      tagline: 'The upper district — New A’s newest borough.' },
  { id: 'long-island', code: 'LI', name: 'Long Island', slot: 4, founded: '2022–2024', tagline: 'Split from New BK by the highway during the Solidification years.' },
];

/* ---- building lifecycle: physical · market · heritage are independent ---- */
const PHYSICAL = [
  { id: 'planned',      label: 'Planned',            glyph: '◌', tone: 'muted' },
  { id: 'construction', label: 'Under construction', glyph: '◧', tone: 'warn' },
  { id: 'standing',     label: 'Standing',           glyph: '▮', tone: 'neutral' },
  { id: 'closed',       label: 'Standing · closed',  glyph: '▯', tone: 'muted' },
  { id: 'vacant-lot',   label: 'Vacant lot',         glyph: '▢', tone: 'muted' },
  { id: 'demolished',   label: 'Demolished',         glyph: '✕', tone: 'bad' },
];
const PHYSICAL_BY_ID = Object.fromEntries(PHYSICAL.map(s => [s.id, s]));
const physicalOf = id => PHYSICAL_BY_ID[id] || PHYSICAL_BY_ID.standing;
const MARKET = [
  { id: '',          label: 'Not on the market', glyph: '·', tone: 'muted' },
  { id: 'for-sale',  label: 'For sale',          glyph: '◈', tone: 'good' },
  { id: 'for-lease', label: 'For lease',         glyph: '◇', tone: 'good' },
  { id: 'sold',      label: 'Sold',              glyph: '◆', tone: 'info' },
  { id: 'leased',    label: 'Leased',            glyph: '◆', tone: 'info' },
];
const marketOf = id => MARKET.find(m => m.id === (id || '')) || MARKET[0];
/* the single legacy `status` field v1/v2 used — kept in sync as a summary so older readers (and the public site) keep working */
const STATUSES = [
  { id: 'standing',     label: 'Standing',           glyph: '▮', tone: 'neutral' },
  { id: 'for-sale',     label: 'For sale',           glyph: '◈', tone: 'good' },
  { id: 'sold',         label: 'Sold',               glyph: '◆', tone: 'info' },
  { id: 'construction', label: 'Under construction', glyph: '◧', tone: 'warn' },
  { id: 'landmark',     label: 'Landmark',           glyph: '✦', tone: 'gold' },
  { id: 'vacant',       label: 'Vacant lot',         glyph: '▢', tone: 'muted' },
  { id: 'demolished',   label: 'Demolished',         glyph: '✕', tone: 'bad' },
];
const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0];
const HALVES = [{ id: '', label: 'Half unknown', short: '' }, { id: 'E', label: 'Early (Jan–Jun)', short: 'Early' }, { id: 'L', label: 'Late (Jul–Dec)', short: 'Late' }];

/* ---- roads & transit ---- */
const ROAD_TYPES = [['avenue', 'Avenue'], ['street', 'Street'], ['boulevard', 'Boulevard'], ['highway', 'Highway'], ['parkway', 'Parkway'], ['bridge', 'Bridge'], ['tunnel', 'Tunnel'], ['path', 'Path / walkway'], ['alley', 'Alley'], ['rail-row', 'Rail right-of-way'], ['other', 'Other']];
const ROAD_TYPE_LABEL = Object.fromEntries(ROAD_TYPES);
const GRADES = [['surface', 'Surface'], ['elevated', 'Elevated'], ['bridge', 'Bridge'], ['tunnel', 'Tunnel']];
const GRADE_LABEL = Object.fromEntries(GRADES);
const DIRECTIONS = [['two-way', 'Two-way'], ['one-way', 'One-way'], ['pedestrian', 'Pedestrian only'], ['restricted', 'Restricted access']];
/* which way a one-way road runs, relative to the order its points were drawn in */
const ONEWAY_DIRS = [[1, 'First point → last point (as drawn)'], [-1, 'Last point → first point (reversed)']];
const DRIVE_BLOCKS_PER_SEC = 11;     // a galloping horse / a car on the roads; walking is 4.3, sprinting 5.6
const ROAD_COLORS = { avenue: '#8AA4B8', street: '#6F8494', boulevard: '#9BB3C4', highway: '#FFB454', parkway: '#7FB2A0', bridge: '#E0C63A', tunnel: '#7F6AAE', path: '#5F7484', alley: '#4D5F6E', 'rail-row': '#9C8600', other: '#6F8494' };
const TRANSIT_MODES = [['subway', 'Subway / Metro'], ['rail', 'Rail'], ['bus', 'Bus'], ['tram', 'Tram / light rail'], ['ferry', 'Ferry'], ['cable', 'Cable / gondola'], ['other', 'Other']];
const MODE_LABEL = Object.fromEntries(TRANSIT_MODES);
const LINE_STYLES = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
const LINE_STATUSES = [['planned', 'Planned', 'muted'], ['construction', 'Under construction', 'warn'], ['partial', 'Partly open', 'info'], ['open', 'Open', 'good'], ['closed', 'Closed', 'bad']];
/* service hours: regular (not stated) · 24/7 · daytime · rush hours only · custom window */
const SERVICE_HOURS = [['', 'Regular hours (5 am – 1 am)'], ['24/7', '24/7 — round the clock'], ['day', 'Daytime only (6 am – midnight)'], ['peak', 'Rush hours only (6–10 · 16–20)'], ['custom', 'Custom window']];
const STATION_GRADES = [['', 'Not recorded'], ['underground', 'Underground'], ['surface', 'At grade'], ['elevated', 'Elevated']];
/* construction cost model (editable under settings): per station by grade, per block of track by grade, per mode multiplier */
const TRANSIT_COST_DEFAULTS = { stationUnderground: 450e6, stationSurface: 60e6, stationElevated: 140e6, blockTunnel: 1.1e6, blockSurface: 0.15e6, blockElevated: 0.45e6, blockBridge: 0.9e6, modeSubway: 1, modeRail: 0.8, modeTram: 0.35, modeBus: 0.05, modeOther: 0.5, contingency: 25 };
const LINE_STATUS = Object.fromEntries(LINE_STATUSES.map(([id, label, tone]) => [id, { id, label, tone }]));
const STATION_KINDS = [['station', 'Station'], ['complex', 'Station complex'], ['stop', 'Stop'], ['entrance', 'Entrance']];
const TRANSIT_COLORS = ['#4FE3FF', '#FFB454', '#B99CFF', '#5FE38E', '#FF86CF', '#7FB2FF', '#E0C63A', '#FF8A75', '#5FE0E0', '#C2DE5A', '#F6F6F6', '#9A9A9A'];

/* ---- businesses ---- */
const BIZ_CATEGORIES = ['Real estate', 'Retail', 'Restaurant / food', 'Finance', 'Technology', 'Media', 'Hospitality', 'Transportation', 'Construction', 'Government', 'Education', 'Health', 'Culture / entertainment', 'Utilities', 'Religious', 'Other'];
const ORG_TYPES = [['company', 'Company'], ['person', 'Person'], ['government', 'Government body'], ['nonprofit', 'Non-profit'], ['other', 'Other']];
const BIZ_STATUSES = [['planned', 'Planned', 'muted'], ['open', 'Operating', 'good'], ['closed', 'Closed', 'bad'], ['relocated', 'Relocated', 'info']];
const BIZ_STATUS = Object.fromEntries(BIZ_STATUSES.map(([id, label, tone]) => [id, { id, label, tone }]));
const TENANCY_ROLES = [['owner', 'Owner'], ['tenant', 'Tenant'], ['developer', 'Developer'], ['operator', 'Operator'], ['anchor', 'Anchor tenant'], ['hq', 'Headquarters']];
const ROLE_LABEL = Object.fromEntries(TENANCY_ROLES);
const REVENUE_BASIS = [['recorded', 'Recorded', 'good'], ['estimated', 'Estimated', 'warn'], ['simulated', 'Simulated (market)', 'muted']];
const BASIS = Object.fromEntries(REVENUE_BASIS.map(([id, label, tone]) => [id, { id, label, tone }]));
const CURRENCIES = [['USD', '$ US dollars'], ['EMR', '◆ emeralds']];
const LISTING_KINDS = [['sale', 'For sale'], ['lease', 'For lease']];

/* ---- navigation ---- */
const NAV = [
  { id: 'overview', label: 'Home', icon: 'home', key: 'O', title: 'Home — city health, the scope at a glance, charts, league tables (O)' },
  { id: 'map', label: 'Map', icon: 'map', key: 'M', title: 'Map — explore like Google Maps, or switch to Edit to draw borders, roads, transit and buildings (M)' },
  { id: 'registry', label: 'Registry', icon: 'rows', key: 'R', title: 'Every building in the scope (R)' },
  { id: 'transit', label: 'Transit', icon: 'transit', key: 'T', title: 'Transit — lines, stations, service map, travel times, planning sandbox (T)' },
  { id: 'civic', label: 'Civic', icon: 'civic', key: 'C', title: 'Civic — hospitals, police, fire, city halls, government offices, officials and their residences, coverage (C)' },
  { id: 'businesses', label: 'Business', icon: 'biz', key: 'B', title: 'Businesses — operators, tenants, listings, revenue (B)' },
  { id: 'history', label: 'History', icon: 'hist', key: 'H', title: 'History — playback, demolished records, chronicle, statistics (H)' },
  { id: 'site', label: 'Site', icon: 'site', key: 'S', title: 'Site link — City Hall: publish the registry, photos and the basemap; read the site back; stories, alerts, approvals and the market queue (S)' },
];

/* ---- civic facilities & government ---- */
const CIVIC_TYPES = [
  ['hospital', 'Hospital', 'H', 'beds'], ['clinic', 'Clinic / health centre', '+', 'beds'], ['police', 'Police station', 'P', 'officers'], ['fire', 'Fire station', 'F', 'engines'],
  ['city-hall', 'City Hall', 'C', 'desks'], ['white-house', 'White House', 'W', 'residents'], ['capitol', 'Capitol / legislature', 'L', 'seats'], ['courthouse', 'Courthouse', 'J', 'courtrooms'],
  ['gov-office', 'Government office', 'G', 'desks'], ['post-office', 'Post office', 'M', ''], ['school', 'School', 'S', 'students'], ['university', 'University', 'U', 'students'], ['library', 'Library', 'B', 'seats'],
  ['park', 'Park / recreation', '▲', 'visitors'], ['transit-hub', 'Transit hub / terminal', 'T', 'platforms'], ['utility', 'Utility · water · power', 'E', ''], ['prison', 'Prison / jail', 'X', 'cells'], ['embassy', 'Embassy / consulate', 'D', ''], ['military', 'Military / guard', 'A', ''],
  ['residence', 'Official residence', 'R', 'residents'], ['monument', 'Monument / memorial', '★', ''], ['other', 'Other civic', '•', ''],
].map(([id, label, glyph, unit]) => ({ id, label, glyph, unit }));
const CIVIC_BY_ID = Object.fromEntries(CIVIC_TYPES.map(t => [t.id, t]));
const civicTypeLabel = id => CIVIC_BY_ID[id]?.label || id || '';
const CIVIC_STATUSES = [['planned', 'Planned', 'muted'], ['construction', 'Under construction', 'warn'], ['operating', 'Operating', 'good'], ['closed', 'Closed', 'bad'], ['replaced', 'Replaced', 'info']];
const CIVIC_STATUS = Object.fromEntries(CIVIC_STATUSES.map(([id, label, tone]) => [id, { id, label, tone }]));
const ESSENTIAL_CIVIC = ['hospital', 'police', 'fire'];
const CONDITIONS = [['', 'Not assessed'], ['excellent', 'Excellent'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor']];
const OFFICE_KINDS = ['Mayor', 'Governor', 'President', 'Deputy mayor', 'Council member', 'Commissioner', 'Judge', 'Chief of police', 'Fire commissioner', 'Senator', 'Representative', 'Ambassador', 'Other'];
const OFFICIAL_STATUSES = [['serving', 'Serving', 'good'], ['elect', 'Elect', 'info'], ['former', 'Former', 'muted']];
/* ---- transit service: defaults per mode (blocks per second · minutes between trains · seconds at a stop) ---- */
const SERVICE_DEFAULTS = { subway: { speed: 8, headwayMin: 5, dwellSec: 10 }, rail: { speed: 8, headwayMin: 10, dwellSec: 15 }, bus: { speed: 4.3, headwayMin: 8, dwellSec: 8 }, tram: { speed: 5, headwayMin: 6, dwellSec: 8 }, ferry: { speed: 4, headwayMin: 15, dwellSec: 30 }, cable: { speed: 3, headwayMin: 4, dwellSec: 10 }, other: { speed: 5, headwayMin: 10, dwellSec: 10 } };
const TIME_BASES = [['estimated', 'Estimated', 'muted'], ['measured', 'Measured', 'good'], ['scheduled', 'Scheduled', 'info']];
const TIME_BASIS = Object.fromEntries(TIME_BASES.map(([id, label, tone]) => [id, { id, label, tone }]));
/* ---- valuations: every factor is a percentage, editable under Vault & settings ---- */
const VALUATION_DEFAULTS = { version: 2, fallbackPerBlock: 250000, transitLinesStep: 1.5, transitLinesCap: 4.5, transitCap: 25, cornerLot: 3, newBuild: 4, aged: -3, transitNear: 15, transitMid: 8, transitFar: 3, transitNone: -5, transit247: 6, transitConstruction: 0.35, transitPlanned: 0.1, transitPartial: 0.6, hospital: 4, police: 3, fire: 3, park: 5, school: 2, servicesCap: 12, landmark: 10, floorStep: 2, floorCap: 30, excellent: 8, fair: -8, poor: -20, construction: -20, closed: -15, vacantLot: -65, officeCondo: 10, industrial: -10, defaultArea: 300 };
const PROJECT_STAGES = [['idea', 'Idea', 'muted'], ['planning', 'Planning', 'info'], ['construction', 'Under construction', 'warn'], ['open', 'Open', 'good'], ['renovation', 'Renovation', 'warn'], ['demolition', 'Demolition', 'bad'], ['done', 'Done', 'good'], ['abandoned', 'Abandoned', 'muted']];
const PROJECT_STAGE = Object.fromEntries(PROJECT_STAGES.map(([id, label, tone]) => [id, { id, label, tone }]));
