/* =====================================================================
   §19 INTERACTIONS — one delegated click handler · changes · keyboard · search
   ===================================================================== */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-nav],[data-scope-kind],[data-open],[data-open-h],[data-arch],[data-arch-year],[data-sort],[data-hsort],[data-view],[data-f-toggle],[data-tf-toggle],[data-bf-toggle],[data-cseg],[data-cf-toggle],[data-hood],[data-fdistrict],[data-hseg],[data-tseg],[data-mode],[data-dock],[data-pi],[data-add]');
  if (!t) return;
  if (t.dataset.pi !== undefined && t.closest('#palette')) { openSearchHit(UI.palette.items[+t.dataset.pi]); return; }
  if (t.dataset.nav) { setNav(t.dataset.nav); return; }
  if (t.dataset.scopeKind !== undefined) { const k = t.dataset.scopeKind; setScope(k === 'all' ? { kind: 'all', id: null } : { kind: k, id: t.dataset.scopeId }); return; }
  if (t.dataset.add) { $('#addmenu').hidden = true; const a = t.dataset.add; if (a === 'building') newBuildingFlow(null, { historical: false }); else if (a === 'historical') newBuildingFlow(null, { historical: true }); else if (a === 'business') newBusinessFlow(); else if (a === 'road') startDrawFlow('road'); else if (a === 'line') startDrawFlow('transit'); else if (a === 'station') startDrawFlow('station'); else if (a === 'district') openDistrictModal(null); else if (a === 'region') openRegionModal(null); else if (a === 'chronicle') openArchiveModal(null, { year: CURRENT_YEAR }); return; }
  if (t.dataset.openH !== undefined || t.dataset.open !== undefined) {
    if (!(await leaveEditor())) return;
    const v = t.dataset.openH ?? t.dataset.open; const inDrawer = DR.id && $('#drawer').classList.contains('on');
    if (v.startsWith('official:')) { openOfficialModal(v.slice(9)); return; } if (v.startsWith('project:')) { openProjectModal(v.slice(8)); return; }
    if (v.includes(':')) { const [kind, id] = v.split(':'); openRecord(kind, id, 'view', inDrawer ? { push: true } : {}); }
    else openBuilding(v, 'view', t.dataset.openH !== undefined && inDrawer ? { push: true } : {});
    return;
  }
  if (t.dataset.arch) { openArchiveViewer(t.dataset.arch); return; }
  if (t.dataset.archYear) { ($(`.chron-card[data-year="${t.dataset.archYear}"]`) || $(`#chron-year-${t.dataset.archYear}`))?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' }); return; }
  if (t.dataset.sort) { const k = t.dataset.sort; UI.sort = UI.sort.key === k ? { key: k, dir: -UI.sort.dir } : { key: k, dir: ['assessTotal', 'listPrice', 'lotArea', 'floors', 'yearBuilt'].includes(k) ? -1 : 1 }; refreshRegistry(); return; }
  if (t.dataset.hsort) { const k = t.dataset.hsort; UI.hsort = UI.hsort.key === k ? { key: k, dir: -UI.hsort.dir } : { key: k, dir: ['yearBuilt', 'yearDemolished', 'lifespan', 'floors'].includes(k) ? -1 : 1 }; renderView(false); return; }
  if (t.dataset.view) { UI.view = t.dataset.view; S.settings.view = UI.view; UI.animateRows = true; refreshRegistry(); UI.animateRows = false; commit({ silentRender: true }); return; }
  if (t.dataset.fToggle) { UI.filters[t.dataset.fToggle] = !UI.filters[t.dataset.fToggle]; refreshRegistry(); return; }
  if (t.dataset.tfToggle) { UI.tf[t.dataset.tfToggle] = !UI.tf[t.dataset.tfToggle]; renderView(false); return; }
  if (t.dataset.bfToggle) { UI.bf[t.dataset.bfToggle] = !UI.bf[t.dataset.bfToggle]; renderView(false); return; }
  if (t.dataset.hood !== undefined) { UI.filters.hood = t.dataset.hood; renderView(false); return; }
  if (t.dataset.fdistrict !== undefined) { UI.filters.district = t.dataset.fdistrict; UI.filters.hood = ''; renderView(false); return; }
  if (t.dataset.hseg) { UI.hseg = t.dataset.hseg; UI.animateRows = true; renderView(false); $('#main').scrollTop = Math.min($('#main').scrollTop, 300); return; }
  if (t.dataset.tseg) { UI.tseg = t.dataset.tseg; renderView(false); return; }
  if (t.dataset.cseg) { UI.cseg = t.dataset.cseg; renderView(false); return; }
  if (t.dataset.cfToggle) { UI.cf[t.dataset.cfToggle] = !UI.cf[t.dataset.cfToggle]; renderView(false); return; }
  if (t.dataset.mode) { setMapMode(t.dataset.mode); return; }
  if (t.dataset.dock) { MAPW.dock = t.dataset.dock; renderDock(); return; }
  const act = t.dataset.act; if (!act) return;
  if (act.startsWith('insp-')) { inspectorAction(act, t); return; }
  switch (act) {
    // creation
    case 'new': newBuildingFlow(t.dataset.district || null); break;
    case 'new-hist': newBuildingFlow(t.dataset.district || null, { historical: true }); break;
    case 'new-business': newBusinessFlow(); break;
    case 'new-line': newLineFlow(); break;
    case 'draw-line': startDrawFlow('transit'); break;
    case 'draw-station': startDrawFlow('station'); break;
    case 'add-region': case 'add-region-here': closeScopePop(); openRegionModal(null, { parentId: UI.scope.kind === 'region' ? UI.scope.id : 'union' }); break;
    case 'add-district': case 'add-district-here': closeScopePop(); openDistrictModal(null, { parentId: UI.scope.kind === 'region' ? UI.scope.id : (UI.scope.kind === 'district' ? districtById(UI.scope.id)?.parentId : 'new-a-city') }); break;
    case 'edit-scope': closeScopePop(); editScope(); break;
    case 'edit-region': closeModal(); openRegionModal(t.dataset.id); break;
    case 'edit-district': closeModal(); openDistrictModal(t.dataset.id); break;
    case 'region-delete': deleteRegion(t.dataset.id); break;
    case 'district-delete': deleteDistrict(t.dataset.id); break;
    case 'manage-hoods': openHoodsModal(t.dataset.id || UI.scope.id); break;
    case 'hood-edit': openHoodsModal(t.dataset.district, t.dataset.id || null); break;
    case 'hood-delete': deleteHood(t.dataset.id, t.dataset.district); break;
    case 'border-draw': startBorderDraw(t.dataset.kind, t.dataset.id); break;
    case 'scope-close': closeScopePop(); break;
    case 'open-history-records': UI.hseg = 'records'; setNav('history'); break;
    case 'open-playback': openHistoryViewer({ index: 0 }); break;
    case 'open-playback-now': openHistoryViewer({ year: CURRENT_YEAR, half: CURRENT_HALF }); break;
    case 'hv-open-at': openHistoryViewer({ index: +t.dataset.i }); break;
    case 'hv-open-year': closeModal(); openHistoryViewer({ year: +t.dataset.year }); break;
    case 'tl-year': { if (HV.open) { hvPause(); hvSet(hyIndex(+t.dataset.year, 'E')); } else openHistoryViewer({ year: +t.dataset.year }); break; }
    case 'hclear': UI.hf = { district: '', hood: '', builtMin: '', builtMax: '', demoMin: '', demoMax: '', conf: '' }; UI.q = ''; $('#q').value = ''; renderView(false); break;
    case 'export-hist-csv': exportCSV(histFiltered(), 'historical-' + slug(scopeName())); break;
    case 'export-timeline-csv': exportTimelineCSV(scopeBuildings(), slug(scopeName())); break;
    case 'export-csv': { const rows = UI.nav === 'registry' || UI.nav === 'overview' ? applyFilters(scopeBuildings()) : scopeBuildings().filter(isActive); exportCSV(rows, slug(scopeName()) + '-registry'); break; }
    case 'export-roads-csv': exportRoadsCSV(S.roads); break;
    case 'export-transit-csv': exportTransitCSV(); break;
    case 'export-biz-csv': exportBusinessesCSV(UI.nav === 'businesses' ? bizRows() : S.businesses); break;
    case 'export-master': exportMaster(); break;
    case 'export-scope': exportScopeFile(); break;
    case 'export-current': exportFiltered('current'); break;
    case 'export-historical': exportFiltered('historical'); break;
    case 'export-compat': exportCompat(); break;
    case 'export-backup': exportBackup(); break;
    case 'download-pre': exportPreUpgrade(); break;
    case 'import': $('#file-json').click(); break;
    case 'upgrade-report': closeModal(); openUpgradeReport(); break;
    case 'open-issues': openIssuesModal(); break;
    case 'restore-snap': { const r = await confirmDialog({ title: 'Restore this snapshot?', body: '<p>The current data will be replaced by the snapshot. A new snapshot of the current state is taken first.</p>', ok: 'Restore' }); if (r === 'ok') { S.meta.lastSnapshot = 0; await maybeSnapshot(); await restoreSnapshot(+t.dataset.key); closeModal(); } break; }
    case 'vault-link': case 'vault-open-other': closeModal(); await vaultLink(); break;
    case 'vault-reconnect': closeModal(); await vaultReconnect(); break;
    case 'vault-unlink': closeModal(); await vaultUnlink(); break;
    case 'vault-write-now': SAVE.dirtyImages = new Set(imageOwners().filter(b => b.image).map(b => b.id)); commit({ now: true }); toast('Writing to the vault…'); break;
    case 'modal-close': closeModal(); break;
    // map
    case 'map-fit': mapFlyTo(scopeExtent()); break;
    case 'map-edit-toggle': setMapEdit(!MAPW.edit); break;
    case 'gm-close': MAPW.sel = null; renderPlaceCard(); mapDraw(); break;
    case 'gm-clear': { const i = $('#map-q'); if (i) { i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); } break; }
    case 'gm-directions': if (EXPLORE.dir) closeDirections(); else openDirections(MAPW.sel && ['building', 'station', 'business'].includes(MAPW.sel.kind) ? { kind: MAPW.sel.kind, id: MAPW.sel.id } : null); break;
    case 'gm-directions-to': openDirections(MAPW.sel ? { kind: MAPW.sel.kind, id: MAPW.sel.id } : null); break;
    case 'gm-dir-close': closeDirections(); break;
    case 'rt-swap': { const f = EXPLORE.from; EXPLORE.from = EXPLORE.to; EXPLORE.to = f; computeRoute(); break; }
    case 'rt-mode': EXPLORE.mode = t.dataset.mode; renderPlaceCard(); break;
    case 'pc-open': if (MAPW.sel) openRecord(MAPW.sel.kind === 'junction' ? 'road' : MAPW.sel.kind, MAPW.sel.kind === 'junction' ? MAPW.sel.j?.a : MAPW.sel.id); break;
    case 'pc-edit': { const sel = MAPW.sel; setMapEdit(true); MAPW.sel = sel; if (sel && ['region', 'district', 'hood'].includes(sel.kind) && !(nodeById(sel.id)?.polygons || []).length) setMapMode('border', { target: { kind: sel.kind, id: sel.id } }); renderDock(); mapDraw(); break; }
    case 'pc-fit': { const ext = selExtent(MAPW.sel); if (ext) mapFlyTo(ext); break; }
    case 'pc-look': if (MAPW.sel) setScope({ kind: MAPW.sel.kind, id: MAPW.sel.id }); break;
    case 'pc-select': MAPW.sel = { kind: t.dataset.kind, id: t.dataset.id }; { const ext = selExtent(MAPW.sel); if (ext) mapFlyTo(ext, { maxK: 5 }); } renderPlaceCard(); mapDraw(); break;
    case 'pc-history': { const b = MAPW.sel ? byId(MAPW.sel.id) : null; const y = t.dataset.year ? +t.dataset.year : null; if (b?.x != null) { HV.camHint = { x: b.x, z: b.z }; } openHistoryViewer(y ? { year: y } : { index: 0 }); break; }
    case 'pc-hv': { const b = MAPW.sel ? byId(MAPW.sel.id) : null; if (b?.x != null) HV.camHint = { x: b.x, z: b.z }; openHistoryViewer({ index: +t.dataset.i }); break; }
    case 'basemap-open': openBasemapModal(); break;
    case 'map-fit-sel': { const ext = selExtent(MAPW.sel); if (ext) mapFit(ext); else toast('The selection has no coordinates', 'warn'); break; }
    case 'map-zoom': mapZoomAt(t.dataset.dir === '1' ? 1.6 : 1 / 1.6, MAPW.w / 2, MAPW.h / 2); break;
    case 'map-snap-grid': MAPW.snapGrid = !MAPW.snapGrid; t.setAttribute('aria-pressed', MAPW.snapGrid); if (MAPW.dock === 'layers') renderDock(); break;
    case 'map-snap-vertex': MAPW.snapVertex = !MAPW.snapVertex; t.setAttribute('aria-pressed', MAPW.snapVertex); if (MAPW.dock === 'layers') renderDock(); break;
    case 'map-junctions': MAPW.junctions = !MAPW.junctions; t.setAttribute('aria-pressed', MAPW.junctions); mapDraw(); break;
    case 'map-undo': mapUndo(); break;
    case 'map-redo': mapRedo(); break;
    case 'map-finish': mapFinishDraft(); break;
    case 'map-cancel': mapCancel(); break;
    case 'map-cancel-pending': mapCancel(); break;
    case 'map-draft-undo': mapDraftUndo(); break;
    case 'map-dock-toggle': MAPW.dockOpen = !MAPW.dockOpen; renderView(false); break;
    case 'map-transit': UI.layers.transit = true; UI.layers.stations = true; setNav('map'); break;
    case 'asst-run': MAPW.dock = 'assistant'; renderDock(); asstRun(t.dataset.q); break;
    case 'asst-send': { const inp = $('#asst-q'); const q = inp?.value; if (inp) inp.value = ''; asstRun(q); break; }
    case 'asst-locate': mapLocate({ kind: t.dataset.kind, id: t.dataset.id }); MAPW.dock = 'assistant'; renderDock(); break;
    case 'asst-apply': asstApply(); break;
    case 'asst-cancel': asstCancel(); break;
    // history viewer
    case 'hv-close': closeHistoryViewer(); break;
    case 'hv-full': HV.full = !HV.full; $('#hv-root').classList.toggle('full', HV.full); requestAnimationFrame(() => { hvResize(); hvDraw(); }); break;
    case 'hv-list': HV.list = !HV.list; $('#hv-root .hv')?.classList.toggle('nolist', !HV.list); t.setAttribute('aria-pressed', HV.list); requestAnimationFrame(() => { hvResize(); hvDraw(); }); break;
    case 'hv-play': hvToggle(); break;
    case 'hv-step': hvPause(); hvSet(HV.to + (+t.dataset.dir) * (e.shiftKey ? 2 : 1)); break;
    case 'hv-change': hvStepChange(+t.dataset.dir); break;
    case 'hv-compare': hvToggleCompare(); break;
    case 'hv-swap': { const a = HV.to; hvSet(HV.b, { instant: true }); hvSetB(a); break; }
    case 'hv-loop': HV.loop = !HV.loop; hvUpdateChrome(); break;
    case 'hv-jump': { hvPause(); const y = num($('#hv-jump-y')?.value); const h = $('#hv-jump-h')?.value || 'E'; if (y != null) hvSet(hyIndex(y, h)); break; }
    case 'hv-projection': hvToggleProjection(); break;
    case 'hv-ref': HV.refOverlay = !HV.refOverlay; hvUpdateChrome(); hvDraw(); break;
    case 'hv-follow': HV.follow = !HV.follow; hvUpdateChrome(); break;
    // chronicle
    case 'arch-new': openArchiveModal(null, { year: t.dataset.year ? +t.dataset.year : (HV.open ? hyFromIndex(HV.to).year : CURRENT_YEAR) }); break;
    case 'arch-edit': openArchiveModal(t.dataset.id); break;
    case 'arch-save': archiveSave(); break;
    case 'arch-cancel': archiveCancel(); break;
    case 'arch-delete': archiveDelete(t.dataset.id); break;
    case 'arch-photo': $('#file-img').click(); break;
    case 'arch-prev': case 'arch-next': if (t.dataset.id) openArchiveViewer(t.dataset.id); break;
    // news
    case 'news-refresh': newsRefresh({ source: 'live' }); break;
    case 'news-import': $('#file-feed').click(); break;
    case 'news-vault': newsRefresh({ source: 'vault' }); break;
    case 'news-apply': { const c = S.news.items.flatMap(it => it.candidates || []).find(x => x.id === t.dataset.cand); if (c) { if (applyCandidate(c)) { toast('Applied — logged with its source; undo from the log', 'good'); renderView(false); } openNewsInbox(); } break; }
    case 'news-reject': S.news.decisions[t.dataset.cand] = { status: 'rejected', at: now() }; commit(); openNewsInbox(); break;
    case 'news-reopen': delete S.news.decisions[t.dataset.cand]; commit(); openNewsInbox(); break;
    case 'news-undo': undoLog(t.dataset.log); renderView(false); if (t.closest('#clawson')) clawRender(); else openNewsInbox(); break;
    // drawer: shared
    case 'dr-back': drawerBack(); break;
    case 'dr-close': closeDrawer(); break;
    case 'dr-edit': openRecord(DR.kind, DR.id, 'edit', { keepStack: true }); break;
    case 'dr-cancel': if (DR.isNew) closeDrawer(); else { if (formDirty()) { const r = await confirmDialog({ title: 'Discard changes?', body: '<p>Your edits to this record will be lost.</p>', ok: 'Discard', cancel: 'Keep editing', danger: true }); if (r !== 'ok') break; } openRecord(DR.kind, DR.id, 'view', { keepStack: true }); } break;
    case 'dr-save': saveDrawer(); break;
    case 'dr-delete': if (DR.kind === 'building') deleteBuilding(DR.id); else deleteOther(DR.kind, DR.id); break;
    case 'dr-map': { const ref = { kind: DR.kind, id: DR.id }; closeDrawer(true); mapLocate(ref); break; }
    case 'dr-photo': $('#file-img').click(); break;
    case 'dr-photo-remove': { const b = DR.mode === 'edit' ? DR.draft : recordById(DR.kind, DR.id); if (b) { await removeBuildingImage(b); const real = recordById(DR.kind, b.id); if (real) real.image = false; if (DR.mode === 'edit') renderDrawerPhotoOnly(); else renderDrawer(); renderView(false); } break; }
    case 'dr-copy': { const b = byId(DR.id); if (b) copySummary(b); break; }
    case 'dr-prev': stepRecord(-1); break;
    case 'dr-next': stepRecord(1); break;
    case 'reissue-reg': reissueReg(DR.id); break;
    // building record: relationships · businesses · road · footprint · listings
    case 'rel-add': { const b = byId(DR.id); if (!b) break; const r = await linkDialog(b); if (!r) break; if (r.id === b.id) break; b.relations = [...(b.relations || []).filter(x => !(x.type === r.type && x.id === r.id)), r]; b.updated = now(); commit(); renderDrawer(); renderView(false); toast(`Linked ${byId(r.id)?.reg} — ${RELATION_BY_ID[r.type]?.label.toLowerCase()}`, 'good'); break; }
    case 'rel-remove': removeRelation(t.dataset.holder, t.dataset.type, t.dataset.target); renderDrawer(); renderView(false); toast('Link removed', 'warn'); break;
    case 'rel-add-draft': { readFormInto(DR.draft, false); const r = await linkDialog(DR.draft); if (!r) break; DR.draft.relations = [...(DR.draft.relations || []).filter(x => !(x.type === r.type && x.id === r.id)), r]; rerenderEditor(); break; }
    case 'rel-remove-draft': readFormInto(DR.draft, false); DR.draft.relations.splice(+t.dataset.i, 1); rerenderEditor(); break;
    case 'ten-add': { const b = byId(DR.id); if (b) await linkBusinessToBuilding(b); break; }
    case 'ten-end': endTenancy(t.dataset.id); break;
    case 'ten-remove': { const r = await confirmDialog({ title: 'Remove this tenancy record?', body: '<p>It disappears from the occupancy history. To keep it as a former tenancy, use End instead.</p>', ok: 'Remove', danger: true }); if (r !== 'ok') break; S.tenancies = S.tenancies.filter(x => x.id !== t.dataset.id); commit(); renderDrawer(); renderView(false); break; }
    case 'road-pick': { const b = byId(DR.id); if (!b) break; const id = await roadPickDialog('Serving road for ' + b.reg); if (!id) break; b.roadId = id; b.roadIdSource = 'manual'; b.updated = now(); commit(); renderDrawer(); toast(`${b.reg} now served by ${roadLabel(roadById(id))}`, 'good'); break; }
    case 'road-apply': { const b = byId(DR.id); if (!b) break; b.roadId = t.dataset.id; b.roadIdSource = 'manual'; b.updated = now(); commit(); renderDrawer(); toast(`${b.reg} now served by ${roadLabel(roadById(t.dataset.id))}`, 'good'); break; }
    case 'road-clear': { const b = byId(DR.id); if (!b) break; b.roadId = null; b.roadIdSource = null; b.updated = now(); commit(); renderDrawer(); break; }
    case 'entrance-set': { const id = DR.id; const stack = DR.stack.slice(); closeDrawer(true); if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.pending = { kind: 'place-building', buildingId: id, field: 'entrance', label: `Click where you walk into ${byId(id)?.reg || 'the building'}`, resume: () => { openBuilding(id, 'view'); DR.stack = stack; } }; setMapMode('place', { pending: MAPW.pending }); const b = byId(id); if (b?.x != null) { MAPW.cam.x = b.x; MAPW.cam.z = b.z; if (MAPW.cam.k < 2) MAPW.cam.k = 3; mapDraw(); } }; if (MAPW.mounted) go(); else setTimeout(go, 40); break; }
    case 'place-on-map': pickPointForDraft('xz'); break;
    case 'footprint-draw': drawFootprintForDraft(); break;
    case 'footprint-clear': readFormInto(DR.draft, false); DR.draft.footprint = null; rerenderEditor(); break;
    case 'place-accept': { const sel = $('#f-district'); if (sel) { sel.value = t.dataset.district; sel.dispatchEvent(new Event('change')); } break; }
    case 'listing-add': { readFormInto(DR.draft, false); const v = await listingDialog({ title: 'Add a listing' }); if (!v) break; DR.draft.listings = [...(DR.draft.listings || []), v]; if (!DR.draft.market) DR.draft.market = v.kind === 'lease' ? 'for-lease' : 'for-sale'; if (num(DR.draft.listPrice) == null && v.price != null) DR.draft.listPrice = v.price; rerenderEditor(); break; }
    case 'listing-remove': readFormInto(DR.draft, false); DR.draft.listings.splice(+t.dataset.i, 1); rerenderEditor(); break;
    case 'tx-add': { readFormInto(DR.draft, false); const v = await listingDialog({ title: 'Record a transaction', tx: true }); if (!v) break; DR.draft.transactions = [...(DR.draft.transactions || []), v]; if (DR.draft.market === 'for-sale' && v.kind === 'sale') DR.draft.market = 'sold'; if (DR.draft.market === 'for-lease' && v.kind === 'lease') DR.draft.market = 'leased'; rerenderEditor(); break; }
    case 'tx-remove': readFormInto(DR.draft, false); DR.draft.transactions.splice(+t.dataset.i, 1); rerenderEditor(); break;
    // roads / lines / stations / businesses in the drawer
    case 'vx-add': { readAnyFormInto(DR.draft, false); const g = DR.kind === 'road' ? DR.draft.geometry : null; if (g) { const last = g[g.length - 1] || [0, 0]; g.push([last[0] + 10, last[1]]); rerenderEditor(); } break; }
    case 'vx-del': { readAnyFormInto(DR.draft, false); if (DR.kind === 'road') { DR.draft.geometry.splice(+t.dataset.i, 1); rerenderEditor(); } break; }
    case 'geom-map': { const kind = DR.kind, id = DR.id, isNew = DR.isNew; if (DR.mode === 'edit' && !isNew) { if (!(await leaveEditor())) break; } if (isNew) { toast('Save the record first, then draw it on the map', 'warn'); break; } closeDrawer(true); if (kind === 'station') { if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = { kind: 'station', id }; MAPW.pending = { kind: 'move-station', id, label: `Click the position of ${stationById(id)?.name || 'the station'}` }; setMapMode('station', { pending: MAPW.pending }); renderDock(); }; if (MAPW.mounted) go(); else setTimeout(go, 40); } else if (kind === 'line' && !lineGeometries(lineById(id) || { trackIds: [], roadIds: [] }).length) { if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = { kind: 'line', id }; setMapMode('transit'); renderDock(); toast('Draw the alignment — it becomes this line\'s first track', ''); }; if (MAPW.mounted) go(); else setTimeout(go, 40); } else if (kind === 'road' && !(roadById(id)?.geometry?.length)) { if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = { kind: 'road', id }; MAPW.draft = null; setMapMode('road'); renderDock(); toast('Draw the road — the new geometry is attached to this record', ''); MAPW.attachRoadId = id; }; if (MAPW.mounted) go(); else setTimeout(go, 40); } else mapLocate({ kind, id }); break; }
    case 'stop-add': { const l = lineById(t.dataset.line || DR.id); if (l) await addStopDialog(l); break; }
    case 'stop-new-map': { const id = DR.id; closeDrawer(true); if (UI.nav !== 'map') setNav('map'); const go = () => { MAPW.sel = { kind: 'line', id }; setMapMode('station'); renderDock(); }; if (MAPW.mounted) go(); else setTimeout(go, 40); break; }
    case 'stop-move': moveStop(t.dataset.line || DR.id, +t.dataset.i, +t.dataset.dir); if (DR.id) renderDrawer(); if (UI.nav === 'map') { renderDock(); mapDraw(); } break;
    case 'stop-remove': removeStop(t.dataset.line || DR.id, t.dataset.id); if (DR.id) renderDrawer(); if (UI.nav === 'map') { renderDock(); mapDraw(); } break;
    case 'biz-add-location': { const z = bizById(DR.id); if (!z) break; const bid = await buildingPickDialog([], `Where is ${bizLabel(z)}?`, 'Link'); if (!bid) break; const role = await (async () => new Promise(res => openModal({ title: 'In what role?', cls: 'narrow', body: `<div class="frow" style="margin-top:10px"><div class="f span"><label>Role</label><select id="role-sel">${TENANCY_ROLES.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></div><div class="f span"><label>Since (optional)</label><div class="hy"><select id="role-h">${HALVES.map(h => `<option value="${h.id}">${h.label}</option>`).join('')}</select><input id="role-y" type="number" placeholder="year" min="1990" max="2200"></div></div></div>`, foot: `<button class="btn ghost" data-r="cancel">Cancel</button><span class="spacer"></span><button class="btn primary" data-r="ok">Link</button>`, onOpen: m => { const done = r => { const v = { role: m.querySelector('#role-sel').value, year: num(m.querySelector('#role-y').value), half: m.querySelector('#role-h').value }; closeModal(); res(r === 'ok' ? v : null); }; m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r)); m.querySelector('[data-act=modal-close]').onclick = () => done('cancel'); } })))(); if (!role) break; const tn = newTenancy(z.id, bid, role.role); tn.yearFrom = role.year; tn.halfFrom = role.year != null && ['E', 'L'].includes(role.half) ? role.half : ''; S.tenancies.push(tn); commit(); renderDrawer(); renderView(false); toast('Location linked', 'good'); break; }
    case 'rev-add': { const z = bizById(DR.id); if (!z) break; const v = await revenueDialog(z); if (!v) break; z.revenue = [...(z.revenue || []), v]; z.updated = now(); commit(); renderDrawer(); renderView(false); break; }
    case 'rev-remove': { const z = bizById(DR.id); if (!z) break; z.revenue = (z.revenue || []).filter(r => r.id !== t.dataset.id); z.updated = now(); commit(); renderDrawer(); break; }
    case 'bizlisting-add': { const z = bizById(DR.id); if (!z) break; const v = await listingDialog({ title: `List ${bizLabel(z)}`, forBusiness: true }); if (!v) break; z.listings = [...(z.listings || []), v]; z.updated = now(); commit(); renderDrawer(); break; }
    case 'bizlisting-remove': { const z = bizById(DR.id); if (!z) break; z.listings = (z.listings || []).filter(l => l.id !== t.dataset.id); z.updated = now(); commit(); renderDrawer(); break; }
    case 'loc-add': { readBizFormInto(DR.draft, false); DR.draft.locations = [...(DR.draft.locations || []), { label: '', districtId: null, note: '' }]; rerenderEditor(); break; }
    case 'loc-remove': { readBizFormInto(DR.draft, false); DR.draft.locations.splice(+t.dataset.i, 1); rerenderEditor(); break; }
    case 'biz-from-owners': openOwnerImport(); break;
    case 'link-by-name': { const r = roadById(t.dataset.id); if (r) linkRoadByNameFlow(r); break; }
    case 'link-all-by-name': linkAllByNameFlow(); break;
    case 'markets-import': $('#file-markets').click(); break;
    case 'markets-refresh': marketsRefresh({ source: 'live' }); break;
    case 'markets-vault': marketsRefresh({ source: 'vault' }); break;
    // OS bridge
    case 'os-open': openDataModal(); break;
    case 'os-poll': await OS.poll(); openDataModal(); break;
    case 'os-backup': await OS.backupRun('auto'); openDataModal(); break;
    case 'os-backup-full': await OS.backupRun('full'); openDataModal(); break;
    case 'os-verify': await OS.backupVerify(); break;
    case 'os-restore-test': await OS.restoreTest(); openDataModal(); break;
    case 'os-scan': closeModal(); openWorldScanModal(); break;
    case 'os-scan-inbox': { const n = OS.scanToInbox(); if (n) { closeModal(); toast(`${n} proposal${n === 1 ? '' : 's'} added to the inbox — nothing changes until you apply them`, 'good', { label: 'OPEN INBOX', fn: openNewsInbox }); } break; }
    case 'os-scan-basemap': { const bm = await OS.scanBasemap(); if (bm) { closeModal(); toast(`Basemap “${bm.name}” added — dated ${hyLabel(bm.year, bm.half)}`, 'good'); } break; }
    // clawson · drafts
    case 'clawson-toggle': clawToggle(); break;
    case 'claw-send': { const inp = $('#claw-q'); const q = inp?.value; if (inp) inp.value = ''; clawRun(q); break; }
    case 'claw-run': clawRun(t.dataset.q); break;
    case 'claw-apply': clawApply(); break;
    case 'claw-cancel': clawCancel(); break;
    case 'claw-view': CLAW.view = t.dataset.view || 'chat'; clawRender(); break;
    case 'claw-clear': CLAW.log = []; CLAW.pending = null; clawRender(); break;
    case 'claw-locate': clawLocate(t.dataset.kind, t.dataset.id); break;
    case 'claw-inbox': openNewsInbox(); break;
    case 'draft-open': closeModal(); openDraftModal(t.dataset.id); break;
    case 'draft-download': { const d = (S.news.drafts || []).find(x => x.id === t.dataset.id); if (d) downloadText(`new-a-newsletter-${slug(d.title || 'draft')}.md`, d.body, 'text/markdown'); break; }
    case 'draft-published': { const d = (S.news.drafts || []).find(x => x.id === t.dataset.id); if (d) { d.status = 'published'; d.publishedAt = now(); commit({ silentRender: true }); toast('Recorded as published by you', 'good'); if ($('#modal-root .modal')) { closeModal(); if (NEWS.filter === 'drafts') openNewsInbox(); } clawRender(); } break; }
    case 'draft-delete': { const d = (S.news.drafts || []).find(x => x.id === t.dataset.id); if (!d) break; const r = await confirmDialog({ title: 'Delete this draft?', body: '<p>The text is removed from the registry. Nothing on the site is affected.</p>', ok: 'Delete', danger: true }); if (r !== 'ok') break; S.news.drafts = S.news.drafts.filter(x => x.id !== d.id); commit({ silentRender: true }); closeModal(); clawRender(); toast('Draft deleted', 'warn'); break; }
    // civic · service · city
    case 'civic-map': UI.layers.civic = true; UI.layers.buildings = true; setNav('map'); break;
    case 'civic-new': { const bid = await buildingPickDialog([], 'Which building is the civic facility?', 'Open to edit'); if (bid) openBuilding(bid, 'edit'); break; }
    case 'official-new': openOfficialModal(null); break;
    case 'official-edit': openOfficialModal(t.dataset.id); break;
    case 'official-delete': deleteOfficial(t.dataset.id); break;
    case 'service-map': UI.mapColor = 'service'; UI.layers.buildings = true; setNav('map'); break;
    case 'sandbox-add': sandboxAdd(); break;
    case 'sandbox-remove': sandboxRemove(t.dataset.id); break;
    case 'sandbox-promote': sandboxPromote(t.dataset.id); break;
    case 'health-open': healthOpen(t.dataset.id); break;
    case 'val-open': openValuationModal(); break;
    case 'val-record': { const b = byId(DR.id); if (b) { recordValuations([b], 'manual'); renderDrawer(); toast('Estimate recorded in the valuation history', 'good'); } break; }
    case 'val-record-all': { const n = recordValuations(scopeActive().filter(isCompleted), 'scope'); closeModal(); renderView(false); toast(`${n} estimates recorded`, 'good'); break; }
    case 'profile-copy': { const pr = placeProfile(); navigator.clipboard?.writeText(pr.paragraphs.join('\n\n')).then(() => toast('Profile copied', 'good'), () => toast('Clipboard blocked — select and copy by hand', 'warn')); break; }
    case 'export-guide': exportPublicGuide(); break;
    case 'digest-open': openDigestModal(); break;
    case 'quality-fix': qualityFix(t.dataset.id); break;
    case 'quality-review': openQualityReview(t.dataset.id); break;
    case 'project-new': openProjectModal(null); break;
    case 'project-open': openProjectModal(t.dataset.id); break;
    case 'project-delete': deleteProject(t.dataset.id); break;
    case 'clear-filters': UI.filters = { ...UI.filters, physical: '', market: '', landmark: false, family: '', zfam: '', yearMin: '', yearMax: '', photo: false, hist: false }; UI.q = ''; $('#q').value = ''; refreshRegistry(); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.f) { UI.filters[el.dataset.f] = el.value; refreshRegistry(); return; }
  if (el.dataset.hf) { UI.hf[el.dataset.hf] = el.value; if (el.dataset.hf === 'district') UI.hf.hood = ''; renderView(false); return; }
  if (el.dataset.tf) { UI.tf[el.dataset.tf] = el.value; renderView(false); return; }
  if (el.dataset.cf) { UI.cf[el.dataset.cf] = el.value; renderView(false); return; }
  if (el.dataset.tline !== undefined) { UI.tline = el.value; UI.tfrom = null; UI.tto = null; renderView(false); return; }
  if (el.dataset.tfrom !== undefined) { UI.tfrom = el.value || null; renderView(false); return; }
  if (el.dataset.tto !== undefined) { UI.tto = el.value || null; renderView(false); return; }
  if (el.dataset.val !== undefined) { S.settings.valuation ??= { ...VALUATION_DEFAULTS }; const v = num(el.value); S.settings.valuation[el.dataset.val] = v ?? VALUATION_DEFAULTS[el.dataset.val]; commit({ silentRender: true }); return; }
  if (el.dataset.pub !== undefined) { S.settings.publishing ??= {}; S.settings.publishing[el.dataset.pub] = el.checked; commit({ silentRender: true }); return; }
  if (el.dataset.bf) { UI.bf[el.dataset.bf] = el.value; renderView(false); return; }
  if (el.dataset.bsort !== undefined) { UI.bsort = { key: el.value, dir: ['revenue', 'locations'].includes(el.value) ? -1 : 1 }; renderView(false); return; }
  if (el.dataset.bperiod !== undefined) { UI.bperiod = el.value; renderView(false); return; }
});
document.addEventListener('input', debounce(e => {
  const el = e.target;
  if (el.id === 'tq') { UI.tq = el.value; const pos = el.selectionStart; renderView(false); const n = $('#tq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  else if (el.id === 'cq') { UI.cq = el.value; const pos = el.selectionStart; renderView(false); const n = $('#cq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  else if (el.id === 'bq') { UI.bq = el.value; const pos = el.selectionStart; renderView(false); const n = $('#bq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
}, 160));
$('#backdrop').addEventListener('click', () => closeDrawer());
$('#btn-new').addEventListener('click', e => { if (e.target.closest('.chev')) { $('#addmenu').hidden = !$('#addmenu').hidden; return; } $('#addmenu').hidden = !$('#addmenu').hidden; });
$('#btn-data').addEventListener('click', openDataModal);
$('#btn-news').addEventListener('click', openNewsInbox);
$('#scope-btn').addEventListener('click', toggleScopePop);
$('#st-keys').addEventListener('click', openShortcuts);
$('#st-issues').addEventListener('click', openIssuesModal);
$('#file-json').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; });
document.addEventListener('keydown', e => { if (e.target.id === 'asst-q' && e.key === 'Enter') { e.preventDefault(); const q = e.target.value; e.target.value = ''; asstRun(q); } if (e.target.id === 'claw-q' && e.key === 'Enter') { e.preventDefault(); const q = e.target.value; e.target.value = ''; clawRun(q); } });
/* global search: live filter underneath + grouped palette on top */
$('#q').addEventListener('input', debounce(e => { UI.q = e.target.value; if (UI.q.trim()) openPalette(); else closePalette(); if (UI.nav === 'registry') refreshRegistry(); else if (UI.nav === 'history' && UI.hseg === 'records') renderView(false); }, 110));
$('#q').addEventListener('focus', () => { if ($('#q').value.trim()) openPalette(); });
$('#q').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (UI.palette.open) { e.preventDefault(); paletteMove(e.key === 'ArrowDown' ? 1 : -1); } return; }
  if (e.key === 'Enter') { const v = e.target.value.trim(); if (!v) return; e.preventDefault(); const exact = findAnyByReg(v); if (exact) { closePalette(); if (UI.nav === 'map') mapLocate(exact); else openRecord(exact.kind, exact.rec.id); return; } if (UI.palette.open && UI.palette.items.length) openSearchHit(UI.palette.items[UI.palette.active]); return; }
  if (e.key === 'Escape') { if (UI.palette.open) { closePalette(); e.stopPropagation(); return; } e.target.value = ''; UI.q = ''; refreshRegistry(); e.target.blur(); }
});

/* ---- keyboard ---- */
document.addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const isModal = modalOpen(); const onMap = UI.nav === 'map' && !DR.id && !isModal && !HV.open;
  if (e.key === 'Escape') {
    if ($('.combo.open')) return;
    if (UI.palette.open) { closePalette(); return; }
    if (SCOPE_POP.open) { closeScopePop(); return; }
    if (!$('#addmenu').hidden) { $('#addmenu').hidden = true; return; }
    if (CLAW.open && !isModal && !DR.id && !HV.open) { clawToggle(false); return; }
    if (isModal) { if (ARCH.editing) { archiveCancel(); return; } ARCH.viewing = null; closeModal(); return; }
    if (DR.id && HV.open) { closeDrawer(); return; }
    if (HV.open) { closeHistoryViewer(); return; }
    if (UI.nav === 'map' && (MAPW.draft || MAPW.pending)) { mapCancel(); return; }
    if (UI.nav === 'map' && !MAPW.edit && (EXPLORE.picking || EXPLORE.dir)) { closeDirections(); return; }
    if (DR.id) { closeDrawer(); return; }
    if (UI.nav === 'map' && MAPW.sel) { MAPW.sel = null; if (MAPW.edit) renderDock(); else renderPlaceCard(); mapDraw(); return; }
    if (inField && e.target.id === 'q') { e.target.value = ''; UI.q = ''; refreshRegistry(); e.target.blur(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); commit({ now: true }); toast('Saved'); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && onMap && !inField) { e.preventDefault(); if (e.shiftKey) mapRedo(); else mapUndo(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && onMap && !inField) { e.preventDefault(); mapRedo(); return; }
  if (HV.open && !inField) {
    if (e.key === ' ') { e.preventDefault(); hvToggle(); return; } if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); hvPause(); hvSet(HV.to + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 2 : 1)); return; } if (e.key === '[' || e.key === ']') { e.preventDefault(); hvStepChange(e.key === ']' ? 1 : -1); return; } if (e.key === 'v' || e.key === 'V') { hvToggleCompare(); return; } if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); hvPause(); hvSet(e.key === 'Home' ? 0 : HV.i1); return; } if (e.key === 'f' || e.key === 'F') { HV.full = !HV.full; $('#hv-root').classList.toggle('full', HV.full); requestAnimationFrame(() => { hvResize(); hvDraw(); }); return; }
    return;
  }
  if (inField || isModal || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (onMap) {
    if (k === 'Enter' && MAPW.draft) { e.preventDefault(); mapFinishDraft(); return; }
    if (k === 'Backspace' && MAPW.draft) { e.preventDefault(); mapDraftUndo(); return; }
    if ((k === 'Delete' || k === 'Backspace') && MAPW.sel?.vertex != null) { e.preventDefault(); deleteSelectedVertex(); return; }
    const modeKey = { s: 'select', p: 'pan', b: 'border', d: 'road', l: 'transit', x: 'station', a: 'place' }[k.toLowerCase()];
    if (modeKey && !e.shiftKey && MAPW.edit) { setMapMode(modeKey); return; }
    if ((k === 'e' || k === 'E') && !DR.id) { setMapEdit(!MAPW.edit); return; }
  }
  if (k === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  else if (k === '?') openShortcuts();
  else if (k === 'g' || k === 'G') { e.preventDefault(); toggleScopePop(); }
  else if (k === 'N' && e.shiftKey) { e.preventDefault(); newBuildingFlow(null, { historical: true }); }
  else if (k === 'n' || k === 'N') { e.preventDefault(); if (UI.nav === 'businesses') newBusinessFlow(); else newBuildingFlow(null, { historical: UI.nav === 'history' }); }
  else if (k === 'v' || k === 'V') { if (UI.nav === 'registry') { UI.view = UI.view === 'table' ? 'gallery' : 'table'; S.settings.view = UI.view; UI.animateRows = true; refreshRegistry(); UI.animateRows = false; } }
  else if ((k === 'p' || k === 'P') && UI.nav === 'history') openHistoryViewer({ index: 0 });
  else if (k === 'o' || k === 'O') setNav('overview');
  else if (k === 'r' || k === 'R') setNav('registry');
  else if (k === 'm' || k === 'M') setNav('map');
  else if (k === 't' || k === 'T') setNav('transit');
  else if ((k === 'b' || k === 'B') && !onMap) setNav('businesses');
  else if ((k === 'c' || k === 'C') && !onMap) setNav('civic');
  else if (k === 'k' || k === 'K') clawToggle();
  else if (k === 'h' || k === 'H') setNav('history');
  else if (k === 'e' || k === 'E') { if (DR.id && DR.mode === 'view') openRecord(DR.kind, DR.id, 'edit', { keepStack: true }); }
  else if (k === 'Backspace' && DR.id && DR.mode === 'view' && DR.stack.length) { e.preventDefault(); drawerBack(); }
  else if (k === 'ArrowDown' && DR.id) { e.preventDefault(); stepRecord(1); }
  else if (k === 'ArrowUp' && DR.id) { e.preventDefault(); stepRecord(-1); }
  else if (/^[1-7]$/.test(k)) { const n = NAV[+k - 1]; if (n) setNav(n.id); }
  else if (k === '[' || k === ']') { const i = NAV.findIndex(n => n.id === UI.nav); setNav(NAV[(i + (k === ']' ? 1 : NAV.length - 1)) % NAV.length].id); }
});
