/* =====================================================================
   §22 SERVICE — travel times per line, headways, who is well served,
       the service map colour and a planning sandbox.
       Times are ESTIMATED from alignment length and a per-mode speed unless a
       segment carries a MEASURED time; every figure says which it is.
   ===================================================================== */
UI.tline = null; UI.tfrom = null; UI.tto = null;
const SERVICE_WALK_FULL = 60, SERVICE_WALK_ZERO = 300, SERVICE_REACH = 150;
function lineService(l) { const d = SERVICE_DEFAULTS[l.mode] || SERVICE_DEFAULTS.other; const s = l.service || {}; const custom = num(s.speed) != null || num(s.headwayMin) != null || num(s.dwellSec) != null; return { speed: num(s.speed) || d.speed, headwayMin: num(s.headwayMin) || d.headwayMin, dwellSec: num(s.dwellSec) ?? d.dwellSec, basis: s.basis || (custom ? 'scheduled' : 'estimated'), custom }; }
/* where a point projects onto a polyline: distance to it and the arc position along it */
function arcPosition(pt, g) {
  let best = null, acc = 0;
  for (let i = 0; i < g.length - 1; i++) { const a = g[i], b = g[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz; let t = L2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / L2 : 0; t = clamp(t, 0, 1); const q = [a[0] + dx * t, a[1] + dz * t]; const d = dist2(pt, q); const seg = Math.sqrt(L2); if (!best || d < best.d) best = { d, along: acc + seg * t, q }; acc += seg; }
  return best;
}
function lineStopChain(l) { const geoms = lineGeometries(l); return stationsOf(l).map(s => { if (s.x == null) return { s, pt: null, gi: null, along: null }; const pt = [s.x, s.z]; let best = null; geoms.forEach((g, gi) => { const p = arcPosition(pt, g); if (p && (!best || p.d < best.d)) best = { ...p, gi }; }); return { s, pt, gi: best && best.d <= 40 ? best.gi : null, along: best && best.d <= 40 ? best.along : null, off: best ? best.d : null }; }); }
function lineSegments(l) {
  const chain = lineStopChain(l); const svc = lineService(l); const out = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1]; const ov = (l.segments || []).find(sg => sg.fromId === a.s.id && sg.toId === b.s.id);
    let dist = null, straight = false; if (a.pt && b.pt) { if (a.gi != null && a.gi === b.gi) dist = Math.abs(b.along - a.along); else { dist = dist2(a.pt, b.pt); straight = true; } }
    const measured = ov && num(ov.seconds) != null; const sec = measured ? num(ov.seconds) : dist != null ? dist / svc.speed + svc.dwellSec : null;
    out.push({ from: a.s, to: b.s, dist, sec, basis: measured ? 'measured' : dist != null ? 'estimated' : 'unknown', straight });
  }
  return out;
}
function lineTimetable(l) { const segs = lineSegments(l); let t = 0, known = true; return stationsOf(l).map((s, i) => { const seg = i > 0 ? segs[i - 1] : null; if (seg) { if (seg.sec == null) known = false; else t += seg.sec; } return { s, t: known ? t : null, seg }; }); }
function lineJourneyTime(l, fromId, toId) { const stops = stationsOf(l); const a = stops.findIndex(s => s.id === fromId), b = stops.findIndex(s => s.id === toId); if (a < 0 || b < 0 || a === b) return null; const [i, j] = a < b ? [a, b] : [b, a]; const segs = lineSegments(l).slice(i, j); if (segs.some(s => s.sec == null)) return null; return { sec: segs.reduce((acc, s) => acc + s.sec, 0), stops: j - i, basis: segs.every(s => s.basis === 'measured') ? 'measured' : segs.some(s => s.basis === 'measured') ? 'mixed' : 'estimated', dist: segs.reduce((acc, s) => acc + (s.dist || 0), 0) }; }
const lineEndToEnd = l => { const tt = lineTimetable(l); const last = tt[tt.length - 1]; return last && last.t != null && tt.length > 1 ? last.t : null; };
const tphOf = l => 60 / lineService(l).headwayMin * (l.status === 'partial' ? 0.5 : 1);
function stationService(s) { const lines = linesAtStation(s).filter(l => l.status === 'open'); const tph = lines.reduce((a, l) => a + tphOf(l), 0); return { lines, tph, minHeadway: lines.length ? Math.min(...lines.map(l => lineService(l).headwayMin)) : null, transfer: lines.length > 1 }; }
/* a building's service: nearest open station, walk, trains per hour within reach, distinct lines */
function buildingService(b, { sandbox = false } = {}) {
  if (b.x == null || b.z == null) return null; const pt = [b.x, b.z];
  const cands = S.stations.filter(s => s.x != null && ['open', 'partial'].includes(effectiveStationStatus(s))).map(s => ({ s, d: dist2(pt, [s.x, s.z]), lines: linesAtStation(s).filter(l => ['open', 'partial'].includes(l.status)) }));
  if (sandbox) for (const x of S.sandbox.stations || []) if (x.x != null) cands.push({ s: x, d: dist2(pt, [x.x, x.z]), lines: x.lineId && lineById(x.lineId) ? [lineById(x.lineId)] : [{ id: 'sandbox:' + x.id, service: { headwayMin: num(x.headwayMin) || 5 }, mode: 'subway', status: 'open' }], sandbox: true });
  cands.sort((a, b) => a.d - b.d); const near = cands[0];
  if (!near) return { score: 0, near: null, walkSec: null, tph: 0, lines: 0, walkScore: 0, freqScore: 0, connScore: 0 };
  const within = cands.filter(c => c.d <= SERVICE_REACH); const lineSet = new Map(); for (const c of within) for (const l of c.lines) lineSet.set(l.id, l);
  const tph = [...lineSet.values()].reduce((a, l) => a + tphOf(l), 0);
  const walkScore = clamp(1 - (near.d - SERVICE_WALK_FULL) / (SERVICE_WALK_ZERO - SERVICE_WALK_FULL), 0, 1); const freqScore = clamp(tph / 24, 0, 1); const connScore = clamp(lineSet.size / 3, 0, 1);
  return { score: Math.round(100 * (0.5 * walkScore + 0.3 * freqScore + 0.2 * connScore)), near, walkSec: near.d / WALK_BLOCKS_PER_SEC, tph, lines: lineSet.size, walkScore, freqScore, connScore };
}
function serviceByPlace(sc = UI.scope, opts = {}) {
  const children = scopeChildren(sc);
  const groups = children.length ? children.map(c => ({ c, name: c.node.name, color: childColor(c), rows: scopeBuildingsOf(c).filter(isActive) })) : [{ c: null, name: scopeName(sc), color: scopeColor(sc), rows: scopeActive(sc) }];
  return groups.map(g => { const placed = g.rows.filter(b => b.x != null); const sv = placed.map(b => buildingService(b, opts)).filter(Boolean); const n = sv.length; const avg = n ? Math.round(sv.reduce((a, x) => a + x.score, 0) / n) : null; const wn = sv.filter(x => x.near && x.near.d <= SERVICE_REACH).length; const tph = n ? Math.round(sv.reduce((a, x) => a + x.tph, 0) / n * 10) / 10 : 0; return { ...g, n, placed: placed.length, unplaced: g.rows.length - placed.length, avg, near: wn, pctNear: pct(wn, n), tph, tier: avg == null ? 'none' : avg >= 70 ? 'best' : avg >= 40 ? 'ok' : 'poor' }; }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
}
function serviceColor(score) { if (score == null) return PALETTE.neutral; const t = clamp(score / 100, 0, 1); const r = Math.round(t < .5 ? 255 : 255 - (t - .5) * 2 * 198), g = Math.round(t < .5 ? 90 + t * 2 * 127 : 217), b = Math.round(t < .5 ? 90 : 90 + (t - .5) * 2 * 48); return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); }

/* ---- Transit page tabs ---- */
function renderServiceTab() {
  const sc = UI.scope; const places = serviceByPlace(sc); const all = scopeActive(sc).filter(b => b.x != null); const sv = all.map(b => ({ b, s: buildingService(b) })).filter(x => x.s);
  const best = sv.filter(x => x.s.score >= 70).length, poor = sv.filter(x => x.s.score < 40).length;
  const open = S.lines.filter(l => l.status === 'open' && lineInScope(l, sc));
  if (!S.stations.length) return `<div class="panel empty"><b>No stations yet</b>Service is measured from open stations: place stations on the map and add them to lines. Headways default per mode and can be set on each line.</div>`;
  return `<section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud" style="grid-column:span 2"><div class="panel-head"><h3>WHO IS BEST SERVED · ${esc(scopeName(sc).toUpperCase())}</h3><span class="note">score = walk to the nearest open station · trains per hour within ${SERVICE_REACH} blk · distinct lines</span></div>
      ${places.length ? `<div class="svcrows">${places.map(p => `<div class="svc ${p.tier}" ${p.c ? `data-scope-kind="${p.c.kind}" data-scope-id="${esc(p.c.node.id)}" role="button"` : ''} style="--c:${p.color}"><div class="nm"><i></i>${esc(p.name)}${p.tier === 'best' ? '<span class="mk good">BEST SERVED</span>' : p.tier === 'poor' ? '<span class="mk bad">UNDERSERVED</span>' : ''}</div><div class="bar"><div class="trk"><div class="fill" style="width:${p.avg ?? 0}%;background:${serviceColor(p.avg)}"></div></div></div><div class="sc" style="color:${serviceColor(p.avg)}">${p.avg ?? '—'}</div><div class="d">${p.n ? `${p.pctNear}% within ${SERVICE_REACH} blk of a station · ${p.tph} tph · ${p.n} placed${p.unplaced ? ` · ${p.unplaced} unplaced` : ''}` : 'no placed buildings'}</div></div>`).join('')}</div>` : `<div class="chart-empty">Nothing in scope.</div>`}
    </div>
    <div class="stack">
      <div class="panel hud"><div class="panel-head"><h3>AT A GLANCE</h3><span class="note">${sv.length} placed buildings</span></div>
        <div class="kv" style="margin:0;border:0">${kvHTML('BEST SERVED', `${best}<small>score ≥ 70</small>`, 'num')}${kvHTML('UNDERSERVED', `${poor}<small>score < 40</small>`, 'num')}${kvHTML('NEAR A STATION', `${pct(sv.filter(x => x.s.near && x.s.near.d <= SERVICE_REACH).length, sv.length)}%<small>within ${SERVICE_REACH} blk · ${fmtMins(SERVICE_REACH / WALK_BLOCKS_PER_SEC)} walk</small>`, 'num')}${kvHTML('OPEN LINES', `${open.length}<small>${open.map(l => esc(l.shortName || l.name)).slice(0, 5).join(' · ')}</small>`, 'num')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-act="service-map">${icon('map')} Colour the map by service</button><button class="btn sm" data-tseg="sandbox">${icon('draw')} Plan a station</button></div></div>
      <div class="panel hud"><div class="panel-head"><h3>LINES · HEADWAY</h3><span class="note">trains per hour</span></div>${open.length ? `<div class="hbars">${open.map(l => { const s = lineService(l); return `<div class="hbar" style="--c:${esc(l.color)};grid-template-columns:110px 1fr 86px" data-open="line:${l.id}" role="button"><span class="nm"><i></i>${esc(l.shortName || l.name)}</span><div class="trk"><div class="fill" style="width:${clamp(tphOf(l) / 24 * 100, 4, 100)}%"></div></div><span class="v">${Math.round(tphOf(l) * 10) / 10} tph <span class="muted">${s.headwayMin} min</span></span></div>`; }).join('')}</div>` : `<div class="chart-empty">No open lines in scope.</div>`}</div>
    </div>
  </section>
  ${sv.length ? `<div class="panel hud"><div class="panel-head"><h3>UNDERSERVED BUILDINGS</h3><span class="note">lowest scores first · open to see why</span></div><div class="rank">${sv.sort((a, b) => a.s.score - b.s.score).slice(0, 8).map((x, i) => `<div class="row" data-open="${x.b.id}" data-hover="${x.b.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><div class="nm">${esc(x.b.name || titleOf(x.b))}</div><div class="meta">${x.s.near ? `${esc(x.s.near.s.name || x.s.near.s.reg)} · ${Math.round(x.s.near.d)} blk · ${fmtMins(x.s.walkSec)} walk · ${Math.round(x.s.tph)} tph` : 'no open station on file'}</div></div><div class="h" style="color:${serviceColor(x.s.score)}">${x.s.score}</div></div>`).join('')}</div></div>` : ''}`;
}
function renderTimesTab() {
  const lines = S.lines.filter(l => UI.tf.all || lineInScope(l)).sort((a, b) => lineLabel(a).localeCompare(lineLabel(b)));
  if (!lines.length) return S.lines.length && !UI.tf.all ? `<div class="panel empty"><b>No lines in ${esc(scopeName())}</b>${S.lines.length} line${S.lines.length === 1 ? ' is' : 's are'} on file outside its borders.<br><button class="btn primary" data-tf-toggle="all">${icon('globe')} Show all jurisdictions</button></div>` : `<div class="panel empty"><b>No lines</b>Draw a line on the map and add its stops to see travel times.</div>`;
  const l = lineById(UI.tline) || lines[0]; UI.tline = l.id; if (!lines.includes(l)) lines.unshift(l); const svc = lineService(l); const tt = lineTimetable(l); const e2e = lineEndToEnd(l); const stops = stationsOf(l);
  const jt = UI.tfrom && UI.tto ? lineJourneyTime(l, UI.tfrom, UI.tto) : null;
  const basisChip = b => `<span class="mk ${TIME_BASIS[b]?.tone || 'muted'}">${(TIME_BASIS[b]?.label || b).toUpperCase()}</span>`;
  return `<div class="toolbar" style="margin:0 0 12px"><label class="field on"><span>Line</span><select data-tline>${lines.map(x => `<option value="${x.id}" ${x.id === l.id ? 'selected' : ''}>${esc(lineLabel(x))}</option>`).join('')}</select></label>
    <span class="muted">${basisChip(svc.basis)} ${svc.speed} blk/s · every ${svc.headwayMin} min (${Math.round(tphOf(l) * 10) / 10} tph) · ${svc.dwellSec} s at each stop${svc.custom ? '' : ' · mode defaults'}</span><span class="spacer"></span><button class="btn sm" data-open="line:${l.id}">${icon('edit')} Set service on the line</button></div>
  <section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud" style="grid-column:span 2;padding:0"><div class="panel-head" style="padding:14px 18px 0"><h3>${lineBadge(l)} ${esc(l.name)} · ${stops.length} STOPS</h3><span class="note">${e2e != null ? `end to end ${fmtMins(e2e)}` : 'end-to-end time unknown — some stops lack coordinates or alignment'}</span></div>
      ${stops.length >= 2 ? `<div class="tablewrap" style="border:0;background:transparent"><table class="reg metrics"><thead><tr><th>#</th><th>STOP</th><th class="r">FROM PREVIOUS</th><th class="r">TIME</th><th class="r">CUMULATIVE</th><th>BASIS</th><th class="r">TPH HERE</th></tr></thead><tbody>${tt.map((row, i) => `<tr data-open="station:${row.s.id}" style="cursor:pointer"><td class="num">${i + 1}</td><td><b>${esc(row.s.name || row.s.reg)}</b>${linesAtStation(row.s).length > 1 ? ' <span class="mk transit">TRANSFER</span>' : ''}${row.s.x == null ? ' <span class="mk warn">NO COORDS</span>' : ''}</td><td class="num r">${row.seg ? (row.seg.dist != null ? `${fmtInt(row.seg.dist)} blk${row.seg.straight ? '*' : ''}` : '—') : ''}</td><td class="num r">${row.seg ? (row.seg.sec != null ? fmtMins(row.seg.sec) : '—') : ''}</td><td class="num r hi">${row.t != null ? fmtMins(row.t) : '—'}</td><td>${row.seg ? basisChip(row.seg.basis) : ''}</td><td class="num r">${Math.round(stationService(row.s).tph * 10) / 10}</td></tr>`).join('')}</tbody></table></div>${tt.some(r => r.seg?.straight) ? '<div class="desc-line" style="padding:0 18px 14px">* straight-line distance — the two stops sit on different alignments or off the drawn track.</div>' : ''}` : `<div class="chart-empty">Add at least two stops.</div>`}
    </div>
    <div class="panel hud"><div class="panel-head"><h3>JOURNEY</h3><span class="note">between two stops</span></div>
      <div class="f" style="margin-bottom:8px"><label>From</label><select data-tfrom><option value="">—</option>${stops.map(s => `<option value="${s.id}" ${s.id === UI.tfrom ? 'selected' : ''}>${esc(s.name || s.reg)}</option>`).join('')}</select></div>
      <div class="f" style="margin-bottom:8px"><label>To</label><select data-tto><option value="">—</option>${stops.map(s => `<option value="${s.id}" ${s.id === UI.tto ? 'selected' : ''}>${esc(s.name || s.reg)}</option>`).join('')}</select></div>
      ${jt ? `<div class="kv" style="margin:0;border:0">${kvHTML('ON BOARD', `${fmtMins(jt.sec)}<small>${jt.stops} stop${jt.stops === 1 ? '' : 's'} · ${fmtInt(jt.dist)} blk</small>`, 'num')}${kvHTML('AVERAGE WAIT', `${fmtMins(svc.headwayMin * 30)}<small>half the headway</small>`, 'num')}${kvHTML('DOOR TO DOOR', `${fmtMins(jt.sec + svc.headwayMin * 30)}<small>${basisChip(jt.basis)}</small>`, 'num')}</div>` : UI.tfrom && UI.tto ? `<div class="chart-empty">Not computable — a stop in between lacks coordinates.</div>` : `<div class="chart-empty">Pick two stops.</div>`}
    </div>
  </section>`;
}
function renderSandboxTab() {
  const sc = UI.scope; const sb = S.sandbox.stations || []; const before = serviceByPlace(sc), after = serviceByPlace(sc, { sandbox: true });
  const lines = S.lines.filter(l => l.status === 'open');
  return `<section class="grid cols-3" style="margin-bottom:16px">
    <div class="panel hud"><div class="panel-head"><h3>PLANNING SANDBOX</h3><span class="note">nothing here touches the registry</span></div>
      <p class="muted" style="font-size:12.5px;margin:0 0 10px">Try a station: the service scores on the right are recomputed as if it were open. Promote it to a real (planned) station when you build it.</p>
      <form class="form" id="sbform" onsubmit="return false"><div class="frow c3">
        ${fld('sbname', 'Name', inpF('sbname', '', 'placeholder="Mill Basin"'))}${fld('sbx', 'X', numF('sbx', '', 'step="1"'))}${fld('sbz', 'Z', numF('sbz', '', 'step="1"'))}
        ${fld('sbline', 'On line', `<select id="f-sbline"><option value="">new line · headway below</option>${lines.map(l => `<option value="${l.id}">${esc(lineLabel(l))}</option>`).join('')}</select>`)}${fld('sbhead', 'Headway', numF('sbhead', 5, 'min="1" step="1"'), 'minutes')}
        <div class="f"><label>&nbsp;</label><button type="button" class="btn primary sm" data-act="sandbox-add">${icon('plus')} Try it</button></div>
      </div></form>
      ${sb.length ? `<div class="rowlist" style="margin-top:12px">${sb.map(x => `<div class="r"><div><div class="t"><span class="mk warn">SANDBOX</span>${esc(x.name || 'Unnamed')}</div><div class="s">X ${esc(x.x)} · Z ${esc(x.z)} · ${x.lineId && lineById(x.lineId) ? esc(lineLabel(lineById(x.lineId))) : `new line every ${esc(x.headwayMin || 5)} min`}</div></div><div class="v" style="display:flex;gap:6px"><button class="btn sm" data-act="sandbox-promote" data-id="${x.id}" title="Create a real planned station here">${icon('station')} Promote</button><button class="btn sm ghost" data-act="sandbox-remove" data-id="${x.id}">${icon('x')}</button></div></div>`).join('')}</div>` : `<div class="desc-line" style="margin-top:10px">No sandbox stations yet.</div>`}
    </div>
    <div class="panel hud" style="grid-column:span 2"><div class="panel-head"><h3>EFFECT BY PLACE</h3><span class="note">current score → with the sandbox</span></div>
      ${before.length ? `<div class="svcrows">${before.map((p, i) => { const a = after.find(x => x.name === p.name) || p; const d = (a.avg ?? 0) - (p.avg ?? 0); return `<div class="svc" style="--c:${p.color}"><div class="nm"><i></i>${esc(p.name)}</div><div class="bar"><div class="trk"><div class="fill" style="width:${p.avg ?? 0}%;background:${serviceColor(p.avg)};opacity:.45"></div><div class="fill ghost" style="width:${a.avg ?? 0}%;background:${serviceColor(a.avg)}"></div></div></div><div class="sc" style="color:${serviceColor(a.avg)}">${p.avg ?? '—'} → ${a.avg ?? '—'}${d ? `<small class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${d}</small>` : ''}</div><div class="d">${p.pctNear}% → ${a.pctNear}% within ${SERVICE_REACH} blk</div></div>`; }).join('')}</div>` : `<div class="chart-empty">Nothing in scope.</div>`}
    </div>
  </section>`;
}
function sandboxAdd() { const g = id => $('#f-' + id)?.value ?? ''; const x = num(g('sbx')), z = num(g('sbz')); if (x == null || z == null) { toast('Give the station X and Z', 'warn'); return; } S.sandbox.stations = [...(S.sandbox.stations || []), { id: uid('sb'), name: g('sbname').trim(), x, z, lineId: g('sbline') || null, headwayMin: num(g('sbhead')) || 5, created: now() }]; commit({ silentRender: true }); renderView(false); toast('Sandbox station added — scores recomputed', 'good'); }
function sandboxRemove(id) { S.sandbox.stations = (S.sandbox.stations || []).filter(x => x.id !== id); commit({ silentRender: true }); renderView(false); }
async function sandboxPromote(id) {
  const x = (S.sandbox.stations || []).find(s => s.id === id); if (!x) return;
  const r = await confirmDialog({ title: `Create a planned station at X ${x.x} · Z ${x.z}?`, body: `<p>A real station record is created with status <b>planned</b>${x.lineId && lineById(x.lineId) ? ` and added in order as a stop of ${esc(lineLabel(lineById(x.lineId)))}` : ''}. The sandbox entry is removed.</p>`, ok: 'Create station' }); if (r !== 'ok') return;
  const s = newStation(S); s.name = x.name || `Station at ${x.x}, ${x.z}`; s.x = x.x; s.z = x.z; s.status = 'planned'; s.source = 'planning sandbox'; S.stations.push(s);
  if (x.lineId && lineById(x.lineId)) addStopOrdered(lineById(x.lineId), s.id);
  S.sandbox.stations = S.sandbox.stations.filter(y => y.id !== id); commit(); renderView(false); toast(`${s.reg} created as a planned station`, 'good');
}
/* ---- line editor & record ---- */
function lineServiceEditorHTML(l) {
  const d = SERVICE_DEFAULTS[l.mode] || SERVICE_DEFAULTS.other; const s = l.service || {}; const segs = lineSegments(l);
  return `<div class="fsect"><h4>SERVICE TIMES <span style="font-weight:400;letter-spacing:0;color:var(--ink-4);font-family:var(--font-mono);font-size:10.5px">leave blank for the ${esc(MODE_LABEL[l.mode] || l.mode)} defaults · measured segment times override estimates</span></h4>
    <div class="frow c3">
      ${fld('svcSpeed', 'Speed', numF('svcSpeed', s.speed ?? '', `placeholder="${d.speed}" min="0.1" step="0.1"`), 'blocks per second')}
      ${fld('svcHeadway', 'Headway', numF('svcHeadway', s.headwayMin ?? '', `placeholder="${d.headwayMin}" min="1" step="1"`), 'minutes between trains')}
      ${fld('svcDwell', 'Dwell', numF('svcDwell', s.dwellSec ?? '', `placeholder="${d.dwellSec}" min="0" step="1"`), 'seconds at each stop')}
      ${fld('svcBasis', 'Basis', selF('svcBasis', TIME_BASES.map(([i, lb]) => [i, lb]), s.basis || 'estimated'), 'how these figures were obtained')}
    </div>
    ${segs.length ? `<div class="desc-line" style="margin-top:10px">MEASURED TIMES BETWEEN STOPS <span class="muted">· seconds · blank keeps the estimate</span></div><div class="seglist">${segs.map((sg, i) => { const ov = (l.segments || []).find(x => x.fromId === sg.from.id && x.toId === sg.to.id); return `<div class="sr"><span class="t">${esc(sg.from.name || sg.from.reg)} → ${esc(sg.to.name || sg.to.reg)}</span><span class="e muted">${sg.dist != null ? `est. ${fmtMins(sg.dist / lineService(l).speed + lineService(l).dwellSec)}` : 'no estimate'}</span><input class="num" type="number" min="1" step="1" data-seg-from="${sg.from.id}" data-seg-to="${sg.to.id}" value="${esc(ov && num(ov.seconds) != null ? ov.seconds : '')}" placeholder="s"></div>`; }).join('')}</div>` : `<div class="desc-line" style="margin-top:10px">Add two or more stops to time the segments.</div>`}
  </div>`;
}
function readLineServiceForm(l) {
  const g = id => $('#f-' + id)?.value ?? ''; if (!$('#f-svcBasis')) return;
  const speed = num(g('svcSpeed')), headwayMin = num(g('svcHeadway')), dwellSec = num(g('svcDwell')); const basis = g('svcBasis') || 'estimated';
  l.service = speed != null || headwayMin != null || dwellSec != null || basis !== 'estimated' ? { speed, headwayMin, dwellSec, basis } : null;
  l.segments = $$('#lform [data-seg-from]').map(inp => { const v = num(inp.value); return v != null && v > 0 ? { fromId: inp.dataset.segFrom, toId: inp.dataset.segTo, seconds: v, basis: 'measured' } : null; }).filter(Boolean);
}
function lineServiceSectionHTML(l) {
  const svc = lineService(l); const tt = lineTimetable(l); const e2e = lineEndToEnd(l); if (tt.length < 2) return '';
  const measured = (l.segments || []).length;
  return `<div class="secthead">SERVICE <span class="muted" style="letter-spacing:0;font-weight:400">· ${esc(TIME_BASIS[svc.basis]?.label || svc.basis)}${measured ? ` · ${measured} measured segment${measured === 1 ? '' : 's'}` : ''}</span></div>
  <div class="kv">${kvHTML('HEADWAY', `${svc.headwayMin}<small>min · ${Math.round(tphOf(l) * 10) / 10} trains per hour</small>`, 'num')}${kvHTML('END TO END', e2e != null ? `${fmtMins(e2e)}<small>${tt.length} stops · ${svc.speed} blk/s</small>` : null, 'num')}</div>
  <div class="timeline-mini" style="--c:${esc(l.color)}">${tt.map(r => `<div class="tm" data-open="station:${r.s.id}"><span class="dot"></span><span class="n">${esc(r.s.name || r.s.reg)}</span><span class="t">${r.t != null ? fmtMins(r.t) : '—'}</span></div>`).join('')}</div>`;
}
/* ---- sandbox stations on the map ---- */
function drawSandbox(ctx, P, k) { for (const x of S.sandbox.stations || []) { if (x.x == null) continue; const [sx, sy] = P.s(x.x, x.z); ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); if (k > 1.5) { ctx.fillStyle = '#FFD166'; ctx.font = '600 10px Bricolage Grotesque, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${x.name || 'sandbox'} ?`, sx + 10, sy); } } }
