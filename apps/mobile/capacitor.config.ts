import type { CapacitorConfig } from '@capacitor/cli';

// Dieselbe App-ID wie beim Tauri-Windows-Paket (apps/desktop/src-tauri/tauri.conf.json)
// verwendet – rein kosmetisch/konsistent, hat keine technische Bedeutung für Android.
const config: CapacitorConfig = {
  appId: 'de.overrath.ducktime',
  appName: 'DuckTime Pro',
  // Relativ zu dieser Datei (apps/mobile/) -> zeigt auf den Vite-Build von apps/web.
  // Muss VOR "npx cap sync android" existieren (siehe README M5: erst "npm run build" in
  // apps/web, dann hier synchronisieren).
  webDir: '../web/dist',
  android: {
    // Für eine spätere Play-Store-Veröffentlichung (M6, optional) hier bei Bedarf
    // buildOptions mit Release-Keystore ergänzen. Für privates Sideloading unnötig.
  }
};

export default config;
