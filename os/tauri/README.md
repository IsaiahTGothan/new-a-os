# Desktop wrapper (Tauri) — scaffold

Goal: one double-click app that starts the bridge and shows `app/NewA-Land-Registry.html` in a native window.

This folder holds a minimal Tauri 2 scaffold. It has **not** been built or run here (no desktop toolchain in the build environment); treat it as the starting point, not a finished installer.

```
os/tauri/
  src-tauri/tauri.conf.json   window + the bundled app + sidecar entry
  src-tauri/Cargo.toml
  src-tauri/src/main.rs       starts `node server.js` beside the app, opens the window
```

Steps on your PC:

1. Install Rust and the Tauri 2 prerequisites (https://v2.tauri.app/start/prerequisites/).
2. `cd os/tauri && cargo install tauri-cli --version "^2"`.
3. `cargo tauri dev` — expects Node on PATH; the bridge starts with the paths from `os/config.json` (run `node ../server.js --vault … --world …` once to create it).
4. `cargo tauri build` for an installer.

Until then: run the bridge in a terminal and open the HTML file — identical features.
