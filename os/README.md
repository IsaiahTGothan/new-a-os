# New A OS bridge

A small local server that gives the single-file app the things a browser page cannot do on its own:

| What | Route | Notes |
|---|---|---|
| Status / health | `GET /api/status`, `GET /api/health` | vault, world, backups, disk, alerts |
| Fetch proxy | `POST /api/fetch` | only hosts in `allowHosts` (site, Anthropic, OpenAI by default) |
| Vault files | `GET /api/vault/list`, `GET /api/vault/read?name=`, `POST /api/vault/write` | names are sanitised; writes are atomic |
| World scan | `POST /api/scan`, `GET /api/scan/last`, `GET /renders/<file>` | **read-only** — the save folder is never written |
| Backups | `GET /api/backup/list`, `POST /api/backup/run`, `/verify`, `/restore-test` | SHA-256 manifests, incremental chains, optional mirror |
| Config | `GET/POST /api/config` | retain, monthly full, after-session, mirror, road blocks, allow-list |

No dependencies. Node 18 or newer. Binds to `127.0.0.1` only.

## Run it

```
cd os
node server.js --vault "C:\Users\you\NewA\vault" --world "C:\Users\you\AppData\Roaming\.minecraft\saves\New A"
```

Optional: `--backups <folder>` (default `os/backups`), `--mirror <second disk folder>`, `--port 7331`.
Settings are saved to `os/config.json`; the app's Vault & settings card edits the schedule.

Then open `app/NewA-Land-Registry.html` as usual. The status bar shows **OS bridge · online** and the rail tile shows the last verified backup.

## What a scan does

1. Reads the region files that cover the bounds (default: every placed building and road ± 150 blocks).
2. For every column finds the top block (ignoring leaves, grass, flowers, torches…) and the first natural block under it.
3. Classifies columns: natural · road surface (road material at ground level) · built.
4. Clusters built columns (8-connected) into structures: bounding box, **middle coordinates**, height above ground, estimated floors, dominant material, rectangular footprint when the fill is ≥ 75 %.
5. Finds road bands (runs of road material merged across rows) and their centre lines.
6. Matches against the registry: updates (height, footprint, moved coordinates), new buildings, new roads, confirmations, and buildings recorded where nothing stands.
7. Renders a 1 block/pixel PNG the app can place as a dated basemap.

Everything becomes a proposal in the app's Inbox. Nothing is written to the registry until you click Apply, and every applied proposal can be undone.

Chunk formats: 1.18+ (`sections`/`block_states`), 1.13–1.17 (`Level.Sections` with palettes, spanning for < 1.16), pre-1.13 numeric ids (common blocks mapped). LZ4-compressed chunks (an opt-in server setting since 1.20.5) are counted and skipped.

## Backups

* First run of a month (or `kind: "full"`): every vault file is copied and re-hashed after the copy.
* Other runs: only changed files are copied; unchanged ones point at the run that holds them.
* `verify` re-hashes the whole latest chain; `restore-test` materialises it into a temp folder, checks every hash and parses `Registry.json`.
* `retain` keeps the newest N runs plus any older run they still depend on.
* With `--mirror`, each run is copied to a second folder and verified there too.
* The app sends a backup beacon when it closes or goes to the background (at most every 10 minutes).

## Tests

```
node test/run.js
```

61 checks: NBT round trip, packed-index unpacking (spanning and not), four synthetic worlds (1.18, 1.16, 1.13, 1.12) scanned with the world folder proven byte-for-byte untouched, backups (full → incremental → tamper detection → monthly full → prune), and the HTTP routes.

The synthetic worlds are written by the tests' own writer; they prove the reader's logic and the detection, not compatibility with every Minecraft version. Scan a real save and check a few known buildings before trusting it broadly — see `docs/VERIFICATION.md`.
