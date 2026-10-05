/* =====================================================================
   §20 BOOT
   ===================================================================== */
async function boot() {
  let stored = null;
  try { stored = await idbGet('state', 'main'); } catch (e) { console.warn('IndexedDB unavailable', e); }
  // an older store is about to be upgraded: keep an untouched copy in memory (downloadable) and as a labelled snapshot
  const fromSchema = stored ? (stored.schema ?? 1) : null;
  if (stored && fromSchema < APP.schema) MIGRATION.pre = JSON.stringify(stored);
  S = stored ? migrate(stored) : seedState();
  UI.view = S.settings.view || 'table';
  UI.nav = NAV.some(n => n.id === S.settings.lastNav) ? S.settings.lastNav : 'overview';
  UI.scope = S.settings.lastScope && (S.settings.lastScope.kind === 'all' || scopeNode(S.settings.lastScope)) ? S.settings.lastScope : (regionById('new-a-city') ? { kind: 'region', id: 'new-a-city' } : { kind: 'all', id: null });
  if (UI.nav === 'map') UI.nav = 'overview';   // the map mounts after the boot sequence; start on the overview
  applySettings();
  await Promise.all([loadImages().catch(() => {}), vaultInit()]);
  if (!stored) { await idbPut('state', 'main', JSON.parse(JSON.stringify(S))).catch(() => {}); }
  if (MIGRATION.pre) {
    try { await tx('snapshots', 'readwrite', st => st.add({ ts: Date.now(), buildings: (stored.buildings || []).length, label: `pre-upgrade · schema ${fromSchema}`, state: JSON.parse(MIGRATION.pre) })); } catch (e) { console.warn('pre-upgrade snapshot', e); }
    await idbPut('state', 'main', JSON.parse(JSON.stringify(S))).catch(() => {});
  }
  renderAll(); setSaveState('saved', stored ? (MIGRATION.report ? 'UPGRADED' : 'LOADED') : 'SEEDED');
  await playBoot({ stored: !!stored });
  if (MIGRATION.report) { openUpgradeReport(MIGRATION.report); MIGRATION.report = null; commit({ now: true }); }
  if (MIGRATION.minor) { toast(`Registry upgraded to schema ${MIGRATION.minor.to} — civic facilities, officials, projects, service times and valuations are ready; every existing record is unchanged`, 'good'); MIGRATION.minor = null; commit({ now: true }); }
  if (VAULT.status === 'prompt') toast(`Vault “${VAULT.name}” needs a click to reconnect`, 'warn', { label: 'RECONNECT', fn: vaultReconnect });
  newsAutoRefresh();
}
function playBoot({ stored }) {
  const el = $('#boot');
  const skip = () => { el.classList.add('off'); document.removeEventListener('keydown', skip); el.removeEventListener('click', skip); setTimeout(() => el.remove(), 500); };
  if (!S.settings.boot || !motionOn()) { skip(); return Promise.resolve(); }
  const { i1 } = hyRange(S.buildings);
  const lines = [
    ['mounting browser store', MIGRATION.report ? `schema ${MIGRATION.report.from} → ${APP.schema} · upgraded` : `schema ${S.schema} · ok`], ['reading vault', VAULT.status === 'granted' ? VAULT.name : VAULT.status === 'prompt' ? 'awaiting permission' : 'not linked'],
    ['loading geography', `${S.regions.length} jurisdictions · ${S.districts.length} districts · ${S.neighborhoods.length} hoods`], ['indexing buildings', `${activeBuildings().length} standing · ${histBuildings().length} historical`],
    ['roads · transit · businesses', `${S.roads.length} · ${S.lines.length} lines / ${S.stations.length} stations · ${S.businesses.length}`], ['timeline index', `${i1 + 1} half-years · ${relEdges().length} site links · ${S.archive.length} chronicle`],
    ['photos · news', `${imageOwners().filter(b => b.image).length} · ${S.news.items.length} articles`], ['rendering', stored ? 'ok' : 'seeded from zays.us/new-a'],
  ];
  const box = $('#bootlines'); box.innerHTML = lines.map(([a, b]) => `<div class="line"><span>› ${esc(a)}</span><span class="${/^(ok|\d)/.test(b) || b === VAULT.name ? 'ok' : 'v'}">${esc(b)}</span></div>`).join('');
  document.addEventListener('keydown', skip); el.addEventListener('click', skip);
  return new Promise(res => {
    const ls = $$('#bootlines .line'); ls.forEach((l, i) => setTimeout(() => l.classList.add('show'), 120 + i * 140));
    setTimeout(() => { $('#bootbar').style.width = '100%'; }, 80);
    setTimeout(() => { skip(); res(); }, 120 + lines.length * 140 + 450);
  });
}
boot().catch(e => { console.error(e); $('#boot')?.remove(); toast('Start-up problem: ' + e.message, 'bad'); });
