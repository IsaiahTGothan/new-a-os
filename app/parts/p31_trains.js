/* =====================================================================
   §31 TRAINS — the trains on the live map. Every open line runs a train
       each headway from each end, within its hours, at its speed, dwelling
       at every stop: the same timetable the departure board shows, so the
       map and the board agree to the second. Positions come from the clock
       (deterministic, nothing is stored); a toggle chip hides them.
   ===================================================================== */
const TRAIN_FPS = 18;
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000; };
/* departures from a line's terminal in one direction, as minutes of the day (previous and next day included so trains
   still on the line after midnight are placed); the phase is the same one the board uses */
function lineDepartures(l, dir, { hours = l.hours || '', o = l, from = -1440, to = 1440, nowMin = nowMinutes() } = {}) {
  const status = l.status || 'open'; if (!['open', 'partial'].includes(status)) return [];
  const svc = lineService(l); const hw = Math.max(1, svc.headwayMin * (status === 'partial' ? 2 : 1)); const phase = (hashNum(l.id + dir) % Math.max(1, Math.round(hw * 10))) / 10;
  const win = hoursWindows(hours, o); const out = [];
  for (let k = -1; k <= 1; k++) for (const [a, b] of win) { const start = a * 60 + phase; for (let t = start; t < b * 60; t += hw) { const at = t + k * 1440; if (at >= nowMin + from && at <= nowMin + to) out.push(at); } }
  return out.sort((a, b) => a - b);
}
/* the point s blocks along a polyline, with the heading there */
function pointAtArc(g, s) {
  let acc = 0; for (let i = 1; i < g.length; i++) { const L = dist2(g[i - 1], g[i]); if (acc + L >= s || i === g.length - 1) { const t = L ? clamp((s - acc) / L, 0, 1) : 0; return { x: g[i - 1][0] + (g[i][0] - g[i - 1][0]) * t, z: g[i - 1][1] + (g[i][1] - g[i - 1][1]) * t, ang: Math.atan2(g[i][1] - g[i - 1][1], g[i][0] - g[i - 1][0]) }; } acc += L; }
  return { x: g[0][0], z: g[0][1], ang: 0 };
}
/* where every train of a line is right now: [{ x, z, ang, dir, dwell, at (station), next (station), frac (0–1 of the run) }] */
function lineTrains(l, nowMin = nowMinutes()) {
  const status = l.status || 'open'; if (!['open', 'partial'].includes(status)) return [];
  const chain = lineStopChain(l).filter(c => c.pt); if (chain.length < 2) return [];
  const segsAll = lineSegments(l); const svc = lineService(l); const geoms = lineGeometries(l);
  // segments between consecutive placed stops, in the order of the chain
  const stops = chain.map(c => c.s); const segs = []; for (let i = 0; i < stops.length - 1; i++) { const sg = segsAll.find(x => x.from.id === stops[i].id && x.to.id === stops[i + 1].id); const dist = sg?.dist ?? dist2(chain[i].pt, chain[i + 1].pt); const sec = sg?.sec ?? (dist / svc.speed + svc.dwellSec); segs.push({ dist, sec, travel: Math.max(1, sec - svc.dwellSec) }); }
  const total = segs.reduce((a, s) => a + s.sec, 0); if (!total) return [];
  const out = [];
  for (const dir of [1, -1]) {
    const order = dir === 1 ? chain.map((c, i) => i) : chain.map((c, i) => chain.length - 1 - i);
    const segOf = j => segs[dir === 1 ? j : chain.length - 2 - j];   // j: index along the run
    for (const dep of lineDepartures(l, dir, { nowMin, from: -(total / 60) - 1, to: 0 })) {
      const e = (nowMin - dep) * 60; if (e < 0 || e > total) continue;
      let t = 0, j = 0; while (j < order.length - 1 && t + segOf(j).sec <= e) { t += segOf(j).sec; j++; }
      const a = chain[order[j]], b = chain[order[Math.min(order.length - 1, j + 1)]]; const sg = j < order.length - 1 ? segOf(j) : null;
      if (!sg || a === b) { out.push({ l, dir, x: a.pt[0], z: a.pt[1], ang: 0, dwell: true, at: a.s, next: null, frac: dir === 1 ? 1 : 0 }); continue; }
      const local = e - t;
      if (local >= sg.travel) { out.push({ l, dir, x: b.pt[0], z: b.pt[1], ang: Math.atan2(b.pt[1] - a.pt[1], b.pt[0] - a.pt[0]), dwell: true, at: b.s, next: chain[order[j + 2]]?.s || null, frac: (t + sg.sec) / total }); continue; }
      const f = local / sg.travel; let pos;
      if (a.gi != null && a.gi === b.gi && a.along != null && b.along != null) { const g = geoms[a.gi]; pos = pointAtArc(g, a.along + (b.along - a.along) * f); if (b.along < a.along) pos.ang += Math.PI; }
      else pos = { x: a.pt[0] + (b.pt[0] - a.pt[0]) * f, z: a.pt[1] + (b.pt[1] - a.pt[1]) * f, ang: Math.atan2(b.pt[1] - a.pt[1], b.pt[0] - a.pt[0]) };
      out.push({ l, dir, ...pos, dwell: false, at: null, next: b.s, frac: (t + local) / total });
    }
  }
  return out;
}
function liveTrains(nowMin = nowMinutes()) { const out = []; for (const l of S.lines) out.push(...lineTrains(l, nowMin)); return out; }
/* draw them: a rounded car in the line colour, nose first; a dwelling train sits on its station with a soft pulse */
function drawTrains(ctx, P, k, trains) {
  const t = Date.now() / 1000;
  for (const tr of trains) {
    const [x, y] = P.s(tr.x, tr.z); if (x < -30 || y < -30 || x > ctx.canvas.width + 30 || y > ctx.canvas.height + 30) continue;
    const wpx = lineWidthPx(tr.l, k); const L = clamp(wpx * 2.3, 12, 28), Wd = clamp(wpx * 1.05, 6, 12); const col = tr.l.color || '#B99CFF';
    ctx.save(); ctx.translate(x, y); ctx.rotate(tr.ang);
    if (tr.dwell) { const ph = (t % 1.6) / 1.6; ctx.beginPath(); ctx.arc(0, 0, Wd + 3 + ph * 9, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, (1 - ph) * .55); ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-L / 2, -Wd / 2, L, Wd, Wd / 2) : ctx.rect(-L / 2, -Wd / 2, L, Wd); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#05090D'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L / 2 - 1, 0); ctx.lineTo(L / 2 - Wd * .7, -Wd * .32); ctx.lineTo(L / 2 - Wd * .7, Wd * .32); ctx.closePath(); ctx.fillStyle = 'rgba(5,9,13,.85)'; ctx.fill();   // the nose
    if (L >= 18) { ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * (L / 4.2), 0, Math.max(1, Wd * .14), 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
}
/* the loop: redraw the map while trains are on it (only on the live map, only while it is on screen) */
function trainsRunning() { return UI.nav === 'map' && MAPW.mounted && UI.layers.trains !== false && MAPW.when == null && !document.hidden && motionOn() && S.lines.some(l => ['open', 'partial'].includes(l.status || 'open') && (l.stopIds || []).length >= 2); }
function trainsLoop() {
  if (MAPW.trainRaf) cancelAnimationFrame(MAPW.trainRaf); if (MAPW.trainTimer) clearTimeout(MAPW.trainTimer); MAPW.trainTimer = null;
  let last = 0;
  const step = now => { MAPW.trainRaf = null; if (!trainsRunning()) { MAPW.trainTimer = setTimeout(trainsLoop, 2500); return; } if (now - last >= 1000 / TRAIN_FPS && !MAPW.drag) { last = now; mapDraw(); } MAPW.trainRaf = requestAnimationFrame(step); };
  MAPW.trainRaf = requestAnimationFrame(step);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.nav === 'map') trainsLoop(); });
/* a strip of the line for the board: stops as ticks, trains as dots moving between them */
function lineStripHTML(l) {
  const chain = lineStopChain(l).filter(c => c.pt); if (chain.length < 2) return '';
  const tt = lineTimetable(l); const byId = new Map(tt.map(r => [r.s.id, r.t])); const total = tt[tt.length - 1]?.t || 1; if (!total) return '';
  const trains = lineTrains(l);
  return `<div class="lstrip" style="--c:${esc(l.color || '#B99CFF')}" title="${trains.length} train${trains.length === 1 ? '' : 's'} on the line right now">${chain.map(c => `<i class="tick" style="left:${((byId.get(c.s.id) ?? 0) / total * 100).toFixed(1)}%" title="${esc(c.s.name || c.s.reg)}"></i>`).join('')}${trains.map(tr => `<b class="tr ${tr.dir === 1 ? 'f' : 'r'} ${tr.dwell ? 'dw' : ''}" style="left:${(tr.frac * 100).toFixed(1)}%" title="${tr.dwell ? 'at ' + esc(tr.at?.name || tr.at?.reg || '') : 'to ' + esc(tr.next?.name || tr.next?.reg || '')}"></b>`).join('')}</div>`;
}
