/* =====================================================================
   §0b  v2 · HISTORICAL RECORD SYSTEM — reference data
   ─────────────────────────────────────────────────────────────────────
   A building whose status is "demolished" is a HISTORICAL record. It keeps
   its immutable `id` (all relationships point at ids, never at numbers).
   New historical records are numbered in their own series, H-MA-0001…;
   parcels (the land under buildings) get MA-P-0001…; current buildings keep
   MA-0001… exactly as before. Every number series only ever counts up, so
   a retired number is never reissued.                                     */

/* Relationship types. `dir` says which side of the edge the RECORD holding the
   relation sits on: fwd = it is the predecessor, back = it is the successor,
   both = symmetric. `kind` groups the two spellings of one edge.           */
const RELATION_TYPES = [
  { id: 'replaced_by',        kind: 'replaced', dir: 'fwd',  label: 'Replaced by',            hint: 'this was demolished and the linked building rose on its site' },
  { id: 'replaced',           kind: 'replaced', dir: 'back', label: 'Replaced',               hint: 'this building rose on the site of the linked (demolished) building' },
  { id: 'same_site_as',       kind: 'same',     dir: 'both', label: 'Same site as',           hint: 'occupied the same site at another time, no direct replacement claimed' },
  { id: 'parcel_split_into',  kind: 'split',    dir: 'fwd',  label: 'Site split into',        hint: 'its lot was divided; the linked building stands on one piece' },
  { id: 'parcel_split_from',  kind: 'split',    dir: 'back', label: 'Split from the site of', hint: 'this building stands on a piece of the linked building’s former lot' },
  { id: 'parcel_merged_into', kind: 'merged',   dir: 'fwd',  label: 'Site merged into',       hint: 'its lot was combined with others into the linked building’s lot' },
  { id: 'parcel_merged_from', kind: 'merged',   dir: 'back', label: 'Merged from the site of', hint: 'this building’s lot absorbed the linked building’s lot' },
];
const RELATION_BY_ID = Object.fromEntries(RELATION_TYPES.map(r => [r.id, r]));
/* label of an edge of `kind` seen from the predecessor [0] or the successor [1] */
const KIND_LABELS = { replaced: ['Replaced by', 'Replaced'], split: ['Site split into', 'Split from the site of'], merged: ['Site merged into', 'Merged from the site of'], same: ['Same site as', 'Same site as'] };

/* Evidence quality — an old save and a hazy memory should not weigh the same. */
const CONFIDENCE = [
  { id: 'confirmed',   label: 'Confirmed',       hint: 'seen in a dated save, or dated evidence' },
  { id: 'high',        label: 'High confidence', hint: 'strong evidence with minor gaps' },
  { id: 'approximate', label: 'Approximate',     hint: 'roughly placed in time' },
  { id: 'uncertain',   label: 'Uncertain',       hint: 'memory or weak evidence' },
];
const CONF_ORDER = Object.fromEntries(CONFIDENCE.map((c, i) => [c.id, i]));
const SOURCE_TYPES = [['save', 'World save'], ['screenshot', 'Screenshot'], ['video', 'Video / recording'], ['map', 'Map / render'], ['chat', 'Chat log / post'], ['memory', 'Memory'], ['document', 'Document / notes'], ['other', 'Other']];
const SOURCE_LABEL = Object.fromEntries(SOURCE_TYPES);
const DEMOLITION_REASONS = ['Redevelopment', 'Replaced by a taller building', 'Road / rail construction', 'Fire / griefing', 'Abandoned', 'Rezoning', 'World reset', 'Unknown'];
const FABRIC_YEARS = [2014, 2015, 2016, 2017, 2018, 2020];   // "original fabric" = built by this year

/* =====================================================================
   §1  REFERENCE DATA — NYC-style codes adapted for New A
   ===================================================================== */
const TAX_CLASSES = [
  { id: '1', label: 'Class 1 — houses (1–3 family), small condos, vacant residential land' },
  { id: '2', label: 'Class 2 — apartments, co-ops & condos (4+ units)' },
  { id: '3', label: 'Class 3 — utility equipment & infrastructure' },
  { id: '4', label: 'Class 4 — commercial, industrial, civic, everything else' },
];

/* Building classification (letter = family, digit = construction / use detail) */
const CLASS_CATS = {
  A: 'One family dwellings', B: 'Two family dwellings', C: 'Walk-up apartments', D: 'Elevator apartments',
  E: 'Warehouses', F: 'Factories & industrial', G: 'Garages & gas stations', H: 'Hotels', I: 'Hospitals & health',
  J: 'Theatres', K: 'Store buildings', L: 'Lofts', M: 'Religious facilities', N: 'Asylums & homes', O: 'Office buildings',
  P: 'Indoor public assembly & culture', Q: 'Outdoor recreation', R: 'Condominiums', S: 'Mixed-use residential',
  T: 'Transportation facilities', U: 'Utility', V: 'Vacant land', W: 'Educational', Y: 'Government', Z: 'Miscellaneous',
};
const BUILDING_CLASSES = [
  ['A0','Cape Cod'],['A1','Two stories, detached (small or mid)'],['A2','One story, permanent living quarters'],['A3','Large suburban residence'],['A4','City residence, one family'],['A5','One family attached or semi-detached'],['A6','Summer cottage'],['A7','Mansion type or town house'],['A8','Bungalow colony, cooperatively owned land'],['A9','Miscellaneous one family'],
  ['B1','Two family brick'],['B2','Two family frame'],['B3','Two family converted from one family'],['B9','Miscellaneous two family'],
  ['C0','Three families'],['C1','Over six families without stores'],['C2','Five to six families'],['C3','Four families'],['C4','Old law tenement'],['C5','Converted dwelling or rooming house'],['C6','Walk-up cooperative'],['C7','Walk-up apartments over six families with stores'],['C8','Walk-up co-op; conversion from loft/warehouse'],['C9','Garden apartments'],['CB','Walk-up apartments, fewer than 11 units'],['CC','Walk-up co-op, fewer than 11 units'],['CM','Mobile homes / trailer park'],
  ['D0','Elevator co-op; conversion from loft/warehouse'],['D1','Elevator apartments, semi-fireproof without stores'],['D2','Elevator apartments, artists in residence'],['D3','Elevator apartments, fireproof without stores'],['D4','Elevator cooperative'],['D5','Elevator apartments, converted'],['D6','Elevator apartments, fireproof with stores'],['D7','Elevator apartments, semi-fireproof with stores'],['D8','Elevator apartments, luxury type'],['D9','Elevator apartments, miscellaneous'],['DB','Elevator apartments, fewer than 11 units'],['DC','Elevator co-op, fewer than 11 units'],
  ['E1','General warehouse'],['E2','Contractor’s warehouse'],['E7','Self-storage warehouse'],['E9','Miscellaneous warehouse'],
  ['F1','Factory, heavy manufacturing, fireproof'],['F2','Factory, special construction, fireproof'],['F4','Factory, industrial semi-fireproof'],['F5','Factory, light manufacturing'],['F8','Tank farm'],['F9','Factory, industrial miscellaneous'],
  ['G0','Garage, residential (tax class 1)'],['G1','Parking garage'],['G2','Auto body / collision or auto repair'],['G3','Gas station with retail store'],['G4','Gas station with service / auto repair'],['G5','Gas station only'],['G6','Licensed parking lot'],['G7','Unlicensed parking lot'],['G8','Car sales / rental with showroom'],['G9','Miscellaneous garage'],['GU','Car sales or rental lot without showroom'],['GW','Car wash'],
  ['H1','Luxury hotel'],['H2','Full service hotel'],['H3','Limited service hotel'],['H4','Motel'],['H5','Private club hotel, luxury type'],['H6','Apartment hotel'],['H7','Apartment hotel, cooperatively owned'],['H8','Dormitory'],['H9','Miscellaneous hotel'],['HB','Boutique hotel (10–100 rooms)'],['HH','Hostel'],['HR','SRO — single room occupancy'],['HS','Extended stay suites'],
  ['I1','Hospital, sanitarium, mental institution'],['I2','Infirmary'],['I3','Dispensary'],['I4','Hospital staff facility'],['I5','Health center, child center, clinic'],['I6','Nursing home'],['I7','Adult care facility'],['I9','Miscellaneous health facility'],
  ['J1','Theatre, art type, under 400 seats'],['J2','Theatre, art type, over 400 seats'],['J3','Motion picture theatre with balcony'],['J4','Legitimate theatre, sole use'],['J5','Theatre in mixed-use building'],['J6','Television studio'],['J7','Off-Broadway type theatre'],['J8','Multiplex picture theatre'],['J9','Miscellaneous theatre'],
  ['K1','One story retail building'],['K2','Multi-story retail building'],['K3','Multi-story department store'],['K4','Predominant retail with other uses'],['K5','Stand-alone food establishment'],['K6','Shopping center'],['K7','Banking facility'],['K8','Big box retail'],['K9','Miscellaneous store building'],
  ['L1','Loft, over 8 stories (mid-Man A type)'],['L2','Loft, fireproof & storage type without stores'],['L3','Loft, semi-fireproof'],['L8','Loft with retail stores'],['L9','Miscellaneous loft'],
  ['M1','Church, synagogue, chapel'],['M2','Mission house (non-residential)'],['M3','Parsonage, rectory'],['M4','Convent'],['M9','Miscellaneous religious facility'],
  ['N1','Asylum'],['N2','Home for children, aged or homeless'],['N3','Orphanage'],['N9','Miscellaneous asylum or home'],
  ['O1','Office only, 1 story'],['O2','Office only, 2–6 stories'],['O3','Office only, 7–19 stories'],['O4','Office, 20 stories or more'],['O5','Office with commercial, 1–6 stories'],['O6','Office with commercial, 7–19 stories'],['O7','Professional building / funeral home'],['O8','Office with apartments only'],['O9','Miscellaneous & old style bank buildings'],
  ['P1','Concert hall'],['P2','Lodge room'],['P3','YMCA / community athletic club'],['P4','Beach club'],['P5','Community center'],['P6','Amusement place, bath house, boat house'],['P7','Museum'],['P8','Library'],['P9','Miscellaneous indoor public assembly'],
  ['Q1','Park / recreation facility'],['Q2','Playground'],['Q3','Outdoor pool'],['Q4','Beach'],['Q5','Golf course'],['Q6','Stadium, race track, ball field'],['Q7','Tennis court'],['Q8','Marina, yacht club'],['Q9','Miscellaneous outdoor recreation'],
  ['R0','Special condominium billing lot'],['R1','Condo, residential unit in 2–10 unit building'],['R2','Condo, residential unit in walk-up building'],['R3','Condo, residential unit in 1–3 story building'],['R4','Condo, residential unit in elevator building'],['R5','Condo, miscellaneous commercial'],['R6','Condo, residential unit of 1–3 unit building'],['R7','Condo, commercial unit of 1–3 unit building'],['R8','Condo, commercial unit of 2–10 unit building'],['R9','Co-op within a condominium'],['RA','Condo, cultural / medical / educational'],['RB','Condo, office space'],['RG','Condo, indoor parking'],['RH','Condo, hotel'],['RK','Condo, retail space'],['RP','Condo, outdoor parking'],['RR','Condominium rentals'],['RS','Condo, non-business storage'],['RT','Condo, terraces / gardens / cabanas'],['RW','Condo, warehouse / factory / industrial'],
  ['S0','Primarily 1 family with 2 stores or offices'],['S1','Primarily 1 family with 1 store or office'],['S2','Primarily 2 family with 1 store or office'],['S3','Primarily 3 family with 1 store or office'],['S4','Primarily 4 family with 1 store or office'],['S5','Primarily 5–6 family with 1 store or office'],['S9','Dwelling with stores or offices'],
  ['T1','Airport, air field, terminal'],['T2','Pier, dock, bulkhead'],['T9','Miscellaneous transportation facility'],
  ['U0','Utility company land & buildings'],['U1','Bridge, tunnel, highway'],['U2','Gas or electric utility'],['U3','Ceiling railroad'],['U4','Telephone utility'],['U5','Communications facility'],['U6','Railroad, private ownership'],['U7','Transportation, public ownership'],['U8','Revocable consent'],['U9','Miscellaneous utility property'],
  ['V0','Vacant land zoned residential'],['V1','Vacant land zoned commercial or Man A residential'],['V2','Vacant land zoned commercial adjacent to class 1'],['V3','Vacant land zoned primarily residential (not class 1)'],['V4','Police or fire department land'],['V5','School site or yard'],['V6','Library, hospital or museum land'],['V7','Port authority land'],['V8','State or federal government land'],['V9','Miscellaneous vacant land'],
  ['W1','Public elementary, junior or senior high school'],['W2','Parochial school'],['W3','School or academy'],['W4','Training school'],['W5','City university'],['W6','Other college or university'],['W7','Theological seminary'],['W8','Other private school'],['W9','Miscellaneous educational facility'],
  ['Y1','Fire department'],['Y2','Police department'],['Y3','Prison, jail, house of detention'],['Y4','Military / naval installation'],['Y5','Department of real estate'],['Y6','Department of sanitation'],['Y7','Department of ports & terminals'],['Y8','Department of public works'],['Y9','Miscellaneous government facility'],
  ['Z0','Tennis court, pool, shed etc.'],['Z1','Court house'],['Z2','Public parking area'],['Z3','Post office'],['Z4','Foreign government'],['Z5','United Nations'],['Z7','Easement'],['Z8','Cemetery'],['Z9','Other miscellaneous'],
].map(([code, desc]) => ({ code, desc, cat: code[0] }));
const CLASS_BY_CODE = Object.fromEntries(BUILDING_CLASSES.map(c => [c.code, c]));
const classDesc = code => CLASS_BY_CODE[code]?.desc || (code ? CLASS_CATS[code[0]] || '' : '');

/* Seven class families (fixed colour slots) for the class-mix chart */
const CLASS_FAMILIES = ['Houses & mixed-use', 'Apartments', 'Condos', 'Commercial & office', 'Industrial & utility', 'Civic & institutional', 'Vacant land'];
function classFamily(code) {
  const L = (code || '')[0]?.toUpperCase();
  if (!L) return null;
  if ('ABS'.includes(L)) return 'Houses & mixed-use';
  if ('CD'.includes(L)) return 'Apartments';
  if (L === 'R') return 'Condos';
  if ('KOLHJ'.includes(L)) return 'Commercial & office';
  if ('EFGTU'.includes(L)) return 'Industrial & utility';
  if (L === 'V') return 'Vacant land';
  return 'Civic & institutional';
}
/* Suggested tax class from the building class (editable in the form) */
function suggestTaxClass(code) {
  const c = (code || '').toUpperCase(); const L = c[0];
  if (!L) return '';
  if ('AB'.includes(L) || ['S0','S1','S2','V0','G0'].includes(c)) return '1';
  if ('CD'.includes(L) || L === 'S' || (L === 'R' && /R[0-46-9]/.test(c))) return '2';
  if (L === 'U') return '3';
  return '4';
}

/* Zoning districts. family: R residential · C commercial · M manufacturing · X other */
const ZONING = [
  ['R1-1','R','Single-family detached on large lots · FAR 0.5'],['R1-2','R','Single-family detached · FAR 0.5'],['R2','R','Single-family detached · FAR 0.5 · 40 ft lots'],['R2A','R','Single-family, low-rise context · 35 ft max'],['R2X','R','Larger single-family homes · FAR 0.85'],
  ['R3-1','R','Detached & semi-detached · FAR 0.5 · 35 ft'],['R3-2','R','Low-rise attached & small apartments · FAR 0.5'],['R3A','R','Modest homes on narrow lots'],['R3X','R','Detached only, 35 ft lots'],
  ['R4','R','Mixed low-rise housing · FAR 0.75'],['R4-1','R','Detached & semi-detached · FAR 0.75'],['R4A','R','Detached only · FAR 0.75'],['R4B','R','Row houses · FAR 0.9 · 24 ft'],['R5','R','Multi-family low-rise · FAR 1.25 · 40 ft'],['R5A','R','Detached · FAR 1.1'],['R5B','R','Three-story row houses · FAR 1.35'],['R5D','R','Contextual row / small apartments · FAR 2.0'],
  ['R6','R','Mid-density apartments · FAR to 2.43 / 3.0 QH'],['R6A','R','Contextual mid-rise · FAR 3.0 · 70 ft'],['R6B','R','Row house preservation · FAR 2.0 · 50 ft'],
  ['R7-1','R','Medium density · FAR to 3.44 / 4.0 QH'],['R7-2','R','Medium density towers-in-park · FAR to 3.44 / 4.0'],['R7A','R','Contextual · FAR 4.0 · 80 ft'],['R7B','R','Contextual · FAR 3.0 · 75 ft'],['R7D','R','Contextual · FAR 4.2 · 100 ft'],['R7X','R','Contextual · FAR 5.0 · 125 ft'],
  ['R8','R','Higher density · FAR to 6.02'],['R8A','R','Contextual · FAR 6.02 · 120 ft'],['R8B','R','Contextual · FAR 4.0 · 75 ft'],['R8X','R','Contextual · FAR 6.02 · 150 ft'],
  ['R9','R','High density towers · FAR to 7.52'],['R9A','R','Contextual · FAR 7.52 · 145 ft'],['R9D','R','Contextual · FAR 9.0 · 175 ft'],['R9X','R','Contextual · FAR 9.0 · 170 ft'],
  ['R10','R','Highest density · FAR 10.0 (12.0 w/ bonus)'],['R10A','R','Contextual · FAR 10.0 · 210 ft'],['R10X','R','Tower on a base · FAR 10.0'],
  ['C1-6','C','Local retail, mixed · comm FAR 2.0 (R7 equivalent)'],['C1-7','C','Local retail, mixed · R8 equivalent'],['C1-8','C','Local retail, mixed · R9 equivalent'],['C1-9','C','Local retail, mixed · R10 equivalent'],
  ['C2-6','C','Local service, mixed · R7 equivalent'],['C2-7','C','Local service, mixed · R8 equivalent'],['C2-8','C','Local service, mixed · R9/R10 equivalent'],
  ['C3','C','Waterfront recreation · FAR 0.5'],['C3A','C','Waterfront recreation, contextual'],
  ['C4-1','C','Regional commercial, outlying · FAR 1.0'],['C4-2','C','Regional commercial · FAR 3.4'],['C4-3','C','Regional commercial · FAR 3.4'],['C4-4','C','Regional commercial · FAR 3.4'],['C4-4A','C','Regional commercial, contextual · 80 ft'],['C4-4D','C','Regional commercial, contextual · 125 ft'],['C4-5','C','Regional commercial · FAR 3.4'],['C4-5X','C','Regional commercial, contextual · 125 ft'],['C4-6','C','Regional commercial, Man A · FAR 3.4 / res 10.0'],['C4-7','C','Regional commercial, Man A · FAR 10.0'],
  ['C5-1','C','Central commercial · FAR 4.0'],['C5-2','C','Central commercial · FAR 10.0'],['C5-2.5','C','Central commercial, Midtown · FAR 12.0'],['C5-3','C','Central commercial, Midtown · FAR 15.0'],['C5-5','C','Central commercial, Lower Man A · FAR 15.0'],
  ['C6-1','C','Heavy commercial · FAR 6.0'],['C6-2','C','Heavy commercial · FAR 6.0'],['C6-3','C','Heavy commercial · FAR 6.0'],['C6-4','C','Heavy commercial, dense · FAR 10.0'],['C6-5','C','Heavy commercial, dense · FAR 10.0'],['C6-6','C','Heavy commercial, Midtown · FAR 15.0'],['C6-7','C','Heavy commercial, Midtown · FAR 15.0'],['C6-9','C','Heavy commercial, Lower Man A · FAR 15.0'],
  ['C7','C','Amusement park · FAR 2.0 · no residential'],['C8-1','C','Automotive & heavy service · FAR 1.0'],['C8-2','C','Automotive & heavy service · FAR 2.0'],['C8-3','C','Automotive & heavy service · FAR 2.0'],['C8-4','C','Automotive & heavy service · FAR 5.0'],
  ['M1-1','M','Light manufacturing · FAR 1.0'],['M1-2','M','Light manufacturing · FAR 2.0'],['M1-3','M','Light manufacturing · FAR 5.0'],['M1-4','M','Light manufacturing · FAR 2.0'],['M1-5','M','Light manufacturing · FAR 5.0'],['M1-5A','M','Light mfg, artist lofts (SoHo type)'],['M1-6','M','Light manufacturing · FAR 10.0'],['M1-6D','M','Light mfg with residential · FAR 12.0'],
  ['M2-1','M','Medium manufacturing · FAR 2.0'],['M2-2','M','Medium manufacturing · FAR 5.0'],['M2-3','M','Medium manufacturing, Man A · FAR 2.0'],['M2-4','M','Medium manufacturing, Man A · FAR 5.0'],
  ['M3-1','M','Heavy manufacturing · FAR 2.0'],['M3-2','M','Heavy manufacturing, no parking · FAR 2.0'],
  ['MX','X','Mixed use (paired M1 + R district)'],['PARK','X','Public park — not zoned'],['BPC','X','Special waterfront district'],['SD','X','Special purpose district (name it in Special)'],
].map(([code, family, desc]) => ({ code, family, desc }));
const ZONING_BY_CODE = Object.fromEntries(ZONING.map(z => [z.code, z]));
const zoningDesc = code => ZONING_BY_CODE[code]?.desc || '';
const zoningFamily = code => { const c = (code || '').toUpperCase(); if (!c) return null; if (ZONING_BY_CODE[c]) return ZONING_BY_CODE[c].family; return /^R/.test(c) ? 'R' : /^C/.test(c) ? 'C' : /^M/.test(c) ? 'M' : 'X'; };
const ZONING_FAMILY_NAMES = { R: 'Residential', C: 'Commercial', M: 'Manufacturing', X: 'Special / other' };
const OVERLAYS = ['', 'C1-1', 'C1-2', 'C1-3', 'C1-4', 'C1-5', 'C2-1', 'C2-2', 'C2-3', 'C2-4', 'C2-5'];
