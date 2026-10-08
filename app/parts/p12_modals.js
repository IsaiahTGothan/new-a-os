/* =====================================================================
   §12 MODALS — regions · districts · neighborhoods · vault & data ·
       settings · issues · shortcuts · upgrade report
   ===================================================================== */
const borderSummary = (node, kind) => { const polys = node?.polygons || []; const n = polys.reduce((a, p) => a + p.length, 0); return `<div class="rowlist" style="margin:0"><div class="r"><div><div class="t">${polys.length ? `${polys.length} part${polys.length === 1 ? '' : 's'} · ${n} vertices · ${fmtCompact(polysArea(polys))} blk²` : '<span class="notdrawn">NOT DRAWN YET</span>'}</div><div class="s">${polys.length ? 'Exact X/Z editing, vertex dragging and validation live in the Map workspace inspector.' : 'Borders are drawn on the map: click to add vertices, close the shape to finish. Irregular, diagonal and multi-part shapes are fine.'}</div></div><button type="button" class="btn sm" data-act="border-draw" data-kind="${kind}" data-id="${esc(node?.id || '')}" ${node?.id ? '' : 'disabled title="Save first, then draw"'}>${icon('poly')} ${polys.length ? 'Edit on map' : 'Draw on map'}</button></div></div>`; };
const colorSlots = slot => `<div class="color-slots">${PALETTE.bright.map((c, i) => `<button type="button" data-slot="${i}" aria-pressed="${slot === i}" style="--c:${c};background:${c}" title="slot ${i + 1}"></button>`).join('')}<button type="button" data-slot="" aria-pressed="${slot == null}" style="--c:${PALETTE.neutralBright};background:${PALETTE.neutralBright}" title="neutral"></button></div>`;
function wireSlots(m) { let slot = m.querySelector('.color-slots [aria-pressed="true"]')?.dataset.slot; m.querySelectorAll('.color-slots button').forEach(b => b.onclick = () => { m.querySelectorAll('.color-slots button').forEach(x => x.setAttribute('aria-pressed', x === b)); }); return () => { const v = m.querySelector('.color-slots [aria-pressed="true"]')?.dataset.slot; return v === '' || v == null ? null : +v; }; }
function autoCode(name) { const w = name.trim().split(/\s+/).filter(Boolean); if (!w.length) return ''; const c = w.length === 1 ? w[0].slice(0, 2) : w.map(x => x[0]).join('').slice(0, 3); return c.toUpperCase(); }

/* ---- regions: states, cities, federal districts, regions ---- */
function openRegionModal(id, preset = {}) {
  const r = id ? regionById(id) : { ...newRegion('', 'state', preset.parentId || 'union', ''), ...preset, id: null, slot: nextFreeSlotIn({ districts: [...S.districts, ...S.regions] }) };
  const isNew = !id; MODAL.ctx = { kind: 'region', id: id || null };
  const descendants = new Set(); if (id) { const walk = x => { descendants.add(x); for (const c of childRegions(x)) walk(c.id); }; walk(id); }
  const parents = S.regions.filter(x => !descendants.has(x.id));
  openModal({
    title: isNew ? 'Add a state, city or region' : `Edit ${r.name}`, kicker: isNew ? 'GEOGRAPHY' : (REGION_TYPE[r.type]?.label || 'REGION').toUpperCase(), cls: 'wide',
    body: `<div class="frow" style="margin-top:12px">
      <div class="f span" style="grid-column:span 1"><label for="r-name">Name</label><input id="r-name" value="${esc(r.name)}" placeholder="Penn A"></div>
      <div class="frow c3" style="grid-column:span 1">
        <div class="f"><label for="r-type">Type</label><select id="r-type">${REGION_TYPES.map(t => `<option value="${t.id}" ${t.id === r.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
        <div class="f"><label for="r-code">Code <span class="hint">short</span></label><input id="r-code" value="${esc(r.code || '')}" maxlength="4" style="text-transform:uppercase;font-family:var(--font-mono)"></div>
        <div class="f"><label for="r-founded">Founded</label><input id="r-founded" value="${esc(r.founded || '')}" placeholder="2026"></div>
      </div>
      <div class="f"><label for="r-parent">Part of <span class="hint">a city can sit inside a state; a state inside the Union</span></label><select id="r-parent"><option value="">— top level —</option>${parents.map(p => `<option value="${p.id}" ${p.id === r.parentId ? 'selected' : ''}>${esc(p.name)} (${esc(REGION_TYPE[p.type]?.label || p.type)})</option>`).join('')}</select></div>
      <div class="f"><label>Colour</label>${colorSlots(r.slot)}</div>
      <div class="f span"><label for="r-tagline">Tagline</label><input id="r-tagline" value="${esc(r.tagline || '')}" placeholder="One line about this place"></div>
      <div class="f"><label for="r-placement">Placement</label><select id="r-placement">${Object.entries(PLACEMENTS).map(([k, [l]]) => `<option value="${k}" ${k === (r.placement || 'verified') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="f"><label>Effective from <span class="hint">when it took this place in the hierarchy</span></label><div class="hy"><select id="r-eff-h">${HALVES.map(h => `<option value="${h.id}" ${(r.effectiveHalf || '') === h.id ? 'selected' : ''}>${h.label}</option>`).join('')}</select><input id="r-eff-y" type="number" value="${esc(r.effectiveYear ?? '')}" placeholder="year" min="1990" max="2200"></div></div>
      <div class="f span"><label for="r-typeNote">Hierarchy note <span class="hint">what the sources say — conflicts are kept, not resolved silently</span></label><input id="r-typeNote" value="${esc(r.typeNote || '')}" placeholder="“How New A works” lists it as a district; the Oct 2026 article lists it as a Union member"></div>
      <div class="f"><label for="r-source">Source</label><input id="r-source" value="${esc(r.source || '')}" placeholder="Penn A joins the Union (Oct 2 2026)"></div>
      <div class="f"><label for="r-sourceUrl">Source URL</label><input id="r-sourceUrl" value="${esc(r.sourceUrl || '')}" placeholder="https://…"></div>
      <div class="f span"><label>Border</label>${borderSummary(id ? r : null, 'region')}</div>
      <div class="f span"><label for="r-notes">Notes</label><textarea id="r-notes" style="min-height:56px">${esc(r.notes || '')}</textarea></div>
    </div>
    ${isNew ? `<div class="callout info"><b>No code needed.</b> A new state or region is a record like any other: it gets a place in the hierarchy, a colour and — when you draw it — a border. Boroughs and districts can then be placed under it.</div>` : ''}`,
    foot: `${!isNew ? `<button class="btn danger" data-act="region-delete" data-id="${r.id}">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" id="r-save">${icon('check')} ${isNew ? 'Create' : 'Save'}</button>`,
    onOpen: m => {
      const getSlot = wireSlots(m);
      m.querySelector('#r-name').addEventListener('input', e => { const code = m.querySelector('#r-code'); if (isNew && !code.dataset.touched) code.value = autoCode(e.target.value); });
      m.querySelector('#r-code').addEventListener('input', e => e.target.dataset.touched = '1');
      m.querySelector('#r-save').onclick = () => {
        const name = m.querySelector('#r-name').value.trim(); if (!name) { toast('Give it a name', 'warn'); return; }
        const parentId = m.querySelector('#r-parent').value || null; if (parentId && descendants.has(parentId)) { toast('A region cannot sit inside its own child', 'warn'); return; }
        const patch = { name, type: m.querySelector('#r-type').value, code: m.querySelector('#r-code').value.trim().toUpperCase(), founded: m.querySelector('#r-founded').value.trim(), parentId, slot: getSlot(), tagline: m.querySelector('#r-tagline').value.trim(), placement: m.querySelector('#r-placement').value, typeNote: m.querySelector('#r-typeNote').value.trim(), source: m.querySelector('#r-source').value.trim(), sourceUrl: m.querySelector('#r-sourceUrl').value.trim(), effectiveYear: num(m.querySelector('#r-eff-y').value), effectiveHalf: ['E', 'L'].includes(m.querySelector('#r-eff-h').value) ? m.querySelector('#r-eff-h').value : '', notes: m.querySelector('#r-notes').value, updated: now() };
        if (patch.effectiveYear == null) patch.effectiveHalf = '';
        if (isNew) {
          let nid = slug(name); if (S.regions.some(x => x.id === nid) || S.districts.some(x => x.id === nid)) nid += '-' + Date.now().toString(36).slice(-3);
          const rec = { ...newRegion(name, patch.type, parentId, patch.code), ...patch, id: nid, polygons: [] }; S.regions.push(rec); commit(); closeModal(); setScope({ kind: 'region', id: nid }); toast(`${name} created — draw its border from the Map workspace`, 'good');
        } else { Object.assign(r, patch); commit(); closeModal(); renderAll(); toast('Saved', 'good'); }
      };
    },
  });
}
async function deleteRegion(id) {
  const r = regionById(id); if (!r) return; const kids = childRegions(id).length + regionDistricts(id).length;
  if (kids) { toast(`${r.name} still has ${kids} place${kids === 1 ? '' : 's'} under it — move them first`, 'warn'); return; }
  const c = await confirmDialog({ title: `Delete ${r.name}?`, body: `<p>The region record and its border are removed. Nothing else references it.</p>`, ok: 'Delete', danger: true }); if (c !== 'ok') { openRegionModal(id); return; }
  S.regions = S.regions.filter(x => x.id !== id); if (UI.scope.kind === 'region' && UI.scope.id === id) UI.scope = { kind: 'region', id: r.parentId || 'union' }; normalizeScope(); closeModal(); commit(); renderAll(); toast(`${r.name} deleted`, 'warn');
}
/* ---- districts / boroughs ---- */
function openDistrictModal(id, preset = {}) {
  const d = id ? districtById(id) : { id: null, name: '', code: '', slot: nextFreeSlot(), founded: '', tagline: '', notes: '', type: 'district', parentId: preset.parentId || (UI.scope.kind === 'region' ? UI.scope.id : 'new-a-city'), placement: 'verified', polygons: [] };
  const isNew = !id; MODAL.ctx = { kind: 'district', id: id || null };
  openModal({
    title: isNew ? 'Add a borough or district' : `Edit ${d.name}`, kicker: d.type === 'borough' ? 'BOROUGH' : 'DISTRICT',
    body: `<div class="frow" style="margin-top:12px">
      <div class="f"><label for="d-name">Name</label><input id="d-name" value="${esc(d.name)}" placeholder="North C"></div>
      <div class="frow" style="grid-column:span 1"><div class="f"><label for="d-code">Code <span class="hint">prefixes reg №s</span></label><input id="d-code" value="${esc(d.code)}" placeholder="NC" maxlength="3" style="text-transform:uppercase;font-family:var(--font-mono)" ${!isNew && buildingsIn(d.id).length ? 'disabled title="Codes are fixed once buildings are registered"' : ''}></div><div class="f"><label for="d-type">Type</label><select id="d-type">${DISTRICT_TYPES.map(t => `<option value="${t.id}" ${t.id === d.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div></div>
      <div class="f"><label for="d-parent">Part of</label><select id="d-parent"><option value="">— unplaced —</option>${S.regions.map(r => `<option value="${r.id}" ${r.id === d.parentId ? 'selected' : ''}>${esc(r.name)} (${esc(REGION_TYPE[r.type]?.label || r.type)})</option>`).join('')}</select></div>
      <div class="f"><label for="d-founded">Founded</label><input id="d-founded" value="${esc(d.founded || '')}" placeholder="2014–2016"></div>
      <div class="f span"><label>Colour</label>${colorSlots(d.slot)}</div>
      <div class="f span"><label for="d-tagline">Tagline</label><input id="d-tagline" value="${esc(d.tagline || '')}" placeholder="One line about the district"></div>
      <div class="f"><label for="d-placement">Placement</label><select id="d-placement">${Object.entries(PLACEMENTS).map(([k, [l]]) => `<option value="${k}" ${k === (d.placement || 'verified') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="f"><label>Border</label>${borderSummary(id ? d : null, 'district')}</div>
      <div class="f span"><label for="d-notes">Notes</label><textarea id="d-notes" style="min-height:64px">${esc(d.notes || '')}</textarea></div>
    </div>`,
    foot: `${!isNew ? `<button class="btn danger" data-act="district-delete" data-id="${d.id}">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" id="d-save">${icon('check')} ${isNew ? 'Create' : 'Save'}</button>`,
    onOpen: m => {
      const getSlot = wireSlots(m);
      m.querySelector('#d-name').addEventListener('input', e => { const code = m.querySelector('#d-code'); if (isNew && !code.dataset.touched) code.value = autoCode(e.target.value); });
      m.querySelector('#d-code').addEventListener('input', e => e.target.dataset.touched = '1');
      m.querySelector('#d-save').onclick = () => {
        const name = m.querySelector('#d-name').value.trim(); let code = m.querySelector('#d-code').value.trim().toUpperCase();
        if (!name) { toast('Give the district a name', 'warn'); return; }
        if (!code) code = autoCode(name);
        if (S.districts.some(x => x.code === code && x.id !== d.id)) { toast(`Code ${code} is already used`, 'warn'); return; }
        const patch = { name, code, type: m.querySelector('#d-type').value, parentId: m.querySelector('#d-parent').value || null, slot: getSlot(), founded: m.querySelector('#d-founded').value.trim(), tagline: m.querySelector('#d-tagline').value.trim(), placement: m.querySelector('#d-placement').value, notes: m.querySelector('#d-notes').value };
        if (isNew) {
          let nid = slug(name); if (S.districts.some(x => x.id === nid) || S.regions.some(x => x.id === nid)) nid += '-' + Date.now().toString(36).slice(-3);
          const rec = { ...newDistrict(name, code, patch.parentId, patch.slot), ...patch, id: nid }; S.districts.push(rec); ensureV3(S); commit(); closeModal(); setScope({ kind: 'district', id: nid }); toast(`${name} created — draw its border from the Map workspace`, 'good');
        } else { Object.assign(d, patch); ensureV3(S); commit(); closeModal(); renderAll(); toast('District saved', 'good'); }
      };
    },
  });
}
async function deleteDistrict(id) {
  const d = districtById(id); if (!d) return;
  const n = buildingsIn(id).length; if (n) { toast(`${d.name} still has ${n} building${n === 1 ? '' : 's'} — move or delete them first`, 'warn'); return; }
  const na = S.archive.filter(a => a.districtId === id).length;
  const r = await confirmDialog({ title: `Delete ${d.name}?`, body: `<p>The district and its ${hoodsIn(id).length} neighborhood(s) will be removed.${na ? ` Its ${na} chronicle image${na === 1 ? '' : 's'} are kept and become city-wide.` : ''}</p>`, ok: 'Delete district', danger: true });
  if (r !== 'ok') { openDistrictModal(id); return; }
  for (const a of S.archive) if (a.districtId === id) { a.districtId = null; a.neighborhoodId = null; }
  for (const s of S.stations) if (s.districtId === id) s.districtId = null;
  S.districts = S.districts.filter(x => x.id !== id); S.neighborhoods = S.neighborhoods.filter(h => h.districtId !== id);
  if (UI.scope.kind === 'district' && UI.scope.id === id) UI.scope = { kind: 'region', id: d.parentId || 'new-a-city' }; normalizeScope();
  closeModal(); commit(); renderAll(); toast(`${d.name} deleted`, 'warn');
}
/* ---- neighborhoods ---- */
function openHoodsModal(districtId, editId = null) {
  const d = districtById(districtId); if (!d) return; const hoods = hoodsIn(districtId);
  const h = editId ? hoodById(editId) : null;
  const count = x => buildingsIn(districtId).filter(b => b.neighborhoodId === x.id).length;
  MODAL.ctx = { kind: 'hoods', districtId, editId };
  openModal({
    title: `${d.name} — neighborhoods`, kicker: d.code, cls: 'wide',
    body: `<div class="split" style="margin-top:12px">
        <div>
          <div class="desc-line">Neighborhoods group buildings inside ${esc(d.name)}. Draw each border on the map so buildings can be placed by their coordinates.</div>
          <div class="list">${hoods.length ? hoods.map(x => `<div class="li" style="--c:${distColor(d)}"><i></i><div><div class="t">${esc(x.name)}</div><div class="s">${count(x)} building${count(x) === 1 ? '' : 's'}${x.polygons?.length ? ` · ${fmtCompact(polysArea(x.polygons))} blk² drawn` : ' · not drawn yet'}${x.boundaryText ? ' · ' + esc(truncate(x.boundaryText, 30)) : ''}</div></div><div class="acts"><button class="btn sm ${h?.id === x.id ? 'primary' : ''}" data-act="hood-edit" data-id="${x.id}" data-district="${districtId}">${icon('edit')}</button><button class="btn sm" data-act="border-draw" data-kind="hood" data-id="${x.id}" title="Draw / edit its border on the map">${icon('poly')}</button><button class="btn sm danger" data-act="hood-delete" data-id="${x.id}" data-district="${districtId}">${icon('trash')}</button></div></div>`).join('') : `<div class="li empty">No neighborhoods yet — add the first on the right.</div>`}</div>
        </div>
        <div>
          <h4 style="margin:0 0 10px;font-size:11px;letter-spacing:.14em;color:var(--ink-3)">${h ? 'EDIT ' + esc(h.name.toUpperCase()) : 'NEW NEIGHBORHOOD'}</h4>
          <div class="frow">
            <div class="f span"><label for="h-name">Name</label><input id="h-name" value="${esc(h?.name || '')}" placeholder="Midtown Man A"></div>
            <div class="f span"><label for="h-text">Boundary description <span class="hint">optional</span></label><input id="h-text" value="${esc(h?.boundaryText || '')}" placeholder="From 34th St to 59th St, between 3rd Ave and 8th Ave"></div>
            <div class="f span"><label for="h-notes">Notes</label><textarea id="h-notes" style="min-height:56px">${esc(h?.notes || '')}</textarea></div>
            ${h ? `<div class="f span"><label>Border</label>${borderSummary(h, 'hood')}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">${h ? `<button class="btn ghost" data-act="hood-edit" data-id="" data-district="${districtId}">New instead</button>` : ''}<button class="btn primary" id="h-save">${icon('check')} ${h ? 'Save neighborhood' : 'Add neighborhood'}</button></div>
        </div>
      </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>`,
    onOpen: m => {
      m.querySelector('#h-save').onclick = () => {
        const name = m.querySelector('#h-name').value.trim(); if (!name) { toast('Name the neighborhood', 'warn'); return; }
        const patch = { name, boundaryText: m.querySelector('#h-text').value.trim(), notes: m.querySelector('#h-notes').value };
        if (h) Object.assign(h, patch); else S.neighborhoods.push({ ...newHood(districtId, name), ...patch });
        commit(); openHoodsModal(districtId, null); renderView(false); toast(h ? 'Neighborhood saved' : `${name} added — draw its border on the map`, 'good');
      };
    },
  });
}
async function deleteHood(id, districtId) {
  const h = hoodById(id); if (!h) return; const n = S.buildings.filter(b => b.neighborhoodId === id).length;
  const r = await confirmDialog({ title: `Delete ${h.name}?`, body: `<p>${n ? `${n} building${n === 1 ? '' : 's'} will become unassigned.` : 'It has no buildings.'}</p>`, ok: 'Delete', danger: true });
  if (r !== 'ok') { openHoodsModal(districtId); return; }
  S.neighborhoods = S.neighborhoods.filter(x => x.id !== id); for (const b of S.buildings) if (b.neighborhoodId === id) b.neighborhoodId = null; for (const a of S.archive) if (a.neighborhoodId === id) a.neighborhoodId = null;
  if (UI.filters.hood === id) UI.filters.hood = ''; if (UI.hf.hood === id) UI.hf.hood = ''; if (UI.scope.kind === 'hood' && UI.scope.id === id) UI.scope = { kind: 'district', id: districtId };
  commit(); openHoodsModal(districtId); renderView(false);
}
function editScope() { const sc = UI.scope; if (sc.kind === 'region') openRegionModal(sc.id); else if (sc.kind === 'district') openDistrictModal(sc.id); else if (sc.kind === 'hood') { const h = hoodById(sc.id); if (h) openHoodsModal(h.districtId, h.id); } }

/* ---- vault, data & settings ---- */
let AI_KEY_PRESENT = false;
async function openDataModal() {
  const snaps = await listSnapshots(); const vs = VAULT.status;
  try { AI_KEY_PRESENT = !!(await idbGet('handles', 'aiKey')); } catch { AI_KEY_PRESENT = false; }
  openModal({
    title: 'Vault, files & settings', kicker: 'DATA', cls: 'wide',
    body: `
      <div class="datagrid">
        <div class="dcard">
          <h4>VAULT — A FOLDER ON THIS COMPUTER</h4>
          <div class="vstat ${vs === 'granted' ? 'ok' : vs === 'prompt' ? 'warn' : ''}"><i></i>${vs === 'granted' ? `linked · ${esc(VAULT.name)}` : vs === 'prompt' ? `needs a click to reconnect · ${esc(VAULT.name)}` : vs === 'unsupported' ? 'not available in this browser' : 'not linked'}</div>
          <p>Every change is written atomically to <span class="path">Registry.json</span> — the one complete master file: every state, borough, building, road, line, business, the chronicle and the news log — plus <span class="path">images/</span>. ${S.settings.compatFile !== false ? `A <span class="path">NewA.json</span> in the 2.0 shape is also written for the public site.` : 'The 2.0-style <span class="path">NewA.json</span> is switched off.'} Older files are kept untouched in <span class="path">backups/</span> before the first 2.5 write.</p>
          <div class="acts">${vs === 'granted' ? `<button class="btn" data-act="vault-open-other">${icon('folder')} Use a different folder</button><button class="btn" data-act="vault-write-now">${icon('check')} Write now</button><button class="btn ghost" data-act="vault-unlink">Unlink</button>` : vs === 'prompt' ? `<button class="btn primary" data-act="vault-reconnect">${icon('folder')} Reconnect ${esc(VAULT.name)}</button><button class="btn ghost" data-act="vault-unlink">Forget</button>` : vs === 'unsupported' ? `<span class="muted" style="font-size:12px">Chrome, Edge or Brave can link a folder. Here, use the backup file below.</span>` : `<button class="btn primary" data-act="vault-link">${icon('folder')} Link a folder</button>`}</div>
          <div class="settings-row" style="border:0;padding-bottom:0"><div><div>Also write NewA.json (2.0 shape)</div><div class="d">Compatibility copy of New A City for readers of the old file</div></div><label class="switch"><input type="checkbox" data-set="compatFile" ${S.settings.compatFile !== false ? 'checked' : ''}></label></div>
        </div>
        <div class="dcard">
          <h4>FILES</h4>
          <p>The <b>master file</b> is the complete, lossless record. Everything else is a labelled extract: a scope, current or historical buildings, or CSV tables. Extracts import back without ever replacing the whole world.</p>
          <div class="acts"><button class="btn primary" data-act="export-master">${icon('down')} Master file</button><button class="btn" data-act="export-scope">${icon('down')} ${esc(truncate(scopeName(), 18))}</button><button class="btn" data-act="export-current">${icon('down')} Current buildings</button><button class="btn" data-act="export-historical">${icon('down')} Historical buildings</button><button class="btn" data-act="export-compat">${icon('down')} NewA.json (2.0 shape)</button><button class="btn" data-act="export-backup">${icon('down')} Full backup + photos</button><button class="btn" data-act="import">${icon('up')} Import…</button>${MIGRATION.pre ? `<button class="btn" data-act="download-pre" title="The store exactly as it was before this upgrade">${icon('down')} Pre-upgrade copy</button>` : ''}</div>
          <div class="desc-line" style="margin-top:10px">CSV extracts: <button class="rowlink" data-act="export-csv" style="font:inherit">buildings in scope</button> · <button class="rowlink" data-act="export-roads-csv" style="font:inherit">roads</button> · <button class="rowlink" data-act="export-transit-csv" style="font:inherit">transit</button> · <button class="rowlink" data-act="export-biz-csv" style="font:inherit">businesses</button> · <button class="rowlink" data-act="export-timeline-csv" style="font:inherit">year by year</button></div>
        </div>
        <div class="dcard">
          <h4>SNAPSHOTS</h4>
          <p>Automatic restore points kept in this browser (at most one every 10 minutes, last 24). Labelled ones — before imports and upgrades — are never pruned.</p>
          <div class="list snaps">${snaps.length ? snaps.map(s => `<div class="li" style="grid-template-columns:1fr auto"><div><div class="t">${fmtDate(new Date(s.ts).toISOString())}${s.label ? ` <span class="tag seed" style="margin-left:6px">${esc(s.label)}</span>` : ''}</div><div class="s">${s.buildings} buildings · schema ${s.schema}</div></div><div class="acts"><button class="btn sm" data-act="restore-snap" data-key="${s.key}">Restore</button></div></div>`).join('') : `<div class="li empty">No snapshots yet — they appear as you work.</div>`}</div>
        </div>
        <div class="dcard">
          <h4>BASEMAP — THE RENDERED CITY UNDER THE MAP</h4>
          <p>${(S.settings.basemaps || []).length ? `${S.settings.basemaps.length} image${S.settings.basemaps.length === 1 ? '' : 's'} on file: ${S.settings.basemaps.map(b => esc(b.name)).join(', ')}.` : 'No basemap yet.'} A JourneyMap export, the Chronicle's render or a screenshot of the in-game map, placed by its top-left X/Z and blocks-per-pixel. Toggle it with the Satellite chip on the map.</p>
          <div class="acts"><button class="btn primary" data-act="basemap-open">${icon('sat')} Manage basemaps</button></div>
        </div>
        <div class="dcard">
          <h4>DISPLAY</h4>
          <div class="settings-row"><div><div>Scanlines</div><div class="d">CRT overlay across the interface</div></div><label class="switch"><input type="checkbox" data-set="scanlines" ${S.settings.scanlines ? 'checked' : ''}></label></div>
          <div class="settings-row"><div><div>Motion</div><div class="d">Transitions, count-ups, smooth playback</div></div><label class="switch"><input type="checkbox" data-set="motion" ${S.settings.motion ? 'checked' : ''}></label></div>
          <div class="settings-row"><div><div>Boot sequence</div><div class="d">Play the start-up readout on launch</div></div><label class="switch"><input type="checkbox" data-set="boot" ${S.settings.boot ? 'checked' : ''}></label></div>
          <div class="settings-row"><div><div>Compact rows</div><div class="d">Denser registry table</div></div><label class="switch"><input type="checkbox" data-set="compact" ${S.settings.density === 'compact' ? 'checked' : ''}></label></div>
          <div class="settings-row" style="border:0"><div><div>Original fabric cut-off</div><div class="d">“Original fabric” = buildings completed by this year</div></div><label class="field" style="height:30px"><select data-set="fabricYear">${FABRIC_YEARS.map(y => `<option value="${y}" ${(S.settings.fabricYear || 2016) === y ? 'selected' : ''}>≤ ${y}</option>`).join('')}</select></label></div>
        </div>
        ${osCardHTML()}
        <div class="dcard" style="grid-column:span 2">
          <h4>VALUATION FACTORS &amp; PUBLISHING</h4>
          <p>Every estimated value is the assessed total (or a per-block comparable) adjusted by these percentages. Change them here and every record explains itself with the new figures; recorded valuation history keeps the version it was made with.</p>
          <div class="valgrid">${[['transitNear', 'Station ≤ 60 blk'], ['transitMid', 'Station ≤ 150 blk'], ['transitFar', 'Station ≤ 300 blk'], ['transitNone', 'No station'], ['transit247', '24/7 service bonus'], ['transitConstruction', 'Under construction · share of open (0–1)'], ['transitPlanned', 'Planned · share (0–1)'], ['transitPartial', 'Part-time · share (0–1)'], ['hospital', 'Hospital in reach'], ['police', 'Police in reach'], ['fire', 'Fire in reach'], ['park', 'Park ≤ 100 blk'], ['school', 'School ≤ 120 blk'], ['servicesCap', 'Services cap'], ['landmark', 'Landmark'], ['floorStep', 'Per floor'], ['floorCap', 'Floors cap'], ['excellent', 'Excellent condition'], ['fair', 'Fair condition'], ['poor', 'Poor condition'], ['construction', 'Under way'], ['closed', 'Closed'], ['vacantLot', 'Vacant lot'], ['officeCondo', 'Office / condo'], ['industrial', 'Industrial']].map(([k, l]) => `<label><span>${l}</span><span class="pre"><input type="number" step="1" data-val="${k}" value="${esc((S.settings.valuation || {})[k] ?? VALUATION_DEFAULTS[k])}"><b>%</b></span></label>`).join('')}<label><span>Fallback $ per blk²</span><span class="pre"><b>$</b><input type="number" step="1000" data-val="fallbackPerBlock" value="${esc((S.settings.valuation || {}).fallbackPerBlock ?? VALUATION_DEFAULTS.fallbackPerBlock)}"></span></label><label><span>Default lot blk²</span><span class="pre"><input type="number" step="10" data-val="defaultArea" value="${esc((S.settings.valuation || {}).defaultArea ?? VALUATION_DEFAULTS.defaultArea)}"></span></label></div>
          <div class="settings-row" style="margin-top:10px"><div><div>Public guide includes notes</div><div class="d">Owners, assessments and sources are never exported to the guide; notes only if you allow it</div></div><label class="switch"><input type="checkbox" data-pub="publicNotes" ${S.settings.publishing?.publicNotes ? 'checked' : ''}></label></div>
        </div>
        <div class="dcard" style="grid-column:span 2">
          <h4>CLAWSON — OPTIONAL AI PROVIDER</h4>
          <p>Clawson answers from the records without this. Turning it on lets it send your question (and a compact summary of matching records) to Anthropic or an OpenAI-compatible endpoint; the reply can only trigger the same validated actions and Inbox proposals you can click yourself — nothing is applied by the model. The key is kept in this browser's storage only — it is <b>never</b> written to Registry.json, backups or exports.</p>
          <div class="f" style="margin:0 0 10px"><label>Markets endpoint <span class="hint">the site's markets JSON (companies, tickers, simulated prices) — read only</span></label><input id="markets-url" value="${esc(S.settings.marketsUrl || APP.marketsUrl)}" placeholder="${esc(APP.marketsUrl)}"></div>
          <div class="settings-row"><div><div>Use an AI provider</div><div class="d">${AI_KEY_PRESENT ? 'A key is stored in this browser.' : 'No key stored.'}</div></div><label class="switch"><input type="checkbox" data-set="aiEnabled" ${S.settings.ai?.enabled ? 'checked' : ''}></label></div>
          <div class="frow c3" style="margin-top:8px">
            <div class="f"><label>Provider</label><select id="ai-provider"><option value="anthropic" ${(S.settings.ai?.provider || 'anthropic') === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option><option value="openai" ${S.settings.ai?.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible</option></select></div>
            <div class="f"><label>Endpoint</label><input id="ai-endpoint" value="${esc(S.settings.ai?.endpoint || '')}" placeholder="https://api.openai.com/v1/chat/completions"></div>
            <div class="f"><label>Model</label><input id="ai-model" value="${esc(S.settings.ai?.model || '')}" placeholder="${(S.settings.ai?.provider || 'anthropic') === 'anthropic' ? 'claude-sonnet-5-5' : 'gpt-4o-mini'}"></div>
            <div class="f"><label>API key <span class="hint">stored locally only</span></label><div class="inline"><input id="ai-key" type="password" placeholder="${AI_KEY_PRESENT ? '•••••••• (stored)' : 'paste a key'}" autocomplete="off"><button class="btn sm" id="ai-key-save">Save</button>${AI_KEY_PRESENT ? `<button class="btn sm ghost" id="ai-key-forget">Forget</button>` : ''}</div></div>
          </div>
        </div>
      </div>
      <div class="callout info" style="margin-top:14px"><b>Where your data lives.</b> Always in this browser's storage for this file, plus the vault folder when linked. Clearing site data for local files would wipe the browser copy — the vault folder or a backup file is what makes it permanent.</div>
      <div class="desc-line" style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">${esc(APP.name)} v${APP.version} · schema ${S.schema} · ${S.buildings.length} buildings (${histBuildings().length} historical) · ${S.regions.length} regions · ${S.districts.length} districts · ${S.roads.length} roads · ${S.lines.length} lines · ${S.businesses.length} businesses · ${S.archive.length} chronicle · ${S.legacy.parcels.length} archived parcels · updated ${fmtDate(S.meta.updated)}${(S.meta.migrations || []).length ? ` · upgraded ${S.meta.migrations.map(m => `${m.from}→${m.to}`).join(', ')} <button class="btn ghost sm" data-act="upgrade-report">${icon('flag')} Upgrade report</button>` : ''}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>`,
    onOpen: m => {
      m.querySelectorAll('[data-set]').forEach(cb => cb.addEventListener('change', () => {
        const k = cb.dataset.set;
        if (k === 'compact') S.settings.density = cb.checked ? 'compact' : 'comfortable'; else if (k === 'fabricYear') S.settings.fabricYear = +cb.value; else if (k === 'aiEnabled') S.settings.ai.enabled = cb.checked; else S.settings[k] = cb.checked;
        applySettings(); commit({ silentRender: true }); if (k === 'fabricYear') renderView(false); if (k === 'compatFile') toast(cb.checked ? 'NewA.json will be written alongside Registry.json' : 'Only Registry.json will be written from now on', '');
      }));
      m.querySelectorAll('[data-os]').forEach(el => el.addEventListener('change', async () => { const k = el.dataset.os; S.world.backups.schedule ??= {}; if (k === 'url') { S.settings.os = { ...(S.settings.os || {}), url: el.value.trim() || OS.url }; commit({ silentRender: true }); await OS.poll(); openDataModal(); return; } if (k === 'retain') S.world.backups.schedule.retain = num(el.value) || 30; else if (k === 'mirror') S.world.backups.schedule.mirror = el.value.trim(); else S.world.backups.schedule[k] = el.checked; commit({ silentRender: true }); OS.configPush(); }));
      m.querySelector('#markets-url')?.addEventListener('change', e => { S.settings.marketsUrl = e.target.value.trim(); commit({ silentRender: true }); });
      m.querySelector('#ai-provider').addEventListener('change', e => { const prov = e.target.value; const defs = prov === 'anthropic' ? ['https://api.anthropic.com/v1/messages', 'claude-sonnet-5-5'] : ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini']; const other = prov === 'anthropic' ? ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'] : ['https://api.anthropic.com/v1/messages', 'claude-sonnet-5-5']; S.settings.ai.provider = prov; if (!S.settings.ai.endpoint || S.settings.ai.endpoint === other[0]) S.settings.ai.endpoint = defs[0]; if (!S.settings.ai.model || S.settings.ai.model === other[1] || S.settings.ai.model === 'claude-sonnet-4-5') S.settings.ai.model = defs[1]; commit({ silentRender: true }); openDataModal(); });
      m.querySelector('#ai-endpoint').addEventListener('change', e => { S.settings.ai.endpoint = e.target.value.trim(); commit({ silentRender: true }); });
      m.querySelector('#ai-model').addEventListener('change', e => { S.settings.ai.model = e.target.value.trim(); commit({ silentRender: true }); });
      m.querySelector('#ai-key-save').onclick = async () => { const v = m.querySelector('#ai-key').value.trim(); if (!v) { toast('Paste a key first', 'warn'); return; } await idbPut('handles', 'aiKey', v); m.querySelector('#ai-key').value = ''; AI_KEY_PRESENT = true; toast('Key stored in this browser only — never exported', 'good'); };
      m.querySelector('#ai-key-forget')?.addEventListener('click', async () => { await idbDel('handles', 'aiKey'); AI_KEY_PRESENT = false; toast('Key forgotten', 'warn'); openDataModal(); });
    },
  });
}
function applySettings() {
  const h = document.documentElement;
  h.dataset.scanlines = S.settings.scanlines ? 'on' : 'off';
  h.dataset.motion = S.settings.motion ? 'on' : 'off';
  h.dataset.density = S.settings.density || 'comfortable';
}
function openShortcuts() {
  const rows = [['N', 'Add a building'], ['Shift + N', 'Add a demolished (historical) building'], ['/', 'Search everything — buildings, numbers, streets, businesses, stations, places'], ['G', 'Choose the place the registry looks at'], ['O · M · R · T · C · B · H · S', 'Home · Map · Registry · Transit · Civic · Business · History · Site link'], ['K', 'Open / close Clawson'], ['E', 'Map: switch between Explore and Edit'], ['V', 'Toggle table / gallery'], ['P', 'Open playback (History)'], ['Esc', 'Close Clawson / panel / cancel drawing / clear search'], ['1 – 8', 'Jump to a section'], ['[ / ]', 'Previous / next section'], ['↑ / ↓', 'Previous / next record (while open)'], ['E', 'Edit the open record'], ['Backspace', 'Back to the previous record'], ['⌘/Ctrl + S', 'Save now'], ['⌘/Ctrl + Z / ⇧Z', 'Map: undo / redo'], ['Map · S P B D L X A', 'Select · Pan · Border · Draw road · Line · Station · Place building'], ['Map · Enter / Esc', 'Finish / cancel the shape being drawn'], ['Map · Backspace', 'Remove the last vertex while drawing'], ['Map · Shift', 'Hold to snap to 45° angles'], ['Map · Delete', 'Delete the selected vertex'], ['Playback · Space', 'Play / pause'], ['Playback · ← / →', 'Previous / next half-year'], ['Playback · F', 'Full screen'], ['?', 'This list']];
  openModal({ title: 'Keyboard shortcuts', kicker: 'KEYS', cls: 'wide', body: `<div class="kbd-grid">${rows.map(([k, v]) => `<div class="kbd-row"><span>${esc(v)}</span><kbd class="k">${esc(k)}</kbd></div>`).join('')}</div>`, foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>` });
}
/* ---- issues panel ---- */
function openIssuesModal() {
  const issues = allIssues(); const groups = [['bad', 'PROBLEMS', 'contradictions that need a decision'], ['warn', 'WARNINGS', 'worth a look'], ['info', 'NOTES', 'gaps and reminders']];
  const link = i => i.kind === 'building' ? `data-open="${i.id}"` : i.kind === 'road' || i.kind === 'line' || i.kind === 'station' ? `data-open="${i.kind}:${i.id}"` : i.kind === 'region' ? `data-act="edit-region" data-id="${i.id}"` : i.kind === 'district' ? `data-act="edit-district" data-id="${i.id}"` : '';
  openModal({ title: `Data quality · ${scopeName()}`, kicker: `${issues.length} ISSUE${issues.length === 1 ? '' : 'S'}`, cls: 'wide',
    body: issues.length ? `<div class="issue-groups">${groups.map(([lv, title, sub]) => { const list = issues.filter(i => i.level === lv); if (!list.length) return ''; return `<div><h4><span>${title} · ${list.length}</span><span style="font-weight:400;letter-spacing:0;text-transform:none">${sub}</span></h4>${list.map(i => `<div class="issue ${lv}">${icon(lv === 'info' ? 'flag' : 'warn')}<span><span class="where" ${link(i)} role="button">${esc(i.reg || i.kind)}</span><b>${esc(i.title || '')}</b> — ${esc(i.text)}</span></div>`).join('')}</div>`; }).join('')}</div><div class="callout info" style="margin-top:14px"><b>Nothing is fixed automatically.</b> Each line links to the record so you can decide — swap a mis-filed value, add a date, redraw a border or leave documented uncertainty as it is.</div>` : `<div class="chart-empty" style="padding:30px">Nothing flagged in ${esc(scopeName())}.</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="modal-close">Done</button>` });
}
/* ---- upgrade report: shown once after a 2.0 (or 1.0) store is upgraded to 2.5 ---- */
function openUpgradeReport(report = MIGRATION.report || (S.meta.migrations || [])[S.meta.migrations.length - 1]) {
  if (!report) { toast('No upgrade has run on this store', ''); return; }
  const r = report; const split = r.statusSplit || {}; const splitTxt = Object.entries(split).map(([k, v]) => `${v} ${k}`).join(' · ');
  openModal({
    title: 'Registry upgraded to 2.5', kicker: `SCHEMA ${r.from ?? 2} → 3`, cls: 'wide',
    body: `
      <div class="upbanner"><div class="big">V2.5<small>WORLD RECORD SYSTEM</small></div><p>One master file now holds every jurisdiction and every era: states and cities above the boroughs, polygon borders, roads, transit, businesses, a half-year lifecycle for every building, and the chronicle. <b>Nothing that existed was renamed, renumbered or removed.</b></p></div>
      <div class="uplist">
        <div><span class="ok">✓</span><span><b>${r.buildings ?? S.buildings.length} buildings preserved</b> — every internal id, registration number (${coreDistricts().map(d => d.code + '-####').join(', ')}, H-XX-####), photo and relationship is exactly as it was.</span></div>
        <div><span class="new">+</span><span><b>Geography.</b> ${(r.regionsAdded || []).length ? `${r.regionsAdded.length} jurisdictions added above the boroughs (${r.regionsAdded.slice(0, 7).map(esc).join(', ')}${r.regionsAdded.length > 7 ? '…' : ''}).` : 'The hierarchy was already in place.'} ${(r.districtsPlaced || []).length ? `Placed: ${r.districtsPlaced.map(esc).join('; ')}.` : ''}${(r.districtsUnplaced || []).length ? ` <span style="color:var(--warn)">Unplaced: ${r.districtsUnplaced.map(esc).join(', ')}</span> — choose a parent from the scope selector.` : ''} New J, North C, South C, V Beach, Chicago and Washington D.C. are on file with the sources that mention them; where “How New A works” and the Oct 2026 Penn A article disagree the record says so instead of picking a side. Borders not yet drawn read <span class="notdrawn">NOT DRAWN YET</span>.</span></div>
        <div><span class="new">+</span><span><b>Borders.</b> ${r.polygons || 0} rectangle${r.polygons === 1 ? '' : 's'} converted to four-vertex polygons. Draw exact shapes — irregular, diagonal, multi-part — in the Map workspace.</span></div>
        <div><span class="new">+</span><span><b>Lifecycle.</b> The single status split into <code>physical</code> · <code>market</code> · <code>landmark</code>${splitTxt ? ` (${esc(splitTxt)})` : ''}; the old value is kept as <code>legacyStatus</code> and <code>status</code> stays in sync for the public site. Dates gained an Early/Late half; year-only values stayed year-only.${(r.futureCompletions || []).length ? ` <b>${r.futureCompletions.length}</b> unfinished project${r.futureCompletions.length === 1 ? '' : 's'} had a completion year in the future — moved to “expected completion” and noted on the record: ${r.futureCompletions.map(esc).join('; ')}.` : ''}</span></div>
        <div><span class="${r.parcels ? 'hi' : 'ok'}">${r.parcels ? '◆' : '✓'}</span><span><b>Parcels retired.</b> ${r.parcels || 0} parcel record${r.parcels === 1 ? '' : 's'} moved to a recoverable archive inside the master file (<code>legacy.parcels</code>); ${r.parcelLinksAdded || 0} same-site link${r.parcelLinksAdded === 1 ? '' : 's'} carried onto the buildings that shared a parcel; parcel notes copied into site-history notes. Predecessor / successor relationships are untouched.</span></div>
        <div><span class="new">+</span><span><b>New layers</b> — <code>roads</code>, <code>tracks</code> & <code>lines</code>, <code>stations</code>, <code>businesses</code> & <code>tenancies</code>, <code>news</code> — all empty until you draw or record them. Number series: RD-, TL-, ST-, BZ-, TR-####.</span></div>
        <div><span class="ok">✓</span><span><b>Files.</b> The vault now writes <code>Registry.json</code> (everything) and, while the setting is on, a 2.0-shaped <code>NewA.json</code> for the site. Untouched copies of the older files are kept in <code>backups/</code> before the first write; a labelled pre-upgrade snapshot is in this browser${MIGRATION.pre ? ' and downloadable below' : ''}.</span></div>
      </div>
      <div class="callout info" style="margin-top:14px"><b>Where to start.</b> Pick a place with the selector at the top (G), draw its border in <b>Map</b> (M), then draw the first road and let buildings suggest their serving street. <b>History</b> (H) → Playback shows the city half-year by half-year.</div>`,
    foot: `${MIGRATION.pre ? `<button class="btn" data-act="download-pre">${icon('down')} Download pre-upgrade backup</button>` : ''}<span class="spacer"></span><button class="btn primary" data-act="modal-close">${icon('check')} Continue</button>`,
  });
}
