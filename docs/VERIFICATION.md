# Verification report · New A OS V3 (birthday update)

Date: 2026-10-05 · branch `claude/new-a-os-system-ht3oxf` · updated after the round-2 fixes

## Verified automatically, on the real data

`app/test.js` boots the built HTML in headless Chromium, loads the real schema-2 store (153 buildings, 34 historical, 13 legacy parcels, 18 chronicle entries, 151 placed) and runs **240 checks**, with the console required to be clean after every section:

| Section | What it proves |
|---|---|
| A | Upgrade 2 → 4: all 153 ids, numbers and field values unchanged; statuses split; counters unchanged; pre-upgrade snapshot; migrations logged `1→2,2→3,3→4` |
| B · B2 | Master export → fresh-profile restore; idempotent re-import; filtered files can never replace the world; legacy two-file import |
| C–L | Geography, roads, transit, businesses, lifecycle, viewer, search, news inbox, simulated disk-full, visual pass |
| M | The six Oct-4 bugs stay fixed (hover dates, link-by-name, markets import, …) |
| N | Explore mode: wordmark, search, place cards, road-graph routing with turn-by-turn, basemaps placed by X/Z, edit toggle, typography |
| O | Playback V3: speeds, change stepping, filters, compare, inferred marking, dated renders, loop |
| P | Civic facilities and coverage, officials with homes, record sections, editor round-trip, valuation maths (factors sum exactly), service timetable (200 blk at 8 blk/s + 10 s dwell = 35 s; measured segments override), sandbox and promotion, service map colour, health navigation, digest → draft, quality fix with snapshot and note, projects, public guide (no owners, private buildings excluded), export round-trip, reload |
| Q | Clawson: answers (officials, homes, hospitals, best served, journeys, health, valuations), a request becomes an Inbox proposal with the record untouched, apply there, undo from Activity, newsletter draft saved locally, refuses to publish, honest "did not understand", provider-on-without-key path, Esc/K |
| R | The real bridge (`os/server.js`) against a synthetic world: online tile, scan → 3 proposals → apply creates a building at middle coordinates X 63 · Z 115 and a road, update sets height + footprint, all undone; render → dated basemap; autosave through the bridge vault (Registry.json, NewA.json and photos), conflict protection when the folder holds a newer registry (paused, then Overwrite), verified backup and restore test from the app; proxy allow-list; offline fallback |
| S | Round-2 fixes: the + Add menu is hit-testable above the page; editor auto-estimate from nearby comparables and transit applied as assessed total; dated road shapes (2013 shape kept through 2019, current from Early 2020) and dated track alignments drawn in playback; Unnamed road, line and building pass validation and are labelled by number; Rotate lot, Centre on footprint and Snap to street (inspector and editor, exact coordinates checked); the beam overlay is gone; the record's Location map carries the Maps wordmark and opens explore mode with the place card; JourneyMap tiles (folder), a stored ZIP and a deflated ZIP with 256-px tiles stitch into basemaps placed from their names; a second dated shape keeps the current one ahead of it; playback pixels prove the dated road; the rotated lot is visible on the map; a real click on + Add starts a record; the dated-shape editor/inspector buttons, Swap in and remove; unnamed road and applied estimate survive a reload; all new fields are in the master file |

`app/smoke.js` opens every page, every Transit and Civic tab, History tabs, the drawer, modals (data, issues, inbox, digest, valuations, official, project), Clawson chat and activity: **0 console errors** on each.

`os/test/run.js` — **61 checks**: NBT round trip; packed indices (spanning and not, 5-bit and 9-bit); four synthetic worlds (1.18+, 1.16, 1.13 spanning, 1.12 numeric) scanned with the tower, house, road and tree classified correctly and the world folder proven byte-for-byte untouched; registry matching (update / new / missing / road confirmed / demolished ignored); PNG render; backups (full → incremental → verify → restore test → tamper detection → monthly full → prune → health); every HTTP route including traversal and allow-list refusals.

## Not verified here — needs your PC or your accounts

| Item | Why | What to do |
|---|---|---|
| Live `feed.xml` refresh | `newa-site.vercel.app` is blocked from this environment (403 at the proxy) | Apply `newa-site-patch/vercel.json`, or run the bridge (it fetches from the PC, no CORS) |
| Markets endpoint | Its real JSON shape is unknown; the importer accepts several shapes | Sync once, check the inbox proposals, tell me the shape if nothing matches |
| Anthropic / OpenAI replies | No key here; only the "switched on but no key" path ran | Add a key under Vault & settings; the reply format is parsed defensively and bad actions are ignored |
| A real Minecraft save | Only synthetic region files were read | Run `node os/server.js --world …`, scan a small area, compare 3–4 known buildings; LZ4 chunks (1.20.5+ opt-in) are skipped and counted |
| Vault linking | The File System Access API needs a click; the bridge vault routes are tested instead | Link the folder once; `vault · <name>` shows in the status bar |
| After-session and monthly schedules | `sendBeacon` on page hide and the daily timer were not exercised; the backup logic they call is tested | Close the app once with the bridge running, then check Vault & settings → Recent |
| Mirror folder | Code path exists; not run against a second disk | Set it in the bridge card; the manifest records `mirrored` |
| Tauri wrapper | Scaffold only, never built | `os/tauri/README.md` |
| Offline fonts | Silkscreen / Bricolage / JetBrains Mono come from Google Fonts; system fallbacks are declared | Open once online; the browser caches them |
| Large scans | 121 chunks take ~15–60 ms; thousands of chunks not measured | Scan in parts if a full-city scan is slow; bounds are capped at 16 M columns |

## Deliberately not built

* Posting to the site, or editing it: there is no publishing endpoint and nothing in New A OS writes to the website. Drafts are copied or downloaded and published by you.
* Writing to the world save: the bridge opens region files read-only and the tests prove the folder is unchanged.
* Inventing data: travel times say *estimated* or *measured*; valuations list every factor; "topped out" is a note, not a completion; the world scanner proposes, never applies.
