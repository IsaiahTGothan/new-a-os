# New A OS — handoff V3

Quick handoff for the next session or developer. Facts carry file:line evidence from HEAD 5e093a5. Date: 2026-10-05.

## 1. TL;DR

- New A OS is a single-file land registry / city app for Isaiah's Minecraft city "New A" (buildings, roads, transit, civic, businesses, history playback, Clawson assistant) plus a local Node bridge that reads the world save and keeps verified backups.
- Deliverable: `app/NewA-Land-Registry.html` (build output, 1,205,889 bytes ≈ 1.2 MB; build.py prints "1174 KB" because it counts characters, committed) built from `app/parts/`; bridge in `os/` (`node os/server.js`). Both are in the repo; site CORS change is a patch in `newa-site-patch/`.
- Branch `claude/new-a-os-system-ht3oxf`, HEAD `5e093a5`, 0 ahead / 0 behind origin (https://github.com/IsaiahTGothan/new-a-os); working tree clean except this untracked file (docs/HANDOFF-V3.md), which still has to be committed (and added to the README's docs/ line). `python3 app/build.py` reproduces the committed bundle byte-for-byte.
- Rules are in docs/NEW-A-HANDOFF-for-Claude-Code.md §6 (verify on the real data, zero console errors, preserve every record/id/number, world save read-only, no keys in source/exports, nothing posts to the site, never present untested work as done, stop before irreversible steps) and §3 "no feature ships without a check": a new feature needs a test.js check (`ok(...)` + `noErrors(tag)`) and a VERIFICATION.md row.
- Tests: `app/test.js` 230/240 checks (sections A–S, last session, not re-run here); `app/smoke.js` 42 views, 0 console errors; `node os/test/run.js` 61/61 (re-run this session).
- Not verified: anything needing the owner's PC or accounts — real Minecraft save, live feed.xml, markets JSON shape, Anthropic/OpenAI keys, vault folder linking, schedules, mirror disk, Tauri build, offline fonts, large scans (docs/VERIFICATION.md:29-38).

## 2. Run it

Prerequisites: Node >= 18 (v22.22.0 here), Python 3, Playwright with Chromium at `/opt/pw-browsers/chromium` (hard-coded in app/test.js:18, app/smoke.js:8, app/shots-resp.js:8). `require('playwright')` resolves here only because NODE_PATH=/usr/local/lib/node_modules_global (a global install); there is no package.json or node_modules in app/ or the repo root. On another machine: `cd app && npm i playwright` (or export NODE_PATH to a global install), `npx playwright install chromium`, then drop `executablePath` in the three harnesses (app/README.md:18-19 omits the install step). os/package.json exists (scripts start/test, engines node >= 18, no dependencies).

```
python3 app/build.py                 # parts -> app/script.js (node --check) -> app/NewA-Land-Registry.html
open app/NewA-Land-Registry.html     # file:// is fine; one IndexedDB origin for all file:// pages
cd os && node server.js --vault <vaultDir> --world <saveDir>   # bridge on 127.0.0.1:7331; also --backups <dir> --mirror <dir> --port <n> --host <h> (parseArgs, os/server.js:13)
node os/test/run.js                  # bridge tests, seconds, no browser
cd app && node smoke.js              # ~1 min, prints "[tag] errors: N" per view, never asserts
cd app && node test.js               # ~3 min, 240 checks, exit 1 on any failure
```

Build must precede test.js/smoke.js (they open the built HTML, app/test.js:4). Section R of test.js requires `../os/server` and `../os/test/synth` from the repo (app/test.js:608).

Commit convention: the built HTML is committed, so every `app/parts/` change is followed by `python3 app/build.py` and the rebuilt HTML goes in the same commit (all 9 commits touch both); a clean `git status` after build is the check that parts and bundle agree. Feature commit subjects end with the harness count, e.g. "(240/240)".

Commit history (oldest → newest, all on this branch):

- 2455083 Baseline: Registry 2.5 source tree, legacy fixtures, handoff
- 4922b96 Fix the six Oct 4 bugs with harness coverage (121/121)
- 134e778 V3 shell and Google-Maps-like explore mode (142/142)
- 9c19701 Playback V3: speeds, change stepping, filters, compare, inferred marking, dated renders (153/153)
- eb57d9c Civic database, officials, service times, valuations, city health, profiles, digest, projects (179/179)
- 9c8ea11 Clawson: city assistant with inbox proposals, undo, newsletter drafts, providers (200/200)
- fc4faaf New A OS bridge: read-only scanner, verified incremental backups, fetch proxy (215/215 app, 61/61 bridge)
- a91df10 Docs, verification report, roadmap, Tauri scaffold, site CORS patch
- 5e093a5 Round 2 fixes (240/240) — touched app only, no docs

## 3. Where things live

| Path | What |
|---|---|
| app/build.py | JS_PARTS order (6-8), CSS concat v2_css+css_25+v3_css (23), body.html (24), script.js + node --check (26-29), writes HTML (30-32) |
| app/parts/body.html | Markup: icon sprite, #boot, #app/#top/#q/#palette, #side/#tabs, #main, #status, #drawer, #clawson, #toasts |
| app/parts/v2_css.css / css_25.css / v3_css.css | 2.0 tokens+shell; 2.5 world-record styles; V3 Silkscreen/Bricolage look |
| p00_config.js | 'use strict', APP {version 3.0.0, schema 4, site, feedUrl, marketsUrl}, FOUNDED_YEAR 2013, enums, NAV (7 tabs) |
| p01_refdata.js | Historical reference data: relation/confidence/source types, tax and building classes, zoning |
| p02_utils.js | $/$$, uid, esc, formatters, half-year helpers (hyIndex/hyFromIndex/hyKey), parseReg, summaryStatus, geometry, fuzzyScore |
| p03_state.js | S, UI, MIGRATION, emptyState, factories, seedState, migrate/migrate2to3/migrate3to4/ensureV3, syncSequences, lookups, serialize*, mergePayload, CSV import |
| p04_persist.js | IndexedDB, SAVE, commit, flush, snapshots, images, VAULT (File System Access), export/import |
| p05_shell.js | renderAll/setNav/setScope/renderView, toast, MODAL, palette search, hovercards |
| p06_charts.js | Hand-drawn SVG charts, skyline |
| p07_engine.js | Relations/chronology, roadJunctions, street linking, transit tracks/stations, service, businesses, hy counting, issues |
| p08_overview.js | Home tab |
| p09_registry.js | Registry table/gallery, columns, filters |
| p10_drawer.js | DR drawer state, openRecord, renderEditor, saveDrawer, reissueReg, pickers |
| p11_records.js | Road/line/station/business records and editors, mini-maps |
| p12_modals.js | Region/district modals, settings (AI key in idb 'handles'/'aiKey', :228), shortcuts, issues, upgrade report |
| p13_map.js | MAPW workspace, projection, snapping, undo/redo, JUNCTION_CACHE (357), drawScene, dock/inspector |
| p14_history.js | History tab, HV playback viewer, demolished table, chronicle, archive |
| p15_transit.js | Transit dashboard |
| p16_business.js | Businesses tab, owner import |
| p17_news.js | NEWS, feed parse/merge, candidates, applyCandidate/undoLog, markets normalisation |
| p18_assistant.js | ASST map assistant |
| p19_interactions.js | One delegated document click handler (data-act/data-nav), change/keyboard handlers |
| p19a_explore.js | EXPLORE read-only map mode, ROAD_GRAPH (137), dijkstra/routeBetween, directions, basemaps |
| p21_civic.js | Civic rows, officials, coverage, civic issues |
| p22_service.js | Timetables, journey times, service scores |
| p23_city.js | VAL valuations, cityHealth, placeProfile, public guide, changeDigest, projects |
| p24_clawson.js | CLAW assistant: clawPropose/clawExecute/apply/cancel, drafts inbox |
| p25_os.js | OS bridge client: OS.get/post, world scan modal |
| p20_boot.js | boot(): LAST in build order despite the number |
| app/script.js | Intermediate build output (gitignored) |
| app/test.js / app/smoke.js | Playwright harnesses (sections A–S at lines 24…643; smoke 57 lines) |
| app/shots-resp.js | Responsive screenshot harness at 1024 and 390 px → shots/resp-*.png (app/README.md:9); same hard-coded Chromium path |
| app/v2-state.json | Fixture: real schema-2 store, 153 buildings, seeded into IndexedDB (test.js:28, smoke.js:23) |
| app/real-NewA.json, app/real-OtherDistricts.json | Legacy two-file import fixture, section B only (test.js:89) |
| app/shots/ | Screenshots (gitignored) |
| os/server.js | Bridge: DEFAULTS/config (10), parseArgs (13), all routes (24-51), monthly full-backup tick, start() (71 lines) |
| os/README.md | Bridge README: route table (7-12), schedules incl. the after-session beacon (49) |
| os/lib/anvil.js | Read-only .mca reader, 1.18+/1.13-1.17/pre-1.13 sections, legacy id table |
| os/lib/world.js | Scanner: surface, 8-connected clusters, road bands, registry match -> proposals, PNG render |
| os/lib/backup.js | SHA-256 manifest backups: run/verify/restoreTest/prune/list/health |
| os/lib/nbt.js, os/lib/png.js | NBT parser (+ test-only writer), RGBA PNG encoder |
| os/test/run.js, os/test/synth.js | 61-check harness; synthetic region writer (4 formats) |
| os/tauri/ | Tauri 2 scaffold, never built (os/tauri/README.md:5); src-tauri/ has Cargo.toml, tauri.conf.json, src/main.rs (server.js located relative to current_exe() as ../../../server.js, main.rs:11-12) |
| docs/ | NEW-A-HANDOFF-for-Claude-Code.md (brief; §3 architecture, §6 rules), VERIFICATION.md, ROADMAP.md, this file (untracked, see §1) |
| newa-site-patch/ | README.md + vercel.json CORS header for /feed.xml and /api/markets; apply to the separate newa-site repo |

## 3b. Round 3 additions (Oct 7)

| Part | What it holds |
|---|---|
| `app/parts/p26_periods.js` | Shape periods for roads and tracks (`shapePeriods`, `shapeStateAt`, `geometryAt`, split / rebuild / set dates / remove), road-growth animation (`animatedGeometry`, `clipPath`), playback events derived from periods, the map's viewing date (`MAPW.when`, `setMapWhen`, `editableShape`, `stampWhen`), the timeline UI (`shapeTimelineHTML`) |
| `app/parts/p27_transit2.js` | Line/station state at a date, service hours, stops in order along tracks (`sortStopsAlong`, `addStopOrdered`), drawing lines with stops (`finishTransitDraft`), smart station placement (`placeStationSmart`), transfers (`transferIds`), inspectors, transit value factors, cost model, departure board, projects tab, trip planner with transfers (`transitJourney`) |
| `app/parts/p28_lots.js` | Lot outlines (`b.lot`), `lotMetrics` (area, frontage from street-facing edges, mean depth, corner lots), drawing a lot from the inspector or the editor |
| `app/parts/p29_oldmaps.js` | Browser NBT reader, Minecraft map colours, `readMapDat`, `stitchMaps`, grouping by date, the Old maps import dialog |
| `os/tools/mcmaps.js` | Same stitching from the command line (read-only) |

Data added (all optional, plain JSON, nothing renamed): road/track `versions[].toYear/toHalf`; line `hours, hoursFrom, hoursTo, yearStarted/halfStarted, yearExpected/halfExpected, costEstimate, costActual`; station the same plus `grade, transferIds`; building `lot, lotSource`; basemap `toYear/toHalf, source:'mcmap', maps, mapIds`; settings `transitCost`, `tlRate`; valuation keys `transit247, transitConstruction, transitPlanned, transitPartial`. Line status gains `partial`.

Playback now keeps a float playhead `HV.pos` (`HV.to = floor(pos)`), a rate in half-years per second (`HV.rate`) and a short effect window `HV.fx = { from, to, t }` set when the playhead crosses a half-year forward; `drawScene` takes `R.pos` and `R.fx` instead of the old `R.anim`.

## 4. How the app is put together

- Classic script, no modules. All parts share one top-level scope; `const/let` names are globals. Key globals: `APP`, `S` (persisted state), `UI` (transient), `MIGRATION`, `SAVE`, `VAULT`, `DR`, `MAPW`, `HV`, `NEWS`, `ASST`, `CLAW`, `EXPLORE`, `OS`, `JUNCTION_CACHE`, `ROAD_GRAPH`.
- State: `emptyState` (p03:17-28) holds regions, districts, neighborhoods, buildings, archive, roads, tracks, lines, stations, businesses, tenancies, officials, projects, sandbox, world{snapshots,scans,proposals,backups}, news{items,decisions,log,drafts}, legacy, settings; `meta` holds seq/hseq/pseq per district, gseq {RD,TL,ST,BZ,TR,GV,PJ}, migrations[].
- Reg numbers: buildings `CODE-0001` per district, historical `H-CODE-0001`, globals `RD/TL/ST/BZ/TR/GV/PJ-0001`; series only count up, `syncSequences` keeps counters >= highest in use (p03:232-239).
- Schema 4. `migrate()` (p03:99-118): inline 1→2, `migrate2to3` (p03:125), `migrate3to4` (p03:121-124: appends a meta.migrations entry and sets `st.schema = 4`, nothing else), then `ensureV3` always (p03:176-229) — the single idempotent normaliser, also run by seedState. Boot stores the untouched pre-upgrade JSON in `MIGRATION.pre` before migrating (p20:9-10) and writes it as a labelled `pre-upgrade · schema N` snapshot after migrate() but before the migrated state is first persisted (p20:20-21).
- Save path: `commit()` sets dirty + 500 ms debounce (p04:36-41) → `flush()` resyncs `b.status = summaryStatus(b)`, writes a deep copy to IndexedDB `newa-registry`/`state`/`main`, `maybeSnapshot` (every >= 10 min, 24 auto kept), then `vaultWrite()` if VAULT granted, else `OS.vaultWrite()` if the bridge is online and reports vaultOk (p04:50, p25:83; vaultOk needs a `--vault` folder that exists). Vault folder holds Registry.json (master), NewA.json (compat), images/. `SAVE.write` is the hook the harness monkeypatches (section K disk-full test, test.js:281).
- Inbox/undo model: news candidates, markets rows, world-scan proposals and Clawson actions all become pending proposals; `applyCandidate` (p17:132-158) logs to `S.news.log`, `undoLog` (p17:159-181) reverses. Nothing from feeds, scans or the assistant is applied without a click. `mergePayload` (p03:460) forces merge for filtered payloads.
- `drawScene(R)` (p13:374) is the single renderer for the map workspace, explore mode (p19a calls mapDraw) and the HV playback viewer (p14); `R.hy` set = historical mode. Change it once, check both.
- Parcels were removed from the UI in 2.5 and archived in `S.legacy.parcels` / `parcelLinks` (p03:25,155; section K "parcel controls gone") — deliberate, not dead data to clean up or a feature to restore. The explore wordmark is deliberately "GOOGLE" in Silkscreen with "NEW A PARODY / NOT GOOGLE LLC" (p19a:10,16) at the owner's request (brief §5.2); section N asserts it.
- Clawson (p24): `clawPropose` creates a pending proposal; `clawExecute/apply/cancel` go through the same inbox and undo; provider key lives only in idb `handles`/`aiKey` (p12:228, p24:152); with provider on and no key nothing is sent.
- OS bridge contract (p25:1-10, os/server.js:24-51): `http://127.0.0.1:7331` (settings.os.url override), JSON, CORS `*`. Routes: GET /api/status (:24), /api/health (:25), GET|POST /api/config (:26), POST /api/fetch (allowHosts only, 45 s timeout, :27-32), GET /api/vault/list, /api/vault/read?name=, POST /api/vault/write (atomic .tmp+rename, :33-35), POST /api/scan {bounds} (:36-44), GET /api/scan/last (:45), GET /renders/<png> (:46), GET /api/backup/list (:47), POST /api/backup/run|verify|restore-test (:48-50), 404 otherwise (:51). World is read-only (os/lib/anvil.js:11 flag 'r'); scanner proposes, never applies.

## 5. Conventions and gotchas for the next change

- Edit `app/parts/`, never the HTML; run `python3 app/build.py`. It overwrites `app/script.js` and fails on `node --check` errors before writing the HTML.
- Add a part: create `pNN_name.js`, add it to `JS_PARTS` in build.py (6-8) before `p20_boot`. Reference only earlier-part names at parse time. Redeclaring a top-level name across parts is a SyntaxError.
- Test anchors: each section of test.js is a `// ---------- X · title ----------` comment; checks use `ok(cond, 'message')` (test.js:10), which counts and prints `✓`/`✗ FAIL`; every section ends with `noErrors(tag)` (test.js:22). Checks are counted at runtime (loops), so grep counts of `ok(` are not the check count.
- Console filter: test.js:20 ignores `/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource|ERR_FAILED|disk full \(simulated\)/`; pageerror is always recorded. smoke.js:10 uses only the first two patterns and never asserts.
- Snapshot before writes: `maybeSnapshot` runs inside flush; boot keeps the pre-upgrade JSON in `MIGRATION.pre` before migrate and writes the labelled `pre-upgrade · schema N` snapshot after migrate, before the first persist (p20:9-21); the "filtered file never replaces the world" rule is tested in section B.
- Record preservation (p03:95-98): never rename, renumber or remove existing fields, ids or regs; add optional fields with empty defaults in `ensureV3`; log every upgrade in `meta.migrations`.
- `summaryStatus` must be resynced wherever physical/market/landmark change (flush does it, but renders and exports between edit and flush read `b.status`).
- Half-year math: halves are only `'E'`, `'L'` or `''`; `hyIndex(y,h) = (y-2013)*2 + (h==='L'?1:0)` returns null for null years — guard before arithmetic (p02:50-55).
- Cache invalidation: `JUNCTION_CACHE` (p13:357) keys on road `id:updated:geometry.length` (p13:358); `ROAD_GRAPH` (p19a:137) keys on `id:updated:geometry.length:yearClosed` (p19a:140), so changing only `yearClosed` refreshes the road graph but not the junction cache. After any road change bump `r.updated` (afterGeometryChange does) or set `.key = ''` (news apply/undo does, p17:142,169).
- Keys: AI key only in IndexedDB `handles`/`aiKey`; never in source, exports or vault files. Bridge allowHosts default newa-site.vercel.app, api.anthropic.com, api.openai.com (os/server.js:10, DEFAULTS.allowHosts).
- Things that bit this session: (a) `const`/`let` names reused in two test.js sections — each section runs in the same async scope, so a clash is a SyntaxError at harness start; use distinct names or wrap in `{ }`. (b) Apostrophes inside single-quoted strings that are themselves inside template literals (e.g. `'Mill Street's'`) — use a template literal or escape.
- Chrome shares one IndexedDB origin for all file:// pages: do not open the 2.0/2.5 HTML against the schema-4 store.
- `os/test/run.js` writes `render-*.png` and `last-scan.json` into `os/.cache` (gitignored, accumulates). `os/config.json` is rewritten on every bridge start and is gitignored.
- `MIGRATION.minor` is set at runtime (p03:116), not in the initial literal (p03:15).
- app/README.md is stale (2.5 parts list, 96 checks); README.md, app/README.md and docs/VERIFICATION.md were refreshed to 240 checks / A–S in the same commit as this file.
- Owner-side paths for open items 1-2 are only in the brief (§1 table, §7): live save `C:\New A - 1.20.1 FORGE TEST 02\saves\The World - Full` (Forge 1.20.1, read-only), old saves under `E:\Documents\Old Mac Minecraft Directory\saves\`, newa-site repo at `C:\Users\Admin\Documents\newa-site`.

## 6. Verified vs not verified

Full tables in docs/VERIFICATION.md (verified 7-23, not verified 25-38, deliberately not built 40-44).

| Area | Status | Evidence |
|---|---|---|
| Schema 2→4 upgrade keeps all 153 ids/numbers | Verified | test.js section A |
| Export/restore, idempotent import, legacy two-file import | Verified | section B |
| Geography, roads, transit, businesses, lifecycle, playback, search, news, saves | Verified | sections C–K |
| Six Oct-4 bugs | Verified | section M |
| V3 explore map, playback V3, civic/service/valuations, Clawson | Verified | sections N–Q |
| App ↔ bridge scan/apply/undo/backup/restore-test | Verified (synthetic world) | section R; os/test/run.js 61/61 |
| Round-2 fixes (add menu, auto-estimate, dated shapes, snap to street, JourneyMap, bridge autosave with conflict protection) | Verified | section S; VERIFICATION.md row S |
| Real Minecraft save, LZ4 chunks | Not verified | VERIFICATION.md:32 |
| Live feed.xml, markets JSON, AI provider replies | Not verified | VERIFICATION.md:29-31 |
| Vault folder linking, schedules, mirror disk, Tauri, offline fonts, large scans | Not verified | VERIFICATION.md:33-38 |
| Site posting, world writes, invented data | Deliberately not built | VERIFICATION.md:40-44 |

## 7. Open items / next steps

1. Scan the real save on the owner's PC and tune `roadBlocks` (docs/ROADMAP.md item 1; os/config.json).
2. Apply `newa-site-patch/vercel.json` to the newa-site repo so the file:// app can fetch feed.xml live.
3. Refresh docs: README.md:17, docs/VERIFICATION.md:7 → 240 checks / A–S, add a row for section S; rewrite app/README.md for V3 parts and the current harness; mention the ERR_FAILED / disk-full console exclusions.
4. Decide whether smoke.js should exit non-zero on console errors (currently informational).
5. Roadmap 2–10 (unstarted): dated renders from old world backups; Clawson with real tool use; transfers in journey times; neighbourhood auto-fill on apply; build the Tauri wrapper (main.rs exe-relative path untested); site publishing with consent; walkability/amenity scores; CSV exports + printable borough report; mobile layout pass.
6. Bridge nits: `mirror-failed` backups return HTTP 500 though the local copy is verified (os/server.js:48 `m.status === 'ok' ? 200 : 500`; status set in os/lib/backup.js:29); the after-session backup beacon (p25:21, `sendBeacon` → the existing POST /api/backup/run, described in os/README.md:49) is wired but never exercised end to end (VERIFICATION.md:34); scans run synchronously in the request handler.

## 8. Commands cheat sheet

```
git log --oneline -9                          # 2455083 baseline … 5e093a5 round-2 fixes
python3 app/build.py                          # rebuild (prints built KB; git status should stay clean)
node os/test/run.js                           # 61 checks, seconds
cd app && node smoke.js                       # per-view console error report, shots/fresh-*.png real-*.png
cd app && node test.js                        # 240 checks, ~3 min, shots/<section>-*.png
cd os && node server.js --vault V --world W   # bridge; flags persist to os/config.json
curl -s 127.0.0.1:7331/api/status             # bridge status; /api/health for alerts
cd os && npm start / npm test                 # same as the two above
```
