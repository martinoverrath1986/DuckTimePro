// Bewusst minimal: die gesamte Anwendungslogik (Kalender, Speicher, Sync) lebt im Web-Code
// unter apps/web und läuft unverändert in Tauris WebView (inkl. sql.js-WASM für die lokale
// SQLite-Datenbank aus Meilenstein M3). Diese Rust-Seite ist nur die native Fensterhülle –
// es gibt aktuell keinen Bedarf für eigene Tauri-Commands/Plugins.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der DuckTime-Pro-App");
}
