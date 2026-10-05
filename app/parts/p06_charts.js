/* =====================================================================
   §6  CHARTS & SKYLINE — hand-drawn SVG, one hue per job, hairline chrome,
       legend for ≥2 series, every chart also readable as text
   ===================================================================== */
const FAMILY_SLOT = Object.fromEntries(CLASS_FAMILIES.map((f, i) => [f, i]));   // fixed colour order

/* Built-by-year histogram banded by New A era (single hue) */
function renderEraHistogram(rows) {
  const years = rows.map(b => num(b.yearBuilt)).filter(y => y && y >= 2000 && y <= 2100);
  if (!years.length) return `<div class="chart-empty">No year-built data yet.</div>`;
  const y0 = Math.min(2013, ...years), y1 = Math.max(2026, ...years);
  const counts = {}; for (const y of years) counts[y] = (counts[y] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  const W = 420, H = 190, padL = 26, padR = 8, padT = 26, padB = 26, n = y1 - y0 + 1, bw = (W - padL - padR) / n;
  const x = y => padL + (y - y0) * bw, yy = v => padT + (H - padT - padB) * (1 - v / max);
  const bars = []; for (let y = y0; y <= y1; y++) { const c = counts[y] || 0; if (!c) continue; const h = (H - padT - padB) * c / max; bars.push(`<g class="bar" data-tip="${y}: ${c} building${c === 1 ? '' : 's'} · ${esc(eraOf(y)?.name || '')}"><rect x="${(x(y) + 1).toFixed(1)}" y="${(yy(c)).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${PALETTE.marks[0]}"/>${bw > 14 ? (yy(c) - padT > 14 ? `<text x="${(x(y) + bw / 2).toFixed(1)}" y="${(yy(c) - 4).toFixed(1)}" text-anchor="middle" fill="var(--ink-2)">${c}</text>` : `<text x="${(x(y) + bw / 2).toFixed(1)}" y="${(yy(c) + 13).toFixed(1)}" text-anchor="middle" fill="var(--bg)" font-weight="600">${c}</text>`) : ''}</g>`); }
  const shown = ERAS.filter(e => e.to > y0 && e.from <= y1);
  const bands = shown.map((e, i) => { const a = Math.max(e.from, y0), b = Math.min(e.to, y1 + 1); const w = (b - a) * bw; const label = w > 110 ? e.name.toUpperCase() : String(i + 1); return `<g class="era-bands"><rect x="${x(a)}" y="${padT - 4}" width="${w}" height="${H - padT - padB + 4}" fill="${i % 2 ? 'rgba(79,227,255,.035)' : 'transparent'}"/><line x1="${x(a)}" x2="${x(a)}" y1="${padT - 14}" y2="${H - padB}" stroke="var(--line-2)"/><text x="${x(a) + 4}" y="${padT - 6}" fill="var(--ink-3)">${esc(label)}</text></g>`; }).join('');
  const key = `<div class="era-key">${shown.map((e, i) => `<span><b>${i + 1}</b>${esc(e.name)} ${String(e.from).slice(2)}–${String(Math.min(e.to, 2026)).slice(2)}</span>`).join('')}</div>`;
  const ticks = []; for (let y = y0; y <= y1; y += (n > 16 ? 2 : 1)) ticks.push(`<text x="${x(y) + bw / 2}" y="${H - 8}" text-anchor="middle">${String(y).slice(2)}</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Buildings by year built">
    <g class="axis"><line x1="${padL}" x2="${W - padR}" y1="${H - padB + .5}" y2="${H - padB + .5}"/></g>
    <text x="${padL - 4}" y="${padT + 4}" text-anchor="end">${max}</text>${bands}${bars.join('')}${ticks.join('')}</svg>${key}`;
}

/* Donut of class families (≤7 fixed slots) with legend */
function renderClassDonut(rows) {
  const counts = {}; for (const b of rows) { const f = classFamily(b.bldgClass); if (f) counts[f] = (counts[f] || 0) + 1; }
  const items = CLASS_FAMILIES.map(f => ({ f, n: counts[f] || 0, c: PALETTE.marks[FAMILY_SLOT[f]] })).filter(i => i.n);
  const total = items.reduce((a, i) => a + i.n, 0);
  if (!total) return `<div class="chart-empty">No classified buildings yet.</div>`;
  const R = 62, r = 44, cx = 75, cy = 75; let a0 = -Math.PI / 2;
  const arcs = items.map(i => {
    const a1 = a0 + (i.n / total) * Math.PI * 2; const gap = items.length > 1 ? 0.03 : 0;
    const p = arcPath(cx, cy, R, r, a0 + gap / 2, a1 - gap / 2); a0 = a1;
    return `<path class="bar" d="${p}" fill="${i.c}" data-tip="${esc(i.f)}: ${i.n} (${Math.round(i.n / total * 100)}%)"/>`;
  }).join('');
  return `<div class="donut-wrap"><svg class="chart" viewBox="0 0 150 150" role="img" aria-label="Class mix">${arcs}<text class="donut-center" x="${cx}" y="${cy + 2}" text-anchor="middle">${total}</text><text class="donut-center-lbl" x="${cx}" y="${cy + 18}" text-anchor="middle">CLASSIFIED</text></svg>
    <div class="legend" style="flex-direction:column;gap:6px;margin:0">${items.map(i => `<span><i style="--c:${i.c}"></i>${esc(i.f)}<span class="v">${i.n} · ${Math.round(i.n / total * 100)}%</span></span>`).join('')}</div></div>`;
}
function arcPath(cx, cy, R, r, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 0.001) a1 = a0 + Math.PI * 2 - 0.001;
  const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0); const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r} ${r} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

/* Horizontal bars: standing count per child of the scope (regions, boroughs or neighborhoods), coloured by entity */
function renderChildBars(children) {
  const data = children.map(c => { const rows = scopeBuildingsOf(c).filter(isActive); return { c, n: rows.length, v: sum(rows, b => b.assessTotal) }; }).filter(x => x.n || children.length <= 8);
  if (!data.length) return `<div class="chart-empty">Nothing registered under this place yet.</div>`;
  const max = Math.max(1, ...data.map(x => x.n));
  return `<div class="hbars">${data.map(x => `<div class="hbar" style="--c:${childMark(x.c)}"><span class="nm" title="${esc(x.c.node.name)}"><i></i>${esc(x.c.node.name)}</span><div class="trk"><div class="fill" style="width:${(x.n / max * 100).toFixed(1)}%"></div></div><span class="v">${x.n} · ${fmtMoneyCompact(x.v)}</span></div>`).join('')}</div>`;
}
const childColor = c => c.kind === 'region' ? regionColor(c.node) : c.kind === 'district' ? distColor(c.node) : distColor(districtById(c.node.districtId));
const childMark = c => c.kind === 'region' ? regionMark(c.node) : c.kind === 'district' ? distMark(c.node) : distMark(districtById(c.node.districtId));
/* Generic single-hue horizontal bars from [{label, n, c?, sub?}] */
function hbarsHTML(items, { fmt = fmtInt, color = PALETTE.marks[0], labelW = 110 } = {}) {
  if (!items.length) return `<div class="chart-empty">Nothing to chart yet.</div>`;
  const max = Math.max(1, ...items.map(i => i.n));
  return `<div class="hbars">${items.map(i => `<div class="hbar" style="--c:${i.c || color};grid-template-columns:${labelW}px 1fr 90px"><span class="nm" title="${esc(i.label)}">${i.c ? '<i></i>' : ''}${esc(i.label)}</span><div class="trk"><div class="fill" style="width:${(i.n / max * 100).toFixed(1)}%"></div></div><span class="v">${fmt(i.n)}${i.sub ? ` <span class="muted">${esc(i.sub)}</span>` : ''}</span></div>`).join('')}</div>`;
}

/* Distribution strip: tiny histogram of a numeric field (single hue) */
function stripHTML(values, bins = 18) {
  const v = values.filter(x => x != null && Number.isFinite(x)); if (v.length < 2) return '<span class="muted">—</span>';
  const lo = Math.min(...v), hi = Math.max(...v); if (hi === lo) return `<svg class="chart" viewBox="0 0 120 22" width="120" height="22"><rect x="0" y="4" width="120" height="14" rx="2" fill="${PALETTE.marks[0]}" opacity=".7"/></svg>`;
  const counts = new Array(bins).fill(0); for (const x of v) counts[Math.min(bins - 1, Math.floor((x - lo) / (hi - lo) * bins))]++;
  const max = Math.max(...counts); const bw = 120 / bins;
  return `<svg class="chart" viewBox="0 0 120 22" width="120" height="22" aria-hidden="true">${counts.map((c, i) => c ? `<rect x="${(i * bw + .5).toFixed(1)}" y="${(20 - 18 * c / max).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(18 * c / max).toFixed(1)}" rx="1" fill="${PALETTE.marks[0]}"/>` : '').join('')}</svg>`;
}

/* Cumulative growth line: buildings standing by year, with hover crosshair */
function renderGrowthLine(rows, { W = 560, H = 200, cursor = null } = {}) {
  const dated = rows.filter(b => num(b.yearBuilt) != null);
  if (dated.length < 2) return `<div class="chart-empty">Add year-built to at least two buildings to chart growth.</div>`;
  const series = yearSeries(rows); const y0 = series[0].y, y1 = series[series.length - 1].y; const und = undatedOf(rows);
  const pts = series.map(p => ({ y: p.y, n: p.standing }));
  const pl = 34, pr = 14, pt = 16, pb = 26, max = Math.max(1, ...pts.map(p => p.n));
  const X = y => pl + (y - y0) / Math.max(1, y1 - y0) * (W - pl - pr), Y = n => pt + (H - pt - pb) * (1 - n / max);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.y).toFixed(1)} ${Y(p.n).toFixed(1)}`).join('');
  const area = line + `L${X(y1)} ${Y(0)}L${X(y0)} ${Y(0)}Z`;
  const gridY = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${W - pr}" y1="${Y(max * f).toFixed(1)}" y2="${Y(max * f).toFixed(1)}"/><text x="${pl - 6}" y="${(Y(max * f) + 3.5).toFixed(1)}" text-anchor="end">${Math.round(max * f)}</text>`).join('');
  const ticks = pts.filter((p, i) => (y1 - y0) <= 14 || i % 2 === 0).map(p => `<text x="${X(p.y).toFixed(1)}" y="${H - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join('');
  const hit = pts.map((p, i) => `<rect class="hit" x="${(X(p.y) - (W - pl - pr) / Math.max(1, y1 - y0) / 2).toFixed(1)}" y="${pt}" width="${((W - pl - pr) / Math.max(1, y1 - y0)).toFixed(1)}" height="${H - pt - pb}" fill="transparent" data-tip="${p.y}: ${p.n} completed · ${series[i].construction} under way · +${series[i].built} built · −${series[i].demolished} demolished · ${esc(eraOf(p.y)?.name || '')}" data-cx="${X(p.y).toFixed(1)}" data-cy="${Y(p.n).toFixed(1)}" data-act="tl-year" data-year="${p.y}"/>`).join('');
  const last = pts[pts.length - 1];
  const cur = cursor != null ? `<g class="cursor"><line x1="${X(cursor).toFixed(1)}" x2="${X(cursor).toFixed(1)}" y1="${pt}" y2="${H - pb}"/><circle cx="${X(cursor).toFixed(1)}" cy="${Y(pts.find(p => p.y === cursor)?.n ?? 0).toFixed(1)}" r="5" fill="var(--cyan)" stroke="var(--bg-1)" stroke-width="2"/></g>` : '';
  return `<svg class="chart growth" viewBox="0 0 ${W} ${H}" role="img" aria-label="Completed buildings standing by year, net of demolitions">
    <defs><linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.marks[0]}" stop-opacity=".35"/><stop offset="1" stop-color="${PALETTE.marks[0]}" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${gridY}</g><path d="${area}" fill="url(#gfill)"/><path d="${line}" fill="none" stroke="${PALETTE.bright[0]}" stroke-width="2" stroke-linejoin="round"/>
    <circle class="end" cx="${X(y1)}" cy="${Y(last.n)}" r="4" fill="${PALETTE.bright[0]}" stroke="var(--bg-1)" stroke-width="2"/>
    <text x="${X(y1) - 6}" y="${Y(last.n) - 8}" text-anchor="end" fill="var(--ink-2)">${last.n} completed</text>${cur}
    <g class="cross" style="display:none"><line y1="${pt}" y2="${H - pb}" stroke="var(--line-3)"/><circle r="4.5" fill="${PALETTE.bright[0]}" stroke="var(--bg-1)" stroke-width="2"/></g>${ticks}${hit}</svg>${und.built || und.construction ? `<div class="undated" style="margin-top:6px">${und.built ? `${und.built} undated building${und.built === 1 ? '' : 's'}` : ''}${und.built && und.construction ? ' · ' : ''}${und.construction ? `${und.construction} undated project${und.construction === 1 ? '' : 's'}` : ''} — counted nowhere on this chart until dated</div>` : ''}`;
}

/* v2 · construction vs demolition, diverging by year: built above the axis, demolished below */
function renderBuildDemoChart(rows, { W = 900, H = 230, cursor = null } = {}) {
  const series = yearSeries(rows); const dated = rows.filter(b => num(b.yearBuilt) != null || num(b.yearDemolished) != null);
  if (!dated.length) return `<div class="chart-empty">Date some buildings (year built, year demolished) and the city’s construction history draws itself here.</div>`;
  const y0 = series[0].y, y1 = series[series.length - 1].y, n = series.length;
  const maxB = Math.max(1, ...series.map(p => p.built)), maxD = Math.max(0, ...series.map(p => p.demolished));
  // the demolition side gets at least a quarter of the height whenever anything was demolished, so its bars and labels have room
  const share = maxD ? clamp(maxD / (maxB + maxD), 0.26, 0.6) : 0.1;
  const pl = 30, pr = 12, pt = 18, pb = 24; const dnH = (H - pt - pb) * share, upH = (H - pt - pb) - dnH; const axis = pt + upH;
  const bw = (W - pl - pr) / n; const X = y => pl + (y - y0) * bw;
  const bars = series.map(p => {
    const hb = p.built / maxB * (upH - 6), hd = maxD ? p.demolished / maxD * (dnH - 18) : 0;
    const on = cursor === p.y;
    return `<g class="yr" data-act="tl-year" data-year="${p.y}" data-tip="${p.y} · ${p.built} built · ${p.demolished} demolished · net ${p.built - p.demolished >= 0 ? '+' : ''}${p.built - p.demolished} · ${p.standing} standing · ${esc(eraOf(p.y)?.name || '')}">
      <rect x="${X(p.y).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${H - pt - pb}" fill="${on ? 'rgba(79,227,255,.07)' : 'transparent'}"/>
      ${p.built ? `<rect class="bar" x="${(X(p.y) + 2).toFixed(1)}" y="${(axis - hb).toFixed(1)}" width="${Math.max(2, bw - 4).toFixed(1)}" height="${hb.toFixed(1)}" rx="2" fill="${PALETTE.marks[0]}"/>${bw > 22 ? (hb > upH - 18 ? `<text x="${(X(p.y) + bw / 2).toFixed(1)}" y="${(axis - hb + 13).toFixed(1)}" text-anchor="middle" fill="var(--bg)" font-weight="600">${p.built}</text>` : `<text x="${(X(p.y) + bw / 2).toFixed(1)}" y="${(axis - hb - 4).toFixed(1)}" text-anchor="middle" fill="var(--ink-2)">${p.built}</text>`) : ''}` : ''}
      ${p.demolished ? `<rect class="bar demo" x="${(X(p.y) + 2).toFixed(1)}" y="${(axis + 1).toFixed(1)}" width="${Math.max(2, bw - 4).toFixed(1)}" height="${Math.max(3, hd).toFixed(1)}" rx="2"/>${bw > 22 && axis + hd + 14 < H - pb - 2 ? `<text x="${(X(p.y) + bw / 2).toFixed(1)}" y="${(axis + Math.max(3, hd) + 12).toFixed(1)}" text-anchor="middle" fill="var(--hist)">${p.demolished}</text>` : ''}` : ''}
    </g>`; }).join('');
  const ticks = series.filter((p, i) => n <= 16 || i % 2 === 0).map(p => `<text x="${(X(p.y) + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${cursor === p.y ? 'var(--cyan)' : ''}">${String(p.y).slice(2)}</text>`).join('');
  const shownEras = ERAS.filter(e => e.to > y0 && e.from <= y1);
  const eras = shownEras.map((e, i) => { const a = Math.max(e.from, y0), b = Math.min(e.to, y1 + 1); const w = (b - a) * bw; const label = w > e.name.length * 6.4 + 10 ? e.name.toUpperCase() : String(i + 1); return `<line x1="${X(a).toFixed(1)}" x2="${X(a).toFixed(1)}" y1="${pt - 12}" y2="${H - pb}" stroke="var(--line-2)"/><text x="${(X(a) + 4).toFixed(1)}" y="${pt - 4}" fill="${cursor != null && cursor >= a && cursor < b ? 'var(--cyan)' : 'var(--ink-3)'}" style="font-size:9px;letter-spacing:.06em">${esc(label)}</text>`; }).join('');
  const cur = cursor != null ? `<g class="cursor"><line x1="${(X(cursor) + bw / 2).toFixed(1)}" x2="${(X(cursor) + bw / 2).toFixed(1)}" y1="${pt}" y2="${H - pb}"/></g>` : '';
  const totalB = series.reduce((a, p) => a + p.built, 0), totalD = series.reduce((a, p) => a + p.demolished, 0);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Construction and demolition by year">
    ${eras}<g class="axis"><line x1="${pl}" x2="${W - pr}" y1="${axis + .5}" y2="${axis + .5}"/></g>
    <text x="${pl - 4}" y="${pt + 8}" text-anchor="end">${maxB}</text>${maxD ? `<text x="${pl - 4}" y="${H - pb - 2}" text-anchor="end" fill="var(--hist)">${maxD}</text>` : ''}
    ${bars}${cur}${ticks}</svg>
  <div class="legend"><span><i style="--c:${PALETTE.marks[0]}"></i>Built<span class="v">${totalB}</span></span><span><i class="hist"></i>Demolished<span class="v">${totalD}</span></span><span class="muted">net <span class="v">${totalB - totalD >= 0 ? '+' : ''}${totalB - totalD}</span></span><span class="era-key" style="margin:0 0 0 auto">${shownEras.map((e, i) => `<span><b>${i + 1}</b>${esc(e.name)} ${String(e.from).slice(2)}–${String(Math.min(e.to, y1 + 1) - 1).slice(2)}</span>`).join('')}</span></div>`;
}

/* ---- small statistics helpers ---- */
function stats(vals) {
  const v = vals.filter(x => x != null && Number.isFinite(x));
  if (!v.length) return { n: 0 };
  const s = v.reduce((a, x) => a + x, 0);
  return { n: v.length, sum: s, min: Math.min(...v), max: Math.max(...v), avg: s / v.length, med: median(v) };
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function topCounts(rows, f, k) { const c = {}; for (const b of rows) { const v = f(b); if (v) c[v] = (c[v] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, k).map(([k, n]) => ({ k, n })); }
function rankPanel(title, note, list, valueFn, empty) {
  return `<div class="panel hud"><div class="panel-head"><h3>${title}</h3><span class="note">${note}</span></div>${list.length ? `<div class="rank">${list.map((b, i) => { const d = districtById(b.districtId); return `<div class="row" data-open="${b.id}" data-hover="${b.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><div class="nm">${esc(titleOf(b))}${b.name && addressOf(b) ? ` <span class="dim" style="font-weight:400">· ${esc(b.name)}</span>` : ''}</div><div class="meta"><i style="--c:${distColor(d)}"></i>${[d?.name, isHist(b) ? b.reg : null, b.bldgClass, b.zoning].filter(Boolean).map(esc).join(' · ')}</div></div><div class="h" style="color:var(--amber)">${valueFn(b)}</div></div>`; }).join('')}</div>` : `<div class="chart-empty">${empty}</div>`}</div>`;
}

/* "original fabric": buildings built by settings.fabricYear that are still standing */
function fabricStats(rows) {
  const year = S.settings.fabricYear || 2016; const orig = rows.filter(b => num(b.yearBuilt) != null && num(b.yearBuilt) <= year);
  return { year, total: orig.length, standing: orig.filter(isActive).length, lost: orig.filter(isHist).length };
}

/* ---- skyline: a live silhouette of New A built from heights ---- */
/* opts.cls: 'lost' draws the ghost skyline of demolished buildings · 'tl' the timeline's year view
   opts.newIds: buildings to highlight (built in the selected year) · opts.maxH: fixed scale across years */
function renderSkyline(list, opts = {}) {
  if (!list.length) return `<div class="skyline-empty"><b>${opts.empty || 'No skyline yet'}</b>${opts.emptySub || 'Give buildings a floor count or a height in blocks and New A rises here.'}</div>`;
  // arrange tallest in the centre, alternating outward — reads like a real skyline
  const order = []; list.forEach((b, i) => i % 2 ? order.push(b) : order.unshift(b));
  const W = 1000, H = 300, base = 262, maxH = opts.maxH || Math.max(...order.map(heightOf));
  const gap = 6, wMin = 14, wMax = 40;
  const widths = order.map(b => clamp(Math.round(Math.sqrt(lotAreaOf(b) || 900) / 1.2), wMin, wMax));
  const total = widths.reduce((a, w) => a + w + gap, -gap);
  const scale = total > W - 40 ? (W - 40) / total : 1;
  let x = (W - total * scale) / 2;
  const legendSet = new Map(); const newIds = opts.newIds || new Set();
  const blds = order.map((b, i) => {
    const w = widths[i] * scale, h = Math.max(6, (heightOf(b) / maxH) * (base - 40)), y = base - h;
    const d = districtById(b.districtId); const c = distMark(d); legendSet.set(d?.id, d);
    const spire = heightOf(b) > maxH * 0.8 ? `<line class="spire" x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y - 18}"/>` : '';
    const s = `<g class="bld ${newIds.has(b.id) ? 'new' : ''}" style="--c:${c}" data-open="${b.id}" data-hover="${b.id}" tabindex="0" role="button" aria-label="${esc(b.name || titleOf(b))}${isHist(b) ? ' (demolished ' + esc(demoHTML(b)) + ')' : ''}">
      <rect class="body" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>
      <rect class="win" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>${spire}
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="transparent"/></g>`;
    x += w + gap * scale; return s;
  }).join('');
  const legend = [...legendSet.values()].filter(Boolean).map(d => `<span><i style="--c:${distMark(d)}"></i>${esc(d.name)}</span>`).join('');
  return `<svg class="skyline ${opts.cls || ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${esc(opts.label || 'New A skyline')}">
    <defs>
      <pattern id="windows" width="4" height="6" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="1.4" height="2.2" fill="rgba(255,255,255,.28)"/></pattern>
      <linearGradient id="groundglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(79,227,255,.22)"/><stop offset="1" stop-color="rgba(79,227,255,0)"/></linearGradient>
      <linearGradient id="lostglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,122,89,.2)"/><stop offset="1" stop-color="rgba(255,122,89,0)"/></linearGradient>
    </defs>
    <rect class="glow" x="0" y="${base}" width="${W}" height="${H - base}"/>
    <line class="ground" x1="0" y1="${base + .5}" x2="${W}" y2="${base + .5}"/>
    ${blds}
  </svg><div class="skyline-legend">${opts.legend ?? legend}</div>`;
}
