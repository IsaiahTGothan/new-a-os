/* =====================================================================
   §18 MAP ASSISTANT — answers from the records (facts), suggestions with an
       Apply / Cancel preview, and an optional AI provider that can only
       trigger the same validated actions. Nothing is invented.
   ===================================================================== */
const ASST = { log: [], pending: null };
const ASST_EXAMPLES = ['Show construction in Man A', 'Find businesses on Mill Street', 'Which road best serves MA-0004?', 'Highlight missing coordinates', 'Show this area in Late 2018', 'Landmarks in New BK', 'How many buildings in Long Island?', 'What is undated?'];
function renderAssistantPanel() {
  return `<div class="asst">
    <div class="chips">${ASST_EXAMPLES.map(q => `<button data-act="asst-run" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="log" id="asst-log">${ASST.log.length ? ASST.log.map(m => m.role === 'me' ? `<div class="msg me">${esc(m.text)}</div>` : `<div class="msg"><span class="k ${m.kind}">${m.kind === 'fact' ? 'FROM THE RECORDS' : m.kind === 'sugg' ? 'SUGGESTION · NOT RECORDED' : m.kind === 'ai' ? 'AI PROVIDER · UNVERIFIED' : 'NOTE'}</span>${m.html}${m.hits?.length ? `<div class="hits">${m.hits.slice(0, 24).map(h => `<button data-act="asst-locate" data-kind="${h.kind}" data-id="${esc(h.id)}" title="Locate on the map">${esc(h.label)}</button>`).join('')}${m.hits.length > 24 ? `<span class="muted" style="font-size:11px">+${m.hits.length - 24}</span>` : ''}</div>` : ''}${m.action && ASST.pending === m.action ? `<div class="pv">PREVIEW SHOWN ON THE MAP<button class="btn sm primary" data-act="asst-apply">${icon('check')} Apply</button><button class="btn sm ghost" data-act="asst-cancel">Cancel</button></div>` : ''}</div>`).join('') : `<div class="dock-empty"><b>Ask about the map.</b> Answers come from the records and are highlighted; drawing or linking suggestions appear as a preview you apply or cancel. ${S.settings.ai?.enabled ? 'An AI provider is on for questions the built-in rules do not understand — its answers are marked and still go through the same validated actions.' : 'No AI provider is connected; everything here is deterministic. You can connect one under Vault & settings.'}</div>`}</div>
    <div class="ask"><input id="asst-q" placeholder="Ask, e.g. “businesses on Flatbush Avenue”" autocomplete="off"><button class="btn primary icon" data-act="asst-send" title="Ask">${icon('spark')}</button></div>
  </div>`;
}
const placeByName = q => { const qn = norm(q); if (!qn) return null; const cands = [...S.regions.map(r => ({ kind: 'region', node: r })), ...S.districts.map(d => ({ kind: 'district', node: d })), ...S.neighborhoods.map(h => ({ kind: 'hood', node: h }))].map(c => ({ ...c, s: Math.max(fuzzyScore(qn, c.node.name), c.node.code ? fuzzyScore(qn, c.node.code) : 0) })).filter(c => c.s >= 0.5).sort((a, b) => b.s - a.s); return cands[0] || null; };
const roadByName = q => { const qn = norm(q); if (!qn) return null; const c = S.roads.map(r => ({ r, s: Math.max(fuzzyScore(qn, r.name), ...(r.aliases || []).map(a => fuzzyScore(qn, a)), ...(r.formerNames || []).map(a => fuzzyScore(qn, a) * .9)) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s); return c[0]?.r || null; };
const buildingByText = q => { const r = findByReg(q); if (r) return r; const qn = norm(q); if (!qn) return null; const c = S.buildings.map(b => ({ b, s: Math.max(fuzzyScore(qn, b.name), fuzzyScore(qn, addressOf(b))) })).filter(x => x.s >= 0.6).sort((a, b) => b.s - a.s); return c[0]?.b || null; };
const bHit = b => ({ kind: 'building', id: b.id, label: `${b.reg} ${truncate(b.name || titleOf(b), 22)}` });
function asstAnswer(q) {
  const t = q.trim(); const tl = t.toLowerCase(); const sc = UI.scope; const scopeLabel = scopeName();
  const placeRows = (placeText) => { const p = placeText ? placeByName(placeText) : null; const rows = p ? scopeBuildings({ kind: p.kind, id: p.node.id }) : scopeBuildings(sc); return { p, rows, name: p ? p.node.name : scopeLabel }; };
  let m;
  if ((m = /^(?:show|list|find|highlight)?\s*(?:what(?:'s| is)\s+)?(?:under\s+)?construction(?:\s+(?:in|around|at)\s+(.+))?\??$/i.exec(tl)) || (m = /^(?:show|list|find)?\s*(?:projects|building sites)(?:\s+in\s+(.+))?\??$/i.exec(tl))) {
    const { p, rows, name } = placeRows(m[1]); if (m[1] && !p) return { kind: 'fact', html: `I do not know a place called “${esc(m[1])}”.` };
    const uw = rows.filter(isUnderWay).filter(b => isActive(b)); return { kind: 'fact', html: `<b>${uw.length}</b> project${uw.length === 1 ? '' : 's'} under way in ${esc(name)}: ${uw.filter(b => b.physical === 'construction').length} under construction, ${uw.filter(b => b.physical === 'planned').length} planned. ${uw.filter(b => b.x == null).length ? `${uw.filter(b => b.x == null).length} have no coordinates and cannot be highlighted.` : ''}`, hits: uw.map(bHit), highlight: uw.map(b => b.id), fit: uw.filter(b => b.x != null) };
  }
  if ((m = /^(?:find|show|list|which)?\s*business(?:es)?\s+(?:on|along|at|in)\s+(this street|this road|.+?)\??$/i.exec(tl))) {
    const road = /^this (street|road)$/.test(m[1]) ? (MAPW.sel?.kind === 'road' ? roadById(MAPW.sel.id) : null) : roadByName(m[1]);
    if (!road) { const pl = placeByName(m[1]); if (pl) { const rows = scopeBuildings({ kind: pl.kind, id: pl.node.id }); const zs = [...new Set(rows.flatMap(b => currentTenanciesAt(b).map(x => x.businessId)))].map(bizById).filter(Boolean); return { kind: 'fact', html: `<b>${zs.length}</b> business${zs.length === 1 ? '' : 'es'} with a current tenancy in ${esc(pl.node.name)}.`, hits: zs.map(z => ({ kind: 'business', id: z.id, label: bizLabel(z) })) }; } return { kind: 'fact', html: /^this/.test(m[1]) ? 'Select a road first, then ask again.' : `No road called “${esc(m[1])}” is on the map${S.roads.length ? '' : ' — no roads have been drawn yet'}.` }; }
    const bs = buildingsOnRoad(road); const ts = bs.flatMap(b => currentTenanciesAt(b)); const zs = [...new Set(ts.map(x => x.businessId))].map(bizById).filter(Boolean);
    return { kind: 'fact', html: `<b>${zs.length}</b> business${zs.length === 1 ? '' : 'es'} currently on ${esc(roadLabel(road))} (${bs.length} building${bs.length === 1 ? '' : 's'} associated with the road): ${zs.map(z => esc(bizLabel(z))).join(', ') || 'none linked yet'}. Roles: ${[...new Set(ts.map(x => ROLE_LABEL[x.role]))].join(', ') || '—'}.`, hits: [...zs.map(z => ({ kind: 'business', id: z.id, label: bizLabel(z) })), ...bs.map(bHit)], highlight: [road.id, ...bs.map(b => b.id)], fit: bs.filter(b => b.x != null), sel: { kind: 'road', id: road.id } };
  }
  if ((m = /^(?:which|what)\s+(?:road|street)\s+(?:best\s+)?serves\s+(this building|.+?)\??$/i.exec(tl)) || (m = /^(?:road|street)\s+for\s+(this building|.+?)\??$/i.exec(tl))) {
    const b = /^this building$/.test(m[1]) ? (MAPW.sel?.kind === 'building' ? byId(MAPW.sel.id) : null) : buildingByText(m[1]);
    if (!b) return { kind: 'fact', html: /^this/.test(m[1]) ? 'Select a building first.' : `I cannot find a building matching “${esc(m[1])}”.` };
    const sug = roadSuggest(b); if (!sug.pt) return { kind: 'fact', html: `${esc(b.reg)} has no coordinates, so no road can be judged.`, hits: [bHit(b)] };
    if (!sug.items.length) return { kind: 'fact', html: `No roads are drawn near ${esc(b.reg)} yet.`, hits: [bHit(b)] };
    const best = sug.items[0]; const cur = roadById(b.roadId);
    const action = { type: 'set-road', buildingId: b.id, roadId: best.road.id, preview: { points: [best.q], geoms: [{ pts: [sug.pt, best.q] }] } };
    return { kind: 'sugg', html: `Closest usable road for <b>${esc(b.reg)} ${esc(titleOf(b))}</b>: <b>${esc(roadLabel(best.road))}</b> — ${esc(roadSuggestReason(best, sug.basis))}${sug.items[1] ? ` Alternative: ${esc(roadLabel(sug.items[1].road))} (${Math.round(sug.items[1].d)} blk)${sug.items[1].corner ? ', a corner situation' : ''}.` : ''}${cur ? ` Currently associated with ${esc(roadLabel(cur))}${cur.id === best.road.id ? ' — already the best match' : ''}.` : ''} This is a proximity suggestion — the connector on the map shows the measured line, not an entrance.`, hits: [bHit(b), ...sug.items.map(it => ({ kind: 'road', id: it.road.id, label: roadLabel(it.road) }))], highlight: [b.id, best.road.id], sel: { kind: 'building', id: b.id }, fit: [{ x: sug.pt[0], z: sug.pt[1] }, { x: best.q[0], z: best.q[1] }], action: cur?.id === best.road.id ? null : action };
  }
  if (/missing coordinates|without coordinates|no coordinates|unplaced/.test(tl)) { const rows = scopeActive().filter(b => b.x == null || b.z == null); return { kind: 'fact', html: `<b>${rows.length}</b> standing building${rows.length === 1 ? '' : 's'} in ${esc(scopeLabel)} have no coordinates and are not on the map. Open one and use “Pick coordinates on the map”.`, hits: rows.map(bHit) }; }
  if (/undated|without (a )?(year|date)/.test(tl)) { const rows = scopeBuildings(); const u = rows.filter(b => (isActive(b) && !isUnderWay(b) && b.yearBuilt == null) || (isUnderWay(b) && b.yearStarted == null && b.yearBuilt == null && b.yearExpected == null) || (isHist(b) && (b.yearDemolished == null || b.yearBuilt == null))); return { kind: 'fact', html: `<b>${u.length}</b> record${u.length === 1 ? '' : 's'} in ${esc(scopeLabel)} cannot be placed on the timeline: ${u.filter(isActive).filter(b => !isUnderWay(b)).length} without a completion year, ${u.filter(isUnderWay).length} projects without any date, ${u.filter(isHist).length} demolished without a full date range. They are reported, never counted as new.`, hits: u.map(bHit), highlight: u.map(b => b.id) }; }
  if ((m = /^(?:show|open|view)\s+(?:(this area|here|.+?)\s+)?in\s+(early|late)?\s*(20\d\d)\??$/i.exec(tl))) {
    const placeText = m[1] && !/^(this area|here)$/.test(m[1]) ? m[1] : null; const p = placeText ? placeByName(placeText) : null; if (placeText && !p) return { kind: 'fact', html: `I do not know a place called “${esc(placeText)}”.` };
    const action = { type: 'open-playback', year: +m[3], half: m[2] ? (m[2].toLowerCase() === 'early' ? 'E' : 'L') : 'E', scope: p ? { kind: p.kind, id: p.node.id } : null };
    return { kind: 'sugg', html: `Open playback for ${esc(p ? p.node.name : scopeLabel)} at <b>${esc(hyLabel(action.year, action.half))}</b>? Only dated records appear there.`, action, autoApply: true };
  }
  if ((m = /^(?:show|list|find)?\s*(landmarks?|demolished|for sale|for lease|vacant lots?|planned|closed|tallest|oldest|newest)(?:\s+(?:in|around)\s+(.+))?\??$/i.exec(tl))) {
    const { p, rows, name } = placeRows(m[2]); if (m[2] && !p) return { kind: 'fact', html: `I do not know a place called “${esc(m[2])}”.` };
    const what = m[1]; let list, desc;
    if (/landmark/.test(what)) { list = rows.filter(b => b.landmark && isActive(b)); desc = 'landmarks'; }
    else if (what === 'demolished') { list = rows.filter(isHist); desc = 'demolished buildings'; }
    else if (what === 'for sale') { list = rows.filter(b => b.market === 'for-sale'); desc = 'for sale'; }
    else if (what === 'for lease') { list = rows.filter(b => b.market === 'for-lease'); desc = 'for lease'; }
    else if (/vacant/.test(what)) { list = rows.filter(b => b.physical === 'vacant-lot' && isActive(b)); desc = 'vacant lots'; }
    else if (what === 'planned') { list = rows.filter(b => b.physical === 'planned'); desc = 'planned'; }
    else if (what === 'closed') { list = rows.filter(b => b.physical === 'closed'); desc = 'standing but closed'; }
    else if (what === 'tallest') { list = rows.filter(b => isActive(b) && heightOf(b)).sort((a, b) => heightOf(b) - heightOf(a)).slice(0, 10); desc = `tallest (by recorded height)`; }
    else if (what === 'oldest') { list = rows.filter(b => isCompleted(b) && b.yearBuilt != null).sort((a, b) => a.yearBuilt - b.yearBuilt).slice(0, 10); desc = 'oldest standing (by completion year)'; }
    else { list = rows.filter(b => isCompleted(b) && b.yearBuilt != null).sort((a, b) => b.yearBuilt - a.yearBuilt).slice(0, 10); desc = 'newest completed'; }
    return { kind: 'fact', html: `<b>${list.length}</b> ${desc} in ${esc(name)}${list.length && /tallest|oldest|newest/.test(what) ? ': ' + list.slice(0, 5).map(b => `${esc(b.reg)} ${esc(truncate(b.name || titleOf(b), 24))}${what === 'tallest' ? ` (${fmtInt(heightOf(b))} blk)` : ` (${esc(builtHTML(b))})`}`).join(', ') : '.'}`, hits: list.map(bHit), highlight: list.map(b => b.id), fit: list.filter(b => b.x != null) };
  }
  if ((m = /^how many\s+(buildings?|roads?|streets?|lines?|stations?|business(?:es)?|demolitions?|landmarks?)(?:\s+(?:are\s+)?(?:there\s+)?(?:in|around)\s+(.+))?\??$/i.exec(tl))) {
    const { p, rows, name } = placeRows(m[2]); if (m[2] && !p) return { kind: 'fact', html: `I do not know a place called “${esc(m[2])}”.` }; const w = m[1];
    if (/^building/.test(w)) return { kind: 'fact', html: `${esc(name)}: <b>${rows.filter(isCompleted).length}</b> completed and standing, ${rows.filter(isUnderWay).length} under way, ${rows.filter(b => b.physical === 'vacant-lot' && isActive(b)).length} vacant lots, ${rows.filter(isHist).length} demolished — ${rows.length} records in all.` };
    if (/^road|^street/.test(w)) { const rs = S.roads.filter(r => p ? roadInScope(r, { kind: p.kind, id: p.node.id }) : roadInScope(r, sc)); return { kind: 'fact', html: `<b>${rs.length}</b> road${rs.length === 1 ? '' : 's'} touch ${esc(name)} (${fmtInt(rs.reduce((a, r) => a + polyLength(r.geometry), 0))} blocks in all).`, hits: rs.map(r => ({ kind: 'road', id: r.id, label: roadLabel(r) })) }; }
    if (/^line/.test(w)) { const ls = S.lines.filter(l => p ? lineInScope(l, { kind: p.kind, id: p.node.id }) : lineInScope(l, sc)); return { kind: 'fact', html: `<b>${ls.length}</b> transit line${ls.length === 1 ? '' : 's'} serve ${esc(name)}: ${ls.map(l => esc(lineLabel(l))).join(', ') || 'none'}.`, hits: ls.map(l => ({ kind: 'line', id: l.id, label: lineLabel(l) })) }; }
    if (/^station/.test(w)) { const ss = S.stations.filter(s => p ? stationInScope(s, { kind: p.kind, id: p.node.id }) : stationInScope(s, sc)); return { kind: 'fact', html: `<b>${ss.length}</b> station${ss.length === 1 ? '' : 's'} in ${esc(name)}.`, hits: ss.map(s => ({ kind: 'station', id: s.id, label: s.name || s.reg })) }; }
    if (/^business/.test(w)) { const zs = S.businesses.filter(z => p ? bizInScope(z, { kind: p.kind, id: p.node.id }) : bizInScope(z, sc)); return { kind: 'fact', html: `<b>${zs.length}</b> business${zs.length === 1 ? '' : 'es'} on file for ${esc(name)} (${zs.filter(z => z.status === 'open').length} operating).`, hits: zs.map(z => ({ kind: 'business', id: z.id, label: bizLabel(z) })) }; }
    if (/^demolition/.test(w)) return { kind: 'fact', html: `<b>${rows.filter(isHist).length}</b> demolitions on record in ${esc(name)}; ${rows.filter(b => isHist(b) && b.yearDemolished == null).length} without a date.`, hits: rows.filter(isHist).map(bHit) };
    return { kind: 'fact', html: `<b>${rows.filter(b => b.landmark && isActive(b)).length}</b> landmarks in ${esc(name)}.`, hits: rows.filter(b => b.landmark && isActive(b)).map(bHit) };
  }
  if ((m = /^(?:add|connect|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?(.+?)(?:\s+line)?\??$/i.exec(tl))) {
    const s = S.stations.find(x => fuzzyScore(norm(m[1]), x.name) >= 0.7); const l = S.lines.find(x => Math.max(fuzzyScore(norm(m[2]), x.name), fuzzyScore(norm(m[2]), x.shortName)) >= 0.7);
    if (s && l) { if (l.stopIds.includes(s.id)) return { kind: 'fact', html: `${esc(s.name)} is already a stop on ${esc(lineLabel(l))}.` }; const d = stationDistanceToLine(s, l); return { kind: 'sugg', html: `Add <b>${esc(s.name)}</b> as the next stop of <b>${esc(lineLabel(l))}</b>?${d != null ? ` The station is ${Math.round(d)} blocks from the alignment${d > 30 ? ' — that is far; check the position' : ''}.` : ' The station has no coordinates yet.'}`, action: { type: 'add-stop', lineId: l.id, stationId: s.id, preview: s.x != null ? { points: [[s.x, s.z]] } : null }, hits: [{ kind: 'station', id: s.id, label: s.name }, { kind: 'line', id: l.id, label: lineLabel(l) }] }; }
  }
  if (/^(draw|create|make)\b/.test(tl)) { const mode = /border|boundary/.test(tl) ? 'border' : /road|street|avenue/.test(tl) ? 'road' : /line|track|rail|subway|metro/.test(tl) ? 'transit' : /station|stop/.test(tl) ? 'station' : /building/.test(tl) ? 'place' : null; if (mode) return { kind: 'sugg', html: `I do not invent geometry — a ${mode === 'place' ? 'building position' : mode} has to come from the world. I can switch the map to <b>${esc(MODES.find(x => x.id === mode)?.label || mode)}</b> mode so you can draw it.`, action: { type: 'mode', mode } }; }
  if ((m = /^(?:where is|find|locate|go to|show me)\s+(.+?)\??$/i.exec(tl))) { const groups = searchAll(m[1], { limit: 5 }); const items = flatItems(groups); if (items.length) { const top = items[0]; return { kind: 'fact', html: `Best match for “${esc(m[1])}”: <b>${esc(top.title)}</b> — ${esc(top.sub)}.${items.length > 1 ? ` ${items.length - 1} other match${items.length === 2 ? '' : 'es'} listed.` : ''}`, hits: items.map(h => ({ kind: h.kind === 'historical' ? 'building' : h.kind, id: h.id, label: h.title })), locate: top }; } return { kind: 'fact', html: `Nothing on file matches “${esc(m[1])}”.` }; }
  const groups = searchAll(t, { limit: 4 }); const items = flatItems(groups);
  return { kind: 'note', html: `I did not understand that as a question about the map. I can answer: construction / landmarks / demolished / for sale / vacant lots / tallest / oldest in a place · businesses on a street · which road serves a building · missing coordinates · undated records · how many … · show this area in Late 2018 · add a station to a line.${items.length ? ` Records matching your words are listed below.` : ''}`, hits: items.map(h => ({ kind: h.kind === 'historical' ? 'building' : h.kind, id: h.id, label: h.title })), unknown: true };
}
async function asstRun(q) {
  q = (q || '').trim(); if (!q) return; ASST.log.push({ role: 'me', text: q }); ASST.pending = null; MAPW.preview = null;
  let a = asstAnswer(q);
  if (a.unknown && S.settings.ai?.enabled) { ASST.log.push({ role: 'bot', kind: 'note', html: 'Asking the AI provider…' }); renderDock(); const ai = await asstAI(q); ASST.log.pop(); if (ai) a = ai; }
  const msg = { role: 'bot', kind: a.kind, html: a.html, hits: a.hits || [], action: a.action || null }; ASST.log.push(msg); if (ASST.log.length > 40) ASST.log.splice(0, ASST.log.length - 40);
  if (a.highlight?.length) MAPW.highlight = { ids: new Set(a.highlight), until: Date.now() + 60000 };
  if (a.sel) MAPW.sel = a.sel;
  if (a.fit?.length) { const ext = bboxOf(a.fit.map(p => [p.x, p.z])); if (ext) mapFit(ext); }
  if (a.locate) { openSearchHit(a.locate, { map: true }); MAPW.dock = 'assistant'; }
  if (a.action) { if (a.autoApply) { asstExecute(a.action); } else { ASST.pending = a.action; MAPW.preview = a.action.preview || null; } }
  renderDock(); mapDraw(); setTimeout(() => { const l = $('#asst-log'); if (l) l.scrollTop = l.scrollHeight; }, 20);
}
function asstExecute(action) {
  switch (action.type) {
    case 'set-road': { const b = byId(action.buildingId); const r = roadById(action.roadId); if (!b || !r) return toast('That record is gone', 'warn'); b.roadId = r.id; b.updated = now(); commit(); toast(`${b.reg} now served by ${roadLabel(r)}`, 'good', { label: 'UNDO', fn: () => { b.roadId = null; b.updated = now(); commit(); renderDock(); } }); break; }
    case 'add-stop': { const l = lineById(action.lineId); const s = stationById(action.stationId); if (!l || !s) return toast('That record is gone', 'warn'); mapPushUndo(); l.stopIds = [...l.stopIds, s.id]; l.updated = now(); commit(); toast(`${s.name} added to ${lineLabel(l)}`, 'good'); break; }
    case 'open-playback': { if (action.scope) setScope(action.scope); openHistoryViewer({ year: action.year, half: action.half }); break; }
    case 'mode': setMapMode(action.mode); break;
    case 'select': MAPW.sel = { kind: action.kind, id: action.id }; { const e = selExtent(MAPW.sel); if (e) mapFit(e); } break;
  }
}
function asstApply() { const a = ASST.pending; if (!a) return; ASST.pending = null; MAPW.preview = null; asstExecute(a); renderDock(); mapDraw(); }
function asstCancel() { ASST.pending = null; MAPW.preview = null; renderDock(); mapDraw(); }
/* optional provider: shared with Clawson (Anthropic or OpenAI-compatible); the key never leaves this browser */
async function asstAI(q) { return clawAI(q); }
