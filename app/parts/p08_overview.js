/* =====================================================================
   §8  OVERVIEW — the scope at a glance: skyline, tiles, through time,
       jurisdictions, charts, league table, averages, health, issues
   ===================================================================== */
function scopeKicker(sc = UI.scope) {
  const node = scopeNode(sc);
  if (!node) return 'EVERYTHING ON FILE · ALL JURISDICTIONS';
  if (sc.kind === 'region') { const anc = ancestorsOf(node); return `${(REGION_TYPE[node.type]?.label || node.type).toUpperCase()}${anc.length ? ' · ' + anc.map(a => a.name).join(' › ').toUpperCase() : ''}`; }
  if (sc.kind === 'district') { const p = node.parentId ? regionById(node.parentId) : null; return `${node.type === 'borough' ? 'BOROUGH' : 'DISTRICT'} · ${esc(node.code)}${p ? ' · ' + p.name.toUpperCase() : ' · UNPLACED'}`; }
  const d = districtById(node.districtId); return `NEIGHBORHOOD · ${d ? d.name.toUpperCase() : ''}`;
}
function placementHTML(node) { if (!node?.placement || node.placement === 'verified') return ''; const p = PLACEMENTS[node.placement]; return `<span class="placement ${p?.[1] || ''}" title="${esc(node.typeNote || '')}${node.source ? ' · ' + esc(node.source) : ''}">${esc(p?.[0] || node.placement)}</span>`; }
function renderOverview() {
  const sc = UI.scope; const node = scopeNode(sc); const all = scopeBuildings(sc); const rows = all.filter(isActive); const done = rows.filter(isCompleted);
  const assessed = sum(rows, b => b.assessTotal);
  const listed = rows.filter(b => b.market === 'for-sale' || b.market === 'for-lease'); const asking = sum(listed, b => b.listPrice);
  const underWay = rows.filter(isUnderWay); const lot = sum(rows, b => lotAreaOf(b));
  const years = done.map(b => num(b.yearBuilt)).filter(Boolean); const med = median(years);
  const tallest = rows.filter(b => heightOf(b)).sort((a, b) => heightOf(b) - heightOf(a)); const top = tallest[0];
  const recent = [...rows].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 6);
  const children = scopeChildren(sc); const issues = allIssues(sc);
  const roads = S.roads.filter(r => roadInScope(r, sc)), lines = S.lines.filter(l => lineInScope(l, sc)), biz = S.businesses.filter(z => bizInScope(z, sc));
  const name = scopeName(sc); const long = name.length > 12;
  const title = sc.kind === 'all' ? 'THE <span>WORLD</span>' : name.toUpperCase().replace(/\s(\S+)$/, ' <span>$1</span>');
  return `
  <section class="hero">
    <div class="title">
      <div class="kicker">${scopeKicker(sc)}${placementHTML(node)}</div>
      <h2 class="${long ? 'long' : ''}">${title}</h2>
      <p>${node?.tagline ? esc(node.tagline) + ' ' : ''}${rows.length ? `${rows.length} building${rows.length === 1 ? '' : 's'} on file${children.length ? ` across ${children.length} ${children[0].kind === 'hood' ? 'neighborhood' : 'place'}${children.length === 1 ? '' : 's'}` : ''} — classification, zoning, lot, valuation, roads, transit and what stood there before, in one private record.` : 'Nothing registered here yet — add the first building, or draw its border on the map.'}</p>
      <div class="founded">${node?.founded ? `FOUNDED <b>${esc(node.founded)}</b> · ` : sc.kind === 'all' ? `SINCE <b>${FOUNDED_YEAR}</b> · ` : ''}<b>${all.filter(isHist).length}</b> HISTORICAL · <b>${roads.length}</b> ROADS · <b>${lines.length}</b> LINES · <b>${biz.length}</b> BUSINESSES${node && !(node.polygons || []).length ? ' · <span class="notdrawn">BORDER NOT DRAWN YET</span>' : ''}</div>
    </div>
    <div class="panel hud skyline-wrap">
      <div class="panel-head"><h3>SKYLINE · TALLEST ${Math.min(tallest.length, 40)} BY HEIGHT</h3><span class="note">${tallest.length ? 'hover a tower · click to open' : ''}</span></div>
      ${renderSkyline(tallest.slice(0, 40), { empty: 'No skyline yet', emptySub: 'Give buildings a floor count or a height in blocks and the place rises here.' })}
    </div>
  </section>

  <section class="tiles">
    <div class="panel tile accent"><div class="lbl">BUILDINGS STANDING</div><div class="val"><span class="count" data-to="${done.length}">0</span></div><div class="sub">${rows.filter(b => b.landmark).length} landmarks · ${rows.filter(b => b.physical === 'vacant-lot').length} vacant lots</div></div>
    <div class="panel tile"><div class="lbl">UNDER WAY</div><div class="val"><span class="count" data-to="${underWay.length}">0</span></div><div class="sub ${underWay.length ? 'good' : ''}">${underWay.filter(b => b.physical === 'construction').length} under construction · ${underWay.filter(b => b.physical === 'planned').length} planned</div></div>
    <div class="panel tile money"><div class="lbl">ASSESSED VALUE</div><div class="val"><span class="count" data-to="${assessed}" data-fmt="money">$0</span></div><div class="sub">${rows.filter(b => num(b.assessTotal) != null).length} of ${rows.length} assessed</div></div>
    <div class="panel tile"><div class="lbl">ON THE MARKET</div><div class="val"><span class="count" data-to="${listed.length}">0</span><small>listings</small></div><div class="sub ${listed.length ? 'good' : ''}">${listed.length ? fmtMoneyCompact(asking) + ' total asking' : 'nothing for sale or lease'}</div></div>
    <div class="panel tile"><div class="lbl">LOT AREA</div><div class="val"><span class="count" data-to="${lot}" data-fmt="compact">0</span><small>blocks²</small></div><div class="sub">${rows.filter(b => lotAreaOf(b) != null).length} lots measured${node?.polygons?.length ? ` · border ${fmtCompact(polysArea(node.polygons))} blk²` : ''}</div></div>
    <div class="panel tile"><div class="lbl">TALLEST</div><div class="val" style="font-size:20px;line-height:1.15">${top ? esc(top.name || titleOf(top)) : '—'}</div><div class="sub">${top ? `${top.floors ? top.floors + ' floors · ' : ''}${heightOf(top) ? Math.round(heightOf(top)) + ' blocks' : ''} · ${esc(districtById(top.districtId)?.name || '')}` : med ? `median year built ${med} · ${esc(eraOf(med)?.name || '')}` : 'add floors or heights'}</div></div>
  </section>

  ${renderThroughTime(all)}

  ${children.length ? renderJurisdictions(children, sc) : ''}

  <section class="grid cols-3" style="margin-bottom:18px">
    <div class="panel hud"><div class="panel-head"><h3>BUILT BY YEAR · ERAS</h3><span class="note">${years.length} dated</span></div>${renderEraHistogram(done)}</div>
    <div class="panel hud"><div class="panel-head"><h3>CLASS MIX</h3><span class="note">${rows.filter(b => b.bldgClass).length} classified</span></div>${renderClassDonut(rows)}</div>
    <div class="panel hud"><div class="panel-head"><h3>${children.length ? (children[0].kind === 'hood' ? 'BY NEIGHBORHOOD' : 'BY PLACE') : 'STATUS'}</h3><span class="note">${children.length ? 'standing · assessed' : 'physical status'}</span></div>${children.length ? renderChildBars(children) : hbarsHTML(PHYSICAL.map(s => ({ label: s.glyph + ' ' + s.label, n: all.filter(b => (b.physical || 'standing') === s.id).length })).filter(x => x.n), { labelW: 150 })}</div>
  </section>

  <section class="grid cols-3" style="margin-bottom:18px">
    <div class="panel hud"><div class="panel-head"><h3>TALLEST BUILDINGS</h3><span class="note">top ${Math.min(10, tallest.length)}</span></div>
      ${tallest.length ? `<div class="rank">${tallest.slice(0, 10).map((b, i) => { const d = districtById(b.districtId); return `<div class="row" data-open="${b.id}" data-hover="${b.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><div class="nm">${esc(b.name || titleOf(b))}</div><div class="meta"><i style="--c:${distColor(d)}"></i>${esc(d?.name || '')}${hoodById(b.neighborhoodId) ? ' · ' + esc(hoodById(b.neighborhoodId).name) : ''} · ${esc(builtHTML(b))}</div></div><div class="h">${b.floors ? b.floors + ' fl' : ''}${b.floors && heightOf(b) ? ' · ' : ''}${heightOf(b) ? Math.round(heightOf(b)) + ' blk' : ''}</div></div>`; }).join('')}</div>` : `<div class="chart-empty">Add floors or a height to a building and it appears here.</div>`}
    </div>
    ${rankPanel('MOST VALUABLE', 'by assessed total', rows.filter(b => num(b.assessTotal)).sort((a, b) => num(b.assessTotal) - num(a.assessTotal)).slice(0, 10), b => fmtMoneyCompact(num(b.assessTotal)), 'Add tax assessments to rank buildings by value.')}
    <div class="panel hud"><div class="panel-head"><h3>RECENTLY ADDED</h3><span class="note">${rows.filter(b => b.image).length} with photos</span></div>
      ${recent.length ? `<div class="rank">${recent.map(b => { const d = districtById(b.districtId); return `<div class="row" data-open="${b.id}" data-hover="${b.id}"><span class="n">${imgUrl(b.id) ? `<img class="thumb" style="width:26px;height:26px" src="${imgUrl(b.id)}" alt="">` : '·'}</span><div><div class="nm">${esc(titleOf(b))}${b.name && addressOf(b) ? ` <span class="dim" style="font-weight:400">· ${esc(b.name)}</span>` : ''}</div><div class="meta"><i style="--c:${distColor(d)}"></i>${esc(d?.name || '')} · ${esc(b.bldgClass || '—')} · ${esc(b.zoning || '—')}</div></div>${lifecycleBadge(b)}</div>`; }).join('')}</div>` : `<div class="chart-empty">No buildings yet — press <kbd class="k">N</kbd> to add the first.</div>`}
    </div>
  </section>

  ${renderLeagueTable(children, sc)}

  <section class="grid cols-3" style="margin-bottom:18px">
    <div class="panel hud" style="grid-column:span 2"><div class="panel-head"><h3>AVERAGES OF EVERYTHING</h3><span class="note">present-day ${esc(name)} · min · average · median · max</span></div>${renderMetrics(rows)}</div>
    <div class="stack">
      <div class="panel hud"><div class="panel-head"><h3>REGISTRY HEALTH</h3><span class="note">completeness</span></div>${renderHealth(rows)}</div>
      <div class="panel hud"><div class="panel-head"><h3>DATA QUALITY</h3><span class="note">${issues.length} issue${issues.length === 1 ? '' : 's'}</span></div>${renderIssuesSummary(issues)}</div>
    </div>
  </section>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><button class="btn" data-nav="registry">${icon('rows')} Open the registry · ${rows.length}</button><button class="btn" data-nav="map">${icon('map')} Map workspace</button><button class="btn" data-act="open-playback">${icon('play')} Playback 2013 → today</button><button class="btn" data-act="export-scope">${icon('down')} Export ${esc(name)}</button></div>`;
}
function lifecycleBadge(b) {
  const ph = physicalOf(b.physical); const h = isHist(b);
  return `<span class="status physical ${h ? 'hist' : ph.tone}" title="${esc(ph.label)}${b.market ? ' · ' + marketOf(b.market).label : ''}${b.landmark ? ' · landmark' : ''}"><i>${ph.glyph}</i>${ph.label}${b.landmark ? ' <span class="lm" title="Landmark">✦</span>' : ''}${b.market ? `<span class="mkt ${marketOf(b.market).tone}">${marketOf(b.market).label.toUpperCase()}</span>` : ''}</span>`;
}
/* ---- "through time": construction vs demolition since founding, with the strict counts ---- */
function renderThroughTime(rows) {
  const hist = rows.filter(isHist); const series = yearSeries(rows); const und = undatedOf(rows);
  const life = stats(hist.map(lifespanOf)); const fabric = fabricStats(rows);
  const redeveloped = rows.filter(b => isActive(b) && predecessorsOf(b).length).length;
  const peak = series.reduce((a, p) => p.built > a.built ? p : a, series[0]);
  const kpi = (lbl, val, cls = '') => `<div class="kpi"><span class="lbl">${lbl}</span><span class="val ${cls}">${val}</span></div>`;
  return `
  <section class="panel hud" style="margin-bottom:18px">
    <div class="panel-head"><h3>THROUGH TIME · ${series[0].y} → ${series[series.length - 1].y}</h3><span class="note">completed above the line · demolished below · click a year to open playback</span></div>
    <div class="tt">
      <div>${renderBuildDemoChart(rows, { cursor: null, W: 900, H: 230 })}</div>
      <div class="side">
        ${kpi('DEMOLISHED · ALL TIME', `<span class="count" data-to="${hist.length}">0</span>`, 'hist')}
        ${kpi('AVERAGE LIFESPAN', life.n ? `${Math.round(life.avg * 10) / 10}<small>yrs · median ${life.med}</small>` : '<small>no dated demolitions</small>')}
        ${kpi(`ORIGINAL FABRIC ≤ ${fabric.year}`, fabric.total ? `${pct(fabric.standing, fabric.total)}%<small>${fabric.standing} of ${fabric.total} stand</small>` : '<small>nothing dated ≤ ' + fabric.year + '</small>')}
        ${kpi('BUSIEST YEAR', peak && peak.built ? `${peak.y}<small>${peak.built} completed</small>` : '—')}
        ${kpi('SITES REDEVELOPED', `${redeveloped}<small>with a predecessor</small>`)}
        ${kpi('UNDER WAY NOW', `${rows.filter(isUnderWay).length}<small>projects</small>`)}
        ${und.built || und.demolished || und.construction ? `<div class="undated" style="margin-top:8px">${[und.built ? `${und.built} undated building${und.built === 1 ? '' : 's'}` : '', und.construction ? `${und.construction} undated project${und.construction === 1 ? '' : 's'}` : '', und.demolished ? `${und.demolished} demolition${und.demolished === 1 ? '' : 's'} missing a date` : ''].filter(Boolean).join(' · ')} — kept out of every count until dated</div>` : ''}
        <button class="btn primary sm" data-act="open-playback">${icon('play')} Watch it build itself</button>
      </div>
    </div>
  </section>`;
}
/* ---- jurisdictions under the scope ---- */
function renderJurisdictions(children, sc) {
  const kindLabel = c => c.kind === 'region' ? (REGION_TYPE[c.node.type]?.label || 'Region') : c.kind === 'district' ? (c.node.type === 'borough' ? 'Borough' : 'District') : 'Neighborhood';
  return `<section class="panel hud" style="margin-bottom:18px">
    <div class="panel-head"><h3>${children[0].kind === 'hood' ? 'NEIGHBORHOODS' : 'JURISDICTIONS'} IN ${esc(scopeName(sc).toUpperCase())}</h3><span class="note">click to look at one · ${children.filter(c => (c.node.polygons || []).length).length} of ${children.length} drawn</span></div>
    <div class="geo-cards">${children.map(c => { const rows = scopeBuildingsOf(c); const act = rows.filter(isActive), hist = rows.filter(isHist); const n = c.node; return `<button class="geo-card" data-scope-kind="${c.kind}" data-scope-id="${esc(n.id)}" style="--c:${childColor(c)}"><div class="k"><span>${esc(kindLabel(c).toUpperCase())}${n.code ? ' · ' + esc(n.code) : ''}</span>${(n.polygons || []).length ? '' : '<span class="notdrawn">NOT DRAWN YET</span>'}</div><div class="n">${esc(n.name)}${placementHTML(n)}</div><div class="s"><span><b>${act.length}</b> standing</span>${hist.length ? `<span><b style="color:var(--hist)">${hist.length}</b> historical</span>` : ''}${c.kind === 'region' ? `<span><b>${regionDistricts(n.id).length + childRegions(n.id).length}</b> places</span>` : c.kind === 'district' ? `<span><b>${hoodsIn(n.id).length}</b> hoods</span>` : ''}</div><div class="tg">${esc(truncate(n.tagline || n.typeNote || '', 90))}</div></button>`; }).join('')}
    ${sc.kind !== 'hood' ? `<button class="geo-card" data-act="${children[0].kind === 'hood' ? 'manage-hoods' : children[0].kind === 'region' || sc.kind === 'all' || sc.kind === 'region' ? 'add-region-here' : 'add-district-here'}" data-id="${esc(scopeNode(sc)?.id || '')}" style="--c:var(--ink-3);border-style:dashed"><div class="k"><span>ADD</span></div><div class="n">${children[0].kind === 'hood' ? '+ Neighborhood' : sc.kind === 'all' ? '+ State / region' : '+ Place under ' + esc(scopeName(sc))}</div><div class="tg">${children[0].kind === 'hood' ? 'Name it, then draw its border on the map.' : 'A state, city, region, borough or district — adding a state never needs code.'}</div></button>` : ''}</div>
  </section>`;
}
/* ---- league table of the scope's children ---- */
function renderLeagueTable(children, sc) {
  const groups = children.map(c => ({ c, id: c.node.id, name: c.node.name, color: childColor(c), rows: scopeBuildingsOf(c).filter(isActive) }));
  if (sc.kind === 'district') { const un = scopeActive(sc).filter(b => !b.neighborhoodId || !hoodById(b.neighborhoodId)); if (un.length) groups.push({ c: null, id: '__none', name: 'Unassigned', color: PALETTE.neutralBright, rows: un }); }
  if (!groups.length) return '';
  const maxN = Math.max(1, ...groups.map(g => g.rows.length)); const cell = (v, cls = 'num r') => `<td class="${cls}">${v}</td>`;
  const kind = children[0]?.kind === 'hood' ? 'NEIGHBORHOOD' : 'PLACE';
  return `<section class="panel hud" style="margin-bottom:18px"><div class="panel-head"><h3>${kind} LEAGUE TABLE</h3><span class="note">click a row to look at it</span></div>
  <div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>${kind}</th><th style="width:160px">SHARE</th><th class="r">STANDING</th><th class="r">UNDER WAY</th><th class="r">HISTORICAL</th><th class="r">ASSESSED</th><th class="r">AVG ASSESSED</th><th class="r">LISTED</th><th class="r">LOT AREA</th><th class="r">AVG FLOORS</th><th>TALLEST</th><th class="r">PHOTOS</th></tr></thead><tbody>
  ${groups.map(g => { const a = stats(g.rows.map(b => num(b.assessTotal))); const fl = stats(g.rows.map(b => num(b.floors))); const tall = g.rows.filter(heightOf).sort((x, y) => heightOf(y) - heightOf(x))[0]; const hist = g.c ? scopeBuildingsOf(g.c).filter(isHist).length : 0;
    return `<tr ${g.c ? `data-scope-kind="${g.c.kind}" data-scope-id="${esc(g.id)}"` : ''} data-league="1" style="--c:${g.color}"><td><span class="dist" style="--c:${g.color}"><i></i>${esc(g.name)}</span></td><td><div class="trk" style="height:6px;background:var(--bg-3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${(g.rows.length / maxN * 100).toFixed(1)}%;background:${g.color};border-radius:3px"></div></div></td>${cell(g.rows.filter(isCompleted).length)}${cell(g.rows.filter(isUnderWay).length)}${cell(hist, 'num r hist')}${cell(a.n ? fmtMoneyCompact(a.sum) : '—')}${cell(a.n ? fmtMoneyCompact(a.avg) : '—')}${cell(g.rows.filter(b => b.market === 'for-sale' || b.market === 'for-lease').length)}${cell(fmtCompact(sum(g.rows, b => lotAreaOf(b))) + ' blk²')}${cell(fl.n ? (Math.round(fl.avg * 10) / 10) : '—')}${cell(tall ? esc(tall.name || titleOf(tall)) + ` <span class="muted">${fmtInt(heightOf(tall))} blk</span>` : '—', '')}${cell(g.rows.length ? pct(g.rows.filter(b => b.image).length, g.rows.length) + '%' : '—')}</tr>`; }).join('')}
  </tbody></table></div></section>`;
}
/* ---- averages table ---- */
function renderMetrics(rows) {
  const mk = (pick) => { const st = stats(rows.map(pick)); st.pick = pick; return st; };
  const assessed = mk(b => num(b.assessTotal)), land = mk(b => num(b.assessLand)), bld = mk(b => num(b.assessBuilding)), listS = mk(b => num(b.listPrice)), lots = mk(b => lotAreaOf(b));
  const ppb = mk(b => (num(b.listPrice) && lotAreaOf(b)) ? num(b.listPrice) / lotAreaOf(b) : null), apb = mk(b => (num(b.assessTotal) && lotAreaOf(b)) ? num(b.assessTotal) / lotAreaOf(b) : null);
  const floors = mk(b => num(b.floors)), heights = mk(b => heightOf(b)), years = mk(b => isCompleted(b) ? num(b.yearBuilt) : null), fp = mk(b => footprintAreaOf(b)), fa = mk(b => num(b.floorArea)), units = mk(b => (num(b.unitsRes) ?? 0) + (num(b.unitsCom) ?? 0) || null);
  const m1 = v => fmtMoney(Math.round(v)); const m0 = v => fmtInt(v); const my = v => String(Math.round(v)); const m1d = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
  const row = (name, st, fmt, unit = '') => `<tr><td class="mname">${name}${unit ? `<small>${unit}</small>` : ''}</td><td class="num r">${st.n || 0}</td><td class="num r">${st.n ? fmt(st.min) : '—'}</td><td class="num r hi">${st.n ? fmt(st.avg) : '—'}</td><td class="num r">${st.n ? fmt(st.med) : '—'}</td><td class="num r">${st.n ? fmt(st.max) : '—'}</td><td class="strip">${st.n ? stripHTML(rows.map(st.pick)) : '—'}</td></tr>`;
  if (!rows.length) return `<div class="chart-empty">No records in scope.</div>`;
  return `<div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>METRIC</th><th class="r">N</th><th class="r">MIN</th><th class="r">AVERAGE</th><th class="r">MEDIAN</th><th class="r">MAX</th><th>DISTRIBUTION</th></tr></thead><tbody>
    ${row('Assessed total', assessed, m1, '$')}${row('Assessed land', land, m1, '$')}${bld.n ? row('Assessed building', bld, m1, '$') : ''}${row('Asking price', listS, m1, '$')}
    ${row('Asking per block²', ppb, m1, '$ / blk²')}${row('Assessed per block²', apb, m1, '$ / blk²')}${row('Lot area', lots, m0, 'blocks²')}${fp.n ? row('Footprint (measured)', fp, m0, 'blocks²') : ''}${fa.n ? row('Floor area', fa, m0, 'blocks²') : ''}
    ${row('Floors', floors, m1d)}${row('Height', heights, m0, 'blocks')}${row('Year completed', years, my)}${row('Units per building', units, m1d)}
  </tbody></table></div>`;
}
function renderHealth(rows) {
  if (!rows.length) return `<div class="chart-empty">No records in scope.</div>`;
  const fields = [['Address', b => b.number || b.street], ['Neighborhood', b => b.neighborhoodId && hoodById(b.neighborhoodId)], ['Class', b => b.bldgClass], ['Zoning', b => b.zoning], ['Completion date', b => isUnderWay(b) ? (b.yearStarted != null || b.yearExpected != null) : b.yearBuilt], ['Lot size', b => lotAreaOf(b)], ['Floors or height', b => b.floors || b.height], ['Assessment', b => num(b.assessTotal) != null], ['Coordinates', b => b.x != null && b.z != null], ['Road', b => b.roadId && roadById(b.roadId)], ['Photo', b => b.image]];
  const items = fields.map(([label, f]) => ({ label, n: rows.filter(f).length }));
  const overall = Math.round(items.reduce((a, i) => a + i.n, 0) / (items.length * rows.length) * 100);
  return `<div class="hbars">${items.map(i => `<div class="hbar" style="--c:${PALETTE.marks[0]};grid-template-columns:120px 1fr 70px"><span class="nm">${esc(i.label)}</span><div class="trk"><div class="fill" style="width:${(i.n / rows.length * 100).toFixed(1)}%"></div></div><span class="v">${pct(i.n, rows.length)}%</span></div>`).join('')}</div>
  <div class="desc-line" style="margin-top:12px">Overall completeness <b>${overall}%</b> across ${rows.length} record${rows.length === 1 ? '' : 's'}</div>`;
}
function renderIssuesSummary(issues) {
  if (!issues.length) return `<div class="chart-empty" style="padding:16px 6px">Nothing flagged — dates, values, borders and links agree with each other.</div>`;
  const by = { bad: issues.filter(i => i.level === 'bad').length, warn: issues.filter(i => i.level === 'warn').length, info: issues.filter(i => i.level === 'info').length };
  return `<div class="hbars">${[['bad', 'Problems', 'var(--bad)'], ['warn', 'Warnings', 'var(--warn)'], ['info', 'Notes', 'var(--info)']].filter(([k]) => by[k]).map(([k, l, c]) => `<div class="hbar" style="--c:${c};grid-template-columns:90px 1fr 40px"><span class="nm">${l}</span><div class="trk"><div class="fill" style="width:${(by[k] / issues.length * 100).toFixed(1)}%"></div></div><span class="v">${by[k]}</span></div>`).join('')}</div>
  <div class="desc-line" style="margin-top:10px">${esc(truncate(issues[0].title || '', 28))}: ${esc(truncate(issues[0].text, 90))}</div>
  <button class="btn sm" style="margin-top:10px" data-act="open-issues">${icon('warn')} Review ${issues.length} issue${issues.length === 1 ? '' : 's'}</button>`;
}
