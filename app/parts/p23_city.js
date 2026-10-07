/* =====================================================================
   §23 CITY — explainable valuations · city health · place profiles ·
       change digest → newsletter draft · data-quality assistant ·
       project tracker with evidence · public guide export
   ===================================================================== */
const VAL = () => ({ ...VALUATION_DEFAULTS, ...(S.settings.valuation || {}) });
/* ---- valuations: base × (1 + Σ factors), every factor named with its reason ---- */
function nearbyComparables(b, radius = 200) { if (b.x == null || b.z == null) return { n: 0, radius, vals: [] }; const vals = S.buildings.filter(x => x.id !== b.id && isCompleted(x) && x.x != null && x.z != null && num(x.assessTotal) && lotAreaOf(x) && dist2([b.x, b.z], [x.x, x.z]) <= radius).map(x => num(x.assessTotal) / lotAreaOf(x)); return { n: vals.length, radius, vals }; }
function basePerBlock(b) {
  const pool = rows => rows.filter(x => x.id !== b.id && isCompleted(x) && num(x.assessTotal) && lotAreaOf(x)).map(x => num(x.assessTotal) / lotAreaOf(x));
  const nb = nearbyComparables(b); if (nb.n >= 3) return { perBlock: median(nb.vals), basis: `median of ${nb.n} assessed buildings within ${nb.radius} blk`, n: nb.n };
  let vals = pool(buildingsIn(b.districtId)); let basis = 'district median';
  if (vals.length < 3) { vals = pool(S.buildings); basis = 'city-wide median'; }
  if (vals.length < 3) return { perBlock: VAL().fallbackPerBlock, basis: 'fallback setting', n: vals.length };
  return { perBlock: median(vals), basis, n: vals.length };
}
function valueEstimate(b) {
  const V = VAL(); const factors = []; const add = (id, label, p, why) => { if (p) factors.push({ id, label, pct: p, why }); };
  const lot = lotAreaOf(b), fp = footprintAreaOf(b); const area = lot ?? fp ?? V.defaultArea; const areaBasis = lot != null ? 'lot area' : fp != null ? 'measured footprint' : `default ${V.defaultArea} blk² — no lot size`;
  let base, baseBasis, perBlock;
  if (num(b.assessTotal)) { base = num(b.assessTotal); baseBasis = `assessed total${b.assessYear ? ' (' + b.assessYear + ')' : ''}`; perBlock = base / area; }
  else { const pb = basePerBlock(b); perBlock = pb.perBlock; base = perBlock * area; baseBasis = `${fmtMoney(Math.round(perBlock))} per blk² (${pb.basis}${pb.n ? ' of ' + pb.n + ' assessed' : ''}) × ${fmtInt(area)} blk² ${areaBasis}`; }
  for (const f of transitValueFactors(b, V)) add(...f);
  if (b.x != null) {
    const pt = [b.x, b.z]; let svc = 0;
    for (const t of ESSENTIAL_CIVIC) { const n = nearestCivic(pt, t); if (n && n.d <= COVERAGE_RADIUS[t]) { svc += V[t]; add(t, civicTypeLabel(t), V[t], `${n.b.name || titleOf(n.b)} ${Math.round(n.d)} blk`); } }
    const park = nearestCivic(pt, 'park'); if (park && park.d <= COVERAGE_RADIUS.park) { svc += V.park; add('park', 'Park', V.park, `${park.b.name || titleOf(park.b)} ${Math.round(park.d)} blk`); }
    const school = nearestCivic(pt, 'school'); if (school && school.d <= COVERAGE_RADIUS.school) { svc += V.school; add('school', 'School', V.school, `${school.b.name || titleOf(school.b)} ${Math.round(school.d)} blk`); }
    if (svc > V.servicesCap) add('services-cap', 'Services cap', V.servicesCap - svc, `services are capped at +${V.servicesCap}%`);
  } else add('unplaced', 'No coordinates', 0, '');
  if (b.landmark) add('landmark', 'Landmark', V.landmark, 'designated landmark');
  const fl = num(b.floors); if (fl > 1) add('floors', 'Floors', Math.min(V.floorCap, (fl - 1) * V.floorStep), `${fl} floors · +${V.floorStep}% per floor above the first, capped at ${V.floorCap}%`);
  if (b.condition === 'excellent') add('condition', 'Condition', V.excellent, 'excellent'); else if (b.condition === 'fair') add('condition', 'Condition', V.fair, 'fair'); else if (b.condition === 'poor') add('condition', 'Condition', V.poor, 'poor');
  const ph = b.physical || 'standing'; if (ph === 'construction' || ph === 'planned') add('status', 'Status', V.construction, physicalOf(ph).label.toLowerCase()); else if (ph === 'closed') add('status', 'Status', V.closed, 'standing but closed'); else if (ph === 'vacant-lot') add('status', 'Status', V.vacantLot, 'vacant lot — land only');
  const fam = classFamily(b.bldgClass); if (fam === 'Commercial & office' || fam === 'Condos') add('class', 'Class', V.officeCondo, fam.toLowerCase()); else if (fam === 'Industrial & utility') add('class', 'Class', V.industrial, fam.toLowerCase());
  const totalPct = factors.reduce((a, f) => a + f.pct, 0); const value = Math.max(0, Math.round(base * (1 + totalPct / 100)));
  const confidence = num(b.assessTotal) ? 'assessment-based' : lot != null ? 'comparables' : 'rough';
  return { value, base, baseBasis, perBlock, area, areaBasis, factors, totalPct, confidence, version: V.version, at: now() };
}
function valuationOf(b) { const ov = b.valuationOverride; if (ov && num(ov.value) != null) return { value: num(ov.value), override: true, reason: ov.reason || '', at: ov.at, est: valueEstimate(b) }; return { ...valueEstimate(b), override: false }; }
function recordValuations(rows, label = '') { let n = 0; for (const b of rows) { if (isHist(b)) continue; const e = valueEstimate(b); const entry = { at: e.at, value: e.value, totalPct: e.totalPct, base: e.base, version: e.version, confidence: e.confidence, label }; b.valuations = [...(b.valuations || []).slice(-23), entry]; b.valuation = { value: e.value, at: e.at, version: e.version, confidence: e.confidence }; n++; } commit(); return n; }
function valuationSectionHTML(b) {
  if (isHist(b)) return ''; const v = valuationOf(b); const e = v.override ? v.est : v; const kv = kvHTML; const hist = (b.valuations || []).slice(-6).reverse();
  const assessed = num(b.assessTotal); const delta = assessed ? Math.round((v.value - assessed) / assessed * 100) : null;
  return `<div class="secthead">ESTIMATED VALUE <span class="muted" style="letter-spacing:0;font-weight:400">· explainable · ${v.override ? 'manual override' : e.confidence}</span><span class="acts"><button class="btn sm" data-act="val-record" title="Store today's estimate in this record's valuation history">${icon('clock')} Record</button></span></div>
  <div class="kv">${kv('ESTIMATE', `${fmtMoney(v.value)}${v.override ? `<small>override${v.reason ? ' · ' + esc(v.reason) : ''} · model says ${fmtMoney(e.value)}</small>` : delta != null ? `<small>${delta >= 0 ? '+' : ''}${delta}% vs assessed</small>` : ''}`, 'num money')}${kv('BASE', `${fmtMoney(Math.round(e.base))}<small>${esc(e.baseBasis)}</small>`, 'num')}</div>
  <div class="valfactors">${e.factors.length ? e.factors.map(f => `<div class="vf ${f.pct > 0 ? 'up' : f.pct < 0 ? 'down' : ''}"><span class="p">${f.pct > 0 ? '+' : ''}${f.pct}%</span><span class="l">${esc(f.label)}</span><span class="w">${esc(f.why)}</span></div>`).join('') : '<div class="desc-line">No adjustments apply.</div>'}<div class="vf total"><span class="p">${e.totalPct > 0 ? '+' : ''}${e.totalPct}%</span><span class="l">Total adjustment</span><span class="w">factors are percentages set under Vault &amp; settings</span></div></div>
  ${hist.length ? `<div class="desc-line" style="margin-top:8px">HISTORY · ${hist.map(h => `${fmtDate(h.at).split(',')[0]} ${fmtMoneyCompact(h.value)}`).join(' · ')}</div>` : ''}`;
}
function valuationEditorHTML(b) { const ov = b.valuationOverride || {}; return `<div class="fsect"><h4>VALUE OVERRIDE <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">leave blank to use the explainable estimate</span></h4><div class="frow"><div class="f"><label for="f-valOverride">Your valuation</label><div class="pre"><span>$</span><input id="f-valOverride" class="num" type="number" min="0" step="1000" value="${esc(ov.value ?? '')}"></div></div><div class="f span"><label for="f-valReason">Reason</label><input id="f-valReason" value="${esc(ov.reason || '')}" placeholder="agreed sale, appraisal, your judgement…"></div></div></div>`; }
function readValuationForm(b) { if (!$('#f-valOverride')) return; const v = num($('#f-valOverride').value); b.valuationOverride = v != null ? { value: v, reason: ($('#f-valReason')?.value || '').trim(), at: now() } : null; }
function openValuationModal(sc = UI.scope) {
  const rows = scopeActive(sc).filter(isCompleted).map(b => ({ b, v: valuationOf(b) })).sort((a, b) => b.v.value - a.v.value); const total = rows.reduce((a, x) => a + x.v.value, 0); const assessed = rows.filter(x => num(x.b.assessTotal)).length;
  openModal({ title: `Estimated values · ${scopeName(sc)}`, kicker: `${rows.length} BUILDINGS · ${fmtMoneyCompact(total)}`, cls: 'wide',
    body: `<p class="muted" style="font-size:12.5px;margin:10px 0">Each value is the assessed total (or a per-block comparable) adjusted by named factors — transit, essential services, landmark status, floors, condition, status and class. Open a building to read every factor. ${assessed} of ${rows.length} start from a real assessment; the rest are comparables and rougher.</p>
      <div class="tablewrap" style="max-height:420px"><table class="reg metrics"><thead><tr><th>BUILDING</th><th>PLACE</th><th class="r">ASSESSED</th><th class="r">ESTIMATE</th><th class="r">ADJ.</th><th>CONFIDENCE</th></tr></thead><tbody>${rows.slice(0, 200).map(x => `<tr data-open="${x.b.id}" style="cursor:pointer"><td><b>${esc(x.b.name || titleOf(x.b))}</b> <span class="muted">${esc(x.b.reg)}</span></td><td>${esc(districtById(x.b.districtId)?.name || '')}</td><td class="num r">${fmtMoney(num(x.b.assessTotal))}</td><td class="num r hi">${fmtMoney(x.v.value)}</td><td class="num r">${x.v.override ? 'override' : `${x.v.totalPct > 0 ? '+' : ''}${x.v.totalPct}%`}</td><td>${x.v.override ? '<span class="mk info">MANUAL</span>' : `<span class="mk ${x.v.confidence === 'assessment-based' ? 'good' : x.v.confidence === 'comparables' ? 'warn' : 'muted'}">${x.v.confidence.toUpperCase()}</span>`}</td></tr>`).join('')}</tbody></table></div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Close</button><span class="spacer"></span><button class="btn" data-act="val-record-all">${icon('clock')} Record today's estimates (${rows.length})</button>` });
}

/* ---- city health: eight cards, each with a reason and a place to go ---- */
function cityHealth(sc = UI.scope) {
  const rows = scopeBuildings(sc); const act = rows.filter(isActive); const done = act.filter(isCompleted); const cards = [];
  const nowI = hyIndex(CURRENT_YEAR, CURRENT_HALF);
  const recent = done.filter(b => { const i = builtIndex(b); return i != null && i > nowI - 4; }).length; const prev = done.filter(b => { const i = builtIndex(b); return i != null && i <= nowI - 4 && i > nowI - 8; }).length;
  cards.push({ id: 'growth', label: 'GROWTH', value: recent, unit: 'built · 2 yrs', sub: prev ? `${recent >= prev ? '+' : ''}${recent - prev} vs the two years before` : recent ? 'first completions on record' : 'no dated completions lately', tone: recent > prev ? 'good' : recent < prev ? 'warn' : '', score: prev ? clamp(Math.round(recent / prev * 50), 0, 100) : recent ? 60 : 20 });
  const uw = act.filter(isUnderWay); cards.push({ id: 'pipeline', label: 'PIPELINE', value: uw.length, unit: 'under way', sub: `${uw.filter(b => b.physical === 'construction').length} building · ${uw.filter(b => b.physical === 'planned').length} planned`, tone: uw.length ? 'good' : '', score: clamp(Math.round(uw.length / Math.max(1, done.length) * 500), 0, 100) });
  const vacLots = act.filter(b => b.physical === 'vacant-lot').length, closed = act.filter(b => b.physical === 'closed').length; const vacPct = pct(vacLots + closed, act.length);
  cards.push({ id: 'vacancy', label: 'VACANCY', value: vacPct, unit: '%', sub: `${vacLots} vacant lot${vacLots === 1 ? '' : 's'} · ${closed} closed`, tone: vacPct > 15 ? 'bad' : vacPct > 7 ? 'warn' : 'good', score: clamp(100 - vacPct * 4, 0, 100) });
  const placed = act.filter(b => b.x != null); const sv = placed.map(b => buildingService(b)).filter(Boolean); const wn = sv.filter(x => x.near && x.near.d <= SERVICE_REACH).length; const tp = pct(wn, sv.length); const anyStation = S.stations.some(s => s.x != null && linesAtStation(s).some(l => l.status === 'open'));
  cards.push({ id: 'transit', label: 'TRANSIT ACCESS', value: tp, unit: '%', sub: !anyStation ? 'no open station on file yet' : sv.length ? `within ${SERVICE_REACH} blk of an open station · ${sv.length} placed` : 'no placed buildings', tone: !anyStation ? '' : tp >= 70 ? 'good' : tp >= 40 ? 'warn' : sv.length ? 'bad' : '', score: anyStation ? tp : null });
  const cov = coverageReport(sc); const anyEssential = S.buildings.some(b => isCivic(b) && ESSENTIAL_CIVIC.includes(civicOf(b).type) && civicOperating(b) && b.x != null); cards.push({ id: 'civic', label: 'ESSENTIAL SERVICES', value: cov.score, unit: '%', sub: anyEssential ? `hospital · police · fire within reach · ${civicRows(sc).filter(civicOperating).length} facilities operating` : 'mark hospitals, police and fire stations under Civic', tone: !anyEssential ? '' : cov.score >= 70 ? 'good' : cov.score >= 40 ? 'warn' : cov.placed ? 'bad' : '', score: anyEssential ? cov.score : null });
  const units = sum(act, b => num(b.unitsRes)); cards.push({ id: 'housing', label: 'HOMES', value: fmtCompact(units), unit: 'units', sub: `${act.filter(b => num(b.unitsRes)).length} of ${act.length} buildings report units`, tone: '', score: null });
  const issues = allIssues(sc); const bad = issues.filter(i => i.level === 'bad').length; cards.push({ id: 'quality', label: 'DATA QUALITY', value: bad, unit: bad === 1 ? 'problem' : 'problems', sub: `${issues.filter(i => i.level === 'warn').length} warnings · ${issues.filter(i => i.level === 'info').length} notes`, tone: bad ? 'bad' : issues.length > 20 ? 'warn' : 'good', score: clamp(100 - bad * 10 - issues.length, 0, 100) });
  const scored = cards.filter(c => c.score != null); const overall = scored.length ? Math.round(scored.reduce((a, c) => a + c.score, 0) / scored.length) : 0;
  return { cards, overall };
}
function renderHealthCards(sc = UI.scope) {
  const h = cityHealth(sc);
  return `<section class="health" aria-label="City health"><div class="hcard overall ${h.overall >= 70 ? 'good' : h.overall >= 40 ? 'warn' : 'bad'}"><div class="k">CITY HEALTH</div><div class="v"><span class="count" data-to="${h.overall}">0</span><small>/100</small></div><div class="s">${esc(scopeName(sc))} · ${h.cards.filter(c => c.score != null).length} measures</div></div>${h.cards.map(c => `<button class="hcard ${c.tone}" data-act="health-open" data-id="${c.id}" title="Open the detail"><div class="k">${c.label}</div><div class="v">${typeof c.value === 'number' ? `<span class="count" data-to="${c.value}">0</span>` : esc(String(c.value))}${c.unit ? `<small>${esc(c.unit)}</small>` : ''}</div><div class="s">${esc(c.sub)}</div></button>`).join('')}</section>`;
}
function healthOpen(id) {
  switch (id) {
    case 'growth': UI.hseg = 'playback'; setNav('history'); break;
    case 'pipeline': UI.filters.physical = 'construction'; setNav('registry'); break;
    case 'vacancy': UI.filters.physical = 'vacant-lot'; setNav('registry'); break;
    case 'transit': UI.tseg = 'service'; setNav('transit'); break;
    case 'civic': UI.cseg = 'coverage'; setNav('civic'); break;
    case 'housing': UI.sort = { key: 'unitsRes', dir: -1 }; setNav('registry'); break;
    case 'value': openValuationModal(); break;
    case 'quality': openIssuesModal(); break;
  }
}

/* ---- place profiles: a readable paragraph set, derived only from the records ---- */
function placeProfile(sc = UI.scope) {
  const node = scopeNode(sc); const name = scopeName(sc); const kind = sc.kind === 'all' ? 'world' : sc.kind === 'region' ? (REGION_TYPE[node?.type]?.label || 'region').toLowerCase() : sc.kind === 'district' ? (node?.type === 'borough' ? 'borough' : 'district') : 'neighborhood';
  const rows = scopeBuildings(sc); const act = rows.filter(isActive); const done = act.filter(isCompleted); const hist = rows.filter(isHist); const years = done.map(b => num(b.yearBuilt)).filter(Boolean); const med = median(years);
  const fam = topCounts(act, b => classFamily(b.bldgClass), 3); const tallest = act.filter(heightOf).sort((a, b) => heightOf(b) - heightOf(a))[0]; const landmarks = act.filter(b => b.landmark).length;
  const lines = S.lines.filter(l => lineInScope(l, sc) && l.status === 'open'); const stations = S.stations.filter(s => stationInScope(s, sc)); const placed = act.filter(b => b.x != null); const sv = placed.map(b => buildingService(b)).filter(Boolean); const w5 = pct(sv.filter(x => x.near && x.near.d <= SERVICE_REACH).length, sv.length);
  const civ = civicRows(sc); const civTypes = topCounts(civ, b => civicTypeLabel(civicOf(b).type), 4); const cov = coverageReport(sc); const offs = officialsIn(sc).filter(o => o.status === 'serving'); const biz = S.businesses.filter(z => bizInScope(z, sc) && z.status === 'open');
  const nowI = hyIndex(CURRENT_YEAR, CURRENT_HALF); const lastYear = { built: done.filter(b => { const i = builtIndex(b); return i != null && i > nowI - 2; }).length, demolished: hist.filter(b => { const i = demolishedIndex(b); return i != null && i > nowI - 2; }).length, started: act.filter(b => { const i = startedIndex(b); return i != null && i > nowI - 2 && isUnderWay(b); }).length };
  const p = [];
  p.push(`${name} ${kind === 'world' ? 'holds' : `is a ${kind} with`} ${done.length} standing building${done.length === 1 ? '' : 's'}${hist.length ? ` and ${hist.length} demolished on record` : ''}${med ? `; the typical building dates from ${med} (${eraOf(med)?.name || ''})` : ''}.${node?.tagline ? ' ' + node.tagline : ''}`);
  if (fam.length) p.push(`The fabric is mostly ${fam.map(f => `${f.n} ${f.k.toLowerCase()}`).join(', ')}${landmarks ? `, with ${landmarks} designated landmark${landmarks === 1 ? '' : 's'}` : ''}${tallest ? `. The tallest is ${tallest.name || titleOf(tallest)} at ${fmtInt(heightOf(tallest))} blocks` : ''}.`);
  p.push(lines.length || stations.length ? `Transit: ${lines.length} open line${lines.length === 1 ? '' : 's'} and ${stations.length} station${stations.length === 1 ? '' : 's'}; ${sv.length ? `${w5}% of placed buildings are within ${SERVICE_REACH} blocks of a station` : 'no buildings are placed yet, so access cannot be measured'}.` : 'No transit is on file here yet.');
  p.push(civ.length ? `Civic: ${civ.length} facilit${civ.length === 1 ? 'y' : 'ies'} (${civTypes.map(t => `${t.n} ${t.k.toLowerCase()}`).join(', ')}); essential coverage ${cov.score}%.${offs.length ? ` ${offs.length} official${offs.length === 1 ? '' : 's'} serve${offs.length === 1 ? 's' : ''} here${offs.filter(residenceOf).length ? `, ${offs.filter(residenceOf).length} with a home on file` : ''}.` : ''}` : `No civic facilities are recorded${offs.length ? `, though ${offs.length} official${offs.length === 1 ? '' : 's'} serve here` : ''}.`);
  if (biz.length) p.push(`${biz.length} business${biz.length === 1 ? ' is' : 'es are'} operating here.`);
  p.push(`In the last year: ${lastYear.built} completed, ${lastYear.started} started, ${lastYear.demolished} demolished.`);
  return { name, kind, node, paragraphs: p, counts: { standing: done.length, hist: hist.length, lines: lines.length, stations: stations.length, civic: civ.length, officials: offs.length, businesses: biz.length }, tallest, med, w5, cov, lastYear };
}
function renderProfilePanel(sc = UI.scope) {
  const pr = placeProfile(sc);
  return `<section class="panel hud profile" style="margin-bottom:18px"><div class="panel-head"><h3>PROFILE · ${esc(pr.name.toUpperCase())}</h3><span class="note">written from the records · nothing invented</span></div>
    <div class="ptext">${pr.paragraphs.map(t => `<p>${esc(t)}</p>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="profile-copy">${icon('copy')} Copy</button><button class="btn sm" data-act="export-guide" title="A standalone HTML page for ${esc(pr.name)} — public records only">${icon('down')} Public guide</button><button class="btn sm" data-act="digest-open">${icon('news')} Change digest</button><button class="btn sm" data-act="val-open">${icon('db')} Estimated values</button></div></section>`;
}
/* ---- public guide: a standalone page with only what is marked public ---- */
function publicGuideHTML(sc = UI.scope) {
  const pr = placeProfile(sc); const pub = S.settings.publishing || {}; const rows = scopeActive(sc).filter(b => b.public !== false).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const civ = civicRows(sc).filter(b => b.public !== false); const lines = S.lines.filter(l => lineInScope(l, sc)); const offs = officialsIn(sc).filter(o => o.status !== 'former');
  const row = b => `<tr><td>${esc(b.reg)}</td><td>${esc(titleOf(b))}${b.name && addressOf(b) ? ` <small>${esc(b.name)}</small>` : ''}</td><td>${esc(districtById(b.districtId)?.name || '')}${hoodById(b.neighborhoodId) ? ' · ' + esc(hoodById(b.neighborhoodId).name) : ''}</td><td>${esc(physicalOf(b.physical).label)}${b.landmark ? ' ✦' : ''}</td><td>${b.yearBuilt != null ? esc(hyLabel(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox)) : ''}</td><td>${b.floors ?? ''}</td>${pub.publicNotes ? `<td>${esc(truncate(b.notes || '', 120))}</td>` : ''}</tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pr.name)} · New A guide</title>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>:root{color-scheme:dark}body{margin:0;background:#05090D;color:#DCE9F0;font:15px/1.55 "Bricolage Grotesque",system-ui,sans-serif;padding:32px 20px;max-width:1100px;margin:0 auto}h1{font-family:Silkscreen,monospace;font-size:28px;letter-spacing:.04em;margin:0 0 4px;color:#4FE3FF}h2{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#A9B8C7;margin:34px 0 10px}p{margin:0 0 10px;max-width:72ch}.k{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.14em;color:#6F8494;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #16232D;vertical-align:top}th{font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:.12em;color:#6F8494}td small{color:#8AA4B8}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.card{border:1px solid #16232D;border-radius:8px;padding:12px 14px;background:#0A121A}.card b{display:block;font-size:16px}.foot{margin-top:40px;color:#6F8494;font-size:12px}</style></head><body>
<div class="k">NEW A OS · PUBLIC GUIDE · ${esc(pr.kind.toUpperCase())}</div><h1>${esc(pr.name)}</h1>
${pr.paragraphs.map(t => `<p>${esc(t)}</p>`).join('')}
<h2>Civic facilities</h2>${civ.length ? `<div class="grid">${civ.map(b => { const c = civicOf(b); return `<div class="card"><span class="k">${esc(civicTypeLabel(c.type))}</span><b>${esc(b.name || titleOf(b))}</b>${addressOf(b) && b.name ? esc(addressOf(b)) + '<br>' : ''}${esc((CIVIC_STATUS[c.status] || CIVIC_STATUS.operating).label)}${num(c.capacity) != null ? ` · ${fmtInt(c.capacity)} ${esc(CIVIC_BY_ID[c.type]?.unit || '')}` : ''}</div>`; }).join('')}</div>` : '<p>None recorded.</p>'}
<h2>Officials</h2>${offs.length ? `<div class="grid">${offs.map(o => `<div class="card"><span class="k">${esc(o.office || 'Official')}</span><b>${esc(o.name || '—')}</b>${o.jurisdictionId && nodeById(o.jurisdictionId) ? esc(nodeById(o.jurisdictionId).name) : ''}${officeOf(o) ? `<br>Office: ${esc(officeOf(o).name || titleOf(officeOf(o)))}` : ''}</div>`).join('')}</div>` : '<p>None recorded.</p>'}
<h2>Transit</h2>${lines.length ? `<table><thead><tr><th>Line</th><th>Mode</th><th>Status</th><th>Stops</th><th>Headway</th><th>End to end</th></tr></thead><tbody>${lines.map(l => `<tr><td><b style="color:${esc(l.color)}">${esc(l.shortName || l.name)}</b> ${esc(l.name)}</td><td>${esc(MODE_LABEL[l.mode] || l.mode)}</td><td>${esc((LINE_STATUS[l.status] || LINE_STATUS.open).label)}</td><td>${stationsOf(l).length}</td><td>${lineService(l).headwayMin} min</td><td>${lineEndToEnd(l) != null ? fmtMins(lineEndToEnd(l)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p>None recorded.</p>'}
<h2>Buildings · ${rows.length}</h2><table><thead><tr><th>Reg</th><th>Building</th><th>Place</th><th>Status</th><th>Completed</th><th>Floors</th>${pub.publicNotes ? '<th>Notes</th>' : ''}</tr></thead><tbody>${rows.map(row).join('')}</tbody></table>
<div class="foot">Generated by New A OS on ${esc(fmtDate(now()))} from the private registry. Only records marked public are included; owners, assessments${pub.publicNotes ? '' : ', notes'} and sources are never exported here. Nothing on this page was posted anywhere.</div></body></html>`;
}
function exportPublicGuide(sc = UI.scope) { downloadText(`new-a-guide-${slug(scopeName(sc))}.html`, publicGuideHTML(sc), 'text/html'); toast('Public guide downloaded — a standalone page, nothing posted', 'good'); }

/* ---- change digest → newsletter draft (saved locally, never posted) ---- */
function changeDigest({ sc = UI.scope, sinceDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - sinceDays * 864e5).toISOString(); const cd = new Date(cutoff); const fromI = hyIndex(cd.getFullYear(), cd.getMonth() < 6 ? 'E' : 'L'); const nowI = hyIndex(CURRENT_YEAR, CURRENT_HALF);
  const rows = scopeBuildings(sc); const inWin = i => i != null && i >= fromI && i <= nowI; const ids = scopeDistrictIds(sc);
  const d = { cutoff, sinceDays, fromI, added: rows.filter(b => (b.created || '') >= cutoff), updated: rows.filter(b => (b.updated || '') >= cutoff && (b.created || '') < cutoff), completed: rows.filter(b => isActive(b) && isCompleted(b) && inWin(builtIndex(b))), started: rows.filter(b => isUnderWay(b) && inWin(startedIndex(b))), demolished: rows.filter(b => isHist(b) && inWin(demolishedIndex(b))), landmarks: rows.filter(b => b.landmark && (b.updated || '') >= cutoff), listings: rows.filter(b => (b.market === 'for-sale' || b.market === 'for-lease') && (b.updated || '') >= cutoff) };
  d.roads = S.roads.filter(r => (r.created || '') >= cutoff && roadInScope(r, sc)); d.lines = S.lines.filter(l => ((l.created || '') >= cutoff || inWin(l.yearOpened != null ? hyIndex(l.yearOpened, l.halfOpened) : null)) && lineInScope(l, sc)); d.stations = S.stations.filter(s => (s.created || '') >= cutoff && stationInScope(s, sc));
  d.businesses = S.businesses.filter(z => (z.created || '') >= cutoff && bizInScope(z, sc)); d.officials = S.officials.filter(o => (o.created || '') >= cutoff || (o.updated || '') >= cutoff).filter(o => sc.kind === 'all' || officialsIn(sc).includes(o)); d.projects = S.projects.filter(p => (p.updated || '') >= cutoff);
  d.archive = S.archive.filter(a => (a.created || '') >= cutoff && (sc.kind === 'all' || !a.districtId || ids.has(a.districtId))); d.applied = (S.news.log || []).filter(l => l.at >= cutoff && !l.undone);
  d.total = ['added', 'completed', 'started', 'demolished', 'roads', 'lines', 'stations', 'businesses', 'officials', 'projects', 'archive'].reduce((a, k) => a + d[k].length, 0);
  return d;
}
function digestMarkdown(d, sc = UI.scope) {
  const name = scopeName(sc); const L = []; const bl = b => `- ${b.reg} · ${titleOf(b)}${b.name && addressOf(b) ? ` (${b.name})` : ''} — ${districtById(b.districtId)?.name || ''}${hoodById(b.neighborhoodId) ? ', ' + hoodById(b.neighborhoodId).name : ''}`;
  L.push(`# ${name} — what changed in the last ${d.sinceDays} days`, '', `_Drafted by New A OS on ${fmtDate(now())} from the registry. Every line below points at a record; nothing was invented. Edit freely before publishing._`, '');
  if (d.completed.length) L.push('## Completed', ...d.completed.map(b => `${bl(b)} — completed ${hyLabel(b.yearBuilt, b.halfBuilt, b.yearBuiltApprox)}${b.floors ? `, ${b.floors} floors` : ''}`), '');
  if (d.started.length) L.push('## Broke ground', ...d.started.map(b => `${bl(b)} — started ${hyLabel(b.yearStarted, b.halfStarted, b.yearStartedApprox)}${b.yearExpected ? `, expected ${hyLabel(b.yearExpected, b.halfExpected)}` : ''}`), '');
  if (d.demolished.length) L.push('## Demolished', ...d.demolished.map(b => `${bl(b)} — demolished ${hyLabel(b.yearDemolished, b.halfDemolished, b.yearDemolishedApprox)}${b.demolitionReason ? ` (${b.demolitionReason})` : ''}`), '');
  if (d.lines.length || d.stations.length) L.push('## Transit', ...d.lines.map(l => `- Line ${lineLabel(l)} — ${(LINE_STATUS[l.status] || LINE_STATUS.open).label.toLowerCase()}, ${stationsOf(l).length} stops${lineEndToEnd(l) != null ? `, ${fmtMins(lineEndToEnd(l))} end to end` : ''}`), ...d.stations.map(s => `- Station ${s.name || s.reg} — ${linesAtStation(s).map(lineLabel).join(', ') || 'no line yet'}`), '');
  if (d.officials.length) L.push('## Government', ...d.officials.map(o => `- ${o.office || 'Official'}${o.name ? ': ' + o.name : ''} — ${officialStatus(o).label.toLowerCase()}${o.jurisdictionId && nodeById(o.jurisdictionId) ? ', ' + nodeById(o.jurisdictionId).name : ''}${residenceOf(o) ? `, lives at ${residenceOf(o).name || titleOf(residenceOf(o))}` : ''}`), '');
  if (d.businesses.length) L.push('## Business', ...d.businesses.map(z => `- ${bizLabel(z)}${z.category ? ` (${z.category})` : ''} — ${(BIZ_STATUS[z.status] || BIZ_STATUS.open).label.toLowerCase()}`), '');
  if (d.listings.length) L.push('## On the market', ...d.listings.map(b => `${bl(b)} — ${marketOf(b.market).label.toLowerCase()}${num(b.listPrice) ? ` at ${fmtMoney(num(b.listPrice))}` : ''}`), '');
  if (d.projects.length) L.push('## Projects', ...d.projects.map(p => `- ${p.name || p.reg} — ${(PROJECT_STAGE[p.stage] || PROJECT_STAGE.idea).label.toLowerCase()}${p.log?.length ? `: ${p.log[p.log.length - 1].text}` : ''}`), '');
  if (d.added.length) L.push(`## New in the registry (${d.added.length})`, ...d.added.slice(0, 30).map(bl), d.added.length > 30 ? `- … and ${d.added.length - 30} more` : '', '');
  if (d.archive.length) L.push(`## Chronicle`, ...d.archive.map(a => `- ${a.year}${a.month ? '-' + String(a.month).padStart(2, '0') : ''} · ${a.title || 'untitled'}${a.districtId && districtById(a.districtId) ? ` — ${districtById(a.districtId).name}` : ''}`), '');
  if (!d.total) L.push('_Nothing changed in this period._');
  return L.filter(x => x !== null).join('\n');
}
function openDigestModal(sinceDays = 30) {
  const d = changeDigest({ sinceDays }); const md = digestMarkdown(d);
  openModal({ title: `Change digest · ${scopeName()}`, kicker: `${d.total} CHANGES · LAST ${sinceDays} DAYS`, cls: 'wide',
    body: `<div class="toolbar" style="margin:10px 0"><label class="field"><span>Period</span><select id="dg-days">${[7, 14, 30, 90, 180, 365].map(n => `<option value="${n}" ${n === sinceDays ? 'selected' : ''}>${n} days</option>`).join('')}</select></label><span class="muted">${d.completed.length} completed · ${d.started.length} started · ${d.demolished.length} demolished · ${d.lines.length + d.stations.length} transit · ${d.businesses.length} businesses · ${d.added.length} added</span></div>
      <textarea id="dg-text" style="width:100%;min-height:360px;font:12.5px/1.5 var(--font-mono);background:var(--bg-2);color:var(--ink);border:1px solid var(--line-2);border-radius:6px;padding:10px">${esc(md)}</textarea>
      <div class="desc-line" style="margin-top:8px">Saving keeps the draft in this registry (Inbox → Drafts) for Clawson or you to publish later. Nothing is posted to the site from here.</div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Close</button><span class="spacer"></span><button class="btn" id="dg-copy">${icon('copy')} Copy</button><button class="btn" id="dg-dl">${icon('down')} .md</button><button class="btn primary" id="dg-save">${icon('news')} Save as newsletter draft</button>`,
    onOpen: m => {
      m.querySelector('#dg-days').onchange = e => { closeModal(); openDigestModal(+e.target.value); };
      m.querySelector('#dg-copy').onclick = () => { navigator.clipboard?.writeText(m.querySelector('#dg-text').value).then(() => toast('Digest copied', 'good'), () => toast('Clipboard blocked — select the text and copy', 'warn')); };
      m.querySelector('#dg-dl').onclick = () => downloadText(`new-a-digest-${slug(scopeName())}-${stamp()}.md`, m.querySelector('#dg-text').value, 'text/markdown');
      m.querySelector('#dg-save').onclick = () => { const body = m.querySelector('#dg-text').value; S.news.drafts = [...(S.news.drafts || []), { id: uid('nd'), at: now(), title: body.split('\n')[0].replace(/^#\s*/, ''), body, status: 'draft', scope: UI.scope, sinceDays, by: 'digest' }]; commit(); closeModal(); toast('Draft saved — find it in the Inbox under Drafts', 'good'); };
    } });
}

/* ---- data-quality assistant: deterministic suggestions with explicit, snapshot-backed fixes ---- */
const districtsAtPoint = pt => S.districts.filter(d => (d.polygons || []).length && pointInPolys(pt, d.polygons) !== 'out');
const hoodAtPoint = (pt, districtId) => hoodsIn(districtId).find(h => (h.polygons || []).length && pointInPolys(pt, h.polygons) !== 'out') || null;
function qualitySuggestions(sc = UI.scope) {
  const act = scopeActive(sc); const out = [];
  const hood = act.filter(b => b.x != null && (!b.neighborhoodId || !hoodById(b.neighborhoodId))).map(b => ({ b, h: hoodAtPoint([b.x, b.z], b.districtId) })).filter(x => x.h);
  if (hood.length) out.push({ id: 'hood', label: 'Assign neighborhoods from drawn borders', items: hood, text: `${hood.length} building${hood.length === 1 ? '' : 's'} with coordinates inside a neighborhood border but no neighborhood set`, fix: 'Assign', detail: x => `${x.b.reg} → ${x.h.name}` });
  const wrong = act.filter(b => b.x != null).map(b => ({ b, ds: districtsAtPoint([b.x, b.z]) })).filter(x => x.ds.length && !x.ds.some(d => d.id === x.b.districtId));
  if (wrong.length) out.push({ id: 'district', label: 'Coordinates fall in another place', items: wrong, text: `${wrong.length} building${wrong.length === 1 ? '' : 's'} whose X/Z sit inside a different district border`, fix: null, detail: x => `${x.b.reg} is filed under ${districtById(x.b.districtId)?.name || '?'} but sits in ${x.ds.map(d => d.name).join(' / ')}` });
  const roads = S.roads.flatMap(r => { try { return nameLinkCandidates(r).link.map(b => ({ b, r })); } catch { return []; } }).filter(x => act.includes(x.b));
  if (roads.length) out.push({ id: 'roads', label: 'Link roads by street name', items: roads, text: `${roads.length} building${roads.length === 1 ? '' : 's'} whose street matches a drawn road but has no road link`, fix: 'Review & link', detail: x => `${x.b.reg} ${x.b.street} → ${roadLabel(x.r)}` });
  const coords = act.filter(b => b.x == null || b.z == null); if (coords.length) out.push({ id: 'coords', label: 'Buildings without coordinates', items: coords.map(b => ({ b })), text: `${coords.length} standing building${coords.length === 1 ? '' : 's'} not on the map — missing from coverage, service and valuations`, fix: null, detail: x => `${x.b.reg} · ${titleOf(x.b)}` });
  const undated = act.filter(b => !isUnderWay(b) && b.yearBuilt == null); if (undated.length) out.push({ id: 'undated', label: 'Undated buildings', items: undated.map(b => ({ b })), text: `${undated.length} without a completion year — kept out of playback and growth`, fix: null, detail: x => `${x.b.reg} · ${titleOf(x.b)}` });
  const keyOf = b => norm(`${b.number} ${b.street}`); const seen = new Map(); const dupes = []; for (const b of act) { const k = keyOf(b); if (!b.number || !b.street) continue; if (seen.has(k)) dupes.push({ b, other: seen.get(k) }); else seen.set(k, b); }
  if (dupes.length) out.push({ id: 'dupes', label: 'Possible duplicates', items: dupes, text: `${dupes.length} pair${dupes.length === 1 ? '' : 's'} share the same number and street`, fix: null, detail: x => `${x.b.reg} and ${x.other.reg} · ${addressOf(x.b)}` });
  const civ = act.filter(b => isCivic(b) && !civicOf(b).status); if (civ.length) out.push({ id: 'civic-status', label: 'Civic facilities without a status', items: civ.map(b => ({ b })), text: `${civ.length} marked civic but no facility status`, fix: 'Mark operating', detail: x => `${x.b.reg} · ${civicTypeLabel(civicOf(x.b).type)}` });
  const uncl = act.filter(b => !b.bldgClass); if (uncl.length) out.push({ id: 'class', label: 'Unclassified buildings', items: uncl.map(b => ({ b })), text: `${uncl.length} without a building class — valuations treat them as plain`, fix: null, detail: x => `${x.b.reg} · ${titleOf(x.b)}` });
  return out;
}
function qualityRowsHTML(sc = UI.scope) {
  const sug = qualitySuggestions(sc); if (!sug.length) return `<div class="desc-line" style="margin-top:10px">The assistant has nothing to suggest — borders, names, dates and links agree.</div>`;
  return `<div class="qrows">${sug.map(s => `<div class="qr"><div><div class="t">${esc(s.label)}<span class="cnt">${s.items.length}</span></div><div class="s">${esc(s.text)}</div></div><div class="acts">${s.fix ? `<button class="btn sm primary" data-act="quality-fix" data-id="${s.id}">${esc(s.fix)}</button>` : ''}<button class="btn sm ghost" data-act="quality-review" data-id="${s.id}">Review</button></div></div>`).join('')}</div>`;
}
function openQualityReview(id) {
  const s = qualitySuggestions().find(x => x.id === id); if (!s) return;
  openModal({ title: s.label, kicker: `${s.items.length} ITEMS · ${scopeName().toUpperCase()}`, cls: 'wide', body: `<p class="muted" style="font-size:12.5px;margin:10px 0">${esc(s.text)}. Click a row to open the record.</p><div class="list" style="max-height:420px;overflow:auto">${s.items.map(x => `<div class="li" data-open="${x.b.id}" role="button" style="cursor:pointer"><div><div class="t">${esc(s.detail(x))}</div></div></div>`).join('')}</div>`, foot: `<button class="btn ghost" data-act="modal-close">Close</button><span class="spacer"></span>${s.fix ? `<button class="btn primary" data-act="quality-fix" data-id="${s.id}">${esc(s.fix)} all</button>` : ''}` });
}
async function qualityFix(id) {
  const s = qualitySuggestions().find(x => x.id === id); if (!s || !s.items.length) return;
  if (id === 'roads') { closeModal(); linkAllByNameFlow(); return; }
  const r = await confirmDialog({ title: `${s.fix} ${s.items.length} record${s.items.length === 1 ? '' : 's'}?`, body: `<p>${esc(s.text)}.</p><div class="list" style="max-height:220px;overflow:auto;margin-top:8px">${s.items.slice(0, 40).map(x => `<div class="li"><div class="t" style="font-size:12.5px">${esc(s.detail(x))}</div></div>`).join('')}${s.items.length > 40 ? `<div class="desc-line">… and ${s.items.length - 40} more</div>` : ''}</div><p class="muted" style="font-size:12px;margin-top:8px">A snapshot is taken first; each record keeps a migration note saying what changed and why.</p>`, ok: s.fix }); if (r !== 'ok') return;
  await takeSnapshot(`before quality fix · ${id} · ${s.items.length}`); let n = 0;
  for (const x of s.items) { const b = byId(x.b.id); if (!b) continue; if (id === 'hood') { b.neighborhoodId = x.h.id; b.migrationNotes = [...(b.migrationNotes || []), `${fmtDate(now())}: neighborhood set to ${x.h.name} from the drawn border (data-quality assistant).`]; } else if (id === 'civic-status') { b.civic.status = 'operating'; b.migrationNotes = [...(b.migrationNotes || []), `${fmtDate(now())}: civic status set to operating (data-quality assistant).`]; } b.updated = now(); n++; }
  commit(); closeModal(); renderView(false); if (DR.id) renderDrawer(); toast(`${n} record${n === 1 ? '' : 's'} updated — snapshot kept`, 'good');
}

/* ---- project tracker: stages, linked records, log, chronicle evidence ---- */
const projectStage = p => PROJECT_STAGE[p.stage] || PROJECT_STAGE.idea;
function projectsIn(sc = UI.scope) { if (!sc || sc.kind === 'all') return S.projects; const ids = scopeDistrictIds(sc); return S.projects.filter(p => (p.districtId && ids.has(p.districtId)) || (p.buildingIds || []).some(id => { const b = byId(id); return b && ids.has(b.districtId); })); }
function renderProjectsPanel(sc = UI.scope) {
  const ps = projectsIn(sc).slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '')); const live = ps.filter(p => !['done', 'abandoned'].includes(p.stage));
  return `<section class="panel hud projects" style="margin-bottom:18px"><div class="panel-head"><h3>PROJECT TRACKER</h3><span class="note">${live.length} live · ${ps.length - live.length} closed · <button class="rowlink" data-act="project-new" style="font:inherit">+ project</button></span></div>
    ${ps.length ? `<div class="projrows">${ps.slice(0, 8).map(p => { const st = projectStage(p); const last = (p.log || [])[p.log.length - 1]; return `<div class="pr" data-act="project-open" data-id="${p.id}" role="button"><span class="status ${st.tone}"><i>●</i>${st.label}</span><div><div class="t">${esc(p.name || p.reg)}</div><div class="s">${p.districtId && districtById(p.districtId) ? esc(districtById(p.districtId).name) + ' · ' : ''}${(p.buildingIds || []).length} building${(p.buildingIds || []).length === 1 ? '' : 's'}${(p.lineIds || []).length ? ` · ${p.lineIds.length} line${p.lineIds.length === 1 ? '' : 's'}` : ''}${(p.archiveIds || []).length ? ` · ${p.archiveIds.length} evidence` : ''}${p.targetYear ? ` · target ${esc(hyLabel(p.targetYear, p.targetHalf))}` : ''}${last ? ` · ${esc(truncate(last.text, 60))}` : ''}</div></div><span class="reg">${esc(p.reg)}</span></div>`; }).join('')}</div>` : `<div class="chart-empty">No projects yet — track a tower, a line extension or a district plan with its stage, linked records, a log and chronicle evidence.</div>`}</section>`;
}
function openProjectModal(id = null) {
  const p = id ? projectById(id) : null; const d = p ? JSON.parse(JSON.stringify(p)) : Object.assign(newProject({ meta: { gseq: {} } }), { reg: '', districtId: UI.scope.kind === 'district' ? UI.scope.id : null });
  openProjectDraft(d, p);
}
function openProjectDraft(d, p) {
  const chips = (ids, kind) => ids.map(x => { const o = kind === 'building' ? byId(x) : kind === 'line' ? lineById(x) : roadById(x); return o ? `<span class="chip on" style="cursor:default">${esc(kind === 'building' ? (o.name || titleOf(o)) : kind === 'line' ? lineLabel(o) : roadLabel(o))}<button type="button" data-pj-rm="${kind}:${x}" title="Unlink">×</button></span>` : ''; }).join('');
  const arch = S.archive.slice().sort((a, b) => (b.year - a.year) || ((b.month || 0) - (a.month || 0)));
  openModal({ title: p ? `${p.name || p.reg}` : 'New project', kicker: p ? `${p.reg} · ${projectStage(p).label.toUpperCase()}` : 'PJ-#### · issued on save', cls: 'wide',
    body: `<form class="form" id="pjform" autocomplete="off" onsubmit="return false">
      <div class="frow c3">
        <div class="f" style="grid-column:span 2"><label for="f-pjname">Name</label>${inpF('pjname', d.name, 'placeholder="New BK Tower II"')}</div>
        ${fld('pjstage', 'Stage', selF('pjstage', PROJECT_STAGES.map(([i, l]) => [i, l]), d.stage))}
        ${fld('pjdistrict', 'Place', `<select id="f-pjdistrict"><option value="">— none —</option>${districtOptions(d.districtId)}</select>`)}
        <div class="f"><label>Started</label>${hyControl('pjstart', d.startedYear, d.startedHalf, false, { yearPh: '2026', withApprox: false })}</div>
        <div class="f"><label>Target</label>${hyControl('pjtarget', d.targetYear, d.targetHalf, false, { yearPh: '2027', withApprox: false })}</div>
      </div>
      <div class="desc-line" style="margin-top:12px">LINKED RECORDS</div>
      <div class="chips" id="pj-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">${chips(d.buildingIds || [], 'building')}${chips(d.lineIds || [], 'line')}${chips(d.roadIds || [], 'road')}<button type="button" class="btn sm" data-pj-add="building">${icon('bldg')} Building</button><button type="button" class="btn sm" data-pj-add="line">${icon('transit')} Line</button><button type="button" class="btn sm" data-pj-add="road">${icon('road')} Road</button></div>
      <div class="desc-line" style="margin-top:12px">EVIDENCE · CHRONICLE ENTRIES</div>
      ${arch.length ? `<div class="list" style="max-height:150px;overflow:auto;margin-top:6px">${arch.slice(0, 80).map(a => `<label class="li" style="grid-template-columns:auto 1fr;cursor:pointer"><input type="checkbox" data-pj-arch="${a.id}" ${(d.archiveIds || []).includes(a.id) ? 'checked' : ''}><div><div class="t">${a.year}${a.month ? '-' + String(a.month).padStart(2, '0') : ''} · ${esc(a.title || 'untitled')}</div><div class="s">${esc(districtById(a.districtId)?.name || '')}${a.source ? ' · ' + esc(truncate(a.source, 50)) : ''}</div></div></label>`).join('')}</div>` : '<div class="desc-line">No chronicle entries yet — add screenshots under History → Chronicle.</div>'}
      <div class="desc-line" style="margin-top:12px">LOG</div>
      <div class="rowlist" style="margin-top:6px">${(d.log || []).slice().reverse().slice(0, 8).map(e => `<div class="r"><div><div class="t" style="font-weight:400">${esc(e.text)}</div><div class="s">${fmtDate(e.at)}</div></div></div>`).join('') || '<div class="desc-line">Nothing logged yet.</div>'}</div>
      <div class="inline" style="margin-top:6px"><input id="f-pjlog" placeholder="Add a log entry — what happened, with its date in the text"><button type="button" class="btn sm" id="pj-log-add">${icon('plus')} Log</button></div>
      <div class="f span" style="margin-top:12px"><label for="f-pjnotes">Notes</label><textarea id="f-pjnotes">${esc(d.notes || '')}</textarea></div></form>`,
    foot: `${p ? `<button class="btn danger sm" data-act="project-delete" data-id="${p.id}">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" id="pj-save">${icon('check')} ${p ? 'Save' : 'Add project'}</button>`,
    onOpen: m => {
      const read = () => { const g = k => m.querySelector('#f-' + k)?.value ?? ''; d.name = g('pjname').trim(); d.stage = g('pjstage') || 'idea'; d.districtId = g('pjdistrict') || null; const a = readHY('pjstart'), b = readHY('pjtarget'); d.startedYear = a.year; d.startedHalf = a.year != null ? a.half : ''; d.targetYear = b.year; d.targetHalf = b.year != null ? b.half : ''; d.notes = g('pjnotes'); d.archiveIds = $$('[data-pj-arch]:checked', m).map(x => x.dataset.pjArch); };
      const reopen = () => { closeModal(); openProjectDraft(d, p); };
      m.querySelectorAll('[data-pj-rm]').forEach(btn => btn.onclick = () => { read(); const [kind, id] = btn.dataset.pjRm.split(':'); const key = kind === 'building' ? 'buildingIds' : kind === 'line' ? 'lineIds' : 'roadIds'; d[key] = (d[key] || []).filter(x => x !== id); reopen(); });
      m.querySelectorAll('[data-pj-add]').forEach(btn => btn.onclick = async () => { read(); const kind = btn.dataset.pjAdd; let id = null; if (kind === 'building') id = await buildingPickDialog(d.buildingIds || [], 'Link a building', 'Link'); else if (kind === 'road') id = await roadPickDialog('Link a road'); else { const r = await pickerDialog({ title: 'Link a line', kicker: 'TRANSIT LINE', label: 'Search lines', placeholder: 'Red Line…', okLabel: 'Link', items: q => genericSearch(S.lines.filter(l => !(d.lineIds || []).includes(l.id)), q, l => [l.reg, l.name, l.shortName]).map(l => ({ id: l.id, html: `<div class="optrow"><b style="color:${esc(l.color)}">${esc(l.shortName || l.reg)}</b><span class="t">${esc(l.name)}</span></div>` })) }); id = r?.id || null; } if (id) { const key = kind === 'building' ? 'buildingIds' : kind === 'line' ? 'lineIds' : 'roadIds'; d[key] = [...new Set([...(d[key] || []), id])]; } reopen(); });
      m.querySelector('#pj-log-add').onclick = () => { read(); const t = m.querySelector('#f-pjlog').value.trim(); if (!t) return; d.log = [...(d.log || []), { at: now(), text: t }]; reopen(); };
      m.querySelector('#pj-save').onclick = () => { read(); if (!d.name) { toast('Give the project a name', 'warn'); return; } saveProject(d, p); };
    } });
}
function saveProject(d, existing) {
  if (existing) Object.assign(existing, d, { id: existing.id, reg: existing.reg, created: existing.created, updated: now() });
  else { const p = newProject(S); Object.assign(p, d, { id: p.id, reg: p.reg, created: now(), updated: now() }); S.projects.push(p); }
  commit(); closeModal(); renderView(false); toast(existing ? 'Project saved' : `${S.projects[S.projects.length - 1].reg} added`, 'good');
}
async function deleteProject(id) { const p = projectById(id); if (!p) return; const r = await confirmDialog({ title: `Delete project ${p.name || p.reg}?`, body: '<p>Linked buildings, lines, roads and chronicle entries are untouched.</p>', ok: 'Delete', danger: true }); if (r !== 'ok') return; await takeSnapshot(`before deleting project ${p.reg}`); S.projects = S.projects.filter(x => x.id !== id); commit(); closeModal(); renderView(false); toast('Project deleted', 'warn'); }
function projectsOf(b) { return S.projects.filter(p => (p.buildingIds || []).includes(b.id)); }

/* ---- the editor's auto-estimate: comparables nearby + transit + services, shown before anything is saved ---- */
function draftEstimateHTML(draft) {
  const probe = { ...draft, assessTotal: null }; const e = valueEstimate(probe); const comps = nearbyComparables(probe);
  return `<div class="est"><div class="big">${fmtMoney(e.value)}</div><div class="why">base ${fmtMoney(Math.round(e.base))} — ${esc(e.baseBasis)}${e.factors.length ? ' · ' + e.factors.map(f => `${esc(f.label)} ${f.pct > 0 ? '+' : ''}${f.pct}% (${esc(f.why)})`).join(' · ') : ''} → ${e.totalPct > 0 ? '+' : ''}${e.totalPct}%${probe.x == null ? ' · add coordinates for transit and services' : comps.n ? '' : ` · no assessed buildings within ${comps.radius} blk, so the borough median is used`}</div><div class="acts"><button type="button" class="btn sm primary" data-act="estimate-apply" data-v="${e.value}">${icon('check')} Use as assessed total</button><button type="button" class="btn sm ghost" data-act="estimate-draft">${icon('redo')} Recompute</button></div></div>`;
}
