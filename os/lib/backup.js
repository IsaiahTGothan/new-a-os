'use strict';
/* Verified incremental backups of the vault folder. Each run writes a manifest
   with a SHA-256 per file; changed files are copied and re-hashed after the
   copy. A restore test materialises the latest chain into a temp folder and
   verifies every hash. The vault is only ever read here. */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file, { flag: 'r' })).digest('hex');
const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
function listFiles(dir, base = dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'backups') continue; const p = path.join(dir, e.name); if (e.isDirectory()) listFiles(p, base, out); else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/')); } return out.sort(); }
function manifests(backupDir) { if (!fs.existsSync(backupDir)) return []; return fs.readdirSync(backupDir).filter(n => fs.existsSync(path.join(backupDir, n, 'manifest.json'))).map(n => { try { return JSON.parse(fs.readFileSync(path.join(backupDir, n, 'manifest.json'), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at)); }
const summary = m => ({ id: m.id, at: m.at, kind: m.kind, base: m.base, status: m.status, verified: m.verified, files: Object.keys(m.files).length, changed: m.changedCount, bytes: m.bytes, deleted: m.deleted.length, mirrored: m.mirrored || null, error: m.error || null });
function run({ vaultDir, backupDir, kind = 'auto', retain = 30, mirrorDir = '', monthlyFull = true, now = new Date() }) {
  if (!vaultDir || !fs.existsSync(vaultDir)) throw new Error('vault folder not found: ' + vaultDir);
  fs.mkdirSync(backupDir, { recursive: true });
  const all = manifests(backupDir); const last = all[all.length - 1] || null; const lastFull = all.filter(m => m.kind === 'full' && m.status === 'ok').pop();
  const needFull = kind === 'full' || !last || !lastFull || (monthlyFull && lastFull.at.slice(0, 7) !== now.toISOString().slice(0, 7));
  const id = `${stamp(now)}-${needFull ? 'full' : 'inc'}`; const dir = path.join(backupDir, id); fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const files = listFiles(vaultDir); const man = { id, at: now.toISOString(), kind: needFull ? 'full' : 'incremental', base: needFull ? null : last.id, files: {}, deleted: [], changedCount: 0, bytes: 0, verified: false, status: 'running', vault: vaultDir };
  const errors = [];
  for (const rel of files) {
    const src = path.join(vaultDir, rel); const st = fs.statSync(src); const h = sha(src); const prev = !needFull && last.files[rel];
    if (prev && prev.sha === h) { man.files[rel] = { sha: h, size: st.size, stored: prev.stored }; continue; }
    const dst = path.join(dir, 'files', rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst);
    const h2 = sha(dst); if (h2 !== h) { errors.push(`${rel}: copy hash mismatch`); }
    man.files[rel] = { sha: h, size: st.size, stored: id }; man.changedCount++; man.bytes += st.size;
  }
  if (!needFull) for (const rel of Object.keys(last.files)) if (!man.files[rel]) man.deleted.push(rel);
  man.verified = errors.length === 0; man.status = errors.length ? 'failed' : 'ok'; if (errors.length) man.error = errors.join('; ');
  if (mirrorDir && man.status === 'ok') { try { const mdir = path.join(mirrorDir, id); fs.cpSync(dir, mdir, { recursive: true }); const bad = Object.entries(man.files).filter(([rel, f]) => f.stored === id && sha(path.join(mdir, 'files', rel)) !== f.sha); man.mirrored = bad.length ? `failed: ${bad.length} mismatched` : mdir; if (bad.length) man.status = 'mirror-failed'; } catch (e) { man.mirrored = 'failed: ' + e.message; } }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 2));
  if (mirrorDir && man.mirrored && !man.mirrored.startsWith('failed')) fs.writeFileSync(path.join(man.mirrored, 'manifest.json'), JSON.stringify(man, null, 2));
  prune(backupDir, retain);
  return man;
}
/* keep the newest `retain` runs plus any older run that a kept manifest still points to */
function prune(backupDir, retain) {
  const all = manifests(backupDir); if (all.length <= retain) return []; const keep = new Set(all.slice(-retain).map(m => m.id)); for (const m of all.slice(-retain)) for (const f of Object.values(m.files)) keep.add(f.stored);
  const removed = []; for (const m of all) if (!keep.has(m.id)) { fs.rmSync(path.join(backupDir, m.id), { recursive: true, force: true }); removed.push(m.id); } return removed;
}
function verify(backupDir, id = null) {
  const all = manifests(backupDir); const m = id ? all.find(x => x.id === id) : all[all.length - 1]; if (!m) return { ok: false, error: 'no backup found' };
  const bad = []; let checked = 0; for (const [rel, f] of Object.entries(m.files)) { const p = path.join(backupDir, f.stored, 'files', rel); if (!fs.existsSync(p)) { bad.push(`${rel}: missing from ${f.stored}`); continue; } if (sha(p) !== f.sha) bad.push(`${rel}: hash mismatch in ${f.stored}`); checked++; }
  return { ok: !bad.length, id: m.id, checked, bad, at: new Date().toISOString() };
}
function restoreTest(backupDir, id = null, tmpRoot = null) {
  const all = manifests(backupDir); const m = id ? all.find(x => x.id === id) : all[all.length - 1]; if (!m) return { ok: false, error: 'no backup found' };
  const dir = fs.mkdtempSync(path.join(tmpRoot || require('os').tmpdir(), 'newa-restore-')); const bad = []; let bytes = 0;
  for (const [rel, f] of Object.entries(m.files)) { const src = path.join(backupDir, f.stored, 'files', rel); const dst = path.join(dir, rel); try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); if (sha(dst) !== f.sha) bad.push(rel + ': hash mismatch after restore'); bytes += f.size; } catch (e) { bad.push(`${rel}: ${e.message}`); } }
  const registry = fs.existsSync(path.join(dir, 'Registry.json')); let parses = false; if (registry) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'Registry.json'), 'utf8')); parses = Array.isArray(j.buildings); } catch { } }
  const res = { ok: !bad.length && (!registry || parses), id: m.id, files: Object.keys(m.files).length, bytes, bad, registryParses: registry ? parses : null, dir, at: new Date().toISOString() };
  fs.rmSync(dir, { recursive: true, force: true }); delete res.dir; return res;
}
function list(backupDir) { return manifests(backupDir).map(summary).reverse(); }
function health({ backupDir, vaultDir, worldDir, lastRestoreTest = null, now = new Date() }) {
  const all = manifests(backupDir); const last = all[all.length - 1] || null; const lastOk = all.filter(m => m.status === 'ok' && m.verified).pop() || null; const alerts = [];
  const age = lastOk ? (now - new Date(lastOk.at)) / 36e5 : null;
  if (!vaultDir || !fs.existsSync(vaultDir)) alerts.push({ level: 'bad', text: 'Vault folder not found — set --vault to the folder the app writes Registry.json into.' });
  else if (!fs.existsSync(path.join(vaultDir, 'Registry.json'))) alerts.push({ level: 'warn', text: 'No Registry.json in the vault folder yet — link the folder in the app so it is written.' });
  if (!lastOk) alerts.push({ level: 'warn', text: 'No verified backup yet.' }); else if (age > 24 * 7) alerts.push({ level: 'warn', text: `Last verified backup is ${Math.round(age / 24)} days old.` });
  if (last && last.status !== 'ok') alerts.push({ level: 'bad', text: `Last backup ${last.id} ${last.status}${last.error ? ': ' + last.error : ''}.` });
  if (worldDir && !fs.existsSync(path.join(worldDir, 'region'))) alerts.push({ level: 'warn', text: 'World folder has no region/ subfolder — point --world at the save folder (the one with level.dat).' });
  if (!lastRestoreTest) alerts.push({ level: 'info', text: 'No restore test run yet — run one from Vault & backups.' });
  let disk = null; try { const st = fs.statfsSync(backupDir); disk = { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize }; if (disk.freeBytes < 2e9) alerts.push({ level: 'warn', text: `Only ${(disk.freeBytes / 1e9).toFixed(1)} GB free on the backup disk.` }); } catch { }
  return { last: last ? summary(last) : null, lastVerified: lastOk ? lastOk.at : null, ageHours: age == null ? null : Math.round(age), count: all.length, alerts, disk, lastRestoreTest };
}
module.exports = { run, verify, restoreTest, list, health, listFiles, manifests, prune, sha };
