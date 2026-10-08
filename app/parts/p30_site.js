/* =====================================================================
   §30 SITE LINK — New A OS runs the public site (the City Hall link).
       Connection (site address + access key, kept in this browser only) ·
       publish the registry (by hand, or automatically while the app is
       open) with what changed · photos and the basemap · the site's feed
       read back (news inbox, dashboard) · the manager: stories, the city
       alert, approval ratings, the market review queue, official posts.
       Everything goes through the site's own validated endpoints. The key
       is only ever sent to the configured site — never through the OS
       bridge, never into S, Registry.json, exports, backups or the vault.
   ===================================================================== */
const SL_DEFAULT_URL = 'https://newa-site.vercel.app';
const SL_CFG = 'newa-os.site', SL_KEYS = 'newa-os.site.keys';
const SL_AUTO_DELAY = 45e3, SL_POLL_MS = 60e3, SL_PHOTO_MAX = 880000, SL_PHOTO_BATCH = 4;
const SL_OUTLETS = [
  { id: 'press-office', name: 'Press Office', short: 'CITY HALL', color: '#0B1F3A', accent: '#E7C36A' },
  { id: 'pix11-li', name: 'PIX 11 Long Island', short: 'PIX 11', color: '#E4002B', accent: '#FFFFFF' },
  { id: 'new-a-1', name: 'New A 1', short: 'NA1', color: '#1E64FF', accent: '#FFFFFF' },
  { id: 'cnn', name: 'CNN', short: 'CNN', color: '#CC0000', accent: '#FFFFFF' },
  { id: 'fox-news', name: 'FOX News', short: 'FOX', color: '#003366', accent: '#E4B429' },
];
const SL_OUTLET = Object.fromEntries(SL_OUTLETS.map(o => [o.id, o]));
const SL_PARTY = { D: { name: 'Democratic', c: 'var(--sl-d)' }, R: { name: 'Republican', c: 'var(--sl-r)' }, I: { name: 'Independent', c: 'var(--sl-i)' } };
const SL_ALERTS = [['normal', 'Normal', 'good'], ['advisory', 'Advisory', 'info'], ['warning', 'Warning', 'warn'], ['emergency', 'Emergency', 'bad']];
const SL_CATEGORIES = ['City Hall', 'Politics', 'Real estate', 'Markets', 'Transit', 'Culture', 'Alerts', 'Tourism', 'Public Square', 'Server'];
const SL_REAL_IDS = new Set(['president', 'governor', 'mayor', 'former-mayor', 'blakeman']);   // real public figures: parody villagers on the site
const SL_SEGS = [['dashboard', 'Dashboard', 'globe'], ['publish', 'Publish', 'up'], ['newsroom', 'Newsroom', 'news'], ['cityhall', 'City Hall', 'civic'], ['market', 'Market', 'biz']];
const SL_COLLS = [['buildings', 'building', 'buildings'], ['roads', 'road', 'roads'], ['districts', 'district', 'districts'], ['regions', 'region', 'regions'], ['neighborhoods', 'neighborhood', 'neighborhoods'], ['archive', 'chronicle entry', 'chronicle entries'], ['businesses', 'business', 'businesses'], ['tenancies', 'tenancy', 'tenancies'], ['officials', 'official', 'officials'], ['lines', 'transit line', 'transit lines'], ['stations', 'station', 'stations'], ['tracks', 'track', 'tracks'], ['projects', 'project', 'projects']];
const SL_STORY_BLANK = () => ({ outlet: 'press-office', category: 'City Hall', place: '', byline: '', title: '', dek: '', body: '', tags: '', breaking: false, impacts: [], approvals: [] });

const SITE = {
  conn: { state: 'unset', message: '', at: 0, info: null, base: '' },
  agent: null, testing: null, editing: false, showKey: false,
  feed: null, feedBase: '', feedEtag: null, feedAt: 0, feedError: null, feedLoading: null,
  politics: null, politicsBase: '', politicsError: null,
  review: null, reviewError: null, photos: null, photosError: null, log: null, logError: null,
  localPhotos: null, publishing: false, busy: new Set(), mem: {}, storage: true,
  auto: { timer: null, due: 0, check: null, seenFp: null, failures: 0, retryAt: 0, held: null, error: null, ticker: null },
  local: null, poll: null, entered: false, seg: null, apprFilter: 'featured', apprQ: '',
  form: { story: null, alert: { level: 'advisory', text: '', hours: 12 }, post: { leaderId: 'mayor', text: '' } },
};
class SiteError extends Error { constructor(message, kind = 'error', extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); } }

/* ---- storage: this browser only (localStorage, with an in-memory fallback when it is blocked) ---- */
function slRead(k, d) {
  let raw = null;
  try { raw = localStorage.getItem(k); } catch { SITE.storage = false; return SITE.mem[k] ?? d; }
  if (raw == null) return SITE.mem[k] ?? d;
  try { return JSON.parse(raw); } catch { return d; }
}
function slWrite(k, v) { SITE.mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch { SITE.storage = false; } }
function slCfg() { const c = slRead(SL_CFG, {}); return { url: '', auto: false, seg: 'dashboard', pub: {}, draft: null, ...(c && typeof c === 'object' && !Array.isArray(c) ? c : {}) }; }
function slSetCfg(patch) { const c = { ...slCfg(), ...patch }; slWrite(SL_CFG, c); return c; }
function slKeys() { const k = slRead(SL_KEYS, {}); return k && typeof k === 'object' && !Array.isArray(k) ? k : {}; }
const slKey = (base = slBase()) => (base && typeof slKeys()[base] === 'string' ? slKeys()[base] : '');
function slSetKey(base, key) { const k = slKeys(); if (key) k[base] = key; else delete k[base]; slWrite(SL_KEYS, k); }
const slLast = (base = slBase()) => (base && slCfg().pub?.[base]) || null;
function slSetLast(base, rec) { const c = slCfg(); slSetCfg({ pub: { ...(c.pub || {}), [base]: rec } }); }

/* ---- addresses ---- */
function slNormalizeUrl(input) {
  let s = String(input || '').trim(); if (!s) return { url: '' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(s) ? 'http://' : 'https://') + s;
  let u; try { u = new URL(s); } catch { return { error: 'That is not a web address — try https://newa-site.vercel.app' }; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname) || /\.localhost$/i.test(u.hostname);
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Only https:// addresses (or http://localhost) can be linked' };
  if (u.protocol === 'http:' && !local) return { error: 'Use https:// — the access key must never travel unencrypted. Plain http:// is only for http://localhost.' };
  if (u.username || u.password) return { error: 'Leave the user name and password out of the address' };
  return { url: u.origin };
}
const slBase = () => slNormalizeUrl(slCfg().url).url || '';
const slReadBase = () => slBase() || SL_DEFAULT_URL;           // open reads (news, markets) work before the site is linked
const slHost = (base = slBase()) => { try { return new URL(base).host; } catch { return ''; } };
/* the news inbox and markets sync follow the linked site */
function slApplyUrls() { const b = slReadBase(); APP.newsSite = b; APP.feedUrl = b + '/feed.xml'; APP.marketsUrl = b + '/api/markets'; }
function slMarketsUrl() { const custom = String(S?.settings?.marketsUrl || '').trim(); return custom && custom !== SL_DEFAULT_URL + '/api/markets' ? custom : slReadBase() + '/api/markets'; }

/* ---- formatting (12-hour, this computer's clock — the same clock as the status bar) ---- */
const slTime = ts => { const d = new Date(ts); return ts == null || isNaN(d) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const slDay = ts => { const d = new Date(ts); return ts == null || isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const slWhen = ts => { const d = new Date(ts); if (isNaN(d)) return '—'; const same = slDay(ts) === slDay(Date.now()); return same ? slTime(ts) : `${slDay(ts)}, ${slTime(ts)}`; };
function slAgo(ts) { const t = typeof ts === 'number' ? ts : Date.parse(ts); if (!Number.isFinite(t)) return '—'; const s = Math.round((Date.now() - t) / 1000); if (s < 45) return 'just now'; if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; }
const slClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const slPct = (v, d = 2) => v == null || !Number.isFinite(+v) ? '—' : `${+v > 0 ? '+' : +v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}%`;
const slDir = v => +v > 0 ? 'sl-up' : +v < 0 ? 'sl-down' : 'sl-flat';
const slBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const slShort = h => h ? String(h).slice(0, 7) : '—';
const slSafeUrl = u => { try { const x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const slOutletChip = id => { const o = SL_OUTLET[id] || SL_OUTLET['press-office']; return `<span class="sl-outlet" style="--oc:${o.color};--oa:${o.accent}" title="${esc(o.name)}">${esc(o.short)}</span>`; };
const slPartyChip = p => { const P = SL_PARTY[p] || SL_PARTY.I; return `<span class="sl-party" style="--pc:${P.c}" title="${esc(P.name)}">${esc(p || 'I')}</span>`; };
const slParody = o => (o && (o.parody ?? o.real ?? SL_REAL_IDS.has(o.id))) ? '<span class="sl-parody" title="A real public figure, played on the site by a parody villager">PARODY</span>' : '';

/* ---- requests: the access key goes only to the configured site ---- */
async function slFetch(path, { method = 'GET', body = null, auth = false, etag = null, timeout = 20000, signal = null, contentType = null, base = null } = {}) {
  const target = auth ? slBase() : (base || slBase() || SL_DEFAULT_URL);
  if (!target) throw new SiteError('Add the site address first', 'config');
  const host = slHost(target) || target; const url = target + path;
  const headers = {};
  if (auth) { const key = slKey(target); if (!key) throw new SiteError('Add the access key first', 'nokey'); headers.Authorization = 'Bearer ' + key; }
  if (body != null) headers['Content-Type'] = contentType || 'application/json';
  if (etag) headers['If-None-Match'] = etag;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort(); signal?.addEventListener('abort', onAbort, { once: true });
  let res = null, via = 'direct';
  try { res = await fetch(url, { method, headers, body, mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal }); }
  catch (e) {
    if (signal?.aborted) throw new SiteError('Cancelled', 'cancel');
    if (ctl.signal.aborted) throw new SiteError(`${host} did not answer within ${Math.round(timeout / 1000)} s`, 'timeout');
    // open reads may go through the local New A OS bridge (no CORS there); requests that carry the key never do
    if (!auth && method === 'GET' && typeof OS !== 'undefined' && OS.online) { try { res = await OS.proxyFetch(url, { headers: etag ? { 'If-None-Match': etag } : {} }); via = 'bridge'; } catch { res = null; } }
    if (!res) throw new SiteError(navigator.onLine === false ? 'This computer is offline' : `The browser could not reach ${host} — wrong address, the site is down, or it does not allow this page to read it (CORS)`, 'network');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  const text = res.status === 304 ? '' : await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const h = k => { try { return res.headers.get(k); } catch { return null; } };
  return { ok: res.ok, status: res.status, data, text, etag: h('etag'), retryAfter: +(h('retry-after') || 0) || 0, via };
}
async function slJSON(path, opts = {}) {
  const r = await slFetch(path, opts);
  if (r.status === 304 || r.ok) return r;
  const raw = r.data?.error || r.data?.message || (r.text && r.text.length < 240 && !/^\s*</.test(r.text) ? r.text.trim() : '');
  const kind = r.status === 401 ? 'auth' : r.status === 404 ? 'notfound' : r.status === 409 ? 'held' : r.status === 413 ? 'toolarge' : r.status === 422 ? 'invalid' : r.status === 429 ? 'rate' : r.status >= 500 ? 'server' : 'error';
  throw new SiteError(raw || `The site answered HTTP ${r.status}`, kind, { status: r.status, data: r.data, retryAfter: r.retryAfter });
}
/* the manager: POST /api/agent { action, … } with the key */
async function slAction(action, data = {}) {
  try { return (await slJSON('/api/agent', { method: 'POST', auth: true, body: JSON.stringify({ ...data, action }) })).data || {}; }
  catch (e) {
    if (e.status === 400 && /unknown action/i.test(e.message)) throw new SiteError(`This site does not offer “${action}” yet — it arrives with the next site update. Nothing was changed.`, 'unsupported', { status: 400 });
    if (e.kind === 'auth') slSetConn(/AGENT_TOKEN|DESK_PASSCODE/i.test(e.message) && !/Bearer token required/i.test(e.message) ? 'off' : 'badkey', e.message);
    throw e;
  }
}
/* does the linked site offer a feature action? null = not known yet (try it) */
const slHas = action => Array.isArray(SITE.agent?.featureActions) ? SITE.agent.featureActions.includes(action) : null;
const slCanWrite = () => SITE.conn.state === 'ok' && !!slKey();

/* ---- connection ---- */
const SL_STATES = {
  unset: ['NOT LINKED', 'muted', 'not linked'], checking: ['CHECKING', 'info', 'checking…'], ok: ['CONNECTED', 'good', 'connected'],
  readonly: ['NO KEY · READ ONLY', 'warn', 'read only'], badkey: ['WRONG KEY', 'bad', 'wrong key'], off: ['LINK OFF ON THE SITE', 'bad', 'link off on the site'],
  unreachable: ['CAN’T REACH THE SITE', 'bad', 'unreachable'], notfound: ['NO REGISTRY LINK HERE', 'bad', 'no registry link'], timeout: ['NO ANSWER', 'warn', 'no answer'], error: ['SITE ERROR', 'bad', 'error'],
};
function slSetConn(state, message = '', info) { SITE.conn = { ...SITE.conn, state, message: message || '', at: Date.now(), info: info === undefined ? SITE.conn.info : info, base: slBase() }; slStatusBar(); return SITE.conn; }
function slResetSite() {
  Object.assign(SITE, { agent: null, feed: null, feedBase: '', feedEtag: null, feedAt: 0, feedError: null, politics: null, politicsBase: '', politicsError: null, review: null, reviewError: null, photos: null, photosError: null, log: null, logError: null });
  SITE.conn = { state: slBase() ? 'checking' : 'unset', message: '', at: 0, info: null, base: slBase() };
  SITE.auto.held = null; SITE.auto.failures = 0; SITE.auto.retryAt = 0; SITE.auto.error = null; slAutoCancel();
}
async function slTest({ quiet = true } = {}) {
  const base = slBase(); if (!base) { slSetConn('unset', '', null); slPaint(); return SITE.conn; }
  if (SITE.testing) return SITE.testing;
  SITE.conn = { ...SITE.conn, state: 'checking', base }; slPaint(['head', 'conn']); slStatusBar();
  SITE.testing = (async () => {
    const key = slKey(base);
    try {
      const r = await slFetch('/api/registry', { auth: !!key, timeout: 15000 });
      if (r.status === 404 || (r.ok && !(r.data && r.data.counts))) return slSetConn('notfound', '', null);
      if (!r.ok) return slSetConn(r.status === 401 ? 'badkey' : 'error', r.data?.error || `The site answered HTTP ${r.status}`, null);
      const info = r.data;
      if (!key) return slSetConn('readonly', '', info);
      const a = await slFetch('/api/agent', { auth: true, timeout: 15000 });
      if (a.status === 401) return slSetConn(/Set AGENT_TOKEN/i.test(a.data?.error || '') ? 'off' : 'badkey', a.data?.error || '', info);
      if (!a.ok || !a.data) return slSetConn('error', a.data?.error || `The agent API answered HTTP ${a.status}`, info);
      SITE.agent = a.data; return slSetConn('ok', '', info);
    } catch (e) { return slSetConn(e.kind === 'timeout' ? 'timeout' : e.kind === 'network' ? 'unreachable' : 'error', e.message); }
  })();
  try {
    const c = await SITE.testing;
    if (!quiet) { const [label, tone] = SL_STATES[c.state] || SL_STATES.error; toast(c.state === 'ok' ? `Connected to ${slHost(base)} — publishing and the manager are ready` : `${label.charAt(0) + label.slice(1).toLowerCase()} — ${slConnSentence(c)}`, tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'warn'); }
    if (c.state === 'ok') { slLoadReview().catch(() => {}); slLoadLog().catch(() => {}); }
    // a (re)linked site: read what the view shows, if it is not here yet
    if (UI.nav === 'site' && ['ok', 'readonly'].includes(c.state)) {
      if (!SITE.feed || SITE.feedBase !== slReadBase()) slLoadFeed().then(() => slPaint(['tiles', 'segbar', 'body'])).catch(() => slPaint(['tiles', 'segbar', 'body']));
      if (!SITE.photos) slLoadPhotos().then(() => slPaint(['tiles']));
    }
    return c;
  } finally { SITE.testing = null; slPaint(); }
}
function slConnSentence(c = SITE.conn) {
  const host = slHost(c.base || slBase()) || 'the site'; const i = c.info;
  switch (c.state) {
    case 'unset': return 'Add the site address and the access key to link New A OS to the public site.';
    case 'checking': return `Talking to ${host}…`;
    case 'ok': return `${host} accepts this key. The site reads ${i?.source === 'registry-app' ? `a registry published from New A OS${i.uploaded ? ' ' + slAgo(i.uploaded) : ''}` : i?.source === 'uploaded' ? 'a registry uploaded at the desk' : 'its bundled registry file'} · ${fmtInt(i?.counts?.buildings)} standing, ${fmtInt(i?.counts?.historical)} historical, ${fmtInt(i?.counts?.roads)} roads.`;
    case 'readonly': return `${host} answers, but without the access key New A OS can only read it. Paste the key to publish and to run the city.`;
    case 'badkey': return `${host} refused this key. Paste the site’s AGENT_TOKEN — or, when no token is set, the desk passcode.`;
    case 'off': return `${host} has no access key configured, so it accepts no writes. Set AGENT_TOKEN (or DESK_PASSCODE) in the host’s environment variables and redeploy.`;
    case 'unreachable': return c.message || `The browser could not read ${host}.`;
    case 'notfound': return `${host} answers, but not as the City of New A site with the registry link. Check the address, or deploy the latest version of the site.`;
    case 'timeout': return `${host} did not answer in time — it may be waking up. Try again in a moment.`;
    default: return c.message || 'The site answered with an error.';
  }
}

/* ---- what this computer has vs. what was last published: a fingerprint per record (meta and app settings left out) ---- */
function slStable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(slStable).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort().map(k => JSON.stringify(k) + ':' + slStable(v[k])).join(',') + '}';
}
function slLocalState() {
  const map = {};
  for (const [k] of SL_COLLS) { const m = map[k] = {}; for (const r of S[k] || []) if (r && r.id != null) m[r.id] = hashStr(slStable(k === 'buildings' ? { ...r, status: summaryStatus(r) } : r)); }
  map.settings = { valuation: hashStr(slStable(S.settings?.valuation || {})), fabricYear: String(S.settings?.fabricYear ?? '') };
  map.legacy = { all: hashStr(slStable(S.legacy || {})) };
  return { map, fp: hashStr(slStable(map)) };
}
function slDiffMaps(prev, cur) {
  if (!prev || !cur) return null;
  const out = { total: 0, by: {} };
  for (const k of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
    const a = prev[k] || {}, b = cur[k] || {}; let add = 0, del = 0, upd = 0;
    for (const id in b) { if (!(id in a)) add++; else if (a[id] !== b[id]) upd++; }
    for (const id in a) if (!(id in b)) del++;
    if (add + del + upd) { out.by[k] = { add, del, upd, n: add + del + upd }; out.total += add + del + upd; }
  }
  return out;
}
function slDiffChips(d) {
  if (!d) return '';
  const lab = k => (SL_COLLS.find(c => c[0] === k) || [k, k === 'settings' ? 'valuation setting' : k === 'legacy' ? 'legacy record' : k, k === 'settings' ? 'valuation settings' : k === 'legacy' ? 'legacy records' : k]);
  return Object.entries(d.by).map(([k, v]) => { const [, one, many] = lab(k); const bits = [v.add && `+${v.add}`, v.upd && `~${v.upd}`, v.del && `−${v.del}`].filter(Boolean).join(' '); return `<span><b>${v.n}</b> ${esc(v.n === 1 ? one : many)} <small class="muted">${bits}</small></span>`; }).join('');
}
const slDiffText = d => !d ? '' : Object.entries(d.by).slice(0, 3).map(([k, v]) => { const c = SL_COLLS.find(x => x[0] === k); return `${v.n} ${c ? (v.n === 1 ? c[1] : c[2]) : k}`; }).join(' · ') + (Object.keys(d.by).length > 3 ? ' · …' : '');
/* the cheap check that runs after edits settle: are we in step with the last publish? (also arms auto-publish) */
function slLocalCheck() {
  const base = slBase(); if (!base || !S) { SITE.local = null; slStatusBar(); return; }
  const st = slLocalState(); const last = slLast(base);
  SITE.local = { fp: st.fp, map: st.map, at: Date.now(), diff: last?.map ? slDiffMaps(last.map, st.map) : null, inStep: !!last && last.fp === st.fp };
  if (slCfg().auto) slAutoConsider(st.fp, last);
  slStatusBar(); slPaint(['tiles', 'segbar', SITE.seg === 'publish' ? 'body' : null]);
}
function slOnCommit() { if (!slBase()) return; clearTimeout(SITE.auto.check); SITE.auto.check = setTimeout(slLocalCheck, 1200); }

/* ---- publish the registry ---- */
/* exactly what the site keeps (its publicMaster): the news inbox, world scans, sandbox and app settings never leave this computer */
function slMasterForSite() {
  const { news, world, sandbox, settings, ...rest } = serializeMaster();
  return { ...rest, settings: { valuation: settings?.valuation || {}, fabricYear: settings?.fabricYear ?? null }, sandbox: { stations: [], roads: [] } };
}
async function slGzip(text) {
  if (typeof CompressionStream !== 'function') return null;
  try { const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')); return new Uint8Array(await new Response(stream).arrayBuffer()); } catch { return null; }
}
async function slPublish({ reason = 'manual' } = {}) {
  const base = slBase(); if (!base) throw new SiteError('Link the site first — add its address and the access key', 'config');
  if (!slKey(base)) throw new SiteError('Add the access key first', 'nokey');
  if (SITE.publishing) throw new SiteError('A publish is already running', 'busy');
  SITE.publishing = true; slStatusBar(); slPaint(['tiles', 'head', SITE.seg === 'publish' ? 'body' : null]);
  try {
    const local = slLocalState();
    const json = JSON.stringify({ master: slMasterForSite(), app: APP.name, version: APP.version, reason });
    const bytes = new Blob([json]).size; const limit = SITE.conn.info?.limits?.masterBytes || 8388608;
    if (bytes > limit) throw new SiteError(`The registry is ${slBytes(bytes)} — over the site’s ${slBytes(limit)} limit. Photos travel separately and are never embedded.`, 'toolarge');
    const gz = await slGzip(json);
    const r = await slJSON('/api/registry', { method: 'POST', auth: true, body: gz || json, contentType: gz ? 'application/octet-stream' : 'application/json', timeout: 90000 });
    const d = r.data || {};
    if (!d.hash) throw new SiteError('The site answered without a fingerprint — is it the current version?', 'error');
    slSetLast(base, { at: Date.now(), hash: d.hash, prevHash: d.prevHash || null, fp: local.fp, map: local.map, counts: d.counts || null, summary: d.summary || '', unchanged: !!d.unchanged, reason, version: APP.version, bytes, gz: gz ? gz.length : null });
    SITE.conn.info = { ...(SITE.conn.info || {}), hash: d.hash, source: d.source || 'registry-app', uploaded: d.uploaded || new Date().toISOString(), counts: d.counts || SITE.conn.info?.counts, reason, app: APP.name, version: APP.version, via: 'registry-app' };
    SITE.auto.held = null; SITE.auto.failures = 0; SITE.auto.retryAt = 0; SITE.auto.error = null; slAutoCancel(); SITE.auto.seenFp = local.fp;
    SITE.local = { fp: local.fp, map: local.map, at: Date.now(), diff: { total: 0, by: {} }, inStep: true };
    slLoadLog().catch(() => {});
    return d;
  } finally { SITE.publishing = false; slStatusBar(); slPaint(); }
}
async function slPublishClick() {
  if (!slBase() || !slKey()) { SITE.editing = true; slPaint(); toast('Add the site address and the access key first', 'warn'); $('#sl-url')?.focus(); return; }
  if (SITE.publishing) return;
  const base = slBase(); const last = slLast(base);
  let site = null;
  try { site = (await slJSON('/api/registry', { auth: true, timeout: 15000 })).data; SITE.conn.info = site; if (site && !site.authorized) { slTest(); toast('The site refused the access key — check it under Site link', 'bad'); return; } }
  catch (e) { if (e.kind === 'network' || e.kind === 'timeout') { slSetConn(e.kind === 'timeout' ? 'timeout' : 'unreachable', e.message); toast(e.message, 'bad'); slPaint(); return; } }
  // the site holds a copy that did not come from this browser's last publish: say so before replacing it
  if (site?.hash && site.source !== 'bundled' && (!last || last.hash !== site.hash)) {
    const from = site.source === 'registry-app' ? `published from New A OS${site.app ? ` (${esc(site.app)} ${esc(site.version || '')})` : ''}` : 'uploaded at the desk';
    const r = await confirmDialog({ title: 'Replace the site’s registry?', body: `<p>The site reads a registry ${from}${site.uploaded ? ` <b>${esc(slAgo(site.uploaded))}</b>` : ''} that ${last ? 'is not the one this browser published last' : 'this browser has not published'} — another computer, a revert or a desk upload. It holds <b class="num">${fmtInt(site.counts?.buildings)}</b> standing and <b class="num">${fmtInt(site.counts?.historical)}</b> historical buildings; this registry has <b class="num">${fmtInt(activeBuildings().length)}</b> and <b class="num">${fmtInt(histBuildings().length)}</b>.</p><p class="muted" style="font-size:12.5px">Publishing replaces it with this copy. Desk edits on the site stay on top, and the site logs exactly what changed.</p>`, ok: 'Publish this copy', cancel: 'Cancel' });
    if (r !== 'ok') return;
  }
  try { const d = await slPublish({ reason: 'manual' }); slChangesModal(d); }
  catch (e) { slPublishError(e); }
}
function slPublishError(e) {
  if (e.kind === 'auth') { slTest(); toast('The site refused the access key — check it under Site link', 'bad'); return; }
  if (e.kind === 'invalid' && Array.isArray(e.data?.errors) && e.data.errors.length) { openModal({ title: 'The site refused this registry', kicker: 'PUBLISH', cls: 'narrow', body: `<div class="issues-wrap" style="margin:12px 0 0">${e.data.errors.map(x => `<div class="issue bad">${icon('warn')}<span>${esc(x)}</span></div>`).join('')}${(e.data.warnings || []).map(x => `<div class="issue warn">${icon('warn')}<span>${esc(x)}</span></div>`).join('')}</div>`, foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Close</button>` }); return; }
  if (e.kind === 'rate') { toast(`${e.message}`, 'warn'); return; }
  if (e.kind === 'network' || e.kind === 'timeout') { slSetConn(e.kind === 'timeout' ? 'timeout' : 'unreachable', e.message); slPaint(); }
  toast('Publish failed: ' + e.message, 'bad');
}
/* what one publish changed, as the site worked it out */
function slChangesModal(d) {
  const c = d.changes || {}; const rec = c.records || {}; const lab = c.labels || {};
  const L = v => Array.isArray(v) ? v : [];
  const bRow = (tag, g) => { const r = rec[tag] || {}; const local = r.id && byId(r.id) ? r.id : null; return `<div class="sl-ch-row" ${local ? `data-sl="open-record" data-id="${esc(local)}" role="button" tabindex="0"` : ''}><span class="g ${g}">${g === 'add' ? '+' : g === 'del' ? '−' : '~'}</span><span class="tag">${esc(tag)}</span><span class="t">${esc(r.title || '')}${r.fields?.length ? `<small>${esc(r.fields.join(', '))}</small>` : ''}</span></div>`; };
  const oRow = (tag, g) => `<div class="sl-ch-row"><span class="g ${g}">${g === 'add' ? '+' : g === 'del' ? '−' : g === 'geo' ? '◇' : '~'}</span><span class="tag">${esc(tag)}</span><span class="t">${esc(lab[tag] || '')}</span></div>`;
  const demolished = new Set(L(c.demolished)); const updated = L(c.updated).filter(t => !demolished.has(t));
  const groups = [
    ['BUILDINGS ADDED', L(c.added), 'add', bRow], ['BUILDINGS UPDATED', updated, 'upd', bRow], ['DEMOLISHED', L(c.demolished), 'del', bRow], ['BUILDINGS REMOVED', L(c.removed), 'del', bRow],
    ['ROADS ADDED', L(c.roadsAdded), 'add', oRow], ['ROADS UPDATED', L(c.roadsUpdated), 'upd', oRow], ['ROADS REMOVED', L(c.roadsRemoved), 'del', oRow],
    ['BORDERS REDRAWN', [...L(c.districtsChanged), ...L(c.regionsChanged)], 'geo', oRow], ['AREAS ADDED', [...L(c.districtsAdded), ...L(c.regionsAdded)], 'add', oRow], ['AREAS RENAMED OR RECOLOURED', [...L(c.districtsUpdated), ...L(c.regionsUpdated)], 'upd', oRow], ['AREAS REMOVED', [...L(c.districtsRemoved), ...L(c.regionsRemoved)], 'del', oRow],
    ['NEIGHBORHOODS', [...L(c.neighborhoodsAdded), ...L(c.neighborhoodsChanged), ...L(c.neighborhoodsRemoved)], 'upd', oRow],
    ['CHRONICLE ADDED', L(c.archiveAdded), 'add', oRow], ['CHRONICLE EDITED', L(c.archiveUpdated), 'upd', oRow], ['CHRONICLE REMOVED', L(c.archiveRemoved), 'del', oRow],
    ['OFFICIALS', [...L(c.officialsAdded), ...L(c.officialsChanged), ...L(c.officialsRemoved)], 'upd', oRow],
    ['BUSINESSES', [...L(c.businessesAdded), ...L(c.businessesUpdated), ...L(c.businessesRemoved)], 'upd', oRow],
  ].filter(g => g[1].length);
  const more = c.more ? Object.values(c.more).reduce((a, b) => a + b, 0) : 0;
  const counts = d.counts || {};
  openModal({ title: d.unchanged ? 'Already up to date' : 'Published to the site', kicker: `REGISTRY · ${slHost()} · ${slShort(d.hash)}`, cls: 'wide',
    body: `<p class="sl-ch-sum">${d.unchanged ? 'The site already has exactly this registry — nothing was rewritten.' : esc(d.summary || 'Published.')}</p>
      <div class="sl-ch-meta"><span class="pill"><i style="--c:var(--good)"></i>${fmtInt(counts.buildings)} standing</span><span class="pill"><i style="--c:var(--hist)"></i>${fmtInt(counts.historical)} historical</span><span class="pill"><i style="--c:var(--road)"></i>${fmtInt(counts.roads)} roads</span><span class="pill"><i style="--c:var(--region)"></i>${fmtInt(counts.districts)} districts · ${fmtInt(counts.regions)} regions</span><span class="pill"><i style="--c:var(--cyan)"></i>${fmtInt(counts.archive)} chronicle</span>${c.tenanciesChanged ? `<span class="pill">${c.tenanciesChanged} tenancies changed</span>` : ''}${c.transitChanged ? `<span class="pill">transit: ${c.transitChanged} changes</span>` : ''}</div>
      ${groups.map(([t, list, g, fn]) => `<div class="sl-ch-group"><h4>${t} · ${list.length}</h4>${list.map(tag => fn(tag, g)).join('')}</div>`).join('')}
      ${more ? `<div class="desc-line" style="margin-top:10px">… and ${more} more in the site’s sync log.</div>` : ''}
      ${!groups.length && !d.unchanged ? `<div class="callout info"><b>No record changes.</b> Only file details moved (the export time, the app version or settings) — the site keeps the new copy and its pages are unchanged.</div>` : ''}
      ${L(d.warnings).length ? `<div class="issues-wrap" style="margin:14px 0 0">${d.warnings.map(w => `<div class="issue warn">${icon('warn')}<span>${esc(w)}</span></div>`).join('')}</div>` : ''}
      <div class="desc-line" style="margin-top:14px">Fingerprint ${esc(slShort(d.prevHash))} → <b>${esc(slShort(d.hash))}</b> · pages switch over on their next load · photos travel separately (Publish → Photos).</div>`,
    foot: `<a class="btn ghost" href="${esc(slBase())}/buildings" target="_blank" rel="noopener">${icon('globe')} Open the registry on the site</a><span class="spacer"></span><button class="btn primary" data-act="modal-close">Done</button>` });
}

/* ---- auto-publish while the app is open ---- */
function slAutoConsider(fp, last) {
  const A = SITE.auto;
  if (!last) { slAutoCancel(); A.held = { kind: 'first', message: 'Publish once by hand — auto-publish takes over after the first manual publish to this site.' }; return; }
  if (A.held?.kind === 'first') A.held = null;
  if (fp === last.fp) { slAutoCancel(); A.seenFp = fp; return; }
  if (A.held?.kind === 'invalid' && A.held.fp !== fp) A.held = null;                 // a new edit may fix what the site refused
  if (A.held) return;
  if (fp !== A.seenFp || !A.timer) { A.seenFp = fp; slAutoArm(SL_AUTO_DELAY); }     // edits keep pushing the publish back until they settle
}
function slAutoArm(ms) { const A = SITE.auto; clearTimeout(A.timer); const at = Math.max(Date.now() + ms, A.retryAt || 0); A.due = at; A.timer = setTimeout(slAutoRun, Math.max(0, at - Date.now())); slTicker(true); slStatusBar(); }
function slAutoCancel() { const A = SITE.auto; clearTimeout(A.timer); A.timer = null; A.due = 0; slTicker(false); }
function slTicker(on) { const A = SITE.auto; if (on && !A.ticker) A.ticker = setInterval(slStatusBar, 1000); if (!on && A.ticker) { clearInterval(A.ticker); A.ticker = null; } }
async function slAutoRun() {
  const A = SITE.auto; A.timer = null; A.due = 0; slTicker(false);
  const base = slBase(); if (!slCfg().auto || !base || !slKey(base) || A.held) { slStatusBar(); return; }
  if (SITE.publishing) { slAutoArm(10e3); return; }
  if (navigator.onLine === false) { A.error = 'This computer is offline'; A.retryAt = Date.now() + 60e3; slAutoArm(0); return; }
  const last = slLast(base); const { fp } = slLocalState();
  if (!last) { slAutoConsider(fp, null); slStatusBar(); slPaint(); return; }
  if (fp === last.fp) { slStatusBar(); return; }
  try {
    const st = (await slJSON('/api/registry', { auth: true, timeout: 15000 })).data; SITE.conn.info = st;
    if (!st?.authorized) throw new SiteError('The site refused the access key', 'auth');
    if (st.hash && st.hash !== last.hash) { A.held = { kind: 'changed', message: 'The site’s registry changed outside this browser (a revert, a desk upload or another computer). Publish by hand to replace it — auto-publish waits until then.' }; return; }
    const d = await slPublish({ reason: 'auto' });
    A.failures = 0; A.retryAt = 0; A.error = null;
    if (!d.unchanged) toast(`Auto-published to ${slHost(base)} — ${d.summary || 'registry updated'}`, 'good');
  } catch (e) {
    if (e.kind === 'auth') { A.held = { kind: 'auth', message: 'The site refused the access key — auto-publish is paused. Check the key under Site link.' }; slTest(); }
    else if (e.kind === 'held') A.held = { kind: 'removal', message: e.message };
    else if (e.kind === 'invalid' || e.kind === 'toolarge') A.held = { kind: 'invalid', message: e.message, fp };
    else if (e.kind === 'rate') { A.retryAt = Date.now() + Math.max(5, e.retryAfter || 30) * 1000; A.error = e.message; slAutoArm(0); }
    else { A.failures++; A.retryAt = Date.now() + Math.min(15 * 60e3, 60e3 * 2 ** (A.failures - 1)); A.error = e.message; slAutoArm(0); }
  } finally {
    if (A.held && A.held.kind !== 'first') toast(A.held.message, 'warn', { label: 'SITE LINK', fn: () => { SITE.seg = 'publish'; setNav('site'); } });
    slStatusBar(); slPaint();
  }
}
function slSetAuto(on) {
  slSetCfg({ auto: !!on }); const A = SITE.auto;
  if (!on) { slAutoCancel(); A.held = null; A.failures = 0; A.retryAt = 0; A.error = null; toast('Auto-publish is off — publish by hand from Site link', ''); }
  else { A.held = A.held?.kind === 'first' ? null : A.held; A.seenFp = null; slLocalCheck(); toast(slLast() ? 'Auto-publish is on — edits go to the site about 45 seconds after you stop' : 'Auto-publish is on — it starts after your first manual publish', 'good'); }
  slStatusBar(); slPaint();
}

/* ---- the status-bar indicator ---- */
function slStatusBar() {
  const dot = $('#st-site'), t = $('#st-site-t'); if (!dot || !t) return;
  const base = slBase(); const c = slCfg(); const A = SITE.auto; const st = SITE.conn.state; const last = base ? slLast(base) : null;
  let cls = 'off', text = 'site · not linked';
  if (base) {
    if (SITE.publishing) { cls = 'pend'; text = `site · publishing to ${slHost(base)}…`; }
    else if (['badkey', 'off', 'unreachable', 'notfound', 'error'].includes(st)) { cls = 'bad'; text = `site · ${SL_STATES[st][2]}`; }
    else if (c.auto && A.held && A.held.kind !== 'first') { cls = 'warn'; text = 'site · auto-publish paused'; }
    else if (c.auto && A.due) { cls = 'pend'; const s = Math.max(0, Math.ceil((A.due - Date.now()) / 1000)); text = A.error ? `site · retry in ${slClock(s)}` : `site · auto-publish in ${slClock(s)}`; }
    else if (last && SITE.local && !SITE.local.inStep && SITE.local.diff?.total) { cls = 'warn'; text = `site · ${plural(SITE.local.diff.total, 'unpublished change')}`; }
    else if (last) { cls = ''; text = `site · published ${slWhen(last.at)}${c.auto ? ' · auto' : ''}`; }
    else { cls = st === 'ok' ? 'warn' : 'off'; text = `site · ${slHost(base)} · not published yet`; }
  }
  dot.className = cls; t.textContent = text; t.title = base ? `Site link — ${slHost(base)} (${SL_STATES[st]?.[2] || st})` : 'Site link — connect New A OS to the public site';
}

/* ---- photos and the basemap ---- */
async function slLoadPhotos() {
  if (!slBase()) return null;
  try { const d = (await slJSON('/api/registry/photos', { timeout: 15000 })).data; SITE.photos = { have: d.have || {}, count: d.count ?? Object.keys(d.have || {}).length, basemap: d.basemap || null, at: Date.now() }; SITE.photosError = null; }
  catch (e) { SITE.photosError = e; }
  return SITE.photos;
}
async function slLocalPhotos() {
  let all = []; try { all = await idbAllWithKeys('images'); } catch { all = []; }
  const out = [];
  for (const [id, rec] of all) {
    if (typeof id !== 'string' || id.startsWith('basemap:') || !rec?.full) continue;
    const b = byId(id), a = b ? null : archiveById(id); const owner = b || a; if (!owner || !owner.image) continue;
    out.push({ id, rec, kind: b ? 'building' : 'chronicle', label: b ? `${b.reg} · ${titleOf(b)}` : `Chronicle ${a.year || ''} · ${a.title || 'image'}`, ts: Date.parse(rec.updated || '') || 0 });
  }
  SITE.localPhotos = { count: out.length, ids: new Set(out.map(p => p.id)), list: out, at: Date.now(), stamp: S.meta.updated };
  return out;
}
const slPhotoPending = (local, have) => local.filter(p => !have[p.id] || p.ts > have[p.id]);
/* ≤ 1400 px, JPEG ~0.82, under 900 KB — smaller and softer only when it has to be */
async function slJpegUnder(blob, max = 1400) {
  for (const [m, q] of [[max, 0.82], [max, 0.72], [Math.round(max * 0.85), 0.68], [Math.round(max * 0.7), 0.64], [Math.round(max * 0.55), 0.6], [Math.round(max * 0.4), 0.55]]) {
    const out = await downscale(blob, m, q); if (out && out.size <= SL_PHOTO_MAX) return out;
  }
  throw new Error('it does not fit under 900 KB even at 560 px');
}
async function slPushPhotos() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const ctl = { cancel: false, abort: null, running: false };
  openModal({ title: 'Push photos to the site', kicker: `PHOTOS · ${slHost()}`, cls: 'narrow',
    body: `<div id="sl-ph"><p class="muted" style="margin:14px 0 0;font-size:12.5px">Comparing this registry’s photos with the site…</p></div>`,
    foot: `<button class="btn ghost" id="sl-ph-close">Close</button><span class="spacer"></span><button class="btn primary" id="sl-ph-go" disabled>${icon('up')} Send</button>` });
  const m = $('#modal-root .modal'); const box = () => $('#sl-ph');
  const closeBtn = $('#sl-ph-close'); const goBtn = $('#sl-ph-go');
  closeBtn.onclick = () => { if (ctl.running) { ctl.cancel = true; ctl.abort?.abort(); closeBtn.disabled = true; closeBtn.textContent = 'Stopping…'; } else closeModal(); };
  let local, have;
  try { [local] = await Promise.all([slLocalPhotos(), slLoadPhotos()]); if (SITE.photosError) throw SITE.photosError; have = SITE.photos.have; }
  catch (e) { if (box()) box().innerHTML = `<div class="callout bad"><b>Could not compare.</b> ${esc(e.message)}</div>`; return; }
  if (!box()) return;
  const pending = slPhotoPending(local, have); const newer = pending.filter(p => have[p.id]).length;
  box().innerHTML = `<div class="sl-photo-stats" style="margin-top:14px"><div><b>${fmtInt(local.length)}</b><span>photos here</span></div><div><b>${fmtInt(local.filter(p => have[p.id]).length)}</b><span>already on the site</span></div><div><b style="color:${pending.length ? 'var(--amber)' : 'var(--good)'}">${fmtInt(pending.length)}</b><span>to send${newer ? ` · ${newer} newer` : ''}</span></div></div>
    ${pending.length ? `<div class="list" style="max-height:200px;overflow:auto">${pending.slice(0, 40).map(p => `<div class="li" style="grid-template-columns:1fr auto"><div><div class="t">${esc(p.label)}</div><div class="s">${p.kind}${have[p.id] ? ` · the site’s copy is from ${esc(slWhen(have[p.id]))}` : ' · not on the site'}</div></div></div>`).join('')}${pending.length > 40 ? `<div class="li empty">… and ${pending.length - 40} more</div>` : ''}</div>
    <p class="desc-line" style="margin-top:10px">Each photo is resized in this browser to at most 1400 px (JPEG, under 900 KB) and sent ${SL_PHOTO_BATCH} at a time. Photos added at the desk stay as they are.</p>` : `<div class="callout good"><b>Nothing to send.</b> Every building and chronicle photo here is already on the site.</div>`}
    <div class="sl-prog" id="sl-ph-prog" hidden><div class="bar"><i></i></div><div class="lbl"><span id="sl-ph-l1"></span><span id="sl-ph-l2"></span></div></div><div id="sl-ph-res"></div>`;
  if (!pending.length) { goBtn.hidden = true; return; }
  goBtn.disabled = false; goBtn.innerHTML = `${icon('up')} Send ${plural(pending.length, 'photo')}`;
  goBtn.onclick = async () => {
    goBtn.disabled = true; ctl.running = true; closeBtn.textContent = 'Cancel'; $('#sl-ph-prog').hidden = false;
    const budget = Math.max(600000, Math.min(SITE.conn.info?.limits?.photoRequestBytes || 4000000, 4000000) - 120000);
    const saved = [], errors = []; let done = 0, sentBytes = 0, carry = null, i = 0;
    const paint = (l1, l2) => { if (!$('#sl-ph-prog')) return; $('#sl-ph-prog .bar i').style.width = `${Math.round(done / pending.length * 100)}%`; $('#sl-ph-l1').textContent = l1; $('#sl-ph-l2').textContent = l2 || ''; };
    const prepare = async p => { try { const blob = await slJpegUnder(p.rec.full); return { p, dataUrl: await blobToDataURL(blob), bytes: blob.size }; } catch (e) { errors.push({ key: p.id, label: p.label, error: 'Could not prepare it: ' + e.message }); done++; return null; } };
    try {
      while ((carry || i < pending.length) && !ctl.cancel && $('#sl-ph')) {
        const batch = []; let size = 0;
        while (batch.length < SL_PHOTO_BATCH && (carry || i < pending.length) && !ctl.cancel) {
          const item = carry || await prepare(pending[i++]); carry = null; if (!item) continue;
          if (batch.length && size + item.dataUrl.length > budget) { carry = item; break; }
          batch.push(item); size += item.dataUrl.length;
          paint(`Preparing ${done + batch.length} of ${pending.length}`, item.p.label);
        }
        if (!batch.length || ctl.cancel) break;
        let tries = 0;
        for (;;) {
          paint(`Sending ${done + 1}–${done + batch.length} of ${pending.length}`, slBytes(sentBytes + batch.reduce((a, b) => a + b.bytes, 0)));
          ctl.abort = new AbortController();
          try {
            const r = await slJSON('/api/registry/photos', { method: 'POST', auth: true, body: JSON.stringify({ items: batch.map(b => ({ key: b.p.id, dataUrl: b.dataUrl })) }), timeout: 120000, signal: ctl.abort.signal });
            const d = r.data || {}; for (const k of d.saved || []) saved.push(k); for (const er of d.errors || []) errors.push({ key: er.key, label: batch.find(b => b.p.id === er.key)?.p.label || er.key, error: er.error });
            break;
          } catch (e) {
            if (e.kind === 'invalid' && e.data) { for (const er of e.data.errors || []) errors.push({ key: er.key, label: batch.find(b => b.p.id === er.key)?.p.label || er.key, error: er.error }); break; }
            if (e.kind === 'rate' && tries < 6) { const wait = Math.max(3, e.retryAfter || 20); for (let s = wait; s > 0 && !ctl.cancel; s--) { paint('The site asks for a pause', `resuming in ${s} s`); await new Promise(r => setTimeout(r, 1000)); } tries++; if (ctl.cancel) break; continue; }
            if ((e.kind === 'network' || e.kind === 'timeout' || e.kind === 'server') && tries < 2) { tries++; paint('Connection hiccup', `retrying (${tries}/2)…`); await new Promise(r => setTimeout(r, 2000 * tries)); continue; }
            throw e;
          }
        }
        done += batch.length; sentBytes += batch.reduce((a, b) => a + b.bytes, 0);
        paint(`Sent ${done} of ${pending.length}`, slBytes(sentBytes));
      }
    } catch (e) { if (e.kind !== 'cancel') errors.push({ key: '', label: 'Stopped', error: e.message }); if (e.kind === 'auth') slTest(); }
    ctl.running = false;
    for (const k of saved) if (SITE.photos) SITE.photos.have[k] = Date.now();
    if (SITE.photos) SITE.photos.count = Object.keys(SITE.photos.have).length;
    slLoadLog().catch(() => {}); slPaint();
    const stopped = ctl.cancel; const res = $('#sl-ph-res'); if (!res) { toast(`${plural(saved.length, 'photo')} sent to the site${errors.length ? ` · ${errors.length} refused` : ''}${stopped ? ' · stopped' : ''}`, errors.length ? 'warn' : 'good'); return; }
    if ($('#sl-ph-prog .bar i')) $('#sl-ph-prog .bar i').style.width = `${Math.round(done / pending.length * 100)}%`;
    $('#sl-ph-l1').textContent = stopped ? `Stopped — ${saved.length} sent` : `Done — ${saved.length} sent`; $('#sl-ph-l2').textContent = slBytes(sentBytes);
    const stats = $$('#sl-ph .sl-photo-stats b'); if (stats.length === 3 && SITE.photos) { const onSiteNow = local.filter(p => SITE.photos.have[p.id]).length; const left = slPhotoPending(local, SITE.photos.have).length; stats[1].textContent = fmtInt(onSiteNow); stats[2].textContent = fmtInt(left); stats[2].style.color = left ? 'var(--amber)' : 'var(--good)'; }
    res.innerHTML = `${saved.length ? `<div class="callout good"><b>${plural(saved.length, 'photo')} on the site.</b> Cards, record pages and the history pick them up on their next load.</div>` : ''}${errors.length ? `<div class="issues-wrap sl-errs" style="margin:12px 0 0">${errors.map(er => `<div class="issue bad">${icon('warn')}<span><b>${esc(er.label)}</b> — ${esc(er.error)}</span></div>`).join('')}</div>` : ''}`;
    closeBtn.disabled = false; closeBtn.textContent = 'Close'; goBtn.hidden = true;
    toast(stopped ? `Stopped — ${plural(saved.length, 'photo')} sent` : `${plural(saved.length, 'photo')} sent to the site${errors.length ? ` · ${errors.length} refused` : ''}`, errors.length || stopped ? 'warn' : 'good');
  };
}
/* the basemap the map shows today: the latest dated render, else the first undated one */
function slBasemapList() { const all = (S.settings.basemaps || []).slice(); const act = basemapsAt(null); return { all, active: act[0] || all[0] || null }; }
async function slBasemapBlob(bm) { const rec = await idbGet('images', 'basemap:' + bm.id).catch(() => null); return rec?.full || null; }
async function slEncodeBasemap(blob) {
  const bmp = await createImageBitmap(blob); const W = bmp.width, H = bmp.height;
  try {
    for (const max of [2400, 2000, 1600, 1280, 1024]) {
      const k = Math.min(1, max / Math.max(W, H)); const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
      for (const [type, q] of [['image/webp', 0.86], ['image/webp', 0.74], ['image/png', undefined], ['image/jpeg', 0.8]]) {
        const out = await new Promise(r => c.toBlob(r, type, q)); if (out && out.type === type && out.size <= SL_PHOTO_MAX) return { blob: out, W, H, w, h };
      }
    }
  } finally { bmp.close?.(); }
  throw new Error('the basemap does not fit under 900 KB even at 1024 px');
}
async function slPushBasemap() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const { all, active } = slBasemapList();
  if (!all.length) { toast('No basemap yet — add one on the map (Satellite) or under Vault → Basemap', 'warn'); return; }
  const site = SITE.photos?.basemap || null;
  const opts = all.map(bm => `<option value="${esc(bm.id)}" ${bm.id === active?.id ? 'selected' : ''}>${esc(bm.name)}${bm.year ? ` · ${esc(hyLabel(bm.year, bm.half))}` : ''}${bm.hidden ? ' · hidden' : ''}</option>`).join('');
  const info = bm => { const w = (bm.w || 0) * (bm.scale || 1), h = (bm.h || 0) * (bm.scale || 1); return `<b>${esc(bm.name)}</b><br>Top-left X ${fmtInt(bm.x)} · Z ${fmtInt(bm.z)} · covers ${fmtInt(w)} × ${fmtInt(h)} blocks · opacity ${Math.round((bm.opacity ?? 0.75) * 100)}%${bm.w ? ` · ${fmtInt(bm.w)} × ${fmtInt(bm.h)} px here` : ''}`; };
  openModal({ title: 'Push the basemap to the site', kicker: `MAP · ${slHost()}`, cls: 'narrow',
    body: `${all.length > 1 ? `<div class="f" style="margin-top:12px"><label for="sl-bm-sel">Which basemap</label><select id="sl-bm-sel">${opts}</select></div>` : ''}
      <div class="sl-bm" style="margin-top:12px"><div class="th" id="sl-bm-th">${icon('sat')}</div><div class="i" id="sl-bm-info">${active ? info(active) : ''}</div></div>
      <p class="desc-line" style="margin-top:12px">Resized to at most 2400 px on its longest side (WebP keeps transparency), under 900 KB. The site draws it under the city map at the same place: X, Z is the top-left corner in blocks, W × H its size in blocks.</p>
      ${site ? `<div class="callout info"><b>On the site now.</b> A basemap from ${esc(slWhen(site.ts))} at X ${fmtInt(site.x)} · Z ${fmtInt(site.z)}, ${fmtInt(site.w)} × ${fmtInt(site.h)} blocks — it is replaced.</div>` : ''}
      <div class="sl-prog" id="sl-bm-prog" hidden><div class="bar"><i></i></div><div class="lbl"><span id="sl-bm-l1"></span><span id="sl-bm-l2"></span></div></div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="sl-bm-go">${icon('sat')} Send basemap</button>`,
    onOpen: async m => {
      let cur = active; let thumbUrl = null;
      const paintThumb = async () => { const blob = await slBasemapBlob(cur); const th = m.querySelector('#sl-bm-th'); if (!th) return; if (thumbUrl) URL.revokeObjectURL(thumbUrl); thumbUrl = blob ? URL.createObjectURL(blob) : null; th.style.backgroundImage = thumbUrl ? `url("${thumbUrl}")` : ''; th.innerHTML = thumbUrl ? '' : icon('sat'); m.querySelector('#sl-bm-info').innerHTML = info(cur); };
      m.querySelector('#sl-bm-sel')?.addEventListener('change', e => { cur = all.find(b => b.id === e.target.value) || cur; paintThumb(); });
      paintThumb();
      m.querySelector('#sl-bm-go').onclick = async () => {
        const go = m.querySelector('#sl-bm-go'); go.disabled = true; const prog = m.querySelector('#sl-bm-prog'); prog.hidden = false;
        const step = (pct, a, b = '') => { prog.querySelector('.bar i').style.width = pct + '%'; m.querySelector('#sl-bm-l1').textContent = a; m.querySelector('#sl-bm-l2').textContent = b; };
        try {
          const blob = await slBasemapBlob(cur); if (!blob) throw new Error('The image for this basemap is not in this browser — re-add it on the map');
          step(25, 'Resizing…'); const enc = await slEncodeBasemap(blob);
          const scale = cur.scale || 1; const item = { key: 'basemap', dataUrl: await blobToDataURL(enc.blob), x: Math.round(cur.x || 0), z: Math.round(cur.z || 0), w: Math.round(enc.W * scale * 100) / 100, h: Math.round(enc.H * scale * 100) / 100, opacity: Math.round(clamp(cur.opacity ?? 0.75, 0, 1) * 100) / 100 };
          step(60, 'Sending…', `${enc.w} × ${enc.h} px · ${slBytes(enc.blob.size)} · ${enc.blob.type.replace('image/', '').toUpperCase()}`);
          const d = (await slJSON('/api/registry/photos', { method: 'POST', auth: true, body: JSON.stringify({ items: [item] }), timeout: 120000 })).data || {};
          if (!(d.saved || []).includes('basemap')) throw new Error(d.errors?.[0]?.error || 'The site did not keep the basemap');
          step(100, 'Done', `placed at X ${item.x} · Z ${item.z}`);
          if (SITE.photos) { SITE.photos.basemap = d.basemap || { ts: Date.now(), x: item.x, z: item.z, w: item.w, h: item.h, opacity: item.opacity }; SITE.photos.have.basemap = Date.now(); }
          slLoadLog().catch(() => {}); slPaint();
          toast(`Basemap on the site — ${item.w} × ${item.h} blocks at X ${item.x} · Z ${item.z}`, 'good');
          setTimeout(() => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); if ($('#sl-bm-go')) closeModal(); }, 900);
        } catch (e) { step(0, 'Not sent', ''); toast('Basemap not sent: ' + (e.kind === 'invalid' ? (e.data?.errors?.[0]?.error || e.message) : e.message), 'bad'); go.disabled = false; if (e.kind === 'auth') slTest(); }
      };
    } });
}

/* ---- the feed, read back ---- */
async function slLoadFeed({ force = false } = {}) {
  const base = slReadBase();
  if (SITE.feedLoading && SITE.feedLoadingBase === base && !force) return SITE.feedLoading;
  const same = SITE.feedBase === base && !!SITE.feed;
  const run = (async () => {
    try {
      const r = await slFetch('/api/feed?limit=60', { base, etag: !force && same ? SITE.feedEtag : null, timeout: 20000 });
      if (base !== slReadBase()) throw new SiteError('The site address changed while reading', 'stale');
      if (r.status === 304 && same) { SITE.feedAt = Date.now(); SITE.feedError = null; return { feed: SITE.feed, changed: false }; }
      if (!r.ok || !r.data || !Array.isArray(r.data.stories)) throw new SiteError(r.status === 404 ? `${slHost(base)} has no /api/feed yet — the newsroom falls back to feed.xml` : (r.data?.error || `The feed answered HTTP ${r.status}`), r.status === 404 ? 'notfound' : 'error', { status: r.status });
      SITE.feed = r.data; SITE.feedBase = base; SITE.feedEtag = r.etag || r.data.etag || null; SITE.feedAt = Date.now(); SITE.feedError = null;
      return { feed: SITE.feed, changed: true };
    } catch (e) { if (e.kind !== 'stale') SITE.feedError = e; throw e; }
    finally { if (SITE.feedLoading === run) SITE.feedLoading = null; }
  })();
  SITE.feedLoading = run; SITE.feedLoadingBase = base;
  return run;
}
/* one story of /api/feed in the shape parseFeed() gives, so mergeNewsItems() and the proposal extraction work unchanged */
function slFeedItem(s, base) {
  const title = String(s?.title || '').replace(/\s+/g, ' ').trim();
  const content = [s?.dek, ...(Array.isArray(s?.body) ? s.body : [])].filter(Boolean).map(p => String(p).trim()).join(' ').replace(/\s+/g, ' ').trim();
  const t = Number(s?.ts); const pub = Number.isFinite(t) ? new Date(t).toISOString() : null;
  const cats = [s?.category, s?.outletName, s?.place, s?.satire ? 'Parody' : null, ...(Array.isArray(s?.tags) ? s.tags : [])].filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  const link = slSafeUrl(s?.url) || (s?.slug ? `${base}/news/${encodeURIComponent(s.slug)}` : '');
  return { guid: String(s?.id || link || hashStr(title)), link, title, published: pub, updated: pub, content, excerpt: truncate(content, 320), categories: [...new Set(cats)], hash: hashStr(title + '|' + content) };
}
async function slNewsItems() {
  const { feed } = await slLoadFeed();
  const base = slReadBase();
  return { items: (feed.stories || []).filter(s => s && s.title).map(s => slFeedItem(s, base)), label: base + '/api/feed' };
}
/* the same article read from feed.xml and from /api/feed has a different text shape: switching sources re-baselines silently instead of flagging every article as revised */
function slRebaseline(items, label) {
  const kind = l => /\/api\/feed\b/.test(l || '') ? 'json' : 'rss'; const k = kind(label);
  for (const it of items) {
    const cur = S.news.items.find(x => x.guid === it.guid || (it.link && x.link === it.link));
    if (!cur || ['markets', 'world'].includes(cur.source) || kind(cur.source) === k || cur.hash === it.hash || cur.title !== it.title) continue;
    Object.assign(cur, { content: it.content, excerpt: it.excerpt, categories: it.categories, hash: it.hash, source: label });
  }
}
/* markets: /api/markets on the linked site, else the NASE section of /api/feed */
async function slFeedMarket() {
  const { feed } = await slLoadFeed(); const q = feed?.market?.quotes;
  if (!Array.isArray(q) || !q.length) return null;
  return { payload: JSON.stringify({ companies: q.map(x => ({ ticker: x.ticker, name: x.name, sector: x.sector, price: x.price, change: x.changePct, changePct: x.changePct, listed: true })) }), label: slReadBase() + '/api/feed (NASE)' };
}
async function slLoadPolitics() {
  const base = slReadBase();
  try {
    const r = await slFetch('/api/politics?compact=1', { base, timeout: 20000 });
    if (r.ok && Array.isArray(r.data?.officials)) { SITE.politics = r.data; SITE.politicsBase = base; SITE.politicsError = null; return SITE.politics; }
    SITE.politics = null; SITE.politicsError = r.status === 404 ? null : new SiteError(r.data?.error || `HTTP ${r.status}`);
  } catch (e) { SITE.politics = null; SITE.politicsError = e; }
  return null;
}
async function slLoadReview() {
  if (!slCanWrite() || slHas('market.review') === false) { SITE.review = null; return null; }
  try { SITE.review = await slAction('market.review'); SITE.reviewError = null; } catch (e) { SITE.review = null; SITE.reviewError = e.kind === 'unsupported' ? null : e; }
  return SITE.review;
}
async function slLoadLog() {
  if (!slCanWrite()) return null;
  try { const d = await slAction('sync.log', { limit: 12 }); SITE.log = Array.isArray(d.log) ? d.log : []; SITE.logError = null; } catch (e) { SITE.logError = e; }
  if (UI.nav === 'site' && SITE.seg === 'publish') slPaint(['body']);
  return SITE.log;
}
/* lists the manager needs, from whatever the site offers */
const slOfficials = () => { const P = SITE.politics?.officials || SITE.feed?.politics?.officials || []; return P.filter(o => o && o.id); };
const slOfficialById = id => slOfficials().find(o => o.id === id) || (SITE.agent?.leaders || []).find(l => l.id === id) || null;
const slQuotes = () => (SITE.feed?.market?.quotes || []).filter(q => q && q.ticker);
function slQueue() {
  const fromReview = Array.isArray(SITE.review?.proposals) ? SITE.review.proposals.filter(p => p && p.status === 'pending') : null;
  return (fromReview || SITE.feed?.proposals?.items || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function slNeedKey() { SITE.editing = true; if (UI.nav !== 'site') setNav('site'); else slPaint(); toast(SITE.conn.state === 'badkey' ? 'The site refused the access key — paste the right one' : 'Connect with the access key first', 'warn'); setTimeout(() => $('#sl-key')?.focus(), 60); }

/* =====================================================================
   the view
   ===================================================================== */
function renderSite() {
  if (!SITE.seg) SITE.seg = SL_SEGS.some(s => s[0] === slCfg().seg) ? slCfg().seg : 'dashboard';
  if (!SITE.form.story) SITE.form.story = { ...SL_STORY_BLANK(), ...(slCfg().draft || {}) };
  return `<div class="sl-view" id="sl-root">${slHeadHTML()}${slConnHTML()}${slTilesHTML()}${slSegbarHTML()}${slBodyHTML()}</div>`;
}
function slHeadHTML() {
  const base = slBase(); const [label] = SL_STATES[SITE.conn.state] || SL_STATES.error;
  return `<section class="dhead" id="sl-head" style="margin-bottom:14px">
    <div><div class="code"><i></i>SITE LINK · CITY HALL · ${base ? `${esc(slHost(base).toUpperCase())} · ${esc(label)}` : 'NOT LINKED'}</div><h2>Site link</h2>
    <p>New A OS runs the public site from here. It publishes the registry, the photos and the basemap; reads the newsroom, the NASE and politics back; and acts as City Hall — stories, the city alert, approval ratings, the market review queue and official posts — through the site’s own checks, so it can do exactly what the Mayor’s Desk can.</p></div>
    <div class="stats"><a class="btn sm" href="${esc(slReadBase())}" target="_blank" rel="noopener">${icon('globe')} Open the site</a><button class="btn sm" data-sl="test" ${base ? '' : 'disabled'}>${icon('redo')} Test connection</button><button class="btn sm primary" data-sl="publish" ${SITE.publishing ? 'disabled' : ''}>${icon('up')} ${SITE.publishing ? 'Publishing…' : 'Publish to site'}</button></div>
  </section>`;
}
function slConnHTML() {
  const base = slBase(); const key = slKey(base); const c = SITE.conn; const [label, tone] = SL_STATES[c.state] || SL_STATES.error;
  const forced = !base || !key || ['badkey', 'off', 'notfound'].includes(c.state); const open = forced || SITE.editing;
  const masked = key ? '•••••• stored' : '';                                     // never echo any part of the key
  const help = c.state === 'unreachable' || c.state === 'timeout' ? `<div class="callout bad sl-help"><b>How to fix it.</b><ol><li>Open <a href="${esc(base)}/api/registry" target="_blank" rel="noopener">${esc(slHost(base))}/api/registry</a> in a browser tab — it should show a short JSON status. If it does not load, the address is wrong or the site is down${/localhost|127\.0\.0\.1/.test(base) ? ' (start the local copy with <code>npm run dev</code>)' : ''}.</li><li>If it loads there but not here, the site does not allow pages opened from a file to read it (CORS). Deploy the current version of the site — its registry link answers any origin (<code>Access-Control-Allow-Origin: *</code>).</li><li>Offline? Everything here waits; nothing is lost. Reads can also go through the New A OS bridge (<code>node os/server.js</code>); the access key never does.</li></ol></div>` : '';
  return `<section class="panel hud sl-conn" id="sl-conn" aria-label="Connection">
    <div class="sl-conn-main">
      <span class="sl-pill ${tone}" role="status"><i></i>${esc(label)}</span>
      <div class="sl-conn-text"><b>${base ? esc(base) : 'No site linked yet'}${key ? ` <span class="muted" style="font-size:11px">· key ${esc(masked)}</span>` : ''}</b><span>${esc(slConnSentence(c))}${!SITE.storage ? ' This browser blocks local storage, so the address and key last until the app closes.' : ''}</span></div>
      <div class="sl-conn-acts">${base ? `<button class="btn sm" data-sl="test" ${c.state === 'checking' ? 'disabled' : ''}>${icon('redo')} ${c.state === 'checking' ? 'Checking…' : 'Test connection'}</button>` : ''}${forced ? '' : `<button class="btn sm ${open ? 'ghost' : ''}" data-sl="${open ? 'conn-close' : 'conn-edit'}">${icon(open ? 'x' : 'edit')} ${open ? 'Close' : 'Change'}</button>`}</div>
    </div>
    <form class="sl-conn-form" data-sl-form="conn" ${open ? '' : 'hidden'} autocomplete="off">
      <div class="f"><label for="sl-url">Site address <span class="hint">https://… or http://localhost:port</span></label><input id="sl-url" name="url" value="${esc(slCfg().url || '')}" placeholder="${SL_DEFAULT_URL}" spellcheck="false" inputmode="url"></div>
      <div class="f"><label for="sl-key">Access key <span class="hint">AGENT_TOKEN, else the desk passcode</span></label><div class="sl-keywrap"><input id="sl-key" name="key" type="${SITE.showKey ? 'text' : 'password'}" value="" placeholder="${key ? 'stored — leave empty to keep it' : 'paste the key'}" autocomplete="off" spellcheck="false"><button type="button" data-sl="key-show" aria-label="${SITE.showKey ? 'Hide' : 'Show'} the key while typing">${SITE.showKey ? 'hide' : 'show'}</button></div></div>
      <div class="sl-form-acts"><button class="btn primary" type="submit">${icon('link')} Save &amp; test</button>${key ? `<button class="btn ghost" type="button" data-sl="key-forget">Forget key</button>` : ''}</div>
      <div class="sl-note">The key is kept in <b>this browser only</b> (one per site address) and sent only to that site, as <code>Authorization: Bearer …</code> — never into Registry.json, exports, backups, the vault or the OS bridge. Locally, a site with no <code>AGENT_TOKEN</code> or <code>DESK_PASSCODE</code> takes <code>open-city-hall</code>.</div>
    </form>
    ${help}
  </section>`;
}
function slTilesHTML() {
  const base = slBase(); const info = SITE.conn.info || (SITE.feed?.registry ? { ...SITE.feed.registry } : null); const last = slLast(base); const loc = SITE.local; const f = SITE.feed;
  const tile = (lbl, val, sub, cls = '') => `<div class="panel tile ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  const srcLabel = s => s === 'registry-app' ? 'New A OS' : s === 'uploaded' ? 'Desk file' : s === 'bundled' ? 'Bundled' : '—';
  const siteMatches = last && info?.hash ? info.hash === last.hash : null;
  const photosHere = SITE.localPhotos?.count;
  const onSite = SITE.photos && SITE.localPhotos ? [...SITE.localPhotos.ids].filter(id => SITE.photos.have[id]).length : null;
  const latest = f?.stories?.[0];
  const queue = slQueue().length;
  return `<section class="tiles" id="sl-tiles">
    ${tile('SITE REGISTRY', esc(srcLabel(info?.source)), info?.hash ? `fingerprint ${esc(slShort(info.hash))}${info.uploaded ? ` · ${esc(slAgo(info.uploaded))}` : ''}` : base ? 'not read yet' : 'link a site first', info?.source === 'registry-app' ? 'link' : '')}
    ${tile('LAST PUBLISH', last ? esc(slTime(last.at)) : 'Never', last ? `${esc(slDay(last.at))} · ${esc(last.reason)}${siteMatches === true ? ' · <span class="ok">site in step</span>' : siteMatches === false ? ' · <span class="wn">site changed since</span>' : ''}` : 'from this browser', last ? '' : 'warnv')}
    ${tile('LOCAL CHANGES', !last ? '—' : loc?.inStep ? '0' : loc?.diff ? fmtInt(loc.diff.total) : '…', !last ? 'publish once to compare' : loc?.inStep ? '<span class="ok">in step with the last publish</span>' : loc?.diff ? `<span class="wn">${esc(slDiffText(loc.diff) || 'details only')}</span>` : 'checking…', !last ? '' : loc?.inStep ? 'goodv' : 'warnv')}
    ${tile('PHOTOS', fmtInt(photosHere), onSite == null ? 'here · not compared yet' : `here · ${fmtInt(onSite)} on the site${photosHere - onSite > 0 ? ` · <span class="wn">${fmtInt(photosHere - onSite)} missing</span>` : ''}${SITE.photos?.basemap ? ' · basemap ✓' : ''}`)}
    ${tile('NEWSROOM', f ? fmtInt(f.stories.length) : '—', latest ? `latest ${esc(slAgo(latest.ts))} · ${esc(SL_OUTLET[latest.outlet]?.short || latest.outletName || '')}` : SITE.feedError ? '<span class="bd">feed unavailable</span>' : !slBase() && !SITE.preview ? 'link a site first' : 'reading the feed…')}
    ${tile('MARKET QUEUE', f || SITE.review ? fmtInt(queue) : '—', queue ? `<span class="wn">${plural(queue, 'move')} waiting for City Hall</span>` : f ? 'nothing waiting' : '—', queue ? 'warnv' : '')}
  </section>`;
}
function slSegbarHTML() {
  const cnt = { publish: SITE.local && !SITE.local.inStep && SITE.local.diff?.total ? SITE.local.diff.total : '', newsroom: SITE.feed?.stories?.length || '', cityhall: SITE.feed?.alert ? '!' : '', market: slQueue().length || '' };
  const hot = { publish: !!cnt.publish, cityhall: !!cnt.cityhall, market: !!cnt.market };
  const live = SITE.feedAt && !SITE.feedError;
  return `<div class="sl-segbar" id="sl-segbar"><div class="seg lg" role="group" aria-label="Site link sections">${SL_SEGS.map(([id, l, ic]) => `<button type="button" data-sl="seg" data-seg="${id}" aria-pressed="${SITE.seg === id}">${icon(ic)} ${l}${cnt[id] !== undefined && cnt[id] !== '' ? ` <span class="cnt ${hot[id] ? 'hot' : ''}">${cnt[id]}</span>` : ''}</button>`).join('')}</div>
    <span class="sl-live ${live ? 'on' : ''}" title="The dashboard re-reads the site’s feed every minute while this section is open (an unchanged feed costs nothing)"><i></i>${live ? `feed read ${esc(slTime(SITE.feedAt))}` : SITE.feedError ? 'feed unavailable' : !slBase() && !SITE.preview ? 'no site linked' : 'reading the feed…'}${slBase() || SITE.preview ? `<button class="btn ghost sm" data-sl="feed-refresh" title="Read the feed now" aria-label="Read the feed now">${icon('redo')}</button>` : ''}</span></div>`;
}
/* before a site is linked, nothing is fetched on its own: the steps, and an opt-in read-only preview of the public site */
function slSetupHTML() {
  const step = (n, t, d) => `<div class="sl-step"><span class="n">${n}</span><div><b>${t}</b><p>${d}</p></div></div>`;
  return `<div class="panel hud sl-setup"><div class="panel-head"><h3>LINK THE PUBLIC SITE</h3><span class="note">once per browser</span></div>
    <div class="sl-steps">${step(1, 'Paste the site address', `Your deployment — for example <code>${SL_DEFAULT_URL}</code> — or a local copy at <code>http://localhost:3000</code>.`)}${step(2, 'Paste the access key', 'The site’s <code>AGENT_TOKEN</code>, or the desk passcode when no token is set. It stays in this browser and goes only to that site.')}${step(3, 'Publish', 'Press <b>Publish to site</b>. From then on the site follows this registry — by hand, or automatically while New A OS is open.')}</div>
    <div class="sl-acts" style="margin-top:16px"><button class="btn primary" data-sl="setup-focus">${icon('link')} Link a site</button><button class="btn" data-sl="preview">${icon('globe')} Preview ${esc(slHost(SL_DEFAULT_URL))} read-only</button><span class="desc-line">Nothing is sent anywhere until you link a site.</span></div></div>`;
}
function slBodyHTML() {
  const seg = SITE.seg; let html = '';
  if (!slBase() && !SITE.preview) return `<div id="sl-body">${slSetupHTML()}</div>`;
  try { html = seg === 'publish' ? slPublishHTML() : seg === 'newsroom' ? slNewsroomHTML() : seg === 'cityhall' ? slCityHallHTML() : seg === 'market' ? slMarketHTML() : slDashboardHTML(); }
  catch (e) { console.error(e); html = `<div class="panel empty"><b>This part of Site link could not draw</b>${esc(e.message)}</div>`; }
  return `<div id="sl-body">${html}</div>`;
}
const slPanel = (title, note, inner, cls = '') => `<div class="panel hud ${cls}"><div class="panel-head"><h3>${title}</h3>${note ? `<span class="note">${note}</span>` : ''}</div>${inner}</div>`;
function slFeedState() {
  if (SITE.feed) return null;
  if (SITE.feedError) return `<div class="panel empty"><b>Could not read the site’s feed</b>${esc(SITE.feedError.message)}<br><button class="btn" data-sl="feed-refresh">${icon('redo')} Try again</button></div>`;
  return `<div class="panel empty"><b>Reading the site…</b>The newsroom, the NASE, politics and the square arrive in a moment.</div>`;
}
function slAlertHTML(a, withAct = true) {
  if (!a) return '';
  const lv = SL_ALERTS.find(x => x[0] === a.level) || SL_ALERTS[1];
  return `<div class="sl-alert ${esc(a.level)}" role="note"><span class="lv">${esc(lv[1].toUpperCase())}</span><div class="tx">${esc(a.text || 'City alert in effect')}<small>set ${esc(slWhen(a.ts))}${a.expires ? ` · until ${esc(slWhen(a.expires))}` : ''}</small></div>${withAct ? `<button class="btn sm" data-sl="seg" data-seg="cityhall">${icon('edit')} Change</button>` : ''}</div>`;
}
function slStoryRow(s) {
  const url = slSafeUrl(s.url);
  return `<a class="sl-story" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : ''}>${slOutletChip(s.outlet)}<div style="min-width:0"><div class="t">${esc(s.title)}</div>${s.dek ? `<div class="d">${esc(s.dek)}</div>` : ''}<div class="m">${s.breaking ? '<span class="brk">BREAKING</span>' : ''}<span>${esc(s.category || '')}</span>${s.place ? `<span>· ${esc(s.place)}</span>` : ''}${(s.impacts || []).length ? `<span>· moves ${esc(s.impacts.map(i => i.ticker).join(', '))}</span>` : ''}${s.satire ? '<span class="sl-parody">PARODY</span>' : ''}</div></div><div class="w">${esc(slAgo(s.ts))}<small>${esc(slWhen(s.ts))}</small></div></a>`;
}
function slMoversHTML(quotes, n = 4) {
  const q = quotes.filter(x => Number.isFinite(+x.changePct)); if (!q.length) return '<div class="sl-empty">No quotes in the feed.</div>';
  const up = q.slice().sort((a, b) => b.changePct - a.changePct).slice(0, n), dn = q.slice().sort((a, b) => a.changePct - b.changePct).slice(0, n).filter(x => !up.includes(x));
  const max = Math.max(1, ...q.map(x => Math.abs(x.changePct)));
  const row = x => `<div class="sl-mover"><span class="tk">${esc(x.ticker)}</span><span class="nm">${esc(x.name || '')}</span><span class="p ${slDir(x.changePct)}">${slPct(x.changePct)}</span><span class="bar"><i style="width:${Math.round(Math.abs(x.changePct) / max * 100)}%;background:${x.changePct >= 0 ? 'var(--good)' : 'var(--bad)'}"></i></span></div>`;
  return `<div class="sl-movers">${up.map(row).join('')}${dn.length ? `<div class="sl-k" style="margin-top:6px">FALLING</div>${dn.map(row).join('')}` : ''}</div>`;
}
function slRaceHTML(race) {
  if (!race) return '<div class="sl-empty"><b>No race in the feed yet</b>Forecasts appear here when the site’s politics desk publishes them.</div>';
  const f = race.forecast || {}; const pD = Number.isFinite(+f.winProbD) ? +f.winProbD : null;
  const tone = /D$/.test(f.rating || '') ? 'var(--sl-d)' : /R$/.test(f.rating || '') ? 'var(--sl-r)' : 'var(--amber)';
  const cands = (race.candidates || []).slice().sort((a, b) => (b.share || 0) - (a.share || 0));
  const name = c => { const o = slOfficialById(c.officialId); return `${esc(c.name || o?.name || c.officialId || '—')} ${slParody(o || { id: c.officialId })}`; };
  return `<div class="sl-race"><div class="rh"><b>${esc(race.office || race.id)}</b>${f.rating ? `<span class="rating" style="color:${tone}">${esc(f.rating.toUpperCase())}</span>` : ''}</div>
    <div class="sl-sub" style="margin-top:3px">${race.date ? esc(new Date(race.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) : ''}${race.status ? ` · ${esc(race.status.replace(/-/g, ' '))}` : ''}${Number.isFinite(+f.margin) ? (+f.margin === 0 ? ' · margin even' : ` · margin ${+f.margin > 0 ? 'D' : 'R'} +${Math.abs(+f.margin).toFixed(1)}`) : ''}</div>
    <div class="sl-cands">${cands.map(c => { const P = SL_PARTY[c.party] || SL_PARTY.I; return `<div class="sl-cand" style="--pc:${P.c}">${slPartyChip(c.party)}<span class="nm">${name(c)}</span><span class="sh">${Number.isFinite(+c.share) ? (+c.share).toFixed(1) + '%' : '—'}</span><span class="bar"><i style="width:${clamp(+c.share || 0, 0, 100)}%"></i></span></div>`; }).join('')}</div>
    ${pD != null ? `<div class="sl-prob" title="Chance of winning"><i style="width:${(pD * 100).toFixed(1)}%;background:var(--sl-d)"></i><i style="width:${((1 - pD) * 100).toFixed(1)}%;background:var(--sl-r)"></i></div><div class="sl-prob-l"><span>D ${(pD * 100).toFixed(0)}%</span><span>chance of winning</span><span>R ${((1 - pD) * 100).toFixed(0)}%</span></div>` : ''}
    ${(race.outlets || []).length ? `<div class="sl-outrate">${race.outlets.map(o => `<span title="${esc(o.note || '')}">${slOutletChip(o.outletId)}${esc(o.rating || '—')}</span>`).join('')}</div>` : ''}</div>`;
}
function slApprovalRow(o) {
  const P = SL_PARTY[o.party] || SL_PARTY.I; const ch = +o.approvalChange7d || 0;
  return `<div class="sl-off">${slPartyChip(o.party)}<div class="nm"><b>${esc(o.name)}</b> ${slParody(o)}<small>${esc(o.office || '')}</small></div><div class="sl-appbar" style="--pc:${P.c}"><span class="d ${slDir(ch)}">${ch ? `${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}` : '7d —'}</span><span class="n">${Number.isFinite(+o.approval) ? Math.round(o.approval) : '—'}</span><span class="trk"><i style="width:${clamp(+o.approval || 0, 0, 100)}%"></i></span></div></div>`;
}
function slQueueRow(p, { compact = false } = {}) {
  const o = p.officialId ? slOfficialById(p.officialId) : null; const q = slQuotes().find(x => x.ticker === p.ticker) || (SITE.review?.quotes || {})[p.ticker];
  const can = slCanWrite() && slHas('market.decide') !== false;
  return `<div class="sl-q"><div style="min-width:0"><div class="h">${esc(p.headline || 'Proposed market move')}</div><div class="m"><span class="sl-src ${esc(p.source || '')}">${esc((p.source || 'move').toUpperCase())}</span>${o ? `<span>${esc(o.name)} ${slParody(o)}</span>` : ''}<span class="ticker">${esc(p.ticker)}</span>${q ? `<span>${esc(q.name || '')}${Number.isFinite(+q.price) ? ` · ${(+q.price).toFixed(2)}` : ''}</span>` : ''}<span>${esc(slAgo(p.ts))}</span></div></div>
    <div class="acts"><span class="imp ${slDir(p.impact)}">${slPct((+p.impact || 0) * 100, 2)}</span>${compact ? '' : `<button class="btn sm primary" data-sl="q-approve" data-id="${esc(p.id)}" ${can ? '' : 'disabled'}>${icon('check')} Approve</button><button class="btn sm" data-sl="q-edit" data-id="${esc(p.id)}" ${can ? '' : 'disabled'}>${icon('edit')} Edit</button><button class="btn sm ghost" data-sl="q-reject" data-id="${esc(p.id)}" ${can ? '' : 'disabled'}>Reject</button>`}</div></div>`;
}
function slDashboardHTML() {
  const wait = slFeedState(); if (wait) return wait;
  const f = SITE.feed; const pol = f.politics || {}; const races = pol.races || []; const marquee = races.find(r => r.id === pol.marquee) || races.find(r => r.id === 'governor-new-a-2026') || races[0] || null;
  const offs = (pol.officials || []).filter(o => o.featured && !o.former).slice(0, 8); const queue = slQueue();
  const idx = f.market?.index || {}; const reg = f.registry || {};
  return `<div class="sl-grid">
    <div class="sl-col span2">
      ${f.alert ? slAlertHTML(f.alert) : ''}
      ${slPanel('ON THE SITE NOW · NEWSROOM', `${fmtInt(f.stories.length)} stories · <a class="rowlink" href="${esc(slReadBase())}/news" target="_blank" rel="noopener">/news</a>`, f.stories.length ? `<div class="sl-stories">${f.stories.slice(0, 9).map(slStoryRow).join('')}</div>` : '<div class="sl-empty">No stories yet.</div>')}
      ${slPanel('POLITICS', marquee ? 'the marquee race · approval of the featured officials' : 'approval of the featured officials', `<div class="grid cols-2" style="gap:16px">${slRaceHTML(marquee)}<div class="sl-offs" style="margin-top:0">${offs.length ? offs.map(slApprovalRow).join('') : '<div class="sl-empty">No officials in the feed.</div>'}</div></div><div class="sl-acts"><button class="btn sm" data-sl="seg" data-seg="cityhall">${icon('civic')} Approval ratings</button><a class="btn sm ghost" href="${esc(slReadBase())}/elections" target="_blank" rel="noopener">${icon('globe')} Elections on the site</a></div>`)}
    </div>
    <div class="sl-col">
      ${slPanel('NASE', `as of ${esc(slTime(f.asOf || f.now))}`, `<div class="sl-index"><span class="v">${Number.isFinite(+idx.value) ? (+idx.value).toFixed(2) : '—'}</span><span class="c ${slDir(idx.changePct)}">${slPct(idx.changePct)}</span><span class="sl-sub">composite · 24 h</span></div>${slMoversHTML(slQuotes())}`)}
      ${slPanel('MARKET QUEUE', queue.length ? `${queue.length} waiting` : 'clear', queue.length ? `<div class="sl-queue">${queue.slice(0, 3).map(p => slQueueRow(p, { compact: true })).join('')}</div><div class="sl-acts"><button class="btn sm primary" data-sl="seg" data-seg="market">${icon('biz')} Review ${plural(queue.length, 'move')}</button></div>` : '<div class="sl-empty"><b>Nothing waiting</b>Politicians’ market-moving posts above the auto-approve threshold wait here for City Hall.</div>')}
      ${slPanel('THE SQUARE', 'latest posts', (f.square || []).length ? `<div class="sl-posts">${f.square.slice(0, 4).map(p => `<div class="sl-post"><div class="who"><b>${esc(p.official?.name || p.who)}</b>${p.official ? `<span>${esc(p.official.handle || p.official.office || '')}</span>` : p.profession ? `<span>${esc(p.profession)}</span>` : ''}${p.parody ? '<span class="sl-parody">PARODY</span>' : ''}<span style="margin-left:auto">${esc(slAgo(p.ts))}</span></div>${esc(p.text)}</div>`).join('')}</div>` : '<div class="sl-empty">Quiet on the square.</div>')}
      ${slPanel('THE SITE’S REGISTRY', '', `<div class="sl-sub">reads <b>${esc(reg.source === 'registry-app' ? 'New A OS' : reg.source === 'uploaded' ? 'a desk upload' : reg.source === 'bundled' ? 'the bundled file' : '—')}</b>${reg.uploaded ? ` · ${esc(slAgo(reg.uploaded))}` : ''}${reg.ignored ? ` · <span style="color:var(--warn)">an older stored copy is ignored — Publish replaces it</span>` : ''}<br>fingerprint <b>${esc(slShort(reg.hash))}</b>${slLast() ? ` · ${slLast().hash === reg.hash ? '<span class="sl-up">matches your last publish</span>' : '<span style="color:var(--warn)">differs from your last publish</span>'}` : ''}</div><div class="sl-acts"><button class="btn sm" data-sl="seg" data-seg="publish">${icon('up')} Publish</button></div>`)}
    </div>
  </div>`;
}
function slPublishHTML() {
  const base = slBase(); const last = slLast(base); const info = SITE.conn.info; const loc = SITE.local; const c = slCfg(); const A = SITE.auto;
  const can = slCanWrite();
  const cmp = (cls, k, v, s) => `<div class="${cls}"><div class="sl-k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const siteState = !info?.hash ? ['', '—', base ? 'not read yet — test the connection' : 'no site linked'] : last && info.hash === last.hash ? ['ok', `${esc(slShort(info.hash))} ✓`, 'the site has your last publish'] : last ? ['wn', esc(slShort(info.hash)), info.source === 'bundled' ? 'the site went back to its bundled file' : 'changed outside this browser since'] : ['', esc(slShort(info.hash)), info.source === 'registry-app' ? 'published from New A OS elsewhere' : info.source === 'bundled' ? 'the bundled file' : 'a desk upload'];
  const localState = !last ? ['', 'not compared', 'publish once — later edits are counted here'] : loc?.inStep ? ['ok', 'in step', 'nothing new since the last publish'] : loc?.diff ? ['wn', plural(loc.diff.total, 'change'), 'since the last publish'] : ['', '…', 'checking'];
  const autoLine = !c.auto ? 'Off — publish by hand.' : A.held ? A.held.message : SITE.publishing ? 'Publishing now…' : A.due ? `${A.error ? `Last try failed (${A.error}) — retrying` : 'Edits settled — publishing'} in about ${Math.max(1, Math.ceil((A.due - Date.now()) / 1000))} s.` : 'On — about 45 seconds after edits stop, changes go to the site. Waits when offline and backs off on errors.';
  const photosHere = SITE.localPhotos?.count; const P = SITE.photos; const onSite = P && SITE.localPhotos ? [...SITE.localPhotos.ids].filter(id => P.have[id]).length : null;
  const { all: bms, active: bm } = slBasemapList();
  const log = SITE.log;
  return `<div class="sl-grid">
    <div class="sl-col span2">
      ${slPanel('PUBLISH THE REGISTRY', base ? esc(slHost(base)) : 'no site linked', `<div class="sl-pubhead"><div class="dim" style="font-size:13px;line-height:1.55">Sends this registry — every building, road, border, business, official and chronicle entry — to <b>POST /api/registry</b>. The site checks it, keeps its desk edits on top, logs what changed and switches its pages over. The news inbox, world scans, the sandbox and app settings stay on this computer; photos travel separately.</div><button class="btn primary" data-sl="publish" ${SITE.publishing ? 'disabled' : ''}>${icon('up')} ${SITE.publishing ? 'Publishing…' : 'Publish to site'}</button></div>
        <div class="sl-cmp">${cmp(localState[0], 'THIS COMPUTER', esc(localState[1]), `${fmtInt(activeBuildings().length)} standing · ${fmtInt(histBuildings().length)} historical · ${esc(localState[2])}`)}${cmp(last ? '' : '', 'LAST PUBLISH', last ? esc(slWhen(last.at)) : 'never', last ? `${esc(last.reason)} · ${esc(slShort(last.hash))}${last.bytes ? ` · ${slBytes(last.bytes)}${last.gz ? ` (${slBytes(last.gz)} sent)` : ''}` : ''}` : 'from this browser to this site')}${cmp(siteState[0], 'THE SITE', siteState[1], esc(siteState[2]))}</div>
        ${loc?.diff?.total ? `<div class="sl-changes">${slDiffChips(loc.diff)}</div>` : ''}
        ${last?.summary ? `<div class="desc-line" style="margin-top:10px">Last publish: ${esc(last.summary)}</div>` : ''}
        <div class="sl-auto"><div><div class="t">Auto-publish while open ${c.auto ? `<span class="mk ${A.held && A.held.kind !== 'first' ? 'warn' : 'good'}">${A.held && A.held.kind !== 'first' ? 'PAUSED' : 'ON'}</span>` : ''}</div><div class="d">${esc(autoLine)}</div></div><label class="switch"><input type="checkbox" data-sl-auto ${c.auto ? 'checked' : ''} ${base ? '' : 'disabled'} aria-label="Auto-publish while open"></label></div>
        <div class="sl-acts"><button class="btn sm ghost" data-sl="revert" ${can ? '' : 'disabled'} title="The site goes back to its bundled data/Registry.json; desk edits stay">${icon('undo')} Revert the site to its bundled registry…</button></div>`)}
      ${slPanel('SYNC LOG', 'what the site recorded', !can ? '<div class="sl-empty">Connect with the access key to read the site’s sync log.</div>' : SITE.logError ? `<div class="sl-empty">${esc(SITE.logError.message)}</div>` : !log ? '<div class="sl-empty">Reading the log…</div>' : !log.length ? '<div class="sl-empty"><b>Nothing logged yet</b>Every publish, photo batch, basemap and revert lands here.</div>' : `<div class="sl-log">${log.map(e => `<div class="sl-le"><div class="tm">${esc(slTime(e.ts))}<small>${esc(slDay(e.ts))}</small></div><div><div class="sm">${esc(e.summary || e.kind)}</div><div class="mt"><span class="mk ${e.kind === 'reset' ? 'warn' : e.kind === 'push' ? 'info' : 'good'}">${esc(String(e.kind || '').toUpperCase())}</span>${e.reason ? `<span>${esc(e.reason)}</span>` : ''}${e.via ? `<span>· ${esc(e.via)}</span>` : ''}${e.version ? `<span>· ${esc(e.app || '')} ${esc(e.version)}</span>` : ''}${e.hash ? `<span>· ${esc(slShort(e.hash))}</span>` : ''}${e.unchanged ? '<span>· unchanged</span>' : ''}</div></div></div>`).join('')}</div><div class="sl-acts"><button class="btn sm ghost" data-sl="log-refresh">${icon('redo')} Refresh</button></div>`)}
    </div>
    <div class="sl-col">
      ${slPanel('PHOTOS', 'buildings · chronicle', `<div class="sl-photo-stats"><div><b>${fmtInt(photosHere)}</b><span>here</span></div><div><b>${onSite == null ? '—' : fmtInt(onSite)}</b><span>on the site</span></div><div><b>${P ? '…' : '—'}</b><span id="sl-ph-pending">to send</span></div></div><p class="desc-line" style="margin-top:10px">Only what the site lacks, or holds an older copy of. Resized here (≤ 1400 px, JPEG, under 900 KB), ${SL_PHOTO_BATCH} at a time, with a progress bar and cancel.</p><div class="sl-acts"><button class="btn primary sm" data-sl="photos" ${can ? '' : 'disabled'}>${icon('img')} Push photos…</button></div>`)}
      ${slPanel('BASEMAP', bms.length ? plural(bms.length, 'image') : 'none yet', `<div class="sl-bm"><div class="th" id="sl-bm-mini">${icon('sat')}</div><div class="i">${bm ? `<b>${esc(bm.name)}</b><br>X ${fmtInt(bm.x)} · Z ${fmtInt(bm.z)} · ${fmtInt((bm.w || 0) * (bm.scale || 1))} × ${fmtInt((bm.h || 0) * (bm.scale || 1))} blocks` : 'Add a render on the map (Satellite chip) or under Vault → Basemap.'}${P?.basemap ? `<br><span class="sl-up">On the site</span> <span class="muted">· ${esc(slWhen(P.basemap.ts))}</span>` : P ? '<br><span class="muted">The site has no basemap yet.</span>' : ''}</div></div><div class="sl-acts"><button class="btn sm" data-sl="basemap" ${can && bm ? '' : 'disabled'}>${icon('sat')} Push basemap…</button></div>`)}
    </div>
  </div>`;
}
/* ---- newsroom ---- */
function slPlaceOptions(sel) {
  const core = S.districts.filter(d => d.core), other = S.districts.filter(d => !d.core), regs = S.regions.filter(r => r.id !== 'union');
  const o = (id, name) => `<option value="${esc(id)}" ${sel === id ? 'selected' : ''}>${esc(name)}</option>`;
  return `<option value="">Citywide · no single place</option>${core.length ? `<optgroup label="Boroughs">${core.map(d => o(d.id, d.name)).join('')}</optgroup>` : ''}${other.length ? `<optgroup label="Districts">${other.map(d => o(d.id, d.name)).join('')}</optgroup>` : ''}${regs.length ? `<optgroup label="States, cities & regions">${regs.map(r => o(r.id, r.name)).join('')}${S.regions.some(r => r.id === 'union') ? o('union', 'The Union (national)') : ''}</optgroup>` : ''}`;
}
function slPreviewHTML() {
  const F = SITE.form.story; const o = SL_OUTLET[F.outlet] || SL_OUTLET['press-office']; const place = F.place ? (districtById(F.place)?.name || regionById(F.place)?.name || '') : '';
  const paras = String(F.body || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const imp = (F.impacts || []).filter(i => i.ticker && Number(i.pct)); const apr = (F.approvals || []).filter(a => a.id && Number(a.delta));
  return `<div class="sl-preview" style="--oc:${o.color}"><div class="mast">${slOutletChip(o.id)}<span class="sl-sub">${esc(o.name)}</span><span class="cat">${esc((F.category || 'City Hall').toUpperCase())}</span></div><div class="bd">${F.breaking ? '<span class="brk">BREAKING</span>' : ''}<h3 class="${F.title ? '' : 'ph'}">${esc(F.title || 'Your headline')}</h3>${F.dek ? `<div class="dk">${esc(F.dek)}</div>` : ''}<div class="by">By ${esc(F.byline || o.name)}${place ? ` · ${esc(place)}` : ''} · just now</div>${paras.length ? `<div class="bp">${paras.slice(0, 3).map(p => `<p>${esc(truncate(p, 360))}</p>`).join('')}${paras.length > 3 ? `<p class="muted">+ ${paras.length - 3} more paragraph${paras.length - 3 === 1 ? '' : 's'}</p>` : ''}</div>` : ''}${imp.length || apr.length ? `<div class="fx">${imp.map(i => `<span class="${slDir(i.pct)}">${esc(i.ticker)} ${slPct(i.pct, 1)}</span>`).join('')}${apr.map(a => `<span class="${slDir(a.delta)}">${esc(slOfficialById(a.id)?.name || a.id)}${slParody(slOfficialById(a.id) || { id: a.id }) ? ' (parody)' : ''} ${+a.delta > 0 ? '+' : '−'}${Math.abs(+a.delta)} pts</span>`).join('')}</div>` : ''}</div></div>`;
}
function slNewsroomHTML() {
  const F = SITE.form.story; const can = slCanWrite(); const cats = Array.isArray(SITE.agent?.categories) && SITE.agent.categories.length ? SITE.agent.categories : SL_CATEGORIES;
  if (F.place && !districtById(F.place) && !regionById(F.place)) F.place = '';          // a place deleted since the draft was saved
  if (!SL_OUTLET[F.outlet]) F.outlet = 'press-office';
  const quotes = slQuotes(); const offs = slOfficials();
  const cnt = (v, max) => `<span class="sl-count ${String(v || '').length > max ? 'over' : ''}" data-sl-count="${max}">${String(v || '').length} / ${max}</span>`;
  const impRow = (im, i) => `<div class="sl-row"><select aria-label="Company" data-slf="story.impacts.${i}.ticker"><option value="">Company…</option>${quotes.map(q => `<option value="${esc(q.ticker)}" ${im.ticker === q.ticker ? 'selected' : ''}>${esc(q.ticker)} · ${esc(q.name || '')}</option>`).join('')}${im.ticker && !quotes.some(q => q.ticker === im.ticker) ? `<option value="${esc(im.ticker)}" selected>${esc(im.ticker)}</option>` : ''}</select><input type="number" step="0.5" min="-50" max="100" aria-label="Move in percent" placeholder="+3 %" value="${esc(im.pct ?? '')}" data-slf="story.impacts.${i}.pct"><button type="button" class="x" data-sl="imp-del" data-i="${i}" aria-label="Remove this company">${icon('x')}</button></div>`;
  const aprRow = (a, i) => `<div class="sl-row"><select aria-label="Official" data-slf="story.approvals.${i}.id"><option value="">Official…</option>${offs.map(o => `<option value="${esc(o.id)}" ${a.id === o.id ? 'selected' : ''}>${esc(o.name)} — ${esc(truncate(o.office || '', 38))}${(o.parody ?? o.real) ? ' (parody)' : ''}</option>`).join('')}${a.id && !offs.some(o => o.id === a.id) ? `<option value="${esc(a.id)}" selected>${esc(a.id)}</option>` : ''}</select><input type="number" step="0.5" min="-5" max="5" aria-label="Approval move in points" placeholder="+2 pts" value="${esc(a.delta ?? '')}" data-slf="story.approvals.${i}.delta"><button type="button" class="x" data-sl="apr-del" data-i="${i}" aria-label="Remove this official">${icon('x')}</button></div>`;
  return `<div class="sl-grid">
    <form class="panel hud sl-compose span2" data-sl-form="story" autocomplete="off" novalidate>
      <div class="panel-head"><h3>PUBLISH A STORY</h3><span class="note">live on /news at once · impacts price in over about two hours</span></div>
      ${can ? '' : `<div class="sl-unsupported" style="margin-bottom:12px"><b>Read only.</b> Connect with the access key to publish — the draft is kept in this browser meanwhile.</div>`}
      <div class="fsect"><h4>OUTLET &amp; PLACE</h4><div class="frow c3">
        <div class="f"><label for="sl-st-outlet">Outlet</label><select id="sl-st-outlet" data-slf="story.outlet">${SL_OUTLETS.map(o => `<option value="${o.id}" ${F.outlet === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>
        <div class="f"><label for="sl-st-cat">Section</label><select id="sl-st-cat" data-slf="story.category">${[...new Set([...cats, F.category].filter(Boolean))].map(c => `<option ${F.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="f"><label for="sl-st-place">About <span class="hint">borough · state · region</span></label><select id="sl-st-place" data-slf="story.place">${slPlaceOptions(F.place)}</select></div>
      </div></div>
      <div class="fsect"><h4>THE STORY</h4><div class="frow">
        <div class="f span"><label for="sl-st-title">Headline ${cnt(F.title, 200)}</label><input id="sl-st-title" data-slf="story.title" value="${esc(F.title)}" maxlength="240" placeholder="What happened, in one line" aria-required="true"></div>
        <div class="f span"><label for="sl-st-dek">Dek <span class="hint">the line under the headline</span> ${cnt(F.dek, 400)}</label><textarea id="sl-st-dek" data-slf="story.dek" rows="2" style="min-height:58px" placeholder="Why it matters, in a sentence or two">${esc(F.dek)}</textarea></div>
        <div class="f span"><label for="sl-st-body">Body <span class="hint">a blank line between paragraphs</span></label><textarea id="sl-st-body" data-slf="story.body" rows="9" placeholder="The story. Name buildings, streets and companies as they appear in the registry — the news inbox reads them back.">${esc(F.body)}</textarea></div>
        <div class="f"><label for="sl-st-by">Byline <span class="hint">empty = the outlet</span></label><input id="sl-st-by" data-slf="story.byline" value="${esc(F.byline)}" maxlength="120" placeholder="${esc(SL_OUTLET[F.outlet]?.name || 'Press Office')}"></div>
        <div class="f"><label for="sl-st-tags">Tags <span class="hint">comma separated</span></label><input id="sl-st-tags" data-slf="story.tags" value="${esc(F.tags)}" placeholder="elections, transit"></div>
      </div>
      <div class="settings-row" style="border-bottom:0;padding-bottom:0"><div><div>Breaking</div><div class="d">Runs across the top of every page of the site for 36 hours</div></div><label class="switch"><input type="checkbox" data-slf="story.breaking" ${F.breaking ? 'checked' : ''} aria-label="Breaking"></label></div></div>
      <div class="fsect"><h4>MARKET IMPACTS</h4><div class="sl-rows">${(F.impacts || []).map(impRow).join('')}</div><div class="sl-acts" style="margin-top:8px"><button type="button" class="btn sm" data-sl="imp-add" ${quotes.length ? '' : 'disabled'}>${icon('plus')} Add a company</button><span class="desc-line">${quotes.length ? 'Percent moves (+3, −2.5) — the NASE keeps part of every shock and caps the total.' : 'Tickers arrive with the site’s feed.'}</span></div></div>
      <div class="fsect"><h4>APPROVAL IMPACTS</h4><div class="sl-rows">${(F.approvals || []).map(aprRow).join('')}</div><div class="sl-acts" style="margin-top:8px"><button type="button" class="btn sm" data-sl="apr-add" ${offs.length ? '' : 'disabled'}>${icon('plus')} Add an official</button><span class="desc-line">Points of approval, −5 to +5 — stories about a place also move its officials on their own.</span></div></div>
      <div class="sl-acts" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)"><button type="button" class="btn ghost" data-sl="story-clear">${icon('trash')} Clear</button><span style="flex:1"></span><span class="desc-line" id="sl-st-msg"></span><button class="btn primary" type="submit" ${can ? '' : 'disabled'}>${icon('news')} Publish story…</button></div>
    </form>
    <div class="sl-col">
      ${slPanel('PREVIEW', 'as the site will run it', `<div id="sl-preview">${slPreviewHTML()}</div>`)}
      ${slPanel('LATEST ON THE SITE', SITE.feed ? `${fmtInt(SITE.feed.stories.length)} stories` : '', SITE.feed ? `<div class="sl-stories">${SITE.feed.stories.slice(0, 6).map(slStoryRow).join('')}</div>` : `<div class="sl-empty">${SITE.feedError ? esc(SITE.feedError.message) : 'Reading the site…'}</div>`)}
    </div>
  </div>`;
}
/* ---- City Hall: alert · official posts · approvals ---- */
function slCityHallHTML() {
  const can = slCanWrite(); const A = SITE.form.alert; const Pst = SITE.form.post; const cur = SITE.feed?.alert || null;
  const leaders = (SITE.agent?.leaders || []).length ? SITE.agent.leaders : slOfficials().filter(o => SL_REAL_IDS.has(o.id)).map(o => ({ id: o.id, name: o.name, office: o.office, former: o.former }));
  if (![...leaders.map(l => l.id), 'cityhall'].includes(Pst.leaderId)) Pst.leaderId = leaders[0]?.id || 'cityhall';   // what the select shows is what gets posted
  const realOf = id => slOfficials().find(o => o.id === id)?.parody ?? slOfficials().find(o => o.id === id)?.real ?? SL_REAL_IDS.has(id);
  const pol = SITE.feed?.politics || {}; const races = pol.races || []; const marquee = races.find(r => r.id === pol.marquee) || races[0] || null;
  const hasPol = slHas('politics.setApproval'); const hasNudge = slHas('politics.nudge');
  const all = slOfficials(); const fl = SITE.apprFilter; const q = norm(SITE.apprQ);
  const inNewA = o => ['new-a', 'new-a-city'].includes(o.jurisdictionId) || S.districts.some(d => d.id === o.jurisdictionId && d.core);
  const rows = all.filter(o => (fl === 'featured' ? o.featured : fl === 'new-a' ? inNewA(o) : fl === 'union' ? !inNewA(o) : true) && (!q || norm(`${o.name} ${o.office} ${o.id}`).includes(q)));
  const baseKnown = all.some(o => o.approvalBase != null);
  const polNote = hasPol === false ? `<div class="sl-unsupported" style="margin-bottom:12px"><b>Approvals are read-only on this site.</b> Its politics desk (politics.setApproval · politics.nudge) arrives with the next site update.</div>` : '';
  return `<div class="sl-grid">
    <form class="panel hud" data-sl-form="alert" autocomplete="off"><div class="panel-head"><h3>CITY ALERT</h3><span class="note">civic bar + banner on every page</span></div>
      ${cur ? slAlertHTML(cur, false) : `<div class="sl-alert normal"><span class="lv">NORMAL</span><div class="tx">No alert in effect.</div></div>`}
      <div class="frow" style="margin-top:4px"><div class="f"><label for="sl-al-level">Level</label><select id="sl-al-level" data-slf="alert.level">${SL_ALERTS.filter(x => x[0] !== 'normal').map(([id, l]) => `<option value="${id}" ${A.level === id ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="f"><label for="sl-al-hours">For <span class="hint">hours · 1–168</span></label><input id="sl-al-hours" type="number" min="1" max="168" step="1" data-slf="alert.hours" value="${esc(A.hours)}"></div>
      <div class="f span"><label for="sl-al-text">Message <span class="sl-count" data-sl-count="200">${String(A.text || '').length} / 200</span></label><input id="sl-al-text" data-slf="alert.text" maxlength="200" value="${esc(A.text)}" placeholder="Metro delays on the Man A line — allow extra time"></div></div>
      <div class="sl-acts"><button class="btn primary sm" type="submit" ${can ? '' : 'disabled'}>${icon('warn')} Set alert…</button>${cur ? `<button class="btn sm ghost" type="button" data-sl="alert-clear" ${can ? '' : 'disabled'}>Clear alert…</button>` : ''}</div></form>
    <form class="panel hud" data-sl-form="post" autocomplete="off"><div class="panel-head"><h3>POST AS AN OFFICIAL</h3><span class="note">the Public Square</span></div>
      <div class="frow"><div class="f span"><label for="sl-po-who">Account</label><select id="sl-po-who" data-slf="post.leaderId">${leaders.map(l => `<option value="${esc(l.id)}" ${Pst.leaderId === l.id ? 'selected' : ''}>${esc(l.name)} — ${esc(l.office || '')}${realOf(l.id) ? ' (parody)' : ''}</option>`).join('')}<option value="cityhall" ${Pst.leaderId === 'cityhall' ? 'selected' : ''}>City Hall — Press Office</option></select></div>
      <div class="f span"><label for="sl-po-text">Post <span class="sl-count" data-sl-count="280">${String(Pst.text || '').length} / 280</span></label><textarea id="sl-po-text" data-slf="post.text" rows="4" maxlength="280" placeholder="What the account says">${esc(Pst.text)}</textarea></div></div>
      <div class="desc-line" style="margin-top:8px">Real officials appear on the site as parody villagers — their posts are labelled as fiction there.</div>
      <div class="sl-acts"><button class="btn primary sm" type="submit" ${can ? '' : 'disabled'}>${icon('chat')} Post…</button></div></form>
    ${slPanel('RACE WATCH', marquee ? esc(marquee.id) : '', slRaceHTML(marquee))}
    ${slPanel('APPROVAL RATINGS', `${fmtInt(all.length)} officials${SITE.politics ? '' : ' · from the feed'}`, `${polNote}
      <div class="sl-filter"><div class="seg" role="group" aria-label="Which officials">${[['featured', 'Featured'], ['new-a', 'New A'], ['union', 'Union & states'], ['all', 'All']].map(([id, l]) => `<button type="button" data-sl="appr-filter" data-v="${id}" aria-pressed="${fl === id}">${l}</button>`).join('')}</div><label class="field"><span>Find</span><input data-sl-q="appr" value="${esc(SITE.apprQ)}" placeholder="name or office" style="width:170px" aria-label="Find an official"></label><span class="sl-sub">${rows.length} shown</span></div>
      ${rows.length ? `<div class="sl-tblwrap"><table class="sl-tbl"><thead><tr><th scope="col">OFFICIAL</th><th scope="col">PARTY</th><th scope="col">APPROVAL</th><th scope="col">7 DAYS</th>${baseKnown ? '<th scope="col">BASE</th>' : ''}<th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows.map(o => { const P = SL_PARTY[o.party] || SL_PARTY.I; const ch = +o.approvalChange7d || 0; return `<tr><td class="nm"><b>${esc(o.name)}</b> ${slParody(o)}${o.former ? ' <span class="mk">FORMER</span>' : ''}<small>${esc(o.office || '')}</small></td><td>${slPartyChip(o.party)}</td><td class="ap"><div class="sl-appbar" style="--pc:${P.c}"><span class="d"></span><span class="n">${Number.isFinite(+o.approval) ? Math.round(o.approval) : '—'}</span><span class="trk"><i style="width:${clamp(+o.approval || 0, 0, 100)}%"></i></span></div></td><td class="num ${slDir(ch)}">${ch ? `${ch > 0 ? '+' : '−'}${Math.abs(ch).toFixed(1)}` : '—'}</td>${baseKnown ? `<td class="num">${o.approvalBase != null ? esc(String(o.approvalBase)) : '—'}</td>` : ''}<td class="acts"><button class="btn sm" data-sl="appr-base" data-id="${esc(o.id)}" ${can && hasPol !== false ? '' : 'disabled'}>Set base…</button><button class="btn sm ghost" data-sl="appr-nudge" data-id="${esc(o.id)}" ${can && hasNudge !== false ? '' : 'disabled'}>Nudge…</button></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="sl-empty">${all.length ? 'No official matches.' : SITE.feed ? 'The site lists no officials yet.' : 'Reading the site…'}</div>`}
      <div class="desc-line" style="margin-top:10px">Base is where a rating rests before the news moves it (5–95). A nudge is a one-off move of up to ±10 points that fades like a news story.</div>`, 'span3')}
  </div>`;
}
/* ---- market review queue ---- */
function slMarketHTML() {
  const queue = slQueue(); const can = slCanWrite(); const has = slHas('market.decide'); const R = SITE.review; const s = R?.settings;
  const decisions = (R?.decisions || []).slice(0, 8);
  return `<div class="sl-grid">
    <div class="sl-col span2">
      ${slPanel('REVIEW QUEUE', queue.length ? `${plural(queue.length, 'move')} waiting` : 'clear', `${has === false ? `<div class="sl-unsupported" style="margin-bottom:12px"><b>The review queue is read-only on this site.</b> Its market desk (market.decide) arrives with the next site update.</div>` : ''}${queue.length ? `<div class="sl-queue">${queue.map(p => slQueueRow(p)).join('')}</div>` : `<div class="sl-empty"><b>Nothing waiting</b>When a politician’s post would move a stock by more than the auto-approve threshold, it waits here: approve it, edit the size, or reject it.</div>`}${can ? '' : '<div class="desc-line" style="margin-top:8px">Connect with the access key to decide.</div>'}`)}
      ${decisions.length ? slPanel('RECENT DECISIONS', '', `<div class="sl-log">${decisions.map(d => `<div class="sl-le"><div class="tm">${esc(slTime(d.ts))}<small>${esc(slDay(d.ts))}</small></div><div><div class="sm">${esc(d.headline || d.id)}</div><div class="mt"><span class="mk ${d.decision === 'approve' ? 'good' : 'bad'}">${esc(String(d.decision || '').toUpperCase())}</span><span class="ticker">${esc(d.ticker || '')}</span><span class="${slDir(d.impact)}">${slPct((+d.impact || 0) * 100)}</span>${d.by ? `<span>· ${esc(d.by)}</span>` : ''}</div></div></div>`).join('')}</div>`) : ''}
    </div>
    <div class="sl-col">
      ${slPanel('NASE', SITE.feed ? `as of ${esc(slTime(SITE.feed.asOf || SITE.feed.now))}` : '', SITE.feed ? `<div class="sl-index"><span class="v">${Number.isFinite(+SITE.feed.market?.index?.value) ? (+SITE.feed.market.index.value).toFixed(2) : '—'}</span><span class="c ${slDir(SITE.feed.market?.index?.changePct)}">${slPct(SITE.feed.market?.index?.changePct)}</span></div>${slMoversHTML(slQuotes(), 5)}` : `<div class="sl-empty">${SITE.feedError ? esc(SITE.feedError.message) : 'Reading the site…'}</div>`)}
      ${slPanel('HOW THE QUEUE WORKS', '', `<div class="dim" style="font-size:12.5px;line-height:1.55">Politicians’ posts can move a stock by at most ±1.5 %. Moves up to the auto-approve threshold${s?.autoApproveMax != null ? ` (<b>${slPct(s.autoApproveMax * 100, 2)}</b>)` : ''} apply on their own; bigger ones wait for City Hall. Approving writes a real market event; an edit changes its size first.${s?.politicianMoves ? ` Mode: <b>${esc(s.politicianMoves)}</b>.` : ''}</div>`)}
    </div>
  </div>`;
}

/* ---- painting without losing the field the cursor is in ---- */
function slPaint(parts) {
  if (UI.nav !== 'site') return; const root = $('#sl-root'); if (!root) return;
  const map = { head: slHeadHTML, conn: slConnHTML, tiles: slTilesHTML, segbar: slSegbarHTML, body: slBodyHTML };
  const want = (parts || ['head', 'conn', 'tiles', 'segbar', 'body']).filter(Boolean);
  const act = document.activeElement;
  const typing = act && (act.tagName === 'TEXTAREA' || act.tagName === 'SELECT' || (act.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(act.type)));
  const refocus = act && act !== document.body ? (act.id ? '#' + act.id : act.matches('[data-sl-auto]') ? '[data-sl-auto]' : act.dataset?.sl ? `[data-sl="${act.dataset.sl}"]${act.dataset.seg ? `[data-seg="${act.dataset.seg}"]` : ''}${act.dataset.id ? `[data-id="${CSS.escape(act.dataset.id)}"]` : ''}` : null) : null;
  let moved = false;
  for (const p of want) {
    const el = $('#sl-' + p); if (!el || !map[p]) continue;
    if (typing && el.contains(act)) continue;                                   // never yank a field from under the cursor
    if (act && el.contains(act)) moved = true;
    const tmp = document.createElement('div'); tmp.innerHTML = map[p](); const next = tmp.firstElementChild; if (next) el.replaceWith(next);
  }
  if (moved && refocus) { try { $(refocus)?.focus({ preventScroll: true }); } catch { /* a selector we could not rebuild */ } }
  slPaintBasemapThumb(); slPhotoPendingPaint(); if (want.includes('segbar')) slReveal($('.sl-segbar .seg'));
}
async function slPaintBasemapThumb() {
  const el = $('#sl-bm-mini'); if (!el || el.dataset.done) return; el.dataset.done = '1';
  const { active } = slBasemapList(); if (!active) return;
  const img = BASEMAP_IMG.get(active.id); if (img?.src) { el.style.backgroundImage = `url("${img.src}")`; el.innerHTML = ''; return; }
  const blob = await slBasemapBlob(active); if (blob && $('#sl-bm-mini') === el) { el.style.backgroundImage = `url("${URL.createObjectURL(blob)}")`; el.innerHTML = ''; }
}
/* sideways-scrolling bars on phones (the section rail, the Site link sections): keep the current one in view, fade the edges that hide more */
function slReveal(box) {
  if (!box) return;
  if (!box.dataset.slReveal) { box.dataset.slReveal = '1'; box.addEventListener('scroll', () => slEdgeFade(box), { passive: true }); }
  const sel = box.querySelector('[aria-selected="true"],[aria-pressed="true"]');
  if (sel && box.scrollWidth > box.clientWidth + 2) { const b = box.getBoundingClientRect(), s = sel.getBoundingClientRect(); if (s.left < b.left) box.scrollLeft -= b.left - s.left + 12; else if (s.right > b.right) box.scrollLeft += s.right - b.right + 12; }
  slEdgeFade(box);
}
function slEdgeFade(box) { const over = box.scrollWidth > box.clientWidth + 2; box.classList.toggle('sl-more-l', over && box.scrollLeft > 2); box.classList.toggle('sl-more-r', over && box.scrollLeft + box.clientWidth < box.scrollWidth - 2); }
window.addEventListener('resize', debounce(() => { slReveal($('#tabs')); slReveal($('.sl-segbar .seg')); }, 150));
function slAfterRender() {
  slReveal($('#tabs')); slReveal($('.sl-segbar .seg'));
  if (UI.nav === 'site') { if (!SITE.entered) { SITE.entered = true; slEnter(); } if (!SITE.poll) SITE.poll = setInterval(slPollTick, SL_POLL_MS); slPaintBasemapThumb(); slPhotoPendingPaint(); }
  else { SITE.entered = false; if (SITE.poll) { clearInterval(SITE.poll); SITE.poll = null; } }
}
function slEnter() {
  const base = slBase();
  slLocalPhotos().then(() => slPaint(['tiles'])).catch(() => {});
  if (!base && !SITE.preview) { slLocalCheck(); return; }
  if (base && (!SITE.conn.at || Date.now() - SITE.conn.at > 120e3 || SITE.conn.base !== base) && SITE.conn.state !== 'checking') slTest().then(() => slLoadPoliticsIfAny()).catch(() => {});
  else { if (SITE.conn.state === 'ok') { slLoadReview().then(() => slPaint(['tiles', 'segbar', 'body'])).catch(() => {}); if (SITE.seg === 'publish') slLoadLog().catch(() => {}); } slLoadPoliticsIfAny(); }
  slLoadFeed().then(() => slPaint(['tiles', 'segbar', 'body'])).catch(() => slPaint(['tiles', 'segbar', 'body']));
  if (base) slLoadPhotos().then(() => { slPaint(['tiles']); if (SITE.seg === 'publish') slPaint(['body']); });
  slLocalCheck();
}
/* /api/politics only when the site has the politics desk (or before we know) — no needless 404s */
function slLoadPoliticsIfAny() { if (slHas('politics.setApproval') === false) return Promise.resolve(null); return slLoadPolitics().then(p => { if (p && ['cityhall', 'newsroom', 'dashboard'].includes(SITE.seg)) slPaint(['body']); return p; }); }
async function slPhotoPendingPaint() {
  const el = $('#sl-ph-pending'); if (!el || !SITE.photos) return;
  const fresh = SITE.localPhotos?.list && SITE.localPhotos.stamp === S.meta.updated;
  const local = fresh ? SITE.localPhotos.list : await slLocalPhotos(); const n = slPhotoPending(local, SITE.photos.have).length;
  if (!fresh) slPaint(['tiles']);
  const b = el.previousElementSibling; if (b && $('#sl-ph-pending') === el) { b.textContent = fmtInt(n); b.style.color = n ? 'var(--amber)' : 'var(--good)'; }
}
async function slPollTick() {
  if (UI.nav !== 'site' || document.visibilityState !== 'visible' || (!slBase() && !SITE.preview)) return;
  try { const { changed } = await slLoadFeed(); slPaint(['tiles', 'segbar', changed && SITE.seg === 'dashboard' ? 'body' : null]); } catch { slPaint(['segbar']); }
}

/* ---- forms ---- */
function slFormSet(path, value) {
  const parts = path.split('.'); let o = SITE.form;
  for (let i = 0; i < parts.length - 1; i++) { const k = parts[i]; if (o[k] == null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {}; o = o[k]; }
  o[parts[parts.length - 1]] = value;
}
const slSaveDraft = debounce(() => { const F = SITE.form.story; const empty = !F.title && !F.dek && !F.body && !(F.impacts || []).length && !(F.approvals || []).length; slSetCfg({ draft: empty ? null : F }); }, 400);
function slStoryPayload() {
  const F = SITE.form.story; const o = SL_OUTLET[F.outlet] ? F.outlet : 'press-office';
  const body = String(F.body || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).slice(0, 60);
  const place = F.place || ''; const borough = place && districtById(place)?.core ? place : '';
  const impacts = (F.impacts || []).filter(i => i.ticker && Number(i.pct)).map(i => ({ ticker: String(i.ticker).toUpperCase(), impact: clamp(Number(i.pct), -50, 100) / 100 }));
  const seen = new Set(); const approvals = (F.approvals || []).filter(a => a.id && Number(a.delta) && !seen.has(a.id) && seen.add(a.id)).map(a => ({ id: a.id, delta: Math.round(clamp(Number(a.delta), -5, 5) * 10) / 10 }));
  const tags = String(F.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
  return { title: String(F.title || '').trim(), dek: String(F.dek || '').trim(), body, category: F.category || 'City Hall', outlet: o, byline: String(F.byline || '').trim() || SL_OUTLET[o].name, region: place, borough, breaking: !!F.breaking, tags, impacts, approvals };
}
async function slSubmitStory() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const p = slStoryPayload(); const msg = $('#sl-st-msg');
  const paraCount = String(SITE.form.story.body || '').split(/\n\s*\n/).filter(x => x.trim()).length;
  const longPara = p.body.find(x => x.length > 4000);
  const problem = !p.title ? 'A headline is required' : p.title.length > 200 ? 'The headline is over 200 characters' : !p.body.length ? 'The story needs a body' : p.dek.length > 400 ? 'The dek is over 400 characters' : paraCount > 60 ? `The site keeps 60 paragraphs and this has ${paraCount} — merge some` : longPara ? 'One paragraph is over 4,000 characters — split it' : null;
  if (problem) { if (msg) { msg.textContent = problem; msg.style.color = 'var(--bad)'; } toast(problem, 'warn'); ($(!p.title || p.title.length > 200 ? '#sl-st-title' : p.dek.length > 400 ? '#sl-st-dek' : '#sl-st-body'))?.focus(); return; }
  const o = SL_OUTLET[p.outlet]; const place = p.region ? (districtById(p.region)?.name || regionById(p.region)?.name || p.region) : 'citywide';
  const r = await confirmDialog({ title: 'Publish this story to the site?', cls: '',
    body: `<p style="margin-top:12px"><b>${esc(p.title)}</b></p><p class="muted" style="font-size:12.5px">${esc(o.name)} · ${esc(p.category)} · ${esc(place)} · ${plural(p.body.length, 'paragraph')}${p.breaking ? ' · <b style="color:var(--bad)">breaking for 36 hours on every page</b>' : ''}</p>${p.impacts.length ? `<p style="font-size:12.5px">Moves ${p.impacts.map(i => `<b>${esc(i.ticker)}</b> ${slPct(i.impact * 100, 1)}`).join(', ')} on the NASE.</p>` : ''}${p.approvals.length ? `<p style="font-size:12.5px">Approval: ${p.approvals.map(a => `<b>${esc(slOfficialById(a.id)?.name || a.id)}</b>${slParody(slOfficialById(a.id) || { id: a.id }) ? ' <span class="sl-parody">PARODY</span>' : ''} ${a.delta > 0 ? '+' : '−'}${Math.abs(a.delta)} pts`).join(', ')}.</p>` : ''}<p class="muted" style="font-size:12px">It goes live on ${esc(slHost())}/news straight away; the desk can edit or delete it later.</p>`,
    ok: 'Publish story' });
  if (r !== 'ok') return;
  try {
    const d = await slAction('story', p); const st = d.story || {};
    const url = st.slug ? `${slBase()}/news/${encodeURIComponent(st.slug)}` : `${slBase()}/news`;
    toast(`Published — “${truncate(p.title, 60)}” is live`, 'good', { label: 'OPEN', fn: () => window.open(url, '_blank', 'noopener') });
    const keep = { outlet: p.outlet, category: p.category, place: SITE.form.story.place };
    SITE.form.story = { ...SL_STORY_BLANK(), ...keep }; slSetCfg({ draft: null });
    slPaint(['body']); slLoadFeed({ force: true }).then(() => slPaint(['tiles', 'segbar', 'body'])).catch(() => {});
  } catch (e) { toast('Story not published: ' + e.message, 'bad'); if (msg) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; } }
}
async function slSubmitAlert() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const A = SITE.form.alert; const text = String(A.text || '').trim(); const hours = clamp(Math.round(Number(A.hours) || 12), 1, 168); const level = SL_ALERTS.some(x => x[0] === A.level) && A.level !== 'normal' ? A.level : 'advisory';
  if (!text) { toast('Write the alert message first', 'warn'); $('#sl-al-text')?.focus(); return; }
  const r = await confirmDialog({ title: `Set a ${level} alert?`, body: `<div class="sl-alert ${level}" style="margin-top:12px"><span class="lv">${level.toUpperCase()}</span><div class="tx">${esc(text)}<small>for ${plural(hours, 'hour')} · until ${esc(slWhen(Date.now() + hours * 3600e3))}</small></div></div><p class="muted" style="font-size:12.5px">It shows in the civic bar and as a banner on every page of the site.</p>`, ok: 'Set alert', danger: level === 'emergency' });
  if (r !== 'ok') return;
  try { await slAction('alert', { level, text, hours }); toast(`${level.charAt(0).toUpperCase() + level.slice(1)} alert is live on the site`, 'good'); SITE.form.alert.text = ''; await slLoadFeed({ force: true }).catch(() => {}); slPaint(['tiles', 'segbar', 'body']); }
  catch (e) { toast('Alert not set: ' + e.message, 'bad'); }
}
async function slClearAlert() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const r = await confirmDialog({ title: 'Clear the city alert?', body: '<p>The banner and the civic-bar notice disappear from every page of the site.</p>', ok: 'Clear alert' });
  if (r !== 'ok') return;
  try { await slAction('alert', { level: 'normal' }); toast('Alert cleared — the site is back to normal', 'good'); await slLoadFeed({ force: true }).catch(() => {}); slPaint(['tiles', 'segbar', 'body']); }
  catch (e) { toast('Alert not cleared: ' + e.message, 'bad'); }
}
async function slSubmitPost() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const P = SITE.form.post; const text = String(P.text || '').trim(); if (!text) { toast('Write the post first', 'warn'); $('#sl-po-text')?.focus(); return; }
  if (text.length > 280) { toast('A post is at most 280 characters', 'warn'); return; }
  const who = P.leaderId === 'cityhall' ? { name: 'City Hall', office: 'Press Office' } : (SITE.agent?.leaders || []).find(l => l.id === P.leaderId) || slOfficialById(P.leaderId) || { name: P.leaderId };
  const real = P.leaderId !== 'cityhall' && (slOfficialById(P.leaderId)?.parody ?? slOfficialById(P.leaderId)?.real ?? SL_REAL_IDS.has(P.leaderId));
  const r = await confirmDialog({ title: `Post as ${who.name}?`, body: `<div class="sl-post" style="margin-top:12px"><div class="who"><b>${esc(who.name)}</b><span>${esc(who.handle || who.office || '')}</span>${real ? '<span class="sl-parody">PARODY</span>' : ''}</div>${esc(text)}</div><p class="muted" style="font-size:12.5px">It appears on the Public Square right away${real ? ', labelled as a parody account' : ''}.</p>`, ok: 'Post' });
  if (r !== 'ok') return;
  try { await slAction('officialPost', { leaderId: P.leaderId, text }); toast(`Posted as ${who.name}`, 'good'); SITE.form.post.text = ''; slPaint(['body']); slLoadFeed({ force: true }).catch(() => {}); }
  catch (e) { toast('Not posted: ' + e.message, 'bad'); }
}
function slNumberDialog({ title, kicker, body, label, value = '', min, max, step = 1, extra = '', ok = 'Save' }) {
  return new Promise(res => {
    openModal({ title, kicker, cls: 'narrow', body: `${body}<div class="frow" style="margin-top:12px"><div class="f"><label for="sl-nd-v">${esc(label)}</label><input id="sl-nd-v" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value)}"></div>${extra}</div><div class="f err" id="sl-nd-err" style="margin-top:6px"></div>`,
      foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">${esc(ok)}</button>`,
      onOpen: m => {
        const done = r => { if (r !== 'ok') { closeModal(); res(null); return; } const v = num(m.querySelector('#sl-nd-v').value); if (v == null || v < min || v > max) { m.querySelector('#sl-nd-err').textContent = `Enter a number from ${min} to ${max}`; m.querySelector('#sl-nd-v').focus(); return; } const out = { value: v }; m.querySelectorAll('[data-nd]').forEach(x => out[x.dataset.nd] = x.type === 'checkbox' ? x.checked : x.value); closeModal(); res(out); };
        m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r));
        m.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done('ok'); } }));
        m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); m.parentElement.querySelector('.shade').onclick = () => done('cancel');
        setTimeout(() => { const i = m.querySelector('#sl-nd-v'); i?.focus(); i?.select(); }, 30);
      } });
  });
}
async function slApprovalBase(id) {
  const o = slOfficialById(id); if (!o) return;
  const r = await slNumberDialog({ title: `Base approval · ${o.name}`, kicker: 'POLITICS', body: `<p class="muted" style="font-size:12.5px;margin-top:12px">${esc(o.office || '')}${slParody(o) ? ' · parody villager' : ''}. Now <b>${Number.isFinite(+o.approval) ? Math.round(o.approval) : '—'}</b>${o.approvalBase != null ? `, resting at <b>${esc(String(o.approvalBase))}</b>` : ''}. The base is where the rating rests before stories and nudges move it.</p>`, label: 'Base approval (5–95)', value: o.approvalBase ?? (Number.isFinite(+o.approval) ? Math.round(o.approval) : 50), min: 5, max: 95, step: 0.5, ok: 'Set base' });
  if (!r) return;
  try { const d = await slAction('politics.setApproval', { id, base: r.value }); toast(`${o.name}: base approval ${d.approvalBase ?? r.value}`, 'good'); await slLoadPolitics(); slLoadFeed({ force: true }).then(() => slPaint(['body'])).catch(() => {}); slPaint(['body']); }
  catch (e) { toast(e.message, e.kind === 'unsupported' ? 'warn' : 'bad'); }
}
async function slApprovalNudge(id) {
  const o = slOfficialById(id); if (!o) return;
  const r = await slNumberDialog({ title: `Nudge approval · ${o.name}`, kicker: 'POLITICS', body: `<p class="muted" style="font-size:12.5px;margin-top:12px">A one-off move of up to ±10 points that fades like a news story (about three weeks). Now <b>${Number.isFinite(+o.approval) ? Math.round(o.approval) : '—'}</b>.</p>`, label: 'Points (−10 to +10)', value: '', min: -10, max: 10, step: 0.5, extra: `<div class="f span"><label for="sl-nd-why">Reason <span class="hint">shown with the move</span></label><input id="sl-nd-why" data-nd="reason" maxlength="140" placeholder="A good week at City Hall"></div>`, ok: 'Nudge' });
  if (!r) return; if (!r.value) { toast('A nudge needs a non-zero number of points', 'warn'); return; }
  try { await slAction('politics.nudge', { id, delta: r.value, reason: String(r.reason || '').trim() }); toast(`${o.name}: ${r.value > 0 ? '+' : '−'}${Math.abs(r.value)} points`, 'good'); await slLoadPolitics(); slLoadFeed({ force: true }).then(() => slPaint(['body'])).catch(() => {}); slPaint(['body']); }
  catch (e) { toast(e.message, e.kind === 'unsupported' ? 'warn' : 'bad'); }
}
async function slDecide(id, decision, { edit = false } = {}) {
  if (!slCanWrite()) { slNeedKey(); return; }
  const p = slQueue().find(x => x.id === id); if (!p) { toast('That move is no longer in the queue', 'warn'); return; }
  let impact = null;
  if (edit) {
    const r = await slNumberDialog({ title: `Edit the move · ${p.ticker}`, kicker: 'MARKET', body: `<p class="muted" style="font-size:12.5px;margin-top:12px">${esc(p.headline || '')}<br>Proposed ${slPct((+p.impact || 0) * 100)}. Politicians’ moves are capped at ±1.5 %.</p>`, label: 'Move in percent', value: Math.round((+p.impact || 0) * 10000) / 100, min: -1.5, max: 1.5, step: 0.05, ok: 'Approve with this size' });
    if (!r) return; if (!r.value) { toast('The move must be non-zero — reject it instead', 'warn'); return; }
    impact = Math.round(r.value * 100) / 10000;
  } else {
    const c = await confirmDialog({ title: decision === 'approve' ? `Approve ${slPct((+p.impact || 0) * 100)} on ${p.ticker}?` : `Reject the move on ${p.ticker}?`, body: `<p style="margin-top:12px">${esc(p.headline || '')}</p><p class="muted" style="font-size:12.5px">${decision === 'approve' ? 'The NASE prices it in now — it becomes a real market event.' : 'The move never reaches the market. The post itself stays on the square.'}</p>`, ok: decision === 'approve' ? 'Approve' : 'Reject', danger: decision === 'reject' });
    if (c !== 'ok') return;
  }
  try {
    const d = await slAction('market.decide', { id, decision: edit ? 'approve' : decision, ...(impact != null ? { impact } : {}), by: 'New A OS' });
    const res = (d.results || [])[0]; toast(edit || decision === 'approve' ? `${p.ticker} ${slPct((res?.impact ?? impact ?? p.impact) * 100)} approved — the market prices it in` : `Move on ${p.ticker} rejected`, 'good');
    if (SITE.review?.proposals) SITE.review.proposals = SITE.review.proposals.map(x => x.id === id ? { ...x, status: edit || decision === 'approve' ? 'approved' : 'rejected' } : x);
    if (SITE.feed?.proposals?.items) { SITE.feed.proposals.items = SITE.feed.proposals.items.filter(x => x.id !== id); SITE.feed.proposals.pending = SITE.feed.proposals.items.length; }
    slPaint(['tiles', 'segbar', 'body']); slLoadReview().then(() => slPaint(['tiles', 'segbar', 'body'])).catch(() => {}); slLoadFeed({ force: true }).catch(() => {});
  } catch (e) { toast(e.message, e.kind === 'unsupported' ? 'warn' : 'bad'); }
}
async function slRevert() {
  if (!slCanWrite()) { slNeedKey(); return; }
  const r = await confirmDialog({ title: 'Revert the site to its bundled registry?', body: `<p>${esc(slHost())} stops reading what New A OS published and goes back to the <b>data/Registry.json</b> it was deployed with. Desk edits stay, and the sync log records the revert.</p><p class="muted" style="font-size:12.5px">Auto-publish pauses until you publish by hand again.</p>`, ok: 'Revert the site', danger: true });
  if (r !== 'ok') return;
  try {
    const d = (await slJSON('/api/registry', { method: 'POST', auth: true, body: JSON.stringify({ reset: true }), timeout: 30000 })).data || {};
    toast(d.unchanged ? 'The site already reads its bundled registry' : `Reverted — ${d.summary || 'the site reads its bundled registry'}`, 'good');
    SITE.conn.info = { ...(SITE.conn.info || {}), source: 'bundled', hash: d.hash, counts: d.counts, uploaded: null };
    if (slCfg().auto) { slAutoCancel(); SITE.auto.held = { kind: 'changed', message: 'The site was reverted to its bundled registry. Publish by hand to link it to New A OS again — auto-publish waits until then.' }; }
    slLoadLog().catch(() => {}); slPaint();
  } catch (e) { toast('Not reverted: ' + e.message, 'bad'); }
}
async function slSaveConn(form) {
  const urlIn = form.querySelector('#sl-url').value; const keyIn = form.querySelector('#sl-key').value.trim();
  const n = slNormalizeUrl(urlIn || SL_DEFAULT_URL); if (n.error) { toast(n.error, 'warn'); form.querySelector('#sl-url').focus(); return; }
  const before = slBase(); slSetCfg({ url: n.url });
  if (keyIn) slSetKey(n.url, keyIn);
  if (before !== n.url) { slResetSite(); }
  slApplyUrls(); SITE.editing = false; SITE.showKey = false; slStatusBar();
  if (form.contains(document.activeElement)) document.activeElement.blur();   // Enter in a field: let the badge repaint with the result
  const c = await slTest({ quiet: false });
  if (c.state === 'ok' || c.state === 'readonly') { slLoadFeed({ force: true }).then(() => slPaint()).catch(() => slPaint()); slLoadPhotos().then(() => slPaint(['tiles'])); slLoadPoliticsIfAny(); slLocalCheck(); }
  else SITE.editing = true;
  slPaint(); if (c.state === 'badkey') $('#sl-key')?.focus();
}

/* ---- events (delegated; everything here is scoped to data-sl* attributes) ---- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-sl]'); if (!t || t.disabled) return;
  const a = t.dataset.sl;
  switch (a) {
    case 'seg': SITE.seg = t.dataset.seg; slSetCfg({ seg: SITE.seg }); if (UI.nav !== 'site') { setNav('site'); return; } slPaint(['segbar', 'body']); if (SITE.seg === 'publish') { slLoadLog().catch(() => {}); slPhotoPendingPaint(); } if (SITE.seg === 'market') slLoadReview().then(() => slPaint(['segbar', 'body'])).catch(() => {}); if (SITE.seg === 'cityhall' && !SITE.politics) slLoadPoliticsIfAny(); $('#sl-segbar')?.scrollIntoView({ block: 'nearest', behavior: motionOn() ? 'smooth' : 'auto' }); break;
    case 'test': slTest({ quiet: false }); break;
    case 'setup-focus': SITE.editing = true; slPaint(['conn']); $('#sl-conn')?.scrollIntoView({ block: 'nearest', behavior: motionOn() ? 'smooth' : 'auto' }); setTimeout(() => $('#sl-url')?.focus(), 60); break;
    case 'preview': SITE.preview = true; slPaint(['body', 'segbar']); slEnter(); break;
    case 'conn-edit': SITE.editing = true; slPaint(['conn']); setTimeout(() => $('#sl-url')?.focus(), 30); break;
    case 'conn-close': SITE.editing = false; slPaint(['conn']); break;
    case 'key-show': { SITE.showKey = !SITE.showKey; const i = $('#sl-key'); if (i) { i.type = SITE.showKey ? 'text' : 'password'; t.textContent = SITE.showKey ? 'hide' : 'show'; t.setAttribute('aria-label', `${SITE.showKey ? 'Hide' : 'Show'} the key while typing`); i.focus(); } break; }
    case 'key-forget': { const r = await confirmDialog({ title: 'Forget the access key?', body: `<p>This browser forgets the key for <b>${esc(slHost())}</b>. Reading the site keeps working; publishing and the manager need the key again.</p>`, ok: 'Forget key' }); if (r !== 'ok') break; slSetKey(slBase(), ''); SITE.agent = null; slAutoCancel(); slSetConn('readonly'); SITE.editing = true; slPaint(); toast('Key forgotten', 'warn'); break; }
    case 'publish': slPublishClick(); break;
    case 'revert': slRevert(); break;
    case 'photos': slPushPhotos(); break;
    case 'basemap': if (!SITE.photos) await slLoadPhotos(); slPushBasemap(); break;
    case 'log-refresh': SITE.log = null; slPaint(['body']); slLoadLog().catch(() => {}); break;
    case 'feed-refresh': t.disabled = true; try { await slLoadFeed({ force: true }); slLoadPoliticsIfAny(); } catch (err) { toast(err.message, 'warn'); } slPaint(['tiles', 'segbar', 'body']); break;
    case 'open-record': closeModal(); openBuilding(t.dataset.id, 'view'); break;
    case 'imp-add': SITE.form.story.impacts = [...(SITE.form.story.impacts || []), { ticker: '', pct: '' }]; slPaint(['body']); $$('#sl-body [data-slf^="story.impacts."]').filter(x => x.tagName === 'SELECT').pop()?.focus(); break;
    case 'imp-del': SITE.form.story.impacts.splice(+t.dataset.i, 1); slSaveDraft(); slPaint(['body']); break;
    case 'apr-add': SITE.form.story.approvals = [...(SITE.form.story.approvals || []), { id: '', delta: '' }]; slPaint(['body']); $$('#sl-body [data-slf^="story.approvals."]').filter(x => x.tagName === 'SELECT').pop()?.focus(); break;
    case 'apr-del': SITE.form.story.approvals.splice(+t.dataset.i, 1); slSaveDraft(); slPaint(['body']); break;
    case 'story-clear': { const F = SITE.form.story; if (F.title || F.body || F.dek) { const r = await confirmDialog({ title: 'Clear the draft?', body: '<p>The headline, dek, body, tags and impacts are emptied. Nothing on the site changes.</p>', ok: 'Clear', danger: true }); if (r !== 'ok') break; } SITE.form.story = { ...SL_STORY_BLANK(), outlet: F.outlet, category: F.category }; slSetCfg({ draft: null }); slPaint(['body']); break; }
    case 'alert-clear': slClearAlert(); break;
    case 'appr-filter': SITE.apprFilter = t.dataset.v; slPaint(['body']); break;
    case 'appr-base': slApprovalBase(t.dataset.id); break;
    case 'appr-nudge': slApprovalNudge(t.dataset.id); break;
    case 'q-approve': slDecide(t.dataset.id, 'approve'); break;
    case 'q-reject': slDecide(t.dataset.id, 'reject'); break;
    case 'q-edit': slDecide(t.dataset.id, 'approve', { edit: true }); break;
  }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.sl-ch-row[role="button"]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('submit', e => {
  const f = e.target.closest?.('[data-sl-form]'); if (!f) return; e.preventDefault();
  const k = f.dataset.slForm; if (k === 'conn') slSaveConn(f); else if (k === 'story') slSubmitStory(); else if (k === 'alert') slSubmitAlert(); else if (k === 'post') slSubmitPost();
});
const slOnField = e => {
  const el = e.target; if (!el?.dataset) return;
  if (el.dataset.slQ === 'appr') { if (e.type === 'input') { SITE.apprQ = el.value; slApprSearch(); } return; }
  if (el.matches?.('[data-sl-auto]') && e.type === 'change') { slSetAuto(el.checked); return; }
  const path = el.dataset.slf; if (!path) return;
  const v = el.type === 'checkbox' ? el.checked : el.value; slFormSet(path, v);
  const lbl = el.closest('.f')?.querySelector('[data-sl-count]'); if (lbl) { const max = +lbl.dataset.slCount; lbl.textContent = `${String(v).length} / ${max}`; lbl.classList.toggle('over', String(v).length > max); }
  if (path.startsWith('story.')) { slSaveDraft(); const pv = $('#sl-preview'); if (pv) pv.innerHTML = slPreviewHTML(); if (path === 'story.outlet') { const by = $('#sl-st-by'); if (by) by.placeholder = SL_OUTLET[v]?.name || ''; } }
};
document.addEventListener('input', slOnField);
document.addEventListener('change', slOnField);
const slApprSearch = debounce(() => { const i = $('[data-sl-q="appr"]'); const pos = i?.selectionStart; const act = document.activeElement === i; if (i) i.blur(); slPaint(['body']); const n = $('[data-sl-q="appr"]'); if (n && act) { n.focus(); if (pos != null) n.setSelectionRange(pos, pos); } }, 220);

/* ---- a newsletter draft (Markdown from the digest or Clawson) becomes a story draft in the newsroom ---- */
function slMarkdownToStory(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n'); const first = lines.findIndex(l => l.trim());
  const plain = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:!?]|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1').trim();
  const title = first < 0 ? '' : plain(lines[first].replace(/^#+\s*/, ''));
  // a heading and its list become one paragraph (“Transit: A; B.”) so a long digest stays well under the site's 60 paragraphs;
  // lines wholly in _italics_ are notes to the editor (“Drafted by New A OS …”) and stay out of the story
  const paras = []; let cur = [], head = null, items = [];
  const flushText = () => { if (cur.length) { paras.push(cur.join(' ')); cur = []; } };
  const flushSect = () => { if (head != null) { paras.push(items.length ? `${head}: ${items.join('; ')}.`.replace(/([.!?])\.$/, '$1') : head); head = null; items = []; } };
  for (const raw of lines.slice(first + 1)) {
    const l = raw.trim(); if (!l) { flushText(); continue; }
    if (/^_[^_].*_$/.test(l)) continue;
    if (/^#+\s/.test(l)) { flushText(); flushSect(); head = plain(l.replace(/^#+\s*/, '')); continue; }
    if (/^[-*]\s+/.test(l)) { flushText(); const it = plain(l.replace(/^[-*]\s+/, '')); if (head != null) items.push(it); else paras.push(it); continue; }
    flushSect(); cur.push(plain(l));
  }
  flushText(); flushSect();
  return { title: truncate(title, 200), dek: '', body: paras.join('\n\n') };
}
async function slDraftToNewsroom(text) {
  const st = slMarkdownToStory(text); if (!st.title && !st.body) { toast('The draft is empty', 'warn'); return; }
  const F = SITE.form.story || { ...SL_STORY_BLANK(), ...(slCfg().draft || {}) };
  if (F.title || F.body) { const r = await confirmDialog({ title: 'Replace the story in the newsroom?', body: `<p>The newsroom already holds a draft — “${esc(truncate(F.title || F.body, 80))}”. Replace it with this newsletter?</p>`, ok: 'Replace' }); if (r !== 'ok') return; }
  SITE.form.story = { ...SL_STORY_BLANK(), outlet: 'press-office', category: 'City Hall', ...st };
  slSetCfg({ draft: SITE.form.story, seg: 'newsroom' }); SITE.seg = 'newsroom';
  closeModal(); if (typeof CLAW !== 'undefined' && CLAW.open) clawToggle(false);
  if (UI.nav === 'site') slPaint(['segbar', 'body']); else setNav('site');
  toast('In the newsroom — review it, then press Publish story', 'good');
}

/* ---- start-up: point the inbox and markets at the linked site, check it quietly, arm auto-publish ---- */
function slBoot() {
  slApplyUrls(); slStatusBar();
  if (!slBase()) return;
  if (!SITE.conn.at && !SITE.testing) SITE.conn = { ...SITE.conn, state: 'checking', base: slBase() };   // never over a result the Site view already has
  setTimeout(() => { if (!SITE.conn.at || Date.now() - SITE.conn.at > 60e3) slTest().catch(() => {}); slLocalCheck(); }, 1500);
}


