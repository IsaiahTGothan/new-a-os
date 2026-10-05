// New A OS desktop wrapper: starts the Node bridge beside the app and opens the window.
// Scaffold — not yet built in this repository's CI. See ../README.md.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::process::{Child, Command};

struct Bridge(Option<Child>);
impl Drop for Bridge { fn drop(&mut self) { if let Some(c) = self.0.as_mut() { let _ = c.kill(); } } }

fn main() {
    // `os/server.js` lives two folders up from src-tauri; config.json holds the vault/world paths.
    let here = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_default();
    let server = here.join("..").join("..").join("..").join("server.js");
    let child = Command::new("node").arg(server).spawn().ok();
    let _bridge = Bridge(child);
    tauri::Builder::default().run(tauri::generate_context!()).expect("error while running New A OS");
}
