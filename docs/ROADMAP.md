# Roadmap after V3

Ordered by value to the city record, with what each needs from you.

1. **Scan the real save** (needs: your PC). Validate detection on 3–4 known buildings, tune `roadBlocks` in `os/config.json` to the materials New A actually paves with, then let the Inbox fill the registry with middle coordinates.
2. **Dated renders from old world backups** (needs: old save copies). Point the bridge at each dated copy, scan the same bounds, add each render as a dated basemap → playback shows the city as it was, with no newer period behind an older one.
3. **Clawson with real tool use** (needs: a key). The provider path currently answers from a compact context and may trigger validated actions; the next step is letting the model call the same deterministic tools (search, coverage, service, digest) in a loop.
4. **Transfers in journey times** — route across two lines through a shared station; show the best line between any two stations.
5. **Neighbourhood auto-fill on apply** — when a world proposal is applied, place it in the neighbourhood from the drawn borders (the quality assistant already offers this as a batch fix).
6. **Desktop wrapper** — build the Tauri scaffold on your PC so the bridge starts with the app.
7. **Site publishing with consent** — if the site ever exposes a publish endpoint, Clawson can post a draft only after an explicit "publish" click with a preview, logged and reversible where the site allows it.
8. **Walkability and amenity scores** — extend the service score with shops, parks and schools reachable on foot.
9. **CSV exports for civic, service and valuations**; a printable borough report.
10. **Mobile layout pass** — the shell has breakpoints; the map and playback still want a phone-first pass.
