# app/ — the single-file New A OS

`build.py` concatenates `parts/p00…p29` (p20_boot last) and the three CSS files into `NewA-Land-Registry.html`, running `node --check` on the bundle first. Edit the parts, never the HTML.

```
python3 build.py        # rebuild
node test.js            # 264 checks in headless Chromium on the real schema-2 data (sections A–T), ~4 min
node smoke.js           # every page, tab and modal; prints "[view] errors: N", 0 expected everywhere
node shots-resp.js      # responsive screenshots at 1024 and 390 px
```

Playwright's Chromium is expected at `/opt/pw-browsers/chromium` (edit `executablePath` at the top of each harness otherwise). Fixtures: `v2-state.json` (the real schema-2 store, 153 buildings), `real-NewA.json` + `real-OtherDistricts.json` (the legacy two-file import). Screenshots land in `shots/` (gitignored).

See `../README.md` for what the app does and `../docs/HANDOFF-V3.md` for how it is put together.
