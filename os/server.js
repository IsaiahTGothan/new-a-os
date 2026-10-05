#!/usr/bin/env node
'use strict';
/* New A OS bridge — a small local server the single-file app talks to.
   Gives the app: a fetch proxy (newsletter feed, markets, AI providers), vault
   file access, read-only world scans with a top-down render, verified
   incremental backups with health and alerts. Binds to 127.0.0.1 only. */
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const world = require('./lib/world'); const backup = require('./lib/backup');
const VERSION = '3.0.0'; const HERE = __dirname; const CACHE = path.join(HERE, '.cache');
const DEFAULTS = { port: 7331, host: '127.0.0.1', vaultDir: '', worldDir: '', backupDir: path.join(HERE, 'backups'), mirrorDir: '', retain: 30, monthlyFull: true, afterSession: true, allowHosts: ['newa-site.vercel.app', 'api.anthropic.com', 'api.openai.com'], roadBlocks: null, lastRestoreTest: null };
function loadConfig(file, args = {}) { let cfg = { ...DEFAULTS }; try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { } for (const [k, v] of Object.entries(args)) if (v != null) cfg[k] = v; return cfg; }
function saveConfig(file, cfg) { try { fs.writeFileSync(file, JSON.stringify(cfg, null, 2)); } catch (e) { console.warn('config not saved:', e.message); } }
function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; const next = () => argv[++i]; if (a === '--vault') out.vaultDir = path.resolve(next()); else if (a === '--world') out.worldDir = path.resolve(next()); else if (a === '--backups') out.backupDir = path.resolve(next()); else if (a === '--mirror') out.mirrorDir = path.resolve(next()); else if (a === '--port') out.port = +next(); else if (a === '--host') out.host = next(); } return out; }
const safeName = n => { const s = String(n || '').replace(/\\/g, '/'); if (!s || s.includes('..') || s.startsWith('/') || /[:*?"<>|]/.test(s)) return null; return s; };
function createServer(cfg, { configFile = null } = {}) {
  fs.mkdirSync(CACHE, { recursive: true }); const state = { started: new Date().toISOString(), lastScan: null, lastBackup: null, scanning: false, backingUp: false };
  const json = (res, code, obj) => { const body = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' }); res.end(body); };
  const readBody = req => new Promise((resolve, reject) => { const chunks = []; let n = 0; req.on('data', c => { n += c.length; if (n > 64e6) { reject(new Error('body too large')); req.destroy(); } chunks.push(c); }); req.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); if (!t) return resolve({}); try { resolve(JSON.parse(t)); } catch { reject(new Error('body is not JSON')); } }); req.on('error', reject); });
  const registryFromVault = () => { try { const j = JSON.parse(fs.readFileSync(path.join(cfg.vaultDir, 'Registry.json'), 'utf8')); return { buildings: (j.buildings || []).map(b => ({ id: b.id, reg: b.reg, name: b.name, x: b.x, z: b.z, height: b.height, floors: b.floors, physical: b.physical, footprint: b.footprint })), roads: (j.roads || []).map(r => ({ id: r.id, reg: r.reg, name: r.name, geometry: r.geometry })) }; } catch { return { buildings: [], roads: [] }; } };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Max-Age': '600' }); return res.end(); }
    try {
      if (p === '/api/status') return json(res, 200, { ok: true, app: 'new-a-os-bridge', version: VERSION, node: process.version, started: state.started, vaultDir: cfg.vaultDir || null, vaultOk: !!cfg.vaultDir && fs.existsSync(cfg.vaultDir), worldDir: cfg.worldDir || null, worldOk: !!cfg.worldDir && fs.existsSync(path.join(cfg.worldDir, 'region')), backupDir: cfg.backupDir, lastScan: state.lastScan ? { at: state.lastScan.at, summary: state.lastScan.summary, render: state.lastScan.render ? { ...state.lastScan.render, url: '/renders/' + path.basename(state.lastScan.render.file) } : null } : null, lastBackup: state.lastBackup, schedule: { afterSession: cfg.afterSession, monthlyFull: cfg.monthlyFull, retain: cfg.retain, mirrorDir: cfg.mirrorDir || null }, scanning: state.scanning, backingUp: state.backingUp });
      if (p === '/api/health') return json(res, 200, { ok: true, ...backup.health({ backupDir: cfg.backupDir, vaultDir: cfg.vaultDir, worldDir: cfg.worldDir, lastRestoreTest: cfg.lastRestoreTest }), world: { configured: !!cfg.worldDir, readable: !!cfg.worldDir && fs.existsSync(path.join(cfg.worldDir, 'region')), regions: cfg.worldDir && fs.existsSync(path.join(cfg.worldDir, 'region')) ? fs.readdirSync(path.join(cfg.worldDir, 'region')).filter(n => n.endsWith('.mca')).length : 0 }, vault: { configured: !!cfg.vaultDir, registry: !!cfg.vaultDir && fs.existsSync(path.join(cfg.vaultDir, 'Registry.json')) ? fs.statSync(path.join(cfg.vaultDir, 'Registry.json')) : null } });
      if (p === '/api/config') { if (req.method === 'POST') { const b = await readBody(req); for (const k of ['retain', 'monthlyFull', 'afterSession', 'mirrorDir', 'roadBlocks', 'allowHosts']) if (b[k] !== undefined) cfg[k] = b[k]; if (configFile) saveConfig(configFile, cfg); } return json(res, 200, { ok: true, config: { ...cfg } }); }
      if (p === '/api/fetch' && req.method === 'POST') {
        const b = await readBody(req); let target; try { target = new URL(b.url); } catch { return json(res, 400, { ok: false, error: 'bad url' }); }
        if (!['http:', 'https:'].includes(target.protocol) || !cfg.allowHosts.includes(target.hostname)) return json(res, 403, { ok: false, error: `host ${target.hostname} is not in allowHosts (${cfg.allowHosts.join(', ')}) — add it under /api/config` });
        const r = await fetch(target, { method: b.method || 'GET', headers: b.headers || {}, body: b.body != null ? (typeof b.body === 'string' ? b.body : JSON.stringify(b.body)) : undefined, signal: AbortSignal.timeout(45000) });
        const text = await r.text(); return json(res, 200, { ok: r.ok, status: r.status, headers: Object.fromEntries([...r.headers.entries()].filter(([k]) => ['content-type', 'last-modified', 'etag', 'date'].includes(k))), body: text });
      }
      if (p === '/api/vault/list') { if (!cfg.vaultDir || !fs.existsSync(cfg.vaultDir)) return json(res, 404, { ok: false, error: 'vault folder not configured or missing' }); return json(res, 200, { ok: true, dir: cfg.vaultDir, files: backup.listFiles(cfg.vaultDir).map(rel => { const st = fs.statSync(path.join(cfg.vaultDir, rel)); return { name: rel, size: st.size, modified: st.mtime.toISOString() }; }) }); }
      if (p === '/api/vault/read') { const name = safeName(u.searchParams.get('name')); if (!name) return json(res, 400, { ok: false, error: 'bad name' }); const f = path.join(cfg.vaultDir || '', name); if (!cfg.vaultDir || !fs.existsSync(f)) return json(res, 404, { ok: false, error: 'not found' }); const text = fs.readFileSync(f, 'utf8'); return json(res, 200, { ok: true, name, text, modified: fs.statSync(f).mtime.toISOString() }); }
      if (p === '/api/vault/write' && req.method === 'POST') { const b = await readBody(req); const name = safeName(b.name); if (!name || !cfg.vaultDir) return json(res, 400, { ok: false, error: 'bad name or no vault' }); const f = path.join(cfg.vaultDir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, typeof b.text === 'string' ? b.text : JSON.stringify(b.text)); fs.renameSync(tmp, f); return json(res, 200, { ok: true, name, bytes: fs.statSync(f).size }); }
      if (p === '/api/scan' && req.method === 'POST') {
        if (!cfg.worldDir || !fs.existsSync(path.join(cfg.worldDir, 'region'))) return json(res, 400, { ok: false, error: 'world folder not configured — start the bridge with --world <path to the save folder>' });
        if (state.scanning) return json(res, 409, { ok: false, error: 'a scan is already running' });
        const b = await readBody(req); const bounds = b.bounds; if (!bounds || [bounds.x1, bounds.z1, bounds.x2, bounds.z2].some(v => typeof v !== 'number')) return json(res, 400, { ok: false, error: 'bounds {x1,z1,x2,z2} required' });
        if ((bounds.x2 - bounds.x1 + 1) * (bounds.z2 - bounds.z1 + 1) > 16e6) return json(res, 400, { ok: false, error: 'bounds larger than 16 million columns — scan in parts' });
        state.scanning = true; const stampStr = new Date().toISOString();
        try { const registry = b.registry || registryFromVault(); const renderFile = b.render === false ? null : path.join(CACHE, `render-${stampStr.replace(/[:.]/g, '-').slice(0, 19)}.png`); const r = world.scan(cfg.worldDir, { bounds, registry, roadBlocks: cfg.roadBlocks || undefined, renderFile, stamp: stampStr }); state.lastScan = r; fs.writeFileSync(path.join(CACHE, 'last-scan.json'), JSON.stringify(r)); return json(res, 200, { ok: true, ...r, render: r.render ? { ...r.render, url: '/renders/' + path.basename(r.render.file) } : null }); }
        finally { state.scanning = false; }
      }
      if (p === '/api/scan/last') { if (!state.lastScan) { try { state.lastScan = JSON.parse(fs.readFileSync(path.join(CACHE, 'last-scan.json'), 'utf8')); } catch { } } if (!state.lastScan) return json(res, 404, { ok: false, error: 'no scan yet' }); const r = state.lastScan; return json(res, 200, { ok: true, ...r, render: r.render ? { ...r.render, url: '/renders/' + path.basename(r.render.file) } : null }); }
      if (p.startsWith('/renders/')) { const f = path.join(CACHE, path.basename(p)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); return fs.createReadStream(f).pipe(res); }
      if (p === '/api/backup/list') return json(res, 200, { ok: true, dir: cfg.backupDir, backups: backup.list(cfg.backupDir) });
      if (p === '/api/backup/run' && req.method === 'POST') { if (state.backingUp) return json(res, 409, { ok: false, error: 'a backup is already running' }); const b = await readBody(req); state.backingUp = true; try { const m = backup.run({ vaultDir: cfg.vaultDir, backupDir: cfg.backupDir, kind: b.kind || 'auto', retain: cfg.retain, mirrorDir: cfg.mirrorDir, monthlyFull: cfg.monthlyFull }); state.lastBackup = { id: m.id, at: m.at, kind: m.kind, status: m.status, verified: m.verified, changed: m.changedCount, bytes: m.bytes, mirrored: m.mirrored || null, error: m.error || null }; return json(res, m.status === 'ok' ? 200 : 500, { ok: m.status === 'ok', backup: state.lastBackup }); } catch (e) { return json(res, 500, { ok: false, error: e.message }); } finally { state.backingUp = false; } }
      if (p === '/api/backup/verify' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, { ok: true, result: backup.verify(cfg.backupDir, b.id || null) }); }
      if (p === '/api/backup/restore-test' && req.method === 'POST') { const b = await readBody(req); const r = backup.restoreTest(cfg.backupDir, b.id || null); if (r.ok) { cfg.lastRestoreTest = r.at; if (configFile) saveConfig(configFile, cfg); } return json(res, 200, { ok: true, result: r }); }
      return json(res, 404, { ok: false, error: 'unknown route' });
    } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  });
  server.state = state; server.cfg = cfg; return server;
}
function start(argv = process.argv.slice(2)) {
  const configFile = path.join(HERE, 'config.json'); const cfg = loadConfig(configFile, parseArgs(argv)); saveConfig(configFile, cfg);
  const server = createServer(cfg, { configFile });
  server.listen(cfg.port, cfg.host, () => {
    console.log(`New A OS bridge ${VERSION} · http://${cfg.host}:${cfg.port}`);
    console.log(`  vault   ${cfg.vaultDir || '(not set — --vault <folder>)'}${cfg.vaultDir && !fs.existsSync(cfg.vaultDir) ? '  ⚠ missing' : ''}`);
    console.log(`  world   ${cfg.worldDir || '(not set — --world <save folder>)'}${cfg.worldDir && !fs.existsSync(path.join(cfg.worldDir, 'region')) ? '  ⚠ no region/ folder' : ''}  (read-only)`);
    console.log(`  backups ${cfg.backupDir}${cfg.mirrorDir ? ' · mirror ' + cfg.mirrorDir : ''} · keep ${cfg.retain} · monthly full ${cfg.monthlyFull ? 'on' : 'off'}`);
    // scheduled full backup: once a month, checked daily
    const tick = () => { try { if (!cfg.vaultDir || !fs.existsSync(cfg.vaultDir) || !cfg.monthlyFull) return; const full = backup.manifests(cfg.backupDir).filter(m => m.kind === 'full' && m.status === 'ok').pop(); if (!full || full.at.slice(0, 7) !== new Date().toISOString().slice(0, 7)) { const m = backup.run({ vaultDir: cfg.vaultDir, backupDir: cfg.backupDir, kind: 'full', retain: cfg.retain, mirrorDir: cfg.mirrorDir, monthlyFull: cfg.monthlyFull }); server.state.lastBackup = { id: m.id, at: m.at, kind: m.kind, status: m.status, verified: m.verified, changed: m.changedCount, bytes: m.bytes }; console.log(`  monthly full backup ${m.id} · ${m.status}`); } } catch (e) { console.warn('scheduled backup failed:', e.message); } };
    setTimeout(tick, 60e3); setInterval(tick, 24 * 36e5).unref();
  });
  return server;
}
module.exports = { createServer, start, loadConfig, parseArgs, DEFAULTS, VERSION };
if (require.main === module) start();
