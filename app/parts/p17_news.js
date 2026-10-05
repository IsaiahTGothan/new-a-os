/* =====================================================================
   §17 NEWS — articles from the New A site as evidence: fetch (or import),
       dedupe, detect revisions, extract candidate changes, review them in an
       inbox with before/after, apply with a log and undo. Read-only towards
       the site: nothing is ever posted or modified there.
   ===================================================================== */
const NEWS = { busy: false, timer: null, filter: 'pending' };
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const htmlToText = html => { const d = document.createElement('div'); d.innerHTML = String(html || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
function newsPendingCount() { let n = 0; for (const it of S.news.items || []) for (const c of it.candidates || []) if (c.kind !== 'mention' && !S.news.decisions[c.id]) n++; return n; }
/* RSS 2.0 and Atom */
function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'); if (doc.querySelector('parsererror')) throw new Error('The file is not valid RSS or Atom XML');
  const get = (el, sels) => { for (const s of sels) { const n = [...el.children].find(c => c.localName === s || c.nodeName === s); if (n) return n.textContent || n.getAttribute?.('href') || ''; } return ''; };
  const items = [];
  for (const el of doc.querySelectorAll('item, entry')) {
    const title = htmlToText(get(el, ['title'])); const linkEl = [...el.children].find(c => c.localName === 'link'); const link = (linkEl?.getAttribute('href') || linkEl?.textContent || '').trim();
    const guid = get(el, ['guid', 'id']).trim() || link || hashStr(title); const published = get(el, ['pubDate', 'published', 'dc:date', 'updated']); const updated = get(el, ['updated']) || published;
    const content = htmlToText(get(el, ['content:encoded', 'encoded', 'content', 'description', 'summary'])); const excerpt = truncate(content, 320);
    const cats = [...el.children].filter(c => c.localName === 'category').map(c => (c.textContent || c.getAttribute('term') || '').trim()).filter(Boolean);
    const pub = published ? new Date(published) : null;
    items.push({ guid, link, title, published: pub && !isNaN(pub) ? pub.toISOString() : null, updated: updated || null, content, excerpt, categories: cats, hash: hashStr(title + '|' + content) });
  }
  return items;
}
async function newsRefresh({ source = 'live', text = null, label = '' } = {}) {
  if (NEWS.busy) return; NEWS.busy = true; const btn = $('#news-refresh'); if (btn) btn.disabled = true;
  try {
    let xml = text;
    if (source === 'live') { const res = await fetch(APP.feedUrl, { mode: 'cors', cache: 'no-store' }); if (!res.ok) throw new Error(`The feed answered HTTP ${res.status}`); xml = await res.text(); label = APP.feedUrl; }
    if (source === 'vault') { xml = await vaultReadFeed(); if (!xml) throw new Error('No feed.xml in the vault folder'); label = `${VAULT.name}/feed.xml`; }
    const items = parseFeed(xml); const res = mergeNewsItems(items, label);
    S.news.lastSync = now(); S.news.lastError = null; S.news.lastSource = label; commit(); renderStatus();
    toast(`News synced — ${res.added} new, ${res.revised} revised, ${res.unchanged} unchanged · ${res.candidates} proposed change${res.candidates === 1 ? '' : 's'}`, 'good');
    if (modalOpen() && $('#news-inbox')) openNewsInbox();
  } catch (e) {
    const cors = source === 'live' && (e instanceof TypeError || /fetch|network|CORS/i.test(e.message));
    S.news.lastError = { at: now(), message: cors ? 'The browser blocked reading the feed from this file (no CORS header, or offline).' : e.message, cors }; commit({ silentRender: true }); renderStatus();
    toast(S.news.lastError.message, 'warn', { label: 'OPTIONS', fn: openNewsInbox });
    if (modalOpen() && $('#news-inbox')) openNewsInbox();
  } finally { NEWS.busy = false; if (btn) btn.disabled = false; }
}
function mergeNewsItems(items, sourceLabel) {
  let added = 0, revised = 0, unchanged = 0, candidates = 0; const at = now();
  for (const it of items) {
    const key = it.guid || it.link; let cur = S.news.items.find(x => x.guid === key || (it.link && x.link === it.link));
    if (!cur) { cur = { ...it, guid: key, fetchedAt: at, source: sourceLabel, revisions: [], candidates: [] }; S.news.items.push(cur); added++; cur.candidates = extractCandidates(cur); candidates += cur.candidates.filter(c => c.kind !== 'mention').length; }
    else if (cur.hash !== it.hash) { cur.revisions = [...(cur.revisions || []), { at, hash: cur.hash, title: cur.title, updated: cur.updated }]; Object.assign(cur, { title: it.title, content: it.content, excerpt: it.excerpt, updated: it.updated, hash: it.hash, categories: it.categories, revisedAt: at }); revised++; const old = cur.candidates || []; cur.candidates = extractCandidates(cur).map(c => { const prev = old.find(o => o.id === c.id); return prev && S.news.decisions[prev.id] ? prev : c; }); candidates += cur.candidates.filter(c => c.kind !== 'mention' && !S.news.decisions[c.id]).length; }
    else unchanged++;
  }
  S.news.items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  autoApplyRules();
  return { added, revised, unchanged, candidates };
}
/* ---- candidate extraction: deterministic patterns around entity mentions ---- */
const monthIndex = s => { const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(s); return m ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) : -1; };
function eventDateIn(sentence, item) {
  const y = /\b(20\d\d)\b/.exec(sentence); const mi = monthIndex(sentence); const pub = item.published ? new Date(item.published) : null;
  const year = y ? +y[1] : pub ? pub.getFullYear() : null; const half = mi >= 0 ? (mi < 6 ? 'E' : 'L') : (!y && pub ? (pub.getMonth() < 6 ? 'E' : 'L') : '');
  return { year, half, fromText: !!y };
}
const RX = {
  completion: /\b(complet(?:ed|es|ion)|topped out|finish(?:ed|es)|now open|officially open(?:ed|s)?|open(?:ed|s) (?:its doors|to the public))\b/i,
  partial: /\b(topped out|exterior|fa[cç]ade|shell|structure (?:is )?complete)\b/i,
  start: /\b(broke ground|groundbreaking|construction (?:began|begins|started|starts|is under ?way|has begun)|under construction|work (?:began|begins|started|starts))\b/i,
  demolition: /\b(demolish(?:ed|es|ing)|torn down|tearing down|razed|collapsed|burn(?:ed|t) down|was destroyed)\b/i,
  landmark: /\b(landmark(?:ed)?|designated|heritage status|protected status)\b/i,
  sale: /\b(for sale|listed for|asking price|sold for|sold to|has been sold|leased to|purchased|acquired|changes hands)\b/i,
  bizOpen: /\b(opens?|opened|opening|launch(?:es|ed)?|debuts?|arrives)\b/i,
  bizClose: /\b(clos(?:es|ed|ing)|shut(?:s|ting)? down|shutters?|goes? out of business|bankrupt(?:cy)?)\b/i,
  transit: /\b(opens?|opened|service (?:begins|began|starts|started)|extension|extended|new station|new line|inaugurat)\b/i,
  jurisdiction: /\b(joins? the union|admitted to the union|statehood|annex(?:ed|es)?|becomes? (?:a )?state|secede)\b/i,
};
function entityIndex() {
  const ents = [];
  const add = (kind, rec, name) => { const n = String(name || '').trim(); if (n.length < 4 || /^\d+$/.test(n)) return; ents.push({ kind, rec, name: n, rx: new RegExp('(?<![\\w-])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'i') }); };
  for (const b of S.buildings) { add('building', b, b.name); if (b.number && b.street) add('building', b, `${b.number} ${b.street}`); }
  for (const z of S.businesses) { add('business', z, z.name); for (const a of z.aliases || []) add('business', z, a); }
  for (const l of S.lines) { add('line', l, l.name); }
  for (const s of S.stations) add('station', s, s.name);
  for (const r of S.regions) if (r.id !== 'union') add('region', r, r.name);
  for (const d of S.districts) add('district', d, d.name);
  return ents.sort((a, b) => b.name.length - a.name.length);
}
function extractCandidates(item) {
  const text = `${item.title}. ${item.content || ''}`.replace(/\s+/g, ' '); const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/);
  const ents = entityIndex(); const out = []; const seen = new Set();
  const push = c => { c.id = hashStr(`${item.guid}|${c.kind}|${c.entityKind}|${c.entityId}|${c.field || ''}`); if (seen.has(c.id)) return; seen.add(c.id); out.push(c); };
  for (const sent of sentences) {
    const hits = ents.filter(e => e.rx.test(sent)); if (!hits.length) continue;
    const dt = eventDateIn(sent, item);
    for (const e of hits) {
      const base = { entityKind: e.kind, entityId: e.rec.id, label: e.kind === 'building' ? `${e.rec.reg} · ${titleOf(e.rec)}` : (e.rec.name || e.rec.reg), excerpt: truncate(sent, 260), eventYear: dt.year, eventHalf: dt.half, dateFromText: dt.fromText, itemGuid: item.guid, link: item.link, title: item.title, published: item.published };
      if (e.kind === 'building') {
        const b = e.rec;
        if (RX.demolition.test(sent)) push({ ...base, kind: 'demolition', field: 'physical', before: { physical: b.physical, yearDemolished: b.yearDemolished, halfDemolished: b.halfDemolished }, after: { physical: 'demolished', yearDemolished: dt.year, halfDemolished: dt.half } });
        else if (RX.start.test(sent) && !RX.completion.test(sent)) push({ ...base, kind: 'start', field: 'yearStarted', before: { physical: b.physical, yearStarted: b.yearStarted, halfStarted: b.halfStarted }, after: { physical: isUnderWay(b) || b.physical === 'planned' ? 'construction' : b.physical, yearStarted: dt.year, halfStarted: dt.half } });
        else if (RX.completion.test(sent)) { const partial = RX.partial.test(sent); push({ ...base, kind: partial ? 'partial' : 'completion', field: 'yearBuilt', before: { physical: b.physical, yearBuilt: b.yearBuilt, halfBuilt: b.halfBuilt }, after: partial ? { notes: `${b.notes ? b.notes + '\n' : ''}${dt.year || ''} ${dt.half ? halfLabel(dt.half) : ''}: exterior / structure reported complete (${item.title})`.trim() } : { physical: isHist(b) ? b.physical : 'standing', yearBuilt: dt.year, halfBuilt: dt.half }, note: partial ? 'An exterior or structure being complete does not prove the building is open — proposed as a note, not a completion.' : null }); }
        else if (RX.landmark.test(sent)) push({ ...base, kind: 'landmark', field: 'landmark', before: { landmark: b.landmark }, after: { landmark: true } });
        else if (RX.sale.test(sent)) { const price = /\$\s?([\d,.]+)\s*(million|m|billion|b|k)?/i.exec(sent); let amount = null; if (price) { amount = parseFloat(price[1].replace(/,/g, '')); const u = (price[2] || '').toLowerCase(); if (u.startsWith('m')) amount *= 1e6; else if (u.startsWith('b')) amount *= 1e9; else if (u === 'k') amount *= 1e3; } const sold = /\b(sold|purchased|acquired|changes hands)\b/i.test(sent); push({ ...base, kind: 'listing', field: 'market', before: { market: b.market, listPrice: b.listPrice }, after: sold ? { market: 'sold', transactions: [...(b.transactions || []), { id: uid('ls'), kind: 'sale', price: amount, currency: 'USD', year: dt.year, half: dt.half, party: '', note: `from news: ${item.title}`, added: now() }] } : { market: /lease/i.test(sent) ? 'for-lease' : 'for-sale', listPrice: amount ?? b.listPrice }, note: amount == null ? 'No price found in the text — only the status is proposed.' : null }); }
        else push({ ...base, kind: 'mention' });
      } else if (e.kind === 'business') {
        const z = e.rec;
        if (RX.bizClose.test(sent)) push({ ...base, kind: 'biz-close', field: 'status', before: { status: z.status, yearClosed: z.yearClosed, halfClosed: z.halfClosed }, after: { status: 'closed', yearClosed: dt.year, halfClosed: dt.half } });
        else if (RX.bizOpen.test(sent) && (z.status !== 'open' || z.yearOpened == null)) push({ ...base, kind: 'biz-open', field: 'status', before: { status: z.status, yearOpened: z.yearOpened, halfOpened: z.halfOpened }, after: { status: 'open', yearOpened: z.yearOpened ?? dt.year, halfOpened: z.yearOpened != null ? z.halfOpened : dt.half } });
        else push({ ...base, kind: 'mention' });
      } else if (e.kind === 'line' || e.kind === 'station') {
        const o = e.rec;
        if (RX.transit.test(sent) && o.status !== 'open') push({ ...base, kind: 'transit', field: 'status', before: { status: o.status, yearOpened: o.yearOpened, halfOpened: o.halfOpened }, after: { status: 'open', yearOpened: o.yearOpened ?? dt.year, halfOpened: o.yearOpened != null ? o.halfOpened : dt.half } });
        else push({ ...base, kind: 'mention' });
      } else if (e.kind === 'region') {
        const r = e.rec;
        if (RX.jurisdiction.test(sent)) push({ ...base, kind: 'jurisdiction', field: 'effectiveYear', before: { effectiveYear: r.effectiveYear, effectiveHalf: r.effectiveHalf, placement: r.placement }, after: { effectiveYear: r.effectiveYear ?? dt.year, effectiveHalf: r.effectiveYear != null ? r.effectiveHalf : dt.half, placement: r.placement === 'unverified' ? 'source' : r.placement, source: item.title, sourceUrl: item.link }, note: 'A jurisdiction announcement is recorded as source and effective date; the hierarchy itself is never changed automatically.' });
        else push({ ...base, kind: 'mention' });
      } else push({ ...base, kind: 'mention' });
    }
  }
  for (const c of out) if (c.kind !== 'mention') c.conflict = candidateConflict(c);
  return out;
}
function candidateEntity(c) { return c.entityKind === 'building' ? byId(c.entityId) : c.entityKind === 'business' ? bizById(c.entityId) : c.entityKind === 'line' ? lineById(c.entityId) : c.entityKind === 'station' ? stationById(c.entityId) : c.entityKind === 'region' ? regionById(c.entityId) : districtById(c.entityId); }
function candidateConflict(c) {
  const rec = candidateEntity(c); if (!rec) return 'The record no longer exists.';
  const same = Object.entries(c.after || {}).every(([k, v]) => k === 'notes' || k === 'transactions' ? false : JSON.stringify(rec[k] ?? null) === JSON.stringify(v ?? null));
  if (same) return 'already';
  if (rec.verified) return 'The record is marked verified — a news report does not override verified data.';
  if (c.published && rec.updated && new Date(rec.updated) > new Date(c.published)) { const changed = Object.keys(c.after || {}).some(k => JSON.stringify(rec[k] ?? null) !== JSON.stringify((c.before || {})[k] ?? null)); if (changed) return `The record was edited after this article was published (${fmtDay(rec.updated)}) — review before applying.`; }
  if (c.entityKind === 'building' && c.kind === 'completion' && isHist(rec)) return 'The building is recorded as demolished — a completion report conflicts with the record.';
  return null;
}
function applyCandidate(c, { auto = false } = {}) {
  const rec = candidateEntity(c); if (!rec) { toast('Record not found', 'warn'); return false; }
  const before = {}; for (const k of Object.keys(c.after || {})) before[k] = JSON.parse(JSON.stringify(rec[k] ?? null));
  for (const [k, v] of Object.entries(c.after || {})) rec[k] = JSON.parse(JSON.stringify(v));
  if (c.entityKind === 'building') rec.status = summaryStatus(rec);
  rec.updated = now(); if (c.entityKind === 'building' && !rec.source) { rec.source = c.link || c.title; rec.sourceType = rec.sourceType || 'document'; }
  const log = { id: uid('nl'), at: now(), candId: c.id, kind: c.kind, entityKind: c.entityKind, entityId: c.entityId, label: c.label, before, after: c.after, source: { guid: c.itemGuid, link: c.link, title: c.title, published: c.published }, auto };
  S.news.log.unshift(log); S.news.decisions[c.id] = { status: 'applied', at: now(), logId: log.id, auto }; commit(); return true;
}
function undoLog(logId) {
  const log = S.news.log.find(l => l.id === logId); if (!log || log.undone) return;
  const rec = candidateEntity({ entityKind: log.entityKind, entityId: log.entityId }); if (!rec) { toast('Record not found', 'warn'); return; }
  const stillApplied = Object.entries(log.after || {}).every(([k, v]) => JSON.stringify(rec[k] ?? null) === JSON.stringify(v ?? null));
  if (!stillApplied) { toast('The record changed since this was applied — not undone, review it by hand', 'warn'); return; }
  for (const [k, v] of Object.entries(log.before || {})) rec[k] = JSON.parse(JSON.stringify(v));
  if (log.entityKind === 'building') rec.status = summaryStatus(rec); rec.updated = now();
  log.undone = now(); S.news.decisions[log.candId] = { status: 'undone', at: now(), logId }; commit(); toast('Change undone — the source stays in the log', 'good');
}
function autoApplyRules() {
  const rules = S.news.rules || {}; const kinds = []; if (rules.landmark) kinds.push('landmark'); if (rules.listing) kinds.push('listing'); if (rules.groundbreaking) kinds.push('start');
  if (!kinds.length) return 0; let n = 0;
  for (const it of S.news.items) for (const c of it.candidates || []) if (kinds.includes(c.kind) && !S.news.decisions[c.id] && !c.conflict && c.dateFromText) { if (applyCandidate(c, { auto: true })) n++; }
  if (n) toast(`${n} clearly sourced change${n === 1 ? '' : 's'} applied by your rules — see the log`, 'good'); return n;
}
function newsAutoRefresh() {
  clearInterval(NEWS.timer); const min = +S.settings.newsRefreshMin || 0; if (!min) return;
  NEWS.timer = setInterval(() => { if (document.visibilityState === 'visible') newsRefresh({ source: 'live' }); }, min * 60000);
}
/* ---- inbox ---- */
function openNewsInbox() {
  const items = S.news.items.slice().sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  const pending = newsPendingCount(); const err = S.news.lastError;
  const candHTML = (c, it) => {
    const dec = S.news.decisions[c.id]; const rec = candidateEntity(c); const conflict = c.conflict && c.conflict !== 'already' ? c.conflict : null; const already = c.conflict === 'already';
    const kindLabel = { completion: 'COMPLETION', partial: 'PARTIAL · NOTE', start: 'CONSTRUCTION START', demolition: 'DEMOLITION', landmark: 'LANDMARK', listing: 'LISTING / SALE', 'biz-open': 'BUSINESS OPENS', 'biz-close': 'BUSINESS CLOSES', transit: 'TRANSIT OPENING', jurisdiction: 'JURISDICTION', mention: 'MENTION' }[c.kind] || c.kind.toUpperCase();
    const diff = Object.entries(c.after || {}).filter(([k]) => k !== 'transactions').map(([k, v]) => `<span><span class="muted">${esc(k)}</span> <span class="before">${esc(String((c.before || {})[k] ?? '—'))}</span><span class="arr">→</span><span class="after">${esc(String(v ?? '—'))}</span></span>`).join('');
    const openAttr = c.entityKind === 'building' ? `data-open="${c.entityId}"` : ['business', 'line', 'station'].includes(c.entityKind) ? `data-open="${c.entityKind}:${c.entityId}"` : '';
    return `<div class="cand"><div><div class="ct"><span class="kind ${dec?.status === 'applied' ? 'applied' : dec?.status === 'rejected' || dec?.status === 'undone' ? 'rejected' : conflict ? 'conflict' : c.kind === 'mention' ? 'mention' : ''}">${kindLabel}</span><b ${openAttr} style="${openAttr ? 'cursor:pointer' : ''}">${esc(c.label)}</b>${!rec ? '<span class="mk bad">RECORD GONE</span>' : ''}${c.eventYear ? `<span class="mk">${esc(hyLabel(c.eventYear, c.eventHalf))}${c.dateFromText ? '' : ' · from publication date'}</span>` : ''}</div>${c.kind !== 'mention' ? `<div class="diff">${diff}</div>` : ''}<div class="ev"><q>${esc(c.excerpt)}</q></div>${c.note ? `<div class="why">${esc(c.note)}</div>` : ''}${conflict ? `<div class="why">⚠ ${esc(conflict)}</div>` : ''}${already ? `<div class="why" style="color:var(--ink-3)">Already matches the record — nothing to apply.</div>` : ''}</div>
      <div class="acts">${c.kind === 'mention' ? '<span class="done">no change proposed</span>' : dec?.status === 'applied' ? `<span class="done">applied ${fmtDay(dec.at)}${dec.auto ? ' · by rule' : ''}</span><button class="btn sm" data-act="news-undo" data-log="${dec.logId}">${icon('undo')} Undo</button>` : dec?.status === 'rejected' ? `<span class="done">rejected</span><button class="btn sm ghost" data-act="news-reopen" data-cand="${c.id}">Reopen</button>` : dec?.status === 'undone' ? `<span class="done">undone</span><button class="btn sm ghost" data-act="news-reopen" data-cand="${c.id}">Reopen</button>` : already ? `<button class="btn sm ghost" data-act="news-reject" data-cand="${c.id}">Dismiss</button>` : `<button class="btn sm primary" data-act="news-apply" data-cand="${c.id}" ${rec ? '' : 'disabled'}>${icon('check')} Apply</button><button class="btn sm ghost" data-act="news-reject" data-cand="${c.id}">Reject</button>`}</div></div>`;
  };
  const shown = items.filter(it => NEWS.filter === 'all' || (it.candidates || []).some(c => c.kind !== 'mention' && !S.news.decisions[c.id]));
  openModal({ title: 'Updates inbox', kicker: `NEWS · ${pending} PENDING`, cls: 'wide',
    body: `<div id="news-inbox">
      <div class="news-src"><span>source <b>${esc(APP.feedUrl)}</b></span><span>·</span><span>${S.news.lastSync ? `last sync <b>${fmtDate(S.news.lastSync)}</b>${S.news.lastSource ? ` from ${esc(S.news.lastSource)}` : ''}` : 'never synced'}</span><span>·</span><span>${S.news.items.length} articles · ${S.news.log.length} applied changes</span>${err ? `<span class="err">· ${esc(err.message)}</span>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><button class="btn primary" id="news-refresh" data-act="news-refresh">${icon('news')} Refresh news</button><button class="btn" data-act="news-import">${icon('up')} Import feed file…</button>${VAULT.status === 'granted' ? `<button class="btn" data-act="news-vault">${icon('folder')} Read feed.xml from vault</button>` : ''}<label class="field" style="height:32px"><span>While open</span><select data-set-news="newsRefreshMin"><option value="0" ${!+S.settings.newsRefreshMin ? 'selected' : ''}>manual only</option>${[5, 15, 60].map(m => `<option value="${m}" ${+S.settings.newsRefreshMin === m ? 'selected' : ''}>every ${m} min</option>`).join('')}</select></label><a class="btn ghost" href="${esc(APP.newsSite)}" target="_blank" rel="noopener">${icon('globe')} Open the site</a><span class="spacer"></span><div class="seg" style="height:30px"><button data-newsf="pending" aria-pressed="${NEWS.filter === 'pending'}">Pending</button><button data-newsf="all" aria-pressed="${NEWS.filter === 'all'}">All articles</button><button data-newsf="log" aria-pressed="${NEWS.filter === 'log'}">Log</button></div></div>
      ${err?.cors ? `<div class="callout" style="margin-top:12px"><b>Why the live refresh failed.</b> A page opened from a file can only read a website when that site allows it (a CORS header). The site's <code>/feed.xml</code> did not allow it, or you are offline. A standalone HTML file also cannot sync in the background — refresh only works while this app is open. Options: <b>Import feed file</b> (download <code>feed.xml</code> from the site and pick it), drop <code>feed.xml</code> into the vault folder and <b>Read from vault</b>, or add <code>Access-Control-Allow-Origin: *</code> to <code>/feed.xml</code> on the site (one line in <code>vercel.json</code> or <code>next.config.js</code> headers) and live refresh will work from here. Nothing is ever posted to the site from this app.</div>` : ''}
      <div class="callout info" style="margin-top:12px"><b>How proposals are made.</b> Each article is matched to records by name or alias; sentences mentioning a record are checked for plain-language patterns (completed, broke ground, demolished, landmark, sold, opens, closes, joins the Union). Every proposal shows the exact sentence, the before/after values and any conflict: verified records, records edited after publication, and completion reports about demolished buildings are flagged, never applied silently. “Topped out” or “exterior complete” becomes a note, not a completion. The site also reads this registry and runs a simulated market, so its own restatements of your data are never treated as confirmation, and share-price chatter never becomes revenue or a physical change.</div>
      <div class="settings-row" style="margin-top:6px"><div><div>Rules — apply automatically when clearly sourced and unambiguous</div><div class="d">Only proposals with a date in the text, a unique match and no conflict. Everything is logged and reversible.</div></div><div style="display:flex;gap:14px"><label class="switch" style="font-size:12px"><input type="checkbox" data-set-rule="landmark" ${S.news.rules.landmark ? 'checked' : ''}> landmark</label><label class="switch" style="font-size:12px"><input type="checkbox" data-set-rule="listing" ${S.news.rules.listing ? 'checked' : ''}> listing / sale</label><label class="switch" style="font-size:12px"><input type="checkbox" data-set-rule="groundbreaking" ${S.news.rules.groundbreaking ? 'checked' : ''}> groundbreaking</label></div></div>
      ${NEWS.filter === 'log' ? `<div class="list newslog" style="margin-top:12px">${S.news.log.length ? S.news.log.map(l => `<div class="li"><div><div class="t">${esc(l.label)} — ${esc(l.kind)}${l.undone ? ' <span class="mk">UNDONE</span>' : ''}${l.auto ? ' <span class="mk warn">BY RULE</span>' : ''}</div><div class="s">${fmtDate(l.at)} · ${Object.entries(l.after || {}).filter(([k]) => k !== 'transactions').map(([k, v]) => `${k}: ${esc(String((l.before || {})[k] ?? '—'))} → ${esc(String(v ?? '—'))}`).join(' · ')} · <a href="${esc(l.source?.link || '#')}" target="_blank" rel="noopener">${esc(truncate(l.source?.title || 'source', 50))}</a></div></div><div class="acts">${l.undone ? '' : `<button class="btn sm" data-act="news-undo" data-log="${l.id}">${icon('undo')} Undo</button>`}</div></div>`).join('') : `<div class="li empty">No changes applied from news yet.</div>`}</div>`
      : `<div class="news-list">${shown.length ? shown.map(it => `<div class="news-item"><div class="nh"><div><div class="t"><a href="${esc(it.link || '#')}" target="_blank" rel="noopener">${esc(it.title)}</a></div><div class="s"><span>${it.published ? fmtDay(it.published) : 'undated'}</span>${it.revisions?.length ? `<span class="rev">revised ${it.revisions.length}× · latest ${fmtDay(it.revisedAt)}</span>` : ''}<span>fetched ${fmtDay(it.fetchedAt)}</span>${(it.categories || []).length ? `<span>${it.categories.map(esc).join(' · ')}</span>` : ''}<span>${(it.candidates || []).filter(c => c.kind !== 'mention').length} proposal${(it.candidates || []).filter(c => c.kind !== 'mention').length === 1 ? '' : 's'}</span></div></div></div><div class="ex clamp">${esc(it.excerpt || '')}</div>${(it.candidates || []).length ? `<div class="cands">${it.candidates.slice().sort((a, b) => (a.kind === 'mention') - (b.kind === 'mention')).filter(c => NEWS.filter === 'all' || (c.kind !== 'mention' && !S.news.decisions[c.id])).map(c => candHTML(c, it)).join('')}</div>` : `<div class="cands"><div class="cand"><div class="ct muted" style="font-size:12px">No registered building, business, line, station or place is mentioned by name.</div></div></div>`}</div>`).join('') : `<div class="chart-empty" style="padding:30px">${S.news.items.length ? 'Nothing pending — every proposal has been reviewed.' : 'No articles yet. Refresh, or import a feed file.'}</div>`}</div>`}
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>`,
    onOpen: m => {
      m.querySelector('[data-set-news]')?.addEventListener('change', e => { S.settings.newsRefreshMin = +e.target.value; commit({ silentRender: true }); newsAutoRefresh(); });
      m.querySelectorAll('[data-set-rule]').forEach(cb => cb.addEventListener('change', () => { S.news.rules[cb.dataset.setRule] = cb.checked; commit({ silentRender: true }); if (cb.checked) { const n = autoApplyRules(); if (n) openNewsInbox(); } }));
      m.querySelectorAll('[data-newsf]').forEach(b => b.onclick = () => { NEWS.filter = b.dataset.newsf; openNewsInbox(); });
    } });
}
$('#file-feed').addEventListener('change', async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const text = await f.text(); newsRefresh({ source: 'file', text, label: f.name }); });
